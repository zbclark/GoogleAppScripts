# Handoff Summary (2026-02-10)

## Context and Goal
We are aligning the Node.js parity model (`apps-scripts/weightSensitivity/`) with the production GAS model (`apps-scripts/Golf_Algorithm_Library/modelGeneration/results.js`). The "bible" is `results.js` in GAS. The current objective is to make Node parity outputs (rankings and weighted scores) match GAS when using the **same templates, same input data, and the same current-event exclusion rules**.

## What We Just Did
### 1) Parity rules and data-scoping adjustments
- Implemented and refined a "parity mode" for Node runs where **current event rounds in the current season are excluded**, but **other current-season events remain**.
- Updated default behavior so `--excludeCurrentEventRounds` is the **default** for optimization runs, while **correlation analysis still includes current-season data**.
- This is now encoded in `adaptiveOptimizer_v2.js` via `CURRENT_EVENT_ROUNDS_DEFAULTS` and filtering logic in `getCurrentSeasonRoundsForRanking()`.

### 2) Shot-distribution reweighting parity (major mismatch fix)
- Found that GAS **dynamically re-weights Scoring & Course Management approach sub-metrics** based on **shot distribution (P17–P20)** inside `templateLoader.js`.
- Node previously did **not** apply that dynamic reweighting. This made "same template" runs diverge (weights effectively different in GAS vs Node).
- Implemented equivalent dynamic reweighting in Node (`adaptiveOptimizer_v2.js`):
  - New helper `applyShotDistributionToMetricWeights()`
  - Applied in `runRanking()` so **every ranking uses the same adjusted weights** as GAS.

### 3) Re-ran parity workflow with template write
- Ran:
  ```
  node adaptiveOptimizer_v2.js --event 6 --season 2026 --tournament "Sony Open" --excludeCurrentEventRounds --writeTemplates
  ```
- New outputs written:
  - `apps-scripts/weightSensitivity/output/adaptive_optimizer_v2_results.json`
  - `apps-scripts/weightSensitivity/output/adaptive_optimizer_v2_results.txt`
  - `apps-scripts/weightSensitivity/utilities/weightTemplates.js`
  - `apps-scripts/Golf_Algorithm_Library/utilities/templateLoader.js`

### 4) Deployment and Git
- Pushed GAS-only production update:
  - `scripts/push_to_production.sh Golf_Algorithm_Library`
- Committed & pushed parity changes to GitHub:
  - Commit: `45cb6b1` — “Align parity run exclusions and shot distribution weighting”

## Current State (Key Observations)
### GAS Top 20 (user-provided)
```
1  13562 Matsuyama, Hideki   1.29
2  27194 Hall, Harry         1.30
3  18634 McNealy, Maverick   1.14
4  17536 Spaun, J.J.         0.96
5  14578 Henley, Russell     0.89
6  28159 Meissner, Mac       0.87
7  17606 Berger, Daniel      0.83
8  19870 McCarthy, Denny     0.75
9  12577 Woodland, Gary      0.64
10 28635 McCarty, Matt       0.61
11 21891 Kitayama, Kurt      0.59
12 24968 Griffin, Ben        0.59
13 11049 Simpson, Webb       0.55
14 23323 MacIntyre, Robert   0.54
15 25157 Hodges, Lee         0.50
16 14609 Kim, Si Woo         0.50
17 13126 Taylor, Nick        0.40
18 12423 Kirk, Chris         0.42
19 13872 Bradley, Keegan     0.36
20 24550 Ghim, Doug          0.34
```

### Node Top 20 (after shot distribution fix)
```
1  13562 Matsuyama, Hideki   0.75
2  17536 Spaun, J.J.         0.69
3  27194 Hall, Harry         0.55
4  18634 McNealy, Maverick   0.51
5  14578 Henley, Russell     0.44
6  17606 Berger, Daniel      0.40
7  28159 Meissner, Mac       0.40
8  14792 Saddier, Adrien     0.29
8  25739 Yonezawa, Ren       0.29
8  32081 Nagasaki, Taisei    0.29
8  10047735 Kozuma, Corey    0.29
8  30041790 Cabello, Anson   0.29
13 28635 McCarty, Matt       0.26
14 12577 Woodland, Gary      0.25
15 32457 Keefer, Johnny      0.21
16 24968 Griffin, Ben        0.23
17 21891 Kitayama, Kurt      0.22
18 14609 Kim, Si Woo         0.22
19 22085 Morikawa, Collin    0.17
20 20954 Hirata, Kensei      0.17
```

### Key mismatch still present
- **Ordering and weighted scores still differ**, even after dynamic reweighting.
- Node includes several low-data players (ties at 0.29) that do **not** appear in GAS top 20.
- Weighted scores are **systematically lower in Node** vs GAS.

## What We Believe Is Next to Debug
### 1) Confirm identical inputs for ranking calculations
- Even with the same config values, we must verify **field, historical, and approach data are identical** between GAS and the local Node CSVs.
- If GAS data is fresher or filtered differently, rankings will drift.

### 2) Validate that current-event exclusion logic matches GAS
- GAS excludes **current season + current event** during historical data aggregation (`results.js` line ~2346).
- Node uses the same exclusion logic now, but we need to confirm the **effective filtered row count** is identical.

### 3) Check past performance logic parity
- GAS past performance uses `currentEventId` exclusion and applies a recency-weighted multiplier.
- Node has the same logic, but verify that **event keys and positions** are computed the same way (string coercion, tie handling, CUT/WD/DQ parsing).

### 4) Identify scoring normalization differences
- Weighted score in GAS is normalized by total group weight; Node does the same.
- Still, **GAS weighted scores appear larger**; verify:
  - Data coverage / confidence multipliers
  - Group stats (means/stdDev) computed from the same input set
  - `Birdie Chances Created` (BCC) placement and metric indices

### 5) Debug a single player end-to-end
- Pick one player (e.g., Matsuyama) and trace:
  - Raw metrics
  - Group stats mean/std
  - Z-score per metric
  - Group score
  - Weighted score
  - Refined weighted score
- Compare Node vs GAS for each step.

## Quick Commands (Node)
- Run parity:
  ```
  cd apps-scripts/weightSensitivity
  node adaptiveOptimizer_v2.js --event 6 --season 2026 --tournament "Sony Open" --excludeCurrentEventRounds --writeTemplates
  ```
- Print Node top-20:
  ```
  node <<'NODE'
  const data=require('./output/adaptive_optimizer_v2_results.json');
  const ranks=data.step3_optimized.rankingsCurrentYear || [];
  ranks.slice(0,20).forEach(r=>{
    const score=typeof r.weightedScore==='number'?r.weightedScore.toFixed(2):'n/a';
    console.log(`${r.rank}\t${r.dgId}\t${r.name}\t${score}`);
  });
  NODE
  ```

## Files Recently Touched
- `apps-scripts/weightSensitivity/adaptiveOptimizer_v2.js`
  - Added shot-distribution reweighting for parity
  - Adjusted default current-event exclusion
- `apps-scripts/weightSensitivity/utilities/weightTemplates.js` (written by optimizer)
- `apps-scripts/Golf_Algorithm_Library/utilities/templateLoader.js` (written by optimizer)
- `apps-scripts/weightSensitivity/modelCore.js` (parity changes earlier in session)
- `apps-scripts/Golf_Algorithm_Library/modelGeneration/results.js` (parity changes earlier in session)

## Next Action Checklist
- [ ] Verify CSV exports match GAS sheet data (field/history/approach)
- [ ] Compare row counts after exclusion rules in GAS vs Node
- [ ] End-to-end debug a single player’s weightedScore in GAS vs Node
- [ ] Re-run parity and confirm top-20 alignment
