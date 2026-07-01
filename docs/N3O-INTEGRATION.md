
### B. Donor export — `LS10338` (one row per donor)

| Column | Type | Used for |
| --- | --- | --- |
| `Reference` | string | **Join key** — matched to transactions' `Account Reference`. |
| `Total Donation Amount` | number | Lifetime value (LTV) + generosity tier. |
| `Maximum Donation Date` | date | Activity segment (Active 2024+ / Inactive 2021–23 / Lapsed <2021). |
| `Type` | string | Donor type (Individual / Organization). |
| `RGPD POST IN` | string | GDPR postal consent + the raw consent category shown in the Donors tab. |
| `RGPD TELEMARKETING` | string | GDPR phone consent *(extraction/download only)*. |
| `RGPD EMAIL` | string | GDPR email consent *(extraction/download only)*. |
| `Postal Code` | string | Donor-**home** department/region. |
| `Title` | string | Civility + gender derivation *(extraction/download)*. |
| `First Name` | string | Contact *(extraction/download)*. |
| `Last Name` | string | Contact *(extraction/download)*. |
| `Organization Name` | string | Used as last name when the donor is an organisation *(download)*. |
| `Email` | string | Contact *(extraction/download)*. |
| `Telephone` | string | Contact *(extraction/download)*. |
| `Address Line 1` … `Address Line 4` | string | Joined into the contact address *(download)*. |
| `Locality` | string | Contact city *(download)*. |
| `Country` | string | Contact country *(download)*. |

> Columns marked *(extraction/download)* feed the **encrypted contact dataset**
> used to produce donor lists — they never appear in the public anonymised
> aggregate. See [`PRIVACY-AND-EXTRACTION.md`](PRIVACY-AND-EXTRACTION.md).

## File-detection signatures (for a compatibility check)

The pipeline classifies each file by these header sets — a feed that reproduces
them will be picked up automatically:

- **Transactions** — has **all** of: `Donation Amount (Base)`,
  `Fund Dimension 2`, `Postal Code`.
- **Donors** — has **both** `Total Donation Amount` and `Maximum Donation Date`,
  **and at least one** of `RGPD POST IN` or `Reference`.

## Notes for whoever builds the feed

- **Grain matters.** Keep the giving feed at **allocation grain** and keep both
  `Allocation Amount (Base)` (the per-row split) and `Donation Reference` (so
  splits can be counted back to whole donations). If a feed can only provide
  donation grain, tell us — the amount/count logic would need revisiting.
- **Value normalisation is handled our side.** Accent/case/spelling variants of
  causes, stipulations and destinations are merged in code; you can send the raw
  CRM strings.
- **Encoding/dates.** UTF-8 text and ISO-parseable dates are ideal; the current
  Excel reader accepts native Excel dates.
- **Reference stability.** `Account Reference` (transactions) and `Reference`
  (donors) must be the **same stable donor identifier** for the join to work.
