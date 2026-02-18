/**
 * Golf Algo Validation Wrapper Library
 *
 * NOTE: This library does NOT run triggers. Your bound script must call
 * wrapper functions from its onOpen handler.
 */

function buildMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏌️ Golf Model Analysis')
    .addItem('🚀 Run Complete (Choose Year)', 'runCompleteModelAnalysisWithYearPrompt')
    .addToUi();
}

function runCompleteModelAnalysisWithYearPrompt() {
  return GolfAlgoValidation.runCompleteModelAnalysisWithYearPrompt();
}
