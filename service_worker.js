function isInjectableUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!/^(https?:\/\/|file:\/\/)/i.test(url)) return false;
  // Browser-internal and web store pages are not script-injectable.
  if (/^https?:\/\/chromewebstore\.google\.com\//i.test(url)) return false;
  if (/^https?:\/\/microsoftedge\.microsoft\.com\/addons\//i.test(url)) return false;
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
      files: ["visual-qa.js"],
      world: "MAIN"
    });
  } catch (err) {
    try {
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
