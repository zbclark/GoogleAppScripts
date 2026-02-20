# Model Validation Status (as of 2026-02-20)

This document summarizes the current state of model validation and optimization, the metrics in use, recent changes, and open items that still need to be resolved. It is intended for cross‑device reference and continuity.

---

## 1) Current Modeling Goal
The model aims to rank players by predicted tournament performance using:
- Historical data (event and long‑term form)
- Similar course outcomes (iron/putting biased setups)
- Approach skill metrics + trends
- Course setup weighting and group/metric weights

Primary evaluation target: **predicted rank vs actual finish**.

---

## 2) What We’re Doing Now (Validation & Optimization)
### 2.1 Optimizer (modelOptemizer)
- Uses historical data and current field data to optimize group/metric weights.
- Computes correlations between metrics and finish positions across historical samples.
- Evaluates ranking accuracy and Top‑N hit rates.

**Correlation metric:**
- **Spearman correlation** is now used for rank‑based evaluation and metric correlations.

**WD/CUT handling:**
- WD/CUT/blank results are assigned **worst finish + 1** when correlating and evaluating rankings.

**Where the logic lives:**
- `apps-scripts/modelOptemizer/core/optimizer.js`

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

## 3) Metrics In Use
### Current Primary Metrics
- **Spearman correlation**: rank agreement between predictions and actual finish.
- **RMSE**: average prediction error magnitude.
- **Top‑N hit rates**: % of predicted Top‑N players who actually finish Top‑N.

### Still Present Elsewhere
- **Pearson correlation** is still used in:
  - `apps-scripts/Golf_Algorithm_Library/utilities/utilities_tournamentValidation.js`

If we want full consistency, we should switch that file to Spearman as well.

---

## 4) Data Inputs & Assumptions
### Required
- Historical tournament data for the event (5+ years).
- Similar course sets (putting/scoring courses).
- Approach skill data with period control (L12 / YTD / L24).

### Current Realities
- Pre‑tournament runs **do not include current‑year results**.
- Approach snapshots are available **now**, but historical as‑of snapshots are limited.

### Approach Data Strategy (Proposed)
- Use **L24** for events older than 2 years.
- Use **L12 or YTD** for recent events.
- Tag the approach period per event during validation so comparisons remain clear.

---

## 5) Completed vs Remaining

### Completed

- Spearman correlation and WD/CUT fallback applied in:
  - `apps-scripts/modelOptemizer/core/optimizer.js`
  - `apps-scripts/Golf_Algo_Validation_Library/utilities_DataLoading.js`
- Validation metrics set to Spearman + RMSE + Top‑N in the validation library.
- Approach period toggle documented (F12 for L12/YTD, F13 for historical).

### Remaining

- **Validation split strategy:** Implement event‑based K‑fold (rotate tournaments).
- **Spearman everywhere:** Update `apps-scripts/Golf_Algorithm_Library/utilities/utilities_tournamentValidation.js` to replace Pearson with Spearman.
- **Approach snapshot leakage:** Decide handling when true as‑of snapshots aren’t available. Option: run a **no‑approach baseline** for comparison.
- **Validation output scope:** Confirm whether to keep validation inside `Golf_Algo_Validation_Library` or extract a dedicated layer (only if scope expands).
- **Data sourcing roadmap:** Define API‑based validation data scope and plan to replace CSV history pulls (if still desired).
- **Optimizer sanity check:** Run a targeted optimizer sanity pass after the above validation decisions are locked.

### Open Questions (need answers)

- Do you want the event‑based K‑fold to be **strictly tournament‑level splits** (no shared fields across folds), or is a **season‑level split** acceptable for certain tests?
- For approach leakage, should we **exclude approach metrics** entirely in historical validation, or use **L24/L12/YTD approximations** with a clear leakage flag?
- Do you want to prioritize **API data ingestion** now, or keep the **CSV pipeline** as the source of truth for the current season?
- Should we update `utilities_tournamentValidation.js` immediately, or wait until the K‑fold workflow is in place to avoid duplicated refactors?

### Environment Setup Note (new machine/codespace)

- Dependencies are not committed; run `npm install` at the repo root to restore `node_modules`.
- Use the existing `package.json` and `package-lock.json` to keep installs consistent.

---

## 6) Files Touched Recently

- `apps-scripts/modelOptemizer/core/optimizer.js`
  - Added Spearman correlation + tie‑aware ranking.
  - Applied Spearman across correlation calculations and evaluations.
  - Added WD/CUT worst‑finish fallback.

- `apps-scripts/Golf_Algo_Validation_Library/utilities_DataLoading.js`
  - Added Spearman correlation, RMSE, Top‑N hit rates.
  - Improved finish parsing (T5, 5T, CUT, WD, DQ).
  - Added WD/CUT fallback logic.

- `apps-scripts/Golf_Algorithm_Library/sheetSetup/fetchAndWriteData.js`
  - Approach period toggle uses **F12** (L12/YTD), defaulting to YTD.
  - Historical period remains **F13**.

---

## 7) Recommended Next Steps

1) Implement event‑based K‑fold validation workflow.
2) Update `utilities_tournamentValidation.js` to use Spearman.
3) Decide approach‑snapshot policy and document it in validation results.
4) Confirm the data sourcing roadmap (API vs CSV).

---

If you want edits or additions to this doc (e.g., include formulas, example outputs, or validation run instructions), let me know and I’ll update it.

