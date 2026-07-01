/**
 * Global auto-popup modal queue.
 *
 * Ensures that "system-triggered" modals (What's New, Honey Welcome, future
 * announcements, etc.) NEVER overlap or stack on top of each other. Only the
 * highest-priority modal that has requested a slot is allowed to render at a
 * time. When it releases the slot, the next queued modal takes over.
 *
 * Priorities (higher = shown first):
 *   100  What's New / changelog
 *    90  Honey welcome
 */
import { useEffect, useSyncExternalStore } from "react";

type Entry = { id: string; priority: number };

let entries: Entry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function requestModalSlot(id: string, priority: number) {
  if (entries.some((e) => e.id === id)) return;
  entries = [...entries, { id, priority }].sort((a, b) => b.priority - a.priority);
  emit();
}

export function releaseModalSlot(id: string) {
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return;
  entries = next;
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getTopId(): string | null {
  return entries[0]?.id ?? null;
}

/**
 * Reserve a slot in the global auto-popup queue. Returns `true` when this
 * modal is currently the top of the queue and is allowed to render. Handles
 * request/release lifecycle automatically based on `wantsToShow`.
 */
export function useModalSlot(id: string, priority: number, wantsToShow: boolean): boolean {
  useEffect(() => {
    if (wantsToShow) requestModalSlot(id, priority);
    else releaseModalSlot(id);
    return () => releaseModalSlot(id);
  }, [id, priority, wantsToShow]);

  const topId = useSyncExternalStore(subscribe, getTopId, () => null);
  return wantsToShow && topId === id;
}
