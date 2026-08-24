/**
 * The Statement shape and the pure functions over it — deliberately free of any
 * data import. Client components that only need a helper (a card computing days
 * left, say) can import from here without dragging all 226 statements into
 * their route's browser bundle, which is what importing lib/data does.
 */
export type Statement = {
  sno: number;
  ps_number: string;
  title: string;
  organization: string;
  category: "Software" | "Hardware";
  theme: string;
  deadline: string;
  deadline_date: string | null;
  ideas: number | null;
  ideas_quota: number | null;
  dataset_urls: string[];
  /** first ~180 chars of the description, for card previews */
  excerpt: string;
  /** deduplicated description keywords, for client-side search only */
  search: string;
  /** submitted / quota, 0..1 — null before the portal opens submissions */
  fill_pct: number | null;
  /** ideas added over the trailing 7 days, null until there is enough history */
  ideas_7d: number | null;
  /** [date, count] pairs over every sampled date */
  series: [string, number][];
};

export function daysLeft(iso: string | null, from = new Date()): number | null {
  if (!iso) return null;
  const end = Date.parse(`${iso}T23:59:59+05:30`); // deadlines are IST end-of-day
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - from.getTime()) / 86_400_000);
}

/** Crowding label. Quota is the cap on submissions, so fill is the real signal. */
export function crowding(
  s: Statement
): { label: string; tone: "low" | "mid" | "high" } | null {
  if (s.fill_pct === null) return null;
  const pct = s.fill_pct;
  if (pct < 0.25) return { label: "Wide open", tone: "low" };
  if (pct < 0.6) return { label: "Filling up", tone: "mid" };
  return { label: "Crowded", tone: "high" };
}

/**
 * Ranks statements by how much room is left, tie-broken by slower recent
 * inflow. Only meaningful once ideas start landing; before that every PS is 0.
 */
export function opportunityScore(s: Statement): number {
  const room = s.fill_pct === null ? 1 : 1 - s.fill_pct;
  const heat = s.ideas_7d === null ? 0 : Math.min(s.ideas_7d / 50, 1);
  return room * 0.7 + (1 - heat) * 0.3;
}
