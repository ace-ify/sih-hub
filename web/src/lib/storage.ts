"use client";

import { useCallback, useSyncExternalStore } from "react";
import { YEAR } from "./meta";

// Keys are scoped to the SIH edition: when the site rolls over to the next year
// the old PS numbers no longer exist, so a fresh namespace is the correct
// behaviour rather than a shortlist full of dead entries.
const KEY = `sih${YEAR}:shortlist`;
const EVENT = "sih:storage";

const EMPTY: string[] = [];

// getSnapshot must return a referentially stable value or React re-renders
// forever, so the parsed array is cached and only replaced when the raw
// localStorage string actually changes.
let cachedRaw: string | null = null;
let cachedList: string[] = EMPTY;

function snapshot(): string[] {
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    cachedList = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Prerendered HTML has no localStorage, so the server snapshot is empty. */
const serverSnapshot = () => EMPTY;

function write(next: string[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function useShortlist() {
  const ids = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const toggle = useCallback((id: string) => {
    const curr = snapshot();
    write(curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]);
  }, []);

  const clear = useCallback(() => write(EMPTY), []);

  return { ids, toggle, clear, has: (id: string) => ids.includes(id) };
}

// --- per-statement notes --------------------------------------------------

const noteCache = new Map<string, string>();

function noteStore(psNumber: string) {
  const key = `sih${YEAR}:note:${psNumber}`;
  return {
    key,
    read: () => {
      const raw = localStorage.getItem(key) ?? "";
      if (noteCache.get(key) !== raw) noteCache.set(key, raw);
      return noteCache.get(key) as string;
    },
  };
}

export function useNote(psNumber: string) {
  const { key, read } = noteStore(psNumber);
  const note = useSyncExternalStore(
    subscribe,
    read,
    () => "" // no note during prerender
  );

  const save = useCallback(
    (value: string) => {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
      window.dispatchEvent(new Event(EVENT));
    },
    [key]
  );

  return { note, save };
}
