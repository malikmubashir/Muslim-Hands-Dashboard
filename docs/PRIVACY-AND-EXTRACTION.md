
## 5. The inline downloads — `lib/extractionExport.ts`

When the user clicks a chart segment, map zone or donor-segment chip, the app
calls `downloadDonorsForSlice(records, seed, range, opts?)`. This runs **entirely
in the browser** against the already-decrypted in-memory records — **no network
call, no plaintext PII leaves the page**:

1. **Filter** — `matchesGift` AND-combines the slice criteria (`seed`, an
   `ExtractionFilters` subset) with the date range. Dashboard/Map downloads use
   the current range; Donors-tab downloads pass `{ allTime: true }` to skip the
   date filter and include giftless donors.
2. **Dedupe** — `dedupeDonors` collapses matching gift records into **distinct
   donors** (keyed by `Account Reference`), aggregating their in-slice amount,
   gift count, causes/stipulations/destinations, and keeping their max lifetime
   value. Records with no reference are kept as their own one-off donors.
3. **Write** — `buildDonorWorkbook` builds a **branded, formatted `.xlsx`**
   (Muslim Hands turquoise title + period banner, bold header row, auto-filter,
   frozen header, sized columns, EUR/number formats) and triggers a browser
   download.

> **`compression: true` matters.** `XLSX.write(..., { compression: true })` is
> essential: SheetJS stores the zip **uncompressed** by default, which turns a
> ~56k-row export into ~60 MB instead of ~6 MB. Do not remove it. For the same
> size reason, per-cell styling is applied only to the header + numeric formats,
> not to every data cell.

## 6. Development mode

Under plain `vite` (dev) there is no `/api/extract` function and no ciphertext.
For local testing, `scripts/extract-dev.ts` writes a **plaintext**
`public/data/extraction-dev.json` from the `data-source/` exports, which the dev
client reads directly. **This file contains PII, is gitignored, and must never be
committed or deployed.** Production always uses the encrypted `/api/extract` path.

## 7. Summary of guarantees

- Raw N3O `.xlsx` exports are **gitignored** and never committed.
- The published aggregate (`donverse.json`) has **zero PII** and applies
  **min-5-donor postcode suppression**.
- The contact dataset is **encrypted client-side** (AES-GCM-256 / PBKDF2) and
  stored **ciphertext-only**; the server holds no key and never sees plaintext.
- Decryption and all donor downloads happen **in the browser, in memory only**.
- Every API endpoint is gated by the shared team password.
