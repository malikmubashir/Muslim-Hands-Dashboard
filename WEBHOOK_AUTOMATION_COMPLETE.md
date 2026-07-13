# N3O Webhook Integration — Current State

**Status:** ⚙️ CAPTURE + DAILY PROCESSING LIVE — dashboard integration pending
**Last updated:** 13 July 2026
**Honest summary:** webhooks are durably captured and processed once daily.
The main dashboard dataset is still produced by the manual xlsx refresh.

---

## What actually runs in production

```
N3O Webhook Event
        ↓ POST /api/webhooks/n3o          (202 Accepted)
    Durable queue on Vercel Blob          webhook-queue/pending/*.json
        ↓ Vercel Cron — DAILY 21:00 UTC   (23:00 Paris CEST / 22:00 CET,
          ±1h flexible window on Hobby)    manual "Run" possible in Vercel UI
    Batch drain (≤500 events, 60s)        idempotency ledger webhook-queue/ledger.json
        ↓ Transform + delta
    Aggregate snapshot on Blob            webhook-queue/aggregates.json
```

Verified end to end on 13 Jul 2026: synthetic event → 202 → queued →
cron 200 → `events_processed: 1, events_failed: 0, queue_depth: 0`.

### Components

| Piece | File | State |
|---|---|---|
| Webhook receiver | `api/webhooks/n3o.ts` | ✅ live, queues to Blob |
| Durable queue + ledger | `services/webhookQueue.ts` | ✅ live (Vercel Blob) |
| Daily cron drain | `api/cron/process-webhooks.ts` | ✅ live, `CRON_SECRET` enforced |
| Event transform | `lib/webhookProcessor.ts` | ✅ runs; field mapping unvalidated against real payloads |
| Delta application | `lib/applyWebhookDelta.ts` | ✅ runs; writes `AggregateSnapshot` blob |
| Cron schedule | `vercel.json` → `0 21 * * *` | ✅ registered (Hobby: max 1/day) |

## What does NOT happen (yet)

- **The dashboard does not read the webhook aggregate.** The UI renders
  `donverse-latest.json` (`meta / tx / donors`), built by `npm run refresh`
  from the two N3O xlsx exports (see `REFRESH-DATA.md`). The webhook
  snapshot (`webhook-queue/aggregates.json`) is a separate, parallel
  aggregate that nothing in the frontend consumes.
- **Field mappings are unvalidated.** `webhookProcessor.ts` assumes payload
  shapes (`amount`, `theme`, `destination`, …) that have not been checked
  against real N3O webhook payloads. Theme/destination normalization is not
  yet aligned with `THEME_CANON` / `DEST_MAP` in `aggregateDonverse.ts`.
- **No retry queue.** Failed events are counted and logged, not re-queued.

## Plan to close the gap

1. Let real N3O events accumulate for a few days (they are now captured,
   nothing is lost).
2. Inspect actual payloads; validate/fix the mappings in
   `lib/webhookProcessor.ts`; align normalization with the xlsx pipeline.
3. Decide the integration model: either map webhook events into
   `donverse-latest.json` (tx-grain, anonymized, donor dedup) or surface the
   webhook aggregate as a "since last refresh" delta band in the UI.
4. Reconcile a week of webhook-derived totals against an xlsx refresh before
   trusting them.

## Constraints to remember

- **Vercel Hobby:** crons max once daily (±1h window); Pro floor is once per
  minute. The original every-10-seconds design was never possible on Vercel.
- **ESM:** `package.json` has `"type": "module"` — serverless imports need
  explicit `.js` extensions or functions crash at runtime
  (`ERR_MODULE_NOT_FOUND`). This bug hid the placeholder implementation:
  the endpoints had never executed before 13 Jul 2026.
- **Ops budget:** Blob operations are capped on Hobby; the queue batches
  reads/writes (1 list + 1 ledger write per run) to stay well inside limits.

## Operations

- Manual drain: Vercel → Project → Settings → Cron Jobs → **Run**.
- Logs: Vercel → Project → Logs, filter `cron` or `/api/webhooks/n3o`.
- Queue inspection: Vercel → Storage → Blob → `webhook-queue/`.
