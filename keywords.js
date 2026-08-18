// Sponsored Check — keyword rules. No DOM/chrome references so Node can test it.

// Negation regex catches the whole "unable to provide visa sponsorship" family
// in one rule instead of a phrase per word order.
const NEGATIVE_RE =
  /(?:cannot|can't|can not|unable to|not able to|do not|does not|won't|will not|no|not)(?: be able to| able to)? (?:provide |offer )?(?:visa )?sponsor(?:ship)?/;
const NEGATIVE_PHRASES = [
  "sponsorship is not available",
  "sponsorship not available",
  "no certificate of sponsorship",
  "not a licensed sponsor",
  "no visa support",
  // ponytail: blanket negative, but "must have or obtain the right to work"
  // (a neutral/positive phrasing) also matches -> false negative. Ceiling:
  // posts that both sponsor and mention right-to-work. Upgrade: context-aware
  // regex (lookbehind for "obtain").
  "right to work",
];
const POSITIVE = [
  "visa sponsorship", "sponsorship available", "sponsorship is available",
  "certificate of sponsorship", "sponsor your visa", "sponsor a visa",
  "sponsor visas", "will sponsor", "we sponsor", "offers sponsorship",
  "offer sponsorship", "can sponsor", "provides sponsorship",
  "provide sponsorship", "sponsorship for",
  // ponytail: old term, mostly positive, rare false positive on unrelated
  // "tier 2" mentions. Upgrade: require "visa" or "sponsor" within N words.
  "tier 2",
];

function verdict(text) {
  const t = String(text).toLowerCase();
  if (NEGATIVE_RE.test(t) || NEGATIVE_PHRASES.some((k) => t.includes(k))) return "NOT_SPONSORED";
  if (POSITIVE.some((k) => t.includes(k))) return "SPONSORED";
  return "NO_SIGNAL";
}

// Strip legal suffixes so parent/legal-entity variants collapse to one key
// ("CX Group plc" and "CX Ltd" both -> "cx"). Mirrored in update_sponsors.py.
const SUFFIX_RE = /\s+(?:ltd|limited|plc|llp|llc|inc|corp|corporation|co|group|holdings|holding)$/;

function normalizeName(name) {
  let n = String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (let i = 0; i < 4 && SUFFIX_RE.test(n); i++) n = n.replace(SUFFIX_RE, "").trim();
  return n;
}

if (typeof module !== "undefined") module.exports = { verdict, normalizeName };
