
## The `npm run refresh` data pipeline (CLI alternative)

For a developer refreshing the **bundled seed** from the command line (rather
than via the in-app modal):

```bash
# 1. Drop the two N3O exports into data-source/ (gitignored).
#    Filenames don't matter — detected by column headers, newest wins.

# 2. Regenerate the seed aggregate:
npm run refresh

# 3. Or regenerate AND produce a production build:
npm run refresh:build
```

`scripts/aggregate-donverse.ts` auto-detects the two files by their signature
columns, aggregates via the shared pure module, writes both
`api/_data/seed-donverse.json` (server seed) and `public/data/donverse.json`
(static fallback / dev), prints a summary, and ends with a reconciliation check
— you want to see **`RECONCILE: PASS`**. It never overwrites anything if it
can't find both files.

> This CLI path regenerates the **seed only**. Since 14 July 2026 the served
> dataset is whichever of {bundled seed, uploaded blob} has the newest
> `meta.generatedAt` (`api/data.ts`), so committing + redeploying a fresh seed
> is sufficient for the dashboard. The nightly webhook merge then overwrites
> the blob on top of it. The **encrypted extraction blob** (donor contact
> downloads) is the exception: it is encrypted in the browser with the team
> password and can only be refreshed via the Update-data modal, whose header
> button was removed on 14 Jul 2026 (trigger commented out in
> `components/donverse/DonverseApp.tsx` — restore temporarily if the contact
> dataset must be refreshed). See
> [`PRIVACY-AND-EXTRACTION.md`](PRIVACY-AND-EXTRACTION.md).
>
> Env vars in production: `DASHBOARD_PASSWORD` (team gate),
> `BLOB_READ_WRITE_TOKEN` (Blob store), `CRON_SECRET` (Vercel Cron auth; also
> accepted by `/api/data` as `Bearer` for the nightly merge).

## Privacy reminders for operators

- The raw `.xlsx` exports contain PII and are **gitignored** — never commit them.
- Only the anonymised `donverse.json` (zero PII) is committed and shipped.
- The dev-only `public/data/extraction-dev.json` is **plaintext PII** and is
  gitignored — never commit or deploy it.
