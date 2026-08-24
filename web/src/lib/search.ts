import Fuse from "fuse.js";
import { statements, opportunityScore, type Statement } from "./data";

// Two-stage index. Fuzzy matching is confined to the short fields, where a typo
// is likely and a false positive is cheap. Descriptions run up to 12k chars —
// fuzzy scoring over that much text matches almost anything ("groundwater" hit
// a cryptography tool), so they are searched by literal token containment.
const fuse = new Fuse(statements, {
  keys: [
    { name: "ps_number", weight: 3 },
    { name: "title", weight: 3 },
    { name: "theme", weight: 1.5 },
    { name: "organization", weight: 1.5 },
    { name: "department", weight: 0.5 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

const haystacks = new Map(statements.map((s) => [s.ps_number, s.search]));

/**
 * Every query token must appear in the description keywords.
 *
 * `search` is a deduplicated word set, not prose, so this matches words rather
 * than phrases — "crop disease" finds statements containing both words, in any
 * order or position. That is what the previous substring scan over full text
 * effectively did anyway, at a fifth of the bytes.
 */
function descriptionMatches(query: string): Statement[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return [];
  return statements.filter((s) => {
    const hay = haystacks.get(s.ps_number) ?? "";
    return tokens.every((t) => hay.includes(t));
  });
}

function rank(query: string): Statement[] {
  const q = query.trim();
  if (!q) return statements;

  // A PS-number query is an identifier lookup, not a fuzzy one — every PS
  // shares the "SIH26" prefix, so fuzzy matching returns most of the dataset.
  // Bare digits ("26040") are treated the same way.
  if (/^(?:sih)?\s*\d{3,}$/i.test(q)) {
    const needle = q.replace(/\s+/g, "").toUpperCase();
    return statements.filter((s) => s.ps_number.includes(needle));
  }

  const seen = new Set<string>();
  const out: Statement[] = [];
  for (const s of [...fuse.search(q).map((r) => r.item), ...descriptionMatches(q)]) {
    if (seen.has(s.ps_number)) continue;
    seen.add(s.ps_number);
    out.push(s);
  }
  return out;
}

export type Filters = {
  query: string;
  themes: string[];
  categories: string[];
  organizations: string[];
  datasetOnly: boolean;
};

export const emptyFilters: Filters = {
  query: "",
  themes: [],
  categories: [],
  organizations: [],
  datasetOnly: false,
};

export type SortKey = "relevance" | "deadline" | "opportunity" | "ideas" | "ps";

export function search(filters: Filters): Statement[] {
  // rank() orders by relevance; with no query keep the portal's own ordering.
  let hits = rank(filters.query);

  if (filters.themes.length) hits = hits.filter((s) => filters.themes.includes(s.theme));
  if (filters.categories.length) hits = hits.filter((s) => filters.categories.includes(s.category));
  if (filters.organizations.length)
    hits = hits.filter((s) => filters.organizations.includes(s.organization));
  if (filters.datasetOnly) hits = hits.filter((s) => s.dataset_urls.length > 0);

  return hits;
}

export function sortStatements(list: Statement[], key: SortKey): Statement[] {
  if (key === "relevance") return list;
  const out = [...list];
  switch (key) {
    case "deadline":
      // Statements without a parsed deadline sink to the bottom.
      return out.sort((a, b) =>
        (a.deadline_date ?? "9999").localeCompare(b.deadline_date ?? "9999"));
    case "opportunity":
      return out.sort((a, b) => opportunityScore(b) - opportunityScore(a));
    case "ideas":
      return out.sort((a, b) => (b.ideas ?? -1) - (a.ideas ?? -1));
    case "ps":
      return out.sort((a, b) => a.ps_number.localeCompare(b.ps_number));
  }
}

/** Nearest statements by shared theme (weighted) plus rare-word title overlap. */
const words = (s: Statement) =>
  new Set((`${s.title} ${s.theme}`.toLowerCase().match(/[a-z]{4,}/g) ?? []));

// Document frequency over the 226 titles. "system", "based" and "platform"
// appear in a large share of them and carry almost no signal, so each shared
// word is weighted by rarity rather than filtered against a hardcoded stoplist.
const docFreq = (() => {
  const freq = new Map<string, number>();
  for (const s of statements) for (const w of words(s)) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
})();

export function similar(s: Statement, n = 5): Statement[] {
  const mine = words(s);
  return statements
    .filter((o) => o.ps_number !== s.ps_number)
    .map((o) => {
      let score = o.theme === s.theme ? 3 : 0;
      for (const w of words(o)) {
        if (!mine.has(w)) continue;
        score += statements.length / (statements.length + (docFreq.get(w) ?? 1) * 10);
      }
      return { o, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.o);
}
