# SIH 2026 problem statements

All 226 Smart India Hackathon 2026 problem statements as JSON, CSV and Markdown,
plus a static search app — and a daily snapshot of idea-submission counts, which
the official portal does not keep.

**Unofficial.** Data is scraped from <https://sih.gov.in/sih2026PS>. Always confirm
deadlines and idea counts on the portal before you commit to a statement.

## What's here

| Path | Contents |
|---|---|
| `data/ps.json` | Canonical export — every field, one object per statement |
| `data/ps.csv` | Same data, spreadsheet-friendly |
| `data/archive/ps-<year>.json` | Retired editions, saved on rollover (the portal deletes them) |
| `data/history/ideas.csv` | Append-only idea counts per statement per day |
| `data/history/runs.csv` | One row per sample date, with its edition |
| `data/changelog/<date>.md` | Field-level diff for each day the data changed |
| `ps/SIH26xxx.md` | One Markdown file per statement, plus an index |
| `web/src/data/ps.json` | List + search payload shipped to browsers (468 KB) |
| `web/src/data/detail.json` | Full descriptions, build-time only (1.2 MB, never shipped) |
| `web/src/data/meta.json` | Year and counts, for client components (1 KB) |
| `web/` | Next.js static site (`output: "export"`) |
| `scripts/scrape.py` | Scraper, validator and artifact writer |
| `scripts/refresh.py` | Scrape + commit + push, for a scheduled task |
| `scripts/lib.py` | Pure helpers (text repair, CSV, description blocks) |
| `scripts/test_scrape.py` | Self-check — no network, no writes |

## What each visitor downloads

The site is a static export, so serving it is a file read — a CDN handles any
number of concurrent readers without a server, database or per-request work.
What matters instead is page weight, and the payload is split three ways so the
browser never receives text only the build needed:

| Page | First load (gzipped) |
|---|---|
| Home (list + search) | ~398 KB — includes all 226 statements for client-side search |
| Statement detail | ~214 KB — no statement list at all |
| Intel | ~207 KB |

Of the home page, ~114 KB is the dataset and the rest is React, Base UI, cmdk
and Fuse. Detail pages are the ones that get shared, so they carry the least.

Two rules keep it that way, and both are easy to undo by accident:

- Client components import `lib/statement` (types and pure functions) or
  `lib/meta` (year, counts), **never** `lib/data` — one client import of
  `lib/data` puts all 226 statements in that route's bundle.
- `lib/detail` is server-only. It holds every full description; importing it
  from a client component ships 1.2 MB to the browser.

## Why the history file exists

The portal shows a live `submitted/quota` count (for example `0/500`) and nothing
else — no history. Once a count changes, the previous value is gone. `ideas.csv`
is append-only and changes-only: a row is written when a statement's count
differs from the last recorded value, so a missing date means "unchanged". That
makes crowding and weekly inflow computable after the fact, which is the one
thing you cannot reconstruct later. Start collecting early or not at all.

## Keeping the data fresh

**The nightly scrape cannot run on GitHub Actions.** `sih.gov.in` sits behind a
Microsoft Azure Application Gateway that returns `403 Forbidden` to GitHub's
runner IPs. Verified 2026-08-24 from a California runner: every path including
the root domain, with full browser headers, from both `curl` and `urllib`. It is
an IP-range block, not a user-agent check, so spoofing headers does not help —
and working around a WAF is not the right move anyway.

So `refresh.yml` is dispatch-only, and the scrape runs from a machine the portal
serves. `scripts/refresh.py` does scrape → commit → push in one step:

```bash
python scripts/refresh.py            # scrape, commit, push if anything changed
python scripts/refresh.py --no-push  # commit locally only
python scripts/refresh.py --dry      # scrape and report, write nothing
```

Schedule it once a day. On Windows, Task Scheduler:

```
Program:   C:\path\to\repo\.venv\Scripts\python.exe
Arguments: C:\path\to\repo\scripts\refresh.py
Start in:  C:\path\to\repo
```

On Linux or macOS, cron — pick an off-hour minute, the portal is a government
host and every scheduler in the world fires at `:00`:

```
42 4 * * *  cd /path/to/repo && .venv/bin/python scripts/refresh.py >> refresh.log 2>&1
```

If you would rather keep it in CI, register a [self-hosted
runner](https://docs.github.com/en/actions/hosting-your-own-runners) on that
machine and flip `runs-on: ubuntu-latest` to `runs-on: self-hosted` in
`refresh.yml`, then uncomment the schedule. The workflow is otherwise ready.

Whichever route you pick, **start it before idea submissions open.** The portal
keeps no history, so a day not captured is a day lost permanently.

## Which year it tracks

The scraper follows whatever edition is currently live and does not keep an
archive — because the portal doesn't either. Retired years still answer with
HTTP 200, full site chrome and an **empty table** (verified: `sih2024PS` and
`sih2025PS` both return 200 with 0 rows), so liveness is judged by parsing the
table, never by status code.

On each run it probes next year, this year, then last year, and takes the first
edition that yields statements. When SIH 2027 goes up, the nightly job picks it
up with no code change. Override with `--year 2027` or `SIH_YEAR=2027` if the
URL scheme ever changes.

The practical consequence: past editions are unrecoverable once the portal drops
them. Whatever this repo captured is the only copy — same reasoning as the idea
history below.

### What happens to this year's data next year

On the first run that detects a new edition, the scraper:

1. copies the outgoing `data/ps.json` to `data/archive/ps-<old year>.json`, so
   the retired dataset survives even though the portal has deleted it;
2. deletes the previous edition's `ps/SIH*.md` files, which the index no longer
   links (without this the directory accumulates every past year);
3. keeps every row in `data/history/ideas.csv` — PS numbers are unique across
   editions, so the crowding history stays intact and unambiguous;
4. records the rollover in that day's changelog as the old statements removed and
   the new ones added.

The site only ever shows the current edition. Shortlists and notes are stored
under year-scoped `localStorage` keys, so a user does not return to a list of
statements that no longer exist.

### When the portal edits content mid-season

Every run diffs against the last one and writes `data/changelog/<date>.md` with
before/after values per field, so a moved deadline or reworded description is
recorded rather than silently overwritten. Idea counts additionally append to
`data/history/ideas.csv`, which is what makes velocity computable. A run that
changes nothing writes nothing, so the nightly job produces no commit on quiet
days.

## Usage

The scraper is Python (3.11+); the site is Next.js. They share nothing but the
generated JSON, so you can work on either alone.

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate elsewhere
pip install -r requirements.txt

python scripts/test_scrape.py   # self-check, no network
python scripts/scrape.py        # detect the live edition, regenerate everything
python scripts/scrape.py --validate   # re-check committed data, no network
```

Scraper flags:

```bash
python scripts/scrape.py --year 2027                # pin an edition
python scripts/scrape.py --cache .cache/page.html   # parse a saved page
python scripts/scrape.py --dry                      # parse and report, write nothing
```

The web app:

```bash
cd web
npm install
npm run dev
npm run build     # static export into web/out
```

Set `NEXT_PUBLIC_SITE_URL` at build time so OG tags and `sitemap.xml` carry the
real origin; it defaults to localhost and never affects routing.

Deployed on Cloudflare Pages, which builds `web/` and publishes `web/out`:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `out` |
| Root directory | `web` |
| Environment | `NEXT_PUBLIC_SITE_URL=https://<your-domain>` |

Hosting at a root domain matters: a project subpath (like GitHub Pages'
`user.github.io/repo/`) needs `basePath` and `assetPrefix` set, or every asset
404s.

> **Build on Linux for releases.** Next 16.3.2's exporter uses `path.relative`
> when naming per-segment prefetch payloads, so on Windows it writes
> `intel/__next.intel/__PAGE__.txt` where the client requests
> `intel/__next.intel.__PAGE__.txt`. Navigation still works (it falls back to a
> full route fetch), but you get 404 noise in the console. The CI workflow builds
> on `ubuntu-latest`, which emits the correct flat filenames.

`scripts/scrape.py` writes `web/src/data/ps.json` too, with derived fields
(`blocks`, `fill_pct`, `ideas_7d`, `series`) baked in so the client does no
parsing or date maths.

## Validation gate

The scraper refuses to write anything unless the parse passes every check:
unique well-formed PS numbers, non-empty title / organization / theme, a known
category, a parseable deadline, a description over 40 characters, and no
leftover mojibake.

There is also a regression check, which is the one that matters in practice: a
rescrape must retain at least 90% of the records last seen **for the same
edition**. A fixed floor can't catch this — a partial page serving 205 of 226
rows sails past any absolute threshold. The relative gate rejects it while still
letting a brand-new edition start with a handful of statements and grow.

## Notes on the source data

- The page serves UTF-8 that was already decoded as CP1252 once, so `–` arrives
  as `â€“`. The fix reverses the transform (char → CP1252 byte → decode UTF-8)
  rather than pattern-matching known sequences.
- Descriptions carry real structure in the markup: 180 of 226 use `<br>` for
  line breaks and 75 use `<b>` for section headings. The scraper walks the DOM
  to preserve it — Cheerio's `.text()` silently drops both. The remaining 46
  statements have no markup at all, so they stay a single block rather than
  having breaks invented for them by heuristics.
- `Youtube Link` and `Contact info` are empty for all 226 statements. Dataset
  links are present on 42, of which 15 contain a URL.

## Licence

Code (`scripts/`, `web/`, workflows): MIT — see [LICENSE](LICENSE).

Dataset (`data/`, `ps/`, `web/src/data/`): CC BY 4.0, *Source: Smart India
Hackathon, sih.gov.in* — see [LICENSE-DATA](LICENSE-DATA).

