/**
 * Webhook Event Processor
 * Transforms N3O webhook events into aggregate updates
 *
 * Handles:
 * - Event type routing (account, donation, pledge, giving, fund)
 * - Payload transformation and validation
 * - Anonymization (PII removal)
 * - Aggregate delta application
 */

import { QueuedEvent } from '../services/webhookQueue.js';

export interface ProcessedEvent {
  event_id: string;
  event_type: string;
  transformed_data: any;
  delta_keys: string[]; // Aggregate fields affected by this event
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Process a queued webhook event
 *
 * Returns transformation result (before aggregate application)
 */
export const processWebhookEvent = async (queuedEvent: QueuedEvent): Promise<ProcessedEvent> => {
  try {
    console.log(`[Processor] Processing event: ${queuedEvent.event_type} (${queuedEvent.event_id})`);

    // Route to appropriate handler
    let transformedData: any;
    let deltaKeys: string[] = [];

    const eventType = queuedEvent.event_type;
    const payload = queuedEvent.data;

    // Account events
    if (eventType === 'account.created' || eventType === 'account.updated') {
      transformedData = processAccountEvent(payload);
      deltaKeys = ['donateurs', 'active_donors'];
    }

    // Donation events
    else if (eventType === 'donation.created' || eventType === 'donation.updated') {
      transformedData = processDonationEvent(payload);
      deltaKeys = ['total_revenue', 'transaction_count', 'themes', 'destinations'];
    }

    // Pledge events
    else if (eventType === 'pledge.created' || eventType === 'pledge.updated') {
      transformedData = processPledgeEvent(payload);
      deltaKeys = ['pledges', 'total_pledged'];
    }

    // Regular giving events
    else if (eventType === 'regularGiving.created' || eventType === 'regularGiving.updated') {
      transformedData = processRegularGivingEvent(payload);
      deltaKeys = ['recurring_donors', 'monthly_revenue'];
    }

    // Scheduled giving events
    else if (eventType === 'scheduledGiving.created' || eventType === 'scheduledGiving.updated') {
      transformedData = processScheduledGivingEvent(payload);
      deltaKeys = ['scheduled_donations', 'future_revenue'];
    }

    // Fund structure changes
    else if (eventType === 'fundStructure.updated') {
      transformedData = processFundStructureEvent(payload);
      deltaKeys = ['themes', 'destinations']; // May need full re-normalization
    }

    else {
      throw new Error(`Unknown event type: ${eventType}`);
    }

    console.log(`[Processor] Event processed successfully`, { event_id: queuedEvent.event_id, delta_keys: deltaKeys });

    return {
      event_id: queuedEvent.event_id,
      event_type: eventType,
      transformed_data: transformedData,
      delta_keys: deltaKeys,
      timestamp: queuedEvent.timestamp,
      success: true
    };

  } catch (error) {
    console.error(`[Processor] Error processing event ${queuedEvent.event_id}:`, error);

    return {
      event_id: queuedEvent.event_id,
      event_type: queuedEvent.event_type,
      transformed_data: null,
      delta_keys: [],
      timestamp: queuedEvent.timestamp,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Transform account.created/updated event
 */
const processAccountEvent = (payload: any): any => {
  return {
    account_id: payload.id,
    account_type: payload.type,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
    // PII fields removed for aggregation
    // Only aggregate-relevant fields preserved
  };
};

/**
 * Transform donation.created/updated event
 */
const processDonationEvent = (payload: any): any => {
  return {
    donation_id: payload.id,
    account_id: payload.accountId,
    amount: payload.amount,
    currency: payload.currency || 'GBP',
    theme: payload.theme, // Will be normalized via THEME_CANON
    destination: payload.destination, // Will be normalized via DEST_MAP
    stipulation: payload.stipulation, // Will be normalized via STIP_MAP
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
    status: payload.status
  };
};

/**
 * Transform pledge.created/updated event
 */
const processPledgeEvent = (payload: any): any => {
  return {
    pledge_id: payload.id,
    account_id: payload.accountId,
    amount: payload.amount,
    currency: payload.currency || 'GBP',
    theme: payload.theme,
    destination: payload.destination,
    due_date: payload.dueDate,
    status: payload.status,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt
  };
};

/**
 * Transform regularGiving.created/updated event
 */
const processRegularGivingEvent = (payload: any): any => {
  return {
    regular_giving_id: payload.id,
    account_id: payload.accountId,
    frequency: payload.frequency, // monthly, quarterly, annually
    amount: payload.amount,
    currency: payload.currency || 'GBP',
    theme: payload.theme,
    destination: payload.destination,
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.status,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt
  };
};

/**
 * Transform scheduledGiving.created/updated event
 */
const processScheduledGivingEvent = (payload: any): any => {
  return {
    scheduled_giving_id: payload.id,
    account_id: payload.accountId,
    amount: payload.amount,
    currency: payload.currency || 'GBP',
    theme: payload.theme,
    destination: payload.destination,
    scheduled_date: payload.scheduledDate,
    status: payload.status,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt
  };
};

/**
 * Transform fundStructure.updated event
 * This event signals that fund categorization has changed
 * May require re-normalization of all existing donations
 */
const processFundStructureEvent = (payload: any): any => {
  return {
    updated_at: payload.updatedAt,
    changes: payload.changes || [],
    requires_full_refresh: true // Flag for aggregate rebuild
  };
};
