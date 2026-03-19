function isInjectableUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /^(https?:\/\/|file:\/\/)/i.test(url);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (!isInjectableUrl(tab.url)) {
    console.warn("[visual-qa] Current page does not allow script injection:", tab.url);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["visual-qa.js"],
      world: "MAIN"
    });
  } catch (err) {
    try {
      // If MAIN world fails (older Chrome), fallback to isolated world.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["visual-qa.js"]
      });
    } catch (fallbackErr) {
      console.error("[visual-qa] Failed to inject script:", fallbackErr);
    }
  }
});
