"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Database, Clock } from "lucide-react";
import { crowding, daysLeft, type Statement } from "@/lib/statement";
import { ShortlistStar } from "@/components/site-header";
import { Sparkline } from "@/components/sparkline";

const TONE = {
  low: "text-emerald-600 dark:text-emerald-400",
  mid: "text-amber-600 dark:text-amber-400",
  high: "text-rose-600 dark:text-rose-400",
} as const;

export function StatementCard({ s }: { s: Statement }) {
  const left = daysLeft(s.deadline_date);
  const crowd = crowding(s);

  return (
    <Link
      href={`/ps/${s.ps_number}/`}
      className="group relative flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:border-foreground/25 hover:bg-accent/40"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{s.ps_number}</span>
            <Badge variant={s.category === "Hardware" ? "secondary" : "outline"}>
              {s.category}
            </Badge>
            <span className="truncate">{s.theme}</span>
          </div>
          <h3 className="mt-1.5 font-medium leading-snug group-hover:underline">{s.title}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{s.organization}</p>
        </div>
        <div className="-mr-2 -mt-2 shrink-0">
          <ShortlistStar id={s.ps_number} />
        </div>
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">{s.excerpt}</p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
        {left !== null && (
          <span className={left <= 7 && left >= 0 ? "text-rose-600 dark:text-rose-400" : ""}>
            <Clock className="mr-1 inline size-3" />
            {left < 0 ? "closed" : left === 0 ? "closes today" : `${left}d left`}
          </span>
        )}
        {s.ideas !== null && (
          <span className={crowd ? TONE[crowd.tone] : ""}>
            {s.ideas}/{s.ideas_quota} ideas
            {s.ideas_7d ? ` (+${s.ideas_7d}/wk)` : ""}
          </span>
        )}
        {s.series.length > 2 && <Sparkline series={s.series} className="h-3 w-12" />}
        {s.dataset_urls.length > 0 && (
          <span className="text-foreground/70">
            <Database className="mr-1 inline size-3" />
            dataset
          </span>
        )}
      </div>
    </Link>
  );
}
