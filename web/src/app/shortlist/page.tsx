import type { Metadata } from "next";
import { ShortlistView } from "@/components/shortlist-view";

// The view is client-only (localStorage), so the page stays a server component
// purely to own the metadata.
export const metadata: Metadata = {
  title: "Shortlist",
  description: "Problem statements you've starred, exportable to CSV or Markdown.",
};

export default function ShortlistPage() {
  return <ShortlistView />;
}
