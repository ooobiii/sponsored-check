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


def normalize(name):
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


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
    # ponytail: exact-normalized match only; parent companies/agencies/umbrellas
    # won't match and will read as NOT_SPONSORED. Ceiling: mismatch cases.
    # Upgrade: token-overlap scoring with a threshold before trusting a hit.
    assert normalize("Acme  Corp, Ltd.") == "acme corp ltd"
    main()
