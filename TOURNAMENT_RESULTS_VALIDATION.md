# Tournament Results Validation Integration

## What Was Changed

### File: `tournamentResults.js`

#### 1. Added Validation Call (Line ~257)
After tournament results are successfully written to the sheet, the new code automatically calls the validation function:

```javascript
// NEW: Validate predictions against actual results
try {
  validateTournamentPredictions(resultsSheet, playerRows);
} catch (validationError) {
  console.error("Validation error (non-blocking):", validationError);
  // Don't throw - validation should not break results display
}
```

**Why try/catch?** - Validation errors won't crash the results display. If validation fails, results still show.

#### 2. Added New Function: `validateTournamentPredictions()` (Line ~1298)

This function:
- Extracts model predictions from "Player Ranking Model" sheet
- Extracts actual results from the API response
- Calls `validatePredictions()` from `algorithmValidation.js`
- Stores results to Configuration Sheet
- Updates Tournament Results sheet with validation metrics

### What Gets Displayed

When tournament results are fetched, the Tournament Results sheet now shows:

**Column F (rows 5-10):**
```
PREDICTION VALIDATION
Correlation: 0.654
RMSE: 12.45
Top-10 Accuracy: 62.5%
[Human-readable summary of algorithm performance]
```

---

## How It Works

### Workflow

1. **Run:** Menu → Model Tools → Update Tournaments and Dropdowns (or manual trigger)
2. **Fetch:** `fetchTournamentFinalResults()` downloads actual tournament results from DataGolf API
3. **Display:** Results written to "Tournament Results" sheet
4. **Validate:** `validateTournamentPredictions()` automatically runs:
   - Gets predictions from "Player Ranking Model" sheet
   - Compares vs actual results from API
   - Calculates correlation, RMSE, accuracy
5. **Store:** Results saved to Configuration Sheet (rows 48-55) and displayed in-sheet (column F)

---

## Validation Metrics Displayed

| Metric | Meaning | What's Good |
|--------|---------|------------|
| **Correlation** | How well predictions matched actuals (-1 to 1) | > 0.7 is strong |
| **RMSE** | Average prediction error (in positions) | < 10 is excellent |
| **Top-10 Accuracy** | % of top-10 predictions that finished top-10 | > 60% is strong |

---

## Error Handling

The validation is designed to be **non-blocking**:

- ✅ If validation succeeds → metrics displayed on sheet
- ⚠️ If validation fails → error logged to console, tournament results still display
- ⚠️ If sheets missing → validation skipped gracefully
- ⚠️ If no event ID set → validation skipped gracefully

This ensures tournament results display correctly regardless of validation status.

---

## Key Features

### Automatic
- Runs immediately after tournament results fetched
- No user action needed
- No menu items to click

### Non-Intrusive
- Doesn't modify tournament results data
- Displays in separate column (F)
- Doesn't break if something fails

### Integrated
- Uses `algorithmValidation.js` functions
- Stores to Configuration Sheet (same place as manual validation)
- Logs to console for debugging

---

## Next Integration Steps

### Option 1: Log Validation History
Modify `validateTournamentPredictions()` to auto-append to "Validation Results" sheet:

```javascript
// Add after storeValidationResults(metrics);
const validationSheet = ss.getSheetByName("Validation Results") || 
  ss.insertSheet("Validation Results");
validationSheet.appendRow([
  new Date().toISOString(),
  currentEventId,
  metrics.correlation,
  metrics.rmse,
  metrics.topTenAccuracy
]);
```

### Option 2: Email Validation Report
Send validation results via email after each tournament:

```javascript
function sendValidationEmail(metrics) {
  GmailApp.sendEmail(
    "your@email.com",
    `Tournament ${metrics.eventId} - Validation Results`,
    `Correlation: ${metrics.correlation}\nRMSE: ${metrics.rmse}\nTop-10: ${metrics.topTenAccuracy}%`
  );
}
```

### Option 3: Alert on Low Performance
Warn if correlation drops below threshold:

```javascript
if (metrics.correlation < 0.5) {
  resultsSheet.getRange("F9").setValue("⚠️ LOW CONFIDENCE - Check algorithm weights")
    .setBackground("#FFCCCC");
}
```

---

## Testing

To test the validation integration:

1. **Make sure "Player Ranking Model" sheet has predictions**
   - If empty, run rankings first

2. **Fetch tournament results:**
   - Menu → Model Tools → (appropriate update function)

3. **Check for validation metrics:**
   - Column F of Tournament Results sheet
   - Configuration Sheet rows 48-55

4. **Check console for logs:**
   - Extensions → Apps Script → Executions
   - Look for validation confirmation message

---

## Files Modified

- `tournamentResults.js` - Added validation call and wrapper function

## Files Used (Not Modified)

- `algorithmValidation.js` - Provides validation functions
- `Configuration Sheet` - Stores results

## Files Not Yet Integrated

These could optionally be updated in future:
- `results.js` - Could validate after generating rankings
- `fetchAndWriteData.js` - Could validate after fetching historical data
- `updateSheets.js` - Could coordinate multi-function validation
