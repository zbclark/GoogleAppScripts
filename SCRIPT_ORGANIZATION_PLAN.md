# Script File Organization Plan

## Current State Analysis

**Current 11 files with functions scattered:**
- calibrationAnalysis.gs (3 functions)
- courseTypeClassification.gs (8 functions)
- metricCorrelationAnalysis.gs (15 functions)
- modelImprovementOrchestration.gs (7 functions)
- onOpen.gs (1 function)
- templateGeneration.gs (3 functions)
- tournamentAnalysis.gs (6 functions)
- validationWrapper.gs (9 functions)
- Plus 2 files with no functions

---

## Mapping to VALIDATION_FRAMEWORK Phases

### Phase 1: Metric Correlation Analysis ✅ (COMPLETED)
**Functions:**
- `analyzeMetricCorrelations()` - Main orchestration
- `createIndividualTournamentSheets()` - Output generation
- `createTypeSpecificSummaries()` - Type summaries
- `createCourseTypeSheet()` - Classification sheet
- `createWeightCalibrationSheet()` - Calibration guide
- `classifyCoursesIntoTypes()` - Type classification
- `getTemplateWeightForMetric()` - Weight lookup
- `getTournamentConfigurationWeights()` - Config loading
- `calculatePearsonCorrelation()` - Correlation math
- `getProcessedTournaments()` - Tracking
- `updateProcessedTournaments()` - Tracking
- `getMetricGroupings()` - Grouping data
- `getMetricGroup()` - Grouping lookup
- `getGroupWeights()` - Weight data

**Current Homes:** metricCorrelationAnalysis.gs (primary), courseTypeClassification.gs (partial)

**Should Be:** Single file: `phase1_MetricCorrelationAnalysis.gs`

---

### Phase 2: Prediction Accuracy Testing 🎯 (NEXT - Not Yet Built)
**Functions (to be built):**
- `buildPlayerWeightedScores()` - Calculate scores
- `predictTournamentFinishes()` - Generate predictions
- `calculatePredictionAccuracy()` - Compare to actual
- `generatePredictionValidationSheet()` - Output

**Related Existing Functions:**
- `validateAllTournaments()` - Similar concept
- `validateSingleTournament()` - Similar concept
- `loadTournamentPredictions()` - Data loading
- `loadTournamentResults()` - Data loading

**Current Homes:** tournamentAnalysis.gs, validationWrapper.gs (scattered)

**Should Be:** Single file: `phase2_PredictionAccuracy.gs`

---

### Phase 3: Weight Sensitivity Analysis (FUTURE)
**Functions (to be built):**
- `calculateMetricSensitivity()` - Sensitivity testing
- `generateSensitivityAnalysisSheet()` - Output

**Related Existing Functions:**
- `analyzeWeightEffectiveness()` - Similar concept

**Current Homes:** validationWrapper.gs (partial)

**Should Be:** Single file: `phase3_WeightSensitivity.gs`

---

### Phase 4: Iterative Optimization (FUTURE)
**Functions (to be built):**
- `compareWeightIterations()` - Iteration comparison
- `generateIterationHistorySheet()` - Output

**Current Homes:** None

**Should Be:** Single file: `phase4_IterativeOptimization.gs`

---

### Phase 5: Course Type Optimization (FUTURE)
**Functions (to be built):**
- `calculateAccuracyByType()` - Type-specific accuracy
- `generateTypeComparisonSheet()` - Output

**Related Existing Functions:**
- `classifyTournamentsByCourseType()` - Type classification
- `calculateAllTournamentCorrelations()` - Data basis
- `labelClusters()` - Clustering logic
- `deriveTemplateMetrics()` - Template derivation

**Current Homes:** courseTypeClassification.gs

**Should Be:** Single file: `phase5_CourseTypeOptimization.gs`

---

### Phase 6: Final Model Documentation (FUTURE)
**Functions (to be built):**
- `generateFinalModelDocumentation()` - Model docs

**Current Homes:** None

**Should Be:** Single file: `phase6_FinalModelDocumentation.gs`

---

### Supporting/Utility Functions

**Orchestration (runs all phases in sequence):**
- `runCompleteModelAnalysis()` - Main runner
- `performCalibrationAnalysis()` - Phase 1 runner
- `performMetricCorrelationAnalysis()` - Phase 1 runner
- `performCourseTypeClassification()` - Phase 5 runner
- `analyzeAndGenerateRecommendations()` - Analysis summarizer
- `createComprehensiveSummarySheet()` - Report generation

**Current Home:** modelImprovementOrchestration.gs

**Should Be:** `orchestration_RunAnalysis.gs` (renamed for clarity)

---

**Menu & UI (runs/displays analyses):**
- `onOpen()` - Menu creation

**Current Home:** onOpen.gs

**Should Be:** Keep as is OR merge with orchestration if small

---

## Proposed New Structure

```
Golf_Algo_Validation/
├─ appsscript.json (no change)
├─ .clasp.json (no change)
│
├─ phase1_MetricCorrelationAnalysis.gs
│  ├─ analyzeMetricCorrelations()
│  ├─ createIndividualTournamentSheets()
│  ├─ createTypeSpecificSummaries()
│  ├─ createCourseTypeSheet()
│  ├─ createWeightCalibrationSheet()
│  ├─ classifyCoursesIntoTypes()
│  ├─ getTemplateWeightForMetric()
│  ├─ getTournamentConfigurationWeights()
│  ├─ calculatePearsonCorrelation()
│  ├─ getProcessedTournaments()
│  ├─ updateProcessedTournaments()
│  ├─ getMetricGroupings()
│  ├─ getMetricGroup()
│  └─ getGroupWeights()
│
├─ phase2_PredictionAccuracy.gs (NEW)
│  ├─ buildPlayerWeightedScores()
│  ├─ predictTournamentFinishes()
│  ├─ calculatePredictionAccuracy()
│  ├─ generatePredictionValidationSheet()
│  ├─ loadTournamentPredictions()
│  ├─ loadTournamentResults()
│  └─ validateAllTournaments()
│
├─ phase3_WeightSensitivity.gs (NEW)
│  ├─ calculateMetricSensitivity()
│  ├─ generateSensitivityAnalysisSheet()
│  └─ analyzeWeightEffectiveness()
│
├─ phase4_IterativeOptimization.gs (NEW)
│  ├─ compareWeightIterations()
│  └─ generateIterationHistorySheet()
│
├─ phase5_CourseTypeOptimization.gs (NEW)
│  ├─ classifyTournamentsByCourseType()
│  ├─ calculateAllTournamentCorrelations()
│  ├─ calculatePearsonCorrelationTournaments()
│  ├─ classifyTournaments()
│  ├─ clusterTournaments()
│  ├─ calculateEuclideanDistance()
│  ├─ labelClusters()
│  ├─ deriveTemplateMetrics()
│  ├─ writeClassificationResults()
│  ├─ calculateAccuracyByType()
│  └─ generateTypeComparisonSheet()
│
├─ phase6_FinalModelDocumentation.gs (NEW)
│  └─ generateFinalModelDocumentation()
│
├─ orchestration_RunAnalysis.gs (RENAMED from modelImprovementOrchestration.gs)
│  ├─ runCompleteModelAnalysis()
│  ├─ performCalibrationAnalysis()
│  ├─ performMetricCorrelationAnalysis()
│  ├─ performCourseTypeClassification()
│  ├─ analyzeAndGenerateRecommendations()
│  └─ createComprehensiveSummarySheet()
│
├─ onOpen.gs (KEEP - menu creation)
│  └─ onOpen()
│
├─ utilities_DataLoading.gs (NEW - consolidate data loading)
│  ├─ loadTournamentPredictions()
│  ├─ loadTournamentResults()
│  ├─ loadTournamentConfig()
│  └─ listAvailableTournamentWorkbooks()
│
└─ utilities_Calibration.gs (RENAME calibrationAnalysis.gs)
   ├─ analyzePostTournamentCalibration()
   ├─ createCalibrationReport()
   └─ getTopMetricsForTournament()
```

---

## Files to Remove/Consolidate

| File | Status | Reason |
|------|--------|--------|
| calibrationAnalysis.gs | Move to utilities_Calibration.gs | Utility functions |
| courseTypeClassification.gs | Merge into phase5_CourseTypeOptimization.gs | All Phase 5 related |
| metricCorrelationAnalysis.gs | Rename to phase1_MetricCorrelationAnalysis.gs | All Phase 1 related |
| modelImprovementOrchestration.gs | Rename to orchestration_RunAnalysis.gs | Clearer naming |
| templateGeneration.gs | DELETE or archive | Functions are now in phase5 |
| tournamentAnalysis.gs | Split to phase2 + utilities_DataLoading.gs | Distribute by phase |
| validationWrapper.gs | Split across phases 2, 3, 6 | Distribute by phase |

---

## Migration Steps

### Step 1: Create new Phase files
Create empty structure for phases 2-6

### Step 2: Move Phase 5 functions
- Merge courseTypeClassification.gs → phase5_CourseTypeOptimization.gs
- Move writeClassificationResults() into phase5

### Step 3: Create utilities
- Create utilities_Calibration.gs from calibrationAnalysis.gs
- Create utilities_DataLoading.gs from parts of tournamentAnalysis.gs

### Step 4: Split data-loading functions
- Move loadTournament* functions to utilities_DataLoading.gs
- Update imports in all files that use these

### Step 5: Move validation functions
- Consolidate validateAllTournaments(), validateSingleTournament() → phase2
- Move to utilities_DataLoading.gs if used elsewhere

### Step 6: Rename orchestration file
- modelImprovementOrchestration.gs → orchestration_RunAnalysis.gs

### Step 7: Archive old files
- Move unused files (templateGeneration.gs, etc.) to archive
- Delete or archive validationWrapper.gs if fully migrated

### Step 8: Update menu references
- Ensure onOpen.gs calls correct function names

---

## Benefits of New Structure

✅ **Cohesion**: All Phase N functions in one file → easier to understand phase  
✅ **Modularity**: Each file is focused on one phase/concern  
✅ **Navigation**: Opening phase1_MetricCorrelationAnalysis.gs shows all Phase 1 functions  
✅ **Testing**: Phase files can be tested independently  
✅ **Development**: New phases (2-6) have clear file locations  
✅ **Naming**: File names match VALIDATION_FRAMEWORK.md phase names  
✅ **Utilities**: Common functions grouped separately  

---

## Implementation Order

1. **Immediate** (Week 1): Create phase1 + utilities files, test existing functionality
2. **Short-term** (Week 2): Create phase2 structure, implement Phase 2 functions
3. **Medium-term** (Weeks 3-4): Phases 3-6 created as needed
4. **Ongoing**: Update orchestration.gs as new phases complete

---

## Notes

- **Backward compatibility**: Menu items stay the same, but internal organization changes
- **Git history**: Old files can be archived if needed for reference
- **Testing**: Each phase file can be tested independently
- **Naming**: `phase#_FunctionName.gs` makes it clear what phase functions belong to

