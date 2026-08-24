"use client";

import { useState } from "react";
import { Check, Copy, Share2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNote, useShortlist } from "@/lib/storage";
import { statementToMarkdown } from "@/lib/export";
import { SITE_URL } from "@/lib/site";
import type { Statement } from "@/lib/statement";
import type { StatementDetail } from "@/lib/detail";

/**
 * `detail` is passed down from the server component rather than imported here:
 * this is a client component, and importing detail.json would ship every full
 * description to the browser.
 */
export function StatementActions({ s, detail }: { s: Statement; detail?: StatementDetail }) {
  const { has, toggle } = useShortlist();
  const { note, save } = useNote(s.ps_number);
  const [copied, setCopied] = useState(false);
  const shortlisted = has(s.ps_number);

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(statementToMarkdown(s, detail));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareText = `${s.ps_number} — ${s.title} (${s.organization})`;
  // Built from SITE_URL rather than window.location so the href is identical in
  // the prerendered HTML and after hydration.
  const shareUrl = `${SITE_URL}/ps/${s.ps_number}/`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={shortlisted ? "default" : "outline"}
          size="sm"
          onClick={() => toggle(s.ps_number)}
        >
          <Star className={shortlisted ? "size-4 fill-current" : "size-4"} />
          {shortlisted ? "Shortlisted" : "Shortlist"}
        </Button>

        <Button variant="outline" size="sm" onClick={copyMarkdown}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy as Markdown"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <Share2 className="size-4" />
          Share
        </Button>
      </div>

      <details className="rounded-lg border px-3 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Private note {note ? "· saved" : ""}
        </summary>
        <Textarea
          value={note}
          onChange={(e) => save(e.target.value)}
          placeholder="Why this one? Team fit, risks, who owns what… stays in this browser."
          className="mt-2 min-h-24"
        />
      </details>
    </div>
  );
}
