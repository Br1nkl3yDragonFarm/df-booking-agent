#!/usr/bin/env python3
"""Turn a local clone of cporter202/API-mega-list into a clean, searchable index.

Reads the category README tables, strips the list owner's affiliate code
(?fpr=...) from every link, removes duplicates, and writes:
  api-index.csv   one row per API (name, category, url, description)
  api-index.json  same data for scripts
  index.html      offline search page, open it in Safari

Usage:
  python3 build_index.py build  <path-to-clone> <output-dir>
  python3 build_index.py search <output-dir> <words...>
"""
import csv
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROW = re.compile(r"^\|\s*\[(?P<name>[^\]]+)\]\((?P<url>[^)\s]+)\)\s*\|\s*(?P<desc>.*?)\s*\|\s*$")
TRACKING_KEYS = {"fpr", "ref", "via", "aff", "affiliate", "utm_source", "utm_medium", "utm_campaign"}


def clean_url(url):
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k.lower() not in TRACKING_KEYS]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def category_name(folder):
    # "lead-generation-apis-4431" -> "Lead Generation"
    words = re.sub(r"-apis(-\d+)?$", "", folder).replace("00-", "").split("-")
    return " ".join(w.upper() if w in ("ai", "mcp", "seo") else w.capitalize() for w in words)


def build(clone, out):
    clone, out = Path(clone), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    seen, rows = set(), []
    for readme in sorted(clone.glob("*/**/README.md")):
        folder = readme.relative_to(clone).parts[0]
        if folder in ("settings", "assets", ".git"):
            continue
        category = category_name(folder)
        if folder == "00-featured-apis":
            category = "Sponsored: " + category_name(readme.parent.name)
        for line in readme.read_text(encoding="utf-8", errors="replace").splitlines():
            m = ROW.match(line)
            if not m:
                continue
            if not m["url"].startswith("http"):
                continue  # table-of-contents anchors, not APIs
            url = clean_url(m["url"])
            key = (m["name"], url)  # sponsored entries all share one homepage URL
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "name": html.unescape(m["name"]).strip(),
                "category": category,
                "url": url,
                "host": urlsplit(url).netloc,
                "description": html.unescape(m["desc"]).replace("&#124;", "|").strip(),
            })

    with open(out / "api-index.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "category", "url", "host", "description"])
        writer.writeheader()
        writer.writerows(rows)
    (out / "api-index.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    (out / "index.html").write_text(PAGE.replace("__DATA__", json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")), encoding="utf-8")

    hosts = {}
    for r in rows:
        hosts[r["host"]] = hosts.get(r["host"], 0) + 1
    print(f"Indexed {len(rows):,} unique APIs into {out}")
    for host, n in sorted(hosts.items(), key=lambda x: -x[1])[:5]:
        print(f"  {n:>6,}  {host}")


def search(out, words):
    rows = json.loads((Path(out) / "api-index.json").read_text(encoding="utf-8"))
    words = [w.lower() for w in words]
    hits = [r for r in rows if all(w in (r["name"] + " " + r["description"] + " " + r["category"]).lower() for w in words)]
    for r in hits[:40]:
        print(f"{r['name']}  [{r['category']}]\n  {r['url']}\n  {r['description'][:160]}\n")
    print(f"{len(hits):,} matches" + (" (first 40 shown)" if len(hits) > 40 else ""))


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Mega List (local)</title>
<style>
body{font:15px -apple-system,system-ui,sans-serif;margin:0;padding:16px;background:#fff;color:#111}
@media (prefers-color-scheme:dark){body{background:#111;color:#eee}a{color:#7ab7ff}.d,.c{color:#aaa}}
input,select{font:inherit;padding:8px;margin:0 8px 8px 0;max-width:100%}
.r{padding:10px 0;border-bottom:1px solid #8884}.c{font-size:12px;color:#666}.d{color:#444}
</style></head><body>
<h1>API Mega List — local copy</h1>
<p>Affiliate codes removed. Most entries are paid Apify scrapers: check the price and the target site's terms before using one.</p>
<input id="q" placeholder="Search, e.g. instagram, venue, spotify" size="40" autofocus>
<select id="cat"><option value="">All categories</option></select>
<div id="n"></div><div id="out"></div>
<script>
const DATA = __DATA__;
const q = document.getElementById('q'), cat = document.getElementById('cat'), out = document.getElementById('out'), n = document.getElementById('n');
[...new Set(DATA.map(r => r.category))].sort().forEach(c => cat.add(new Option(c, c)));
const esc = s => s.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
function render() {
  const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
  const hits = DATA.filter(r => (!cat.value || r.category === cat.value) &&
    words.every(w => (r.name + ' ' + r.description).toLowerCase().includes(w)));
  n.textContent = hits.length.toLocaleString() + ' matches';
  out.innerHTML = hits.slice(0, 200).map(r =>
    `<div class="r"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
     <div class="c">${esc(r.category)} · ${esc(r.host)}</div><div class="d">${esc(r.description)}</div></div>`).join('');
}
q.oninput = cat.onchange = render; render();
</script></body></html>
"""

if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "build":
        build(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 4 and sys.argv[1] == "search":
        search(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)
        sys.exit(1)
