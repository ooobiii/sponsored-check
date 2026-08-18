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
    /oraclecloud\.com\/hcmUI\/CandidateExperience\/.*\/job\/\d+/,
    /teamtailor\.com\/jobs\/\d+/,
  ];

  function hasJobPostingSchema() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }
      if (findType(data, "JobPosting")) return true;
    }
    return false;
  }

  function findType(node, type) {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some((i) => findType(i, type));
    if (node["@type"] === type || (Array.isArray(node["@type"]) && node["@type"].includes(type))) return true;
    for (const v of Object.values(node)) if (findType(v, type)) return true;
    return false;
  }

  function isJobPage() {
    // URL fast-path + universal signal: JobPosting JSON-LD is emitted by every
    // job platform (Teamtailor, Oracle HCM, Workday, Greenhouse, Workable...),
    // so newly-encountered platforms work once their host is allowlisted.
    return JOB_RE.some((re) => re.test(location.href)) || hasJobPostingSchema();
  }

  // Platform/placeholder site names are NOT employers — looking one up against
  // the register fabricates a wrong verdict; better to say UNKNOWN.
  const PLATFORM_NAMES = new Set([
    "oracle", "cx", "candidate experience", "careers", "workday",
    "successfactors", "greenhouse", "lever", "smartrecruiters", "jobvite",
    "icims", "taleo", "bamboo hr",
  ]);

  function findCompany() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }
      const org = deepFind(data, "hiringOrganization");
      if (org && org.name) return org.name;
    }
    const siteName = document.querySelector('meta[property="og:site_name"]')?.content;
    // ponytail: og:site_name is often the careers platform, not the employer —
    // blacklist instead of trusting it. Upgrade: site-specific selectors.
    if (siteName && PLATFORM_NAMES.has(normalizeName(siteName))) return null;
    return siteName || null;
  }

  // textContent via treewalker: no layout reflow (innerText is slow on heavy
  // pages), skips script/style noise. Cap 500k chars — footer-only disclaimers
  // past the cap are missed. Upgrade: scan the description container first.
  function pageText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    let len = 0;
    for (let node = walker.nextNode(); node && len < 500000; node = walker.nextNode()) {
      const tag = node.parentElement && node.parentElement.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
      const t = node.textContent;
      parts.push(t);
      len += t.length;
    }
    return parts.join(" ");
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
      LOADING: "Analysing\u2026",
      SPONSORED: "This role appears to offer visa sponsorship",
      NOT_SPONSORED: "No visa sponsorship found for this role",
      MAY_SPONSOR: "Company is a licensed sponsor \u2014 role doesn't state sponsorship",
      UNKNOWN: "Couldn't determine sponsorship for this page",
    }[state];
  }

  // Read the index once per page; repeat analyzes hit memory, not storage.
  let sponsorCache = null;
  function getSponsors(cb) {
    if (sponsorCache !== null) return cb(sponsorCache);
    chrome.storage.local.get("sponsors", ({ sponsors }) => {
      sponsorCache = sponsors ?? null;
      cb(sponsorCache);
    });
  }

  function run(force) {
    if (!force && !isJobPage()) return;
    chrome.storage.local.get("enabled", ({ enabled }) => {
      if (enabled === false) return; // switched off in the popup
      showBanner("LOADING"); // auto AND manual — always resolves to a verdict below
      const v = verdict(pageText());
      if (v !== "NO_SIGNAL") return showBanner(v);
      const company = findCompany();
      if (!company) return showBanner("UNKNOWN");
      getSponsors((sponsors) => {
        if (!sponsors) return showBanner("UNKNOWN");
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
