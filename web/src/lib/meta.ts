import raw from "@/data/meta.json";

/**
 * Dataset metadata with no statements attached — a few hundred bytes.
 *
 * Import this (not lib/data) from client components, especially anything in the
 * root layout. lib/data pulls the whole 226-statement list, so a single client
 * import there puts it in every route's browser bundle, including detail pages
 * that only ever render one statement.
 */
export const meta = raw as unknown as {
  generated_at: string;
  year: number;
  source: string;
  count: number;
  sample_dates: string[];
};

export const YEAR = meta.year;
export const SOURCE_URL = meta.source;
export const GENERATED_AT = meta.generated_at;
export const COUNT = meta.count;
