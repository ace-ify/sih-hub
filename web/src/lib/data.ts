import raw from "@/data/ps.json";
import type { Statement } from "./statement";

/**
 * The full list payload. Importing anything from this module pulls all 226
 * statements into the bundle, so client components should import lib/statement
 * (types + pure helpers) or lib/meta (year, counts) instead where they can.
 *
 * Full descriptions and rendered blocks live in detail.json — they are 1.1 MB of
 * text only the prerendered detail pages need. See lib/detail.ts.
 */
export const dataset = raw as unknown as {
  generated_at: string;
  /** SIH edition this data belongs to, e.g. 2026 */
  year: number;
  source: string;
  sample_dates: string[];
  count: number;
  statements: Statement[];
};

export const statements = dataset.statements;

export const themes = [...new Set(statements.map((s) => s.theme))].sort();
export const organizations = [...new Set(statements.map((s) => s.organization))].sort();

export const byId = new Map(statements.map((s) => [s.ps_number, s]));

export type { Statement } from "./statement";
export { daysLeft, crowding, opportunityScore } from "./statement";
export { YEAR, SOURCE_URL } from "./meta";
