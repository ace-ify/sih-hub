"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { search, emptyFilters } from "@/lib/search";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Fuse already ranks; cap the list so the dialog stays snappy.
  const hits = useMemo(
    () => search({ ...emptyFilters, query }).slice(0, 8),
    [query]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search problem statements"
      description="Jump straight to a problem statement"
    >
      {/* Fuse does the ranking, so cmdk's own filter is off. */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Jump to a problem statement…"
        />
        <CommandList>
          <CommandEmpty>No match.</CommandEmpty>
          <CommandGroup heading={query ? "Results" : "Browse"}>
            {hits.map((s) => (
              <CommandItem
                key={s.ps_number}
                value={s.ps_number}
                onSelect={() => {
                  onOpenChange(false);
                  router.push(`/ps/${s.ps_number}/`);
                }}
              >
                <span className="font-mono text-xs text-muted-foreground">{s.ps_number}</span>
                <span className="truncate">{s.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
