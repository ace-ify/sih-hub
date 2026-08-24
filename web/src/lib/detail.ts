import raw from "@/data/detail.json";

/**
 * Long-form fields, keyed by PS number.
 *
 * Import this ONLY from server components and build-time routes (the detail
 * page, its OG image). It carries every full description — 1.2 MB — so any
 * client component that touches it drags the whole thing into the browser
 * bundle, which is exactly what splitting it out was meant to prevent.
 */
export type StatementDetail = {
  department: string;
  contact: string;
  youtube: string;
  dataset_link: string;
  description: string;
  /** description re-split into blocks; first line may be a "Heading:" */
  blocks: string[];
};

export const details = raw as unknown as Record<string, StatementDetail>;

export function detailOf(psNumber: string): StatementDetail | undefined {
  return details[psNumber];
}
