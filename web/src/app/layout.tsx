import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { dataset } from "@/lib/data";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · SIH ${dataset.year}`,
  },
  description: `Search all ${dataset.count} Smart India Hackathon ${dataset.year} problem statements. Filters, deadlines, and crowding data. Unofficial mirror of sih.gov.in.`,
  openGraph: { type: "website", siteName: SITE_NAME },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t mt-16 py-6 px-4 text-center text-xs text-muted-foreground">
            Scraped from{" "}
            <a className="underline hover:text-foreground" href={dataset.source}>
              sih.gov.in
            </a>{" "}
            on {dataset.generated_at} · content CC BY 4.0, source Smart India Hackathon ·
            unofficial mirror, always confirm deadlines on the portal
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
