#!/usr/bin/env python3
"""Scrape every problem statement for the CURRENT Smart India Hackathon edition.

    python scripts/scrape.py                        # detect the live year, fetch, regenerate
    python scripts/scrape.py --year 2027            # pin a specific edition
    python scripts/scrape.py --cache .cache/x.html  # parse a saved page instead
    python scripts/scrape.py --validate             # check existing artifacts, no network
    python scripts/scrape.py --dry                  # parse and report, write nothing

Writes data/ps.json, data/ps.csv, data/history/ideas.csv (append-only),
data/changelog/<date>.md, ps/SIH<yy>xxx.md and web/src/data/ps.json.

Only the current edition is tracked: the portal deletes past years, so there is
nothing to archive.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("beautifulsoup4 is required: pip install beautifulsoup4 lxml")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import (  # noqa: E402
    fix_mojibake, from_csv, paragraphs, parse_deadline, to_csv, urls_in,
)

ROOT = Path(__file__).resolve().parent.parent
TODAY = date.today().isoformat()
USER_AGENT = "Mozilla/5.0 (sih-scraper; +https://github.com)"

# A brand-new edition may publish only a handful of statements at first, so the
# absolute floor is deliberately low. Protection against a truncated scrape of an
# established edition comes from validate_against().
MIN_RECORDS = 10
MAX_SHRINK = 0.9  # a same-year rescrape must keep >=90% of known records

COLUMNS = [
    "sno", "ps_number", "title", "organization", "department", "category",
    "theme", "deadline", "deadline_date", "ideas", "ideas_quota", "dataset_link",
    "contact", "youtube", "description",
]

HISTORY = ROOT / "data" / "history" / "ideas.csv"
RUNS = ROOT / "data" / "history" / "runs.csv"


def ps_url(year: int) -> str:
    return f"https://sih.gov.in/sih{year}PS"


def fetch_html(url: str, attempts: int = 4) -> str:
    last = None
    for i in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception as err:  # noqa: BLE001 - retry any transport failure
            last = err
            if i == attempts:
                break
            wait = 8 * i
            print(f"  attempt {i}/{attempts} failed ({err}); retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"could not fetch {url}: {last}")


def soup_of(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def infer_year(html: str) -> int | None:
    """Recover the edition from PS numbers ("SIH26001" -> 2026)."""
    match = re.search(r"SIH(\d{2})\d{3}", html)
    return 2000 + int(match.group(1)) if match else None


def count_rows(html: str) -> int:
    """Count real data rows. Each row hides a modal with its own <table>, whose
    <tr>s are also descendants of #dataTablePS, so require >=8 direct <td>."""
    try:
        table = soup_of(html).find("table", id="dataTablePS")
        if not table or not table.find("tbody"):
            return 0
        return sum(
            1 for tr in table.find("tbody").find_all("tr")
            if len(tr.find_all("td", recursive=False)) >= 8
        )
    except Exception:  # noqa: BLE001 - liveness probe must never raise
        return 0


def detect_year(from_year: int) -> tuple[int, str]:
    """Find the newest edition that actually has statements.

    Retired years still return HTTP 200 with full site chrome and an empty table
    (verified: sih2024PS and sih2025PS both 200 with 0 rows), so status codes are
    useless — the page has to be parsed. SIH announces the next edition late in
    the preceding calendar year, so probe one year ahead first.
    """
    tried = []
    for year in (from_year + 1, from_year, from_year - 1):
        try:
            html = fetch_html(ps_url(year), attempts=1)
        except Exception:  # noqa: BLE001
            tried.append(f"{year}: unreachable")
            continue
        rows = count_rows(html)
        tried.append(f"{year}: {rows} rows")
        if rows >= MIN_RECORDS:
            print(f"  detected live edition: SIH {year} ({', '.join(tried)})")
            return year, html
    raise RuntimeError(
        f"no live edition found - {', '.join(tried)}. "
        "The URL scheme may have changed; pin one with --year."
    )


# --- parsing -------------------------------------------------------------

BULLET_TAGS = {"li"}
BLOCK_TAGS = {"p", "div", "ul", "ol", "tr"}


def description_text(node) -> str:
    """Extract description text while preserving the structure the portal ships.

    180 of 226 statements use <br> for line breaks and 75 use <b> for section
    headings. BeautifulSoup's get_text() drops both, so walk the tree instead:
    a run of 2+ <br> becomes a paragraph break, a single <br> a line break, and a
    bold run is normalised to "Heading:" on its own line.
    """
    out: list[str] = []

    def walk(parent) -> None:
        for child in parent.children:
            name = getattr(child, "name", None)
            if name is None:  # NavigableString
                out.append(re.sub(r"[ \t\r\n]+", " ", str(child)))
                continue
            tag = name.lower()
            if tag == "br":
                out.append("\n")
            elif tag in ("b", "strong"):
                label = re.sub(r"\s+", " ", child.get_text()).strip().rstrip(":")
                if label:
                    out.append(f"\n\n{label}:\n")
            elif tag in BULLET_TAGS:
                out.append("\n• ")
                walk(child)
            elif tag in BLOCK_TAGS:
                out.append("\n")
                walk(child)
                out.append("\n")
            else:
                walk(child)

    walk(node)

    text = fix_mojibake("".join(out))
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)   # collapse <br><br><br> runs
    text = re.sub(r"\n+(?=:)", "", text)      # stray colon on its own line
    return text.strip()


def _cell_text(node) -> str:
    return fix_mojibake(re.sub(r"\s+", " ", node.get_text()).strip())


MODAL_ID = re.compile(r"^ViewProblemStatement")
IDEAS_RE = re.compile(r"^(\d+)\s*/\s*(\d+)$")


def parse(html: str) -> list[dict]:
    table = soup_of(html).find("table", id="dataTablePS")
    if not table or not table.find("tbody"):
        raise RuntimeError("no #dataTablePS tbody - the page layout changed")

    records = []
    for tr in table.find("tbody").find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        if len(tds) < 8:
            continue

        title_cell = tds[2]
        link = title_cell.find("a")
        title = _cell_text(link if link else title_cell)

        # Each row carries a hidden modal holding the long-form fields.
        extra: dict[str, str] = {}
        modal = title_cell.find("div", id=MODAL_ID)
        if modal:
            for row in modal.find_all("tr"):
                th = row.find("th")
                td = row.find("td")
                if not th or not td:
                    continue
                key = re.sub(r"\s+", " ", th.get_text()).strip()
                if key == "Description":
                    body = td.find("div", class_="style-2") or td
                    extra["description"] = description_text(body)
                elif key == "Department":
                    extra["department"] = _cell_text(td)
                elif key == "Dataset Link":
                    extra["dataset_link"] = _cell_text(td)
                elif key == "Contact info":
                    extra["contact"] = _cell_text(td)
                elif key == "Youtube Link":
                    extra["youtube"] = _cell_text(td)

        deadline = _cell_text(tds[7])
        # The ideas cell is "submitted/quota" (e.g. "0/500"), blank before the
        # portal opens submissions. Quota caps how crowded a statement can get.
        ideas_cell = _cell_text(tds[5])
        ideas_match = IDEAS_RE.match(ideas_cell)
        sno = _cell_text(tds[0])
        dataset_link = extra.get("dataset_link", "")

        records.append({
            "sno": int(sno) if sno.isdigit() else None,
            "ps_number": _cell_text(tds[4]),
            "title": title,
            "organization": _cell_text(tds[1]),
            "department": extra.get("department", ""),
            "category": _cell_text(tds[3]),
            "theme": _cell_text(tds[6]),
            "deadline": deadline,
            "deadline_date": parse_deadline(deadline),
            "ideas": int(ideas_match.group(1)) if ideas_match else None,
            "ideas_quota": int(ideas_match.group(2)) if ideas_match else None,
            "ideas_raw": ideas_cell,
            "dataset_link": dataset_link,
            "dataset_urls": urls_in(dataset_link),
            "contact": extra.get("contact", ""),
            "youtube": extra.get("youtube", ""),
            "description": extra.get("description", ""),
        })

    records.sort(key=lambda r: r["sno"] or 0)
    return records


# --- validation ----------------------------------------------------------

MOJIBAKE_LEFT = re.compile(r"Ã|â€|Â")


def validate(records: list[dict]) -> list[str]:
    errors = []
    if len(records) < MIN_RECORDS:
        errors.append(f"only {len(records)} records, expected >= {MIN_RECORDS}")

    seen = set()
    for r in records:
        rid = r["ps_number"] or f"sno:{r['sno']}"
        if not re.fullmatch(r"SIH\d+", r["ps_number"] or ""):
            errors.append(f"{rid}: bad ps_number")
        if r["ps_number"] in seen:
            errors.append(f"{rid}: duplicate ps_number")
        seen.add(r["ps_number"])
        if not r["title"]:
            errors.append(f"{rid}: empty title")
        if not r["organization"]:
            errors.append(f"{rid}: empty organization")
        if not r["theme"]:
            errors.append(f"{rid}: empty theme")
        if r["category"] not in ("Software", "Hardware"):
            errors.append(f"{rid}: category \"{r['category']}\"")
        if len(r["description"]) < 40:
            errors.append(f"{rid}: description too short ({len(r['description'])})")
        if not r["deadline_date"]:
            errors.append(f"{rid}: unparseable deadline \"{r['deadline']}\"")
        if MOJIBAKE_LEFT.search(r["title"] + r["description"]):
            errors.append(f"{rid}: leftover mojibake")
    return errors


def validate_against(records: list[dict], previous: list[dict], year: int) -> list[str]:
    """Guard against a truncated scrape of an edition we already track.

    The absolute floor cannot do this job: a partial page serving 205 of 226 rows
    would sail past any fixed threshold. Comparing against what we last saw for
    the *same* year catches it, while still allowing a new edition to start small.
    """
    prefix = f"SIH{str(year)[2:]}"
    prior = [r for r in previous if (r.get("ps_number") or "").startswith(prefix)]
    if not prior:
        return []
    floor = int(len(prior) * MAX_SHRINK)
    if len(records) < floor:
        return [
            f"got {len(records)} records but previously had {len(prior)} for "
            f"SIH {year} (floor {floor}) - refusing to overwrite, the page "
            "looks truncated"
        ]
    return []


# --- ideas history -------------------------------------------------------
# The portal only ever shows the *current* submitted-idea count, so crowding and
# velocity are unrecoverable after the fact. Append-only, changes-only: a missing
# date means "same as the last recorded value".


def append_history(records: list[dict], day: str, year: int) -> int:
    HISTORY.parent.mkdir(parents=True, exist_ok=True)

    previous = from_csv(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else []
    latest = {row["ps_number"]: row["ideas"] for row in previous}

    added = [
        {"ps_number": r["ps_number"], "date": day, "ideas": r["ideas"]}
        for r in records
        if r["ideas"] is not None and str(r["ideas"]) != latest.get(r["ps_number"])
    ]

    if added:
        body = to_csv(added, ["ps_number", "date", "ideas"])
        if previous:
            body = body.split("\n", 1)[1]  # drop the header when appending
            with HISTORY.open("a", encoding="utf-8", newline="") as handle:
                handle.write(body)
        else:
            HISTORY.write_text(body, encoding="utf-8", newline="")

    # One row per sample date, so re-running the same day overwrites rather than
    # appends. Sampled dates are how the sparse ideas.csv is read back; the year
    # column keeps a date unambiguous once the repo has seen more than one
    # edition.
    runs = from_csv(RUNS.read_text(encoding="utf-8")) if RUNS.exists() else []
    runs = [row for row in runs if row["date"] != day]
    # Rows written before the year column existed are stamped with the current
    # edition. Safe because a blank can only predate this change, and the repo
    # has not rolled over since — later rows always carry an explicit year.
    for row in runs:
        if not row.get("year"):
            row["year"] = year
    runs.append({
        "date": day,
        "year": year,
        "records": len(records),
        "total_ideas": sum(r["ideas"] or 0 for r in records),
    })
    runs.sort(key=lambda row: row["date"])
    RUNS.write_text(to_csv(runs, ["date", "year", "records", "total_ideas"]),
                    encoding="utf-8", newline="")

    return len(added)


# --- derived series ------------------------------------------------------


def build_series(history_rows: list[dict], sample_dates: list[str]) -> dict:
    """Sparse changes-only history -> per-PS series, carried forward."""
    by_ps: dict[str, list[tuple[str, int]]] = {}
    for row in history_rows:
        by_ps.setdefault(row["ps_number"], []).append((row["date"], int(row["ideas"])))

    out = {}
    for ps, points in by_ps.items():
        points.sort(key=lambda p: p[0])
        index, last, series = 0, None, []
        for day in sample_dates:
            while index < len(points) and points[index][0] <= day:
                last = points[index][1]
                index += 1
            if last is not None:
                series.append([day, last])
        out[ps] = series
    return out


def velocity(series: list, days: int = 7) -> int | None:
    """Ideas added over the trailing window, None with too little history."""
    if not series or len(series) < 2:
        return None
    last_date, last_count = series[-1]
    cutoff = (datetime.fromisoformat(last_date) - timedelta(days=days)).date().isoformat()
    base = next((point for point in reversed(series) if point[0] <= cutoff), None)
    if base is None:
        return None
    return last_count - base[1]


# --- changelog -----------------------------------------------------------

LABELS = {
    "title": "Title", "organization": "Organization", "department": "Department",
    "category": "Category", "theme": "Theme", "deadline": "Deadline",
    "ideas": "Submitted ideas", "ideas_quota": "Idea quota",
    "dataset_link": "Dataset link", "contact": "Contact info",
    "youtube": "YouTube link", "description": "Description",
}


def diff(next_records: list[dict], prev_records: list[dict]) -> dict:
    prev_by_id = {r["ps_number"]: r for r in prev_records}
    next_ids = {r["ps_number"] for r in next_records}

    added = [r for r in next_records if r["ps_number"] not in prev_by_id]
    removed = [r["ps_number"] for r in prev_records if r["ps_number"] not in next_ids]

    updated = []
    for r in next_records:
        before = prev_by_id.get(r["ps_number"])
        if not before:
            continue
        fields = [
            (key, before.get(key), r.get(key))
            for key in LABELS
            if str(before.get(key) or "") != str(r.get(key) or "")
        ]
        if fields:
            updated.append({"ps_number": r["ps_number"], "fields": fields})

    return {"added": added, "removed": removed, "updated": updated}


def _clip(value) -> str:
    if value is None or value == "":
        return "N/A"
    text = re.sub(r"\n+", " ", str(value))
    return f"{text[:197]}..." if len(text) > 200 else text


def write_changelog(next_records, prev_records, day: str, year: int) -> dict | None:
    d = diff(next_records, prev_records)
    if not (d["added"] or d["removed"] or d["updated"]):
        return None

    out = [
        f"# SIH {year} data update - {day}", "",
        f"- **Total:** {len(next_records)}",
        f"- **Added:** {len(d['added'])}",
        f"- **Removed:** {len(d['removed'])}",
        f"- **Updated:** {len(d['updated'])}", "",
    ]
    if d["added"]:
        out += ["## Added", ""]
        out += [f"- **{r['ps_number']}** - {r['title']} ({r['organization']}, {r['theme']})"
                for r in d["added"]]
        out.append("")
    if d["removed"]:
        out += ["## Removed", ""] + [f"- {ps}" for ps in d["removed"]] + [""]
    if d["updated"]:
        out += ["## Updated", ""]
        for entry in d["updated"]:
            out.append(f"### {entry['ps_number']}")
            for key, before, after in entry["fields"]:
                out.append(f"- **{LABELS[key]}:** `{_clip(before)}` -> `{_clip(after)}`")
            out.append("")

    directory = ROOT / "data" / "changelog"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{day}.md").write_text("\n".join(out), encoding="utf-8", newline="\n")
    return d


# --- artifacts -----------------------------------------------------------


def _link(text: str) -> str:
    urls = urls_in(text)
    if urls:
        return " ".join(f"[{u}]({u})" for u in urls)
    return text.strip() if text and text.strip() else "N/A"


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def write_markdown(records: list[dict], day: str, year: int) -> None:
    index = [
        f"# SIH {year} - problem statements", "",
        f"{len(records)} statements scraped from <{ps_url(year)}> (last update: {day}).", "",
        "Content: CC BY 4.0, source Smart India Hackathon (sih.gov.in).", "",
        "| S.No. | PS Number | Category | Theme | Organization | Title |",
        "|---|---|---|---|---|---|",
    ]

    for r in records:
        slug = re.sub(r"[^\w-]+", "_", r["ps_number"])
        ideas = "N/A" if r["ideas"] is None else f"{r['ideas']} / {r['ideas_quota']}"
        body = [
            f"# {r['ps_number']} - {r['title']}", "", "## Metadata", "",
            f"- **S.No.:** {r['sno']}",
            f"- **Organization:** {r['organization']}",
            f"- **Department:** {r['department'] or 'N/A'}",
            f"- **Category:** {r['category']}",
            f"- **Theme:** {r['theme']}",
            f"- **Deadline:** {r['deadline']}",
            f"- **Submitted ideas:** {ideas}",
            f"- **Dataset link:** {_link(r['dataset_link'])}",
            f"- **Contact:** {r['contact'] or 'N/A'}",
            f"- **YouTube:** {_link(r['youtube'])}",
            "", "## Description", "", "\n\n".join(paragraphs(r["description"])), "", "---",
            f"_Source: [sih.gov.in/sih{year}PS]({ps_url(year)}) | Scraped: {day} | "
            "License: CC BY 4.0_", "",
        ]
        _write(ROOT / "ps" / f"{slug}.md", "\n".join(body))
        index.append(
            f"| {r['sno']} | {r['ps_number']} | {r['category']} | {r['theme']} | "
            f"{r['organization']} | [{r['title']}]({slug}.md) |"
        )

    _write(ROOT / "ps" / "README.md", "\n".join(index) + "\n")


def _dump_json(path: Path, payload: dict) -> None:
    _write(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def write_data(records: list[dict], day: str, year: int) -> None:
    _dump_json(ROOT / "data" / "ps.json", {
        "generated_at": day, "year": year, "source": ps_url(year),
        "license": "CC-BY-4.0", "count": len(records), "statements": records,
    })
    _write(ROOT / "data" / "ps.csv", to_csv(records, COLUMNS))


def archive_previous_edition(previous: list[dict], year: int) -> str | None:
    """Preserve the outgoing edition before this year's data overwrites it.

    The portal deletes past editions, so an overwritten ps.json would be the
    last copy in existence outside git history. One file per retired edition
    keeps it available without complicating the site, which only ever shows the
    current year.
    """
    old_path = ROOT / "data" / "ps.json"
    if not previous or not old_path.exists():
        return None
    try:
        old = json.loads(old_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    old_year = old.get("year")
    if not old_year or old_year == year:
        return None

    target = ROOT / "data" / "archive" / f"ps-{old_year}.json"
    if target.exists():
        return None  # already archived, don't clobber it
    _dump_json(target, old)
    return str(target.relative_to(ROOT)).replace("\\", "/")


def prune_markdown(records: list[dict]) -> int:
    """Delete statement files from retired editions.

    write_markdown only ever writes the current year, so without this the ps/
    directory accumulates every past edition's files while the index lists only
    the current one — 452 files after one rollover, half of them orphaned.
    """
    keep = {re.sub(r"[^\w-]+", "_", r["ps_number"]) + ".md" for r in records}
    keep.add("README.md")
    removed = 0
    directory = ROOT / "ps"
    if not directory.exists():
        return 0
    for path in directory.glob("*.md"):
        if path.name not in keep:
            path.unlink()
            removed += 1
    return removed


def _ratio(numerator, denominator):
    """Ratio as a plain number. Integral values become int so JSON reads "0"
    rather than "0.0" — keeps the payload stable for consumers and diffs."""
    if numerator is None or not denominator:
        return None
    value = numerator / denominator
    return int(value) if value.is_integer() else value


# Words carried by nearly every statement, so they cost bytes without narrowing
# a search. Not a general stopword list — just the high-frequency filler here.
_SEARCH_STOP = frozenset("""
the and for with that this from are will can has have been they use used using
should must may also more than then them their there these those our your you
which such into its not but was were had who what when where how all any both
each other some only own same too very just about above after again against
own per via etc based system solution provide provided including include
""".split())

_WORD = re.compile(r"[a-z0-9]{3,}")


def _search_text(record: dict) -> str:
    """Deduplicated description keywords for client-side search.

    The full description is 556 KB across 226 statements and the browser only
    ever needs it to answer "does this statement mention X". Reducing it to a
    sorted unique word set cuts that to ~80 KB gzipped, and dropping words
    already present in the indexed metadata avoids paying for them twice.
    """
    meta = f"{record['title']} {record['theme']} {record['organization']} {record['department']}"
    meta_words = set(_WORD.findall(meta.lower()))
    words = {
        w for w in _WORD.findall(record["description"].lower())
        if w not in _SEARCH_STOP and w not in meta_words
    }
    return " ".join(sorted(words))


# Fields the browsing UI needs. Everything else (full description, blocks,
# contact, department) is only read while prerendering a detail page, so it goes
# in the server-only payload and never reaches the client bundle.
CLIENT_FIELDS = [
    "sno", "ps_number", "title", "organization", "category", "theme",
    "deadline", "deadline_date", "ideas", "ideas_quota", "dataset_urls",
]


def write_web_data(records: list[dict], day: str, year: int) -> None:
    """Two payloads, because they have different audiences.

    ps.json ships to every visitor, so it carries only what the list and search
    UI need — full descriptions and blocks would put 1.1 MB of duplicated text in
    the client bundle. detail.json is imported solely by the prerendered detail
    pages and the OG image route, both of which run at build time, so its size
    costs the visitor nothing.
    """
    history = from_csv(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else []
    runs = from_csv(RUNS.read_text(encoding="utf-8")) if RUNS.exists() else []
    # Only this edition's sample dates: including a retired year's dates would
    # stretch every sparkline back to before these statements existed.
    dates = sorted(row["date"] for row in runs if str(row.get("year") or year) == str(year))
    series = build_series(history, dates)

    client, detail = [], {}
    for r in records:
        s = series.get(r["ps_number"], [])
        client.append({
            **{k: r[k] for k in CLIENT_FIELDS},
            "excerpt": r["description"][:180].strip(),
            "search": _search_text(r),
            "fill_pct": _ratio(r["ideas"], r["ideas_quota"]),
            "ideas_7d": velocity(s, 7),
            "series": s,
        })
        detail[r["ps_number"]] = {
            "department": r["department"],
            "contact": r["contact"],
            "youtube": r["youtube"],
            "dataset_link": r["dataset_link"],
            "description": r["description"],
            # 180 of 226 descriptions carry real <br>/<b> structure; blocks
            # preserves it. The 46 with no markup stay a single block.
            "blocks": paragraphs(r["description"]),
        }

    web = ROOT / "web" / "src" / "data"
    _dump_json(web / "ps.json", {
        "generated_at": day, "year": year, "source": ps_url(year),
        "sample_dates": dates, "count": len(client), "statements": client,
    })
    _dump_json(web / "detail.json", detail)
    # Tiny header-only payload. Client components in the root layout need the
    # year and little else; importing it from ps.json would pull all 226
    # statements into every route's browser bundle, including detail pages that
    # never show the list.
    _dump_json(web / "meta.json", {
        "generated_at": day, "year": year, "source": ps_url(year),
        "count": len(client), "sample_dates": dates,
    })


# --- main ----------------------------------------------------------------


def load_existing() -> list[dict]:
    path = ROOT / "data" / "ps.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("statements", [])
    except (json.JSONDecodeError, OSError):
        return []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--year", type=int, default=None,
                        help="pin an edition instead of detecting the live one")
    parser.add_argument("--cache", metavar="FILE", help="parse a saved page, no network")
    parser.add_argument("--validate", action="store_true",
                        help="check the committed data and exit")
    parser.add_argument("--dry", action="store_true", help="parse and report, write nothing")
    args = parser.parse_args(argv)

    if args.validate:
        records = load_existing()
        if not records:
            print("no data/ps.json to validate - run the scraper first", file=sys.stderr)
            return 1
        errors = validate(records)
        if errors:
            print(f"FAIL ({len(errors)}):\n  " + "\n  ".join(errors[:20]))
            return 1
        print(f"OK: {len(records)} records valid")
        return 0

    previous = load_existing()
    year = args.year or (int(os.environ["SIH_YEAR"]) if os.environ.get("SIH_YEAR") else None)

    # Resolution order: --cache (offline) -> --year/SIH_YEAR (pinned) -> detect.
    if args.cache:
        html = (ROOT / args.cache).read_text(encoding="utf-8") \
            if not Path(args.cache).is_absolute() else Path(args.cache).read_text(encoding="utf-8")
        year = year or infer_year(html) or datetime.now(timezone.utc).year
    elif year:
        html = fetch_html(ps_url(year))
    else:
        year, html = detect_year(datetime.now(timezone.utc).year)

    records = parse(html)
    print(f"parsed {len(records)} statements for SIH {year}")

    errors = validate(records) + validate_against(records, previous, year)
    if errors:
        print(f"validation failed ({len(errors)}), nothing written:\n  "
              + "\n  ".join(errors[:20]), file=sys.stderr)
        return 1

    software = sum(1 for r in records if r["category"] == "Software")
    print(f"  {software} software / {len(records) - software} hardware, "
          f"{len({r['theme'] for r in records})} themes, "
          f"{len({r['organization'] for r in records})} organizations")

    if args.dry:
        print("--dry: no files written")
        return 0

    archived = archive_previous_edition(previous, year)
    write_data(records, TODAY, year)
    write_markdown(records, TODAY, year)
    pruned = prune_markdown(records)
    appended = append_history(records, TODAY, year)
    write_web_data(records, TODAY, year)  # after append_history so today is in the series
    d = write_changelog(records, previous, TODAY, year)

    print("wrote data/ps.json, data/ps.csv, ps/*.md, web/src/data/{ps,detail}.json")
    if archived:
        print(f"  archived the previous edition to {archived}")
    if pruned:
        print(f"  pruned {pruned} statement files from retired editions")
    print(f"  ideas history: +{appended} rows")
    if d:
        print(f"  changelog: +{len(d['added'])} / -{len(d['removed'])} / ~{len(d['updated'])}")
    else:
        print("  changelog: no changes")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError) as err:
        print(err, file=sys.stderr)
        sys.exit(1)
