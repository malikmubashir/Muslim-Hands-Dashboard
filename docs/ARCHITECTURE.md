
## 5. Normalisation & merges

Because the CRM data contains accent/case/spelling variants of the same value,
the aggregator (and the extraction builder — see below) normalise and merge them
so charts and downloads don't split one real category into several. All of these
live near the top of `lib/aggregateDonverse.ts`:

- **Theme** (`Fund Dimension 2`) — a `THEME_CANON` map keyed by a normalised
  form (trim → collapse whitespace → lowercase → strip accents) folds variants
  into canonical French labels, e.g. `generation de revenus` /
  `generations de revenue` / `activites generatrices de revenus` →
  **`Génération de revenus`**, `environement`/`environnement` →
  **`Environnement`**. Blank → `Non spécifié`.
- **Stipulation** (`Fund Dimension 3`) — `STIP_MAP` merges e.g.
  `Don / Sadaqa` → **`Sadaqa`**, and `Intérêts bancaires` / `Interets bancaires`
  / `Intérêt bancaire` → **`Intérêt`**; `Zakat El MAal` → `Zakat El Maal`.
- **Destination** (`Fund Dimension 1`) — `DEST_MAP` merges the "unrestricted"
  synonyms (`Selon les besoins…`) → **`Où le plus utile`**.
- **Payment method** — takes the part before `" - "` (payment family).
- **City / department** — `Locality` is upper-cased; department is derived from
  `Postal Code` (`deptFromPostal`, with Corsica `2A`/`2B` and DOM `97x`/`98x`
  handling), validated against the 13 metropolitan regions + DOM.

> The **extraction builder** (`lib/buildExtractionData.ts`) intentionally
> **mirrors these exact maps** so that a donor download filtered to, say,
> `Génération de revenus` lines up precisely with the chart it was clicked from.
> If you change a normalisation rule, change it in **both** files.

## 6. France geo data (`public/geo/`)

| File | Purpose |
| --- | --- |
| `regions.geojson` | 13 metropolitan region polygons (choropleth). Region names match the aggregator's `nom` exactly. |
| `departements.geojson` | Department polygons (choropleth). |
| `postcodes-fr.json` | Postcode → coordinate lookup (heatmap + search). |
| `cities-fr.json` | Normalised city name → `[lat, lng]` centroid (city search + heatmap). Built by `scripts/build-cities.mjs` from La Poste's official postcode base, restricted to cities actually present in the donation data. |

> **DOM note.** DOM departments (`971`–`976`) and their regions appear in the
> data slices for completeness but have **no polygon** in the metropolitan
> GeoJSON, so they do not render on the choropleth map. This is recorded in
> `meta.note`.
