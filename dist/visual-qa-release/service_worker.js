var DRAFT_PREFIX = "vqa:draft:";
var DRAFT_DB_NAME = "pixel-audit-records";
var DRAFT_DB_VERSION = 1;
var DRAFT_META_STORE = "drafts";
var DRAFT_RECORD_STORE = "records";
var DRAFT_IMAGE_STORE = "images";
var DRAFT_SHOT_IMAGE_KINDS = ["thumb", "export", "source"];
var DRAFT_NOTE_IMAGE_KINDS = ["note-0", "note-1", "note-2"];
var DRAFT_REVIEW_IMAGE_KINDS = ["review-0", "review-1", "review-2"];
var DRAFT_IMAGE_KINDS = DRAFT_SHOT_IMAGE_KINDS.concat(DRAFT_NOTE_IMAGE_KINDS, DRAFT_REVIEW_IMAGE_KINDS);
var draftDbPromise = null;
var draftWriteQueues = {};
var BRIDGE_SOURCE = "visual-qa-bridge-v12-step2";
var ACTION_ICON_PATHS = {
  off: {
    16: "icons/action-off-16.png",
    32: "icons/action-off-32.png"
  },
  on: {
    16: "icons/action-off-16.png",
    32: "icons/action-off-32.png"
  }
};
var ACTION_TITLES = {
  off: "PixelAudit 视觉走查助手（未开启）",
  on: "PixelAudit 视觉走查助手（已开启）"
};
var tabPluginState = {};

function isInjectableUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!/^(https?:\/\/|file:\/\/)/i.test(url)) return false;
  // Browser-internal and web store pages are not script-injectable.
  if (/^https?:\/\/chromewebstore\.google\.com\//i.test(url)) return false;
  if (/^https?:\/\/microsoftedge\.microsoft\.com\/addons\//i.test(url)) return false;
  return true;
}

function normalizePageKey(pageKey) {
  return typeof pageKey === "string" ? pageKey.trim() : "";
}

function getDraftStorageKey(pageKey) {
  return DRAFT_PREFIX + pageKey;
}

function getDraftRecordStorageKey(pageKey, recordId) {
  return JSON.stringify([pageKey, recordId]);
}

function getDraftImageStorageKey(pageKey, recordId, kind) {
  return JSON.stringify([pageKey, recordId, kind]);
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function idbRequest(request) {
  return new Promise(function (resolve, reject) {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("IndexedDB request failed"));
    };
  });
}

function idbTransactionDone(transaction) {
  return new Promise(function (resolve, reject) {
    transaction.oncomplete = function () {
      resolve();
    };
    transaction.onerror = function () {
      reject(transaction.error || new Error("IndexedDB transaction failed"));
    };
    transaction.onabort = function () {
      reject(transaction.error || new Error("IndexedDB transaction aborted"));
    };
  });
}

function openDraftDatabase() {
  if (draftDbPromise) return draftDbPromise;
  draftDbPromise = new Promise(function (resolve, reject) {
    var request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_META_STORE)) {
        db.createObjectStore(DRAFT_META_STORE, { keyPath: "pageKey" });
      }
      if (!db.objectStoreNames.contains(DRAFT_RECORD_STORE)) {
        var recordStore = db.createObjectStore(DRAFT_RECORD_STORE, { keyPath: "storageKey" });
        recordStore.createIndex("pageKey", "pageKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(DRAFT_IMAGE_STORE)) {
        var imageStore = db.createObjectStore(DRAFT_IMAGE_STORE, { keyPath: "storageKey" });
        imageStore.createIndex("pageKey", "pageKey", { unique: false });
      }
    };
    request.onsuccess = function () {
      var db = request.result;
      db.onversionchange = function () {
        db.close();
        draftDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = function () {
      draftDbPromise = null;
      reject(request.error || new Error("Failed to open draft database"));
    };
    request.onblocked = function () {
      draftDbPromise = null;
      reject(new Error("Draft database upgrade blocked"));
    };
  });
  return draftDbPromise;
}

function dataUrlToBlob(dataUrl) {
  var value = String(dataUrl || "");
  var commaIndex = value.indexOf(",");
  if (commaIndex < 0 || value.slice(0, commaIndex).indexOf("data:") !== 0) return null;
  var header = value.slice(5, commaIndex);
  var payload = value.slice(commaIndex + 1);
  var isBase64 = /;base64(?:;|$)/i.test(header);
  var mimeType = (header.split(";")[0] || "application/octet-stream").trim();
  if (!isBase64) return new Blob([decodeURIComponent(payload)], { type: mimeType });
  var binary = atob(payload);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function blobToDataUrl(blob) {
  if (!blob) return null;
  var bytes = new Uint8Array(await blob.arrayBuffer());
  var binary = "";
  var chunkSize = 32768;
  for (var offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
  }
  return "data:" + (blob.type || "application/octet-stream") + ";base64," + btoa(binary);
}

function prepareRecordForStorage(pageKey, record) {
  var recordId = String(record && record.id ? record.id : "");
  if (!recordId) return null;
  var storedRecord = cloneJson(record);
  var originalShot = record && record.shot && typeof record.shot === "object" ? record.shot : {};
  if (!storedRecord.shot || typeof storedRecord.shot !== "object") storedRecord.shot = {};
  var images = [];
  function storeImage(kind, value, clearStoredValue) {
    var blob = typeof value === "string" ? dataUrlToBlob(value) : null;
    if (!blob) return;
    clearStoredValue();
    images.push({
      storageKey: getDraftImageStorageKey(pageKey, recordId, kind),
      pageKey: pageKey,
      recordId: recordId,
      kind: kind,
      blob: blob
    });
  }
  DRAFT_SHOT_IMAGE_KINDS.forEach(function (kind) {
    var value = originalShot[kind];
    storeImage(kind, value, function () {
      storedRecord.shot[kind] = null;
    });
  });
  var noteImages = record && Array.isArray(record.noteImages) ? record.noteImages : [];
  noteImages.slice(0, DRAFT_NOTE_IMAGE_KINDS.length).forEach(function (image, index) {
    storeImage(DRAFT_NOTE_IMAGE_KINDS[index], image && image.src, function () {
      storedRecord.noteImages[index].src = null;
    });
  });
  var reviewImages = record && record.review && Array.isArray(record.review.images) ? record.review.images : [];
  reviewImages.slice(0, DRAFT_REVIEW_IMAGE_KINDS.length).forEach(function (image, index) {
    storeImage(DRAFT_REVIEW_IMAGE_KINDS[index], image && image.src, function () {
      storedRecord.review.images[index].src = null;
    });
  });
  return {
    storageKey: getDraftRecordStorageKey(pageKey, recordId),
    pageKey: pageKey,
    recordId: recordId,
    record: storedRecord,
    images: images
  };
}

async function loadDraftFromDatabase(pageKey) {
  var db = await openDraftDatabase();
  var metaTransaction = db.transaction(DRAFT_META_STORE, "readonly");
  var metaDone = idbTransactionDone(metaTransaction);
  var meta = await idbRequest(metaTransaction.objectStore(DRAFT_META_STORE).get(pageKey));
  await metaDone;
  if (!meta || !meta.draft) return null;

  var recordIds = Array.isArray(meta.recordIds) ? meta.recordIds : [];
  var transaction = db.transaction([DRAFT_RECORD_STORE, DRAFT_IMAGE_STORE], "readonly");
  var transactionDone = idbTransactionDone(transaction);
  var recordStore = transaction.objectStore(DRAFT_RECORD_STORE);
  var imageStore = transaction.objectStore(DRAFT_IMAGE_STORE);
  var bundles = recordIds.map(function (recordId) {
    var recordPromise = idbRequest(recordStore.get(getDraftRecordStorageKey(pageKey, recordId)));
    var imagePromises = DRAFT_IMAGE_KINDS.map(function (kind) {
      return idbRequest(imageStore.get(getDraftImageStorageKey(pageKey, recordId, kind)));
    });
    return Promise.all([recordPromise, Promise.all(imagePromises)]);
  });
  var storedBundles = await Promise.all(bundles);
  await transactionDone;

  var records = [];
  for (var i = 0; i < storedBundles.length; i++) {
    var storedRecordEntry = storedBundles[i][0];
    if (!storedRecordEntry || !storedRecordEntry.record) {
      throw new Error("Stored draft is incomplete; recovery was stopped to protect existing data");
    }
    var hydratedRecord = cloneJson(storedRecordEntry.record);
    if (!hydratedRecord.shot || typeof hydratedRecord.shot !== "object") hydratedRecord.shot = {};
    var storedImages = storedBundles[i][1];
    for (var j = 0; j < DRAFT_IMAGE_KINDS.length; j++) {
      var imageEntry = storedImages[j];
      if (imageEntry && imageEntry.blob) {
        var imageKind = DRAFT_IMAGE_KINDS[j];
        var imageDataUrl = await blobToDataUrl(imageEntry.blob);
        if (DRAFT_SHOT_IMAGE_KINDS.indexOf(imageKind) !== -1) {
          hydratedRecord.shot[imageKind] = imageDataUrl;
        } else if (imageKind.indexOf("note-") === 0) {
          var noteIndex = Number(imageKind.slice(5));
          if (hydratedRecord.noteImages && hydratedRecord.noteImages[noteIndex]) {
            hydratedRecord.noteImages[noteIndex].src = imageDataUrl;
          }
        } else if (imageKind.indexOf("review-") === 0) {
          var reviewIndex = Number(imageKind.slice(7));
          if (hydratedRecord.review && hydratedRecord.review.images && hydratedRecord.review.images[reviewIndex]) {
            hydratedRecord.review.images[reviewIndex].src = imageDataUrl;
          }
        }
      }
    }
    records.push(hydratedRecord);
  }

  var draft = cloneJson(meta.draft);
  draft.records = records;
  return draft;
}

async function saveDraftToDatabase(pageKey, draft) {
  var db = await openDraftDatabase();
  var readTransaction = db.transaction(DRAFT_META_STORE, "readonly");
  var readDone = idbTransactionDone(readTransaction);
  var previousMeta = await idbRequest(readTransaction.objectStore(DRAFT_META_STORE).get(pageKey));
  await readDone;

  var records = draft && Array.isArray(draft.records) ? draft.records : [];
  var recordIds = [];
  var recordVersions = {};
  var preparedRecords = [];
  var previousVersions = previousMeta && previousMeta.recordVersions ? previousMeta.recordVersions : {};
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var recordId = String(record && record.id ? record.id : "");
    if (!recordId) continue;
    var recordVersion = String(record.updatedAt || record.createdAt || "");
    recordIds.push(recordId);
    recordVersions[recordId] = recordVersion;
    if (!previousMeta || previousVersions[recordId] !== recordVersion) {
      var prepared = prepareRecordForStorage(pageKey, record);
      if (prepared) preparedRecords.push(prepared);
    }
  }

  var draftMeta = cloneJson(draft || {});
  draftMeta.records = [];
  var transaction = db.transaction([DRAFT_META_STORE, DRAFT_RECORD_STORE, DRAFT_IMAGE_STORE], "readwrite");
  var transactionDone = idbTransactionDone(transaction);
  var metaStore = transaction.objectStore(DRAFT_META_STORE);
  var recordStore = transaction.objectStore(DRAFT_RECORD_STORE);
  var imageStore = transaction.objectStore(DRAFT_IMAGE_STORE);
  preparedRecords.forEach(function (prepared) {
    recordStore.put({
      storageKey: prepared.storageKey,
      pageKey: prepared.pageKey,
      recordId: prepared.recordId,
      record: prepared.record
    });
    var storedKinds = {};
    prepared.images.forEach(function (image) {
      storedKinds[image.kind] = true;
      imageStore.put(image);
    });
    DRAFT_IMAGE_KINDS.forEach(function (kind) {
      if (!storedKinds[kind]) {
        imageStore.delete(getDraftImageStorageKey(pageKey, prepared.recordId, kind));
      }
    });
  });

  var currentRecordIds = {};
  recordIds.forEach(function (recordId) {
    currentRecordIds[recordId] = true;
  });
  var previousRecordIds = previousMeta && Array.isArray(previousMeta.recordIds) ? previousMeta.recordIds : [];
  previousRecordIds.forEach(function (recordId) {
    if (currentRecordIds[recordId]) return;
    recordStore.delete(getDraftRecordStorageKey(pageKey, recordId));
    DRAFT_IMAGE_KINDS.forEach(function (kind) {
      imageStore.delete(getDraftImageStorageKey(pageKey, recordId, kind));
    });
  });

  metaStore.put({
    pageKey: pageKey,
    draft: draftMeta,
    recordIds: recordIds,
    recordVersions: recordVersions,
    updatedAt: Date.now()
  });
  await transactionDone;
  return draft;
}

async function clearDraftFromDatabase(pageKey) {
  var db = await openDraftDatabase();
  var readTransaction = db.transaction(DRAFT_META_STORE, "readonly");
  var readDone = idbTransactionDone(readTransaction);
  var meta = await idbRequest(readTransaction.objectStore(DRAFT_META_STORE).get(pageKey));
  await readDone;
  var recordIds = meta && Array.isArray(meta.recordIds) ? meta.recordIds : [];
  var transaction = db.transaction([DRAFT_META_STORE, DRAFT_RECORD_STORE, DRAFT_IMAGE_STORE], "readwrite");
  var transactionDone = idbTransactionDone(transaction);
  transaction.objectStore(DRAFT_META_STORE).delete(pageKey);
  recordIds.forEach(function (recordId) {
    transaction.objectStore(DRAFT_RECORD_STORE).delete(getDraftRecordStorageKey(pageKey, recordId));
    DRAFT_IMAGE_KINDS.forEach(function (kind) {
      transaction.objectStore(DRAFT_IMAGE_STORE).delete(getDraftImageStorageKey(pageKey, recordId, kind));
    });
  });
  await transactionDone;
}

function queueDraftWrite(pageKey, operation) {
  var previous = draftWriteQueues[pageKey] || Promise.resolve();
  var queued = previous.catch(function () {}).then(operation);
  var tracked = queued.finally(function () {
    if (draftWriteQueues[pageKey] === tracked) delete draftWriteQueues[pageKey];
  });
  draftWriteQueues[pageKey] = tracked;
  return tracked;
}

async function waitForDraftWrite(pageKey) {
  var pending = draftWriteQueues[pageKey];
  if (pending) await pending;
}

async function getStorageUsage() {
  var localBytes = await chrome.storage.local.getBytesInUse(null);
  var localQuota = chrome.storage.local.QUOTA_BYTES || 10485760;
  var estimatedUsage = 0;
  var estimatedQuota = 0;
  if (self.navigator && self.navigator.storage && typeof self.navigator.storage.estimate === "function") {
    try {
      var estimate = await self.navigator.storage.estimate();
      estimatedUsage = Number(estimate && estimate.usage) || 0;
      estimatedQuota = Number(estimate && estimate.quota) || 0;
    } catch (err) {}
  }
  return {
    localBytes: localBytes,
    localQuota: localQuota,
    estimatedUsage: estimatedUsage,
    estimatedQuota: estimatedQuota
  };
}

async function loadDraft(pageKey) {
  var safePageKey = normalizePageKey(pageKey);
  if (!safePageKey) return null;
  await waitForDraftWrite(safePageKey);
  var databaseDraft = await loadDraftFromDatabase(safePageKey);
  if (databaseDraft) return databaseDraft;
  var result = await chrome.storage.local.get(getDraftStorageKey(safePageKey));
  var legacyDraft = result[getDraftStorageKey(safePageKey)] || null;
  if (!legacyDraft) return null;
  await queueDraftWrite(safePageKey, function () {
    return saveDraftToDatabase(safePageKey, legacyDraft);
  });
  try {
    await chrome.storage.local.remove(getDraftStorageKey(safePageKey));
  } catch (err) {
    console.warn("[Visual QA] Failed to remove migrated legacy draft", err);
  }
  return legacyDraft;
}

async function saveDraft(pageKey, draft) {
  var safePageKey = normalizePageKey(pageKey);
  if (!safePageKey) throw new Error("Missing pageKey");
  await queueDraftWrite(safePageKey, function () {
    return saveDraftToDatabase(safePageKey, draft || null);
  });
  try {
    await chrome.storage.local.remove(getDraftStorageKey(safePageKey));
  } catch (err) {
    console.warn("[Visual QA] Failed to remove legacy draft after save", err);
  }
  return draft || null;
}

async function clearDraft(pageKey) {
  var safePageKey = normalizePageKey(pageKey);
  if (!safePageKey) return false;
  await queueDraftWrite(safePageKey, function () {
    return clearDraftFromDatabase(safePageKey);
  });
  try {
    await chrome.storage.local.remove(getDraftStorageKey(safePageKey));
  } catch (err) {
    console.warn("[Visual QA] Failed to remove legacy draft after clear", err);
  }
  return true;
}

function captureVisibleTab(windowId) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 90 }, function (dataUrl) {
      var runtimeError = chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError : null;
      if (runtimeError) {
        reject(new Error(runtimeError.message || "Failed to capture visible tab"));
        return;
      }
      if (!dataUrl) {
        reject(new Error("Empty capture result"));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function downloadHtmlFile(html, filename) {
  return new Promise(function (resolve, reject) {
    if (!chrome.downloads || typeof chrome.downloads.download !== "function") {
      reject(new Error("Downloads API unavailable"));
      return;
    }
    var safeHtml = String(html || "");
    var safeFilename = String(filename || "").trim() || "visual-qa-report.html";
    var url = "data:text/html;charset=utf-8," + encodeURIComponent(safeHtml);
    chrome.downloads.download(
      {
        url: url,
        filename: safeFilename,
        saveAs: false
      },
      function (downloadId) {
        var runtimeError = chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError : null;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "Download failed"));
          return;
        }
        if (typeof downloadId !== "number") {
          reject(new Error("Empty download id"));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

function getTopbarIconUrls() {
  return {
    select: chrome.runtime.getURL("assets/ui/topbar/select.svg"),
    measure: chrome.runtime.getURL("assets/ui/topbar/measure.svg"),
    recordElement: chrome.runtime.getURL("assets/ui/topbar/record-element.svg"),
    recordRegion: chrome.runtime.getURL("assets/ui/topbar/record-region.svg"),
    more: chrome.runtime.getURL("assets/ui/topbar/gengduo.svg"),
    close: chrome.runtime.getURL("assets/ui/topbar/guanbi.svg")
  };
}

function getFloatingIconUrls() {
  return {
    "layout-width": chrome.runtime.getURL("assets/ui/fuchuang/kuandu.svg"),
    "layout-height": chrome.runtime.getURL("assets/ui/fuchuang/gao.svg"),
    "layout-padding-horizontal": chrome.runtime.getURL("assets/ui/fuchuang/shuiping.svg"),
    "layout-padding-vertical": chrome.runtime.getURL("assets/ui/fuchuang/chuizhi.svg"),
    "layout-padding-left": chrome.runtime.getURL("assets/ui/fuchuang/zuo.svg"),
    "layout-padding-top": chrome.runtime.getURL("assets/ui/fuchuang/shang.svg"),
    "layout-padding-right": chrome.runtime.getURL("assets/ui/fuchuang/you.svg"),
    "layout-padding-bottom": chrome.runtime.getURL("assets/ui/fuchuang/xia.svg"),
    "layout-margin-左": chrome.runtime.getURL("assets/ui/fuchuang/zuobian.svg"),
    "layout-margin-右": chrome.runtime.getURL("assets/ui/fuchuang/youbian.svg"),
    "layout-margin-上": chrome.runtime.getURL("assets/ui/fuchuang/shangbian.svg"),
    "layout-margin-下": chrome.runtime.getURL("assets/ui/fuchuang/xiabian.svg"),
    "layout-padding-toggle": chrome.runtime.getURL("assets/ui/fuchuang/zhankai.svg"),
    "layout-padding-toggle-active": chrome.runtime.getURL("assets/ui/fuchuang/zhankaixuanzhong.svg"),
    jiantou: chrome.runtime.getURL("assets/ui/fuchuang/jiantou.svg"),
    "font-line-height": chrome.runtime.getURL("assets/ui/fuchuang/hanggao.svg"),
    "stroke-border": chrome.runtime.getURL("assets/ui/fuchuang/miaobian.svg"),
    "shadow-offset-x": chrome.runtime.getURL("assets/ui/fuchuang/x.svg"),
    "shadow-offset-y": chrome.runtime.getURL("assets/ui/fuchuang/y.svg"),
    "shadow-blur": chrome.runtime.getURL("assets/ui/fuchuang/misan.svg"),
    "shadow-spread": chrome.runtime.getURL("assets/ui/fuchuang/jiaodu.svg"),
    "gradient-rotate": chrome.runtime.getURL("assets/ui/fuchuang/xuanzhuan.svg"),
    "gradient-delete-stop": chrome.runtime.getURL("assets/ui/fuchuang/jianqujiedian.svg"),
    xiguan: chrome.runtime.getURL("assets/ui/fuchuang/xiqu.svg"),
    "appearance-opacity": chrome.runtime.getURL("assets/ui/fuchuang/toumingdu.svg"),
    "appearance-radius": chrome.runtime.getURL("assets/ui/fuchuang/yuanjiao.svg"),
    "appearance-radius-top-left": chrome.runtime.getURL("assets/ui/fuchuang/zuoyuan.svg"),
    "appearance-radius-top-right": chrome.runtime.getURL("assets/ui/fuchuang/youyuan.svg"),
    "appearance-radius-bottom-left": chrome.runtime.getURL("assets/ui/fuchuang/xiazuoyuan.svg"),
    "appearance-radius-bottom-right": chrome.runtime.getURL("assets/ui/fuchuang/youxiayuan.svg")
  };
}

function getAiChangeIconUrls() {
  return {
    copy: chrome.runtime.getURL("assets/ui/topbar/fuzhi.svg"),
    delete: chrome.runtime.getURL("assets/ui/topbar/shanchu.svg")
  };
}

async function setActionVisualState(tabId, isActive) {
  if (typeof tabId !== "number") return;
  var stateKey = isActive ? "on" : "off";
  if (isActive) {
    tabPluginState[tabId] = true;
  } else {
    delete tabPluginState[tabId];
  }

  try {
    await Promise.all([
      chrome.action.setIcon({
        tabId: tabId,
        path: ACTION_ICON_PATHS[stateKey]
      }),
      chrome.action.setTitle({
        tabId: tabId,
        title: ACTION_TITLES[stateKey]
      })
    ]);
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    if (message.indexOf("No tab with id") !== -1) {
      delete tabPluginState[tabId];
      return;
    }
    throw err;
  }
}

async function resetActionVisualState(tabId) {
  if (typeof tabId !== "number") return;
  await setActionVisualState(tabId, false);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (!isInjectableUrl(tab.url)) {
    console.warn(
      "[visual-qa] Current page does not allow script injection (restricted or unsupported URL):",
      tab.url
    );
    await resetActionVisualState(tab.id);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content-bridge.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["visual-qa.js"],
      world: "MAIN"
    });
  } catch (err) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content-bridge.js"]
      });
      // If MAIN world fails (older Chrome), fallback to isolated world.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["visual-qa.js"]
      });
    } catch (fallbackErr) {
      console.error("[visual-qa] Failed to inject script:", fallbackErr);
    }
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabPluginState[tabId];
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (!changeInfo) return;
  if (changeInfo.status === "loading" || typeof changeInfo.url === "string") {
    void resetActionVisualState(tabId);
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.source !== BRIDGE_SOURCE) return false;

  (async function () {
    var action = message.action;
    if (action === "load-draft") {
      sendResponse({ ok: true, draft: await loadDraft(message.pageKey) });
      return;
    }

    if (action === "save-draft") {
      sendResponse({ ok: true, draft: await saveDraft(message.pageKey, message.draft) });
      return;
    }

    if (action === "clear-draft") {
      sendResponse({ ok: true, cleared: await clearDraft(message.pageKey) });
      return;
    }

    if (action === "get-storage-usage") {
      sendResponse({ ok: true, usage: await getStorageUsage() });
      return;
    }

    if (action === "capture-visible-tab") {
      if (!sender || !sender.tab || typeof sender.tab.windowId !== "number") {
        sendResponse({ ok: false, error: "Missing sender window context" });
        return;
      }
      sendResponse({
        ok: true,
        dataUrl: await captureVisibleTab(sender.tab.windowId)
      });
      return;
    }

    if (action === "export-html") {
      if (!message.filename) {
        sendResponse({ ok: false, error: "Missing export filename" });
        return;
      }
      if (!message.html) {
        sendResponse({ ok: false, error: "Missing export html" });
        return;
      }
      sendResponse({
        ok: true,
        downloadId: await downloadHtmlFile(message.html, message.filename)
      });
      return;
    }

    if (action === "get-topbar-icon-urls") {
      sendResponse({ ok: true, iconUrls: getTopbarIconUrls() });
      return;
    }

    if (action === "get-floating-icon-urls") {
      sendResponse({ ok: true, iconUrls: getFloatingIconUrls() });
      return;
    }

    if (action === "get-ai-change-icon-urls") {
      sendResponse({ ok: true, iconUrls: getAiChangeIconUrls() });
      return;
    }

    if (action === "set-plugin-state") {
      var senderTabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;
      if (senderTabId == null) {
        sendResponse({ ok: false, error: "Missing sender tab id" });
        return;
      }
      await setActionVisualState(senderTabId, !!message.active);
      sendResponse({ ok: true, active: !!message.active });
      return;
    }

    sendResponse({ ok: false, error: "Unknown action: " + action });
  })().catch(function (err) {
    sendResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  });

  return true;
});
