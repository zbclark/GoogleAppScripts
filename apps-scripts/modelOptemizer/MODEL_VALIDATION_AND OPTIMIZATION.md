# Model Validation and Optimization (modelOptemizer)

This document provides a **detailed, review-friendly** guide to how `apps-scripts/modelOptemizer/core/optimizer.js` behaves in **pre‑tournament** and **post‑tournament** modes, including inputs, outputs, decisions, and validation logic. The goal is to make configuration intent explicit and auditable.

> Scope: **Node-based optimizer** only. This is the source of truth for validation/optimization moving forward. Apps Script validation remains legacy and is slated for migration to Node.

---

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

### **Post‑Tournament Mode**

Triggered when **current‑year results exist** for the event.

**Primary goal:** run full optimization + validation (baseline vs optimized), including multi‑year validation and event K‑fold, then write a recommended template if warranted.

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
  - `output/course_history_regression_summary.csv`
  - `output/course_history_regression_details.csv`
  - `output/course_history_regression_summary_similar.csv`
  - `output/course_history_regression_details_similar.csv`
  - `output/course_history_regression.json` (when templates enabled)
  - `apps-scripts/modelOptemizer/utilities/courseHistoryRegression.js` (when templates enabled)
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
  - `scripts/compute_approach_deltas.js` (delta generation)
  - `core/optimizer.js` (rolling aggregation + alignment map)

**How deltas are created:**

- **Script:** `scripts/compute_approach_deltas.js`
- **Inputs (API‑first):**
  - **Current:** API approach snapshot (current week)
  - **Previous:** API approach snapshot from the **prior week’s YTD** snapshot
  - Optional API field snapshot to filter deltas to the tournament field
- **What it produces:**
  - JSON: `data/approach_deltas/approach_deltas_<YYYY-MM-DD>.json` (default)
  - JSON includes `meta` (timestamps, field filter) and `rows` (per‑player delta metrics)
- **Where the files go:**
  - JSON → `apps-scripts/modelOptemizer/data/approach_deltas/`

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

- `optimizer_<tournament>_pre_event_results.json`
- `optimizer_<tournament>_pre_event_results.txt`

JSON includes:

- Training metric correlations
- Top‑20 signal + logistic summary
- Suggested weights (metric + group)
- CV reliability
- Approach delta prior inputs and player summaries
- Filled / blended / adjusted weights
- API snapshot metadata

### 3.4 Template Writeback (Pre‑Tournament)

If `--writeTemplates` is used:

- Writes the blended pre‑event template into:
  - `apps-scripts/modelOptemizer/utilities/weightTemplates.js`
  - `apps-scripts/Golf_Algorithm_Library/utilities/templateLoader.js`
  - Writes **delta player scores** into:
    - `apps-scripts/modelOptemizer/utilities/deltaPlayerScores.js`
    - `apps-scripts/Golf_Algorithm_Library/utilities/deltaPlayerScores.js`

Dry‑run mode writes to:

- `output/dryrun_weightTemplates.js`
- `output/dryrun_templateLoader.js`
- `output/dryrun_deltaPlayerScores.node.js`
- `output/dryrun_deltaPlayerScores.gas.js`

## 4) Post‑Tournament Mode (Only What’s Additional)

Post‑tournament mode includes everything in pre‑tournament mode **plus** the following steps.

### 4.1 Step 1c: Current‑Season Template Baseline

- Compares baseline templates on **current‑season results**.
- Computes Spearman correlation, RMSE/MAE, and Top‑N hit rates.
- Selects the best baseline template for optimization.

### 4.2 Step 2: Top‑20 Group Weight Tuning

- Uses randomized perturbations of lower‑importance groups.
- Objective: maximize Top‑20 quality while maintaining correlation & error.

### 4.3 Step 3: Weight Optimization

- Randomized search around baseline template.
- Objective: weighted blend of
  - correlation
  - Top‑20 composite
  - alignment score

### 4.4 Step 4a/4b: Multi‑Year Validation

- Baseline vs optimized weights are tested across all historical years.
- Spearman correlation, RMSE/MAE, Top‑N metrics, and stress tests are logged.

### 4.5 Event K‑Fold Validation (Step 4a/4b)

- **Event‑based K‑fold** or **leave‑one‑event‑out** based on `EVENT_KFOLD_K`.
- Outputs include:
  - per‑fold metrics
  - fold distribution stats (median, IQR)
  - confidence score (stability + fold count)

### 4.6 Post‑Tournament Outputs

- `optimizer_<tournament>_post_tournament_results.json`
- `optimizer_<tournament>_post_tournament_results.txt`

Includes:

- Baseline vs optimized summary
- Multi‑year validation
- K‑fold summaries and interpretations
- Template writeback decisions

### 4.7 Exact Data Usage by Step (Post‑Tournament Additions)

#### Step 1c — Current‑Season Template Baseline

- **Data used:**
  - Current‑season rounds for the target event, plus similar/putting events (current season only)
  - Current‑season results (finishes)

- **Time window:** **Current season only** for event + similar + putting.
- **Utilities/Scripts:**
  - `core/optimizer.js` (template evaluation)

#### Step 2 — Top‑20 Group Weight Tuning

- **Data used:**
  - Current‑season rounds (event + similar + putting)
  - Current‑season results
- **Time window:** Current season only.
- **Utilities/Scripts:**
  - `core/optimizer.js` (tuning search)

#### Step 3 — Weight Optimization

- **Data used:**
  - Current‑season rounds (event + similar + putting)
  - Current‑season results
  - Optional approach snapshots (current season period)
- **Time window:** Current season only.
- **Utilities/Scripts:**
  - `core/optimizer.js` (randomized search)

#### Step 4a/4b — Multi‑Year Validation

- **Data used:**
  - Recent‑form rounds (3/6/12 months)
  - Event history rounds (5 years) for eventId + similar iron/putting lists
  - Results by year
  - Approach snapshots by year using L24/L12/YTD approximation policy
- **Time window:** 3/6/12 months + 5‑year event history.
- **Utilities/Scripts:**
  - `core/optimizer.js` (validation + stress tests)

#### Event K‑Fold Validation

- **Data used:**
  - Event history rounds (5 years) grouped by event (by year)
  - Similar‑iron/putting event lists from course context
- **Time window:** 5‑year event history (only years with sufficient event counts).
- **Utilities/Scripts:**
  - `core/optimizer.js` (K‑fold/LOEO splits + summaries)

---

## 5) Approach Data Policy (Leakage Handling)

**Decision:** use **L24/L12/YTD approximations** with explicit leakage flags.

### Policy Rules

- **Events older than 2 years:** use **L24** snapshot
- **Last season:** use **L12** snapshot
- **Current season after WM Phoenix:** use **YTD**

### Output Requirement

- Every validation run should be tagged with the **approach period used** and a **leakage flag** (approximation vs as‑of‑date).

This keeps interpretations honest and makes comparisons auditable.

---

## 6) Data Sources & Ingestion Roadmap

### Current state

- **API ingestion is primary** (recent‑form + 5‑year event history + approach snapshots).
- CSV remains the fallback input only.

### Roadmap

1) Wire API ingestion for historical rounds
2) Wire API ingestion for approach snapshots (L24/L12/YTD)
3) Wire API ingestion for current field & results
4) Keep CSV only as a temporary fallback

---

## 7) Flags & Environment Variables (Core)

### CLI Flags

- `--event` / `--eventId` (required)
- `--season` / `--year`
- `--tournament` / `--name`
- `--tests <N>`
- `--template <NAME>`
- `--dryRun`
- `--writeTemplates`
- `--writeValidationTemplates`
- `--dir <name>`
- `--outputDir <path>`
- `--dataDir <path>`

### Environment Variables

- `OPT_SEED` — reproducible runs
- `OPT_TESTS` — override randomized test count
- `EVENT_KFOLD_K` — K for event split (unset = LOEO)
- `EVENT_KFOLD_SEED` — seed for fold shuffling
- `LOGGING_ENABLED=1` — verbose logs

---

## 8) Outputs (JSON / TXT)

### JSON Outputs Include

- `apiSnapshots` (data sources + timestamps)
- `historicalMetricCorrelations`
- `currentGeneratedMetricCorrelations`
- `currentGeneratedTop20Correlations`
- `step1_bestTemplate`
- `step3_optimized`
- `step4a_multiYearBaseline` / `step4b_multiYearOptimized`
- `step4a_eventKFold` / `step4b_eventKFold`
- `eventKFoldSummary` with confidence + distribution stats

### Text Outputs Include

- Human‑readable summaries
- Full per‑fold breakdowns
- Interpreted comparisons (baseline vs optimized)

---

## 9) Template Writeback Rules

Templates are only written when:

- `--writeTemplates` is provided, AND
- Optimized weights are **meaningfully different**, AND
- Optimized performance beats baseline

If dry‑run, outputs are written to `output/dryrun_*` instead of production files.

---

## 10) Next Steps (Agreed)

- Implement **approach leakage flagging** in validation outputs.
- Begin **migration plan** from Apps Script validation to Node.
- Wire **API ingestion** for approach snapshots + results.

---

## 11) Quick Pre/Post Checklist

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

---

Last updated: 2026‑02‑21

---

## 12. Example Run Setup (End‑to‑End)

Below is an example of how a **post‑tournament** run is completed, including the data files and where they come from. Replace values in brackets with real tournament values.

### Example Inputs (API Primary)

The optimizer expects API snapshots for:

- **Recent‑form rounds:** last 3 / 6 / 12 months
- **Event history rounds:** last 5 years for
  - current eventId
  - similar‑iron eventIds
  - similar‑putting eventIds
- **Current field**
- **Approach snapshots:** L24, L12, YTD
- **Results** (post‑tournament only)

When API snapshots are present, they are logged in `apiSnapshots` within the JSON output.

### CSV Fallback Inputs

- `data/<Tournament> (<Season>) - Configuration Sheet.csv`
- `data/<Tournament> (<Season>) - Tournament Field.csv`
- `data/<Tournament> (<Season>) - Historical Data.csv`
- `data/<Tournament> (<Season>) - Approach Skill.csv`
- `data/<Tournament> (<Season>) - Tournament Results.csv`

If API ingestion is enabled, these CSVs are optional and the run will use API snapshots (logged in `apiSnapshots` in JSON output).

### Example Command (Post‑Tournament)

Use an event ID, season, and tournament name:

- `node core/optimizer.js --event <eventId> --season <season> --tournament "<Tournament>" --dryRun`

### What Data It Uses (and From Where)

- **Recent‑form rounds (3/6/12 months)** → API recent‑form snapshots (CSV fallback: historical data)
- **Event history (5 years)** → API event history snapshots (CSV fallback: historical data)
- **Current season results** → API results snapshots (CSV fallback: tournament results)
- **Approach snapshots (L24/L12/YTD)** → API approach snapshots (CSV fallback: approach skill CSV)
- **Similar/putting event IDs** → `utilities/courseContext.js` or configuration sheet
- **Template weights** → `utilities/weightTemplates.js`

### Outputs Created

- `output/optimizer_<tournament>_post_tournament_results.json`
- `output/optimizer_<tournament>_post_tournament_results.txt`

### Related Scripts/Utilities

- `core/optimizer.js` — main pipeline
- `utilities/dataPrep.js` — historical round parsing
- `utilities/weightTemplates.js` — template sources
- `scripts/compute_approach_deltas.js` — optional approach delta generation
- `core/summarizeSeedResults.js` — compare seeded runs (optional)
