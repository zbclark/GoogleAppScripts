# Weight Validation Approach (Option 3)

## Problem Statement
Scoring configuration weights (rows 23-24 in Configuration Sheet) and Course Management weights are currently loaded but not used in the analysis. Distance-based metrics (rows 16-20) are analyzed, but we have no way to validate whether the alternative weight schemes would be better predictors of tournament success.

## Recommended Approach: Weight Validation Function

### Overview
Create a diagnostic function that validates whether config weights (especially scoring and management weights) actually correlate with tournament outcomes.

### Implementation Details

#### Function: `validateConfigWeights()`
**Purpose:** Test if the scoring/management config weights predict tournament finish positions

**Input:**
- Tournament workbook reference
- Config weights from Configuration Sheet (rows 23-24)
- Player data from Player Ranking Model
- Tournament results (finish positions)

**Process:**
1. For each player in the tournament:
   - Calculate composite weighted score using config weights
   - Example: `scoringScore = (Approach <100 SG × weight) + (Approach <150 FW SG × weight) + ...`

2. Calculate Pearson correlation between:
   - Weighted score vs. actual finish position
   - Similar to existing `calculatePearsonCorrelation()` function

3. Return correlation strength

**Output:**
- Correlation coefficient for scoring weights
- Correlation coefficient for course management weights
- Comparison to distance-based metric correlations
- Clear indication: "Good predictor" (corr > 0.3), "Moderate" (0.2-0.3), "Weak" (< 0.2)

#### Integration Point
Add as optional analysis step in `analyzeMetricCorrelations()`:
```javascript
// After main analysis
if (enableWeightValidation) {
  validateConfigWeights(tournamentWorkbook, configWeights, playerData);
}
```

### Expected Outcomes
This would tell us:
- ✅ Are scoring weights predictive of tournament success?
- ✅ Are management weights predictive of tournament success?
- ✅ How do they compare to distance-based approach correlations?
- ✅ Should we actually use them in the model?

### Data Requirements
- Player Ranking Model with all metrics
- Configuration Sheet with scoring/management weights (rows 23-24)
- Tournament Results sheet with finish positions

### Next Steps
1. Define exact metrics to include in scoring weight calculation
2. Define exact metrics to include in management weight calculation
3. Implement `validateConfigWeights()` function
4. Add UI toggle to enable/disable validation
5. Create output sheet showing validation results across all tournaments

---
**Status:** Planning - Not yet implemented
**Priority:** Medium (nice-to-have for understanding weight quality)
**Assigned to:** TBD
