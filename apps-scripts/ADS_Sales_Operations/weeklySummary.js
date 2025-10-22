function setupTrigger() {
  ScriptApp.newTrigger('extractAndCompareData')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(13).nearMinute(45) // At 1:45 PM CT
    .inTimezone("America/Chicago")
    .create();
}

function extractAndStoreData() {
  var data = extractData();
  if (!data || !data.activeData || !data.lostData) {
    Logger.log("Data extraction failed or returned incomplete data structures.");
    return;
  }

  Logger.log("Data to be logged: data.activeData - " + JSON.stringify(data.activeData).substring(0, 500));
  logDataInSheet(data.activeData, 'Log Sheet', 'data.activeData'); 
  Logger.log("data.activeData written to 'Log Sheet'.");
  
  Logger.log("Data to be logged: data.lostData - " + JSON.stringify(data.lostData).substring(0, 500));
  logDataInSheet(data.lostData, 'Log Sheet', 'data.lostData'); 
  Logger.log("data.lostData written to 'Log Sheet'.");

  var jsonData = JSON.stringify(data);
  if (jsonData.length >= 500000) {
    Logger.log("Warning: Data size approaching limit for Properties Service.");
  }
  PropertiesService.getScriptProperties().setProperty('snapshotData', jsonData); 
}

function extractAndCompareData() {
  var lastSnapshot = PropertiesService.getScriptProperties().getProperty('snapshotData');

  if (!lastSnapshot) {
    Logger.log("No snapshot data available.");
    return;
  }

  lastSnapshot = JSON.parse(lastSnapshot);
  const isValidSnapshotData = lastSnapshot && typeof lastSnapshot === 'object' && lastSnapshot.activeData && lastSnapshot.lostData;

  if (!isValidSnapshotData) {
    Logger.log("Error: Last Snapshot data structure is incorrect or missing.");
    Logger.log(`lastSnapshot: ${JSON.stringify(lastSnapshot).substring(0, 500)}`);
    return;
  }

  Logger.log("Data to be logged: lastSnapshot.activeData - " + JSON.stringify(lastSnapshot.activeData).substring(0, 500));
  logDataInSheet(lastSnapshot.activeData, 'Log Sheet', 'lastSnapshot.activeData');
  Logger.log("lastSnapshot.activeData written to 'Log Sheet'");

  Logger.log("Data to be logged: lastSnapshot.lostData - " + JSON.stringify(lastSnapshot.lostData).substring(0, 500));
  logDataInSheet(lastSnapshot.lostData, 'Log Sheet', 'lastSnapshot.lostData');
  Logger.log("lastSnapshot.lostData written to 'Log Sheet'");

  var currentData = extractData();
  const isValidCurrentData = currentData && typeof currentData === 'object' && currentData.activeData && currentData.lostData;

  if (!isValidCurrentData) {
    Logger.log("Error: Current data structure is incorrect or missing.");
    Logger.log(`currentData: ${JSON.stringify(currentData).substring(0, 500)}`);
    return;
  }

  Logger.log("Data to be logged: currentData.activeData - " + JSON.stringify(currentData.activeData).substring(0, 500));
  logDataInSheet(currentData.activeData, 'Log Sheet', 'currentData.activeData');
  Logger.log("currentData.activeData written to 'Log Sheet'");

  Logger.log("Data to be logged: currentData.lostData - " + JSON.stringify(currentData.lostData).substring(0, 500));
  logDataInSheet(currentData.lostData, 'Log Sheet', 'currentData.lostData');
  Logger.log("currentData.lostData written to 'Log Sheet'");

  let essentialLastSnapshot = {activeData: {...lastSnapshot.activeData}, lostData: {...lastSnapshot.lostData}};
  let essentialCurrentData = {activeData: {...currentData.activeData}, lostData: {...currentData.lostData}};

  Logger.log("Essentials prepared. Last Snapshot Active Data and Lost Data.");
  Logger.log("Essentials prepared. Current Data Active Data and Lost Data.");
  Logger.log("About to call extractNewProposalsByIndustry and extractNewLostProjects.");

  const newProposalsByIndustry = extractNewProposalsByIndustry(essentialCurrentData.activeData, essentialLastSnapshot.activeData);
  logDataInSheet(newProposalsByIndustry, 'Log Sheet', 'New Proposals by Industry');

  const newLostProjects = extractNewLostProjects(essentialCurrentData.lostData, essentialLastSnapshot.lostData);
  logDataInSheet(newLostProjects, 'Log Sheet', 'New Lost Projects');

  if (!newLostProjects || Object.keys(newLostProjects).length === 0) {
    Logger.log("No new lost projects to write.");
  } else {
    writeClosedLostToSheet(newLostProjects, 'Weekly Summary');
  }

  var comparisonResults = (lastSnapshot && currentData)
       ? compareData(lastSnapshot.activeData, currentData.activeData)
       : { closedWon: [], stuckProjects: [] };

  Logger.log("Data to be logged: Stuck Projects - " + JSON.stringify(comparisonResults.stuckProjects).substring(0, 500));
  logDataInSheet(comparisonResults.stuckProjects, 'Log Sheet', 'comparisonResults.stuckProjects');
  Logger.log("Stuck Projects written to 'Log Sheet'");

  Logger.log("Data to be logged: Closed Won Projects - " + JSON.stringify(comparisonResults.closedWon).substring(0, 500));
  logDataInSheet(comparisonResults.closedWon, 'Log Sheet', 'comparisonResults.closedWon');
  Logger.log("Closed Won Projects written to 'Log Sheet'");

  var closedWonProjects = sortClosedWonProjects(comparisonResults.closedWon);
  Logger.log("Stuck Projects (sorted): " + JSON.stringify(comparisonResults.stuckProjects).substring(0, 500));
  Logger.log("New Proposals by Industry: " + JSON.stringify(newProposalsByIndustry).substring(0, 500));
  Logger.log("New Closed-WON by Industry: " + JSON.stringify(closedWonProjects).substring(0, 500));
  Logger.log("New Lost Projects: " + JSON.stringify(newLostProjects).substring(0, 500));

  writeNewProposalsByIndustryToSheet(newProposalsByIndustry, 'Weekly Summary');
  writeStuckProjectsToSheet(comparisonResults.stuckProjects, 'Weekly Summary', 5, 9);
  writeClosedWonProjectsToSheet(comparisonResults.closedWon, 'Weekly Summary');
  writeClosedWonSummaryToSheet(closedWonProjects, 'Weekly Summary');

  PropertiesService.getScriptProperties().setProperty('snapshotData', JSON.stringify(currentData));
  Logger.log("Updated snapshotData with currentData.");
}

// Constants for column indices based on 0-index
const CLIENT_COL = 1; 
const INDUSTRY_COL = 2; 
const PROP_NUM_COL = 3; 
const WO_NUM_COL = 4; 
const PROJ_NAME_COL = 5; 
const PROP_AMOUNT_COL = 6; 
const AMT_REM_TO_INV_COL = 8; 
const STATUS_COL = 11;
const PROD_STAGE_COL = 12; 
const COMP_PERC_COL = 13; 
const NOTES_COL = 14; 
const NOTES_COL2 = 15;
const LOST_PROJ_NAME_COL = 4; 
const LOST_PROJ_STATUS_COL = 5;
const LOST_PROJ_NOTES_COL = 6;

function extractData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getSheetByName('Project/Proposal Details');
  const lostProjSheet = ss.getSheetByName('Lost Projects');

  let activeData = extractActiveData(activeSheet);
  let lostData = extractLostData(lostProjSheet);

  return {
    activeData: activeData,
    lostData: lostData
  };
}

function extractActiveData(sheet) {
  const range = sheet.getRange(3, 1, sheet.getLastRow() - 2, sheet.getLastColumn()).getValues();

  let activeData = {}; 
  range.forEach(row => {
    if (row[PROP_NUM_COL]) { // Ensure there's a valid proposal number
      // Identify this proposal
      var proposalNumber = row[PROP_NUM_COL];
      
      // Retrieve the stored date/time (or default to some older date if none exists)
      var lastUpdatedProp = PropertiesService.getScriptProperties()
        .getProperty("lastUpdated_" + proposalNumber);
      var lastUpdatedDate = lastUpdatedProp 
        ? new Date(lastUpdatedProp) 
        : new Date("2020-01-01T00:00:00Z");
      
      activeData[proposalNumber] = {
        client: row[CLIENT_COL],
        industry: row[INDUSTRY_COL],
        proposalNumber: proposalNumber,
        woNumber: row[WO_NUM_COL],
        projectName: row[PROJ_NAME_COL],
        proposalAmount: row[PROP_AMOUNT_COL],
        amountRemainingToInvoice: row[AMT_REM_TO_INV_COL],
        status: row[STATUS_COL],
        productionStage: row[PROD_STAGE_COL],
        completionPercentage: row[COMP_PERC_COL],
        notes: row[NOTES_COL],
        notes2: row[NOTES_COL2],
        
        // Attach the date object to each entry
        lastUpdated: lastUpdatedDate
      };
    }
  });
  
  return activeData;
}

function extractLostData(sheet) {
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let lostData = {};

  range.forEach(row => {
    if (row[PROP_NUM_COL]) { // Ensure there's a valid proposal number
      lostData[row[PROP_NUM_COL]] = { 
        client: row[CLIENT_COL],
        projectName: row[LOST_PROJ_NAME_COL], 
        proposalAmount: row[LOST_PROJ_STATUS_COL],
        notes: row[LOST_PROJ_NOTES_COL]
      };
    }
  });

  return lostData;
}

function compareData(lastSnapshot, currentData) {
  const closedWon = [];
  const stuckProjects = [];
  Logger.log("Checking data availability and content in compareData:");

  if (!currentData || !lastSnapshot) {
    Logger.log("Critical Data missing in compareData function.");
    return { stuckProjects, closedWon };
  }

  Object.keys(lastSnapshot).forEach(key => {
    const last = lastSnapshot[key];
    const current = currentData[key];

    Logger.log(`Processing key: ${key}`);

    if (!current) {
      Logger.log(`Missing current data for key: ${key}`);
      return;
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const statusChangeDate = new Date(current.lastUpdated);

    if ((last.status === "Proposal" && (current.status === "InWork" || current.status === "Pending NTP")) &&
        statusChangeDate >= oneWeekAgo) {
      closedWon.push({ ...current, proposalNumber: key });
    }

    if ((current.status === last.status && current.productionStage === last.productionStage && current.completionPercentage === last.completionPercentage &&
      (current.status === "InWork" || current.status === "Pending NTP" || current.status === "Proposal")) && (!current.notes || !current.notes2)) {
      stuckProjects.push({ ...current, proposalNumber: key });
      Logger.log(`Stuck project detected: ${JSON.stringify(current)}`);
    }
  });

  Logger.log(`Total Stuck Projects: ${stuckProjects.length}`);
  Logger.log(`Total Closed Won Projects: ${closedWon.length}`);

  return { stuckProjects, closedWon };
}

function sortClosedWonProjects(closedWon) {
  let closedWonByIndustry = {};

  closedWon.forEach(project => {
    let industry = project.industry;
    let proposalValue = parseFloat(project.proposalAmount);

    if (closedWonByIndustry[industry]) {
      closedWonByIndustry[industry].count++;
      closedWonByIndustry[industry].sum += proposalValue;
    } else {
      closedWonByIndustry[industry] = { count: 1, sum: proposalValue };
    }
  });

  return closedWonByIndustry;
}

function extractNewProposalsByIndustry(essentialCurrentData, essentialLastSnapshot) {
  let proposalsByIndustry = {};

  if (!essentialCurrentData || !essentialLastSnapshot) {
    Logger.log("Data missing in extractNewProposalsByIndustry: currentData or lastSnapshot is null.");
    return proposalsByIndustry;
  }

  try {
    Object.keys(essentialCurrentData).forEach(key => {
      let row = essentialCurrentData[key];
      if (row && isNewProposal(row, essentialLastSnapshot)) {
        let industry = row.industry;
        let proposalValue = getProposalValue(row);

        if (proposalsByIndustry[industry]) {
          proposalsByIndustry[industry].count++;
          proposalsByIndustry[industry].sum += proposalValue;
        } else {
          proposalsByIndustry[industry] = { count: 1, sum: proposalValue };
        }
      }
    });
  } catch (error) {
    Logger.log("Error processing new proposals by industry: " + error.toString());
  }

  return proposalsByIndustry;
}

function isNewProposal(row, previousActiveData) {
  const proposalNumber = row.proposalNumber;
  return !previousActiveData.hasOwnProperty(proposalNumber);
}

function getProposalValue(row) {
  return parseFloat(row.proposalAmount) || 0;
}

function writeClosedWonSummaryToSheet(closedWonByIndustry, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const industryStartRow = 5;

  const industries = ["DOT", "Energy", "Engineering", "Federal", "Municipal", "Survey", "Other"];

  industries.forEach((industry, index) => {
    const row = industryStartRow + index;
    const cellCount = 'E' + row;
    const cellSum = 'F' + row;

    let count = 0;
    let sum = 0;

    if (closedWonByIndustry[industry]) {
      count = closedWonByIndustry[industry].count;
      sum = closedWonByIndustry[industry].sum;
    }

    Logger.log(`Writing Closed Won Summary to sheet: ${industry} - Count: ${count}, Sum: ${sum}`);  
    sheet.getRange(cellCount).setValue(count);
    sheet.getRange(cellSum).setValue(sum);
    Logger.log("Closed Won Summary written to 'Weekly Summary'.");
  });
}

function writeNewProposalsByIndustryToSheet(proposalsByIndustry, sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const startRow = 5;
  const industries = ["DOT", "Energy", "Engineering", "Federal", "Municipal", "Survey", "Other"];

  industries.forEach((industry, index) => {
    const row = startRow + index;
    const countCell = 'C' + row;
    const sumCell = 'D' + row;

    let count = 0;
    let sum = 0;

    if (proposalsByIndustry[industry]) {
      count = proposalsByIndustry[industry].count;
      sum = proposalsByIndustry[industry].sum;
    }

    Logger.log(`Writing New Proposals by Industry to sheet: ${industry} - Count: ${count}, Sum: ${sum}`);
    sheet.getRange(countCell).setValue(count);
    sheet.getRange(sumCell).setValue(sum);
    Logger.log("New Proposals By Industry written to 'Weekly Summary'.");
  });
}

function writeStuckProjectsToSheet(stuckProjects, sheetName, startRow = 5, startCol = 8) {
  Logger.log("Attempting to write Stuck Projects Details.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!stuckProjects || stuckProjects.length === 0) {
    Logger.log("No Stuck projects to write.");
    return;
  }

  const clearRange = sheet.getRange(startRow, startCol, 50, 9);
  clearRange.clearContent();
  clearRange.setBorder(null, null, null, null, null, null);
  clearRange.clearFormat();

  let output = stuckProjects.map(project => {

    let mostCurrentNote = project.notes;
      if (!project.notes) {
      mostCurrentNote = project.notes2;
    }

    return [
    project.client,
    project.woNumber,
    project.projectName,
    project.proposalAmount,
    project.amountRemainingToInvoice,
    project.status,
    project.productionStage,
    project.completionPercentage,
    mostCurrentNote
    ]
  });

  const range = sheet.getRange(startRow, startCol, stuckProjects.length, 9);
  const notesRange = sheet.getRange(startRow, startCol + 9, stuckProjects.length, 1);
  const clientRange = sheet.getRange(startRow, startCol, stuckProjects.length, 1);
  Logger.log(`Writing to sheet at range (${startRow}, ${startCol}) with ${stuckProjects.length} rows and 9 columns.`);

  range.setValues(output);

  range.setHorizontalAlignment("center");
  notesRange.setWrap(true);
  clientRange.setWrap(true);

  setAlternateRowConditionalFormatting(sheet, range);
  Logger.log("Stuck Projects written to 'Weekly Summary'.");
}

function setAlternateRowConditionalFormatting(sheet, range) {
  var rules = [];

  var evenRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISEVEN(ROW())')
    .setBackground("#f3f3f3")  // Light grey for even rows
    .setRanges([range])
    .build();

  var oddRowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=ISODD(ROW())')
    .setBackground("#ffffff")  // White for odd rows
    .setRanges([range])
    .build();

  rules.push(evenRowRule, oddRowRule);
  sheet.setConditionalFormatRules(rules);
}

function writeToRange(sheet, data, startRow, startCol, numCols) {
  if (!Array.isArray(data) || data.length === 0) {
    Logger.log("No data to write to range.");
    return;
  }

  let range = sheet.getRange(startRow, startCol, data.length, numCols);
  let output = data.map(project => [
    project.client,
    project.proposalNumber,
    project.projectName,
    project.status,
    project.proposalAmount,
    project.notes
  ]);

  Logger.log(`Writing to sheet at range ${startRow}:${startCol} - ${JSON.stringify(output)}`);
  range.setValues(output);
  Logger.log(`Written to sheet at range ${startRow}:${startCol} - ${JSON.stringify(output)}`);
}

function writeClosedWonProjectsToSheet(closedWon, sheetName) {
  Logger.log("Attempting to write Closed Won Project Details.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  // Clear range B16:G24
  const clearRange = sheet.getRange(16, 2, 9, 5); // Rows B16 to G24; 9 rows, 5 columns
  clearRange.clearContent();
  Logger.log(`Cleared content in range: ${clearRange.getA1Notation()}`);
  
  if (!closedWon || closedWon.length === 0) {
    Logger.log("No Closed Won projects to write.");
    return;
  }

  writeToRange(sheet, closedWon, 16, 2, 6);

  const range = sheet.getRange(16, 2, closedWon.length, 6);
  range.setHorizontalAlignment("center");

  setAlternateRowConditionalFormatting(sheet, range);
  Logger.log("Closed Won Project Details written and centered.");
}



function writeClosedLostToSheet(newLostProjects, sheetName) {
  Logger.log("Attempting to write Closed Lost Project Details.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!newLostProjects || newLostProjects.length === 0) {
    Logger.log("No Lost projects to write.");
    return;
  }

  const output = Object.values(newLostProjects);
  writeToRange(sheet, output, 28, 2, 6);  

  const range = sheet.getRange(28, 2, output.length, 6);
  range.setHorizontalAlignment("center");

  setAlternateRowConditionalFormatting(sheet, range);
  Logger.log("Lost Project Details written to 'Weekly Summary'.");
}

function logDataInSheet(data, sheetName, context) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  var lastRow = logSheet.getLastRow();
  var startRow = lastRow > 0 ? lastRow + 2 : 1; // Start at row 1 if the sheet is empty

  if (Array.isArray(data) && data.length > 0) {
    var numRows = data.length;
    var reason = context || 'General';
    var timestamp = new Date();

    if (startRow === 1) {
      logSheet.getRange(startRow, 1, 1, 3).setValues([['Timestamp', 'Context', 'Data']]);
      startRow++;
    }

    var logEntries = data.map(item => [timestamp, reason, JSON.stringify(item)]);
    var range = logSheet.getRange(startRow, 1, numRows, 3);
    range.setValues(logEntries);

    Logger.log(`Logged ${numRows} entries to sheet ${sheetName} at context: ${reason}`);
  } else if (typeof data === 'object') {
    var range = logSheet.getRange(startRow, 1, 1, 3);
    range.setValues([[new Date(), context || 'General', JSON.stringify(data)]]);

    Logger.log(`Logged single entry to sheet ${sheetName} at context: ${context}`);
  } else {
    Logger.log('No data to log.');
  }
}

function extractNewLostProjects(essentialLastSnapshot, essentialCurrentData) {
  let newLostProjects = {};

  if (!essentialCurrentData || !essentialLastSnapshot) {
    Logger.log("Data missing in extractNewLostProjects: currentData or lastSnapshot is null.");
    return newLostProjects;
  }

  try {
    Object.keys(essentialCurrentData).forEach(key => {
      var currentLostEntry = essentialCurrentData[key];
      if (!essentialLastSnapshot[key]) {
        newLostProjects[key] = currentLostEntry;
      }
    });
  } catch (error) {
    Logger.log("Error processing new lost projects: " + error.toString());
  }

  return newLostProjects;
}

