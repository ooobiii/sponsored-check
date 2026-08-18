#!/usr/bin/env python3
"""Download the GOV.UK sponsor register and emit a compact name->rating index.

Stdlib only. Run daily via GitHub Actions; writes sponsors.json at repo root,
which the extension fetches from raw.githubusercontent.com.
"""
import csv
import json
import re
import sys
import urllib.request

PAGE_URL = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"


# Strip legal suffixes so parent/legal-entity variants collapse to one key.
# Mirrors normalizeName() in keywords.js — keep in sync.
SUFFIX_RE = re.compile(
    r"\s+(?:ltd|limited|plc|llp|llc|inc|corp|corporation|co|group|holdings|holding)$"
)


def normalize(name):
    n = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
    for _ in range(4):
        m = SUFFIX_RE.search(n)
        if not m:
            break
        n = n[: m.start()].strip()
    return n


def main():
    page = urllib.request.urlopen(PAGE_URL, timeout=60).read().decode()
    m = re.search(r'href="([^"]*SP[^"]*\.csv)"', page)
    if not m:
        sys.exit("no CSV asset found on register page")
    href = m.group(1)
    csv_url = href if href.startswith("http") else "https://www.gov.uk" + href
    data = urllib.request.urlopen(csv_url, timeout=120).read().decode("utf-8-sig")

    out = {}
    for row in csv.DictReader(data.splitlines()):
        name = next((row[h] for h in row if "name" in h.lower() and row[h].strip()), None)
        if not name:
            continue
        # "Type & Rating" holds e.g. "Worker (A rating)" — keep only the letter.
        rating = next((row[h] for h in row if "rating" in h.lower()), "")
        m = re.search(r"\(([^)]*)\)", rating)
        letter = m.group(1).split()[0] if m else ""
        routes = " ".join(row[h] or "" for h in row if "route" in h.lower()).lower()
        if "skilled worker" not in routes:
            continue  # temporary-worker-only licences don't imply role sponsorship
        out[normalize(name)] = letter

    with open("sponsors.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(out)} sponsors to sponsors.json")


if __name__ == "__main__":
    # ponytail: suffix-stripped exact match only; t/a trading names and
    # unrelated-but-similar names still miss. Ceiling: mismatch cases.
    # Upgrade: token-overlap scoring with a threshold before trusting a hit.
    assert normalize("Acme  Corp, Ltd.") == "acme"
    assert normalize("CX Group Plc") == "cx"
    main()
