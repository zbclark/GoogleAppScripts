# Golf Algorithm Validation - Code Reorganization Manifest

## Overview
This document describes the reorganized structure of the Golf Algorithm Validation project, organized into 6 phases with supporting utilities and orchestration.

## File Structure

### Phase Files (Numbered 1-6)
Each phase is a complete analytical step in the model validation workflow:

#### `phase1_MetricCorrelationAnalysis.gs` (1,980 lines)
**Purpose**: Identify which metrics correlate most strongly with tournament results

**Main Functions**:
- `analyzeMetricCorrelations()` - Analyze metric correlations per-tournament and aggregate
- `loadTournamentData()` - Load tournament data from the selected Golf data folder
- `analyzeTournamentData()` - Analyze single tournament metrics
- `getMetricCorrelations()` - Calculate correlation values
- `getAggregateCorrelations()` - Aggregate data across tournaments
- `calculateDeltaMetrics()` - Calculate delta between top 10 and field
- `determineMetricWeighting()` - Generate metric weighting recommendations
- `updateSheets()` - Write analysis results to sheets

**Key Outputs**:
- `02_per_tournament_analysis` - Per-tournament metric breakdowns
- `03_course_type_summary` - Metrics by course type
- `04_weight_guide` - Recommended metric weights

---

#### `phase2_PredictionAccuracy.gs` (Stub - To be populated)
**Purpose**: Measure prediction accuracy and identify optimization opportunities

**Entry Point**: `performPredictionAccuracyAnalysis()`

**Will Include**:
- Actual vs predicted score comparison
- Accuracy by player segment
- Accuracy by course type
- Accuracy improvement tracking

---

#### `phase3_WeightSensitivity.gs` (Stub - To be populated)
**Purpose**: Analyze sensitivity of model to weight changes

**Entry Point**: `performWeightSensitivityAnalysis()`

**Will Include**:
- Test weight variations
- Measure impact on accuracy
- Identify optimal weight ranges
- Generate sensitivity reports

---

#### `phase4_IterativeOptimization.gs` (Stub - To be populated)
**Purpose**: Iteratively optimize weights based on accuracy results

**Entry Point**: `performIterativeOptimization()`

**Will Include**:
- Weight optimization algorithm
- Convergence tracking
- Optimal weight set generation
- Improvement validation

---

#### `phase5_CourseTypeOptimization.gs` (Stub - To be populated)
**Purpose**: Optimize weights per course type

**Entry Point**: `performCourseTypeOptimization()`

**Will Include**:
- Course type classification
- Per-type weight optimization
- Type-specific accuracy analysis
- Multi-type weighting strategy

---

#### `phase6_FinalModelDocumentation.gs` (Stub - To be populated)
**Purpose**: Document final model and generate comprehensive reports

**Entry Point**: `performFinalDocumentation()`

**Will Include**:
- Final weight set documentation
- Accuracy improvement summary
- Methodology documentation
- Recommendation generation

---

### Utility Files
Supporting functionality shared across phases:

#### `utilities_Calibration.gs`
**Purpose**: Post-tournament calibration analysis (actual results vs model predictions)

**Main Functions**:
- `analyzePostTournamentCalibration()` - Master calibration function
- `loadAndAnalyzeResults()` - Load tournament results
- `calculateTournamentMetrics()` - Calculate tournament metrics
- `analyzeVarianceFromModel()` - Analyze prediction accuracy
- `identifyCalibrationAreas()` - Identify areas for improvement

---

#### `utilities_DataLoading.gs`
**Purpose**: Load and validate data from tournament files

**Main Functions**:
- `validateSingleTournament()` - Validate single tournament file
- `validateAllTournaments()` - Validate all tournaments in folder
- `getCourseNameAndNumber()` - Extract course identifiers
- `mergeData()` - Merge data from multiple sources
- Data logging and validation functions

---

### Orchestration File

#### `orchestration_RunAnalysis.gs` (343 lines)
**Purpose**: Master coordinator that runs all phases in proper sequence

**Main Functions**:
- `runCompleteModelAnalysis()` - Run all phases in order
- `performCalibrationAnalysis()` - Phase 2 (Actual vs Model)
- `performMetricCorrelationAnalysis()` - Phase 1 (Metric Correlation)
- `performCourseTypeClassification()` - Phase 5 (Course Type Optimization)
- `analyzeAndGenerateRecommendations()` - Generate insights from all phases
- `createComprehensiveSummarySheet()` - Create output summary
- `analyzeGreatestAccuracyGap()` - Quick analysis utility

---

### Legacy/Reference Files
These files are kept for reference and debugging:

- `metricCorrelationAnalysis.gs` - Original Phase 1 (backed up as phase1_MetricCorrelationAnalysis.gs)
- `calibrationAnalysis.gs` - Original calibration (backed up as utilities_Calibration.gs)
- `courseTypeClassification.gs` - Original course type analysis
- `modelImprovementOrchestration.gs` - Original orchestration
- `validationWrapper.gs` - Legacy validation functions
- `tournamentAnalysis.gs` - Legacy tournament analysis
- `onOpen.gs` - Menu setup
- `templateGeneration.gs` - Template generation

---

## Phase Execution Sequence

```
runCompleteModelAnalysis()
├── Phase 2: Post-Tournament Calibration
│   └── analyzePostTournamentCalibration()
├── Phase 1: Metric Correlation Analysis
│   └── analyzeMetricCorrelations()
├── Phase 5: Course Type Optimization
│   └── courseTypeClassification()
├── Generate Recommendations
│   └── analyzeAndGenerateRecommendations()
└── Create Summary Sheet
    └── createComprehensiveSummarySheet()
```

---

## Migration Notes

### From Old to New Files

| Old Function | New Location | Status |
|---|---|---|
| `analyzePostTournamentCalibration()` | `utilities_Calibration.gs` | ✓ Moved |
| `analyzeMetricCorrelations()` | `phase1_MetricCorrelationAnalysis.gs` | ✓ Moved |
| `courseTypeClassification()` | Legacy: `courseTypeClassification.gs` / New: `phase5_CourseTypeOptimization.gs` | Partial |
| Prediction accuracy functions | TBD in `phase2_PredictionAccuracy.gs` | To do |
| Weight sensitivity functions | TBD in `phase3_WeightSensitivity.gs` | To do |
| Optimization functions | TBD in `phase4_IterativeOptimization.gs` | To do |
| Documentation functions | TBD in `phase6_FinalModelDocumentation.gs` | To do |

---

## Function Breakdown by Phase

### Phase 1: Metric Correlation Analysis
- `analyzeMetricCorrelations()` - Main entry point
- `loadTournamentData()`
- `analyzeTournamentData(tournamentData, metrics)`
- `getMetricCorrelations(data, metrics)`
- `getAggregateCorrelations(allTournamentData, metrics)`
- `calculateDeltaMetrics(correlation, allMetrics)`
- `determineMetricWeighting(correlationData, allMetrics)`
- `updateSheets(masterSs, correlationData, allMetrics, newTournamentsProcessed)`
- `saveMetricAnalysisToSheet(masterSs, sheet, correlationData, metric)`
- Plus 20+ helper functions for data processing

### Phase 2: Post-Tournament Calibration
- `analyzePostTournamentCalibration()` - Main entry point
- `loadAndAnalyzeResults(masterSs, folders)`
- `calculateTournamentMetrics(tournamentData, courseMetadata)`
- `analyzeVarianceFromModel(actualScores, predictedScores)`
- `identifyCalibrationAreas(variance)`
- Plus helper functions

### Phase 3: Prediction Accuracy (To be populated)
- Analysis of accuracy metrics
- By-segment accuracy breakdown
- Course type accuracy analysis

### Phase 4: Weight Sensitivity (To be populated)
- Weight variation testing
- Sensitivity measurements
- Optimal range identification

### Phase 5: Iterative Optimization (To be populated)
- Optimization algorithm
- Convergence tracking
- Weight set generation

### Phase 6: Course Type Optimization (To be populated)
- Type classification
- Type-specific optimization
- Multi-type strategy

---

## Implementation Status

| Component | Status | Lines |
|---|---|---|
| Phase 1 - Metric Correlation | ✓ Complete | 1,980 |
| Phase 2 - Prediction Accuracy | 📝 Stub | 50+ |
| Phase 3 - Weight Sensitivity | 📝 Stub | 50+ |
| Phase 4 - Iterative Optimization | 📝 Stub | 50+ |
| Phase 5 - Course Type Optimization | 📝 Stub | 50+ |
| Phase 6 - Final Documentation | 📝 Stub | 50+ |
| Utilities - Calibration | ✓ Complete | 300+ |
| Utilities - Data Loading | ✓ Complete | 400+ |
| Orchestration | ✓ Complete | 343 |

---

## Usage

### Run All Phases
```javascript
// From Apps Script menu or console
runCompleteModelAnalysis()
```

### Run Individual Phase
```javascript
// Phase 1 - Metric Correlation
analyzeMetricCorrelations()

// Phase 2 - Calibration
analyzePostTournamentCalibration()
```

---

## File Organization

### Active Files (16 files)
- **Phase Files (6)**: `phase1_*.gs` through `phase6_*.gs`
- **Utility Files (2)**: `utilities_Calibration.gs`, `utilities_DataLoading.gs`
- **Orchestration (1)**: `orchestration_RunAnalysis.gs`
- **Support (2)**: `onOpen.gs` (menu setup), `templateGeneration.gs` (template generation)
- **Reference (6)**: `LEGACY_*.gs` files documenting migration

## Notes

1. **Legacy Files**: Old files renamed with `LEGACY_` prefix for reference. These are minimal stubs showing where functions were moved.

2. **Clean Structure**: Files removed:
   - `modelImprovementOrchestration.gs` → Moved to `orchestration_RunAnalysis.gs`
   - `validationWrapper.gs` → Moved to `orchestration_RunAnalysis.gs` + utilities
   - `metricCorrelationAnalysis.gs` → Moved to `phase1_MetricCorrelationAnalysis.gs`
   - `calibrationAnalysis.gs` → Moved to `utilities_Calibration.gs`
   - `courseTypeClassification.gs` → Moved to `phase5_CourseTypeOptimization.gs`
   - `tournamentAnalysis.gs` → Moved to `phase1_MetricCorrelationAnalysis.gs` + utilities

3. **Incremental Development**: Phases 3-6 are stubs ready for population with implementation details.

4. **Shared Utilities**: Common functionality in utilities files reduces duplication.

5. **Single Orchestration Point**: All analysis runs through `runCompleteModelAnalysis()`.

6. **Google Sheets Output**: All phases write to specific sheets in the active spreadsheet.

---

## Next Steps

1. Populate Phase 3 - Weight Sensitivity Analysis
2. Populate Phase 4 - Iterative Optimization
3. Populate Phase 5 - Course Type Optimization  
4. Populate Phase 6 - Final Model Documentation
5. Update imports in orchestration as new phases are implemented
6. Test complete workflow

---

**Last Updated**: 2025
**Organized Structure**: Complete
**Ready for Development**: Yes
