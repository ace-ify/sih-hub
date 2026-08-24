import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { byId, statements, daysLeft, crowding, SOURCE_URL } from "@/lib/data";
import { detailOf } from "@/lib/detail";
import { similar } from "@/lib/search";
import { StatementActions } from "@/components/statement-actions";
import { Description } from "@/components/description";
import { Sparkline } from "@/components/sparkline";

export const dynamicParams = false; // static export: only the 226 known paths

export function generateStaticParams() {
  return statements.map((s) => ({ id: s.ps_number }));
}

export async function generateMetadata({ params }: PageProps<"/ps/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = byId.get(id);
  if (!s) return { title: "Not found" };
  const description = (detailOf(id)?.description ?? s.excerpt).slice(0, 160);
  return {
    title: s.title,
    description,
    openGraph: { title: `${s.ps_number} — ${s.title}`, description },
  };
}

export default async function StatementPage({ params }: PageProps<"/ps/[id]">) {
  const { id } = await params;
  const s = byId.get(id);
  if (!s) notFound();

  // Server component: safe to read the heavy payload here, it never ships.
  const d = detailOf(id);
  const left = daysLeft(s.deadline_date);
  const crowd = crowding(s);
  const related = similar(s);

  const meta: [string, React.ReactNode][] = [
    ["Organization", s.organization],
    ["Department", d?.department || "—"],
    ["Category", s.category],
    ["Theme", s.theme],
    ["Deadline", `${s.deadline}${left !== null && left >= 0 ? ` · ${left} days left` : ""}`],
    [
      "Submitted ideas",
      s.ideas === null ? "Not open yet" : `${s.ideas} of ${s.ideas_quota}${crowd ? ` · ${crowd.label}` : ""}`,
    ],
    [
      "Dataset",
      s.dataset_urls.length ? (
        <span className="flex flex-col gap-1">
          {s.dataset_urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline break-all">
              <Database className="size-3 shrink-0" />
              {u}
            </a>
          ))}
        </span>
      ) : (
        d?.dataset_link || "—"
      ),
    ],
    ["Contact", d?.contact || "—"],
  ];

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All statements
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-mono text-foreground">{s.ps_number}</span>
        <Badge variant={s.category === "Hardware" ? "secondary" : "outline"}>{s.category}</Badge>
        <span>{s.theme}</span>
        {left !== null && left <= 7 && left >= 0 && (
          <Badge variant="destructive">{left === 0 ? "closes today" : `${left}d left`}</Badge>
        )}
      </div>

      <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{s.title}</h1>

      <StatementActions s={s} detail={d} />

      <dl className="mt-6 grid gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[10rem_1fr]">
        {meta.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words sm:mb-0">{value}</dd>
          </div>
        ))}
      </dl>

      {s.series.length > 2 && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border p-4 text-sm">
          <Sparkline series={s.series} className="h-8 w-32 text-primary" />
          <div>
            <p className="font-medium">Idea inflow</p>
            <p className="text-xs text-muted-foreground">
              {s.ideas_7d === null ? "Tracking started recently" : `+${s.ideas_7d} in the last 7 days`}
            </p>
          </div>
        </div>
      )}

      <Separator className="my-8" />

      <h2 className="mb-3 text-lg font-medium">Description</h2>
      <Description blocks={d?.blocks ?? []} fallback={d?.description ?? s.excerpt} />

      <p className="mt-8 text-xs text-muted-foreground">
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          Verify on the official portal <ExternalLink className="size-3" />
        </a>
      </p>

      {related.length > 0 && (
        <>
          <Separator className="my-8" />
          <h2 className="mb-3 text-lg font-medium">Similar statements</h2>
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.ps_number}>
                <Link
                  href={`/ps/${r.ps_number}/`}
                  className="flex gap-2 rounded border p-3 text-sm hover:bg-accent/50"
                >
                  <span className="font-mono text-xs text-muted-foreground">{r.ps_number}</span>
                  <span className="min-w-0 flex-1">{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
