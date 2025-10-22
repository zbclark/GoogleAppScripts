function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('‼️ Model Tools ‼️')
    .addItem('Clear Config Settings', 'clearConfig')
    .addItem('Setup Sheet Permissions', 'setupSheet')
    .addItem('Update Tournaments and Dropdowns', 'updateTournamentsAndDropdowns')
    .addToUi();
  
  console.log("Added Model Tools menu");

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
    
    setupSheet();
    
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



/**
 * Checks if the required triggers already exist
 * @return {boolean} True if triggers exist, false if they need to be created
 */
function checkTriggersExist() {
  const triggers = ScriptApp.getProjectTriggers();
  let hasEditTrigger = false;
  
  // Check for existing onEdit trigger
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditInstallableTrigger' && 
        triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT) {
      hasEditTrigger = true;
      break;
    }
  }
  
  return hasEditTrigger;
}

function setupSheet() {
  const ui = SpreadsheetApp.getUi();
  
  // Check if triggers already exist
  if (checkTriggersExist()) {
    ui.alert(
      '✅ Triggers Already Set Up',
      'The necessary triggers are already installed for this spreadsheet.',
      ui.ButtonSet.OK
    );
  } else {
    // Confirm with user
    const response = ui.alert(
      '⚠️ Set Up Triggers',
      'This will set up automatic triggers for spreadsheet editing. You may need to authorize permissions. Continue?',
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) {
      console.log("User canceled trigger setup");
      return;
    }
    
    try {
      // Delete any existing triggers first to avoid duplicates
      const triggers = ScriptApp.getProjectTriggers();
      for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'onEditInstallableTrigger') {
          ScriptApp.deleteTrigger(triggers[i]);
        }
      }
      
      // Create a new installable onEdit trigger
      ScriptApp.newTrigger('onEditInstallableTrigger')
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onEdit()
        .create();
      
      console.log("Successfully created onEditInstallableTrigger trigger");
      
      ui.alert(
        '✅ Triggers Set Up Successfully',
        'The spreadsheet will now respond automatically to edits.',
        ui.ButtonSet.OK
      );
    } catch (e) {
      console.error("Error setting up triggers:", e);
      ui.alert(
        '❌ Error Setting Up Triggers',
        'There was a problem: ' + e.message + '\n\nPlease try again or contact support.',
        ui.ButtonSet.OK
      );
      return; // Exit if trigger setup failed
    }
  }
  
  // Now check and set API key if needed
  if (!hasApiKey()) {
    console.log("Setting API key...");
    
    try {
      setApiKey();
      ui.alert(
        '✅ API Key Configured',
        'Your API key has been set up successfully.',
        ui.ButtonSet.OK
      );
    } catch (e) {
      console.error("Error setting API key:", e);
      ui.alert(
        '⚠️ API Key Setup Issue',
        'There was a problem setting up the API key: ' + e.message,
        ui.ButtonSet.OK
      );
    }
  } else {
    console.log("API key already exists");
    ui.alert(
      '✅ API Key Already Set',
      'Your API key is already configured.',
      ui.ButtonSet.OK
    );
  }

  updateTournamentsAndDropdowns();
  
  // Mark as configured after setup is complete
  PropertiesService.getScriptProperties().setProperty('IS_CONFIGURED', 'true');
}


/**
 * Clears configuration fields while preserving formatting and validation
 */
function clearConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Configuration Sheet");
  const rankingSheet = ss.getSheetByName("Player Ranking Model");
  const resultsSheet = ss.getSheetByName("Tournament Results");
  
  // Confirm action with user
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Clear Configuration',
    'This will reset all configuration fields. Are you sure you want to continue?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    console.log("User canceled Clear Config operation");
    return;
  }
  
  console.log("Clearing configuration fields...");
  
  // 1. Clear content from specified ranges
  const rangesToClear = [
    "G16:P24", 
    "G27", 
    "G33:G37", 
    "G40:G44", 
    "H33", 
    "H40"
  ];
  
  rangesToClear.forEach(rangeA1 => {
    console.log(`Clearing content from Configuration Sheet, range: ${rangeA1}`);
    const configRange = configSheet.getRange(rangeA1);
    configRange.clearContent();
  });

  const rangesToClearTournaments = [
    "C2:C4",
    "F2:F4"
  ];

  rangesToClearTournaments.forEach(rangeA1 => {
    console.log(`Clearing content from Tournament Results sheet, range: ${rangeA1}`);
    const tournamentRange = resultsSheet.getRange(rangeA1);
    tournamentRange.clearContent();
  });
  
  // 2. Reset dropdown selections without removing validation
  const dropdownRanges = [
    "F9:F10", 
    "F27", 
    "F29", 
    "F33:F37", 
    "F40:F44"
  ];
  
  dropdownRanges.forEach(rangeA1 => {
    console.log(`Resetting dropdown selection in range: ${rangeA1}`);
    const range = configSheet.getRange(rangeA1);
    
    // Get the current validation
    const currentValidation = range.getDataValidation();
    
    if (currentValidation) {
      // Clear content first
      range.clearContent();
    } else {
      console.log(`Warning: No validation found in ${rangeA1}`);
      range.clearContent();
    }
  });
  
   // 3. Clear Player Ranking Model sheet - use fixed row and column counts
  try {
    if (rankingSheet) {
      // Use fixed generous limits to ensure all data is cleared
      const rowsToClean = 1000; // Should cover all reasonable data
      const colsToClean = 50;   // Should cover all reasonable columns
      
      console.log(`Clearing Player Ranking Model sheet from A6:${columnToLetter(colsToClean)}${6 + rowsToClean}`);
      
      // Clear content and formatting
      const rankingRange = rankingSheet.getRange(6, 1, rowsToClean, colsToClean);
      rankingRange.clear();
      
      // Explicitly set white background
      rankingRange.setBackground("#ffffff");
      rankingRange.setFontColor("#000000");
      rankingRange.setFontWeight("normal");
      
      // Remove all conditional formatting rules from the entire sheet
      rankingSheet.setConditionalFormatRules([]);
      console.log("Removed conditional formatting rules from Player Ranking Model");
      
      // Apply default formatting
      rankingRange.setBorder(false, false, false, false, false, false);
      rankingRange.setHorizontalAlignment("left");
      rankingRange.setVerticalAlignment("middle");
    } else {
      console.log("Player Ranking Model sheet not found");
    }
  } catch (e) {
    console.error("Error clearing Player Ranking Model sheet:", e);
  }
  
  // 4. Clear Tournament Results sheet - use fixed row and column counts
  try {
    if (resultsSheet) {
      // Use fixed generous limits to ensure all data is cleared
      const rowsToClean = 1000; // Should cover all reasonable data
      const colsToClean = 50;   // Should cover all reasonable columns
      
      console.log(`Clearing Tournament Results sheet from A6:${columnToLetter(colsToClean)}${6 + rowsToClean}`);
      
      // Clear content and formatting
      const resultsRange = resultsSheet.getRange(6, 1, rowsToClean, colsToClean);
      resultsRange.clear();
      
      // Explicitly set white background
      resultsRange.setBackground("#ffffff");
      resultsRange.setFontColor("#000000");
      resultsRange.setFontWeight("normal");
      
      // Remove all conditional formatting rules from the entire sheet
      resultsSheet.setConditionalFormatRules([]);
      console.log("Removed conditional formatting rules from Tournament Results");
      
      // Apply default formatting
      resultsRange.setBorder(false, false, false, false, false, false);
      resultsRange.setHorizontalAlignment("left");
      resultsRange.setVerticalAlignment("middle");
    } else {
      console.log("Tournament Results sheet not found");
    }
  } catch (e) {
    console.error("Error clearing Tournament Results sheet:", e);
  }
  
  // 5. Show confirmation to user
  ui.alert(
    '✅ Configuration & Other Data Cleared',
    'All configuration fields and sheet data have been reset successfully.',
    ui.ButtonSet.OK
  );
  
  console.log("Configuration and sheet data cleared successfully");
}


/**
 * Converts a column number to a column letter (e.g., 1 -> A, 27 -> AA)
 * @param {number} column - The column number to convert
 * @return {string} The column letter(s)
 */
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

/**
 * Retrieves the stored API Key from Script Properties.
 * @return {string|null} - The stored API key or null if not set.
 */
function getApiKey() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = scriptProperties.getProperty('API_KEY');
  return apiKey; // Simply return the key or null, don't throw an error
}

/**
 * Sets the API Key securely using Script Properties.
 */
function setApiKey() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = '764c0376abb1182965e53df33338'; // Your API key
  scriptProperties.setProperty('API_KEY', apiKey);
  console.log("API key set successfully.");
  return true;
}

/**
 * Checks if an API key is already set
 * @return {boolean} True if API key exists
 */
function hasApiKey() {
  const apiKey = getApiKey();
  return apiKey != null && apiKey !== '';
}

function updateTournamentsAndDropdowns() {

  courseEventData = PropertiesService.getScriptProperties().getProperty('COURSE_EVENTS');
  const ui = SpreadsheetApp.getUi();
  
  if (courseEventData) {
    // Course events data exists, alert the user
    ui.alert(
      '✅ Course Events Data Found',
      'Course events data is already configured in this spreadsheet.',
      ui.ButtonSet.OK
    );
    console.log("COURSE_EVENTS property exists:", courseData.substring(0, 100) + "...");
    return true;
  }

  // Initialize all statuses
  const sheets = [
    "Similar Courses",
    "ALL Tournaments",
    "PGA Tournaments",
  ];
 
  sheets.forEach(sheet => updateCentralStatus(sheet, "Pending start..."));

  // Sequential execution using promises
  return updateTournamentsDataFromButton()
    .then(() => getCourseNameAndNum())
    .then(() => setSimilarCourseDropdowns())
    .catch(error => {
      console.error("Update failed:", error);
      updateCentralStatus("SYSTEM", `Error: ${error.message}`);
      throw error; // Preserve error stack
    });
}


function authorizeScript() {
  // This function's sole purpose is to trigger authorization
  const triggers = ScriptApp.getProjectTriggers();
  console.log("Current triggers:", triggers.length);
  
  // Show a message to the user
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Authorization Successful',
    'The script has been authorized to manage triggers.',
    ui.ButtonSet.OK
  );
}

