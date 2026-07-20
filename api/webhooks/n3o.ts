import { VercelRequest, VercelResponse } from '@vercel/node';
import { enqueueWebhookEvent, QueuedEvent } from '../../services/webhookQueue.js';

interface N3OWebhookPayload {
  [key: string]: any;
}

/**
 * Webhook endpoint for N3O real-time event sync
 * Accepts POST requests from N3O and queues them for processing
 *
 * Endpoint: POST /api/webhooks/n3o
 * Expected headers:
 *   - n3o-event-type: Type of event (e.g., donation.created)
 *   - n3o-event-id: Unique event ID
 *   - n3o-subscription-id: Webhook subscription ID
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let eventType: string | undefined;
  let eventId: string | undefined;

  try {
    // Extract event metadata from headers
    eventType = req.headers['n3o-event-type'] as string;
    eventId = req.headers['n3o-event-id'] as string;
    const subscriptionId = req.headers['n3o-subscription-id'] as string;

    console.log(`[Webhook] Received event: ${eventType} (ID: ${eventId})`);

    // Validate required headers
    if (!eventType || !eventId) {
      console.warn('[Webhook] Missing required headers');
      return res.status(400).json({
        error: 'Missing required headers: n3o-event-type, n3o-event-id'
      });
    }

    // Validate BLOB_READ_WRITE_TOKEN exists
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('[Webhook] BLOB_READ_WRITE_TOKEN is not set');
      return res.status(500).json({
        error: 'Server misconfiguration: Blob storage not initialized'
      });
    }

    // Parse payload
    const payload: N3OWebhookPayload = req.body || {};

    // Strip direct PII before durable storage (queue blobs live on a
    // public-URL blob store; aggregation never needs names/contact details).
    const PII_KEYS = ['name', 'firstName', 'lastName', 'email', 'phone', 'telephone', 'address'];
    for (const k of PII_KEYS) delete payload[k];
    if (payload.account && typeof payload.account === 'object') {
      for (const k of PII_KEYS) delete (payload.account as any)[k];
    }

    // Create queued event object
    const queuedEvent: QueuedEvent = {
      event_id: eventId,
      event_type: eventType,
      subscription_id: subscriptionId,
      timestamp: Math.floor(Date.now() / 1000),
      received_at: new Date().toISOString(),
      data: payload,
      retry_count: 0
    };

    // Enqueue event for processing
    console.log('[Webhook] Attempting to enqueue event...');
    await enqueueWebhookEvent(queuedEvent);
    console.log(`[Webhook] Event queued successfully: ${eventId}`);

    // Return 202 Accepted immediately (webhook is now queued)
    return res.status(202).json({
      status: 'accepted',
      event_id: eventId,
      message: 'Event queued for processing'
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Webhook] Error processing event ${eventId}:`, errorMsg);
    console.error('[Webhook] Full error:', error);

    return res.status(500).json({
      error: 'Failed to process webhook',
      message: errorMsg,
      event_id: eventId
    });
  }
};
