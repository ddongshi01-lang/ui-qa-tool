var DRAFT_PREFIX = "vqa:draft:";
var BRIDGE_SOURCE = "visual-qa-bridge-v12-step2";

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

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (!isInjectableUrl(tab.url)) {
    console.warn(
      "[visual-qa] Current page does not allow script injection (restricted or unsupported URL):",
      tab.url
    );
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

    sendResponse({ ok: false, error: "Unknown action: " + action });
  })().catch(function (err) {
    sendResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  });

  return true;
});
