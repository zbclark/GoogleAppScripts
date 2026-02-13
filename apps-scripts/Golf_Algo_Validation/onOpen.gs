/**
 * Golf Model Analysis Menu Setup
 * 
 * Entry point for all analysis functions
 * Main functions: orchestration_RunAnalysis.gs
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('🏌️ Golf Model Analysis')
    .addItem('🚀 Run Complete Model Analysis', 'runCompleteModelAnalysis')
    .addItem('🚀 Run Complete (Choose Year)', 'runCompleteModelAnalysisWithYearPrompt')
    .addSeparator()
    .addItem('⚙️ Set Golf Data Year', 'configureGolfDataYear')
    .addSeparator()
    .addItem('📊 Run Validation (Choose Year)', 'runValidationWithYearPrompt')
    .addItem('📊 Run 2025 Validation', 'runValidation2025')
    .addItem('📊 Run 2026 Validation', 'runValidation2026')
    .addToUi();
}
