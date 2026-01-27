/**
 * Phase 3: Weight Sensitivity Analysis
 * Identifies which metrics have biggest impact on prediction accuracy
 * 
 * Functions:
 * - calculateMetricSensitivity() - Test sensitivity of each metric weight
 * - generateSensitivityAnalysisSheet() - Create output showing metric impact
 * 
 * Supporting functions:
 * - analyzeWeightEffectiveness() - Analyze current weight effectiveness
 */

/*
# Phase 3: Weight Sensitivity Analysis

**Purpose:**
Analyze how sensitive the model’s prediction accuracy is to changes in metric weights. This phase helps identify which weights have the largest impact, optimal ranges for each, and guides further optimization.

**Entry Point:**
`performWeightSensitivityAnalysis()`

**Key Functions to Implement:**
- `calculateMetricSensitivity()`: Systematically vary each metric’s weight, measure the effect on accuracy metrics (e.g., RMSE, correlation, top-10 accuracy).
- `generateSensitivityAnalysisSheet()`: Output results to a Google Sheet for visualization and review.
- `analyzeWeightEffectiveness()`: Summarize which weights are most/least impactful, suggest candidates for optimization.

**Workflow:**
1. **Setup:**
   - Load current weights and baseline accuracy metrics.
   - Define the range and step size for weight variation.
2. **Sensitivity Testing:**
   - For each metric:
     - Vary its weight across the defined range, holding others constant.
     - Recalculate predictions and accuracy metrics for each variation.
     - Record the change in accuracy.
3. **Analysis:**
   - Aggregate results to identify:
     - Metrics with the highest sensitivity (largest change in accuracy).
     - Metrics with low/no impact.
     - Optimal weight ranges (where accuracy is maximized).
4. **Reporting:**
   - Write results to a dedicated sheet.
   - Generate summary tables and charts (if desired).
   - Document findings and recommendations.

**Outputs:**
- Sensitivity analysis sheet with:
  - Metric name
  - Weight values tested
  - Corresponding accuracy metrics (RMSE, correlation, top-10 accuracy, etc.)
  - Sensitivity score (e.g., % change in accuracy per unit weight change)
- Summary of most/least sensitive metrics
- Recommendations for next optimization steps

**Supporting Considerations:**
- Use the same data loading and accuracy calculation utilities as previous phases.
- Ensure reproducibility: log all parameters and random seeds (if any).
- Optionally, visualize results (e.g., line charts of accuracy vs. weight).
*/

// Phase 3 functions to be implemented
