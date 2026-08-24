#!/usr/bin/env python3
"""Self-check for the scraper's pure functions. No network, no writes.

    python scripts/test_scrape.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import fix_mojibake, from_csv, paragraphs, parse_deadline, to_csv, urls_in
from scrape import count_rows, infer_year, parse, validate, validate_against, \
    build_series, velocity

# --- mojibake repair -----------------------------------------------------
assert fix_mojibake("AIâ€“driven") == "AI–driven"
assert fix_mojibake("itâ€™s") == "it’s"
assert fix_mojibake("â€œquotedâ€\x9d") == "“quoted”"
assert fix_mojibake("30Â°C") == "30°C"
assert fix_mojibake("already – fine") == "already – fine", "must not mangle clean text"
assert fix_mojibake("plain ascii") == "plain ascii"
assert fix_mojibake("") == ""

# --- deadlines -----------------------------------------------------------
assert parse_deadline("05 September 2026") == "2026-09-05"
assert parse_deadline("5 September 2026") == "2026-09-05"
assert parse_deadline("September 5 2026") is None
assert parse_deadline("") is None

# --- urls ----------------------------------------------------------------
assert urls_in("see https://a.com/x and http://b.in,") == ["https://a.com/x", "http://b.in"]
assert urls_in("none") == []

# --- csv round-trip, including the nasty cases ---------------------------
rows = [{"a": "x,y", "b": 'he said "hi"', "c": "line1\nline2"}, {"a": "", "b": "1", "c": None}]
assert from_csv(to_csv(rows, ["a", "b", "c"])) == [
    {"a": "x,y", "b": 'he said "hi"', "c": "line1\nline2"},
    {"a": "", "b": "1", "c": ""},
]

# --- parser against a fixture shaped like the real table -----------------
HTML = """<table id="dataTablePS"><tbody><tr>
  <td>1</td><td>Ministry of Xâ€“Y</td>
  <td><a href="#">Smart â€œthingâ€\x9d</a>
    <div id="ViewProblemStatement1"><table>
      <tr><th>Description</th><td><div class="style-2"><b>Background:</b><br><br>
      Line one of the problem background.<br><br><b>Expected Solution</b><br>
      Line two â€“ more detail.<br>a. First item<br>b. Second item</div></td></tr>
      <tr><th>Department</th><td>Dept Z</td></tr>
      <tr><th>Dataset Link</th><td>https://data.gov.in/set</td></tr>
      <tr><th>Contact info</th><td>a@b.in</td></tr>
      <tr><th>Youtube Link</th><td></td></tr>
    </table></div></td>
  <td>Software</td><td>SIH26001</td><td>0/500</td><td>Smart Automation</td>
  <td>05 September 2026</td>
</tr></tbody></table>"""

(r,) = parse(HTML)
assert r["ps_number"] == "SIH26001"
assert r["organization"] == "Ministry of X–Y"
assert r["title"] == "Smart “thing”"
assert r["department"] == "Dept Z"
assert r["ideas"] == 0
assert r["ideas_quota"] == 500
assert r["ideas_raw"] == "0/500"
assert r["deadline_date"] == "2026-09-05"
assert r["dataset_urls"] == ["https://data.gov.in/set"]

# <br> becomes a line break, <b> becomes a "Heading:" line — the structure the
# portal actually ships, rather than the flattened get_text() version.
assert r["description"].startswith("Background:\n\nLine one of the problem background.")
assert "\nExpected Solution:\n" in r["description"]
assert "\n" in r["description"], "must preserve source line breaks"

blocks = paragraphs(r["description"])
assert len(blocks) == 2, blocks
assert blocks[0].startswith("Background:")
assert blocks[1].startswith("Expected Solution:")
assert blocks[1].split("\n")[1:] == ["a. First item", "b. Second item"]

# --- validation gate -----------------------------------------------------
assert any("expected >=" in e for e in validate([r])), "short scrape must fail"

broken = {**r, "category": "Nope", "title": ""}
errs = validate([{**broken, "ps_number": f"SIH{i}"} for i in range(12)])
assert any("category" in e for e in errs)
assert any("empty title" in e for e in errs)
assert validate([{**r, "ps_number": f"SIH{i}"} for i in range(12)]) == []

# --- description re-blocking for unmarked text ---------------------------
wall = ("Background: Roads fail here. Description: Build a thing. "
        "The solution should: a. Collect data b. Predict risk "
        "Expected Solution: A platform with: • dashboards • alerts")
p = paragraphs(wall)
assert len(p) == 3, p
assert p[0].startswith("Background:")
assert p[1].startswith("Description:")
assert p[2].startswith("Expected Solution:"), "must not split inside 'Expected Solution'"
assert p[1].split("\n")[1:] == ["a. Collect data", "b. Predict risk"]
assert p[2].split("\n")[1:] == ["• dashboards", "• alerts"]
assert paragraphs("") == []
assert paragraphs("Just one sentence.") == ["Just one sentence."]
# A colon mid-sentence must not manufacture a heading break.
assert len(paragraphs("We need this: a fast Solution: now")) == 2

# Bullet-style headings, the form 104 of 226 statements use.
bullets = ("• Background In underwater exploration, AUVs rely on sonar. "
           "• Description Participants must design a payload. "
           "• Expected Solution A functional prototype with: • firmware • filters")
b = paragraphs(bullets)
assert len(b) == 3, b
assert b[0].startswith("Background: In underwater exploration")
assert b[2].split("\n")[1:] == ["• firmware", "• filters"]
assert len(paragraphs("Deliver: • a report • a demo")) == 1

# --- history series ------------------------------------------------------
dates = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-27"]
hist = [
    {"ps_number": "A", "date": "2026-08-20", "ideas": "0"},
    {"ps_number": "A", "date": "2026-08-22", "ideas": "9"},  # no row on the 21st
    {"ps_number": "B", "date": "2026-08-21", "ideas": "4"},  # first seen late
]
series = build_series(hist, dates)
assert series["A"] == [["2026-08-20", 0], ["2026-08-21", 0],
                       ["2026-08-22", 9], ["2026-08-27", 9]]
assert series["B"] == [["2026-08-21", 4], ["2026-08-22", 4], ["2026-08-27", 4]]

assert velocity(series["A"], 7) == 9
assert velocity(series["A"], 1) == 0
assert velocity([["2026-08-22", 5]], 7) is None, "single point has no velocity"
assert velocity([], 7) is None
assert velocity(None, 7) is None

# --- year handling -------------------------------------------------------
# Retired editions return HTTP 200 with full chrome and an empty table, so
# liveness has to be judged by row count, never by status code.
assert infer_year("<td>SIH26001</td>") == 2026
assert infer_year("<td>SIH27042</td>") == 2027
assert infer_year("<p>no statements here</p>") is None

RETIRED = ('<html><body><nav>Smart India Hackathon</nav>'
           '<table id="dataTablePS"><tbody></tbody></table></body></html>')
assert count_rows(RETIRED) == 0, "retired year must read as 0 rows"
assert count_rows(HTML) == 1, "live page must count its rows"
assert count_rows("not html at all") == 0

# --- regression gate -----------------------------------------------------
many = [{**r, "ps_number": f"SIH26{i:03d}"} for i in range(226)]
assert validate_against(many, many, 2026) == [], "same count passes"
assert validate_against(many[:210], many, 2026) == [], "a small dip is tolerated"

truncated = validate_against(many[:120], many, 2026)
assert len(truncated) == 1, "half a page must be rejected"
assert "truncated" in truncated[0]

new_edition = [{**r, "ps_number": f"SIH27{i:03d}"} for i in range(5)]
assert validate_against(new_edition, many, 2027) == [], "new edition may start small"

# --- rollover: archive + prune ------------------------------------------
# This path runs once a year, so it gets a test rather than a hope.
import json as _json
import tempfile
import scrape as _scrape

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    original_root = _scrape.ROOT
    _scrape.ROOT = root
    try:
        (root / "data").mkdir()
        (root / "ps").mkdir()

        # last year's state on disk
        old = {"year": 2026, "count": 2, "statements": [
            {"ps_number": "SIH26001"}, {"ps_number": "SIH26002"}]}
        (root / "data" / "ps.json").write_text(_json.dumps(old), encoding="utf-8")
        for name in ("SIH26001.md", "SIH26002.md", "README.md"):
            (root / "ps" / name).write_text("old", encoding="utf-8")

        current = [{"ps_number": "SIH27001"}]
        (root / "ps" / "SIH27001.md").write_text("new", encoding="utf-8")

        archived = _scrape.archive_previous_edition(old["statements"], 2027)
        assert archived == "data/archive/ps-2026.json", archived
        saved = _json.loads((root / "data" / "archive" / "ps-2026.json").read_text(encoding="utf-8"))
        assert saved["year"] == 2026 and saved["count"] == 2, "archive must be verbatim"

        # Same year must NOT archive — that would fire on every nightly run.
        (root / "data" / "ps.json").write_text(
            _json.dumps({"year": 2027, "count": 1, "statements": current}), encoding="utf-8")
        assert _scrape.archive_previous_edition(current, 2027) is None

        pruned = _scrape.prune_markdown(current)
        assert pruned == 2, f"expected 2 stale files removed, got {pruned}"
        left = sorted(p.name for p in (root / "ps").glob("*.md"))
        assert left == ["README.md", "SIH27001.md"], left
    finally:
        _scrape.ROOT = original_root

print("scrape self-check OK")
