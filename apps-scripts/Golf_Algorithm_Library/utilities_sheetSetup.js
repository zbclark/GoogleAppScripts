// Helper to robustly read G9 after async edits
function getG9WithRetry(sheet, retries = 5, delay = 500) {
  for (let i = 0; i < retries; i++) {
    const value = sheet.getRange("G9").getValue();
    if (value) return value;
    Utilities.sleep(delay);
  }
  return null;
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
  
  PropertiesService.getScriptProperties().deleteAllProperties(); // Clear existing properties for fresh setup
  
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

   // Mark as configured after setup is complete
  PropertiesService.getScriptProperties().setProperty('IS_CONFIGURED', 'true');
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

/**
 * Clears configuration fields while preserving formatting and validation
 */
function clearConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Configuration Sheet");
  const rankingSheet = ss.getSheetByName("Player Ranking Model");
  const resultsSheet = ss.getSheetByName("Tournament Results");
  const historicalDataSheet = ss.getSheetByName("Historical Data");
  const debugSheet = ss.getSheetByName("🔧 Debug - Calculations")
  
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
    "G16:Q24", 
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

  // 5. Clear Historical Results Sheet
  try {
    if (historicalDataSheet) {
      // Use fixed generous limits to ensure all data is cleared
      const lastRow = historicalDataSheet.getLastRow();
      const lastCol = historicalDataSheet.getLastColumn();
      const colsToClean = 50;   // Should cover all reasonable columns
      
      console.log(`Clearing Historical Data sheet.`);
      
      // Clear content and formatting
      const hisDataRange = resultsSheet.getRange(6, 2, lastRow, lastCol);
      hisDataRange.clear();
      
    } else {
      console.log("Historical Data sheet not found");
    }
  } catch (e) {
    console.error("Error clearing Historical Data sheet:", e);
  }

  // 6. Delete Debug Sheet
  try {
    if (debugSheet) {
      // Use fixed generous limits to ensure all data is cleared
      deleteSheet(debugSheet);
      
    } else {
      console.log("Debug sheet not found");
    }
  } catch (e) {
    console.error("Error deleting Debug sheet:", e);
  }
  
  // 7. Show confirmation to user
  ui.alert(
    '✅ Configuration & Other Data Cleared',
    'All configuration fields and sheet data have been reset successfully.',
    ui.ButtonSet.OK
  );
  
  console.log("Configuration and sheet data cleared successfully");
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
    console.log("COURSE_EVENTS property exists:", courseEventData.substring(0, 100) + "...");
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

async function onEditInstallableTrigger(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== CONFIG_SHEET) return;

  const statusCell = sheet.getRange("E10");
  const dropdownCell = sheet.getRange("F10");
  const eventIdCell = sheet.getRange("G9");
  const courseIdCell = sheet.getRange("G10");
  const similarCourses = sheet.getRange("F33:F37");
  const similarCourseIds = sheet.getRange("G33:G37");
  const similarPutting = sheet.getRange("F40:F44");
  const similarPuttingIds = sheet.getRange("G40:G44");

  // Handle F9 edits (course dropdown cell)
  if (range.getA1Notation() === "F9") {
       
    try {
      dropdownCell.setValue("");
      courseIdCell.clearContent();

      statusCell.setValue("🔄 Fetching courses...").setBackground("#FFF2CC");
      SpreadsheetApp.flush();

      // Use robust retry logic to get G9
      const eventId = getG9WithRetry(sheet);
      Logger.log("Event ID from G9 (with retry):", eventId);
      if (!eventId) {
        statusCell.setValue("❌ G9 not set").setBackground("#FFEBE6");
        throw new Error("G9 is empty after retries");
      }

      // Pass status cell to course fetcher
      const courses = getUniqueCourses(eventId);

      // Dropdown setup
      statusCell.setValue("🔄 Building dropdown...");
      SpreadsheetApp.flush(); // Show intermediate state)
      
      // Final UI updates
      statusCell.setValue("🔄 Preparing dropdown...");
      SpreadsheetApp.flush();
      
      await setCourseDropdown(sheet, courses);
      SpreadsheetApp.flush();
      
      Utilities.sleep(1500);
      SpreadsheetApp.flush();
      
      statusCell.setValue("✅ Course").setBackground(null);
      SpreadsheetApp.flush();

    } catch (e) {
      statusCell.setValue("❌ Error: " + e.message).setBackground("#FFEBE6");
      dropdownCell.setDataValidation(null);
      throw e;
    }
  }

  // Handle Similar Course dropdown or Putting-Specific Course dropdown
  if ((range.getColumn() === 6 && range.getRow() >= 33 && range.getRow() <= 37) || 
      (range.getColumn() === 6 && range.getRow() >= 40 && range.getRow() <= 44)) {
    
    try {
      // Indicate we're processing
      const tempStatus = sheet.getRange("E" + range.getRow());
      tempStatus.setValue("🔄").setBackground("#FFF2CC");
      SpreadsheetApp.flush();
      
      // Get the selected course value
      const selectedValue = range.getValue();
      console.log(`Selected course: "${selectedValue}" in cell ${range.getA1Notation()}`);
      
      // Get course data from script properties
      let courses = [];
      try {
        const courseData = PropertiesService.getScriptProperties().getProperty('COURSE_EVENTS');
        console.log(`Raw COURSE_EVENTS data: ${courseData ? courseData.substring(0, 100) + "..." : "null or empty"}`);
        
        if (courseData) {
          courses = JSON.parse(courseData);
          console.log(`Parsed ${courses.length} courses from script properties`);
        } else {
          console.error("No course data found in script properties");
        }
      } catch (parseError) {
         console.log(`Error parsing: ${parseError}`);
      }
      
      // Find the matching course
      let found = false;
      if (selectedValue && courses.length > 0) {
        // Log a few courses to help debug
        console.log("First few courses in data:");
        courses.slice(0, 3).forEach((c, i) => {
          console.log(`Course ${i+1}: display="${c.display}", eventIds=${JSON.stringify(c.eventIds)}`);
        });
        
        // Try exact match first
        const course = courses.find(c => c.display === selectedValue);
        
        if (course) {
          console.log(`Found exact match for "${selectedValue}": ${JSON.stringify(course)}`);
          
          // Clear existing content in the adjacent cell
          const idCell = sheet.getRange(range.getRow(), range.getColumn() + 1);
          idCell.clearContent();
          
          // Set the event IDs (comma-separated if multiple)
          const eventIds = course.eventIds.join(", ");
          idCell.setValue(eventIds);
          console.log(`Updated cell ${idCell.getA1Notation()} with value: ${eventIds}`);
          
          found = true;
        } else {
          // If no exact match, try partial match (fuzzy matching)
          console.log(`No exact match found for "${selectedValue}", trying partial match...`);
          
          const partialMatch = courses.find(c => 
            selectedValue && c.display && 
            (c.display.includes(selectedValue) || selectedValue.includes(c.display))
          );
          
          if (partialMatch) {
            console.log(`Found partial match: "${partialMatch.display}"`);
            
            // Clear and update adjacent cell
            const idCell = sheet.getRange(range.getRow(), range.getColumn() + 1);
            idCell.clearContent();
            const eventIds = partialMatch.eventIds.join(", ");
            idCell.setValue(eventIds);
            console.log(`Updated cell ${idCell.getA1Notation()} with value: ${eventIds}`);
            
            found = true;
          }
        }
      }
      
      if (!found) {
        console.error(`No match found for "${selectedValue}" among ${courses.length} courses`);
        // Clear the adjacent cell as we couldn't find a match
        sheet.getRange(range.getRow(), range.getColumn() + 1).clearContent();
      }
      
      // Update status indicator
      tempStatus.setValue(found ? "✅" : "⚠️").setBackground(null);
      SpreadsheetApp.flush();
      
      // Clear status after a delay
      Utilities.sleep(1500);
      tempStatus.clearContent();
      SpreadsheetApp.flush();
      
    } catch (error) {
      console.error(`Error updating event ID: ${error.toString()}`);
      sheet.getRange("E" + range.getRow()).setValue("❌").setBackground("#FFEBE6");
      SpreadsheetApp.flush();
    }
  }

  // Handle F10 edits (course selection)
  if (range.getA1Notation() === "F10") {
    const statusCell = sheet.getRange("E10");
    const courseIdCell = sheet.getRange("G10");
    
    try {
      // Show processing status
      statusCell.setValue("🔄 Updating course ID...").setBackground("#FFF2CC");
      courseIdCell.setValue("");
      SpreadsheetApp.flush();

      // Update course ID
      await updateCourseNumber(sheet);
      statusCell.setValue("✅ Course").setBackground(null);
      SpreadsheetApp.flush();

    } catch (e) {
      statusCell.setValue("❌ Error: " + e.message).setBackground("#FFEBE6");
      courseIdCell.setValue("");
      throw e;
    }
  }
}

function removeProtections() {
  var sheet = SpreadsheetApp.getActiveSheet();
  
   // Remove any existing protections on the sheet
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var i = 0; i < protections.length; i++) {
    protections[i].remove();
  }
  
  var rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  for (var i = 0; i < rangeProtections.length; i++) {
    rangeProtections[i].remove();
  }
  
  console.log("All protections removed");
}

function clearAndSetHistoricalTrigger() {
  // Remove existing triggers for updateHistoricalDataFromButton
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'updateHistoricalDataFromButton') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('updateHistoricalDataFromButton')
    .timeBased()
    .after(60 * 1000)
    .create();
}