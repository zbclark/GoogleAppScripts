/**
 * Tracking Sheet Menu Setup
 * Opens menu for validation functions
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('🏌️ Golf Model Analysis')
    .addItem('🚀 Run Complete Model Analysis', 'runCompleteModelAnalysis')
    .addSeparator()
    .addItem('Run 2025 Validation', 'runValidation2025')
    .addItem('Run 2026 Validation', 'runValidation2026')
    .addToUi();
  
  console.log("Menu added");
}
