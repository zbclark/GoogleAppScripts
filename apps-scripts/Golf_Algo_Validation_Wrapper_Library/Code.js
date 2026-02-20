/**
 * Wrapper script for Golf Algo Validation Library.
 * Provides bound-script entry points for menus and triggers.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🏌️ Golf Model Analysis')
    .addItem('🚀 Run Complete (Choose Year)', 'runCompleteModelAnalysisWithYearPrompt')
    .addToUi();
}

function runCompleteModelAnalysisWithYearPrompt() {
  return GolfAlgoValidation.runCompleteModelAnalysisWithYearPrompt();
}
