# Weight Sensitivity Analysis — Adaptive Optimizer v2

## Overview

This folder now centers on **`core/adaptiveOptimizer_v2.js`**, which runs a full, end‑to‑end optimization workflow:

1. **Historical metric correlations** (past years)
2. **Current‑season baseline** (template comparison)
3. **Weight optimization** (randomized search with KPI blend)
4. **Multi‑year validation** (2026 approach metrics against historical seasons)

It produces JSON + text summaries and can optionally write optimized templates back into production loaders.

## Quick Start

```bash
node core/adaptiveOptimizer_v2.js --event 3 --season 2026 --tournament "WM Phoenix Open" --dryRun
```

### Seeded runs (reproducible)

```bash
OPT_SEED=phoenix2026_b node core/adaptiveOptimizer_v2.js --event 3 --season 2026 --tournament "WM Phoenix Open" --dryRun
```

### Large runs in the background

```bash
OPT_TESTS=10000 OPT_SEED=phoenix2026_a node core/adaptiveOptimizer_v2.js --event 3 --season 2026 --tournament "WM Phoenix Open" --dryRun > output/wm_phoenix_open_seed-phoenix2026_a_run.log 2>&1 &
```

### Multiple background seeds

```bash
for seed in a d e; do OPT_TESTS=10000 OPT_SEED=phoenix2026_${seed} node core/adaptiveOptimizer_v2.js --event 3 --season 2026 --tournament "WM Phoenix Open" --dryRun > output/wm_phoenix_open_seed-phoenix2026_${seed}_run.log 2>&1 & done
```

### Summarize seeded runs

```bash
node core/summarizeSeedResults.js --tournament "WM Phoenix Open"
```

## Flags and Environment Variables

### Required

- `--event` / `--eventId` (string): Event ID used to filter historical rounds.

### Recommended

- `--season` / `--year` (number): Current season context. Defaults to `2026`.
- `--tournament` / `--name` (string): Tournament display name used for file resolution and output naming.

### Optional

- `--template <NAME>`: Restrict to a specific template (e.g., `POWER`, `BALANCED`, `TECHNICAL`, or event‑id template).
- `--tests <N>`: Override number of optimization tests (same effect as `OPT_TESTS`).
- `--log` / `--verbose`: Enable console logging (default is quiet).
- `--writeTemplates`: Writes optimized template back to loaders (see “Paths” below). Default is **dry‑run**.
- `--dryRun` / `--dry-run`: Forces dry‑run (templates not written). Default = `true` unless `--writeTemplates` is supplied.
- `--includeCurrentEventRounds`: Include current event rounds in metric/baseline/optimization steps.
- `--excludeCurrentEventRounds`: Exclude current event rounds (parity mode). Defaults are shown at runtime.

### Environment

- `OPT_SEED=<value>`: Seed for reproducible randomized search. Also changes output filename suffix.
- `OPT_TESTS=<N>`: Number of optimization tests (default is 1500 when not overridden).
- `LOGGING_ENABLED=1`: Enable console logging (same as `--log`).

## Paths and Outputs (When and Why Each Exists)

### Input CSV paths (resolved automatically)

The script looks in **two places** for tournament files:

1. `apps-scripts/weightSensitivity/` (repo root of this module)
2. `apps-scripts/weightSensitivity/data/`

Files are resolved via the tournament name + season (fallbacks included):

- `* - Configuration Sheet.csv`
- `* - Tournament Field.csv`
- `* - Historical Data.csv`
- `* - Approach Skill.csv`
- `* - Tournament Results.csv` (optional — if missing, results are derived from historical data)

### Output paths

All outputs are written to:

`apps-scripts/weightSensitivity/output/`

**Full optimization run (current results exist):**

- `<tournament>_results.json`
- `<tournament>_results.txt`

**Seeded run (reproducible):**

- `<tournament>_seed-<OPT_SEED>_results.json`
- `<tournament>_seed-<OPT_SEED>_results.txt`

**Pre‑event mode (no results file):**

- `adaptive_optimizer_v2_results.json`
- `adaptive_optimizer_v2_results.txt`

**Dry‑run template previews (only when `--writeTemplates` is used in dry‑run mode):**

- `output/dryrun_weightTemplates.js`
- `output/dryrun_templateLoader.js`

### Template write‑back paths (only when `--writeTemplates` is used)

- `apps-scripts/weightSensitivity/utilities/weightTemplates.js`
- `apps-scripts/Golf_Algorithm_Library/utilities/templateLoader.js`

These are updated with the optimized weights for the target event.

## What the Script Produces

The JSON/text outputs include:

- Historical correlations (per year + aggregate)
- Current‑season generated metric correlations
- Top‑20 logistic model + cross‑validation
- Baseline template comparisons
- Optimized weights + objective scores
- Multi‑year validation results
- Final recommendation

## Troubleshooting

**Missing required input files?**
Ensure the 4 required CSVs exist in either the module root or `data/`.

**No results file?**
The script automatically falls back to deriving results from historical data and switches to pre‑event training mode.

**Need deterministic runs?**
Use `OPT_SEED` and keep input CSVs unchanged.

---

*Last updated: Feb 12, 2026*
