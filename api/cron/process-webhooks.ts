import { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import {
  dequeueWebhookEvent,
  getQueueDepth,
  markEventProcessed,
  isEventProcessed,
  flushProcessedLedger,
} from '../../services/webhookQueue.js';
import { processWebhookEvent } from '../../lib/webhookProcessor.js';
import { applyWebhookDelta, createEmptyAggregate, AggregateSnapshot } from '../../lib/applyWebhookDelta.js';

const AGGREGATE_KEY = 'webhook-queue/aggregates.json';

/** Load the running webhook aggregate snapshot from Blob (or start empty). */
const loadAggregateSnapshot = async (): Promise<AggregateSnapshot> => {
  try {
    const { blobs } = await list({ prefix: AGGREGATE_KEY, limit: 1 });
    const entry = blobs.find((b) => b.pathname === AGGREGATE_KEY) ?? blobs[0];
    if (entry) {
      const res = await fetch(entry.url, { cache: 'no-store' });
      if (res.ok) return (await res.json()) as AggregateSnapshot;
    }
  } catch (error) {
    console.error('[Cron] Failed to load aggregate snapshot, starting empty:', error);
  }
  return createEmptyAggregate();
};

const saveAggregateSnapshot = async (snapshot: AggregateSnapshot): Promise<void> => {
  await put(AGGREGATE_KEY, JSON.stringify(snapshot), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
};

/**
 * Cron job to process queued webhook events
 * Runs once daily at 21:00 UTC (23:00 Paris CEST / 22:00 CET) via Vercel Cron.
 * Vercel Hobby plan allows one cron invocation per day; the trigger may fire
 * within the hour following the scheduled time.
 *
 * Configured in vercel.json:
 * {
 *   "path": "/api/cron/process-webhooks",
 *   "schedule": "0 21 * * *"
 * }
 *
 * The endpoint drains the full day's queue in one batch (up to
 * maxEventsPerRun events, 60s maxDuration set in vercel.json).
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  // If CRON_SECRET is configured, REQUIRE a matching Bearer token.
  // (Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.)
  if (process.env.CRON_SECRET) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const startTime = Date.now();
  let eventsProcessed = 0;
  let eventsFailed = 0;

  try {
    console.log('[Cron] Starting webhook processing batch');

    // Get queue depth for monitoring
    const queueDepth = await getQueueDepth();
    console.log(`[Cron] Queue depth: ${queueDepth} events`);

    // Load the running aggregate snapshot (persisted across daily runs)
    let aggregate = await loadAggregateSnapshot();

    // Daily run must drain a full day's queue in one pass (60s budget)
    const maxEventsPerRun = 500;
    let eventCount = 0;

    while (eventCount < maxEventsPerRun) {
      const queuedEvent = await dequeueWebhookEvent();

      // No more events in queue
      if (!queuedEvent) {
        break;
      }

      // Check if event was already processed (idempotency)
      const alreadyProcessed = await isEventProcessed(queuedEvent.event_id);
      if (alreadyProcessed) {
        console.log(`[Cron] Event already processed (idempotent skip): ${queuedEvent.event_id}`);
        eventsProcessed++;
        eventCount++;
        continue;
      }

      try {
        // Process the event
        console.log(`[Cron] Processing event: ${queuedEvent.event_type} (${queuedEvent.event_id})`);
        const processedEvent = await processWebhookEvent(queuedEvent);

        if (processedEvent.success) {
          // Apply the delta to the running aggregate, then mark processed
          aggregate = applyWebhookDelta(aggregate, processedEvent);
          await markEventProcessed(queuedEvent.event_id);

          console.log(`[Cron] Event processed successfully: ${queuedEvent.event_id}`);
          eventsProcessed++;
        } else {
          console.error(`[Cron] Event processing failed: ${queuedEvent.event_id} - ${processedEvent.error}`);
          eventsFailed++;

          // TODO: Implement retry logic with exponential backoff
          // if (queuedEvent.retry_count < 3) {
          //   queuedEvent.retry_count++;
          //   await enqueueWebhookEvent(queuedEvent); // Re-queue for retry
          // }
        }

        eventCount++;

      } catch (eventError) {
        console.error(`[Cron] Unhandled error processing event ${queuedEvent.event_id}:`, eventError);
        eventsFailed++;
        eventCount++;
      }
    }

    // Persist results once per run (keeps Blob operation counts low)
    if (eventsProcessed > 0) {
      await saveAggregateSnapshot(aggregate);
    }
    await flushProcessedLedger();

    const duration = Date.now() - startTime;

    console.log('[Cron] Webhook processing batch completed', {
      events_processed: eventsProcessed,
      events_failed: eventsFailed,
      queue_depth: await getQueueDepth(),
      duration_ms: duration
    });

    return res.status(200).json({
      status: 'success',
      events_processed: eventsProcessed,
      events_failed: eventsFailed,
      queue_depth: await getQueueDepth(),
      duration_ms: duration,
      message: 'Webhook batch processing complete'
    });

  } catch (error) {
    console.error('[Cron] Error processing webhooks:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      events_processed: eventsProcessed,
      duration_ms: Date.now() - startTime
    });
  }
};
