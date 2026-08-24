import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // static site: free to host, no backend to page anyone at 3am
  images: { unoptimized: true },
  trailingSlash: true,
  // The repo root has its own lockfile for the scraper; pin the app root so
  // Turbopack stops guessing between the two.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
