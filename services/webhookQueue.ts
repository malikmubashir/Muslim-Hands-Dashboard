/**
 * Webhook Queue Service — durable queue on Vercel Blob.
 *
 * Blob layout:
 *   webhook-queue/pending/<enqueuedAtMs>-<eventId>.json  — one blob per queued event
 *   webhook-queue/ledger.json                            — processed event IDs (idempotency)
 *
 * Designed for a once-daily drain (Vercel Hobby cron): the pending listing and
 * the processed ledger are cached in module scope for the lifetime of one
 * function invocation, keeping Blob operation counts low (1 list + 1 ledger
 * read per run, 1 delete per event, 1 ledger write per run).
 *
 * Requires BLOB_READ_WRITE_TOKEN (already configured — api/data.ts uses it).
 */

import { put, list, del } from '@vercel/blob';

export interface QueuedEvent {
  event_id: string;
  event_type: string;
  subscription_id?: string;
  timestamp: number;
  received_at: string;
  data: any;
  retry_count?: number;
}

const PENDING_PREFIX = 'webhook-queue/pending/';
const LEDGER_KEY = 'webhook-queue/ledger.json';
const LEDGER_MAX = 5000; // keep the most recent N processed IDs

const sanitizeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Add event to the webhook queue (one blob per event, timestamp-prefixed for FIFO).
 */
export const enqueueWebhookEvent = async (event: QueuedEvent): Promise<void> => {
  const key = `${PENDING_PREFIX}${Date.now()}-${sanitizeId(event.event_id)}.json`;
  await put(key, JSON.stringify(event), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true, // non-guessable URL
  });
  console.log(`[Queue] Enqueued ${event.event_type} (${event.event_id}) as ${key}`);
};

// ---- invocation-scoped caches (one cron run = one function invocation) ----
let pendingCache: { url: string; pathname: string }[] | null = null;
let ledgerCache: Set<string> | null = null;
let ledgerDirty = false;

const loadPending = async (): Promise<{ url: string; pathname: string }[]> => {
  if (pendingCache === null) {
    const { blobs } = await list({ prefix: PENDING_PREFIX, limit: 1000 });
    pendingCache = blobs
      .map((b) => ({ url: b.url, pathname: b.pathname }))
      .sort((a, b) => a.pathname.localeCompare(b.pathname)); // FIFO by enqueue time
  }
  return pendingCache;
};

const loadLedger = async (): Promise<Set<string>> => {
  if (ledgerCache === null) {
    try {
      const { blobs } = await list({ prefix: LEDGER_KEY, limit: 1 });
      const entry = blobs.find((b) => b.pathname === LEDGER_KEY) ?? blobs[0];
      if (entry) {
        const res = await fetch(entry.url, { cache: 'no-store' });
        ledgerCache = res.ok ? new Set((await res.json()) as string[]) : new Set();
      } else {
        ledgerCache = new Set();
      }
    } catch (error) {
      console.error('[Queue] Failed to load processed ledger, starting empty:', error);
      ledgerCache = new Set();
    }
  }
  return ledgerCache;
};

/**
 * Dequeue the oldest event. The blob is deleted on read (at-most-once
 * delivery); the processed ledger guards against duplicate N3O deliveries.
 */
export const dequeueWebhookEvent = async (): Promise<QueuedEvent | null> => {
  const pending = await loadPending();
  const next = pending.shift();
  if (!next) return null;

  const res = await fetch(next.url, { cache: 'no-store' });
  await del(next.url);
  if (!res.ok) {
    console.error(`[Queue] Unreadable queue blob dropped: ${next.pathname}`);
    return dequeueWebhookEvent();
  }
  return (await res.json()) as QueuedEvent;
};

/**
 * Mark event as processed (idempotency). Buffered in memory; call
 * flushProcessedLedger() once at the end of the batch to persist.
 */
export const markEventProcessed = async (eventId: string): Promise<void> => {
  const ledger = await loadLedger();
  ledger.add(eventId);
  ledgerDirty = true;
};

/**
 * Check whether an event ID was already processed.
 */
export const isEventProcessed = async (eventId: string): Promise<boolean> => {
  return (await loadLedger()).has(eventId);
};

/**
 * Persist the processed-ID ledger (call once per cron run, after the batch).
 */
export const flushProcessedLedger = async (): Promise<void> => {
  if (!ledgerDirty || ledgerCache === null) return;
  const ids = [...ledgerCache].slice(-LEDGER_MAX);
  await put(LEDGER_KEY, JSON.stringify(ids), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false, // deterministic key → overwrite in place
  });
  ledgerDirty = false;
  console.log(`[Queue] Processed ledger persisted (${ids.length} IDs)`);
};

/**
 * Get queue depth (for monitoring).
 */
export const getQueueDepth = async (): Promise<number> => {
  return (await loadPending()).length;
};
