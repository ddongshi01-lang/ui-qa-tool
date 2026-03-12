chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["visual-qa.js"],
      world: "MAIN"
    });
  } catch (err) {
    // If MAIN world fails (older Chrome), fallback to isolated world.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["visual-qa.js"]
    });
  }
});
