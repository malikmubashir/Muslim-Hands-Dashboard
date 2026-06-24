Drop your two N3O Excel exports here, then run `npm run refresh`.

  1. Transactions / giving export (list LS10385)
  2. Donor profiles export        (list LS10338)

Filenames do NOT matter. The refresh script auto-detects each file by its
column headers (content), not by name. If two files match the same role,
the most recently modified one wins.

These raw .xlsx exports contain personal data (PII) and are gitignored, so
they are NEVER committed. Only the anonymized public/data/donverse.json that
the script produces is committed/published.

See REFRESH-DATA.md in the project root for the full step-by-step workflow.
