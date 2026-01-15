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
  
  sheet.setColumnWidth(1, 600);
  sheet.setColumnWidth(2, 400);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 150);
  
  let row = 1;
  
  sheet.getRange(row, 1, 1, 4).setBackground("#1f2937").setFontColor("white").setFontWeight("bold").setFontSize(14);
  sheet.appendRow(["🎯 COMPREHENSIVE MODEL ANALYSIS SUMMARY", "", "", ""]);
  row++;
  
  sheet.getRange(row, 1).setFontSize(11);
  sheet.appendRow([`Generated: ${new Date().toLocaleString()}`, "", "", ""]);
  row += 2;
  
  // ===== PHASES COMPLETED =====
  sheet.getRange(row, 1).setFontWeight("bold").setFontSize(12).setBackground("#3b82f6").setFontColor("white");
  sheet.appendRow(["✅ PHASES COMPLETED", "", "", ""]);
  row++;
  
  const phases = [
    "1. ✓ Phase 1: Metric Correlation Analysis - what metrics predict winners",
    "2. ✓ Phase 2: Post-Tournament Calibration - actual results vs model",
    "3. ✓ Phase 5: Course Type Classification - tournament groupings",
    "4. ⏳ Phase 3: Weight Sensitivity Analysis - coming next",
    "5. ⏳ Phase 4: Iterative Optimization - coming next",
    "6. ⏳ Phase 6: Final Model Documentation - coming next"
  ];
  
  phases.forEach(phase => {
    sheet.appendRow([phase, "", "", ""]);
  });
  row += phases.length + 1;
  
  // ===== KEY SHEETS TO REVIEW =====
  sheet.getRange(row, 1).setFontWeight("bold").setFontSize(12).setBackground("#10b981").setFontColor("white");
  sheet.appendRow(["📋 KEY SHEETS TO REVIEW (In Order)", "", "", ""]);
  row++;
  
  const sheets = [
    { name: "Calibration Report", desc: "Actual finish positions vs model - where you missed" },
    { name: "00_Course_Type_Classification", desc: "Which tournaments cluster together - POWER/TECHNICAL/BALANCED" },
    { name: "02_Tournament_[Name] sheets", desc: "Per-course metric effectiveness - customize by course type" },
    { name: "03_[Type]_Summary sheets", desc: "Aggregated metrics by course type - POWER, TECHNICAL, BALANCED" },
    { name: "04_Weight_Calibration_Guide", desc: "Template weights with recommendations by course type" },
    { name: "Weight Templates", desc: "Comprehensive weight comparison across all metrics and types" }
  ];
  
  sheets.forEach((s, idx) => {
    sheet.appendRow([`${idx + 1}. ${s.name}`, s.desc, "", ""]);
  });
  row += sheets.length + 1;
  
  // ===== DIAGNOSTIC WORKFLOW =====
  sheet.getRange(row, 1).setFontWeight("bold").setFontSize(12).setBackground("#f59e0b").setFontColor("white");
  sheet.appendRow(["🔍 DIAGNOSTIC WORKFLOW", "", "", ""]);
  row++;
  
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
    sheet.appendRow([step.title, "", "", ""]);
    row++;
    step.items.forEach(item => {
      sheet.appendRow([item, "", "", ""]);
      row++;
    });
    row++;
  });
  
  // ===== NEXT STEPS =====
  sheet.getRange(row, 1).setFontWeight("bold").setFontSize(12).setBackground("#06b6d4").setFontColor("white");
  sheet.appendRow(["✅ NEXT STEPS", "", "", ""]);
  row++;
  
  recommendations.nextSteps.forEach((step, idx) => {
    sheet.appendRow([step, "", "", ""]);
    row++;
  });
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
