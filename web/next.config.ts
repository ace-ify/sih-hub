import type { NextConfig } from "next";

// GitHub Pages serves a project repo under /<repo>, so every asset and internal
// link needs that prefix. Left empty for root domains (Cloudflare Pages, a
// custom domain), where a prefix would break the same links.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  output: "export", // static site: free to host, no backend to page anyone at 3am
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  // The repo root has its own lockfile for the scraper; pin the app root so
  // Turbopack stops guessing between the two.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
