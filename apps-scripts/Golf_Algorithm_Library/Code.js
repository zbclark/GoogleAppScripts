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
 

// ===== MENU & SETUP =====
/**
 * Creates the custom menu when the sheet opens
 * NOTE: This MUST be in the bound script (not delegated to library) for simple trigger to work
 
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('‼️ Model Tools ‼️')
      .addItem('Setup Sheet Permissions', 'setupSheet')
      .addItem('Clear Config Settings', 'clearConfig')
      .addItem('Update Tournaments and Dropdowns', 'updateTournamentsAndDropdowns')
      .addSeparator()
      .addItem('⚙️ Load Weight Template', 'loadWeightTemplate')
      .addSeparator()
      .addItem('Update Tournament Field, Approach, and Historical Data Sheets', 'updateDataSheets')
      .addItem('Run Model', 'generatePlayerRankings')
      .addSeparator()
      .addSubMenu(ui.createMenu('📊 Tournament Results')
        .addItem('Fetch Current Results', 'fetchTournamentFinalResults')
        .addItem('Historical Analysis (Production)', 'fetchHistoricalTournamentResults')
        .addItem('Validate Current Tournament Sheet', 'validateTournamentSetup'))
      .addToUi();
    
    Logger.log('Menu created successfully');
  } catch (e) {
    Logger.log('Error creating menu: ' + e.toString());
    SpreadsheetApp.getActiveSpreadsheet().toast('Error creating menu: ' + e.toString(), 'Error', 10);
  }
  // First check if everything is already configured
  const isConfigured = PropertiesService.getScriptProperties().getProperty('IS_CONFIGURED') === 'true';
  console.log("Is sheet already configured?", isConfigured);

  const courseData = PropertiesService.getScriptProperties().getProperty('COURSE_EVENTS');
    
  // Skip setup if already configured
  if (isConfigured) {
    if (courseData){
      console.log("Sheet is already configured, skipping setup checks");
      return;
    }
  }
  
  try {
    
    // Mark as configured
    if (checkTriggersExist() && hasApiKey()) {
      console.log("Core settings configured, setting IS_CONFIGURED to true");
      PropertiesService.getScriptProperties().setProperty('IS_CONFIGURED', 'true');
    } else {
      console.log("Configuration incomplete. Triggers exist:", checkTriggersExist(), 
                  "API key exists:", hasApiKey(), 
                  "courseData exists:", courseData ? "yes" : "no");
    }    
  } catch (e) {
    console.error("Error in automatic setup:", e);
    SpreadsheetApp.getActive().toast(
      'Please run "Setup Sheet" from the Model Tools menu',
      '⚠️ Setup Needed',
      30
    );
  }
}

// ===== WRAPPERS NEEDED FOR MENU BUTTONS =====
function setupSheet() {
  GolfAlgorithmLibraryTEST.setupSheet();
}

function clearConfig() {
  GolfAlgorithmLibraryTEST.clearConfig();
}

// ===== DATA / SHEET ACTIONS =====
function loadWeightTemplate() {
  GolfAlgorithmLibraryTEST.loadWeightTemplate();
}
function updateTournamentsAndDropdowns() {
  GolfAlgorithmLibraryTEST.updateTournamentsAndDropdowns();
}

function onEditInstallableTrigger(e) {
  GolfAlgorithmLibraryTEST.onEditInstallableTrigger(e);
}

// ====== MODEL EXECUTION ======
function updateDataSheets() { 
  GolfAlgorithmLibraryTEST.updateDataSheets();
}

function generatePlayerRankings() {
  GolfAlgorithmLibraryTEST.generatePlayerRankings();
}

// ===== VALIDATION =====

function validateTournamentSetup() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    GolfAlgorithmLibraryTEST.analyzeSingleTournamentMetrics(ss);
    SpreadsheetApp.getUi().alert('Metric analysis sheet created successfully!');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.toString());
  }
}

// ===== TOURNAMENT RESULTS =====
function fetchTournamentFinalResults() {
  GolfAlgorithmLibraryTEST.fetchTournamentFinalResults();
}

function fetchHistoricalTournamentResults() {
  GolfAlgorithmLibraryTEST.fetchHistoricalTournamentResults();
}


*/
