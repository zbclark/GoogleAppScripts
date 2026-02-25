# Model Validation Status (as of 2026-02-23)

This document summarizes the current state of model validation and optimization, the metrics in use, recent changes, and open items that still need to be resolved. It is intended for cross‑device reference and continuity.

---

## 1. Current Modeling Goal

The model aims to rank players by predicted tournament performance using:

- Historical data (event and long‑term form)
- Similar course outcomes (iron/putting biased setups)
- Approach skill metrics + trends
- Course setup weighting and group/metric weights

Primary evaluation target: **predicted rank vs actual finish**.

---

## 2. What We’re Doing Now (Validation & Optimization)

### 2.1 Optimizer (modelOptimizer)

- Uses historical data and current field data to optimize group/metric weights.
- Computes correlations between metrics and finish positions across historical samples.
- Evaluates ranking accuracy and Top‑N hit rates.

**Correlation metric:**

- **Spearman correlation** is now used for rank‑based evaluation and metric correlations.

**WD/CUT handling:**

- WD/CUT/blank results are assigned **worst finish + 1** when correlating and evaluating rankings.

**Where the logic lives:**

- `apps-scripts/modelOptimizer/core/optimizer.js`

### 2.2 Validation Library (Golf_Algo_Validation_Library)

- Pulls predictions from each tournament workbook and matches them to actual results.
- Computes validation metrics:

  - **Spearman correlation** (predicted rank vs finish)
  - **RMSE** on finish position
  - **Top‑N hit rates** (Top 5 / 10 / 20 / 50)

**WD/CUT handling:**

- Same fallback: **worst finish + 1**.

**Where the logic lives:**

- `apps-scripts/Golf_Algo_Validation_Library/utilities_DataLoading.js`

---

## 3. Metrics In Use

### Current Primary Metrics

- **Spearman correlation**: rank agreement between predictions and actual finish.
- **RMSE**: average prediction error magnitude.
- **Top‑N hit rates**: % of predicted Top‑N players who actually finish Top‑N.

### Still Present Elsewhere

- No remaining Pearson-based validation paths in the tournament validation utilities.

---

## 4. Data Inputs & Assumptions

### Required

- Historical tournament data for the event (5+ years).
- Similar course sets (putting/scoring courses).
- Approach skill data with period control (L12 / YTD / L24).

### Current Realities

- Pre‑tournament runs **do not include current‑year results**.
- Approach snapshots (**ytd**) are available **now**, but historical as‑of snapshots are limited (**l24/l12**).

### Approach Data Strategy (Proposed)

- Use **L24** for events older than 2 years.
- Use **L12** for events from last season.
- Use **YTD** for events from this season AFTER the WM Phoenix Open.
- Tag the approach period per event during validation so comparisons remain clear.

---

## 5. Completed vs Remaining

### Completed

- Pre‑tournament readiness checklist added (Section 8).
- Course‑history regression now runs at optimizer start when templates are enabled.
- Delta player scores writebacks documented for pre‑tournament runs.
- Pre‑event optimizer now outputs **sheet‑like rankings** (full metrics/trends/notes) alongside results.
- Rankings exports now include **CSV + TXT + JSON** with consistent ordering and full columns.
- Delta course‑setup notes now include **bucket signal** summary (BucketSig + ΔPred/ΔTrend) in Node output.
- Metric analysis now matches GAS rounding + Spearman ranking behavior, with lower‑is‑better inversion parity.
- Metric analysis sources now prefer post‑tournament results/historical metrics (rankings only as fallback).
- Results JSON rebuilds include full historical metrics + derived scoring fields when missing.
- Model delta trends now aggregate across all season tournaments (not just the last run).
- Processing log now records inputs, sources, data counts, and which outputs were overwritten.

### Remaining

- **Approach snapshot leakage:** Use **L24/L12/YTD approximations** with a clear leakage flag in outputs (Option B selected).
- **Validation output scope:** Plan to **migrate validation from Apps Script libraries to Node** over time.
- **Course‑history regression API wiring:** Replace CSV inputs with API ingestion.
- **Data sourcing roadmap:** **API ingestion is primary**; CSV is fallback only until API wiring is complete.
- **Optimizer sanity check:** Run a targeted optimizer sanity pass after the above validation decisions are locked.
- **K‑fold policy:** Run both **event‑based** and **season‑based** splits (season‑based may be limited early season).
- **Baseline comparison:** Add a **no‑approach baseline** to isolate approach data timing effects.
- **Post‑tournament review:** Review and validate the **post‑tournament mode** workflow in `MODEL_VALIDATION_AND OPTIMIZATION.md`.
- **Approach delta naming conventions:** Confirm and document the finalized file naming pattern for approach delta JSONs.
- **Historical rounds cache:** Revisit DataGolf historical rounds fetch to avoid duplicative/additive cache files.

### Open Questions

- None (decisions captured in “Remaining”).

### Environment Setup Note (new machine/codespace)

- Dependencies are not committed; run `npm install` at the repo root to restore `node_modules`.
- Use the existing `package.json` and `package-lock.json` to keep installs consistent.

---

## 6. Files Touched Recently

- `apps-scripts/modelOptimizer/core/optimizer.js`
  - Pre‑event rankings now exported in sheet‑like CSV/TXT/JSON format.
- `apps-scripts/modelOptimizer/MODEL_VALIDATION_AND OPTIMIZATION.md`
  - Pre‑tournament workflow, delta inputs/outputs, and writebacks expanded.
- `apps-scripts/modelOptimizer/core/modelCore.js`
  - Added course‑setup bucket signal notes to delta summaries.
- `MODEL_VALIDATION_STATUS.md`
  - Added the pre‑tournament readiness checklist and updated status items.

---

## 7. Recommended Next Steps

1) Run the **full post‑tournament optimizer** (seeded runs + tests + event K‑fold).
2) Re‑check that **all required inputs** for post‑tournament runs are present and wired correctly before running.

### Recent Validation Parity Checklist

- ✅ Metric analysis rounding/correlation aligned with GAS
- ✅ Metric analysis averages sourced from results/historical data
- ✅ Model delta trends aggregate across season
- ✅ Processing log includes outputs + overwrite flags

---

## 8. Pre‑Tournament Readiness Checklist (Sanity‑Check Prereqs)

Use this before running the optimizer sanity check. This is the **single source of truth** for required data sources, source directories, and expected outputs.

### 8.1 API Sources (Primary)

- What naming conventions are expected for the data being writtin or called based?  I have some data (csvs/json) in the repo that will need to be renamed.

- **DataGolf API key**
  - Env: `DATAGOLF_API_KEY`
- **Historical rounds snapshots** (5‑year event history, similar/putting scope)
  - Source: API via `utilities/dataGolfClient.js`
  - Cache: `apps-scripts/modelOptimizer/data/cache/`
- **Approach snapshots**
  - L24 → `apps-scripts/modelOptimizer/data/approach_snapshot/approach_l24.json`
  - L12 → `apps-scripts/modelOptimizer/data/approach_snapshot/approach_l12.json`
  - YTD (latest) → `apps-scripts/modelOptimizer/data/approach_snapshot/approach_ytd_latest.json`
- **Field updates**
  - Source: API via `utilities/dataGolfClient.js`
  - Cache: `apps-scripts/modelOptimizer/data/cache/`
- **Rankings / skill ratings / decompositions**
  - Source: API via `utilities/dataGolfClient.js`
  - Cache: `apps-scripts/modelOptimizer/data/cache/`

### 8.2 Approach Delta Inputs (API‑first)

- **Current snapshot:** API approach snapshot (current week)
- **Previous snapshot:** API approach snapshot from **prior week’s YTD**
- **Field filter (optional):** API field snapshot for the tournament

### 8.3 CSV Inputs (Still Required Where API Not Wired)

- **Course‑history regression** (past performance)
  - Script: `apps-scripts/modelOptimizer/scripts/analyze_course_history_impact.js`
  - Inputs (CSV):
    - `* - Historical Data.csv`
    - `* - Configuration Sheet.csv`
  - Output utilities (when templates enabled):
    - `apps-scripts/modelOptimizer/utilities/courseHistoryRegression.js`
    - `apps-scripts/Golf_Algorithm_Library/utilities/courseHistoryRegression.js`

### 8.4 Required Config Files (Event 7)

- **Course context**
  - File: `apps-scripts/modelOptimizer/utilities/course_context.json`
  - Verify event `"7"` entry exists with:
    - `templateKey`, `courseNum`, `courseNums`, `shotDistribution`, `similarCourseIds`, `puttingCourseIds`, `pastPerformance`
    - `sourcePath` pointing to the event’s configuration sheet
- **Weight templates**
  - File: `apps-scripts/modelOptimizer/utilities/weightTemplates.js`
  - Ensure `BALANCED` (or event‑specific) template exists and is up‑to‑date

### 8.5 Pre‑Tournament Outputs / Writebacks

- **Optimizer outputs**
  - `apps-scripts/modelOptimizer/data/<season>/<tournament-slug>/pre_event/<tournament>_pre_event_results.json`
  - `apps-scripts/modelOptimizer/data/<season>/<tournament-slug>/pre_event/<tournament>_pre_event_results.txt`
- **Template writebacks (when `--writeTemplates`)**
  - `apps-scripts/modelOptimizer/utilities/weightTemplates.js`
  - `apps-scripts/Golf_Algorithm_Library/utilities/templateLoader.js`
- **Delta player scores writebacks**
  - `apps-scripts/modelOptimizer/utilities/deltaPlayerScores.js`
  - `apps-scripts/Golf_Algorithm_Library/utilities/deltaPlayerScores.js`
- **Dry‑run outputs**
  - Written under the run's output directory (typically `.../pre_event/`):
    - `apps-scripts/modelOptimizer/data/<season>/<tournament-slug>/pre_event/dryrun_weightTemplates.js`
    - `apps-scripts/modelOptimizer/data/<season>/<tournament-slug>/pre_event/dryrun_templateLoader.js`
    - `apps-scripts/modelOptimizer/data/<season>/<tournament-slug>/pre_event/dryrun_deltaPlayerScores.node.js`
    - `apps-scripts/modelOptimizer/data/<season>/<tournament-slug>/pre_event/dryrun_deltaPlayerScores.gas.js`

### 8.6 Approach Delta Outputs

- **JSON only** (CSV not required)
  - `apps-scripts/modelOptimizer/data/approach_deltas/approach_deltas_<tournament>_<date>.json`

### 8.7 Sanity‑Check Gate

- ✅ All API snapshots available or cached
- ✅ `course_context.json` event 7 entry present and correct
- ✅ `weightTemplates.js` updated for event/template
- ✅ `courseHistoryRegression.js` generated (if past‑performance weighting needed)
- ✅ `deltaPlayerScores.js` writeback expected when `--writeTemplates`

---

If you want edits or additions to this doc (e.g., include formulas, example outputs, or validation run instructions), let me know and I’ll update it.
