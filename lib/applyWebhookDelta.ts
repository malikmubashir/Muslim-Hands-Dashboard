/**
 * Apply Webhook Event Delta to Aggregate
 *
 * Applies processed webhook events to the donor/donation aggregate
 * Uses delta updates instead of full rebuilds for performance
 */

import { ProcessedEvent } from './webhookProcessor.js';

export interface AggregateSnapshot {
  // Core metrics
  total_revenue: number;
  transaction_count: number;
  donateurs: number;
  active_donors: number;

  // By theme
  themes: Record<string, {
    amount: number;
    count: number;
  }>;

  // By destination
  destinations: Record<string, {
    amount: number;
    count: number;
  }>;

  // Recurring giving
  recurring_donors: number;
  monthly_revenue: number;

  // Pledges
  pledges: number;
  total_pledged: number;

  // Scheduled
  scheduled_donations: number;
  future_revenue: number;

  // Metadata
  last_updated: string;
  last_event_id: string;
}

/**
 * Apply a processed event delta to the aggregate
 *
 * @param aggregate - Current aggregate snapshot
 * @param processedEvent - Processed webhook event
 * @returns Updated aggregate
 */
export const applyWebhookDelta = (
  aggregate: AggregateSnapshot,
  processedEvent: ProcessedEvent
): AggregateSnapshot => {
  try {
    const eventType = processedEvent.event_type;
    const data = processedEvent.transformed_data;

    if (!data) {
      console.warn(`[Delta] No data to apply for event ${processedEvent.event_id}`);
      return aggregate;
    }

    console.log(`[Delta] Applying ${eventType} delta to aggregate (event: ${processedEvent.event_id})`);

    let updated = { ...aggregate };

    // Apply type-specific deltas
    if (eventType === 'account.created') {
      updated.donateurs += 1;
      updated.active_donors += 1;
    }

    else if (eventType === 'account.updated') {
      // Account updates may affect donor status but don't change counts
    }

    else if (eventType === 'donation.created' || eventType === 'donation.updated') {
      // One donation may carry several allocation items (validated payload
      // shape, Jul 2026). Fall back to flat fields for legacy shapes.
      const items: Array<{ amount?: number; theme?: string; destination?: string }> =
        Array.isArray(data.items) && data.items.length > 0
          ? data.items
          : [{ amount: data.amount || 0, theme: data.theme, destination: data.destination }];

      updated.transaction_count += 1;

      for (const it of items) {
        const amount = it.amount || 0;
        const theme = normalizeTheme(it.theme);
        const destination = normalizeDestination(it.destination);

        updated.total_revenue += amount;

        if (!updated.themes[theme]) {
          updated.themes[theme] = { amount: 0, count: 0 };
        }
        updated.themes[theme].amount += amount;
        updated.themes[theme].count += 1;

        if (!updated.destinations[destination]) {
          updated.destinations[destination] = { amount: 0, count: 0 };
        }
        updated.destinations[destination].amount += amount;
        updated.destinations[destination].count += 1;
      }
    }

    else if (eventType === 'pledge.created' || eventType === 'pledge.updated') {
      const amount = data.amount || 0;
      updated.pledges += 1;
      updated.total_pledged += amount;
    }

    else if (eventType === 'regularGiving.created' || eventType === 'regularGiving.updated') {
      const amount = data.amount || 0;
      updated.recurring_donors += 1;
      updated.monthly_revenue += amount;
    }

    else if (eventType === 'scheduledGiving.created' || eventType === 'scheduledGiving.updated') {
      const amount = data.amount || 0;
      updated.scheduled_donations += 1;
      updated.future_revenue += amount;
    }

    else if (eventType === 'fundStructure.updated') {
      // Flag that full rebuild may be needed, but don't modify aggregate here
      console.log(`[Delta] Fund structure changed - may require full aggregate rebuild`);
    }

    // Update metadata
    updated.last_updated = new Date().toISOString();
    updated.last_event_id = processedEvent.event_id;

    console.log(`[Delta] Delta applied successfully for ${eventType}`);
    return updated;

  } catch (error) {
    console.error(`[Delta] Error applying webhook delta:`, error);
    return aggregate;
  }
};

/**
 * Normalize theme to canonical form
 * Integrates with existing THEME_CANON mapping
 */
const normalizeTheme = (theme: any): string => {
  const s = theme == null ? '' : String(theme).trim();
  if (!s) return 'Other';

  // TODO: Integrate with aggregateDonverse.ts THEME_CANON mapping
  return s;
};

/**
 * Normalize destination to canonical form
 * Integrates with existing DEST_MAP mapping
 */
const normalizeDestination = (destination: any): string => {
  const s = destination == null ? '' : String(destination).trim();
  if (!s) return 'General';

  // TODO: Integrate with aggregateDonverse.ts DEST_MAP mapping
  return s;
};

/**
 * Initialize empty aggregate snapshot
 */
export const createEmptyAggregate = (): AggregateSnapshot => {
  return {
    total_revenue: 0,
    transaction_count: 0,
    donateurs: 0,
    active_donors: 0,
    themes: {},
    destinations: {},
    recurring_donors: 0,
    monthly_revenue: 0,
    pledges: 0,
    total_pledged: 0,
    scheduled_donations: 0,
    future_revenue: 0,
    last_updated: new Date().toISOString(),
    last_event_id: ''
  };
};
