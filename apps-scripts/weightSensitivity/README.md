# Weight Sensitivity Analysis - Streamlined Workflow

## Overview

This folder provides a data-driven workflow to optimize golf tournament predictions:

1. **Analyze correlations** between metrics and tournament results
2. **Identify inverted metrics** (negative correlations that need special handling)
3. **Test weight configurations** to find the best predictive model
4. **Iterate and refine** weights for maximum accuracy

## Files

### Core Utilities (Supporting Infrastructure)
- `csvLoader.js` - Load and parse CSV data files
- `dataPrep.js` - Prepare player data from tournament context
- `modelCore.js` - Core ranking/prediction engine
- `configParser.js` - Parse configuration sheets
- `metricConfigBuilder.js` - Build metric group structures

### Main Analysis Scripts (Run in order)

#### 1. **tournamentAnalyzer.js** - Correlation Analysis
Identifies which metrics predict finish positions and which need metric inversion.

```bash
node tournamentAnalyzer.js
```

**Output:** `output/correlation_analysis.json`
- All 34 metrics with correlation coefficients
- Identifies inverted metrics (negative correlation)
- Group-level analysis
- Summary statistics

**Key findings:**
- Positive correlations: Direct relationship (higher metric = better finish)
- Negative correlations (⚠️ marked for inversion): Inverted relationship

---

#### 2. **weightIterator.js** - Grid Search with Metric Inversion
Tests weight variations and applies metric inversion to negative correlation metrics.

```bash
node weightIterator.js
```

**Requires:** `correlation_analysis.json` (from step 1)

**Output:** `output/weight_iteration_results.json`
- Baseline performance with metric inversion applied
- Identifies which metrics are inverted
- Foundation for configuration testing

**What it does:**
- Loads inverted metrics from correlation analysis
- For each inverted metric: negates values before ranking
- Runs model and evaluates accuracy

---

#### 3. **configurationTester.js** - Compare All Configurations
Tests all available weight templates and finds the best performer.

```bash
node configurationTester.js
```

**Requires:** 
- `correlation_analysis.json` (for inverted metrics)
- Template data

**Output:** `output/configuration_test_results.json`
- All configurations ranked by correlation
- Accuracy metrics (RMSE, Top-10, Top-20)
- Winner recommendation

---

## Data Requirements

### Input Files (in weightSensitivity folder)
- `Sony Open (2026) - Tournament Field.csv` - Players in field
- `Sony Open (2026) - Historical Data.csv` - Round-by-round performance
- `Sony Open (2026) - Approach Skill.csv` - Distance-specific approach stats
- `Sony Open (2026) - Tournament Results.csv` - Actual finish positions
- `Sony Open (2026) - Configuration Sheet.csv` - Model configuration
- `Sony Open (2026) - Historical Data (1).csv` - Multi-year historical data (optional)

### Generated Files (in output/)
- `correlation_analysis.json` - Metric correlations with finish positions
- `weight_iteration_results.json` - Iteration results with inversion applied
- `configuration_test_results.json` - Configuration rankings and winner

---

## Metric Inversion Explained

### Problem
Some metrics have **negative correlations** with finish position:
- High SG Putting: -0.207 correlation
- Higher metric value → Worse finish (counterintuitive)

### Solution: Metric Inversion
When a metric has negative correlation:
1. **Identify it** during correlation analysis
2. **Invert the values** before ranking: `newValue = -oldValue`
3. **Apply positive weight** to inverted metric
4. Result: Negative correlation becomes positive contribution

### Example
- Original: `SG Putting = 2.5` → Finish 50th (worse)
- Inverted: `SG Putting_inverted = -2.5` → Higher score contribution → Better ranking

---

## Quick Start Example

```bash
# Step 1: Analyze correlations (identifies inverted metrics)
node tournamentAnalyzer.js

# Step 2: Test baseline with metric inversion
node weightIterator.js

# Step 3: Compare all weight configurations
node configurationTester.js

# Step 4: Review results
cat output/configuration_test_results.json | grep -A 5 "winner"
```

---

## Output Interpretation

### correlation_analysis.json
```json
{
  "correlations": [
    {
      "group": "Putting",
      "metric": "SG Putting",
      "correlation": -0.207,
      "isInverted": true  // ⚠️ Will be inverted
    }
  ],
  "invertedMetrics": ["Putting::SG Putting", ...]
}
```

### configuration_test_results.json
```json
{
  "results": [
    {
      "name": "SONY_OPEN_OPTIMIZED_v2",
      "correlation": 0.1066,
      "rmse": 47.37,
      "top10Accuracy": 20.0,
      "top20Accuracy": 35.0
    }
  ],
  "winner": {
    "name": "SONY_OPEN_OPTIMIZED_v2",
    "correlation": 0.1066
  }
}
```

---

## Next Steps: Grid Search (Future Enhancement)

For automated weight optimization, add:

```javascript
// weightIterator.js enhancements
for (let putting of [0.20, 0.25, 0.30]) {
  for (let approach of [0.10, 0.15, 0.20]) {
    weights = { Putting: putting, Approach: approach, ... };
    results = testConfiguration(weights);
    track best result
  }
}
```

---

## Key Metrics

| Metric | Purpose | Range |
|--------|---------|-------|
| **Correlation** | How well predictions match actual results | -1 to 1 (higher is better) |
| **RMSE** | Average prediction error in rank positions | Lower is better |
| **Top-10 Accuracy** | % of top 10 correctly predicted | 0-100% |
| **Top-20 Accuracy** | % of top 20 correctly predicted | 0-100% |

---

## Tips for Best Results

1. **Run tournamentAnalyzer first** - Must identify inverted metrics
2. **Check the inverted metrics list** - Understand what's being inverted
3. **Compare multiple configurations** - Don't just use first result
4. **Look at Top-20 Accuracy** - Usually more stable than Top-10
5. **Review RMSE** - Lower RMSE means consistent predictions

---

## Troubleshooting

**Missing correlation_analysis.json?**
→ Run `tournamentAnalyzer.js` first

**No inverted metrics found?**
→ All correlations are positive for this tournament (good sign!)

**Low accuracy across all configs?**
→ Tournament may have high variance or weak metric predictability

---

## Architecture

```
tournamentAnalyzer.js
    ↓
    ├→ Load data (field, history, approach, results)
    ├→ Compute correlations
    └→ Identify inverted metrics
        ↓
        correlation_analysis.json

weightIterator.js
    ↓
    ├→ Load correlation analysis
    ├→ Apply metric inversion
    └→ Test baseline with inversion
        ↓
        weight_iteration_results.json

configurationTester.js
    ↓
    ├→ Load inverted metrics
    ├→ Test each configuration
    │   (apply inversion to negatives)
    └→ Rank by accuracy
        ↓
        configuration_test_results.json
        
[Optional] Grid Search / Optimization
    ↓
    Systematic iteration through weight space
```

---

*Last updated: Feb 5, 2026*
