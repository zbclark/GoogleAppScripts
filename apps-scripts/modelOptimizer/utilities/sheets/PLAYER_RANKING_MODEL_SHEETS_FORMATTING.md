# Player Ranking Model — Google Sheets Formatting (Bound Script)

This repo generates a **formatting schema** for the *Player Ranking Model* rankings output.

- Schema source of truth (Node): `apps-scripts/modelOptimizer/utilities/rankingFormattingSchema.js`
- Generated artifacts:
  - `apps-scripts/modelOptimizer/utilities/ranking_formatting_schema.json`
  - `apps-scripts/modelOptimizer/utilities/ranking_formatting_schema.csv`

> This guide assumes you want the formatter **inside the spreadsheet** (bound script), not as an Apps Script library.

---

## 1) Sheet layout assumptions

The schema currently assumes:

- Sheet name: **"Player Ranking Model"**
- Notes column: **A**
- Table starts: **B** (Rank at **B5**)
- Header row: **5**
- Median row: **6** (synthetic row inserted by Node export)
- Player rows start: **7**

These are encoded in `ranking_formatting_schema.json`:

- `headerRow = 5`
- `medianRow = 6`
- `dataStartRow = 7`
- `conditionalFormattingStartRow = 7` (important: median row excluded)

---

## 2) Add the bound formatter (no library required)

1. In the Google Sheet: **Extensions → Apps Script**
2. Create a new script file (e.g. `PlayerRankingModelFormatter.bound.gs`)
3. Copy/paste the contents of:

   `apps-scripts/modelOptimizer/utilities/sheets/PlayerRankingModelFormatter.bound.gs`

4. Paste the **entire JSON** from:

   `apps-scripts/modelOptimizer/utilities/ranking_formatting_schema.json`

   into the `RANKING_FORMATTING_SCHEMA_JSON` constant in the script.

5. Reload the spreadsheet.

You should see a menu: **Rankings**

- **Rename active tab to Player Ranking Model**
- **Format Player Ranking Model**

---

## 3) What the formatter does

- Sets column widths from schema (including Notes = 350px)
- Styles header row (row 5)
- Styles the **MEDIAN** row (row 6) light blue
- Coerces imported numeric strings (including percent strings like `"12.3%"`) to actual numbers
- Applies number formats per column
- Replaces conditional formatting rules for the sheet with:
  - **Grey background** for `zeroAsNoData` columns *only* (prevents blanks being grey)
  - **Z-score-based coloring** for columns with `zScoreColoring: true` (computed from raw values)
  - **Trend coloring** for columns with `trend: true`

---

## 4) Slicer setup (recommended)

If you want interactive filtering (e.g., show only players above the median for some columns):

1. Select the table range starting at the header row (row 5). Include Notes column A.
2. **Data → Add a slicer**
3. In the slicer panel:
   - Choose the column to filter (e.g., `SG Total`, `WAR`, `Delta Predictive Score`)
   - Filter by condition:
     - **Greater than** a threshold, or
     - Use **Filter by values** and deselect blanks

### Tip: filtering vs median row

- Because MEDIAN is on row 6, most slicers will include it if you include the full table.
- Best practice: set your slicer range to start at **row 5** but consider excluding row 6 if you don’t want MEDIAN appearing in filtered results.

---

## 5) Common gotchas

- **If everything is a string:** Conditional formatting won’t behave until values are numeric. The formatter includes a coercion pass.
- **If blanks turn grey:** Grey is only applied where `zeroAsNoData` is true, and the rule uses `ISNUMBER(...)` so blanks should stay blank.
- **If the sheet is named differently:** Run **Rankings → Rename active tab** (or rename manually).

---

## 6) Updating the schema

If you change `rankingFormattingSchema.js` (e.g. add/remove columns or change row positions):

1. Re-run the generator:
   - `apps-scripts/modelOptimizer/scripts/generate_ranking_formatting_output.js`
2. Re-copy the updated JSON into your bound Sheet script.

