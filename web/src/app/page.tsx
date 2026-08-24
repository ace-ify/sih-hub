import { Browse } from "@/components/browse";
import { dataset, statements } from "@/lib/data";

export default function Home() {
  const software = statements.filter((s) => s.category === "Software").length;
  const withData = statements.filter((s) => s.dataset_urls.length > 0).length;

  return (
    <>
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Every SIH {dataset.year} problem statement, searchable
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {dataset.count} statements from sih.gov.in — {software} software,{" "}
            {dataset.count - software} hardware, {withData} with datasets. Filter, shortlist, and
            see which ones are filling up before you commit a week to one.
          </p>
        </div>
      </section>
      <Browse />
    </>
  );
}
