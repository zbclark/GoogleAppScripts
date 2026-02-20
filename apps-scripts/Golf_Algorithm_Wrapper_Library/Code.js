/**
 * Golf Algorithm Wrapper Library
 *
 * NOTE: This library does NOT run triggers. Your bound script must call
 * wrapper functions from its onOpen/onEdit handlers.
 */

// ===== MENU & SETUP =====
function buildMenu() {
  const ui = SpreadsheetApp.getUi();
  const modelToolsMenu = ui.createMenu('🛠️ Model Tools')
    .addItem('⚖️ Load Weight Template', 'loadWeightTemplate')
    .addItem('⛳️ Update Tournament Field & Approach Sheets', 'updateDataSheets')
    .addItem('📜 Update Historical Data', 'updateHistoricalDataFromButton')
    .addItem('📈 Run Model', 'generatePlayerRankings');

  const resultsMenu = ui.createMenu('📊 Tournament Results')
    .addItem('📊 Fetch Historical Tournament Results', 'fetchHistoricalTournamentResults')
    .addItem('✅ Validate Current Tournament Sheet', 'validateTournamentSetup');

  ui.createMenu('‼️ Model Tools ‼️')
    .addItem('⚙️ Setup Sheet Permissions', 'setupSheet')
    .addItem('⚙️ Clear Config Settings', 'clearConfig')
    .addItem('⚙️ Update Tournaments and Dropdowns', 'updateTournamentsAndDropdowns')
    .addSeparator()
    .addSubMenu(modelToolsMenu)
    .addSeparator()
    .addSubMenu(resultsMenu)
    .addSeparator()
    .addItem('🐞 Debug Logging…', 'showDebugLoggingDialog')
    .addToUi();
}

function runAutoSetupCheck() {
  const docProps = PropertiesService.getDocumentProperties();
  const isConfigured = docProps.getProperty('IS_CONFIGURED') === 'true';
  const courseData = PropertiesService.getScriptProperties().getProperty('COURSE_EVENTS');

  if (isConfigured && courseData) return;

  if (checkTriggersExist() && hasApiKey()) {
    docProps.setProperty('IS_CONFIGURED', 'true');
  }
}

// ===== DEBUG LOGGING DIALOG =====
function showDebugLoggingDialog() {
  const html = HtmlService.createHtmlOutputFromFile('DebugLoggingDialog')
    .setWidth(420)
    .setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, 'Debug Logging');
}

function getDebugLoggingSettings() {
  return GolfAlgorithm.getDebugLoggingSettings();
}

function setDebugLoggingSettings(enabled) {
  return GolfAlgorithm.setDebugLoggingSettings(enabled);
}

function setDebugLoggingPreferences(settings) {
  return GolfAlgorithm.setDebugLoggingPreferences(settings);
}

// ===== WRAPPERS =====
function checkTriggersExist() {
  return GolfAlgorithm.checkTriggersExist();
}

function hasApiKey() {
  return GolfAlgorithm.hasApiKey();
}

function setupSheet() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.setupSheet();
}

function clearConfig() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.clearConfig();
}

function updateHistoricalDataFromButton() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.updateHistoricalDataFromMenu();
}

function resumeHistoricalDataUpdate() {
  return GolfAlgorithm.resumeHistoricalDataUpdate();
}

function loadWeightTemplate() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.loadWeightTemplate();
}

function updateTournamentsAndDropdowns() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.updateTournamentsAndDropdowns();
}

function onEditInstallableTrigger(e) {
  return GolfAlgorithm.onEditInstallableTrigger(e);
}

function updateDataSheets() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.updateDataSheets();
}

function generatePlayerRankings() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.generatePlayerRankings();
}

function validateTournamentSetup() {
  GolfAlgorithm.markDebugLogsForReset();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return GolfAlgorithm.analyzeSingleTournamentMetrics(ss);
}

function fetchTournamentFinalResults() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.fetchTournamentFinalResults();
}

function fetchHistoricalTournamentResults() {
  GolfAlgorithm.markDebugLogsForReset();
  return GolfAlgorithm.fetchHistoricalTournamentResults();
}
