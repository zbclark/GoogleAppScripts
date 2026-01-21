/**
 * BOUND SCRIPT WRAPPER
 * 
 * This is the ONLY code you need in your weekly sheet's bound script.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Extensions > Apps Script
 * 3. DELETE all existing .js/.gs files in the bound script editor
 * 4. Create ONE new file called "Code.js" (or any name)
 * 5. Copy/paste this ENTIRE file into it
 * 6. Make sure you've added the library (see LIBRARY_SETUP.md)
 * 
 * That's it! All the real code lives in the library.
 * When you copy the sheet next week, just re-add the library reference.
 */

// ===== MENU & SETUP =====
/**
 * Creates the custom menu when the sheet opens
 * NOTE: This MUST be in the bound script (not delegated to library) for simple trigger to work
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('‼️ Model Tools ‼️')
      .addItem('Clear Config Settings', 'clearConfig')
      .addItem('Setup Sheet Permissions', 'setupSheet')
      .addItem('Update Tournaments and Dropdowns', 'updateTournamentsAndDropdowns')
      .addSeparator()
      .addItem('⚙️ Load Weight Template', 'loadWeightTemplate')
      .addItem('📋 Show Templates', 'showTemplateInfo')
      .addSeparator()
      .addItem('Run Model', 'generatePlayerRankings')
      .addSeparator()
      .addSubMenu(ui.createMenu('📊 Tournament Results')
        .addItem('Fetch Current Results', 'fetchTournamentFinalResults')
        .addItem('🧪 Historical Analysis (Sandbox)', 'fetchHistoricalTournamentResultsSandbox')
        .addItem('Historical Analysis (Production)', 'fetchHistoricalTournamentResults'))
      .addSeparator()
      .addItem('🧪 Test Library Connection', 'testLibraryConnection')
      .addToUi();
    
    Logger.log('Menu created successfully');
  } catch (e) {
    Logger.log('Error creating menu: ' + e.toString());
    SpreadsheetApp.getActiveSpreadsheet().toast('Error creating menu: ' + e.toString(), 'Error', 10);
  }
}

/**
 * Installable onEdit trigger handler
 * NOTE: This MUST be in the bound script for installable triggers to work
 */
function onEditInstallableTrigger(e) {
  GolfAlgorithm.onEditInstallableTrigger(e);
}

/**
 * Test function to verify library is connected properly
 * Run this manually from the script editor to test
 */
function testLibraryConnection() {
  try {
    SpreadsheetApp.getUi().alert('✓ Library is connected!\n\nThe GolfAlgorithm library is working correctly.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('✗ Library connection failed:\n\n' + e.toString());
  }
}

function setupSheet() {
  GolfAlgorithm.setupSheet();
}

function clearConfig() {
  GolfAlgorithm.clearConfig();
}

function checkTriggersExist() {
  return GolfAlgorithm.checkTriggersExist();
}

function authorizeScript() {
  GolfAlgorithm.authorizeScript();
}

// ===== TEMPLATE LOADER =====
function loadWeightTemplate() {
  GolfAlgorithm.loadWeightTemplate();
}

function showTemplateInfo() {
  GolfAlgorithm.showTemplateInfo();
}

// ===== DATA FETCHING =====
function fetchAndWriteData() {
  GolfAlgorithm.fetchAndWriteData();
}

function updateTournamentsAndDropdowns() {
  GolfAlgorithm.updateTournamentsAndDropdowns();
}

// ===== MODEL EXECUTION =====
function generatePlayerRankings() {
  GolfAlgorithm.generatePlayerRankings();
}

// ===== VALIDATION =====
function validatePredictions() {
  return GolfAlgorithm.validatePredictions();
}

function validateLastTournament() {
  GolfAlgorithm.validateLastTournament();
}

function checkPlayerDataQuality() {
  GolfAlgorithm.checkPlayerDataQuality();
}

// ===== CONFIGURATION & COURSE SETUP =====
function getCourseNameAndNum() {
  return GolfAlgorithm.getCourseNameAndNum();
}

function setCoursesDropdown() {
  GolfAlgorithm.setCoursesDropdown();
}

function getUniqueCourses(eventId) {
  return GolfAlgorithm.getUniqueCourses(eventId);
}

function setCourseDropdown(sheet, courses) {
  GolfAlgorithm.setCourseDropdown(sheet, courses);
}

function updateCourseNumber(sheet) {
  GolfAlgorithm.updateCourseNumber(sheet);
}

// ===== TOURNAMENT RESULTS =====
function fetchTournamentFinalResults() {
  GolfAlgorithm.fetchTournamentFinalResults();
}

function fetchHistoricalTournamentResults() {
  GolfAlgorithm.fetchHistoricalTournamentResults();
}

function fetchHistoricalTournamentResultsSandbox() {
  GolfAlgorithm.fetchHistoricalTournamentResultsSandbox();
}

// ===== SHEET MANAGEMENT =====
function updateSheets() {
  GolfAlgorithm.updateSheets();
}

function updateDataSheets() {
  GolfAlgorithm.updateDataSheets();
}

function getCachedCourseData(maxAgeInDays) {
  return GolfAlgorithm.getCachedCourseData(maxAgeInDays);
}

// ===== DEBUG FUNCTIONS =====
function debugCalculations() {
  GolfAlgorithm.debugCalculations();
}

function debugSpecificEventPlayer() {
  GolfAlgorithm.debugSpecificEventPlayer();
}

function debugFleetwoodValspar() {
  GolfAlgorithm.debugFleetwoodValspar();
}

function debugHistoricalDataFlow() {
  GolfAlgorithm.debugHistoricalDataFlow();
}

function removeProtections() {
  GolfAlgorithm.removeProtections();
}

// ===== API KEY MANAGEMENT =====
function getApiKey() {
  return GolfAlgorithm.getApiKey();
}

function setApiKey() {
  GolfAlgorithm.setApiKey();
}

function hasApiKey() {
  return GolfAlgorithm.hasApiKey();
}

// ===== UTILITY FUNCTIONS =====
function columnToLetter(column) {
  return GolfAlgorithm.columnToLetter(column);
}

function getTourSelection() {
  return GolfAlgorithm.getTourSelection();
}
