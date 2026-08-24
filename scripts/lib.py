"""Shared helpers for the SIH scraper.

Kept separate from scrape.py so test_scrape.py can exercise the pure functions
without touching the network or the filesystem.
"""

from __future__ import annotations

import csv
import io
import re

# --- text repair ---------------------------------------------------------

# The portal serves UTF-8 bytes that were already decoded as CP1252 once, so
# multi-byte characters arrive as mojibake ("â€“" instead of "–"). Reverse it by
# mapping each character back to the byte it came from, then decoding as UTF-8.
#
# Python's cp1252 codec cannot do this alone: bytes 0x81, 0x8D, 0x8F, 0x90 and
# 0x9D are undefined in CP1252, so .encode("cp1252") raises on them — and 0x9D is
# exactly the third byte of a right double quote (U+201D -> E2 80 9D). Those
# arrive as raw C1 control characters, so anything below U+0100 is passed through
# as its own byte value and only the 27 printable CP1252 extras need a lookup.
_CP1252_HIGH = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
    "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8A, "‹": 0x8B, "Œ": 0x8C,
    "Ž": 0x8E, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
    "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B,
    "œ": 0x9C, "ž": 0x9E, "Ÿ": 0x9F,
}

_MOJIBAKE_RUN = re.compile(
    "[Â-ô]["
    "-¿"
    "€‚ƒ„…†‡ˆ‰Š‹Œ"
    "Ž‘’“”•–—˜™š›"
    "œžŸ"
    "]+"
)


def fix_mojibake(text: str) -> str:
    """Repair CP1252-double-encoded UTF-8. Leaves already-correct text alone."""
    if not text:
        return text

    def repair(match: re.Match[str]) -> str:
        run = match.group(0)
        out = bytearray()
        for char in run:
            code = ord(char)
            byte = code if code < 0x100 else _CP1252_HIGH.get(char)
            if byte is None:
                return run  # not reversible, keep the original
            out.append(byte)
        try:
            return out.decode("utf-8")  # only accept a clean round-trip
        except UnicodeDecodeError:
            return run

    return _MOJIBAKE_RUN.sub(repair, text)


# --- deadlines -----------------------------------------------------------

_MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]
_DEADLINE = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$")


def parse_deadline(text: str) -> str | None:
    """"05 September 2026" -> "2026-09-05". None when unparseable."""
    match = _DEADLINE.match((text or "").strip())
    if not match:
        return None
    day, month_name, year = match.groups()
    try:
        month = _MONTHS.index(month_name.lower()) + 1
    except ValueError:
        return None
    return f"{year}-{month:02d}-{int(day):02d}"


_URL = re.compile(r"https?://[^\s,;)<>\"']+")


def urls_in(text: str) -> list[str]:
    """Every http(s) URL in a free-text cell."""
    return _URL.findall(text or "")


# --- csv -----------------------------------------------------------------
# The stdlib module handles quoting and embedded newlines, so there is no
# hand-rolled parser to get wrong.


def to_csv(rows: list[dict], columns: list[str]) -> str:
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(
        buf, fieldnames=columns, extrasaction="ignore", lineterminator="\n"
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({c: "" if row.get(c) is None else row.get(c) for c in columns})
    return buf.getvalue()


def from_csv(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text, newline="")))


# --- description blocks --------------------------------------------------
# Most descriptions arrive with real structure in the markup (<br> and <b>),
# which scrape.py preserves. The functions below are the FALLBACK for the
# statements that arrive as one unbroken run of text with no markup at all.

SECTION_WORDS = [
    "Background", "Detailed Description", "Description", "Problem Statement",
    "Expected Solution", "Expected Outcome", "Expected Outcomes", "Expected Output",
    "Solution", "Objective", "Objectives", "Deliverables", "Impact", "Scope",
    "Challenge", "Challenges", "Requirements", "Technical Requirements",
    "Key Features", "Features", "Constraints", "Assumptions", "Dataset",
    "Acceptance Criteria", "Evaluation Criteria", "Use Cases", "Stakeholders",
    "Technology Stack", "Note", "Notes",
]

# Words that only ever prefix a longer heading ("Expected Solution"). Without the
# negative lookbehind the inner "Solution:" also matches and orphans them.
QUALIFIERS = ["Expected", "Detailed", "Technical", "Key", "Acceptance", "Evaluation"]

# Longest-first so "Expected Outcomes" wins over "Expected Outcome".
_SECTION_ALT = "|".join(sorted(SECTION_WORDS, key=len, reverse=True))
_QUALIFIER_ALT = "|".join(QUALIFIERS)

# Two heading styles appear: "Background:" (colon) and "• Background In ..."
# (bullet, no colon).
#
# Unlike the zero-width-lookahead approach, this CONSUMES the whole heading
# including its optional qualifier, so "Expected Solution:" is matched as one
# unit and the inner "Solution:" can never match separately. Python's re only
# supports fixed-width lookbehind, and this sidesteps the need for one.
#
# A colon is REQUIRED without a bullet. Allowing bare "Word + Capital" here
# splits prose: "...Scope of the Solution The proposed system..." would break
# before "Solution" mid-sentence. Only a bullet licenses the colonless form.
_SECTION_RE = re.compile(
    rf"\s+((?:{_QUALIFIER_ALT})\s+)?({_SECTION_ALT})\s*:"
)
_BULLET_SECTION_RE = re.compile(
    rf"\s+[•▪●·]\s*((?:{_QUALIFIER_ALT})\s+)?({_SECTION_ALT})(\s*:|\s+(?=[A-Z(]))"
)


def _break_before_heading(match: re.Match[str]) -> str:
    qualifier = (match.group(1) or "").strip()
    label = f"{qualifier} {match.group(2)}".strip()
    return f"\n\n{label}:"


_LEADING_BULLET_RE = re.compile(
    rf"^[•▪●·]\s*((?:{_QUALIFIER_ALT})\s+)?({_SECTION_ALT})(\s*:|\s+(?=[A-Z(]))"
)


def _break_before_heading_at_start(match: re.Match[str]) -> str:
    return _break_before_heading(match).lstrip("\n")


# "a." / "b)" / "1." / "iv." at a word boundary, and bullet characters.
_ENUM_RE = re.compile(
    r"\s+(?=(?:[a-z]|[ivx]{1,4}|\d{1,2})[.)]\s+[A-Z(])|\s+(?=[•▪●·]\s*)"
)

_HEADING_RE = re.compile(
    rf"^[•▪●·]?\s*((?:(?:{_QUALIFIER_ALT})\s+)?(?:{_SECTION_ALT}))(?::|\s+(?=[A-Z(]))"
)


def paragraphs(text: str) -> list[str]:
    """Split a description into blocks of "Heading: text" plus enumerated lines."""
    if not text:
        return []

    # When the source gave us real <br>/<b> structure, trust it: split on the
    # blank lines already present. The regex pass is only for unmarked text.
    if "\n\n" in text:
        source = text
    else:
        source = _BULLET_SECTION_RE.sub(_break_before_heading, text)
        source = _SECTION_RE.sub(_break_before_heading, source)
        # A heading at position 0 has no preceding whitespace for the patterns
        # above to consume, so handle a leading bullet separately rather than
        # leaving it behind as an empty first block.
        source = _LEADING_BULLET_RE.sub(_break_before_heading_at_start, source, count=1)

    lines = [line.strip() for line in _ENUM_RE.sub("\n", source).split("\n")]
    lines = [line for line in lines if line]

    blocks: list[dict] = []
    for line in lines:
        head = _HEADING_RE.match(line)
        if head:
            lead = line[head.end():].strip()
            blocks.append({"head": head.group(1), "lines": [lead] if lead else []})
        elif not blocks:
            blocks.append({"head": None, "lines": [line]})
        else:
            blocks[-1]["lines"].append(line)

    out = []
    for block in blocks:
        if block["head"]:
            first = f"{block['head']}: {block['lines'][0] if block['lines'] else ''}".strip()
            out.append("\n".join([first, *block["lines"][1:]]))
        else:
            out.append("\n".join(block["lines"]))
    return out

