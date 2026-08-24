import { SOURCE_URL } from "./meta";
import type { Statement } from "./statement";

/**
 * Markdown for a single statement. Long-form fields are passed in rather than
 * imported: this runs in the browser, and importing detail.json here would pull
 * 1.2 MB of descriptions into the client bundle.
 */
export function statementToMarkdown(
  s: Statement,
  extra?: { department?: string; description?: string; dataset_link?: string }
): string {
  const body = extra?.description ?? s.excerpt;
  return [
    `# ${s.ps_number} — ${s.title}`,
    "",
    `- **Organization:** ${s.organization}`,
    `- **Department:** ${extra?.department || s.organization}`,
    `- **Category:** ${s.category}`,
    `- **Theme:** ${s.theme}`,
    `- **Deadline:** ${s.deadline}`,
    `- **Submitted ideas:** ${s.ideas === null ? "N/A" : `${s.ideas}/${s.ideas_quota}`}`,
    `- **Dataset:** ${s.dataset_urls.join(" ") || extra?.dataset_link || "N/A"}`,
    "",
    "## Description",
    "",
    body,
    "",
    `_Source: ${SOURCE_URL}_`,
  ].join("\n");
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const str = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  };
  return [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => esc(r[c])).join(",")),
  ].join("\n");
}

/** Browser-only: hand the user a file without a server round-trip. */
export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
