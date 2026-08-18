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

  const NON_JOB_SEGMENTS = new Set([
    "apply", "search", "results", "list", "all", "overview", "careers",
    "faq", "contact", "privacy", "cookies", "help", "login", "signup",
    "blog", "news", "jobs", "view",
  ]);

  // Generic last resort: /jobs/<id> or /positions/<id> — ATS job IDs are often
  // alphanumeric (Sky: t-R0054677, SuccessFactors, Workday). Excludes common
  // non-job segments. ponytail: false-positives on odd pages sharing the shape;
  // dismissible, and JSON-LD usually fires first anyway.
  function genericJobUrl() {
    const m = location.pathname.match(/\/(?:jobs|positions)\/([^/?#]+)/);
    if (!m) return false;
    const seg = m[1].toLowerCase();
    return seg.length >= 3 && !NON_JOB_SEGMENTS.has(seg);
  }

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
    return JOB_RE.some((re) => re.test(location.href)) || genericJobUrl() || hasJobPostingSchema();
  }

  // Platform/placeholder site names are NOT employers — looking one up against
  // the register fabricates a wrong verdict; better to say UNKNOWN.
  const PLATFORM_NAMES = new Set([
    "oracle", "cx", "candidate experience", "careers", "workday",
    "successfactors", "greenhouse", "lever", "smartrecruiters", "jobvite",
    "icims", "taleo", "bamboo hr",
  ]);

  const PLATFORM_HOSTS = new Set([
    "teamtailor.com", "oraclecloud.com", "workday.com", "myworkdayjobs.com",
    "greenhouse.com", "lever.co", "ashbyhq.com", "recruitee.com",
    "pinpointapps.com", "breezy.hr", "homerun.co", "smartrecruiters.com",
    "jobvite.com", "icims.com", "taleo.net", "personio.de", "dover.com",
    "facebook.com", "linkedin.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "tiktok.com", "glassdoor.com",
  ]);

  // ponytail: heuristic for sites with no structured data — derive the employer
  // from the domain (jobs.bendingspoons.com -> "Bending Spoons"). Ceiling:
  // brand != legal entity and odd hosts; the token-subset lookup absorbs that.
  function companyFromDomain(host) {
    if (!host) host = location.hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    while (parts.length > 2 && /^(jobs|careers|career|apply|join|recruiting|hcm)$/.test(parts[0])) parts.shift();
    const registrable = parts.slice(-2).join(".");
    if (PLATFORM_HOSTS.has(registrable)) return null;
    const last = parts[parts.length - 1];
    const brandIdx = /^(uk|au|nz|za|ie|in|sg|my|jp)$/.test(last) ? parts.length - 3 : parts.length - 2;
    const brand = parts[brandIdx];
    if (!brand || brand.length < 3 || /^(co|com|org|net|io|de|it|fr)$/.test(brand)) return null;
    return brand.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

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
    if (siteName && !PLATFORM_NAMES.has(normalizeName(siteName))) return siteName;
    // og:url often carries the employer's careers domain even when the page is
    // an ATS shell (iCIMS: careers-kingfisher2.icims.com -> careers.kingfisher.com).
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content;
    if (ogUrl) {
      try { const c = companyFromDomain(new URL(ogUrl).hostname); if (c) return c; } catch {}
    }
    return companyFromDomain();
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
      el.innerHTML = '<span id="sc-text"></span><a id="sc-report" target="_blank" rel="noopener">Wrong verdict?</a><button id="sc-close" aria-label="Dismiss">\u00d7</button>';
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
    const report = el.querySelector("#sc-report");
    // Feedback loop: one click opens the pre-filled issue template. Hidden
    // while loading — pointless during "Analysing…".
    if (state === "LOADING") {
      report.hidden = true;
    } else {
      report.hidden = false;
      report.href =
        "https://github.com/ooobiii/sponsored-check/issues/new?template=false-verdict.md&title=" +
        encodeURIComponent("Wrong verdict on " + location.hostname);
    }
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

  // ponytail: exact-match ceiling (brand vs legal entity, e.g. "Bending Spoons"
  // vs "Bending Spoons Operations S.p.A. UK Branch"). Token-subset fallback:
  // every significant token of the shorter name must appear in the key. Single
  // tokens allowed — "Accenture" must hit "accenture uk"; errs toward amber,
  // which is the right bias (false red is worse than false amber). Ceiling: an
  // unrelated licensed company sharing a name token. Upgrade: curated aliases.
  let tokenCache = null; // Map(key -> significant tokens), built once per page
  function significantTokens(s) {
    return s.split(/\s+/).filter((t) => t.length >= 3);
  }
  function lookupSponsor(sponsors, company) {
    const key = normalizeName(company);
    if (sponsors[key]) return true;
    if (!tokenCache) {
      tokenCache = new Map();
      for (const k of Object.keys(sponsors)) tokenCache.set(k, significantTokens(k));
    }
    const want = significantTokens(key);
    if (!want.length) return false;
    for (const [k, tokens] of tokenCache) {
      if (tokens.length > want.length + 4) continue;
      if (want.every((t) => tokens.includes(t))) return true;
    }
    return false;
  }

  // SPA shells hydrate structured data late (iCIMS, Next.js) — retry once
  // before giving up, so late JSON-LD still resolves.
  let retried = false;
  function run(force) {
    if (!force && !isJobPage()) return;
    chrome.storage.local.get("enabled", ({ enabled }) => {
      if (enabled === false) return; // switched off in the popup
      showBanner("LOADING"); // auto AND manual — always resolves to a verdict below
      const v = verdict(pageText());
      if (v !== "NO_SIGNAL") return showBanner(v);
      const company = findCompany();
      if (!company) {
        if (!retried) { retried = true; setTimeout(() => run(force), 1500); return; }
        return showBanner("UNKNOWN");
      }
      getSponsors((sponsors) => {
        if (!sponsors) return showBanner("UNKNOWN");
        showBanner(lookupSponsor(sponsors, company) ? "MAY_SPONSOR" : "NOT_SPONSORED");
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
    #sc-report{color:#6e7781;font-size:11px;text-decoration:none;margin-left:4px;white-space:nowrap}
    #sc-report:hover{text-decoration:underline}
    @keyframes scFade{from{opacity:0}to{opacity:1}}
    @keyframes scPulse{50%{opacity:.35}}`;
  document.head.appendChild(style);

  run(false);
})();
