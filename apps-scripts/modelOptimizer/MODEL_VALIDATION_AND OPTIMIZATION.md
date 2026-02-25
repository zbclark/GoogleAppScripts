# Model Validation and Optimization (modelOptimizer)

This document provides a **detailed, review-friendly** guide to how `apps-scripts/modelOptimizer/core/optimizer.js` behaves in **pre‑tournament** and **post‑tournament** modes, including inputs, outputs, decisions, and validation logic. The goal is to make configuration intent explicit and auditable.

> Scope: **Node-based optimizer** only. This is the source of truth for validation/optimization moving forward. Apps Script validation remains legacy and is slated for migration to Node.

---

## Data Directory Convention (Quick Reference)

**Root:** `apps-scripts/modelOptimizer/data/`

### Naming conventions

- **Season folder:** 4‑digit year (e.g., `2025`).
- **Tournament slug:** lowercase, hyphen‑separated, no year, no punctuation (e.g., `genesis-invitational`, `wm-phoenix-open`).
- **Manifest:** `data/<season>/manifest.json` contains `{ eventId, season, tournamentSlug, tournamentName }` entries.
- **Mode folders:** `pre_event` and `post_event` only (no other variations).
- **Artifacts:** use stable **suffixes** (e.g., `*_pre_event_results.json`, `*_pre_event_rankings.csv`, `<tournament-slug>_results.json`) and never include dates in filenames (dates belong in file content).
  - **Exception:** approach delta JSONs are date‑stamped: `approach_deltas_<tournament-slug>_YYYY_MM_DD.json`.

### Example directory tree

data/
  cache/
  2026/
    manifest.json
    genesis-invitational/
      inputs/
        Genesis Invitational (2026) - Configuration Sheet.csv (optional input)
        Genesis Invitational (2026) - Tournament Field.csv (optional input)
        Genesis Invitational (2026) - Historical Data.csv (optional input)
        Genesis Invitational (2026) - Approach Skill.csv (optional input)
      pre_event/
        {tournament-slug}_pre_event_results.json
        {tournament-slug}_pre_event_results.txt
        {tournament-slug}_pre_event_rankings.json
        {tournament-slug}_pre_event_rankings.csv
        course_history_regression/
          summary.csv
          details.csv
          summary_similar.csv
          details_similar.csv
          course_history_regression.json (required input; generated during optimizer.js runs)
        dryrun/
          dryrun_weightTemplates.js
          dryrun_deltaPlayerScores.node.js
      post_event/
        {tournament-slug}_post_event_results.json
        {tournament-slug}_post_event_results.txt
        genesis-invitational_results.json
        genesis-invitational_results.csv
    validation_outputs/
      validation_summary.csv
      validation_summary.json
      tournament_genesis-invitational.json
      calibration_report.csv

## 1. High‑Level Purpose

The optimizer produces tournament‑specific weights (group + metric) that aim to predict player finish order, with emphasis on:

- Rank agreement (Spearman correlation)
- Error magnitude (RMSE/MAE)
- Top‑N hit rates (Top‑10/Top‑20)
- Alignment to validated metric signals

It uses both **historical rounds** and **current‑season data**, and can optionally include approach skill metrics and delta‑trend priors.

---

## 2. Modes & When Each Runs

### **Pre‑Tournament Mode**

Triggered when **current‑year results are not available**. This is the default before a tournament concludes.

**Primary goal:** produce a blended, pre‑event template based on historical + similar course data, with optional approach delta priors.

**Manual override:** pass `--pre` to force pre‑tournament mode (results are ignored for mode selection).

### **Post‑Tournament Mode**

Triggered when **current‑year results exist** for the event.

**Primary goal:** run full optimization + validation (baseline vs optimized), including multi‑year validation and event K‑fold, then write a recommended template if warranted.

**Manual override:** pass `--post` to force post‑tournament mode (requires results; run will error if none found).

---

## Quick Pre/Post Checklist

### Pre‑Tournament

- [ ] Inputs present (historical rounds, field, approach snapshots)
- [ ] Suggested weights computed
- [ ] CV reliability computed
- [ ] Pre‑event outputs written
- [ ] Optional writeback verified

### Post‑Tournament

- [ ] Current results available
- [ ] Baseline template comparison complete
- [ ] Optimization search completed
- [ ] Multi‑year validation complete
- [ ] Event K‑fold validation complete
- [ ] Outputs written & reviewed

#### Post‑Tournament Run Readiness (Seeded + K‑fold)

- [ ] Results JSON present (`post_event/<tournament-slug>_results.json`)
- [ ] Pre‑event rankings present (`pre_event/rankings.csv` or `rankings.json`)
- [ ] Historical rounds available (CSV or API cache)
- [ ] Approach snapshots available (L24/L12/YTD, or CSV fallback)
- [ ] Course context is wired (eventId entry with similar/putting lists)
- [ ] `OPT_SEED` / `OPT_TESTS` set for seeded runs (when used)
- [ ] `EVENT_KFOLD_K` / `EVENT_KFOLD_SEED` configured for K‑fold (when used)
- [ ] Outputs directory resolved and writable

---

## Example Run Setup (End‑to‑End)

Below is an example of how a **post‑tournament** run is completed, including the data files and where they come from. Replace values in brackets with real tournament values.

### Example Inputs (API Primary, CSV optional)

The optimizer expects API snapshots for:

- **Recent‑form rounds:** last 3 / 6 / 12 months
- **Event history rounds:** last 5 years for
  - current eventId
  - similar‑iron eventIds
  - similar‑putting eventIds
- **Current field**
- **Approach snapshots:** L24, L12, YTD
- **Results** (post‑tournament only)

When API snapshots are present, they are recorded in `apiSnapshots` within the JSON output and cached under `data/cache/`.

### CSV Inputs (When API not available or for first‑pass seeding)

- `data/<season>/<tournament>/inputs/<Tournament> (<Season>) - Configuration Sheet.csv`
- `data/<season>/<tournament>/inputs/<Tournament> (<Season>) - Tournament Field.csv`
- `data/<season>/<tournament>/inputs/<Tournament> (<Season>) - Historical Data.csv`
- `data/<season>/<tournament>/inputs/<Tournament> (<Season>) - Approach Skill.csv`

### Example Command (Post‑Tournament)

- `node core/optimizer.js --event <eventId> --season <season> --tournament "<Tournament>" --post --dryRun`

### What Data It Uses (and From Where)

- **Recent‑form rounds (3/6/12 months)** → API recent‑form snapshots (CSV fallback: historical data)
- **Event history (5 years)** → API event history snapshots (CSV fallback: historical data)
- **Current season results** → results JSON (CSV seed in `data/<season>/<tournament>/inputs/`, then cached in `data/cache/`)
- **Current season results** → results JSON derived from Historical Data CSV (if present), otherwise API rounds payload
- **Approach snapshots (L24/L12/YTD)** → API approach snapshots (CSV fallback: approach skill CSV)
- **Similar/putting event IDs** → `utilities/courseContext.js` or configuration sheet
- **Template weights** → `utilities/weightTemplates.js`

### Outputs Created

- `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.json`
- `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.txt`
- `data/<season>/validation_outputs/validation_summary.csv`
- `data/<season>/validation_outputs/validation_summary.json`
- `data/<season>/validation_outputs/tournament_<name>.json`

### Related Scripts/Utilities

- `core/optimizer.js` — main pipeline
- `utilities/dataPrep.js` — historical round parsing
- `utilities/weightTemplates.js` — template sources
- `utilities/approachDelta.js` — approach delta computation helpers (used by optimizer)
- `scripts/summarizeSeedResults.js` — compare seeded runs (optional)

---

## 3. Pre‑Tournament Mode (Detailed)

### 3.1 Inputs (Pre‑Tournament)

- **API snapshots (primary)**
  - Recent‑form rounds (last **3 / 6 / 12 months**)
  - Event‑specific history (last **5 years**) for:
    - current eventId
    - similar‑iron events (course context for eventId)
    - similar‑putting events (course context for eventId)
  - Current field
  - Approach skill snapshots (L24/L12/YTD) in `data/approach_snapshot`
  - Optional results (when available)

- **CSV fallback** (same structure as API snapshots)
  - `* - Historical Data.csv`
  - `* - Tournament Field.csv`
  - `* - Approach Skill.csv`
- Similar course list + weights in `utilities/course_context.json`
- Putting‑biased course list + weights in `utilities/course_context.json`
- Approach delta prior in `data/approach_deltas`
- **Pre‑tournament baseline template configuration** (required)
  - Source: `utilities/weightTemplates.js`
  - Fallback: template specified by `templateKey` in `utilities/course_context.json` for the eventId
- **Past‑performance weight** (required for historical/long‑term signal)
  - Source: `utilities/course_context.js`

### 3.2 Core Steps (Pre‑Tournament)

1. **Course history regression (past performance)**
    - Generate course‑history regression inputs **before** running the optimizer when course‑history weighting is desired.

1. **Historical metric correlations**
    - Uses historical rounds for eventId to compute Spearman correlations per metric.

1. **Training correlations (historical outcomes)**
    - Builds correlations for model‑generated metrics from historical rounds only.

1. **Approach delta prior**
    - Rolling or explicit delta priors are loaded and used for alignment scoring.

1. **Top‑20 signal (historical outcomes)**
    - Builds Top‑20 correlations and/or logistic model signal.

1. **Suggested weights**
    - Builds **suggested metric weights** from Top‑20 signal + logistic model.
    - Builds **suggested group weights** from metric weights.

1. **CV reliability (event‑based)**
    - CV reliability score is computed and used to conservative‑blend group weights.

1. **Blend weights with prior template**
    - Prior vs model share (default 60% / 40%)
    - Group weights and metric weights are filled/normalized and blended.

1. **Apply course setup adjustments**
    - Applies course setup / shot distribution adjustments to metrics.

### 3.2a Exact Data Usage by Step (Pre‑Tournament)

Below is a step‑by‑step view of **exact data used**, **time windows**, and **utilities/scripts** involved.

#### Step 0 — Course History Regression (Past Performance)

- **What it does:** Builds the course‑history regression map used to weight past‑performance signals.
- **When to run:** **Before** the optimizer if you want course‑history weighting applied.
- **Integration:** wired into the optimizer wrapper and executed at the **start** of `runAdaptiveOptimizer()`.
- **Data used (currently CSV‑based):**
  - Historical rounds/results (`* - Historical Data.csv`)
  - Configuration sheet (`* - Configuration Sheet.csv`) for course/event mapping
- **Sources:**
  - CSV only (API ingestion not wired for this step yet)
- **TODO:** Add API ingestion for historical rounds + configuration inputs so this step is API‑first.
- **Utilities/Scripts:**
  - `scripts/analyze_course_history_impact.js`
- **Outputs:**
  - `data/<season>/<tournament>/pre_event/course_history_regression/summary.csv`
  - `data/<season>/<tournament>/pre_event/course_history_regression/details.csv`
  - `data/<season>/<tournament>/pre_event/course_history_regression/summary_similar.csv`
  - `data/<season>/<tournament>/pre_event/course_history_regression/details_similar.csv`
  - `data/<season>/<tournament>/pre_event/course_history_regression/course_history_regression.json` (when templates enabled)
  - `apps-scripts/modelOptimizer/utilities/courseHistoryRegression.js` (when templates enabled)
  - `apps-scripts/Golf_Algorithm_Library/utilities/courseHistoryRegression.js` (when templates enabled)

#### Step 1 — Historical Metric Correlations

- **Data used:**
  - Recent‑form rounds (last **3 / 6 / 12 months**)
  - Event history (last **5 years**) for eventId + similar iron/putting events
- **Approach snapshots:** *not used in Step 1* (Step 1 is raw rounds‑only correlations).
- **Time window:**
  - Recent‑form windows: 3, 6, 12 months
  - Event history: 5 years
- **Sources:**
  - API (primary): rounds snapshots for recent‑form + event history
  - CSV fallback: `* - Historical Data.csv`
- **Utilities/Scripts:**
  - `core/optimizer.js` (correlation logic)
  - `utilities/dataPrep.js` (round parsing + normalization)

#### Step 2 — Training Correlations (Historical Outcomes)

- **Data used:**
  - **Current Event/Recent History:**
    - Recent‑form rounds (last **3 / 6 / 12 months**) from API rounds snapshots
    - Event history (last **5 years**) for the current eventId
  - **Group/Metric/Past Performance Weight Configuration:**
    - `utilities/course_context.json` → `pastPerformance` key (defines how past performance is blended/weighted)
    - Baseline group/metric weights from `utilities/weightTemplates.js`
    - **Fallback for event‑specific weights:** `utilities/course_context.json` (templateKey when explicit event weights are missing in `utilites/weightTemplates.js`)
  - **Similar‑iron performance:**
    - Event history (last **5 years**) for eventIds listed in `utilities/course_context.json` → `similarIronEventIds`
  - **Similar‑putting performance:**
    - Event history (last **5 years**) for eventIds listed in `utilities/course_context.json` → `similarPuttingEventIds`
  - **Field filter (when available):** current field snapshot to align historical samples to the present‑day field
- **Time window:**
  - Recent‑form: 3/6/12 months
  - Event history: 5 years
- **Similar/Putting scope:**
  - Defined in course context for the current eventId (`utilities/course_context.json`)
- **Sources:**
  - API (primary): recent‑form + event history snapshots
  - CSV fallback: `* - Historical Data.csv`
- **Utilities/Scripts:**
  - `core/optimizer.js` (generated metric correlation computation)
  - `utilities/dataPrep.js`

**How model‑generated metrics are built (Step 3.2.2):**

- **Step 1 — Gather inputs**
  - Load recent‑form rounds (3/6/12 months) + 5‑year event history (current eventId + similar iron/putting lists).
  - Apply event filters using `utilities/course_context.json` (similarIronEventIds / similarPuttingEventIds).
  - Apply field filter when a current field snapshot exists.
  - Load group/metric weight configuration:
    - Event‑specific weights from `utilities/weightTemplates.js` when available.
    - Fallback to `templateKey` in `utilities/course_context.json` if no event‑specific weights exist.
  - Load past‑performance blending config from `utilities/course_context.json` → `pastPerformance`.
  - Load approach snapshots (L24/L12/YTD) when available; otherwise exclude approach groups.
  - Load approach delta priors (if enabled) from `data/approach_deltas` for alignment/score adjustments.
- **Step 2 — Build per‑player feature rows**
  - `runRanking()` calls `buildPlayerData()` to aggregate round‑level stats into player‑level features.
  - Utilities involved: `utilities/dataPrep.js` (round parsing/normalization).
- **Step 3 — Apply standard modifiers**
  - Past‑performance blending (from `utilities/course_context.json` → `pastPerformance`) is applied.
  - Trend adjustments are applied where configured.
  - Data coverage and data confidence modifiers are applied when generating final inputs.
  - Approach snapshots (L24/L12/YTD) are injected into `runRanking()` when available.
  - Approach delta priors can influence alignment/weighted score inputs when enabled.
- **Step 4 — Generate model metrics & scores**
  - `generatePlayerRankings()` (in `core/modelCore.js`) converts player features into the model‑generated metric vector and weighted score per player.
  - The metric vector is the basis for Top‑N signal and correlation tests.
- **Step 5 — Correlate vs outcomes**
  - Generated metrics are correlated against historical finish positions to produce Step 2 training correlations.

**Implementation references:**

- Orchestration: `core/optimizer.js`
- Player feature assembly: `utilities/dataPrep.js` → `buildPlayerData()`
- Metric generation & scoring: `core/modelCore.js` → `generatePlayerRankings()`

**Approach data used (Step 3.2.2):**

- **Pre‑tournament training correlations** use **approach snapshots only if available**; otherwise approach groups are excluded.
- **Snapshot policy:**
  - **Events older than 2 years:** L24
  - **Last season:** L12
  - **Current season:** YTD (post‑WM Phoenix)
- **Source:** API approach snapshots (L24/L12/YTD). CSV `* - Approach Skill.csv` is fallback only.
- **Integration point:** approach rows are passed into `runRanking()`; if missing, `removeApproachGroupWeights()` is applied so approach metrics are not used.

**Approach snapshot refresh policy (Node):**

- **L24:** fetched once (as soon as missing), then reused until manually refreshed.
- **L12:** fetched once initially, then refreshed **end‑of‑season** only.
  - **Automatic refresh trigger:** when running the **post‑tournament** analysis for the **Tour Championship eventId** (default `60`).
    - Override with `APPROACH_L12_REFRESH_EVENT_ID=<eventId>`.
  - **Fallback window:** when `APPROACH_L12_REFRESH_MONTH` is reached (default **December**) and the current season is newer than the last L12 archive.
  - **Manual override:** set `APPROACH_L12_FORCE_REFRESH=1` or `APPROACH_L12_REFRESH_SEASON=<YYYY>`.
  - **Post‑tournament gate:** L12 refresh is only evaluated when the run detects post‑tournament results for the event.
- **YTD:** refreshed weekly as part of normal runs; archive retention keeps the last 4 snapshots for delta generation.

**Approach snapshot retention (Node):**

- **Latest files (always kept):**
  - `data/approach_snapshot/approach_l24.json`
  - `data/approach_snapshot/approach_l12.json`
  - `data/approach_snapshot/approach_ytd_latest.json`
- **Archive files (rotated):**
  - `approach_l24_YYYY-MM-DD.json`
  - `approach_l12_YYYY-MM-DD.json`
  - `approach_ytd_YYYY-MM-DD.json`
- **Default retention policy (Node):**
  - **YTD:** keep last **4** weekly archives (current + recent history for delta generation)
  - **L24:** keep **all** dated archives (multi‑season baseline)
  - **L12:** keep **all** dated archives (end‑of‑season snapshots)
- **Env overrides:**
  - `APPROACH_SNAPSHOT_RETENTION_YTD` (min 2)

#### Step 3 — Approach Delta Prior

- **What it does:** Loads or builds **approach delta priors** (rolling or explicit) and converts them into an **alignment map** that can be blended into Top‑20 alignment/scoring.
  - Computed **before** Step 3.2.2/Step 4 so the priors are available during model‑metric generation and Top‑20 alignment.
- **Data used:**
  - Rolling deltas from the most recent `approach_deltas*.json` files
  - or explicit delta file provided
- **Time window:**
  - Rolling mode defaults to last **4 events** (configurable)
  - Delta windows reflect **week‑to‑week** approach skill snapshots
- **Utilities/Scripts:**
  - `core/optimizer.js` (delta auto-generation, rolling aggregation + alignment map)
  - `utilities/approachDelta.js` (delta computation)

**How deltas are created:**

- **Generated inside the optimizer (Node-only):** `core/optimizer.js` will auto-generate a delta JSON in **pre-tournament mode** when no existing delta is found.
- **Inputs (API-first):**
  - **Current:** approach snapshot (usually the latest YTD snapshot)
  - **Previous:** prior YTD archive snapshot
  - Optional field snapshot to filter deltas to the tournament field
- **CSV fallback:** if snapshots are missing, it can fall back to the most recent pair of `* - Approach Skill.csv` files.
- **What it produces:**
  - JSON: `data/approach_deltas/approach_deltas_<tournament-slug>_YYYY_MM_DD.json`
  - JSON includes `meta` (timestamps, sources) and `rows` (per-player delta metrics)

**How delta scores are generated (inside optimizer):**

- **Alignment map:** built from delta correlations via `buildApproachDeltaAlignmentMap()`
- **Player scores:** `buildApproachDeltaPlayerScores()` produces trend‑weighted and predictive‑weighted scores
- **Outputs:**
  - Included in JSON under `approachDeltaPrior` (alignment map + correlations)
  - Player summaries in `approachDeltaPrior.playerSummary` (top/bottom movers)

#### Step 4 — Top‑20 Signal (Historical Outcomes)

- **Data used:** Same as Step 2.
- **Time window:** 3/6/12 months + 5‑year event history.
- **Utilities/Scripts:**
  - `core/optimizer.js` (Top‑N correlations + logistic modeling)

#### Step 5 — Suggested Weights (Metric + Group)

- **What it does:** Generates **suggested metric weights** and **suggested group weights** from the Top‑20 signal (and logistic model if available).
  - Metric weights prefer **Top‑20 logistic weights** when the model succeeds; otherwise they fall back to **Top‑20 correlation weights**.
  - Metric weights are **normalized by absolute weight**; group weights are built by **summing metric abs‑weights per group** and normalizing.
- **Data used:** Top‑20 signal + logistic model results (from Step 3), which are built from historical rounds + results (event + similar/putting scope).
- **Utilities/Scripts:**
  - `core/optimizer.js` → `buildSuggestedMetricWeights()` and `buildSuggestedGroupWeights()`

#### Step 6 — CV Reliability (Event‑based)

- **What it does:** Computes a **reliability score** from event‑level CV of the Top‑20 logistic model, then uses that score to **conservatively blend** suggested group weights.
  - **This is not K‑fold over rounds**; it’s **event‑level CV** for the Top‑20 logistic model (see `crossValidateTopNLogisticByEvent()`), summarized by `computeCvReliability()`.
- **Data used:** Event‑level samples built from the **same training rounds/results used in Step 3** (event + similar/putting scope).
  - Pre‑tournament (no current results): historical event samples from historical rounds/results for the eventId + similar/putting lists.
  - Post‑tournament (current results): current‑season event samples when enough events exist; otherwise falls back to all‑season event samples.
- **Time window:** Same as Step 3’s training scope.
  - Pre‑tournament: recent‑form + 5‑year event history (event + similar/putting).
  - Post‑tournament: current season (event + similar/putting), with fallback to all seasons if event count is too small.
- **Utilities/Scripts:**
  - `core/optimizer.js` → `crossValidateTopNLogisticByEvent()` + `computeCvReliability()`

#### Step 7 — Blend Weights with Prior Template

- **Blending strategy (pre‑tournament):**
  1) **Fill missing weights** using fallback template:
     - `buildFilledGroupWeights()` fills suggested group weights with fallback group weights.
     - `buildMetricWeightsFromSuggested()` fills suggested metric weights with fallback metric weights (normalized per group).
  2) **Prior vs model blend:** default **60% prior / 40% model**.
     - Group weights: `blendGroupWeights(prior, model, 0.6, 0.4)` then normalize.
     - Metric weights: `blendMetricWeights(metricConfig, prior, model, 0.6, 0.4)` (normalized per group).
  3) **Directional sanity (pre‑tournament only):** apply metric inversions from Top‑20 signal before course setup (see Step 8).
- **Data used:**
  - Suggested weights (Steps 4–5)
  - Prior template weights (event template or course‑context fallback)
- **Time window:** Not time‑windowed (weight blending only).
- **Utilities/Scripts:**
  - `core/optimizer.js` (`buildFilledGroupWeights`, `buildMetricWeightsFromSuggested`, `blendGroupWeights`, `blendMetricWeights`)
  - `utilities/weightTemplates.js`

#### Step 8 — Apply Course Setup Adjustments to Blended Metric Weights

- **What it does:** Applies **course setup / shot distribution adjustments** to the **already blended metric weights** (Step 7) so the final metric mix reflects the event’s setup bias.
  - This is **not** the same as Step 3.2.2 (which builds player‑level model metrics). Step 8 only **adjusts weight vectors**.
  - It applies **after** the suggested‑vs‑prior blend, so the adjustment is on the **blended** weights (which already include template/config/course‑context inputs).
  - **Group weights are not adjusted here** (only metric weights are adjusted).
- **Data used:** Course setup / shot distribution inputs (configuration sheet / course context) **plus** the blended metric weights from Step 7.
- **Time window:** Not time‑windowed.
- **Utilities/Scripts:**
  - `core/optimizer.js` → `applyShotDistributionToMetricWeights()`

### 3.3 Outputs (Pre‑Tournament)

- `data/<season>/<tournament>/pre_event/{tournament-slug}_pre_event_results.json`
- `data/<season>/<tournament>/pre_event/{tournament-slug}_pre_event_results.txt`
- `data/<season>/<tournament>/pre_event/{tournament-slug}_pre_event_rankings.json`
- `data/<season>/<tournament>/pre_event/{tournament-slug}_pre_event_rankings.csv`

JSON includes:

- **Run metadata:** `timestamp`, `mode`, `eventId`, `season`, `tournament`, `dryRun`
- **Pre‑event rankings outputs:** `preEventRanking` (jsonPath/csvPath/txtPath)
- **Past performance weighting:** `pastPerformanceWeighting` (enabled, weights, regression summary, source)
- **Course context updates:** `courseContextUpdates` (updated flag, count, reason)
- **Training source detail:** `trainingSource` (recent‑form + event/similar/putting scope details)
- **Training metrics detail:** `trainingMetrics` (included/excluded/derived lists)
- **Historical correlations:** `historicalMetricCorrelations`
- **Training correlations:** `currentGeneratedMetricCorrelations`
- **Top‑20 signal:** `currentGeneratedTop20Correlations`, `currentGeneratedTop20Logistic`, `currentGeneratedTop20CvSummary`
- **CV reliability:** `cvReliability`
- **Approach delta priors:** `approachDeltaPrior` (label, weight, mode, files/meta, correlations, alignmentMap, playerSummary)
- **Suggested weights:** `suggestedTop20MetricWeights`, `suggestedTop20GroupWeights`
- **Conservative suggested weights:** `conservativeSuggestedTop20GroupWeights`
- **Filled weights:** `filledGroupWeights`, `filledMetricWeightsWithInversions`
- **Blended weights:** `blendedGroupWeights`, `blendedMetricWeights`, `blendedMetricWeightsAdjusted`
- **Blend settings:** `blendSettings` (priorTemplate, priorShare, modelShare)
- **API snapshot metadata:** `apiSnapshots` (source/path/lastUpdated/count per snapshot)

### 3.4 Template Writeback (Pre‑Tournament)

If `--writeTemplates` is used:

- Writes the blended pre‑event template into:
  - `apps-scripts/modelOptimizer/utilities/weightTemplates.js`
- Writes **delta player scores** into:
  - `apps-scripts/modelOptimizer/utilities/deltaPlayerScores.js`

Dry‑run mode writes to:

- `data/<season>/<tournament>/pre_event/dryrun/dryrun_weightTemplates.js`
- `data/<season>/<tournament>/pre_event/dryrun/dryrun_deltaPlayerScores.node.js`

Templates are only written when:

- `--writeTemplates` is provided, AND
- Optimized weights are **meaningfully different**, AND
- Optimized performance beats baseline

If dry‑run, outputs are written under `data/<season>/<tournament>/<mode>/dryrun/` instead of production files.

### 3.5 GAS/Node Notes (Pre‑Tournament Rankings Output)

**Implementation notes (pre‑event rankings):**

- **Z‑score columns for export:** pre‑tournament rankings outputs need **pre‑computed z‑values** (for sheet coloration) so Excel/Sheets can color without recomputing.
  - GAS currently computes z‑scores in‑sheet for formatting only (not exported).
  - Node should **emit z‑score columns** (or a parallel `*_z` block) alongside raw values, and include the **mean/stdDev used** for each metric so downstream tools can reproduce the color scale exactly.
  - Include z‑scores for: historical metrics, approach metrics, and delta‑score columns (trend/predictive) where used for conditional formatting.

**Locked CSV header contract (pre‑event rankings):**

- `Expected Peformance Notes`, `Rank`, `DG ID`, `Player Name`, `Top 5`, `Top 10`, `Weighted Score`, `Past Perf. Mult.`,
  `SG Total`, `SG Total Trend`, `Driving Distance`, `Driving Distance Trend`, `Driving Accuracy`, `Driving Accuracy Trend`,
  `SG T2G`, `SG T2G Trend`, `SG Approach`, `SG Approach Trend`, `SG Around Green`, `SG Around Green Trend`,
  `SG OTT`, `SG OTT Trend`, `SG Putting`, `SG Putting Trend`, `Greens in Regulation`, `Greens in Regulation Trend`,
  `Scrambling`, `Scrambling Trend`, `Great Shots`, `Great Shots Trend`, `Poor Shots`, `Poor Shots Trend`,
  `Scoring Average`, `Scoring Average Trend`, `Birdies or Better`, `Birdies or Better Trend`,
  `Birdie Chances Created`, `Birdie Chances Created Trend`, `Fairway Proximity`, `Fairway Proximity Trend`,
  `Rough Proximity`, `Rough Proximity Trend`,
  `Approach <100 GIR`, `Approach <100 SG`, `Approach <100 Prox`,
  `Approach <150 FW GIR`, `Approach <150 FW SG`, `Approach <150 FW Prox`,
  `Approach <150 Rough GIR`, `Approach <150 Rough SG`, `Approach <150 Rough Prox`,
  `Approach >150 Rough GIR`, `Approach >150 Rough SG`, `Approach >150 Rough Prox`,
  `Approach <200 FW GIR`, `Approach <200 FW SG`, `Approach <200 FW Prox`,
  `Approach >200 FW GIR`, `Approach >200 FW SG`, `Approach >200 FW Prox`,
  `Refined Weighted Score`, `WAR`, `Delta Trend Score`, `Delta Predictive Score`

**GAS → Node parity checklist (Pre‑Event Rankings):**

- [ ] Build player metrics (historical + approach) and apply trends.
- [ ] Compute data coverage + confidence factor; apply coverage dampening.
- [ ] Compute refined weighted score (confidence‑adjusted).
- [ ] Compute WAR and composite score for ranking/tiebreakers.
- [ ] Generate notes (WAR flag, strengths/weaknesses, trend flags, data‑coverage warning, bucket signal note).
- [ ] Export z‑scores + mean/stdDev for conditional formatting (historical + approach + delta columns).
- [ ] Write JSON + CSV outputs with stable headers for validation ingestion.

**Function‑by‑function port map (Pre‑Event Rankings / `results.js`):**

- `generatePlayerRankings()` → Node orchestration for pre‑event ranking build (overall pipeline).
- `aggregatePlayerData()` → Build player round buckets (historical/similar/putting) + approach metrics ingestion.
- `calculateHistoricalAverages()` → Weighted averages for historical metrics (recency + similar/putting blending).
- `calculateMetricTrends()` → Trend vectors for historical metrics (exponential regression + smoothing).
- `getApproachMetrics()` / `normalizeApproachSG()` → Approach metric extraction + per‑shot → per‑round conversion.
- `calculatePlayerMetrics()` → Group scores, data coverage, confidence factor, refined score, past‑performance multiplier.
- `calculateWAR()` → KPI‑weighted WAR calculation (uses groupStats + metric transforms).
- `prepareRankingOutput()` → Rank ordering, confidence intervals, composite scores, WAR tiebreaks.
- `generatePlayerNotes()` → Notes column synthesis (WAR, strengths/weaknesses, trend flags, data coverage, bucket signals).
- `writeRankingOutput()` → Output columns + formatting expectations (headers, score columns, trend columns, delta columns).
- `cacheGroupStats()` / `getCoverageConfidence()` → Cached stats + confidence curve used downstream.

## 4. Post‑Tournament Mode (Only What’s Additional)

Post‑tournament mode includes everything in pre‑tournament mode **plus** the following steps. A CLI flag is absolutely required (new) for pre‑tournament / post‑tournament distinction.

Open items: begin **migration plan** from Apps Script validation to Node.

### 4.1 Algorithm Validation (Post‑Tournament)

Post‑tournament validation is being **ported to Node** so the optimizer can run the full evaluation pipeline without relying on Apps Script. Outputs for this step will be **renamed and pared down** once the migration stabilizes.

**Current JSON storage (post‑tournament output):**

- `apiSnapshots` (per‑source `{ source, path, lastUpdated, count }`)
- `resultsCurrent` (normalized results used for evaluation)
- `resultsByYearSummary` (counts by year)
- `validationIntegration` (course type, priors, approach usage policy, delta trends, skill ratings)
- `roundsByYearSummary` (round counts per year)
- `availableYears` (years included in validation)
- `historicalMetricCorrelations`
- `currentGeneratedMetricCorrelations`
- `currentGeneratedTop20Correlations`
- `currentGeneratedTop20Logistic`
- `currentGeneratedTop20CvSummary`
- `cvReliability`
- `blendSettings`
- `suggestedTop20MetricWeights`
- `suggestedTop20GroupWeights`
- `conservativeSuggestedTop20GroupWeights`
- `tunedTop20GroupWeights`
- `rawTemplateResults`
- `rawTemplateResultsCurrentYear`
- `multiYearTemplateComparison`
- `approachDeltaPrior`
- `step1_bestTemplate`
- `step3_optimized`
- `step4a_multiYearBaseline` / `step4b_multiYearOptimized`
- `step4a_eventKFold` / `step4b_eventKFold`
- `eventKFoldSummary`
- `recommendation`

### 4.1a Fetch Tournament Results

**Node‑based results ingestion (target behavior):**

1. **Locate results in Historical Data CSV.** If `* - Historical Data.csv` exists, derive the event’s results directly from that file.

1. **Cache lookup (reruns).** If a cached results JSON exists in `data/cache/`, use it before calling the API.

1. **API fallback #1 — Historical Rounds API.** If no Historical Data CSV exists, pull finalized results for the event/season and normalize player identifiers to DG ID.

1. **API fallback #2 — Live Tournament Results API.** Used when historical endpoint is incomplete or not yet finalized; normalize to the same results schema.

1. **Normalize finish positions.** Accept `T#` and `#T` tie formats; map `CUT`, `WD`, `DQ` to **worst finish + 1**; drop rows with missing DG IDs.

1. **Persist results snapshot.** The canonical results JSON becomes the **single source of truth** for validation runs.

**Current JSON storage (post‑tournament output):**

- `apiSnapshots.dataGolfHistoricalRounds` (source/path/lastUpdated/eventId/year/count)
- `resultsCurrent` (array of `{ dgId, finishPosition, playerName }`)
- `resultsByYearSummary` (per‑year counts used in later validation)

### 4.1b Write Tournament Results (Node)

**Results CSV formats (current reality):**

- **Input results data (for validation):** derived from **Historical Data CSV** or **Historical Rounds API** payloads (same schema as other rounds snapshots). No standalone Tournament Results CSV is provided.

- **GAS results export (human‑readable output):** when results are exported from Apps Script (`apps-scripts/Golf_Algorithm_Library/modelGeneration/results.js`), the CSV includes **metadata rows** followed by a header row and the per‑player results. The **first data column is a notes/analysis column** (emojis + text). Example structure:

  - **Row 1:** (blank spacer)
  - **Row 2:** `Tournament: <Name>`, `Last updated: <timestamp>`
  - **Row 3:** `Course: <Course>`, `Found <N> players from API`
  - **Row 4:** `Data Date: <ISO timestamp>`
  - **Row 5 (headers):**
    - `Performance Analysis`
    - `DG ID`
    - `Player Name`
    - `Model Rank`
    - `Finish Position`
    - `Score`
    - `SG Total`, `SG Total - Model`
    - `Driving Distance`, `Driving Distance - Model`
    - `Driving Accuracy`, `Driving Accuracy - Model`
    - `SG T2G`, `SG T2G - Model`
    - `SG Approach`, `SG Approach - Model`
    - `SG Around Green`, `SG Around Green - Model`
    - `SG OTT`, `SG OTT - Model`
    - `SG Putting`, `SG Putting - Model`
    - `Greens in Regulation`, `Greens in Regulation - Model`
    - `Fairway Proximity`, `Fairway Proximity - Model`
    - `Rough Proximity`, `Rough Proximity - Model`
    - `SG BS`
  - **Row 6+ (data):** notes in column 1 + per‑player metrics.

**Parsing note:** the Node parser must **skip metadata rows** until the header row is found, then treat column 1 as the notes/analysis field (non‑numeric) and parse the rest by header label. Validation runs will also fall back to `post_event/<tournament-slug>_results.csv` if the JSON snapshot is missing.

**Output location (Node):**

- **Authoritative results JSON:** `data/<season>/<tournament>/post_event/<tournament-slug>_results.json`
- **Optional human‑readable CSV:** `data/<season>/<tournament>/post_event/<tournament-slug>_results.csv`

**CSV parsing rules (GAS results export → Node ingestion, if needed for QA/export parity):**

1. **Header detection:** scan rows until you find a header row that contains `DG ID`, `Player Name`, and `Finish Position` (or `Model Rank` for pre‑event rankings). This is the **true header**.
2. **Skip metadata rows:** any rows before the header are metadata and must be ignored.
3. **Notes column:** the first column (`Performance Analysis`) is **free‑text** and should be ignored for numeric parsing.
4. **Numeric parsing:** parse numeric columns as floats; `%` columns may be either `0‑1` or `0‑100` and should be normalized to `0‑1`.
5. **Finish Position parsing:** accept `T#` and `#T`, and map `CUT/WD/DQ` to **worst finish + 1**.
6. **DG ID required:** drop rows without a valid DG ID.
7. **Stable column mapping:** rely on header labels (not column index) because metadata rows and optional columns can shift indices.

**CSV parsing rules (pre‑event rankings outputs → Node ingestion):**

1. **Header detection:** scan rows until you find a header row that contains `DG ID`, `Player Name`, and `Rank`.
2. **Skip metadata rows:** any rows before the header are metadata and must be ignored.
3. **Notes/analysis column:** if a notes column exists (e.g., `Expected Performance Notes` or `Performance Analysis`), treat it as **free‑text** and ignore for numeric parsing.
4. **Numeric parsing:** parse numeric columns as floats; `%` columns may be either `0‑1` or `0‑100` and should be normalized to `0‑1`.
5. **Rank rules:** if `Rank` is missing, infer from row order after sorting (1..N).
6. **DG ID required:** drop rows without a valid DG ID.
7. **Stable column mapping:** rely on header labels (not column index) because optional columns and metadata rows can shift indices.

### 4.1c GAS/Node Notes (Post‑Tournament Results Output)

**Implementation notes (post‑event results):**

- **Tournament Results sheet calculations:** the GAS `tournamentResults_historical.js` pipeline computes **additional outputs before writing the Tournament Results sheet** (performance analysis notes, model‑vs‑actual deltas, trend notes, and the z‑score inputs used for conditional formatting). These calculations must be **ported to Node** for parity when producing the results JSON/CSV outputs.
  - **Dependency note:** Tournament Results analysis notes in GAS are built from **post‑tournament results + pre‑event rankings** (Player Ranking Model). WAR and trend signals are **read from the pre‑event sheet**, and trend significance uses cached `groupStats` from pre‑event ranking runs. There is **no confidence factor used directly** in the Tournament Results sheet today.

**Locked CSV header contract (post‑tournament results):**

- `Performance Analysis`, `DG ID`, `Player Name`, `Model Rank`, `Finish Position`, `Score`,
  `SG Total`, `SG Total - Model`, `Driving Distance`, `Driving Distance - Model`,
  `Driving Accuracy`, `Driving Accuracy - Model`, `SG T2G`, `SG T2G - Model`,
  `SG Approach`, `SG Approach - Model`, `SG Around Green`, `SG Around Green - Model`,
  `SG OTT`, `SG OTT - Model`, `SG Putting`, `SG Putting - Model`,
  `Greens in Regulation`, `Greens in Regulation - Model`, `Fairway Proximity`, `Fairway Proximity - Model`,
  `Rough Proximity`, `Rough Proximity - Model`, `SG BS`

**GAS → Node parity checklist (Post‑Event Results):**

- [ ] Derive results from Historical Data CSV or API rounds payload (no results CSV input).
- [ ] Normalize finish positions (ties, CUT/WD/DQ → worst + 1).
- [ ] Allow Live Tournament Stats parameters (stats/round/display) to be set via env; default to `event_avg`.
- [ ] Compute model‑vs‑actual deltas and performance analysis notes.
- [ ] Pull WAR + trend columns from pre‑event rankings output (Player Ranking Model) to drive result‑sheet notes.
- [ ] Use cached groupStats (or recompute) to score trend significance for result‑sheet notes.
- [ ] Export z‑scores + mean/stdDev for conditional formatting.
- [ ] Emit **Tournament Results JSON** (authoritative for validation).
- [ ] Emit CSV for human review (same header contract as GAS export).

**Function‑by‑function port map (Post‑Event Results / `tournamentResults_historical.js`):**

- `fetchHistoricalTournamentResults()` (or equivalent entry) → Node pipeline entry for post‑event results assembly.
- `parseRawDataToStructured()` → Aggregate round‑level rows into per‑player results (net score + averaged SG metrics).
- `readModelData()` → Load pre‑event rankings columns (rank + model metrics) keyed by DG ID.
- `formatTournamentResults()` / `applyConditionalFormatting()` → Define metric types + z‑score coloring rules (Node must emit z‑values + stats).
- `addAnalysisNotes()` → Build notes column from model rank vs finish, trend significance, WAR tags, alignment tags.
- `getCachedGroupStats()` → Pull cached groupStats for trend significance thresholds.

> Porting guidance: mirror the **data contracts** (inputs/outputs) of each function, not the Sheets‑specific formatting calls. Node should emit JSON/CSV payloads with the same columns + z‑score stats instead of relying on in‑sheet conditional formatting.

### 4.2 Tournament / Config Validation (Node Port from GAS)

Post‑tournament validation is being **ported to Node** so the optimizer can run the full evaluation pipeline without relying on Apps Script. Outputs for this step will be **renamed and pared down** once the migration stabilizes.

**Node‑based workflow (target behavior):**

1. **Enumerate tournaments to validate**
  Input: tournament identifiers and seasons (from CLI or a config file).
  Output: a list of tournaments with locations for **predictions** + **results**  snapshots.
  Node responsibility: replace GAS folder discovery with deterministic file discovery under `data/`.

2. **Load predictions**
  Source: pre‑event rankings from Node outputs at `data/<season>/<tournament>/pre_event/rankings.csv` (sheet‑like ranking export) and `data/<season>/<tournament>/pre_event/rankings.json`.
  Required fields: **DG ID**, **Player Name**, **Rank**.
  Parsing rules: rank 1..N; limit to top 150 (consistent with GAS).

3. **Load results**
  Source priority (post‑tournament): Tournament Results JSON → Tournament Results CSV → Historical Data CSV → Historical Rounds API → Live Tournament Results API.
  Required fields: **DG ID**, **Player Name**, **Finish Position**.
  Parsing rules: accept ties (`T#` / `#T`), ignore blanks; **CUT/WD/DQ** → fallback to **worst finish + 1** when mapping.

4. **Normalize & join**
  Join predictions → results by **DG ID**.
  If prediction rank missing, infer from row order.
  Keep only players with valid DG ID + valid finish mapping.

5. **Compute metrics**
  **Spearman correlation** (predicted rank vs finish).
  **RMSE** of finish error.
  **Top‑N hit rates**: Top‑5 / Top‑10 / Top‑20 / Top‑50.
  **Matched count** + summary stats for QA.

6. **Write validation outputs (Node)**
  JSON summary per tournament (metrics + matched players).
  Aggregated summary file by season.
  Optional CSV summary for quick review.
  `data/<season>/validation_outputs/validation_summary.csv` columns: `Date`, `Tournament`, `Spearman`, `RMSE`, `MAE`, `Top5%`, `Top10%`, `Top20%`, `Top50%`, `Matched`.
  `data/<season>/validation_outputs/validation_summary.json`: `season`, `runAt`, `tournaments` (per‑tournament metrics), `summary` (mean/median across tournaments).
  `data/<season>/validation_outputs/tournament_<name>.json`: `tournament`, `eventId`, `season`, `predictions` (count + source), `results` (count + source), `metrics` (spearman/rmse/mae/top5/top10/top20/top50), `matchedPlayers` (name, dgId, predictedRank, actualFinish, error).

**Current JSON storage (post‑tournament output):**

- `validationIntegration` (including `validationCourseType`, `validationTemplateName`, `validationPriorWeight`, `deltaTrendPriorWeight`, `approachDeltaPriorWeight`, `approachUsagePolicy`, `deltaTrendsPath`, `deltaTrendSummary`, `skillRatingsValidation`, `playerDecompositionValidation`)

**Information we have now (Node):**

- Pre‑event rankings outputs in Node (JSON/CSV/TXT) with DG IDs and ordering.
- Existing API client and cache locations under `utilities/dataGolfClient.js` and `data/cache/`.
- Post‑tournament result ingestion priority defined in Step 4.1a.

**Data directory convention (resolved):**

- **Root:** `apps-scripts/modelOptimizer/data/`
- **Per‑tournament artifacts:** `data/<season>/<tournament>/...`
- **Per‑tournament inputs (CSV fallback):** `data/<season>/<tournament>/inputs/`
- **Pre‑tournament outputs:** `data/<season>/<tournament>/pre_event/` (rankings + run summary)
- **Post‑tournament outputs:** `data/<season>/<tournament>/post_event/` (optimizer results + tournament results)
- **Season manifest:** `data/<season>/manifest.json` (tournament list with eventId + slug + season)
- **Validation outputs:** `data/<season>/validation_outputs/...`
- **Cache (separate):** `data/cache/`
- **Inputs:** pulled from their existing locations per step (e.g., `utilities/course_context.json`, `utilities/weightTemplates.js`, `data/cache/`, `data/approach_snapshot/`, and pre‑event outputs in `data/<season>/<tournament>/pre_event/`).

**Validation output update policy:**

- **02_files (static):** tournament validation artifacts that are considered static and **do not overwrite** week over week.
- **All other validation outputs:** **overwrite each run** with the latest validation results (new sheets may be added as needed).

**Information we still need (Node):**

- None (data directory and manifest conventions are defined above).

**Functions to port from GAS to Node:**

- `utilities_DataLoading.js`
  - `listAvailableTournamentWorkbooks()` → replace with file enumeration under `data/`.
  - `loadTournamentPredictions()` → parse Node rankings CSV/JSON.
  - `loadTournamentResults()` → parse results CSV or API payload.
  - `evaluateTournamentPredictions()` → core metrics (Spearman/RMSE/Top‑N).
  - `calculateSpearmanCorrelation()` / `calculateRmse()` / `calculateTopNHitRate()`.
- `utilities_Calibration.js`
  - `analyzePostTournamentCalibration()` → top finisher accuracy diagnostics.
  - `createCalibrationReport()` → Node report output (CSV/JSON).
- `phase1_MetricCorrelationAnalysis.js`
  - `analyzeMetricCorrelations()` → per‑tournament metric deltas + type summaries.
  - `classifyCoursesIntoTypes()` → course‑type assignment.
  - `createModelDeltaTrendSheet()` → model vs actual delta trend summary.
- `templateGeneration.js`
  - `generateWeightTemplates()` → weight templates from per‑tournament summaries.

> The Node port should **mirror the GAS outputs conceptually** (Calibration Report, 02_/03_/04_ summaries, Weight Templates), but emit JSON/CSV artifacts instead of sheets.

### 4.3 Current‑Season, Current‑Tournament Baseline

**Node‑based baseline evaluation (target behavior):**

1. **Assemble candidate templates.** Event‑specific template from `utilities/weightTemplates.js` when present; fallback template from `utilities/course_context.json` → `templateKey`; optional neutral baseline for comparison.

1. **Build evaluation dataset (no current results).** Rounds = last **3 months** + event & similar & putting history (most recent **5 years** available). This must mirror model ranking inputs and **must not use current‑event results** to avoid overfitting.

1. **Score each template.** Compute **Spearman**, **RMSE**, **MAE**, **Top‑N hit rates** (Top‑5/10/20/50), **Top‑20 composite**, and **alignment score** (where applicable).

1. **Select best baseline.** Choose the template with the strongest validation metrics and record it in `step1_bestTemplate`.

1. **Layman summary required.** Provide a plain‑English interpretation of which template won and why (to be written in the TXT output).

**Current JSON storage (post‑tournament output):**

- `rawTemplateResults` (per‑template evaluation across years)
- `rawTemplateResultsCurrentYear` (per‑template evaluation for current season)
- `step1_bestTemplate` (name, evaluation, evaluationCurrentYear, evaluationAllYears, groupWeights)
- `multiYearTemplateComparison` (per‑template evaluation + yearly breakdowns)

### 4.4 Group Weight Tuning

**Node‑based group tuning (target behavior):**

#### Step 1 — Top‑20 Group Weight Tuning

1. **Select candidate groups.** Target lower‑importance groups for perturbation while keeping core groups fixed to preserve baseline stability.

1. **Generate perturbation set.** Sample randomized or grid‑style deltas around baseline group weights, then normalize to maintain total = 1.

1. **Evaluate each candidate.** Score using **Top‑20 composite** with correlation guardrails and drop candidates that materially degrade Spearman/RMSE/MAE.

1. **Persist best group weights.** Record the best group weights and score for Step 4.5 search in `step2_groupTuning` (JSON) and summarize in TXT.

1. **Layman summary required.** Provide a plain‑English explanation of what changed and why it helped.

#### Step 2 — Group Tuning Summary

1. **Write tuning summary.** Capture the final group weights, deltas vs baseline, and the Top‑20 composite lift in the JSON output and the TXT summary.

**Current JSON storage (post‑tournament output):**

- `tunedTop20GroupWeights` (best candidate + evaluation)
- `suggestedTop20GroupWeights` (baseline top‑20 group weights)
- `conservativeSuggestedTop20GroupWeights` (CV‑adjusted baseline)

### 4.5 Weight Optimization

**Node‑based optimization (target behavior):**

1. **Seed search from best baseline.** Start with Step 4.3 baseline + Step 4.4 group tuning, using baseline metric weights as the search center.

1. **Sample candidate weight vectors.** Apply randomized perturbations per group/metric and enforce per‑group normalization and sign constraints.

1. **Objective function.** Use a weighted blend of Spearman correlation, Top‑20 composite, and alignment score, with penalties for RMSE/MAE regression.

1. **Select best candidate.** Write optimized group/metric weights into `step3_optimized` and summarize the delta vs baseline.

1. **CLI flags (baseline variables for Step 3).** Uses `--event/--eventId`, `--season/--year`, `--tournament/--name`, `--tests <N>`, `--template <NAME>`, `--dryRun`, `--writeTemplates`, `--writeValidationTemplates`, `--dir <name>`, `--outputDir <path>`, `--dataDir <path>`, `--pre`, `--post`.

1. **Environment variables (Step 3).** `OPT_SEED` (reproducible runs), `OPT_TESTS` (override randomized test count), `LOGGING_ENABLED=1` (verbose logs).

1. **Layman summary required.** Provide a plain‑English explanation of the optimized changes and expected impact.

**Current JSON storage (post‑tournament output):**

- `step3_optimized` (evaluation, weights, alignment/top20/combined scores, deltas)
- `suggestedTop20MetricWeights` (baseline metric weights)
- `currentGeneratedTop20Logistic` (logistic model details)
- `currentGeneratedTop20Correlations` (Top‑20 signal)
- `currentGeneratedMetricCorrelations` (metric correlations)

### 4.6 Multi‑Year Validation

#### Step 1 — Multi‑Year Validation (LOYO)

1. **Enumerate validation years.** Use all years available in event history (typically last 5 seasons).

1. **LOYO protocol.** For each validation year, build historical rounds excluding that year’s results and apply **baseline** and **optimized** weights without retraining on the held‑out year.

1. **Approach snapshots by timing.** Use **L24** for events older than 2 years, **L12** for last season, and **YTD** for current season (post‑WM Phoenix). This prevents leakage while preserving timing realism.

1. **Score each year.** Compute **Spearman**, **RMSE**, **MAE**, **Top‑N hit rates** (Top‑5/10/20/50), **Top‑20 composite**, and **alignment score** (where applicable). Log per‑year deltas (optimized vs baseline).

1. **Summarize stability.** Aggregate across years (mean/median/volatility) and flag years where optimized under‑performs baseline.

1. **Layman summary required.** Provide a plain‑English explanation of the multi‑year signal and stability.

**Current JSON storage (post‑tournament output):**

- `step4a_multiYearBaseline`
- `step4a_noApproachBaseline`
- `step4b_multiYearOptimized`
- `availableYears`
- `roundsByYearSummary`
- `resultsByYearSummary`

#### Step 2 — Event K‑Fold Validation

1. **Build event samples.** Group historical rounds/results by event year for the event + similar/putting lists.

1. **Split into folds.** `EVENT_KFOLD_K` defines K; if unset, use **leave‑one‑event‑out**. Shuffle with `EVENT_KFOLD_SEED` for repeatability.

1. **Evaluate baseline vs optimized.** Train on K‑1 folds, evaluate on held‑out fold, and record Spearman/RMSE/MAE and Top‑N hit rates per fold.

1. **Summarize fold stability.** Persist fold‑level results, distribution stats (median/IQR), and confidence score in JSON, plus an interpretive TXT summary.

1. **Layman summary required.** Provide a plain‑English interpretation of fold stability and confidence.

**Current JSON storage (post‑tournament output):**

- `step4a_eventKFold`
- `step4b_eventKFold`
- `eventKFoldSummary` (baseline/optimized + interpretation)

### 4.7 Post‑Tournament Outputs

- `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.json`
- `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.txt`

Includes:

- Baseline vs optimized summary
- Multi‑year validation
- K‑fold summaries and interpretations
- Template writeback decisions

**Node output depth (target behavior):**

- **`data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.json`**
  - **meta:** eventId, season, tournament name, run timestamp, CLI flags used
  - **apiSnapshots:** rounds/field/results snapshot timestamps + sources
  - **resultsCurrent:** normalized results for current season evaluation
  - **resultsByYearSummary / roundsByYearSummary / availableYears:** per‑year validation coverage
  - **training & signal:** historical/current correlations, Top‑20 signal + logistic summaries, CV reliability
  - **weights:** suggested/conservative/tuned group weights + suggested metric weights
  - **step1_bestTemplate:** winning template name + evaluation (all‑years + current year)
  - **rawTemplateResults / rawTemplateResultsCurrentYear:** per‑template evaluation tables
  - **multiYearTemplateComparison:** per‑template yearly breakdowns
  - **approachDeltaPrior:** delta prior inputs, correlations, alignment, movers
  - **validationIntegration:** course type, priors, approach usage policy, delta trends, skill ratings, decompositions
  - **step2_groupTuning:** group perturbation results + best group weights
  - **step3_optimized:** optimized weights + objective score
  - **step4a_multiYearBaseline:** per‑year baseline metrics
  - **step4b_multiYearOptimized:** per‑year optimized metrics
  - **step4a_eventKFold / step4b_eventKFold:** fold‑level metrics + confidence summary
  - **eventKFoldSummary:** baseline/optimized rollups + interpretation
  - **writebacks:** whether templates/deltas were written (and where)
  - **recommendation:** suggested action + optimized weights

- **`data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.txt`**
  - Human‑readable summary of baseline vs optimized
  - Top‑line metrics (Spearman/RMSE/Top‑N)
  - Short interpretation of K‑fold stability
  - Writeback decision + rationale
  - Layman explanations for each step’s statistical results (baseline selection, group tuning, optimization, multi‑year, K‑fold)

Templates are only written when:

- `--writeTemplates` is provided, AND
- Optimized weights are **meaningfully different**, AND
- Optimized performance beats baseline

If dry‑run, outputs are written under `data/<season>/<tournament>/<mode>/dryrun/` instead of production files.

### 4.8 Exact Data Usage by Step (Post‑Tournament Additions)

#### Step 4.1a — Fetch Tournament Results (Node)

- **Data used:**
  - Historical Data CSV (primary), or API snapshots.
- **Sources:**
  - CSV → local repo or cache.
  - API → `utilities/dataGolfClient.js`.
- **Outputs (Node):**
  - `data/<season>/<tournament>/post_event/<tournament-slug>_results.json`
  - `data/<season>/<tournament>/post_event/<tournament-slug>_results.csv` (optional human‑readable export)

#### Step 4.2 — Algorithm Validation (Node Port)

- **Data used (Node):**
  - Pre‑event rankings outputs from Node (`data/<season>/<tournament>/pre_event/rankings.csv/json`).
  - Post‑tournament results (CSV or API snapshots per Step 1c.1).
  - Optional per‑tournament config metadata (eventId, course type, templateKey).
- **Time window:**
  - Current season only (completed tournaments for the target season).
- **Sources:**
  - Node optimizer outputs (`data/<season>/<tournament>/pre_event/` and `data/<season>/<tournament>/post_event/`).
  - Data cache/API (`apps-scripts/modelOptimizer/data/cache/`).
- **Outputs (Node):**
  - `data/<season>/validation_outputs/validation_summary.csv`
  - `data/<season>/validation_outputs/validation_summary.json`
  - `data/<season>/validation_outputs/tournament_<name>.json`
  - Optional: `data/<season>/validation_outputs/calibration_report.csv`

#### Step 4.3 — Current‑Season, Current‑Tournament Baseline

- **Data used (Node):**
  - Current‑season rounds for event + similar/putting lists.
  - Current‑season results from Step 1c.1.
  - Candidate templates from `utilities/weightTemplates.js` (event‑specific + fallback).
- **Time window:** **Current season only** for event + similar + putting.
- **Outputs (Node):**
  - `step1_bestTemplate` block inside `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.json`.

#### Step 4.4 — Group Weight Tuning

- **Data used (Node):**
  - Current‑season rounds (event + similar + putting)
  - Current‑season results
  - Baseline weights from Step 1c.3
- **Time window:** Current season only.
- **Outputs (Node):**
  - `step2_groupTuning` block inside `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.json`.

#### Step 4.5 — Weight Optimization

- **Data used (Node):**
  - Current‑season rounds (event + similar + putting)
  - Current‑season results
  - Optional approach snapshots (current season period)
  - Best group weights from Step 2
- **Time window:** Current season only.
- **Outputs (Node):**
  - `step3_optimized` block inside `data/<season>/<tournament>/post_event/{tournament-slug}_post_event_results.json`.

#### Step 4.6 Step 1 — Multi‑Year Validation (LOYO)

- **Data used (Node):**
  - Per‑year event history rounds (5 years) for event + similar/putting lists.
  - Per‑year results (held‑out year validation).
  - Approach snapshots aligned by year (L24/L12/YTD policy).
- **Time window:** 3/6/12 months + 5‑year event history.
- **Outputs (Node):**
  - `step4a_multiYearBaseline` / `step4b_multiYearOptimized` blocks in JSON.

#### Step 4.6 Step 2 — Event K‑Fold Validation

- **Data used:**
  - Event history rounds (5 years) grouped by event (by year)
  - Similar‑iron/putting event lists from course context
- **Time window:** 5‑year event history (only years with sufficient event counts).
- **Utilities/Scripts:**
  - `core/optimizer.js` (K‑fold/LOEO splits + summaries)

---

## 5. Approach Data Policy (Leakage Handling)

**Status:** deferred. Leakage flagging is not currently enforced in Node outputs.

---

## 6. Data Sources & Ingestion Roadmap

**Status:** deferred. API ingestion notes are retained for reference but not an active requirement.

---
