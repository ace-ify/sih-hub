import type { MetadataRoute } from "next";
import { statements } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, priority: 1 },
    { url: `${SITE_URL}/intel/`, priority: 0.8 },
    ...statements.map((s) => ({
      url: `${SITE_URL}/ps/${s.ps_number}/`,
      priority: 0.6,
    })),
  ];
}
