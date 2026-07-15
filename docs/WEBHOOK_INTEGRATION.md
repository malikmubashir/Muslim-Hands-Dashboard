# N3O Webhook Integration Guide

> ⚠️ **SUPERSEDED (15 Jul 2026).** This document describes the original
> design (Vercel KV queue, 10-second cron) which was never deployable on the
> Hobby plan. The implemented system — Blob-backed queue, daily 21:00 UTC
> drain, nightly merge into the rendered dataset — is documented in
> [`../WEBHOOK_AUTOMATION_COMPLETE.md`](../WEBHOOK_AUTOMATION_COMPLETE.md).
> Kept for historical reference only.

**Status:** ❌ superseded — see banner above
**Date:** July 2026
**Architecture:** Event-driven real-time sync (original proposal)

---

## System Overview

```
N3O CRM (11 events)
       ↓
    [POST /api/webhooks/n3o]  (202 Accepted immediately)
       ↓
    Vercel KV Queue
       ↓
    [Cron every 10 seconds]
       ↓
    [Process & Transform]
       ↓
    [Apply Delta to Aggregate]
       ↓
    Dashboard (live updates)
```

---

## Backend Components

### 1. Webhook Receiver: `/api/webhooks/n3o.ts`

**Purpose:** Accept N3O webhook events and queue them

**How it works:**
- Listens on `POST /api/webhooks/n3o`
- Extracts event metadata from headers (event type, ID, subscription)
- Validates required headers
- Enqueues event to Vercel KV
- Returns 202 Accepted immediately (non-blocking)

**Headers expected:**
```
n3o-event-type: donation.created
n3o-event-id: evt_1234567890
n3o-subscription-id: WH1017
```

**Status codes:**
- `202` — Event accepted and queued ✅
- `400` — Missing required headers ❌
- `405` — Wrong HTTP method ❌
- `500` — Server error ❌

---

### 2. Queue Service: `/services/webhookQueue.ts`

**Purpose:** Manage event queue in Vercel KV

**Functions:**
- `enqueueWebhookEvent()` — Add event to queue
- `dequeueWebhookEvent()` — Remove and return next event
- `markEventProcessed()` — Track processed events (idempotency)
- `isEventProcessed()` — Check if event already processed
- `getQueueDepth()` — Monitor queue size

**Storage backend:** Vercel KV (Redis-compatible)

**Queue structure:**
```typescript
{
  event_id: string,           // Unique identifier
  event_type: string,         // e.g., "donation.created"
  subscription_id: string,    // WH1017
  timestamp: number,          // Unix timestamp
  received_at: string,        // ISO 8601
  data: object,              // N3O payload
  retry_count: number        // For failed events
}
```

---

### 3. Event Processor: `/lib/webhookProcessor.ts`

**Purpose:** Transform N3O events into aggregate-ready format

**Processing steps:**
1. Route event by type
2. Extract relevant fields
3. Remove PII (names, emails, addresses)
4. Identify affected aggregate fields

**Event handlers:**
- `processAccountEvent()` — Donor registration/updates
- `processDonationEvent()` — Transaction processing
- `processPledgeEvent()` — Pledge commitments
- `processRegularGivingEvent()` — Recurring donors
- `processScheduledGivingEvent()` — Future donations
- `processFundStructureEvent()` — Fund category changes

**Output example:**
```typescript
{
  event_id: "evt_123",
  event_type: "donation.created",
  transformed_data: {
    donation_id: "don_456",
    amount: 50.00,
    currency: "GBP",
    theme: "Orphans",
    destination: "Middle East"
  },
  delta_keys: ["total_revenue", "transaction_count", "themes"],
  success: true
}
```

---

### 4. Aggregate Delta: `/lib/applyWebhookDelta.ts`

**Purpose:** Apply event delta to donation/donor aggregate

**How it works:**
- Takes current aggregate snapshot
- Applies delta from processed event
- Updates only affected fields
- Normalizes theme/destination via existing mappings
- Returns updated aggregate

**Delta examples:**
```
donation.created → total_revenue += amount
                 → transaction_count += 1
                 → themes[theme].amount += amount

account.created  → donateurs += 1
                 → active_donors += 1

regularGiving.created → recurring_donors += 1
                      → monthly_revenue += amount
```

---

### 5. Cron Processor: `/api/cron/process-webhooks.ts`

**Purpose:** Process queued events every 10 seconds

**Schedule:** `*/10 * * * * *` (every 10 seconds via Vercel Cron)

**Processing loop:**
1. Get queue depth (monitoring)
2. Dequeue up to 100 events
3. Check idempotency (skip if already processed)
4. Transform event via processor
5. Apply delta to aggregate
6. Mark event as processed
7. Log results

**Output example:**
```json
{
  "status": "success",
  "events_processed": 42,
  "events_failed": 0,
  "queue_depth": 5,
  "duration_ms": 1234
}
```

**Monitoring metrics:**
- Queue depth (should stay < 500)
- Processing latency (should be < 5 seconds)
- Failure rate (should be < 1%)

---

## Configuration

### Environment Variables

Add to Vercel Environment Variables:

```bash
# Cron authentication
CRON_SECRET=your-random-secret-key

# Vercel KV (queue storage)
KV_URL=https://your-kv.kv.vercel.sh
KV_REST_API_URL=https://your-kv.kv.vercel.sh
KV_REST_API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
KV_REST_API_READ_ONLY_TOKEN=...

# Vercel Blob (aggregate storage)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### Vercel Configuration

File: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/process-webhooks",
      "schedule": "*/10 * * * * *"
    }
  ]
}
```

✅ Already configured in your project.

---

## Data Flow

### Event Lifecycle

```
1. N3O fires webhook
   ├─ Sends POST to /api/webhooks/n3o
   └─ Includes event metadata in headers

2. Webhook endpoint (async)
   ├─ Validates headers
   ├─ Enqueues to Vercel KV
   └─ Returns 202 immediately

3. Cron processor (every 10 seconds)
   ├─ Dequeues events from Vercel KV
   ├─ Transforms via webhookProcessor
   ├─ Applies delta to aggregate
   ├─ Marks as processed
   └─ Updates dashboard cache

4. Dashboard refreshes
   ├─ Fetches latest aggregate
   ├─ Updates KPIs
   └─ Shows live data
```

### Event Types and Delta Impact

| Event | Delta Fields | Example |
|-------|-------------|---------|
| `account.created` | donateurs, active_donors | New donor signs up |
| `account.updated` | (metadata only) | Donor updates profile |
| `donation.created` | total_revenue, themes, destinations | New donation recorded |
| `donation.updated` | total_revenue (delta) | Donation corrected |
| `pledge.created` | pledges, total_pledged | Pledge commitment made |
| `pledge.updated` | pledges, total_pledged (delta) | Pledge status changed |
| `regularGiving.created` | recurring_donors, monthly_revenue | Recurring setup |
| `regularGiving.updated` | monthly_revenue (delta) | Recurring amount changed |
| `scheduledGiving.created` | scheduled_donations, future_revenue | Future donation scheduled |
| `scheduledGiving.updated` | future_revenue (delta) | Scheduled date changed |
| `fundStructure.updated` | (triggers full refresh) | Fund categories changed |

---

## Deployment Steps

### Step 1: Environment Setup

1. Go to Vercel project settings
2. Add environment variables (see Configuration section)
3. Enable Vercel KV (if not already enabled)
4. Enable Vercel Blob (if not already enabled)

### Step 2: Deploy Code

Push to main branch:
```bash
git add api/ services/ lib/ docs/ vercel.json .env.example
git commit -m "feat: N3O webhook integration backend automation"
git push origin main
```

Vercel automatically deploys.

### Step 3: Verify Deployment

Check Vercel logs:
```bash
# Look for successful cron runs
vercel logs --function=process-webhooks
```

### Step 4: Test with N3O

1. Create test donor in N3O Admin
2. Record test donation ($5 GBP to verify)
3. Check Vercel logs for webhook receipt:
   ```
   [Webhook] Received event: donation.created (ID: evt_xxx)
   [Webhook] Event queued successfully: evt_xxx
   ```
4. Wait 10 seconds for cron processor
5. Check Vercel logs for processing:
   ```
   [Cron] Processing event: donation.created (evt_xxx)
   [Cron] Event processed successfully: evt_xxx
   ```
6. Verify dashboard shows $5 in latest donations

---

## Monitoring & Alerts

### Healthy Metrics

✅ Queue depth: 0–50 events  
✅ Processing latency: < 2 seconds  
✅ Event failure rate: < 0.1%  
✅ Cron runs: every 10 seconds (no gaps)

### Alert Thresholds

⚠️ Queue depth > 500 events → Processing lag  
⚠️ Processing latency > 10 seconds → Bottleneck  
⚠️ Event failure rate > 5% → Data quality issue

### How to Monitor

**Real-time logs:**
```bash
vercel logs --follow
```

**Cron processor output:**
```
[Cron] Starting webhook processing batch
[Cron] Queue depth: 12 events
[Cron] Processing event: donation.created (evt_123)
[Cron] Event processed successfully: evt_123
[Cron] Webhook processing batch completed {
  events_processed: 12,
  events_failed: 0,
  queue_depth: 0,
  duration_ms: 1234
}
```

---

## Troubleshooting

### Webhooks not arriving?

1. Check N3O webhook status
   - Go to N3O Admin → Webhooks
   - Verify WH1017 is Active
   - Check last delivery time

2. Verify endpoint reachability
   ```bash
   curl -X POST https://muslim-hands-dashboard.vercel.app/api/webhooks/n3o \
     -H "n3o-event-type: test.ping" \
     -H "n3o-event-id: evt_test_123" \
     -d '{}'
   # Should return 202 Accepted
   ```

3. Check Vercel logs for errors
   ```bash
   vercel logs --function=n3o
   ```

### Events not processing?

1. Check Vercel KV connectivity
   ```bash
   # Verify KV environment variables are set
   vercel env list
   ```

2. Check cron logs
   ```bash
   vercel logs --function=process-webhooks --follow
   ```

3. Verify queue depth
   - If stuck at high number, cron may not be running
   - Check Vercel Cron status in project settings

### Dashboard aggregate not updating?

1. Verify cron processor completed successfully
   ```
   [Cron] Webhook processing batch completed {
     events_processed: 12,
     events_failed: 0
   }
   ```

2. Check if dashboard is reading latest aggregate
   - Verify Vercel Blob connection
   - Check aggregate fetch endpoint logs

3. Hard refresh dashboard (Cmd+Shift+R)

---

## Next Steps

### Phase 2: Aggregate Sync

- [ ] Integrate `applyWebhookDelta()` with existing aggregate
- [ ] Implement aggregate storage in Vercel Blob
- [ ] Add WebSocket support for live dashboard updates
- [ ] Set up aggregate cache invalidation

### Phase 3: Monitoring

- [ ] Add Datadog/New Relic alerts
- [ ] Create Vercel monitoring dashboard
- [ ] Implement event audit trail
- [ ] Add retry mechanism for failed events

### Phase 4: Backfill

- [ ] Implement historical data backfill (July 2021–July 2026)
- [ ] Add migration endpoint for initial data load
- [ ] Verify aggregate matches N3O export before going live

### Phase 5: Cutover

- [ ] Disable manual CSV upload (keep CLI as fallback)
- [ ] Update dashboard UI to show "real-time powered by N3O"
- [ ] Monitor for 24 hours
- [ ] Archive manual upload process

---

## File Structure

```
project-root/
├── api/
│   ├── webhooks/
│   │   └── n3o.ts                 # Webhook receiver
│   └── cron/
│       └── process-webhooks.ts    # Event processor
├── services/
│   └── webhookQueue.ts            # Queue management
├── lib/
│   ├── webhookProcessor.ts        # Event transformation
│   └── applyWebhookDelta.ts       # Aggregate updater
├── docs/
│   └── WEBHOOK_INTEGRATION.md     # This file
├── vercel.json                     # Cron configuration
├── .env.example                    # Environment template
└── README.md
```

---

## Support & References

**N3O Documentation:**
- API docs: https://docs.n3o.ltd
- Webhook events: https://docs.n3o.ltd/webhooks
- Support: support@n3o.ltd

**Vercel Documentation:**
- Cron: https://vercel.com/docs/cron-jobs
- KV: https://vercel.com/docs/storage/vercel-kv
- Blob: https://vercel.com/docs/storage/vercel-blob

**Dashboard Documentation:**
- Aggregate schema: `docs/N3O-INTEGRATION.md`
- Data model: `docs/DEPLOYMENT.md`

---

**Last Updated:** July 13, 2026  
**Maintained by:** Backend Team
