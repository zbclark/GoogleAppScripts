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
      .addItem('Validate Current Tournament Sheet', 'validateCurrentTournamentSheet')
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
  GolfAlgorithmLibraryTEST.onEditInstallableTrigger(e);
}

/**
 * Test function to verify library is connected properly
 * Run this manually from the script editor to test
 */
function testLibraryConnection() {
  try {
    SpreadsheetApp.getUi().alert('✓ Library is connected!\n\nThe GolfAlgorithmLibraryTEST library is working correctly.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('✗ Library connection failed:\n\n' + e.toString());
  }
}

function setupSheet() {
  GolfAlgorithmLibraryTEST.setupSheet();
}

function clearConfig() {
  GolfAlgorithmLibraryTEST.clearConfig();
}

function checkTriggersExist() {
  return GolfAlgorithmLibraryTEST.checkTriggersExist();
}

function authorizeScript() {
  GolfAlgorithmLibraryTEST.authorizeScript();
}

// ===== TEMPLATE LOADER =====
function loadWeightTemplate() {
  GolfAlgorithmLibraryTEST.loadWeightTemplate();
}

function showTemplateInfo() {
  GolfAlgorithmLibraryTEST.showTemplateInfo();
}

// ===== DATA FETCHING =====
function fetchAndWriteData() {
  GolfAlgorithmLibraryTEST.fetchAndWriteData();
}

function updateTournamentsAndDropdowns() {
  GolfAlgorithmLibraryTEST.updateTournamentsAndDropdowns();
}

// ===== MODEL EXECUTION =====
function generatePlayerRankings() {
  GolfAlgorithmLibraryTEST.generatePlayerRankings();
}

// ===== VALIDATION =====
function validatePredictions() {
  return GolfAlgorithmLibraryTEST.validatePredictions();
}

function validateLastTournament() {
  GolfAlgorithmLibraryTEST.validateLastTournament();
}

function checkPlayerDataQuality() {
  GolfAlgorithmLibraryTEST.checkPlayerDataQuality();
}

// ===== CONFIGURATION & COURSE SETUP =====
function getCourseNameAndNum() {
  return GolfAlgorithmLibraryTEST.getCourseNameAndNum();
}

function setCoursesDropdown() {
  GolfAlgorithmLibraryTEST.setCoursesDropdown();
}

function getUniqueCourses(eventId) {
  return GolfAlgorithmLibraryTEST.getUniqueCourses(eventId);
}

function setCourseDropdown(sheet, courses) {
  GolfAlgorithmLibraryTEST.setCourseDropdown(sheet, courses);
}

function updateCourseNumber(sheet) {
  GolfAlgorithmLibraryTEST.updateCourseNumber(sheet);
}

// ===== TOURNAMENT RESULTS =====
function fetchTournamentFinalResults() {
  GolfAlgorithmLibraryTEST.fetchTournamentFinalResults();
}

function fetchHistoricalTournamentResults() {
  GolfAlgorithmLibraryTEST.fetchHistoricalTournamentResults();
}

function fetchHistoricalTournamentResultsSandbox() {
  GolfAlgorithmLibraryTEST.fetchHistoricalTournamentResultsSandbox();
}

// ===== SHEET MANAGEMENT =====
function updateSheets() {
  GolfAlgorithmLibraryTEST.updateSheets();
}

function updateDataSheets() {
  GolfAlgorithmLibraryTEST.updateDataSheets();
}

function getCachedCourseData(maxAgeInDays) {
  return GolfAlgorithmLibraryTEST.getCachedCourseData(maxAgeInDays);
}

// ===== DEBUG FUNCTIONS =====
function debugCalculations() {
  GolfAlgorithmLibraryTEST.debugCalculations();
}

function debugSpecificEventPlayer() {
  GolfAlgorithmLibraryTEST.debugSpecificEventPlayer();
}

function debugFleetwoodValspar() {
  GolfAlgorithmLibraryTEST.debugFleetwoodValspar();
}

function debugHistoricalDataFlow() {
  GolfAlgorithmLibraryTEST.debugHistoricalDataFlow();
}

function removeProtections() {
  GolfAlgorithmLibraryTEST.removeProtections();
}

// ===== API KEY MANAGEMENT =====
function getApiKey() {
  return GolfAlgorithmLibraryTEST.getApiKey();
}

function setApiKey() {
  GolfAlgorithmLibraryTEST.setApiKey();
}

function hasApiKey() {
  return GolfAlgorithmLibraryTEST.hasApiKey();
}

// ===== UTILITY FUNCTIONS =====
function columnToLetter(column) {
  return GolfAlgorithmLibraryTEST.columnToLetter(column);
}

function getTourSelection() {
  return GolfAlgorithmLibraryTEST.getTourSelection();
}

/