import type { Metadata } from "next";
import Link from "next/link";
import { dataset, statements, opportunityScore, crowding } from "@/lib/data";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Competition intel",
  description:
    "Which SIH problem statements are filling up and which are still wide open, tracked daily.",
};

function Row({ s, note }: { s: (typeof statements)[number]; note?: string }) {
  const crowd = crowding(s);
  return (
    <li className="flex items-center gap-3 border-b py-2 text-sm last:border-0">
      <Link href={`/ps/${s.ps_number}/`} className="min-w-0 flex-1 hover:underline">
        <span className="font-mono text-xs text-muted-foreground">{s.ps_number}</span>{" "}
        {s.title}
      </Link>
      {s.series.length > 2 && <Sparkline series={s.series} className="h-4 w-16 shrink-0 text-primary" />}
      <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
        {note ?? (s.ideas === null ? "—" : `${s.ideas}/${s.ideas_quota}`)}
      </span>
      {crowd && (
        <Badge variant="outline" className="hidden w-24 shrink-0 justify-center sm:flex">
          {crowd.label}
        </Badge>
      )}
    </li>
  );
}

export default function IntelPage() {
  const tracking = dataset.sample_dates.length;
  const open = statements.some((s) => s.ideas !== null && s.ideas > 0);

  const leastCrowded = [...statements]
    .sort((a, b) => opportunityScore(b) - opportunityScore(a))
    .slice(0, 15);
  const mostCrowded = [...statements]
    .filter((s) => s.ideas !== null)
    .sort((a, b) => (b.fill_pct ?? 0) - (a.fill_pct ?? 0))
    .slice(0, 15);
  const fastest = [...statements]
    .filter((s) => s.ideas_7d !== null && s.ideas_7d > 0)
    .sort((a, b) => (b.ideas_7d ?? 0) - (a.ideas_7d ?? 0))
    .slice(0, 15);

  const byTheme = [...new Set(statements.map((s) => s.theme))]
    .map((theme) => {
      const rows = statements.filter((s) => s.theme === theme);
      const ideas = rows.reduce((n, s) => n + (s.ideas ?? 0), 0);
      const quota = rows.reduce((n, s) => n + (s.ideas_quota ?? 0), 0);
      return { theme, count: rows.length, ideas, fill: quota ? ideas / quota : 0 };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Competition intel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The portal only ever shows today&apos;s idea count, so we snapshot it daily and keep the
        history. {tracking} {tracking === 1 ? "day" : "days"} tracked so far.
      </p>

      {!open ? (
        <div className="mt-6 rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Idea submissions haven&apos;t opened yet.</p>
          <p className="mt-1 text-muted-foreground">
            Every statement currently sits at 0 of its quota, so there is nothing to rank — a
            &ldquo;least crowded&rdquo; list today would just be PS number order pretending to be
            insight. Tracking is already running; crowding and weekly inflow appear here as soon
            as counts move.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="mb-1 font-medium">Most room left</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Ranked by remaining quota, then by slower recent inflow.
            </p>
            <ul>{leastCrowded.map((s) => <Row key={s.ps_number} s={s} />)}</ul>
          </section>

          {fastest.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-1 font-medium">Filling fastest this week</h2>
              <p className="mb-2 text-xs text-muted-foreground">Ideas added over the last 7 days.</p>
              <ul>
                {fastest.map((s) => (
                  <Row key={s.ps_number} s={s} note={`+${s.ideas_7d}/wk`} />
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-1 font-medium">Most crowded</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Highest share of quota already used.
            </p>
            <ul>{mostCrowded.map((s) => <Row key={s.ps_number} s={s} />)}</ul>
          </section>
        </>
      )}

      <section className="mt-8">
        <h2 className="mb-2 font-medium">By theme</h2>
        <ul className="text-sm">
          {byTheme.map((t) => (
            <li key={t.theme} className="flex items-center gap-3 border-b py-2 last:border-0">
              <span className="min-w-0 flex-1 truncate">{t.theme}</span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {t.count} PS
              </span>
              {open && (
                <>
                  <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                    {t.ideas} ideas
                  </span>
                  <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded bg-muted sm:block">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.round(t.fill * 100)}%` }}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
