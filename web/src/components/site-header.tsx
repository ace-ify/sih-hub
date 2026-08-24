"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShortlist } from "@/lib/storage";
import { YEAR } from "@/lib/meta";

export function SiteHeader() {
  const { setTheme, resolvedTheme } = useTheme();
  const { ids } = useShortlist();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          SIH<span className="text-muted-foreground">{YEAR}</span>
        </Link>

        <nav className="ml-4 flex items-center gap-1 text-sm">
          <Link
            href="/intel/"
            className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Intel
          </Link>
          <Link
            href="/shortlist/"
            className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Shortlist
            {ids.length > 0 && (
              <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {ids.length}
              </span>
            )}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Shared badge for a shortlisted count, used on cards and the detail page. */
export function ShortlistStar({ id }: { id: string }) {
  const { has, toggle } = useShortlist();
  const active = has(id);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={active ? "Remove from shortlist" : "Add to shortlist"}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
    >
      <Star className={active ? "size-4 fill-yellow-400 text-yellow-500" : "size-4"} />
    </Button>
  );
}
