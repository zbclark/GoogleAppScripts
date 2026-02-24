# Utilities & Scripts Audit — modelOptimizer

**Generated:** 2026-02-24  
**Scope:** `apps-scripts/modelOptimizer/utilities/` and `apps-scripts/modelOptimizer/scripts/`

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical (runtime crash) | 3 |
| 🟠 High (incorrect behavior / broken pass-through) | 4 |
| 🟡 Medium (maintenance / portability risk) | 6 |
| 🔵 Low (style / consistency) | 4 |

---

## 🔴 Critical Issues (will crash at runtime)

### 1. `scripts/generate_delta_player_scores.js` — Undefined variable `gasTarget`

**Line:** 130  
**Code:** `const targets = [nodeTarget, gasTarget];`  
**Problem:** `gasTarget` is never declared anywhere in the file. `nodeTarget` is defined on line 129, but no corresponding `gasTarget` definition exists. This throws a `ReferenceError` at runtime before any writes occur.  
**Expected fix:** Define `gasTarget` as the path to `apps-scripts/Golf_Algorithm_Library/utilities/deltaPlayerScores.js`, mirroring the pattern used in `analyze_course_history_impact.js` (line 677):
```js
const gasTarget = path.resolve(ROOT_DIR, '..', 'Golf_Algorithm_Library', 'utilities', 'deltaPlayerScores.js');
```

---

### 2. `scripts/compute_approach_deltas.js` — Undefined variable `resolvedPrevPath`

**Lines:** 115, 124  
**Code:**
```js
previousPath: resolvedPrevPath,   // line 115 — used in deltaMeta
console.log(`  Previous: ${resolvedPrevPath}`);  // line 124
```
**Problem:** `resolvedPrevPath` is never defined. The script computes `autoPrev` (the actual previous path) and resolves the current path to `resolvedCurrPath`, but the previous path variable is never assigned to `resolvedPrevPath`. This throws a `ReferenceError` when the script runs past line 103 (where data loading succeeds).  
**Expected fix:** Add a resolution step for the previous path parallel to the current path:
```js
const resolvedPrevPath = resolveInputPath(autoPrev);
```

---

### 3. `scripts/parity_modelcore.js` — Broken import path for `metricConfigBuilder`

**Line:** 7  
**Code:** `const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');`  
**Problem:** `metricConfigBuilder.js` lives in `utilities/`, not `core/`. There is no `metricConfigBuilder.js` in `core/`. This causes a `MODULE_NOT_FOUND` error at startup. The correct path is used in `core/optimizer.js` (line 23): `require('../utilities/metricConfigBuilder')`.  
**Expected fix:**
```js
const { buildMetricGroupsFromConfig } = require('../utilities/metricConfigBuilder');
```
> **Note:** The same incorrect `'../core/metricConfigBuilder'` path appears in several ARCHIVE files (`hybridWeightOptimizer.js`, `weightIterator.js`, `exportPowerRankingSheetLike.js`, `configurationTester.js`, `hybridGridSearchOptimizer.js`, `tournamentAnalyzer.js`), but those are in the ARCHIVE folder and not active.

---

## 🟠 High Issues (incorrect behavior or broken pass-throughs)

### 4. `utilities/collectRecords.js` — Incorrect relative import path

**Line:** 4  
**Code:** `const { loadCsv } = require('../utilities/csvLoader');`  
**Problem:** `collectRecords.js` is itself in `utilities/`. The `'../utilities/csvLoader'` path resolves to `modelOptimizer/utilities/csvLoader` only if Node resolves the parent correctly — in practice it walks up one level then back into `utilities/`, which happens to be correct on most Node.js setups. However, the canonical and correct relative path should be `'./csvLoader'` since both files are in the same directory. The current path is fragile if the file is ever relocated and creates confusion about module structure.  
**Expected fix:**
```js
const { loadCsv } = require('./csvLoader');
```

---

### 5. `utilities/metricConfigBuilder.js` — Duplicate cell references for rough approach metrics

**Lines:** 28–38  
**Problem:** Six rough-approach metric weights incorrectly read from the same spreadsheet cells as their fairway counterparts:

| Metric key | Cell read | Should read |
|---|---|---|
| `app150roughGIR` | G18 (same as `app150fwGIR`) | separate cell |
| `app150roughSG` | H18 (same as `app150fwSG`) | separate cell |
| `app150roughProx` | I18 (same as `app150fwProx`) | separate cell |
| `app200roughGIR` | G19 (same as `app200GIR`) | separate cell |
| `app200roughSG` | H19 (same as `app200SG`) | separate cell |
| `app200roughProx` | I19 (same as `app200Prox`) | separate cell |

Additionally, `scoring_app150roughSG` (line 50) reads P18 — the same cell as `scoring_app150fwSG` — and `scoring_app150roughSG_alt` (line 54) reads P20, the same as `scoring_app200plusSG`.  
**Impact:** Rough and fairway weights for 150–200 yard approach shots are always identical, preventing independent tuning of these two groups. Any optimizer run that discovers optimal weights for rough vs. fairway at this distance range cannot be encoded back into the config.  
**Resolution needed:** Confirm correct cell assignments with the configuration sheet layout and update cell references for rough metrics to their dedicated rows/columns.

---

### 6. `utilities/summarizeSeedResults.js` — Script behavior in `utilities/` folder

**Problem:** This file is a fully self-executing CLI script (parses `process.argv`, calls `process.exit`, reads and **deletes** files). It belongs in `scripts/` alongside other runnable scripts, but lives in `utilities/`. Any tool or loader that auto-imports all files from `utilities/` as modules (e.g., a future module bundler or test runner) would execute destructive file deletions upon import.  
**Impact:** Misclassified file location; side-effect risk on import.  
**Resolution:** Move to `scripts/` and update any references in documentation or `package.json` scripts.

---

### 7. `scripts/analyze_early_season_ramp.js` — Local reimplementation of shared utility diverges from `utilities/extractHistoricalRows.js`

**Lines:** 132–182  
**Problem:** The script contains its own local copy of `extractHistoricalRowsFromSnapshotPayload` that handles the `scores` array structure of a single-event payload differently from the shared version in `utilities/extractHistoricalRows.js`. Key differences:
- The local version checks `payload.scores` first (single-event path) and expands round sub-objects inline.
- The shared version's top-level branch is a flat pass-through (`if (Array.isArray(payload)) return payload`); it handles the multi-event nested object structure differently.

When `getDataGolfHistoricalRounds` returns a single-event-shaped JSON (with a top-level `scores` array), the two implementations return different row shapes, which could produce divergent metric or ranking results.  
**Resolution:** Import from `utilities/extractHistoricalRows.js` and extend the shared function if needed, rather than maintaining a local copy.

---

## 🟡 Medium Issues (portability / maintenance risk)

### 8. `utilities/course_context.json` — Hardcoded machine-specific absolute paths in `sourcePath`

**Problem:** Every event entry contains a `sourcePath` field with an absolute path anchored to `/workspaces/GoogleAppScripts/...` — the original development codespace. Example (note: `modelOptemizer` is the misspelled legacy directory name as it appears in the actual JSON):
```json
"sourcePath": "/workspaces/GoogleAppScripts/apps-scripts/modelOptemizer/data/..."
```
These paths will be wrong on any other machine, container, or CI runner. Code that uses `sourcePath` to re-read configuration data will silently fail or error.  
**Resolution:** Either strip `sourcePath` from the JSON (it is metadata only), replace it with a repo-relative path, or document that the file must be regenerated locally via `build_course_context.js` before use.

---

### 9. `utilities/courseHistoryRegression.js` — Stale / placeholder regression data

**Problem:** 18 of 19 entries have `slope: 0` and `pValue: ~1`, indicating no statistically significant course-history effect was found (or the script produced degenerate output). Only course `"500"` (TPC Scottsdale) has a non-zero slope. All entries with `pValue: 0.9999999989999999` are effectively identical no-ops.  
**Impact:** Past-performance weighting via `getCourseHistoryRegression()` is inoperative for all events except course 500. Any optimizer run that relies on course-history regression for template writeback will always apply a zero-slope adjustment.  
**Resolution:** Re-run `scripts/analyze_course_history_impact.js` with adequate historical data and regenerate this file. Until then, document that course-history weighting is inactive for most events.

---

### 10. `utilities/logging.js` — No cleanup / restore for overridden stdio streams

**Lines:** 17–26  
**Problem:** `setupLogging` replaces `process.stdout.write` and `process.stderr.write` permanently for the lifetime of the process, with no teardown or restore callback. If the log file stream (`logStream`) encounters a write error, the original stdio streams are gone. There is also no way to call `logStream.end()` on clean shutdown, which may truncate the log file when the process exits.  
**Resolution:** Expose a `teardown()` or `restoreLogging()` function, or use the `'exit'` process event to flush and close the stream.

---

### 11. `utilities/weightTemplates.js` vs `Golf_Algorithm_Library/utilities/templateLoader.js` — Template set mismatch

**Problem:** The two files are supposed to stay in sync (per `MODEL_VALIDATION_STATUS.md`), but their template sets diverge:

| Template | `weightTemplates.js` | `templateLoader.js` |
|---|:---:|:---:|
| POWER | ✅ | ✅ |
| TECHNICAL | ✅ | ✅ |
| BALANCED | ✅ | ✅ |
| BALANCED_PGA_WEST | ❌ missing | ✅ |
| PEBBLE_BEACH_GOLF_LINKS | ✅ | ✅ |
| WAIALAE_COUNTRY_CLUB | ✅ | ✅ |
| THE_RIVIERA_COUNTRY_CLUB | ✅ | ✅ |
| PGA_NATIONAL_RESORT_CHAMPION_COURSE | ✅ | ❌ missing |
| ROYAL_PORTRUSH | ✅ | ❌ missing |
| TPC_LOUISIANA | ✅ | ❌ missing |

`BALANCED_PGA_WEST` is only in `templateLoader.js`; three course-specific templates are only in `weightTemplates.js`. Any GAS writeback using templates not in `templateLoader.js` will silently fall back to a default, and lookups for `BALANCED_PGA_WEST` from the Node side will return `undefined`.  
**Resolution:** Synchronize both files. Per `MODEL_VALIDATION_STATUS.md`, `results.js`/`templateLoader.js` is the source of truth, so migrate the three missing templates to `templateLoader.js` and add `BALANCED_PGA_WEST` to `weightTemplates.js`.

---

### 12. `utilities/deltaPlayerScores.js` — Exports only `DELTA_PLAYER_SCORES` data; no loader function

**Problem:** The `utilities/deltaPlayerScores.js` Node file includes `module.exports` with `DELTA_PLAYER_SCORES`, `getDeltaPlayerScoresForEvent`, and `getDeltaPlayerScores`. However, `parity_modelcore.js` imports only `getDeltaPlayerScoresForEvent` (line 9), which works. But `generate_delta_player_scores.js` generates this file with the full function set only when `includeModuleExports = true`, which is gated on whether `filePath === nodeTarget`. If the target logic or `DRY_RUN` mode produces the wrong suffix, the generated file may lack `module.exports`, breaking all downstream consumers.  
**Resolution:** Add an integration test or assertion that the generated Node file always includes `module.exports`. Also ensure `DRY_RUN` mode produces a `.node.js` preview file separate from the live target.

---

## 🔵 Low Issues (style / consistency)

### 13. `scripts/analyze_course_history_impact.js` — Debug `console.log` left in production path

**Line:** 629  
**Code:** `console.log(\`DEBUG: courseNum ${courseNum} has ${entries.length} entries\`);`  
**Problem:** A prefixed `DEBUG:` log statement was left in the main `run()` function and will appear in all output logs. A similar pattern appears at line 637: `console.log(\`DEBUG: No regression computed...\`)`.  
**Resolution:** Remove or convert to a conditional debug mode (e.g., guarded by `OVERRIDE_DEBUG_API`).

---

### 14. `scripts/compare_parity_outputs.js` — Hardcoded tournament-specific default paths

**Lines:** 5–6  
**Code:**
```js
const DEFAULT_NODE_PATH = path.resolve(__dirname, '..', 'output', 'genesis', 'parity_modelcore.json');
const DEFAULT_GAS_PATH = path.resolve(__dirname, '..', 'output', 'genesis', 'Genesis Invitational (2026) - Player Ranking Model.csv');
```
**Problem:** Defaults are hardcoded to a specific 2026 Genesis Invitational output. The script requires explicit `--node` and `--gas` flags for any other event, but will error with a confusing path-not-found message if run without flags for any other tournament.  
**Resolution:** Use environment variables or a generic default (e.g., requiring the flags explicitly), and document the expected usage in the script's help output.

---

### 15. `scripts/build_course_context.js` — Output `sourcePath` captures machine-absolute paths

**Lines:** 62–74  
**Problem:** When building `course_context.json`, the `sourcePath` field is written as the absolute filesystem path of the config CSV at build time. This creates a portability problem (see Issue #8 above). The `build_course_context.js` script itself is correct in logic, but should normalize the path to be repo-relative or strip it entirely.  
**Resolution:** Convert `sourcePath` to a repo-relative path before writing:
```js
const repoRoot = path.resolve(__dirname, '..', '..', '..');
entry.sourcePath = path.relative(repoRoot, filePath);
```

---

### 16. `utilities/configParser.js` — `cleanNumber` fallback silently returns `0` for unset cells

**Lines:** 4–9  
**Code:** `const cleanNumber = (value, fallback = 0) => { ... return Number.isFinite(parsed) ? parsed : fallback; }`  
**Problem:** Unpopulated or blank cells in the configuration sheet return `0` silently. For weight fields (e.g., `pastPerformanceWeight`), a weight of `0` is valid and indistinguishable from an unset/missing cell. This makes debugging weight configuration errors harder.  
**Resolution:** Consider a distinct sentinel value (`null`) as the default fallback for weight cells and let callers decide how to handle missing values; or at minimum log a warning when a weight cell parses to `0`.

---

## File-by-File Reference

### `utilities/`

| File | Status | Notes |
|---|---|---|
| `approachDelta.js` | ✅ OK | Well-structured; exports `loadApproachCsv`, `computeApproachDeltas`, `METRIC_DEFS` |
| `buildRecentYears.js` | ✅ OK | Simple utility; no issues |
| `collectRecords.js` | 🟠 See #4 | Wrong relative import path (`../utilities/csvLoader` → `./csvLoader`) |
| `configParser.js` | 🔵 See #16 | `cleanNumber` fallback silently returns `0` |
| `courseHistoryRegression.js` | 🟡 See #9 | Nearly all entries are placeholder zeroes; data likely stale |
| `course_context.json` | 🟡 See #8 | Hardcoded machine-specific absolute `sourcePath` values |
| `csvLoader.js` | ✅ OK | Robust CSV loader with header auto-detection |
| `dataGolfClient.js` | ✅ OK | Retry + cache logic is clean; exports all needed API functions |
| `dataPrep.js` | ✅ OK | Imports `cleanMetricValue` from `core/modelCore` correctly |
| `deltaPlayerScores.js` | 🟡 See #12 | Generated file; correctness depends on generator script |
| `extractHistoricalRows.js` | ✅ OK | Handles most payload shapes; used as shared utility |
| `logging.js` | 🟡 See #10 | No stdio restore or stream cleanup on process exit |
| `metricConfigBuilder.js` | 🟠 See #5 | Duplicate cell refs for rough approach metrics; imports from `core/modelCore` correctly |
| `summarizeSeedResults.js` | 🟠 See #6 | CLI script placed in `utilities/`; performs file deletions |
| `tournamentConfig.js` | ✅ OK | Stub/utility; clean pass-through helpers |
| `weightTemplates.js` | 🟡 See #11 | Template set out-of-sync with `templateLoader.js` |

### `scripts/`

| File | Status | Notes |
|---|---|---|
| `analyze_course_history_impact.js` | 🔵 See #13 | Debug `console.log` left in production path |
| `analyze_early_season_ramp.js` | 🟠 See #7 | Local reimplementation of `extractHistoricalRowsFromSnapshotPayload` diverges from shared utility |
| `build_course_context.js` | 🔵 See #15 | Writes machine-absolute `sourcePath` into output JSON |
| `compare_parity_outputs.js` | 🔵 See #14 | Hardcoded default paths for a specific 2026 tournament |
| `compute_approach_deltas.js` | 🔴 See #2 | `resolvedPrevPath` is undefined; ReferenceError at runtime |
| `generate_delta_player_scores.js` | 🔴 See #1 | `gasTarget` is undefined; ReferenceError at runtime |
| `parity_modelcore.js` | 🔴 See #3 | Imports `metricConfigBuilder` from `core/` (wrong path; file is in `utilities/`) |
| `update_readme_last_updated.js` | ✅ OK | Simple date-stamp utility; no issues |

---

## Migration Readiness Notes

1. **`results.js` remains source of truth** per `MODEL_VALIDATION_STATUS.md`. Any migration of `parity_modelcore.js` or related scripts to use the consolidated pipeline should go through `core/modelCore.js` (already a port of `results.js`).

2. **Approach snapshot leakage flag** (open task in `MODEL_VALIDATION_STATUS.md`): `approachDelta.js` does not currently emit any leakage flag on its rows. The `compute_approach_deltas.js` `deltaMeta.note` field mentions "lower-is-better metrics should be inverted downstream" but there is no corresponding leakage annotation at the row level.

3. **API → CSV fallback ordering**: `analyze_course_history_impact.js` and `analyze_early_season_ramp.js` use different source-priority ordering. The course history script tries CSV first (via `collectRecords`), then API. The ramp script tries cache JSON first, then CSV, then API. These orderings should be unified in a shared data-loading utility.

4. **Course context portability**: `course_context.json` cannot be committed and reused across machines without regeneration. Consider adding `build_course_context.js` to pre-run scripts or a Makefile target, and documenting that `course_context.json` is a build artifact.
