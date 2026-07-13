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

  try {
    // Extract event metadata from headers
    const eventType = req.headers['n3o-event-type'] as string;
    const eventId = req.headers['n3o-event-id'] as string;
    const subscriptionId = req.headers['n3o-subscription-id'] as string;

    // Validate required headers
    if (!eventType || !eventId) {
      return res.status(400).json({
        error: 'Missing required headers: n3o-event-type, n3o-event-id'
      });
    }

    // Parse payload
    const payload: N3OWebhookPayload = req.body || {};

    // Log webhook receipt (for monitoring)
    console.log(`[Webhook] Received event: ${eventType} (ID: ${eventId})`);

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
    await enqueueWebhookEvent(queuedEvent);
    console.log(`[Webhook] Event queued successfully: ${eventId}`);

    // Return 202 Accepted immediately (webhook is now queued)
    return res.status(202).json({
      status: 'accepted',
      event_id: eventId,
      message: 'Event queued for processing'
    });

  } catch (error) {
    console.error('[Webhook] Error processing event:', error);
    return res.status(500).json({
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
