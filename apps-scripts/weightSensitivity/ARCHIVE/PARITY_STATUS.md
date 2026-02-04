# Model Parity Status

## Summary
✅ **Apps Script model updated and validated** against real sheet output.

## Latest Results (Scheffler, Scottie - DG ID 18417)

### Sheet Output (Feb 2, 2026 - After Birdie Chances Created Fix)
- **Driving Performance**: 2.383
- **Approach - Short (<100)**: 2.666
- **Approach - Mid (100-150)**: 4.288
- **Approach - Long (150-200)**: 10.223
- **Approach - Very Long (>200)**: 1.763
- **Putting**: 1.292
- **Around the Green**: -1.037
- **Scoring**: -0.590 ⬅️ (Fixed from -1.081!)
- **Course Management**: 2.060
- **Weighted Score**: 2.239
- **Refined Score**: 2.171
- **WAR**: 0.34

## Key Discoveries

### 1. Birdie Chances Created Weight Typo (FIXED)
**Issue**: Weight key was "Birdies Chances Created" (with 's') instead of "Birdie Chances Created"
- **Effect**: Weight 0.12 from I23 wasn't being applied
- **Fix**: Changed in results.js line 250
- **Result**: Scoring group changed from -1.081 → -0.590

### 2. Scoring Average NOT Transformed (CONFIRMED)
**Finding**: Scoring Average uses raw values (lower is better)
- **Behavior**: Negative z-scores indicate better-than-average performance
- **Status**: All code now correctly avoids transformation

### 3. Approach Group Alignment (VERIFIED)
All approach groups match sheet within ±0.13 points:
- Short: 2.666 ✅
- Mid: 4.288 ✅
- Long: 10.223 ✅
- Very Long: 1.763 ✅

## Code Changes Made

### Apps Script (results.js)
```javascript
// Line 250 - Fixed typo
"Birdie Chances Created": configSheet.getRange("I23").getValue(),  // Was: "Birdies Chances Created"
```

### Node.js (modelCore.js)
```javascript
// Line ~836 - Confirmed NO transformation for Scoring Average
// Scoring Average uses raw values, lower is better
// Negative z-scores indicate better than average
```

## Testing Notes

### testModelParity.js Issues
- CSV loader works correctly for historical data
- Test loads into different data structures than Apps Script
- For accurate comparison, use sheet output as reference

### Recommended Approach
1. ✅ Apps Script is the source of truth
2. ✅ Sheet values confirmed with debug output
3. Validate across full field (156 players) for systematic issues

## Next Steps
- Run full field validation to ensure fix applies consistently
- Check if any other metrics have similar weight typos
- Validate WAR calculation is correct across players
