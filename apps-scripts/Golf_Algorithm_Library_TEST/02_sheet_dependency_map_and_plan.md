# 02_ Sheet Dependency Map & Extraction Plan (TEST Library)

## Dependency Map (TEST Library)

- **validateTournamentSheet(fileId, sheetName)**
  - Loads predictions/results, matches players, computes metrics (RMSE, correlation, top-10 accuracy, etc.)
- **writeDetailedValidationSheet02(fileId, sheetName, result)**
  - Writes the detailed "02_" validation sheet using the result object from validation
- **calculatePearsonCorrelation, calculateRMSE, calculateMAE**
  - Used for metric calculations
- **writeDetailedValidationSheet02Wrapper()** (BoundScriptWrapper.js)
  - Calls the above functions in sequence for the active sheet

## 02_ Sheet Generation: Dependencies & Helper Functions (TEST Library)

### Core Functions
- `writeDetailedValidationSheet02(fileId, sheetName, result)`
- `validateTournamentSheet(fileId, sheetName)`

### Data Loading Helpers
- `loadTournamentPredictions(fileId, sheetName)` (from `dataLoading.js`)
- `loadTournamentResults(fileId, sheetName)` (from `dataLoading.js`)

### Metric Calculation Helpers
- `calculatePearsonCorrelation(positions, values)`
- `calculateRMSE(predicted, actual)`
- `calculateMAE(predicted, actual)`

### Output/Reporting Helpers
- `writeValidationResultToNewSheet(fileId, sheetName, result)`
- `generateValidationSummary(metrics)`
- `generateValidationReportHTML(metrics)`
- `storeValidationResults(metrics)`

### Utility Functions
- `isWithinMonths(date, months)`
- `daysSince(date)`
- `calculateAverage(arr)`
- `calculateVariance(arr)`
- `applyConfidenceAdjustment(rawPredictedRank, confidence)`

### Bound Script Entry Point
- `writeDetailedValidationSheet02Wrapper()` (in `BoundScriptWrapper.js`)

---

**All of the above are required for full 02_ sheet generation and validation in the TEST library.**

- All functions are present in `algorithmValidation.js`, `dataLoading.js`, and `BoundScriptWrapper.js`.
- Dependencies are modular and can be maintained or extended as needed.

## Additional Dependencies from Golf_Algo_Validation (for 02_ Sheet)

### Calibration & Validation Analysis
- `analyzePostTournamentCalibration()` — `utilities_Calibration.gs`
- `createCalibrationReport()` — `utilities_Calibration.gs`
- `getTopMetricsForTournament()` — `utilities_Calibration.gs`
- `calculatePredictionAccuracy()` — `phase2_PredictionAccuracy.gs`
- `generatePredictionValidationSheet()` — `phase2_PredictionAccuracy.gs`
- `validateAllTournaments()` — `phase2_PredictionAccuracy.gs`
- `validateTournamentSheet()` — `tournamentValidation.gs` (legacy/alternate logic)

### Data Loading/Preparation
- `loadTournamentPredictions()` — `utilities_DataLoading.gs`
- `loadTournamentResults()` — `utilities_DataLoading.gs`

### Metric/Correlation Calculation
- `calculatePearsonCorrelation()` — `phase1_MetricCorrelationAnalysis.gs`
- Any custom metric extraction logic in `templateGeneration.gs`, `phase1_MetricCorrelationAnalysis.gs`

### Helpers/Utilities
- Sheet/column header mapping, data cleaning, summary helpers (various files)
- Any utility functions referenced by the above (e.g., for extracting columns, matching players, etc.)

---

**These functions and helpers from Golf_Algo_Validation are required if you want the 02_ sheet in the TEST library to match the full legacy/validation/calibration output.**

- Review and port/refactor as needed for full parity.

## Step-by-Step Extraction & Refactor Plan

1. **Ensure all logic for validation and "02_" sheet writing is in algorithmValidation.js**
   - Already present in TEST library
2. **Confirm that writeDetailedValidationSheet02Wrapper() in the bound script calls the correct library functions**
   - Already implemented
3. **If needed, refactor writeDetailedValidationSheet02 to match the exact "02_" template format**
   - Review and update as required
4. **Test by running the wrapper in the TEST workbook and verify the output sheet**

## Next Steps
- [ ] Review and refactor output format for the "02_" sheet if needed
- [ ] Test and validate output in TEST library
