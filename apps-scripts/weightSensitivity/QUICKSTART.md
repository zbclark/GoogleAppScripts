# Quick Start Guide - Weight Sensitivity Analysis

## 3-Step Workflow

### Step 1: Analyze Correlations
```bash
node tournamentAnalyzer.js
```
**Output:** `output/correlation_analysis.json`
- Identifies which metrics predict finish positions
- Flags metrics with negative correlations (inverted)
- Provides correlation strength for each metric

### Step 2: Test with Metric Inversion
```bash
node weightIterator.js
```
**Output:** `output/weight_iteration_results.json`
- Tests baseline configuration with metric inversion applied
- Negates inverted metrics before ranking
- Shows improvement from inversion

### Step 3: Compare Configurations
```bash
node configurationTester.js
```
**Output:** `output/configuration_test_results.json`
- Tests all available weight templates
- Ranks configurations by accuracy
- Recommends best performer

---

## Understanding Results

### Correlation Analysis
**High positive = Good predictor**
- SG Putting: 0.207 (but negative, so will be inverted)
- Scoring Average: 0.128

**Negative = Inverted metric**
- Higher metric value = Worse finish
- System automatically inverts these

### Configuration Results
| Config | Correlation | Top-20 | RMSE |
|--------|-------------|--------|------|
| SONY_OPEN_OPTIMIZED_v2 | 0.1066 | 35.0% | 47.37 |
| Baseline | 0.0186 | 30.0% | 48.54 |

**Baseline vs Optimized:**
- 5.7x better correlation
- 5% better Top-20 accuracy
- Better RMSE

---

## What Metric Inversion Does

### Without Inversion
```
SG Putting = 2.5 (high)
→ Weight applied as-is
→ Negative correlation pulls down ranking
→ Good putters predicted poorly ❌
```

### With Inversion
```
SG Putting = 2.5 (high)
→ Inverted: -2.5
→ Positive weight applied
→ Good putters predicted well ✓
→ Negative correlation becomes positive contributor ✓
```

---

## Interpreting Metrics

| Metric | Meaning | Direction |
|--------|---------|-----------|
| **Correlation** | How well predictions match actual | Higher = Better |
| **RMSE** | Average rank position error | Lower = Better |
| **Top-10 Accuracy** | % of top 10 correctly predicted | Higher = Better |
| **Top-20 Accuracy** | % of top 20 correctly predicted | Higher = Better |

---

## For Different Tournaments

Just change the data files:
```bash
# Replace these with your tournament data
Sony Open (2026) - Tournament Field.csv
Sony Open (2026) - Historical Data.csv
Sony Open (2026) - Approach Skill.csv
Sony Open (2026) - Tournament Results.csv
Sony Open (2026) - Configuration Sheet.csv
```

Then run:
```bash
node tournamentAnalyzer.js      # Find correlations
node weightIterator.js           # Apply inversion
node configurationTester.js      # Find best config
```

---

## Next: Grid Search Optimization

For automated weight tuning (coming soon):
```bash
node gridSearchOptimizer.js --iterations 100 --step 0.05
```

Will test 100+ weight combinations and find optimal configuration.

---

## Tips

1. **Always run tournamentAnalyzer first** - Must identify inverted metrics
2. **Check the inverted list** - Understand what's being adjusted
3. **Compare multiple runs** - Different tournaments may have different patterns
4. **Look at Top-20** - Usually more stable than Top-10
5. **Save winning weights** - Use in templateLoader.js for production

---

*Updated: Feb 5, 2026*
