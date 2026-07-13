import { VercelRequest, VercelResponse } from '@vercel/node';
import { dequeueWebhookEvent, getQueueDepth, markEventProcessed, isEventProcessed } from '../../services/webhookQueue';
import { processWebhookEvent } from '../../lib/webhookProcessor';

/**
 * Cron job to process queued webhook events
 * Runs every 10 seconds via Vercel Cron
 *
 * Vercel Cron configuration in vercel.json:
 * "crons": [{
 *   "path": "/api/cron/process-webhooks",
 *   "schedule": "*/10 * * * * *"
 * }]
 *
 * NOTE: Vercel uses crontab syntax, not a special format:
 * */10 * * * * * = every 10 seconds
 * */5 * * * * * = every 5 seconds
 * 0 */1 * * * * = every 1 minute
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  // Verify cron secret from Vercel (optional but recommended)
  const cronSecret = req.headers.authorization?.replace('Bearer ', '');
  if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  let eventsProcessed = 0;
  let eventsFailed = 0;

  try {
    console.log('[Cron] Starting webhook processing batch');

    // Get queue depth for monitoring
    const queueDepth = await getQueueDepth();
    console.log(`[Cron] Queue depth: ${queueDepth} events`);

    // Process events in batch (up to 100 per cron run to avoid timeout)
    const maxEventsPerRun = 100;
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
          // Mark event as processed
          await markEventProcessed(queuedEvent.event_id);

          // TODO: Apply processed event to aggregate
          // - Update donation/donor cube
          // - Increment affected KPIs
          // - Refresh dashboard cache
          // - Broadcast update to WebSocket clients

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
