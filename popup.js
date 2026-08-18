// Sponsored Check — popup: on/off toggle + manual analyze.
const toggle = document.getElementById("enabled");

chrome.storage.local.get("enabled", ({ enabled }) => {
  toggle.checked = enabled !== false; // default: on
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});

document.getElementById("analyze").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["keywords.js", "content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "SC_ANALYZE" });
    window.close();
  } catch {
    // e.g. chrome:// pages — surface it instead of failing silently.
    document.getElementById("error").hidden = false;
  }
});
