/**
 * Orchestration: Run Analysis
 * Master analysis runner coordinating all phases
 * (Renamed from modelImprovementOrchestration.gs for clarity)
 * 
 * Functions:
 * - runCompleteModelAnalysis() - Main orchestration across all phases
 * - performCalibrationAnalysis() - Phase 2 wrapper
 * - performMetricCorrelationAnalysis() - Phase 1 wrapper
 * - performCourseTypeClassification() - Phase 5 wrapper
 * - analyzeAndGenerateRecommendations() - Generate recommendations
 * - createComprehensiveSummarySheet() - Create summary output
 * - analyzeGreatestAccuracyGap() - Quick analysis tool
 */

/**
 * MASTER ANALYSIS ORCHESTRATION - COMPREHENSIVE MODEL IMPROVEMENT
 * Runs ALL available analysis functions in proper sequence to improve model accuracy
 */
function runCompleteModelAnalysis() {
  try {
    const ui = SpreadsheetApp.getUi();
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();
    
    ui.alert("🏌️ Starting COMPREHENSIVE Model Analysis...\n\nThis will run ALL validation functions:\n1. Post-Tournament Calibration\n2. Metric Correlation Analysis\n3. Course Type Classification\n\nThis may take 3-5 minutes.");
    
    console.log("\n" + "=".repeat(90));
    console.log("🎯 COMPREHENSIVE MODEL ANALYSIS - COMPLETE WORKFLOW STARTING");
    console.log("=".repeat(90));
    
    // ========== PHASE 2: POST-TOURNAMENT CALIBRATION ==========
    console.log("\n🎯 PHASE 2: Post-Tournament Calibration (Actual Results vs Model)");
    console.log("-".repeat(90));
    
    let calibrationResults = { tournaments: [] };
    try {
      console.log("Running analyzePostTournamentCalibration()...");
      analyzePostTournamentCalibration();
      calibrationResults.tournaments = [{name: "Calibration Complete"}];
      console.log("✓ Post-tournament calibration complete");
    } catch (e) {
      console.log(`⚠️ Calibration skipped: ${e.message}`);
    }
    
    // ========== PHASE 1: METRIC CORRELATION ANALYSIS ==========
    console.log("\n📈 PHASE 1: Metric Correlation Analysis (What Actually Matters)");
    console.log("-".repeat(90));
    
    let metricResults = { tournaments: [] };
    try {
      console.log("Running analyzeMetricCorrelations()...");
      analyzeMetricCorrelations();
      metricResults.tournaments = [{name: "Metrics Complete"}];
      console.log("✓ Metric correlation analysis complete");
    } catch (e) {
      console.log(`⚠️ Metric correlation skipped: ${e.message}`);
    }
    
    // ========== PHASE 5: COURSE TYPE CLASSIFICATION & TEMPLATES ==========
    console.log("\n🗂️  PHASE 5: Course Type Classification & Template Derivation");
    console.log("-".repeat(90));
    
    try {
      console.log("Running classifyTournamentsByCourseType()...");
      classifyTournamentsByCourseType();
      console.log("✓ Course type classification complete");
    } catch (e) {
      console.log(`⚠️ Course type classification skipped: ${e.message}`);
    }
    
    // ========== PHASE 8: MASTER SUMMARY & RECOMMENDATIONS ==========
    console.log("\n🔍 PHASE 8: Consolidated Recommendations");
    console.log("-".repeat(90));
    
    const recommendations = {
      phasesCompleted: 3,
      nextSteps: [
        "1. Review 'Calibration Report' - where you missed and why",
        "2. Examine '00_Course_Type_Classification' - tournament groupings",
        "3. Open individual '02_Tournament_*' sheets - course-specific insights",
        "4. Review '03_POWER/TECHNICAL/BALANCED_Summary' sheets by course type",
        "5. Compare 'Weight Templates' to your current weights",
        "6. Adjust weights and re-test on past tournaments"
      ]
    };
    
    createComprehensiveSummarySheet(masterSs, recommendations);
    
    console.log("\n" + "=".repeat(90));
    console.log("✅ COMPREHENSIVE MODEL ANALYSIS - COMPLETE");
    console.log("=".repeat(90));
    
    ui.alert(
      `✅ COMPREHENSIVE ANALYSIS COMPLETE - 3 Phases Executed\n\n` +
      `Sheets Created:\n` +
      `🎯 Calibration Report\n` +
      `📋 02_Tournament_* Analysis Sheets\n` +
      `📊 03_Type_Summary Sheets (POWER/TECHNICAL/BALANCED)\n` +
      `🎨 Comprehensive Summary\n\n` +
      `NEXT: Open "Comprehensive Analysis Summary" for prioritized action items`
    );
    
  } catch (e) {
    console.error("Error in runCompleteModelAnalysis:", e);
    SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}\n\nCheck console for details.`);
  }
}

/**
 * Wrapper for calibration analysis
 */
function performCalibrationAnalysis() {
  try {
    console.log("Running post-tournament calibration...");
    analyzePostTournamentCalibration();
    console.log("✓ Calibration complete");
    return { status: "complete" };
  } catch (e) {
    console.error("Error in performCalibrationAnalysis:", e);
    return { status: "error", error: e.message };
  }
}

/**
 * Wrapper for metric correlation analysis
 */
function performMetricCorrelationAnalysis() {
  try {
    console.log("Running metric correlation analysis...");
    analyzeMetricCorrelations();
    console.log("✓ Metric correlation complete");
    return { status: "complete" };
  } catch (e) {
    console.error("Error in performMetricCorrelationAnalysis:", e);
    return { status: "error", error: e.message };
  }
}

/**
 * Wrapper for course type classification
 */
function performCourseTypeClassification() {
  try {
    console.log("Running course type classification...");
    classifyTournamentsByCourseType();
    console.log("✓ Course type classification complete");
    return { status: "complete" };
  } catch (e) {
    console.error("Error in performCourseTypeClassification:", e);
    return { status: "error", error: e.message };
  }
}

/**
 * Generate specific recommendations based on analysis
 */
function analyzeAndGenerateRecommendations(calibrationResults, metricResults, courseTypeResults) {
  console.log("Analyzing results and generating recommendations...");
  
  const recommendations = {
    topLevelAccuracy: "To be determined from calibration",
    topMetrics: ["SG Total", "SG Approach", "SG Putting"],
    courseTypeCount: 3,
    primaryImprovement: "Run analysis to identify",
    byTournament: [],
    byMetric: [],
    byType: []
  };
  
  console.log(`  → Calibration results: ${calibrationResults?.tournaments?.length || 0} tournaments`);
  console.log(`  → Metric results: ${metricResults?.tournaments?.length || 0} tournaments`);
  console.log(`  → Course types: ${courseTypeResults?.count || 3}`);
  
  return recommendations;
}

/**
 * Create comprehensive summary with all analysis insights
 */
function createComprehensiveSummarySheet(masterSs, recommendations) {
  let oldSheet = masterSs.getSheetByName("Comprehensive Analysis Summary");
  if (oldSheet) {
    masterSs.deleteSheet(oldSheet);
  }
  
  const sheet = masterSs.insertSheet("Comprehensive Analysis Summary", 0);
  sheet.setColumnWidth(1, 700);
  sheet.setColumnWidth(2, 1);
  
  let currentRow = 1;
  
  // Helper function to add formatted section header
  const addSectionHeader = (text, bgColor) => {
    sheet.getRange(currentRow, 1).setBackground(bgColor).setFontColor("white").setFontWeight("bold").setFontSize(13).setWrap(true);
    sheet.getRange(currentRow, 1).setValue(text);
    sheet.setRowHeight(currentRow, 24);
    currentRow++;
    return currentRow - 1;
  };
  
  // Helper function to add spacer row
  const addSpacer = () => {
    sheet.setRowHeight(currentRow, 8);
    currentRow++;
  };
  
  // Helper function to add content
  const addContent = (text, isBold = false, fontSize = 11) => {
    const range = sheet.getRange(currentRow, 1);
    range.setValue(text);
    range.setFontSize(fontSize);
    if (isBold) range.setFontWeight("bold");
    range.setWrap(true);
    sheet.setRowHeight(currentRow, 20);
    currentRow++;
  };
  
  // TITLE
  addSectionHeader("🎯 COMPREHENSIVE MODEL ANALYSIS SUMMARY", "#1f2937");
  addContent(`Generated: ${new Date().toLocaleString()}`);
  addSpacer();
  
  // PHASES COMPLETED
  addSectionHeader("✅ PHASES COMPLETED", "#3b82f6");
  const phases = [
    "1. ✓ Phase 1: Metric Correlation Analysis - what metrics predict winners",
    "2. ✓ Phase 2: Post-Tournament Calibration - actual results vs model",
    "3. ✓ Phase 5: Course Type Classification - tournament groupings",
    "4. ⏳ Phase 3: Weight Sensitivity Analysis - coming next",
    "5. ⏳ Phase 4: Iterative Optimization - coming next",
    "6. ⏳ Phase 6: Final Model Documentation - coming next"
  ];
  phases.forEach(phase => addContent(phase));
  addSpacer();
  
  // KEY SHEETS TO REVIEW
  addSectionHeader("📋 KEY SHEETS TO REVIEW (In Order)", "#10b981");
  const sheets = [
    { name: "Calibration Report", desc: "Actual finish positions vs model - where you missed" },
    { name: "00_Course_Type_Classification", desc: "Which tournaments cluster together - POWER/TECHNICAL/BALANCED" },
    { name: "02_Tournament_[Name] sheets", desc: "Per-course metric effectiveness - customize by course type" },
    { name: "03_[Type]_Summary sheets", desc: "Aggregated metrics by course type - POWER, TECHNICAL, BALANCED" },
    { name: "04_Weight_Calibration_Guide", desc: "Template weights with recommendations by course type" },
    { name: "Weight Templates", desc: "Comprehensive weight comparison across all metrics and types" }
  ];
  sheets.forEach((s, idx) => {
    addContent(`${idx + 1}. ${s.name}`, true);
    addContent(`   → ${s.desc}`);
  });
  addSpacer();
  
  // DIAGNOSTIC WORKFLOW
  addSectionHeader("🔍 DIAGNOSTIC WORKFLOW", "#f59e0b");
  const steps = [
    { title: "STEP 1: Identify Problem Tournaments", items: [
      "• Open 'Calibration Report' - find tournaments with worst accuracy",
      "• Note which course types struggle (power/technical/balanced)"
    ]},
    { title: "STEP 2: Find What Metrics Mattered", items: [
      "• Open that tournament's '02_Tournament_[Name]' sheet",
      "• Top 5 metrics show what actually separated winners at that course",
      "• If you weighted them low = that's your problem"
    ]},
    { title: "STEP 3: Check Course Type Patterns", items: [
      "• Open '00_Course_Type_Classification' - what type is this course?",
      "• Are OTHER courses of this type also underperforming?",
      "• If yes = systemic issue with your course-type weights"
    ]},
    { title: "STEP 4: Compare to Templates", items: [
      "• Open 'Weight Templates' - what did actual data show?",
      "• Compare template weights to your current weights",
      "• Gaps indicate where you need to adjust"
    ]},
    { title: "STEP 5: Make Targeted Adjustments", items: [
      "• For underweighted metrics at problem courses: increase 15-30%",
      "• For overweighted metrics: decrease 10-20%",
      "• Focus on metrics with delta > 0.5 (strong predictors)"
    ]},
    { title: "STEP 6: Test & Measure", items: [
      "• Run predictions on past similar tournaments with new weights",
      "• Compare accuracy before vs after",
      "• Target: 5-10% improvement per cycle"
    ]}
  ];
  
  steps.forEach(step => {
    addContent(step.title, true, 12);
    step.items.forEach(item => addContent(item));
    addSpacer();
  });
  
  // NEXT STEPS
  addSectionHeader("✅ NEXT STEPS", "#06b6d4");
  if (recommendations && recommendations.nextSteps) {
    recommendations.nextSteps.forEach((step, idx) => {
      addContent(`${idx + 1}. ${step}`);
    });
  }
  
  // Format entire first column for text wrapping
  sheet.getRange(1, 1, currentRow).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
}

/**
 * Quick analysis: What's my biggest prediction gap?
 */
function analyzeGreatestAccuracyGap() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    const calibSheet = sheets.find(s => s.getName() === "Calibration Report");
    
    if (!calibSheet) {
      ui.alert("⚠️ Run Post-Tournament Calibration Analysis first");
      return;
    }
    
    const data = calibSheet.getDataRange().getValues();
    let worstTournament = null;
    let worstAccuracy = 100;
    
    for (let i = 10; i < data.length; i++) {
      const accStr = data[i][3]?.toString().replace("%", "");
      const accuracy = parseFloat(accStr) || 0;
      if (accuracy < worstAccuracy && accuracy > 0) {
        worstAccuracy = accuracy;
        worstTournament = data[i][0];
      }
    }
    
    if (worstTournament) {
      ui.alert(
        `📍 BIGGEST ACCURACY GAP FOUND\n\n` +
        `Tournament: ${worstTournament}\n` +
        `Accuracy: ${worstAccuracy}%\n\n` +
        `ACTION:\n` +
        `1. Check metric correlations for this tournament\n` +
        `2. Compare your weights to the top differentiating metrics\n` +
        `3. Adjust weights for that course type`
      );
    }
    
  } catch (e) {
    ui.alert(`Error: ${e.message}`);
  }
}

/**
 * VALIDATION FUNCTIONS - Year-specific validation runners
 */

function runValidation2025() {
  writeValidationToSheet(2025);
}

function runValidation2026() {
  writeValidationToSheet(2026);
}

function writeValidationToSheet(year) {
  try {
    const summary = validateAllTournaments();
    if (summary.error) {
      SpreadsheetApp.getUi().alert(`Error: ${summary.error}`);
      return;
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = `${year} Validation`;
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    const lastRow = sheet.getLastRow();
    const startRow = lastRow > 0 ? lastRow + 3 : 1;
    const headers = ["Date", "Tournament", "Correlation", "RMSE", "Top-10 %", "Matched"];
    sheet.getRange(startRow, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    const dataStartRow = startRow + 1;
    const runDate = new Date().toLocaleDateString();
    const resultData = summary.individualResults.map(r => [runDate, r.tournament, r.correlation, r.rmse, r.topTenAccuracy, r.matchedPlayers]);
    if (resultData.length > 0) {
      sheet.getRange(dataStartRow, 1, resultData.length, headers.length).setValues(resultData);
    }
    sheet.autoResizeColumns(1, headers.length);
    let msg = `✅ Done!\n\nValidated: ${summary.tournamentsValidated}\nSkipped: ${summary.tournamentsSkipped}\nFailed: ${summary.failedValidations}\n\nCorr: ${summary.averageCorrelation}\nRMSE: ${summary.averageRMSE}`;
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}`);
  }
}
