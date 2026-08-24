"use client";

import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { byId, YEAR } from "@/lib/data";
import { useShortlist } from "@/lib/storage";
import { StatementCard } from "@/components/statement-card";
import { download, toCsv, statementToMarkdown } from "@/lib/export";

const CSV_COLUMNS = [
  "ps_number", "title", "organization", "category", "theme", "deadline", "ideas", "ideas_quota",
];

export function ShortlistView() {
  const { ids, clear } = useShortlist();
  const picked = ids.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Shortlist</h1>
        <span className="text-sm text-muted-foreground">{picked.length} saved</span>
        {picked.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => download(`sih${YEAR}-shortlist.csv`, toCsv(picked, CSV_COLUMNS), "text/csv")}
            >
              <Download className="size-4" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  `sih${YEAR}-shortlist.md`,
                  picked.map((s) => statementToMarkdown(s)).join("\n\n---\n\n"),
                  "text/markdown"
                )
              }
            >
              <Download className="size-4" /> Markdown
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4" /> Clear
            </Button>
          </div>
        )}
      </div>

      {picked.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing shortlisted yet. Star statements from{" "}
          <Link href="/" className="underline">
            the list
          </Link>{" "}
          — they stay in this browser, no account needed.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {picked.map((s) => (
            <StatementCard key={s.ps_number} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
