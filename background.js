// Sponsored Check — service worker: weekly index refresh + manual analyze action.
const INDEX_URL = "https://raw.githubusercontent.com/ooobiii/sponsored-check/main/sponsors.json";
const ALARM = "sponsor-index-refresh";

async function refreshIndex() {
  try {
    const res = await fetch(INDEX_URL);
    if (!res.ok) return;
    const idx = await res.json();
    await chrome.storage.local.set({ sponsors: idx, sponsorsUpdated: Date.now() });
  } catch {
    // Silent: next weekly run retries. A stale index beats an errored banner.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 7 * 24 * 60 });
  refreshIndex();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refreshIndex();
});
