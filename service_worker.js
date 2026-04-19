var DRAFT_PREFIX = "vqa:draft:";
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
  off: "视觉走查助手（未开启）",
  on: "视觉走查助手（已开启）"
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

async function loadDraft(pageKey) {
  var safePageKey = normalizePageKey(pageKey);
  if (!safePageKey) return null;
  var result = await chrome.storage.local.get(getDraftStorageKey(safePageKey));
  return result[getDraftStorageKey(safePageKey)] || null;
}

async function saveDraft(pageKey, draft) {
  var safePageKey = normalizePageKey(pageKey);
  if (!safePageKey) throw new Error("Missing pageKey");
  var storageKey = getDraftStorageKey(safePageKey);
  await chrome.storage.local.set({ [storageKey]: draft || null });
  return draft || null;
}

async function clearDraft(pageKey) {
  var safePageKey = normalizePageKey(pageKey);
  if (!safePageKey) return false;
  await chrome.storage.local.remove(getDraftStorageKey(safePageKey));
  return true;
}

function captureVisibleTab(windowId) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 80 }, function (dataUrl) {
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
    recordRegion: chrome.runtime.getURL("assets/ui/topbar/record-region.svg")
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
    "appearance-opacity": chrome.runtime.getURL("assets/ui/fuchuang/toumingdu.svg"),
    "appearance-radius": chrome.runtime.getURL("assets/ui/fuchuang/yuanjiao.svg"),
    "appearance-radius-top-left": chrome.runtime.getURL("assets/ui/fuchuang/zuoyuan.svg"),
    "appearance-radius-top-right": chrome.runtime.getURL("assets/ui/fuchuang/youyuan.svg"),
    "appearance-radius-bottom-left": chrome.runtime.getURL("assets/ui/fuchuang/xiazuoyuan.svg"),
    "appearance-radius-bottom-right": chrome.runtime.getURL("assets/ui/fuchuang/youxiayuan.svg")
  };
}

async function setActionVisualState(tabId, isActive) {
  if (typeof tabId !== "number") return;
  var stateKey = isActive ? "on" : "off";
  tabPluginState[tabId] = !!isActive;
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
}

async function resetActionVisualState(tabId) {
  if (typeof tabId !== "number") return;
  delete tabPluginState[tabId];
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
