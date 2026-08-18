// Sponsored Check — popup: on/off toggle, theme switch, manual analyse.
const body = document.body;
const toggle = document.getElementById("enabled");
const themeBtn = document.getElementById("theme");

function applyTheme(theme) {
  body.classList.toggle("dark", theme === "dark");
  themeBtn.textContent = theme === "dark" ? "\u2600" : "\u263e";
}

chrome.storage.local.get(["enabled", "theme"], ({ enabled, theme }) => {
  toggle.checked = enabled !== false; // default: on
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(theme || (prefersDark ? "dark" : "light"));
});

themeBtn.addEventListener("click", () => {
  const next = body.classList.contains("dark") ? "light" : "dark";
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});

document.getElementById("analyse").addEventListener("click", async () => {
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
