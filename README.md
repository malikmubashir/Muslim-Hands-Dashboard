
## How the data stays current

Since 14 July 2026 the dashboard is fed by **two complementary flows**:

- **Nightly (automatic).** N3O sends webhook events (donations, accounts,
  pledges, regular/scheduled giving — 11 event types) to
  `/api/webhooks/n3o`, where they are PII-stripped and durably queued on
  Vercel Blob. A Vercel Cron drains the queue **daily at 21:00 UTC**
  (23:00 Paris in summer) and merges the day's donations into the rendered
  dataset: KPIs, themes, destinations, payments, timeline and the day×theme
  cube all advance without any human involvement.
  Details: [`WEBHOOK_AUTOMATION_COMPLETE.md`](WEBHOOK_AUTOMATION_COMPLETE.md).

- **Monthly (manual, ~15 min).** A CLI refresh from the two N3O list exports
  (giving LS10385 + donors LS10338) rebuilds the full baseline. This is what
  updates **geography** (donation webhooks carry no address), **donor
  attributes** (tiers, activity, consent, gender — no webhook carries
  cumulative history), the **PA dynamics**, and the encrypted
  contact-extraction dataset; it also reconciles refunds/amendments — the
  baseline always wins. Workflow: [`REFRESH-DATA.md`](REFRESH-DATA.md).

> The former in-app **Update data** button was removed on 14 July 2026 so
> staff cannot trigger ad-hoc uploads; the trigger is commented out in
> `components/donverse/DonverseApp.tsx` if it ever needs to return.

## Language

The interface has a **French / English** toggle (`components/donverse/i18n.tsx`,
`<LangToggle/>`). The default is French; the choice is saved in `localStorage`.
Only the UI **chrome** is translated — data **values** from the N3O export
(cause names, stipulations, destinations, regions, cities, segment labels) are
kept verbatim because they double as filter keys for the donor downloads.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, the anonymised
  cube, the aggregation pipeline, geo data.
- [`WEBHOOK_AUTOMATION_COMPLETE.md`](WEBHOOK_AUTOMATION_COMPLETE.md) — the
  live webhook pipeline: queue, nightly merge, verified state, known limits.
- [`REFRESH-DATA.md`](REFRESH-DATA.md) — the monthly baseline refresh,
  including the large-export (CSV) procedure and sequencing rules.
- [`docs/PRIVACY-AND-EXTRACTION.md`](docs/PRIVACY-AND-EXTRACTION.md) — the
  PII / encryption / download model.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel setup, env vars, endpoints,
  operational gotchas.
- [`docs/N3O-INTEGRATION.md`](docs/N3O-INTEGRATION.md) — for the CRM vendor:
  exact source columns and the path to an automatic feed.
