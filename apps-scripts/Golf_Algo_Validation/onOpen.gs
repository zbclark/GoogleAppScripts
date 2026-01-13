/**
 * Tracking Sheet Menu Setup
 * Opens menu for validation functions
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('🏌️ 2025+ Tournament Validation')
    .addItem('Run 2025 Validation', 'runValidation2025')
    .addItem('Run 2026 Validation', 'runValidation2026')
    .addSeparator()
    .addItem('🏆 Winner Prediction Analysis', 'analyzeWinnerPredictions')
    .addItem('📊 Model Accuracy Diagnostics', 'analyzeModelAccuracy')
    .addItem('🎯 Post-Tournament Calibration', 'analyzePostTournamentCalibration')
    .addItem('📊 Analyze Weight Effectiveness', 'analyzeWeightEffectiveness')
    .addItem('📈 Metric Correlation Analysis', 'analyzeMetricCorrelations')
    .addSeparator()
    .addItem('⚙️ Generate Weight Templates', 'generateWeightTemplates')
    .addItem('🎓 Classify by Course Type & Derive Weights', 'classifyTournamentsByCourseType')
    .addSeparator()
    .addItem('Show Report', 'showValidationReport')
    .addToUi();
  
  console.log("Validation menu added");
}
