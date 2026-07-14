# Refreshing the dashboard data

The dashboard reads a single anonymized file: `public/data/donverse.json`.
That file is generated from two N3O CRM exports. Refreshing is one command.

You do **not** need to rename the exports — the script detects each file by its
contents, not its filename, and if several match, the newest one wins.

## Steps

1. **Download the two exports from N3O.**
   - Open the **giving / transactions** list (**LS10385**) and click **Download** → save the `.xlsx`.
   - Open the **donor** list (**LS10338**) and click **Download** → save the `.xlsx`.

2. **Move both files into the project's `data-source/` folder.**
   - You can leave the old files in place or replace them — the script
     auto-detects by content and uses the **most recently modified** match for
     each role.

3. **Run the refresh.**
   ```bash
   npm run refresh
   ```
   To regenerate the data **and** produce a production build for deployment:
   ```bash
   npm run refresh:build
   ```

4. **Done.** The dashboard now reflects the new data. If it is hosted, redeploy.

## What the script prints

It tells you which file it chose for each role so you can confirm, e.g.:

```
Detected TRANSACTIONS file: DASHBOARD DATA - 2025.xlsx  (modified 2026-06-24 10:12)
Detected DONORS file:       Liste donateurs global.xlsx  (modified 2026-06-24 10:11)
```

It finishes with a reconciliation check; you want to see:

```
RECONCILE: PASS
```

If a file can't be found, the script lists what it scanned and the exact
signature columns it expected, then exits without overwriting anything.

## Privacy

- The raw `.xlsx` exports contain personal data and are **gitignored**
  (`data-source/*.xlsx`), so they are never committed or published.
- Only the anonymized aggregate `public/data/donverse.json` (zero personal
  data) is committed and shipped to the dashboard.

## Large exports (>~500k rows / >50 MB xlsx)

Very large N3O exports produce sheet XML beyond Node's maximum string size —
SheetJS cannot parse them and the file is silently skipped during detection.
Convert to CSV first (dates become `YYYY-MM-DD` strings, which the pipeline
handles timezone-safely):

```bash
python3 - <<'EOF'
import openpyxl, csv, datetime
wb = openpyxl.load_workbook('data-source/BIG-EXPORT.xlsx', read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
def cell(v):
    if v is None: return ''
    if isinstance(v,(datetime.datetime, datetime.date)): return v.strftime('%Y-%m-%d')
    return v
with open('data-source/BIG-EXPORT.csv','w',newline='',encoding='utf-8') as f:
    w = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        w.writerow([cell(v) for v in row])
EOF
```

Then delete (or move away) the oversized `.xlsx` and run the refresh with a
larger heap:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run refresh
```

`data-source/*.csv` is gitignored just like the xlsx exports. Note that the
in-app "Update data" upload has the same parser limit — oversized exports must
go through this CLI path.

## Advanced

You can point the script at any folder instead of `data-source/`:

```bash
npm run refresh -- /path/to/some/other/folder
```

Source folder resolution order: a CLI path argument, else `data-source/` (if it
contains `.xlsx` files), else the legacy `~/Documents/GitHub/_mhf_source`.
