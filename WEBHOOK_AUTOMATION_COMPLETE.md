# N3O Webhook Integration — Current State

**Status:** ✅ LIVE END TO END — capture, nightly processing, AND dashboard merge
**Last updated:** 15 July 2026
**Summary:** every N3O event is durably captured; once daily the queue is
drained and the day's donations are merged into the dataset the dashboard
renders. Geography and donor attributes advance via the monthly xlsx refresh.

---

## What runs in production

```
N3O Webhook Event (11 types — see below)
        ↓ POST /api/webhooks/n3o          202 Accepted; PII stripped
    Durable queue on Vercel Blob          webhook-queue/pending/*.json
        ↓ Vercel Cron — DAILY 21:00 UTC   (23:00 Paris CEST / 22:00 CET,
          ±1h flexible window on Hobby)    manual "Run" in Vercel UI works too
    Batch drain (≤500 events, 60s)        idempotency ledger webhook-queue/ledger.json
        ↓ Transform (validated mappings)   raw payloads archived to webhook-queue/archive/
    ┌─ Diagnostic snapshot                webhook-queue/aggregates.json
    └─ MERGE into rendered dataset        donverse-latest.json  ← what the dashboard shows
```

Verified live 14 Jul 2026: synthetic + real donations → queue → drain →
`donverse-latest.json` updated (KPIs, themes, destinations, timeline, cube).

### Subscribed N3O events (11/51 — deliberately minimal)

`account.created/updated`, `donation.created/updated`, `pledge.created/updated`,
`regularGiving.created/updated`, `scheduledGiving.created/updated`,
`fundStructure.updated`. Configured in N3O → Admin → Data → Webhooks (WH1017).
The other 40 event types are irrelevant to dashboard aggregates.

### Components

| Piece | File | State |
|---|---|---|
| Webhook receiver (PII strip) | `api/webhooks/n3o.ts` | ✅ live |
| Durable queue + ledger + archive | `services/webhookQueue.ts` | ✅ live (Vercel Blob) |
| Daily cron drain | `api/cron/process-webhooks.ts` | ✅ live, `CRON_SECRET` enforced |
| Event transform | `lib/webhookProcessor.ts` | ✅ mappings validated against live payloads (14 Jul) |
| Dataset merge | `lib/mergeWebhookIntoDataset.ts` | ✅ live — donation.created only |
| Diagnostic delta snapshot | `lib/applyWebhookDelta.ts` | ✅ live (parallel, not rendered) |
| Dataset freshness rule | `api/data.ts` | ✅ newest of {uploaded blob, bundled seed} wins |
| Cron schedule | `vercel.json` → `0 21 * * *` | ✅ registered (Hobby: max 1/day) |

### Validated N3O donation payload mapping

```
amount       → allocations.items[].value.base.amount   (per allocation)
destination  → allocations.items[].fundDimensions.dimension1
theme/cause  → allocations.items[].fundDimensions.dimension2
stipulation  → allocations.items[].fundDimensions.dimension3
donor ref    → account.reference.text                  ("AC…")
donation ref → reference.text                          ("DN…")
payment      → paymentMethod · date → date ("YYYY-MM-DD")
```

## What the nightly merge does NOT update

- **Geography** (map, dept/region/postcode): donation payloads carry no
  address. Planned: retain postal code (only) from `account.*` events once
  archived samples validate the shape.
- **Donor attributes** (tiers, activity, consent, gender, PA dynamics):
  computed from the donor list export — no webhook carries cumulative history.
- **Refunds / amendments**: `donation.updated` is captured but deliberately
  NOT merged (double-count risk); the monthly refresh reconciles.

## Operating rules

1. **Monthly baseline refresh** (see `REFRESH-DATA.md`): refresh both N3O
   lists, export, CLI refresh, deploy. This trues up everything above.
2. **Sequencing:** do the refresh in the morning, right after the nightly
   drain (queue empty). A baseline refresh SUPERSEDES prior webhook merges —
   webhook donations received between export generation and the refresh
   deploy disappear from display until the next refresh. Keep the window
   short; the next refresh always restores ground truth.
3. **Manual drain:** Vercel → Project → Settings → Cron Jobs → **Run**.
4. **Logs:** Vercel → Project → Logs (filter `cron` or `/api/webhooks/n3o`).
   Hobby retains ~1h of runtime logs — the Blob queue is the durable record.
5. **Queue inspection:** Vercel → Storage → Blob → `webhook-queue/`.

## Constraints to remember

- **Vercel Hobby:** crons max once daily (±1h window); Pro floor is 1/min.
- **ESM:** `"type": "module"` — serverless imports need explicit `.js`
  extensions and `__dirname` does not exist at runtime (use
  `fileURLToPath(import.meta.url)`); both bugs bit us on 14 Jul.
- **Blob ops budget:** queue batches reads/writes (1 list + 1 ledger write
  per run) to stay inside Hobby limits.
- **Auth:** `/api/data` accepts the team password header OR
  `Bearer $CRON_SECRET` (used by the cron to read the dataset).
