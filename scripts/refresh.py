#!/usr/bin/env python3
"""Scrape, then commit and push if anything actually changed.

Intended for a scheduled task on a machine the portal serves. sih.gov.in returns
403 to GitHub's runners (Azure WAF, datacenter IPs), so the nightly refresh
cannot run in Actions — see .github/workflows/refresh.yml.

    python scripts/refresh.py            # scrape, commit, push
    python scripts/refresh.py --no-push  # commit locally only
    python scripts/refresh.py --dry       # scrape and report, touch nothing

Exit codes: 0 changed or clean, 1 the scrape failed (nothing was written).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACKED = ["data", "ps", "web/src/data"]


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--no-push", action="store_true", help="commit but do not push")
    parser.add_argument("--dry", action="store_true", help="scrape only, no writes")
    args = parser.parse_args(argv)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"[{stamp}] refresh starting")

    scrape = [sys.executable, str(ROOT / "scripts" / "scrape.py")]
    if args.dry:
        scrape.append("--dry")

    result = subprocess.run(scrape, cwd=ROOT, text=True)
    if result.returncode != 0:
        # The scraper refuses to write on a failed validation, so the committed
        # data is still intact. Surface it loudly rather than committing nothing
        # and looking successful.
        print("scrape failed - committed data left untouched", file=sys.stderr)
        return 1

    if args.dry:
        return 0

    if not (ROOT / ".git").exists():
        print("not a git repository - data written, nothing to commit")
        return 0

    if run("git", "diff", "--quiet", "--", *TRACKED, check=False).returncode == 0:
        print("no data changes - nothing to commit")
        return 0

    run("git", "add", *TRACKED)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run("git", "commit", "-m", f"data: refresh {today}")
    print(f"committed: data: refresh {today}")

    if args.no_push:
        print("--no-push: left the commit local")
        return 0

    push = run("git", "push", check=False)
    if push.returncode != 0:
        print(f"push failed:\n{push.stderr.strip()}", file=sys.stderr)
        return 1
    print("pushed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
