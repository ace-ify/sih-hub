"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { statements, themes, organizations } from "@/lib/data";
import { search, sortStatements, emptyFilters, type Filters, type SortKey } from "@/lib/search";
import { StatementCard } from "@/components/statement-card";
import { CommandPalette } from "@/components/command-palette";

const PAGE = 24;

const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Best match",
  opportunity: "Least crowded",
  deadline: "Deadline soonest",
  ideas: "Most ideas",
  ps: "PS number",
};

/** Multi-select checkbox column, used for themes and organizations. */
function FacetList({
  options,
  selected,
  onToggle,
  counts,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  counts: Map<string, number>;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => (
        <label
          key={o}
          className="flex cursor-pointer items-center gap-2 text-sm hover:text-foreground"
        >
          <Checkbox checked={selected.includes(o)} onCheckedChange={() => onToggle(o)} />
          <span className="flex-1 leading-tight">{o}</span>
          <span className="text-xs text-muted-foreground">{counts.get(o) ?? 0}</span>
        </label>
      ))}
    </div>
  );
}

export function Browse() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [limit, setLimit] = useState(PAGE);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const deferredQuery = useDeferredValue(filters.query);
  const results = useMemo(
    () => sortStatements(search({ ...filters, query: deferredQuery }), sort),
    [filters, deferredQuery, sort]
  );

  // Facet counts reflect the query and the *other* facets, but not the facet's
  // own selection — otherwise ticking one theme zeroes every other row.
  const counts = useMemo(() => {
    const forFacet = (drop: Partial<Filters>) =>
      search({ ...filters, query: deferredQuery, ...drop });

    const theme = new Map<string, number>();
    for (const s of forFacet({ themes: [] })) {
      theme.set(s.theme, (theme.get(s.theme) ?? 0) + 1);
    }
    const org = new Map<string, number>();
    for (const s of forFacet({ organizations: [] })) {
      org.set(s.organization, (org.get(s.organization) ?? 0) + 1);
    }
    const category = new Map<string, number>();
    for (const s of forFacet({ categories: [] })) {
      category.set(s.category, (category.get(s.category) ?? 0) + 1);
    }
    return { theme, org, category };
  }, [filters, deferredQuery]);

  // Reset paging when the result set changes. setState-during-render is the
  // supported way to derive state from a changing key; an effect here would
  // render the stale page count first.
  const resultKey = `${deferredQuery}|${sort}|${filters.themes}|${filters.categories}|${filters.organizations}|${filters.datasetOnly}`;
  const [prevKey, setPrevKey] = useState(resultKey);
  if (prevKey !== resultKey) {
    setPrevKey(resultKey);
    setLimit(PAGE);
  }

  // "/" focuses search, ⌘K/Ctrl+K opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (key: "themes" | "categories" | "organizations") => (v: string) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v],
    }));

  const activeCount =
    filters.themes.length +
    filters.categories.length +
    filters.organizations.length +
    (filters.datasetOnly ? 1 : 0);

  const facets = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Category
        </p>
        <FacetList
          options={["Software", "Hardware"]}
          selected={filters.categories}
          onToggle={toggle("categories")}
          counts={counts.category}
        />
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={filters.datasetOnly}
            onCheckedChange={(v) => setFilters((f) => ({ ...f, datasetOnly: v === true }))}
          />
          Has a dataset link
        </label>
      </div>
      <Separator />
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Theme
        </p>
        <FacetList
          options={themes}
          selected={filters.themes}
          onToggle={toggle("themes")}
          counts={counts.theme}
        />
      </div>
      <Separator />
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Organization
        </p>
        <FacetList
          options={organizations}
          selected={filters.organizations}
          onToggle={toggle("organizations")}
          counts={counts.org}
        />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* CommandDialog keeps its sr-only title/description mounted even when
          closed, so only render it once opened. */}
      {paletteOpen && <CommandPalette open onOpenChange={setPaletteOpen} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Search titles, orgs, themes, descriptions…  (press /)"
            className="pl-9"
            aria-label="Search problem statements"
          />
          {filters.query && (
            <button
              onClick={() => setFilters((f) => ({ ...f, query: "" }))}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[190px]" aria-label="Sort">
            <SelectValue>{(v: SortKey) => SORT_LABELS[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Sheet>
          <SheetTrigger
            render={
              <Button variant="outline" className="lg:hidden">
                <SlidersHorizontal className="size-4" />
                Filters
                {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
              </Button>
            }
          />
          <SheetContent side="left" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-8">{facets}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {results.length} of {statements.length}
        </span>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilters((f) => ({ ...emptyFilters, query: f.query }))}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="mt-4 flex gap-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
            {facets}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {results.length === 0 ? (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nothing matches. Try fewer filters or a shorter query.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.slice(0, limit).map((s) => (
                  <StatementCard key={s.ps_number} s={s} />
                ))}
              </div>
              {limit < results.length && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, results.length - limit)} more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
