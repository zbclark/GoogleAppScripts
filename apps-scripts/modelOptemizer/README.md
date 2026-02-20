# Weight Sensitivity Analysis — Adaptive Optimizer v2

## Overview

This folder now centers on **`core/optimizer.js`**, which runs a full, end‑to‑end optimization workflow:

1. **Historical metric correlations** (past years)
2. **Current‑season baseline** (template comparison)
3. **Weight optimization** (randomized search with KPI blend)
4. **Multi‑year validation** (current‑season approach metrics against historical seasons)

It produces JSON + text summaries and can optionally write optimized templates back into production loaders.

## Quick Start

```bash
# Run a single dry-run optimization for the specified event/season.
node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun
```

### Seeded runs (reproducible)

```bash
# Run a reproducible dry-run using a fixed seed.
OPT_SEED=[seed] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun
```

### Large runs in the background

```bash
# Run a large dry-run in the background and write logs to a file.
OPT_TESTS=[tests] OPT_SEED=[seed] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun > output/[tournament]_seed-[seed]_run.log 2>&1 &
```

### Multiple background seeds

```bash
# Launch multiple background seeds in parallel.
for seed in [seed1] [seed2] [seed3]; do OPT_TESTS=[tests] OPT_SEED=$seed node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun > output/[tournament]_seed-${seed}_run.log 2>&1 & done
```

## Tmux guide (long‑running runs)

Use tmux to keep runs alive after disconnecting, monitor progress, and manage multiple runs.

### Start a session and run jobs

- **Create a new session:**
	- `tmux new -s [session_name]` — start a new tmux session for long-running jobs.
- **Run the 5‑seed, 10,000‑test batch:**
	- `for seed in a b c d e; do OPT_TESTS=[tests] OPT_SEED=[seed] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun > output/[tournament]_seed-[seed]_run.log 2>&1; done` — sequentially run five seeds in one session.

### Detach / attach / list

- **Detach (leave session running):** `Ctrl+b` then `d`
- **List sessions:** `tmux ls`
- **Attach to a session:** `tmux attach -t [session_name]`

To leave a pane without stopping the session:

- **Detach from tmux:** `Ctrl+b` then `d`

To close a single pane:

- Type `exit` in that pane (stops the command in that pane)

### Windows (tabs)

- **New window:** `Ctrl+b` then `c`
- **Next/previous window:** `Ctrl+b` then `n` / `p`
- **Rename window:** `Ctrl+b` then `,`
- **List windows:** `Ctrl+b` then `w`

### Panes (splits)

- **Vertical split:** `Ctrl+b` then `%`
- **Horizontal split:** `Ctrl+b` then `"`
- **Move between panes:** `Ctrl+b` then arrow keys
- **Close a pane:** type `exit` in that pane

### Scrollback and copy

- **Enter scroll/copy mode:** `Ctrl+b` then `[`
- **Exit copy mode:** `q`
- **Search in scrollback:** `Ctrl+b` then `[` then `/` (press `n` for next match)

### Manage sessions

- **Rename session:** `tmux rename-session -t [session_name] [new_name]`
- **Kill a session:** `tmux kill-session -t [session_name]`
- **Kill all sessions:** `tmux kill-server`

### Mini‑cheat sheet

- **Detach:** `Ctrl+b` then `d` — leave tmux running and return to your normal shell.
- **List sessions:** `tmux ls` — see all active tmux sessions.
- **Attach:** `tmux attach -t [session_name]` — rejoin a running session.
- **New window:** `Ctrl+b` then `c` — open a new tab inside tmux.
- **Switch window:** `Ctrl+b` then `w` — pick a different tmux window.
- **Split pane (vertical):** `Ctrl+b` then `%` — side‑by‑side panes.
- **Split pane (horizontal):** `Ctrl+b` then `"` — stacked panes.
- **Move panes:** `Ctrl+b` then arrow keys — focus another pane.
- **Close pane:** type `exit` — stop the command running in that pane.
- **Kill session:** `tmux kill-session -t [session_name]` — stop the entire session.

### Check progress & logs

- **Follow a seed log (recommended):** `tail -F output/[tournament]_seed-[seed]_run.log`
- **List output files:** `ls -lh output/ | grep [tournament]`

Example (generic):

- `tail -F output/[tournament]_seed-[seed]_run.log`

### 5‑pane log monitor (a–e)

If you want a tiled view for all five seeds, add two panes and retile:

- **Add panes + tile:** `Ctrl+b` then `%` (twice), then `Ctrl+b` then `Space` until **tiled**
- **Start tails in each pane (use `-F` so it follows when files appear):**
	- `tail -F output/[tournament]_seed-[seed]_run.log`
	- `tail -F output/[tournament]_seed-[seed]_run.log`
	- `tail -F output/[tournament]_seed-[seed]_run.log`
	- `tail -F output/[tournament]_seed-[seed]_run.log`
	- `tail -F output/[tournament]_seed-[seed]_run.log`

Example (generic):

- `tail -F output/[tournament]_seed-[seed]_run.log`
- `tail -F output/[tournament]_seed-[seed]_run.log`
- `tail -F output/[tournament]_seed-[seed]_run.log`
- `tail -F output/[tournament]_seed-[seed]_run.log`
- `tail -F output/[tournament]_seed-[seed]_run.log`

Optional: pre‑create the log files so `tail` never exits.

- `touch output/[tournament]_seed-[seed]_run.log`

Example (generic):

- `touch output/[tournament]_seed-[seed]_run.log`

> Note: seeds run **sequentially**, so logs for b–e appear after earlier seeds finish.

### Summarize seeded runs

```bash
# Compare all seed results and print a summary.
node core/summarizeSeedResults.js --tournament "[tournament name]"
```

## End-to-end workflow (seed runs → monitor → compare → dry-run → writeback)

1) Kick off the seed runs (same tests for all seeds):

- `OPT_TESTS=[tests] OPT_SEED=[seed1] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun --log > output/[tournament]_seed-[seed1]_run.log 2>&1 &` — run seed 1 in background and log output.
- `OPT_TESTS=[tests] OPT_SEED=[seed2] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun --log > output/[tournament]_seed-[seed2]_run.log 2>&1 &` — run seed 2 in background and log output.
- `OPT_TESTS=[tests] OPT_SEED=[seed3] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun --log > output/[tournament]_seed-[seed3]_run.log 2>&1 &` — run seed 3 in background and log output.

2) Monitor logs (recommended):

- `tail -F output/[tournament]_seed-[seed]_run.log` — follow live output as each seed runs.

3) Summarize and compare seed results:

- `node core/summarizeSeedResults.js --tournament "[tournament name]"` — compare seeds and pick the best.

4) Dry-run the winning seed (same seed + same tests):

- `OPT_TESTS=[tests] OPT_SEED=[winning-seed] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --dryRun --writeTemplates` — generate dry-run template outputs.

5) Write back (only after verifying dry-run outputs):

- `OPT_TESTS=[tests] OPT_SEED=[winning-seed] node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --writeTemplates` — write the templates to the loaders.

Optional (standard templates):

- Add `--writeValidationTemplates` to also update POWER/BALANCED/TECHNICAL when the baseline is a standard template and the validation template differs.

## Flags and Environment Variables

### Required

- `--event` / `--eventId` (string): Event ID used to filter historical rounds.

### Recommended

- `--season` / `--year` (number): Current season context. Defaults to the current season when not provided.
- `--tournament` / `--name` (string): Tournament display name used for file resolution and output naming.

### Optional

- `--template <NAME>`: Restrict to a specific template (e.g., `POWER`, `BALANCED`, `TECHNICAL`, or event‑id template).
- `--tests <N>`: Override number of optimization tests (same effect as `OPT_TESTS`).
- `--log` / `--verbose`: Enable console logging (default is quiet).
- `--dir <name>`: Use `data/<name>` and `output/<name>` (folders are created if missing). Preferred for subfolder runs (e.g., `--dir pebble_beach`).
- `--dataDir <path>`: Override input data directory (advanced usage).
- `--outputDir <path>`: Override output directory (advanced usage).
- `--writeTemplates`: Writes optimized template back to loaders (see “Paths” below). Default is **dry‑run**.
- `--writeValidationTemplates`: Also write POWER/BALANCED/TECHNICAL templates using the validation CSV outputs (Weight Templates + 03_*_Summary). Honors `--dryRun`.
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

1. `apps-scripts/modelOptemizer/` (repo root of this module)
2. `apps-scripts/modelOptemizer/data/`

Files are resolved via the tournament name + season (fallbacks included):

- `* - Configuration Sheet.csv`
- `* - Tournament Field.csv`
- `* - Historical Data.csv`
- `* - Approach Skill.csv`
- `* - Tournament Results.csv` (optional — if missing, results are derived from historical data)

### Output paths

All outputs are written to:

`apps-scripts/modelOptemizer/output/`

**Full optimization run (current results exist):**

- `optimizer_<tournament>_post_tournament_results.json`
- `optimizer_<tournament>_post_tournament_results.txt`

**Seeded run (reproducible):**

- `optimizer_<tournament>_seed-<OPT_SEED>_post_tournament_results.json`
- `optimizer_<tournament>_seed-<OPT_SEED>_post_tournament_results.txt`

**Pre‑event mode (no results file):**

- `optimizer_<tournament>_pre_event_results.json`
- `optimizer_<tournament>_pre_event_results.txt`

**Dry‑run template previews (only when `--writeTemplates` is used in dry‑run mode):**

- `output/dryrun_weightTemplates.js`
- `output/dryrun_templateLoader.js`

**Dry‑run validation template previews (only when `--writeValidationTemplates` is used in dry‑run mode):**

- `output/dryrun_POWER_weightTemplates.js`
- `output/dryrun_BALANCED_weightTemplates.js`
- `output/dryrun_TECHNICAL_weightTemplates.js`
- `output/dryrun_POWER_templateLoader.js`
- `output/dryrun_BALANCED_templateLoader.js`
- `output/dryrun_TECHNICAL_templateLoader.js`

## Weekly approach delta pipeline

Use this to compute week‑over‑week deltas from consecutive **Approach Skill** CSVs (e.g., Pebble → Genesis). The output can be fed into validation/optimization experiments as additional features or stability checks.

**Inputs:**

- Previous week: `* - Approach Skill.csv`
- Current week: `* - Approach Skill.csv`

**Output:**

- `output/approach_deltas.csv` (default)
- Optional JSON file for programmatic use

**Run:**

```bash
node scripts/compute_approach_deltas.js --previous "data/AT&T - Pebble Beach (2026) - Approach Skill.csv" --current "data/Genesis Invitational (2026) - Approach Skill.csv" --out "output/approach_deltas_genesis_vs_pebble.csv" --outJson "output/approach_deltas_genesis_vs_pebble.json"
```

**Field filtering (optional):**

- If a single `* - Tournament Field.csv` exists in `data/`, it is auto‑detected.
- You can override with `--field "data/<Tournament> - Tournament Field.csv"`.
- Each output row includes `tournament_field: true|false|null`.

**Delta output details:**

- **Raw deltas are emitted.** Lower‑is‑better metrics (e.g., `*_proximity_per_shot`, `*_poor_shot_count`) should be inverted downstream using the same normalization logic as other metrics.
- **Low‑data filtering (Option C):** if `low_data_indicator = 1` for a bucket, deltas are only kept when `shot_count >= 20` for either week; otherwise delta values are set to `null` for that bucket.
- **Volume‑weighted deltas:** for good/poor shot rates, weighted deltas are written using $\sqrt{n_{prev}+n_{curr}}$ as the volume weight.
- **Good/Poor shot counts:** derived counts are computed as `shot_count × rate`, with deltas emitted (subject to low‑data filtering).
- **JSON meta:** JSON output includes a `meta` block with generation details and guidance.
- **Snapshot naming convention:** Approach Skill files are named for the *next* event because they reflect data available after the prior week completes. For post‑tournament analysis, use **before = prior snapshot (e.g., Pebble)** and **after = next snapshot (e.g., Genesis)** to reflect changes leading into the next event.

### Pre‑tournament approach delta baseline (rolling)

When no current results exist, the optimizer now builds a **rolling average** approach‑delta prior from the most recent `approach_deltas*.json` files found in `output/` or `data/`.

- Default window: **last 4 files** (newest by `meta.generatedAt`, falling back to file mtime).
- Filtered to the current tournament field.
- Emits a normalized alignment map in the output under `approachDeltaPrior.mode = "rolling_average"`.

Control the window size with:

```bash
APPROACH_DELTA_ROLLING_EVENTS=6
```

Set to 0 to disable the rolling approach‑delta prior:

```bash
APPROACH_DELTA_ROLLING_EVENTS=0
```

Or via CLI:

```bash
node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --rollingDeltas 6
```

Disable via CLI:

```bash
node core/optimizer.js --event [event id] --season [season] --tournament "[tournament name]" --rollingDeltas 0
```

### Template write‑back paths (only when `--writeTemplates` is used)

- `apps-scripts/modelOptemizer/utilities/weightTemplates.js`
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

**Update the README timestamp**
Run: `node scripts/update_readme_last_updated.js` — updates the “Last updated” line.

---

*Last updated: [date]*
