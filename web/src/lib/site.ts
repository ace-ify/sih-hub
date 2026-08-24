import { YEAR } from "./meta";

/**
 * Absolute site URL, needed for OG tags and the sitemap. Override at build time
 * with NEXT_PUBLIC_SITE_URL; the fallback only affects absolute URLs in
 * metadata, never routing.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

// Derived from the dataset, so a new SIH edition needs no code change.
export const SITE_NAME = `SIH ${YEAR} problem statements`;
export const SHORT_NAME = `SIH${YEAR}`;
