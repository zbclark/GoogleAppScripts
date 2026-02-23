# Golf Algorithm Validation Framework
## Complete 6-Phase Validation & Iteration System

---

## Overview
This framework validates tournament prediction accuracy, identifies which metrics drive wins, and optimizes weight allocation through iterative testing and sensitivity analysis.

**Goal:** Build a data-driven, evidence-based model for predicting tournament winners

---

## Phase 1: Current Analysis ✅ (COMPLETED + GAS parity aligned)

### Objective
Generate foundational correlation data showing which metrics correlate with tournament success

### Functions
- `analyzeMetricCorrelations()` - Main orchestration
- `getTournamentConfigurationWeights()` - Load config weights
- `calculatePearsonCorrelation()` - Metric-to-finish correlation

### Outputs (Sheets)
- **02_[Tournament] sheets** - Per-tournament breakdowns
  - Metric, Top 10 Avg, Field Avg, Delta, % Above Field, Correlation, Config Weight, Template Weight, Recommended Weight
  
- **03_[Type]_Summary sheets** - By course type aggregation
  - Shows which metrics consistently matter by type

- **00_Course_Type_Classification** - Tournament clustering
  - POWER, TECHNICAL, BALANCED classification

- **04_Weight_Calibration_Guide** - Template vs Recommended comparison
  - Identifies weight adjustments needed

### Success Metrics
- ✅ Metrics load correctly
- ✅ Correlations calculated
- ✅ Weights displayed
- ✅ No orphaned metrics

### Known Limitations
- Scoring weights (row 23-24) loaded but not analyzed
- No prediction accuracy testing yet
- No sensitivity analysis

---

## Phase 2: Model Prediction Accuracy Testing 🎯 (NEXT)

### Objective
Test if current template weights actually predict tournament winners

### New Functions
- `buildPlayerWeightedScores(tournament, configWeights, playerData)`
  - For each player: calculate weighted score using config weights
  - Input: Player metrics from Player Ranking Model, config weights
  - Output: Player weighted scores

- `predictTournamentFinishes(tournament, weightedScores)`
  - Rank players by weighted score
  - Generate predicted finish position for each player
  - Output: Predicted rankings

- `calculatePredictionAccuracy(predicted, actual)`
  - Compare predicted vs actual finishes
  - Calculate: correlation, RMSE, accuracy rate (% within N spots), top-10 accuracy
  - Output: Accuracy metrics

- `generatePredictionValidationSheet(masterSs, correlationData, results)`
  - Create validation sheet showing all predictions vs actuals
  - Highlight misses (predicted top-10 who didn't finish top-10)
  - Highlight surprises (actual winners who ranked low in prediction)
  - Output: "05_Prediction_Accuracy" sheet

### Data Flow
```
Config Weights (row 16-20)
         ↓
Player Metrics (Player Ranking Model)
         ↓
Calculate Weighted Scores
         ↓
Rank Players (Predicted Finishes)
         ↓
Compare to Actual Finishes
         ↓
Calculate Accuracy Metrics
```

### Outputs
- **05_Prediction_Accuracy sheet** showing:
  - Player, Predicted Rank, Actual Rank, Prediction Error, Top-10 Hit (Y/N)
  - Summary: Correlation, RMSE, % accuracy, Top-10 accuracy rate
  - Color coding: Green (correct), Yellow (close), Red (missed)

- **Accuracy Summary by Type**
  - POWER course accuracy vs TECHNICAL vs BALANCED
  - Answer: "Are different weights needed per type?"

### Success Criteria
- Accuracy > 40% (reasonable baseline)
- Top-10 prediction accuracy > 50%
- Correlation > 0.3 with actual finishes
- Identify high-error metrics (consistently mis-predicted players)

### Deliverables
1. `calculatePredictionAccuracy()` function
2. Validation sheet showing all predictions
3. Console output: "Model accuracy: X%, Top-10 accuracy: Y%"

---

## Phase 3: Weight Sensitivity Analysis

### Objective
Identify which metrics have biggest impact on prediction accuracy (leverage points)

### New Functions
- `calculateMetricSensitivity(tournament, baselineAccuracy)`
  - For each metric:
    - Increase weight by 10%
    - Recalculate weighted scores
    - Recalculate accuracy
    - Calculate impact: (new accuracy - baseline) / 10%
  - Output: Sensitivity score for each metric
  
- `generateSensitivityAnalysisSheet(masterSs, sensitivityData)`
  - Rank metrics by sensitivity (highest impact first)
  - Show: Metric, Current Weight, Sensitivity Score, Accuracy Impact
  - Answer: "Which metrics should I increase/decrease?"

### Data Flow
```
Baseline Accuracy (from Phase 2)
         ↓
For each metric:
  Increase weight +10% → Recalculate accuracy → Calculate impact
         ↓
Rank by sensitivity
         ↓
Identify leverage points
```

### Outputs
- **06_Metric_Sensitivity sheet** showing:
  - Metric, Current Weight, Sensitivity Score, Impact on Accuracy
  - Sorted by sensitivity (high impact first)
  - Color: Green (high impact), Yellow (medium), Red (low/negative)

- **Insight:** "Increasing [Metric] weight by 10% improves accuracy by X%"

### Success Criteria
- Identifies 3-5 high-leverage metrics
- Detects metrics that have negative impact (should decrease)
- Shows clear ranking of importance

---

## Phase 4: Iterative Optimization

### Objective
Adjust weights based on Phase 2-3 insights, retest accuracy, iterate to improvement

### Process
1. **Analyze Phase 3 results**
   - Which metrics to increase/decrease?
   - By how much?

2. **Update template weights** in `getTemplateWeightForMetric()`
   - Increase high-leverage metrics
   - Decrease low-impact metrics
   - Maintain proportions within groups

3. **Rerun analysis**
   - Full Phase 1 + 2 analysis with new weights
   - Recalculate accuracy

4. **Compare**
   - New accuracy vs baseline accuracy
   - Did adjustment help or hurt?

5. **Iterate**
   - If improved: lock in, try next adjustment
   - If regressed: revert, try different approach

### New Functions
- `compareWeightIterations(iteration1, iteration2)`
  - Side-by-side accuracy comparison
  - Show: Metric changes, accuracy delta, improvement rate
  
- `generateIterationHistorySheet(masterSs, allIterations)`
  - Track all iterations: weights, accuracy, changes made
  - Show progression toward best model

### Outputs
- **07_Weight_Iterations sheet** showing:
  - Iteration #, Accuracy, Top-10 Accuracy, Key Changes, Result (↑ Improved, ↓ Declined)
  - Track best iteration found

### Success Criteria
- Each iteration documented
- Clear accuracy improvement trajectory
- Converges toward stable, high-accuracy weights

---

## Phase 5: Course Type Optimization

### Objective
Test if type-specific weights (POWER/TECHNICAL/BALANCED) outperform generic weights

### Process
1. **Split tournaments by type**
   - POWER tournaments only
   - TECHNICAL tournaments only
   - BALANCED tournaments only

2. **For each type:**
   - Calculate current accuracy with generic weights
   - Calculate accuracy with type-specific templates
   - Compare

3. **Calculate type-specific sensitivity**
   - Which metrics matter most for each type?
   - Different leverage points per type?

4. **Optimize by type**
   - Increase high-leverage metrics for each type
   - Decrease low-impact metrics
   - Test improvements

### New Functions
- `calculateAccuracyByType(correlationData, weights, courseTypes)`
  - Separate accuracy metrics for each type
  - Return: Generic accuracy vs Type-specific accuracy

- `generateTypeComparisonSheet(masterSs, genericAccuracy, typeAccuracies)`
  - Compare: Generic model vs POWER-optimized vs TECHNICAL-optimized vs BALANCED-optimized
  - Show: Which type-specific model is best?

### Outputs
- **08_Type_Specific_Optimization sheet** showing:
  - Course Type, Generic Model Accuracy, Type-Specific Accuracy, Improvement, Key Metrics for Type
  - Answer: "Should I use different weights per type?"

### Success Criteria
- Type-specific weights improve accuracy over generic
- Different leverage points identified per type
- Clear recommendation: use generic or type-specific?

---

## Phase 6: Final Model & Documentation

### Objective
Lock in best weights, document findings, build explanation for model

### Process
1. **Select best configuration**
   - Generic or type-specific?
   - Which iteration performed best?

2. **Lock in weights**
   - Update METRIC_TEMPLATES with final values
   - Document rationale for each adjustment

3. **Document findings**
   - Which metrics drive tournament success?
   - How do winners differ by course type?
   - Model accuracy summary

4. **Create explanation sheet**
   - For tournament organizers/coaches
   - "To win at [type] courses, focus on [metrics]"

### New Functions
- `generateFinalModelDocumentation(bestWeights, allResults)`
  - Create comprehensive report
  - Include: weights, accuracy, key findings, methodology

### Outputs
- **Final model configuration** (locked weights)
- **09_Model_Documentation sheet** showing:
  - Final weights (per type if applicable)
  - Overall accuracy achieved
  - Key findings: "Winners excel at..."
  - Recommendations: "Optimize for..."
  - Methodology summary

- **Updated METRIC_TEMPLATES** in code

### Success Criteria
- Model achieves > 50% top-10 accuracy
- Clear explanation of what matters
- Reproducible, documented methodology

---

## Data Dependencies

```
Player Ranking Model (source metric data)
         ↓
Tournament Results (actual finishes)
         ↓
Configuration Sheet (config weights)
         ↓
allMetrics (metric list)
         ↓
METRIC_TEMPLATES (template weights)
         ↓
[All Phases 1-6 analysis]
```

---

## Implementation Roadmap

### Immediate (Week 1)
- ✅ Phase 1: Current analysis working
- 🎯 Phase 2: Build prediction accuracy testing

### Short-term (Week 2-3)
- Phase 3: Sensitivity analysis
- Phase 4: First iteration (adjust high-leverage metrics)

### Medium-term (Week 3-4)
- Phase 5: Type-specific optimization
- Multiple iterations based on results

### Final (Week 4-5)
- Phase 6: Lock in final model
- Documentation & delivery

---

## Success Metrics by Phase

| Phase | Key Metric | Success Threshold | Status |
|-------|-----------|------------------|--------|
| 1 | Metrics loaded without errors | No orphaned metrics | ✅ |
| 2 | Model accuracy on tournament finishes | > 40% baseline | 🎯 Next |
| 3 | Top-10 prediction accuracy | > 50% | Depends on Phase 2 |
| 4 | Accuracy improvement per iteration | +5-15% per good adjustment | Depends on Phase 3 |
| 5 | Type-specific improvement | > 5% over generic | Depends on Phase 4 |
| 6 | Final top-10 accuracy | > 50-60% | Depends on Phase 5 |

---

## Notes & Considerations

### Challenges
- Scoring weights (row 23-24) not currently analyzed
  - Solution: Phase 2 weight validation function (separate note)
- Small tournament sample sizes might skew sensitivity analysis
  - Solution: Aggregate sensitivity across multiple tournaments
- Overfitting risk (weights optimized to past, not future tournaments)
  - Solution: Cross-validation (test on holdout tournament)

### Recent Validation Updates (Node parity)

- Metric analysis rounding/correlation now matches GAS (Spearman + ranking behavior).
- Metric analysis sources now prefer post‑tournament results/historical data (rankings fallback).
- Model delta trends aggregate across season tournaments.
- Processing log now captures inputs, sources, and overwritten outputs.

### Future Enhancements

- Machine learning approach (gradient descent for weights)
- Ensemble models (combine multiple approaches)
- Player-specific adjustments (account for skill level variance)
- Real-time model updates (add new tournaments, re-optimize)

---

**Status:** Framework documented, ready for Phase 2 implementation
**Last Updated:** February 23, 2026
