# Algorithm Validation Module - Setup Guide

## Files Added/Modified

### New File
- **`apps-scripts/Golf_Algorithm/algorithmValidation.js`** - Complete validation framework

### Modified Files
- **`apps-scripts/Golf_Algorithm/onOpen.js`** - Added menu items and wrapper functions

## What Was Added

### 1. Validation Module (`algorithmValidation.js`)

Four main sections:

#### Section 1: Prediction Validation
- `validatePredictions(eventId, predictions)` - Tests predictions vs actual results
- `calculatePearsonCorrelation()` - Correlation coefficient
- `calculateRMSE()` - Root mean square error
- `calculateMAE()` - Mean absolute error
- `storeValidationResults()` - Saves results to Configuration Sheet

**Output Metrics:**
- Correlation (-1 to 1)
- RMSE (lower is better)
- MAE (Mean Absolute Error)
- Top-10 Accuracy %
- Top-20 Accuracy %

#### Section 2: Data Quality Validation
- `validatePlayerDataQuality(playerData)` - Checks player data sufficiency
- `applyConfidenceAdjustment()` - Weights predictions by data quality

**Checks:**
- Recent tournament participation
- Data completeness
- Metric coverage
- Course-specific data availability
- Performance consistency

#### Section 3: A/B Testing
- `compareAlgorithmVersions()` - Compare two algorithm versions
- `storeABTestResults()` - Saves comparison to "Validation Results" sheet

#### Section 4: Utilities
- Helper functions for dates, averages, variance, etc.

---

## How to Use

### From the Menu

The following items have been added to **‼️ Model Tools** menu:

1. **Validate Last Tournament**
   - Reads current event ID from Configuration Sheet (G9)
   - Gets predictions from "Player Ranking Model" sheet
   - Runs validation against actual results in "Historical Data"
   - Displays results with correlation, RMSE, accuracy scores
   - Stores results to Configuration Sheet rows 48-55

2. **Check Player Data Quality**
   - Gets current tournament field from "Tournament Field" sheet
   - Placeholder for full data quality analysis

### Programmatically

```javascript
// In results.js, after generating rankings:
function generatePlayerRankings() {
  // ... existing code ...
  
  const rankedPlayers = calculatePlayerMetrics(...);
  
  // NEW: Validate if this is past tournament
  const currentEventId = configSheet.getRange("G9").getValue();
  if (isPastTournament(currentEventId)) {
    const metrics = validatePredictions(currentEventId, rankedPlayers.players);
    storeValidationResults(metrics);
  }
}
```

### A/B Testing Example

```javascript
// Compare current algorithm vs simplified version
const comparison = compareAlgorithmVersions(
  "58052",  // Event ID
  "Full Algorithm",
  generatePlayerRankings,
  "Scoring Average Only",
  generateScoringAverageRankings
);

storeABTestResults(comparison);
console.log(`Winner: ${comparison.winner} by ${comparison.correlationDifference}`);
```

---

## Understanding Validation Results

### Correlation (Primary Metric)
| Range | Interpretation |
|-------|-----------------|
| > 0.7 | ✅ Strong - Algorithm is predictive |
| 0.5-0.7 | ⚠️ Moderate - Room for improvement |
| 0.3-0.5 | ⚠️ Weak - Limited predictive power |
| < 0.3 | ❌ Very weak - Major revision needed |

### RMSE (Root Mean Square Error)
| Range | Interpretation |
|-------|-----------------|
| < 10 | ✅ Low - Predictions close to actuals |
| 10-20 | ⚠️ Moderate - ~15 position average error |
| > 20 | ❌ High - Predictions significantly off |

### Top-10 Accuracy
Percentage of top-10 predictions that actually finished in top 10.
- > 60% = Excellent
- 40-60% = Good
- < 40% = Needs work

---

## Configuration Sheet Updates

When you run validation, results appear in **Configuration Sheet**:

```
Row 48: LAST VALIDATION RESULTS (header)
Row 49: Column headers
Row 50: Latest validation results
  - A50: Event ID
  - B50: Sample Size
  - C50: Correlation
  - D50: RMSE
  - E50: MAE
  - F50: Top-10 Accuracy %
  - G50: Timestamp

Row 52: SUMMARY (header)
Row 53: Human-readable summary with interpretation
```

---

## Next Steps for Integration

### Phase 1: Start Collecting Data (This Week)
1. After each tournament, run **Validate Last Tournament**
2. Keep historical validation results in "Validation Results" sheet
3. Watch for correlation trends over time

### Phase 2: Data Quality Checks (Next Week)
Integrate `validatePlayerDataQuality()` into the ranking generation:

```javascript
// In calculatePlayerMetrics(), after calculating scores:
const qualityCheck = validatePlayerDataQuality(player);
if (qualityCheck.confidence < 0.5) {
  applyConfidenceAdjustment(finalScore, qualityCheck.confidence);
}
```

### Phase 3: A/B Testing (Week 3)
Create alternate algorithms and compare:
- Current weighted model vs simpler models
- Different weighting schemes
- Different time windows

### Phase 4: Weight Optimization (Week 4)
Based on validation results, adjust metric weights in Configuration Sheet to maximize correlation.

---

## Troubleshooting

### "No actual results found for event X"
- Event hasn't happened yet, or data not uploaded to Historical Data sheet
- Validation only works for past tournaments

### "No matching players between predictions and actuals"
- Player IDs (dgId) don't match between sheets
- Check that Tournament Field sheet uses same ID format as Historical Data

### Low correlation despite seemingly good predictions
- Algorithm may be overfitting to recent events
- Sample size may be too small (need 10+ matches)
- Course-specific factors not being captured

---

## File Organization

```
Golf_Algorithm/
├── algorithmValidation.js        [NEW]
├── onOpen.js                     [MODIFIED - Added menu items]
├── results.js                    [Can integrate validation calls]
├── fetchAndWriteData.js          [Can integrate validation after fetch]
├── tournamentResults.js          [Can use for actual results]
└── ...
```

---

## Questions?

See inline comments in `algorithmValidation.js` for detailed function documentation.
Each section is clearly marked with comments explaining purpose and parameters.
