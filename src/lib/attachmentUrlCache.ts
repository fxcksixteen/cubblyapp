/**
 * Shared signed-URL cache + batcher for the private `chat-attachments` bucket.
 *
 * Why this exists (v0.4.5): every <AttachmentItem> used to fire its own
 * `createSignedUrl` HTTP call on mount, so a server text channel with 20
 * images in view was doing 20 sequential-ish sign requests before a single
 * pixel could paint. That is why images in server text channels felt
 * "insanely slow" compared to Discord (which pre-signs + CDNs).
 *
 * This module:
 *   1. Coalesces concurrent requests for the same path (no thundering herd).
 *   2. Batches sign requests within a 10ms window into a SINGLE
 *      `createSignedUrls(paths, ttl)` call — N images → 1 round-trip.
 *   3. Caches the resulting URL for ~20h (signed for 24h, we refresh with a
 *      safety margin) so scrolling / re-mounting never re-signs.
 */
import { supabase } from "@/integrations/supabase/client";

type Cached = { url: string; expiresAt: number };

const TTL_SECONDS = 60 * 60 * 24;
const CACHE_TTL_MS = 20 * 60 * 60 * 1000; // 20h — refresh well before the 24h URL expiry
const BATCH_WINDOW_MS = 10;
const MAX_BATCH_SIZE = 90; // stay under the storage API's per-call limit

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<string | null>>();

type QueueEntry = { path: string; resolve: (u: string | null) => void };
let queue: QueueEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushQueue, BATCH_WINDOW_MS);
}

async function flushQueue() {
  flushTimer = null;
  if (queue.length === 0) return;
  // Take up to MAX_BATCH_SIZE items; keep the remainder for the next tick.
  const batch = queue.splice(0, MAX_BATCH_SIZE);
  if (queue.length > 0) scheduleFlush();

  // De-dup paths within the batch — several viewers can request the same path.
  const uniquePaths = Array.from(new Set(batch.map((b) => b.path)));

  try {
    const { data, error } = await supabase.storage
      .from("chat-attachments")
      .createSignedUrls(uniquePaths, TTL_SECONDS);

    if (error || !data) {
      batch.forEach((b) => b.resolve(null));
      uniquePaths.forEach((p) => inflight.delete(p));
      return;
    }

    const now = Date.now();
    const map = new Map<string, string>();
    for (const row of data as Array<{ path?: string; signedUrl?: string; error?: string | null }>) {
      if (row?.path && row?.signedUrl && !row.error) {
        map.set(row.path, row.signedUrl);
        cache.set(row.path, { url: row.signedUrl, expiresAt: now + CACHE_TTL_MS });
      }
    }
    batch.forEach((b) => b.resolve(map.get(b.path) ?? null));
    uniquePaths.forEach((p) => inflight.delete(p));
  } catch {
    batch.forEach((b) => b.resolve(null));
    uniquePaths.forEach((p) => inflight.delete(p));
  }
}

/**
 * Resolve a chat-attachments bucket path to a signed URL. Cached across the
 * session and batched with other in-flight requests.
 */
export function getSignedAttachmentUrl(path: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.url);

  const existing = inflight.get(path);
  if (existing) return existing;

  const p = new Promise<string | null>((resolve) => {
    queue.push({ path, resolve });
    scheduleFlush();
  });
  inflight.set(path, p);
  return p;
}
