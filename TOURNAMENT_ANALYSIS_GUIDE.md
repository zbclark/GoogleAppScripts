# 2025 Tournament Analysis Guide

## What Was Added

Created `tournamentAnalysis.js` with tools to:
1. **Find all tournament workbooks** in `Y:\My Drive\Golf 2025`
2. **Load predictions** from each tournament's "Player Ranking Model" sheet
3. **Load actual results** from each tournament's "Tournament Results" sheet
4. **Load configuration** from each tournament's "Configuration Sheet"
5. **Validate each tournament individually** using its exact weights and configuration
6. **Compare performance across all 8 tournaments**

## How to Use

### Option 1: View Report in Dialog (Quickest)
1. Menu → **‼️ Model Tools**
2. Click **Validate All 2025 Tournaments**
3. Opens a formatted report showing:
   - Overall performance metrics
   - Best/worst performing tournaments
   - Tournament-by-tournament breakdown

### Option 2: Write Results to Sheet
1. Menu → **‼️ Model Tools**
2. Click **Write Validation Results to Sheet**
3. Creates new "Tournament Validation" sheet with:
   - Aggregate metrics
   - Table of all 8 tournaments with validation scores

## What You'll See

### Aggregate Metrics
```
Average Correlation: 0.65 (Moderate)
Average RMSE: 12.34 positions
Average Top-10 Accuracy: 58.5%
Average Top-20 Accuracy: 72.1%
```

### Per-Tournament Details
| Tournament | Correlation | RMSE | Top-10% | Matched Players |
|-----------|------------|------|---------|-----------------|
| RBC Heritage | 0.682 | 10.2 | 65.0% | 142 |
| The Masters | 0.598 | 14.1 | 52.5% | 96 |
| ... | ... | ... | ... | ... |

### Configuration Comparison
For each tournament, you'll see what:
- Event ID and course name
- Which metrics had the highest weight
- Which similar courses were used
- If past performance was enabled

---

## Key Insights You Can Get

1. **Algorithm Performance Varies by Tournament**
   - Which tournaments does it predict well?
   - Which tournaments struggle?

2. **Configuration Impact**
   - Did higher weights on certain metrics help or hurt?
   - Did similar course selection matter?

3. **Metric Effectiveness**
   - Do approach metrics work better on approach-heavy courses?
   - Does SG Total matter more than individual metrics?

4. **Past Performance Impact**
   - Which tournaments used past performance weighting?
   - Did it help or hurt predictions?

---

## How It Works

### For Each of 8 Tournaments:

1. **Loads from Google Drive**
   - Opens the tournament workbook (e.g., "RBC Heritage 2025")
   - Reads Configuration Sheet (for that tournament's specific weights)
   - Reads Player Ranking Model (predictions as they were made)
   - Reads Tournament Results (actual results after tournament)

2. **Validates Tournament**
   - Matches players between predictions and actuals
   - Calculates correlation, RMSE, MAE, top-10 accuracy
   - Records which metrics were weighted heavily

3. **Compares Across All 8**
   - Ranks tournaments by prediction accuracy
   - Identifies best and worst performers
   - Shows aggregate statistics

---

## Example Output

When you click "Validate All 2025 Tournaments":

```
2025 GOLF TOURNAMENT ALGORITHM VALIDATION REPORT
===============================================================

OVERALL SUMMARY
Total Tournaments Analyzed: 8
Successful Validations: 8
Failed Validations: 0

AGGREGATE METRICS
Average Correlation: 0.654
Average RMSE: 11.89 positions
Average Top-10 Accuracy: 59.4%
Average Top-20 Accuracy: 71.8%

BEST PERFORMING TOURNAMENT
Tournament: RBC Heritage 2025
Correlation: 0.721 ✅
RMSE: 9.45
Top-10 Accuracy: 67.5%

WORST PERFORMING TOURNAMENT
Tournament: Players Championship 2025
Correlation: 0.542 ⚠️
RMSE: 15.23
Top-10 Accuracy: 48.0%

TOURNAMENT-BY-TOURNAMENT BREAKDOWN
Tournament Name                  | Corr | RMSE | Top-10% | Sample
RBC Heritage 2025                | 0.721 | 9.45 | 67.5 | 142
The Masters 2025                 | 0.698 | 10.12 | 65.0 | 96
...
```

---

## What This Reveals

### Strong Predictions (Correlation > 0.70)
- Algorithm works well for these tournaments
- Configuration for these worked effectively
- Good metric selection

### Moderate Predictions (Correlation 0.50-0.70)
- Algorithm okay, but room for improvement
- Consider adjusting weights or metrics
- Maybe need different similar courses

### Weak Predictions (Correlation < 0.50)
- Algorithm struggled for this tournament
- Configuration needs adjustment
- Possible issues:
  - Wrong metric weights
  - Poor similar course selection
  - Course-specific factors not captured

---

## Next Steps for Improvement

After running the analysis, look for patterns:

1. **Did certain metric weights work better?**
   - Compare configurations of top-performing vs bottom tournaments
   - Adjust weights for future tournaments

2. **Did similar course selection help?**
   - Did using more/fewer similar courses improve predictions?
   - Were specific courses better predictors?

3. **Did past performance help?**
   - Tournaments with past performance weighted heavily - did they perform better or worse?

4. **Course-specific patterns**
   - Do approach-heavy courses need different weighting?
   - Do putting-heavy courses need putting metric adjustments?

---

## Troubleshooting

**"Golf 2025 folder not found"**
- Make sure folder is named exactly "Golf 2025" (case-sensitive)
- Make sure it's in Google Drive (not local file)
- Check permissions on the folder

**"Player Ranking Model sheet not found"**
- Check tournament workbook has a sheet named exactly "Player Ranking Model"
- (Note: Must be exact name)

**"No matching players"**
- Predictions and results have different dgId formats
- Check that both sheets use the same player ID system

**Low correlation across all tournaments**
- Algorithm may need fundamental adjustment
- Check metric weighting scheme
- Consider different approach to similarity scoring

---

## Files Modified/Added

**New File:**
- `tournamentAnalysis.js` - Complete analysis module

**Modified File:**
- `onOpen.js` - Added two new menu items

**No existing functionality changed** - this is purely additive
