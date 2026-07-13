
## How to update the data

Two ways, both producing the same anonymised aggregate:

- **In the app (recommended for operators).** Click **Update data** in the
  header, select the two N3O `.xlsx` exports, and confirm. The browser parses,
  anonymises and uploads the aggregate, and encrypts + uploads the contact
  dataset — no personal data leaves your browser in plaintext.

- **From the command line (for developers).** Drop the two exports into
  `data-source/` (gitignored) and run:

  ```bash
  npm run refresh          # regenerate the seed aggregate
  npm run refresh:build    # regenerate + production build
  ```

Full workflow: [`REFRESH-DATA.md`](REFRESH-DATA.md) and
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Language

The interface has a **French / English** toggle (`components/donverse/i18n.tsx`,
`<LangToggle/>`). The default is French; the choice is saved in `localStorage`.
Only the UI **chrome** is translated — data **values** from the N3O export
(cause names, stipulations, destinations, regions, cities, segment labels) are
kept verbatim because they double as filter keys for the donor downloads.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, the anonymised
  cube, the aggregation pipeline, geo data.
- [`docs/PRIVACY-AND-EXTRACTION.md`](docs/PRIVACY-AND-EXTRACTION.md) — the
  PII / encryption / download model.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel setup, env vars, endpoints,
  operational gotchas.
- [`docs/N3O-INTEGRATION.md`](docs/N3O-INTEGRATION.md) — for the CRM vendor:
  exact source columns and the path to an automatic feed.
# Webhook integration complete
