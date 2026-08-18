// Sponsored Check — content script (auto-injected on job sites, manually on any site).
(() => {
  if (window.__sponsoredCheck) return;
  window.__sponsoredCheck = true;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SC_ANALYZE") run(true);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("enabled" in changes)) return;
    if (changes.enabled.newValue === false) { if (el) el.remove(); }
    else run(false);
  });

  // ponytail: hand-picked URL shapes; boards change them and miss here. Ceiling:
  // undetected job pages. Upgrade: site-specific selector checks; manual analyze
  // is the escape hatch today. otta/wttj patterns are guesses — tolerant on purpose.
  const JOB_RE = [
    /linkedin\.com\/jobs\/view\/\d+/,
    /indeed\.(?:co\.uk|com).*?(?:viewjob\?jk=|vjk=)/,
    /reed\.co\.uk\/jobs\/[^/]+\/\d+/,
    /glassdoor\.co\.uk\/(?:job-listing|Job)\//i,
    /otta\.com\/jobs\//,
    /welcome2thejungle\.com\/(?:[a-z]{2}\/)?jobs\//,
    /welcometothejungle\.com\/(?:[a-z]{2}\/)?jobs\//,
  ];

  function isJobPage() {
    return JOB_RE.some((re) => re.test(location.href));
  }

  function findCompany() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }
      const org = deepFind(data, "hiringOrganization");
      if (org && org.name) return org.name;
    }
    // ponytail: weak fallback (og:site_name is the site, not always the company).
    return document.querySelector('meta[property="og:site_name"]')?.content || null;
  }

  function deepFind(node, key) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const item of node) { const r = deepFind(item, key); if (r) return r; }
      return null;
    }
    if (key in node) return node[key];
    for (const v of Object.values(node)) { const r = deepFind(v, key); if (r) return r; }
    return null;
  }

  let el = null;
  function showBanner(state) {
    if (!el) {
      el = document.createElement("div");
      el.id = "sponsored-check-banner";
      el.innerHTML = '<span id="sc-text"></span><button id="sc-close" aria-label="Dismiss">\u00d7</button>';
      el.querySelector("#sc-close").addEventListener("click", () => el.remove());
      document.documentElement.appendChild(el);
    }
    el.dataset.state = state;
    el.querySelector("#sc-text").textContent = {
      LOADING: "Checking sponsorship\u2026",
      SPONSORED: "This role appears to offer visa sponsorship",
      NOT_SPONSORED: "No visa sponsorship found for this role",
      MAY_SPONSOR: "Company is a licensed sponsor \u2014 role doesn't state sponsorship",
    }[state];
  }

  function run(force) {
    if (!force && !isJobPage()) return;
    chrome.storage.local.get("enabled", ({ enabled }) => {
      if (enabled === false) return; // switched off in the popup
      if (force) showBanner("LOADING"); // instant feedback for manual analyze
      const v = verdict(document.body.innerText || "");
      if (v !== "NO_SIGNAL") return showBanner(v);
      const company = findCompany();
      // ponytail: no company -> no banner. Silent beats a fabricated verdict; the
      // off-register=NOT_SPONSORED rule only applies when we actually matched a company.
      if (!company) return;
      chrome.storage.local.get("sponsors", ({ sponsors }) => {
        // ponytail: index not fetched yet (first install) -> stay silent instead of
        // showing a false "Not sponsored". Ceiling: first-run pages get no banner.
        // Upgrade: pre-seed index in the packaged extension.
        if (sponsors === undefined) return;
        showBanner(sponsors[normalizeName(company)] ? "MAY_SPONSOR" : "NOT_SPONSORED");
      });
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    #sponsored-check-banner{position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:#fff;color:#24292f;border:1px solid rgba(0,0,0,.08);box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.1);font:13px/1.4 system-ui,-apple-system,sans-serif;max-width:340px;animation:scFade .15s ease-out}
    #sponsored-check-banner::before{content:"";width:8px;height:8px;border-radius:50%;flex:none;background:#6e7781}
    #sponsored-check-banner[data-state=LOADING]::before{animation:scPulse 1s ease-in-out infinite}
    #sponsored-check-banner[data-state=SPONSORED]::before{background:#1a7f37}
    #sponsored-check-banner[data-state=NOT_SPONSORED]::before{background:#cf222e}
    #sponsored-check-banner[data-state=MAY_SPONSOR]::before{background:#9a6700}
    #sc-close{background:none;border:none;color:#6e7781;font-size:15px;cursor:pointer;padding:0;line-height:1;margin-left:2px}
    #sc-close:hover{color:#24292f}
    @keyframes scFade{from{opacity:0}to{opacity:1}}
    @keyframes scPulse{50%{opacity:.35}}`;
  document.head.appendChild(style);

  run(false);
})();
