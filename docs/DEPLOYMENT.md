
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

> This CLI path regenerates the **seed only**. It does **not** touch the
> uploaded Blob or the encrypted extraction blob on a live deployment — those
> are refreshed by the in-app **Update data** flow (see
> [`PRIVACY-AND-EXTRACTION.md`](PRIVACY-AND-EXTRACTION.md)). After changing the
> seed, commit and redeploy; then re-upload in the app if you want the live data
> and extraction to match.

## Privacy reminders for operators

- The raw `.xlsx` exports contain PII and are **gitignored** — never commit them.
- Only the anonymised `donverse.json` (zero PII) is committed and shipped.
- The dev-only `public/data/extraction-dev.json` is **plaintext PII** and is
  gitignored — never commit or deploy it.
