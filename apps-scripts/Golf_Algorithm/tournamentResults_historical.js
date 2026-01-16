// Copy of tournamentResults.js for implementing historical data fetching
// Original file: tournamentResults.js

const RESULTS_METRIC_TYPES = {
  // Metrics where lower values are better
  LOWER_BETTER: new Set([
    'Fairway Proximity',
    'Rough Proximity',
    'Fairway Proximity - Model',
    'Rough Proximity - Model'
  ]),
  
  // Metrics where higher values are better
  HIGHER_BETTER: new Set([
    'SG Total',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'SG BS',
    'SG Total - Model',
    'SG T2G - Model',
    'SG Approach - Model',
    'SG Around Green - Model',
    'SG OTT - Model',
    'SG Putting - Model',
    'Driving Distance',
    'Driving Distance - Model',
    'Driving Accuracy',
    'Driving Accuracy - Model',
    'Greens in Regulation',
    'Greens in Regulation - Model'
  ]),
  
  // Metrics displayed as percentages
  PERCENTAGE: new Set([
    'Driving Accuracy',
    'Driving Accuracy - Model',
    'Greens in Regulation',
    'Greens in Regulation - Model'
  ]),
  
  // Metrics that have model comparisons
  HAS_MODEL: new Set([
    'SG Total',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'Driving Distance',
    'Driving Accuracy',
    'Greens in Regulation',
    'Fairway Proximity',
    'Rough Proximity',
    'WAR'
  ]),
  
  // Metrics with 3 decimal precision
  DECIMAL_3: new Set([
    'SG Total',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'SG BS',
    'SG Total - Model',
    'SG T2G - Model',
    'SG Approach - Model',
    'SG Around Green - Model',
    'SG OTT - Model',
    'SG Putting - Model'
  ]),
  
  // Metrics with 1 decimal precision
  DECIMAL_2: new Set([
    'Driving Distance',
    'Driving Distance - Model',
    'Fairway Proximity',
    'Fairway Proximity - Model',
    'Rough Proximity',
    'Rough Proximity - Model'
  ]),
  
  // Rank-related metrics
  RANK: new Set(['Model Rank', 'Finish Position']),
};

/**
 * Fetches historical tournament data from DataGolf API, appends raw data to Historical Data sheet, merges with model data, and writes aggregated data to the Tournament Results sheet.
 */
function fetchHistoricalTournamentResults() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultsSheet = ss.getSheetByName("Tournament Results");
  const historicalSheet = ss.getSheetByName("Historical Data") || ss.insertSheet("Historical Data");
  const modelSheet = ss.getSheetByName("Player Ranking Model");
  const configSheet = ss.getSheetByName("Configuration Sheet");

  if (!resultsSheet || !modelSheet || !configSheet) {
    console.error("Required sheets not found");
    return;
  }

  // Fetch eventId from Configuration Sheet cell G9
  const eventId = configSheet.getRange("G9").getValue();
  if (!eventId) {
    SpreadsheetApp.getUi().alert("Event ID not found in Configuration Sheet (G9). Aborting operation.");
    return;
  }

  // Assume tour is PGA
  const tour = "PGA";

  // Prompt user for year
  const ui = SpreadsheetApp.getUi();
  const yearResponse = ui.prompt("Enter the year for the historical data:", ui.ButtonSet.OK_CANCEL);
  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    ui.alert("Year input canceled. Aborting operation.");
    return;
  }
  const year = yearResponse.getResponseText();

  // API parameters
  const apiKey = "764c0376abb1182965e53df33338"; // Replace with your API key
  const fileFormat = "json";

  // Build API URL for historical data
  const apiUrl = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=${tour}&event_id=${eventId}&year=${year}&file_format=${fileFormat}&key=${apiKey}`;

  try {
    // Fetch data from API
    const response = UrlFetchApp.fetch(apiUrl);
    const data = JSON.parse(response.getContentText());

    // Extract metadata
    const eventName = data.event_name || "Tournament";
    const courseName = data.course_name || "Course";
    const lastUpdated = data.last_updated || new Date().toISOString();

    // Write raw data to Historical Data sheet
    const rawHeaders = Object.keys(data.rounds[0] || {});
    const existingHeaders = historicalSheet.getRange(1, 1, 1, historicalSheet.getLastColumn()).getValues()[0];

    // Check if headers match, otherwise write headers
    if (!existingHeaders || existingHeaders.length === 0 || !rawHeaders.every((header, i) => header === existingHeaders[i])) {
      historicalSheet.insertRows(1);
      historicalSheet.getRange(1, 1, 1, rawHeaders.length).setValues([rawHeaders]);
    }

    const rawData = data.rounds.map(round => rawHeaders.map(header => round[header] || ""));

    // Insert new data at the top of the Historical Data sheet
    historicalSheet.insertRows(2, rawData.length);
    historicalSheet.getRange(2, 1, rawData.length, rawHeaders.length).setValues(rawData);

    // Read model data
    const modelData = {};
    readModelData(modelSheet, modelData);

    // Merge historical data with model data
    const mergedData = rawData.map(row => {
      const dgId = row[rawHeaders.indexOf("dg_id")];
      const modelInfo = modelData[dgId] || {};

      return [
        dgId,                                  // DG ID
        row[rawHeaders.indexOf("player_name")], // Player Name
        modelInfo.rank || "N/A",               // Model Rank
        row[rawHeaders.indexOf("position")],   // Finish Position
        row[rawHeaders.indexOf("score")],      // Score
        row[rawHeaders.indexOf("sg_total")],   // SG Total
        modelInfo.sgTotal || 0,                 // SG Total - Model
        row[rawHeaders.indexOf("driving_dist")], // Driving Distance
        modelInfo.drivingDistance || 0,         // Driving Distance - Model
        row[rawHeaders.indexOf("driving_acc")], // Driving Accuracy
        modelInfo.drivingAccuracy || 0,         // Driving Accuracy - Model
        row[rawHeaders.indexOf("sg_t2g")],     // SG T2G
        modelInfo.sgT2G || 0,                   // SG T2G - Model
        row[rawHeaders.indexOf("sg_app")],     // SG Approach
        modelInfo.sgApproach || 0,              // SG Approach - Model
        row[rawHeaders.indexOf("sg_arg")],     // SG Around Green
        modelInfo.sgAroundGreen || 0,           // SG Around Green - Model
        row[rawHeaders.indexOf("sg_ott")],     // SG OTT
        modelInfo.sgOTT || 0,                   // SG OTT - Model
        row[rawHeaders.indexOf("sg_putt")],    // SG Putting
        modelInfo.sgPutting || 0,               // SG Putting - Model
        row[rawHeaders.indexOf("gir")],        // Greens in Regulation
        modelInfo.gir || 0,                     // Greens in Regulation - Model
        row[rawHeaders.indexOf("prox_fw")],    // Fairway Proximity
        modelInfo.fairwayProx || 0,             // Fairway Proximity - Model
        row[rawHeaders.indexOf("prox_rgh")],   // Rough Proximity
        modelInfo.roughProx || 0                // Rough Proximity - Model
      ];
    });

    // Sort merged data by finish position
    mergedData.sort((a, b) => {
      const posA = a[3].replace("T", "");
      const posB = b[3].replace("T", "");
      return parseInt(posA) - parseInt(posB);
    });

    // Write merged data to Tournament Results sheet
    const headers = [
      "DG ID", "Player Name", "Model Rank", "Finish Position", "Score", 
      "SG Total", "SG Total - Model", 
      "Driving Distance", "Driving Distance - Model", 
      "Driving Accuracy", "Driving Accuracy - Model", 
      "SG T2G", "SG T2G - Model", 
      "SG Approach", "SG Approach - Model", 
      "SG Around Green", "SG Around Green - Model", 
      "SG OTT", "SG OTT - Model", 
      "SG Putting", "SG Putting - Model", 
      "Greens in Regulation", "Greens in Regulation - Model", 
      "Fairway Proximity", "Fairway Proximity - Model", "Rough Proximity",
      "Rough Proximity - Model"
    ];

    resultsSheet.getRange(5, 2, 1, headers.length).setValues([headers]);
    resultsSheet.getRange(6, 2, mergedData.length, headers.length).setValues(mergedData);

    // Format results
    formatTournamentResults(resultsSheet, RESULTS_METRIC_TYPES);

    // Validate predictions
    validateTournamentPredictions(resultsSheet, mergedData.map(data => ({ data })));

    // Write metadata
    resultsSheet.getRange("C2").setValue(eventName);
    resultsSheet.getRange("C3").setValue(courseName);
    resultsSheet.getRange("C4").setValue(lastUpdated);

  } catch (error) {
    console.error(`Error fetching historical data: ${error.message}`);
    resultsSheet.getRange("F3").setValue(`Error: ${error.message}`);
    resultsSheet.getRange("F4").setValue(error.stack);
  }

  /**
   * Reads model data from the "Player Ranking Model" sheet and populates the modelData object.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet containing player ranking data.
   * @param {Object} modelData - The object to populate with model data.
   */
  function readModelData(sheet, modelData) {
    if (!sheet) return;

    // Find column indices for relevant data
    const headerRow = sheet.getRange(5, 2, 1, sheet.getLastColumn()).getValues()[0];
    const dgIdIndex = headerRow.indexOf("DG ID");
    const rankIndex = headerRow.indexOf("Rank");
    const sgTotalIndex = headerRow.indexOf("SG Total");
    const drivingDistanceIndex = headerRow.indexOf("Driving Distance");
    const drivingAccuracyIndex = headerRow.indexOf("Driving Accuracy");
    const sgT2GIndex = headerRow.indexOf("SG T2G");
    const sgApproachIndex = headerRow.indexOf("SG Approach");
    const sgAroundGreenIndex = headerRow.indexOf("SG Around Green");
    const sgOTTIndex = headerRow.indexOf("SG OTT");
    const sgPuttingIndex = headerRow.indexOf("SG Putting");
    const girIndex = headerRow.indexOf("Greens in Regulation");
    const fairwayProxIndex = headerRow.indexOf("Fairway Proximity");
    const roughProxIndex = headerRow.indexOf("Rough Proximity");

    // Read data rows
    const dataRows = sheet.getRange(6, 2, sheet.getLastRow() - 5, sheet.getLastColumn()).getValues();
    dataRows.forEach(row => {
      const dgId = row[dgIdIndex];
      if (dgId) {
        modelData[dgId] = {
          rank: row[rankIndex],
          sgTotal: row[sgTotalIndex],
          drivingDistance: row[drivingDistanceIndex],
          drivingAccuracy: row[drivingAccuracyIndex],
          sgT2G: row[sgT2GIndex],
          sgApproach: row[sgApproachIndex],
          sgAroundGreen: row[sgAroundGreenIndex],
          sgOTT: row[sgOTTIndex],
          sgPutting: row[sgPuttingIndex],
          gir: row[girIndex],
          fairwayProx: row[fairwayProxIndex],
          roughProx: row[roughProxIndex]
        };
      }
    });
  }

  /**
   * Formats the "Tournament Results" sheet based on metric types.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to format.
   * @param {Object} metricTypes - The metric types for formatting.
   */
  function formatTournamentResults(sheet, metricTypes) {
    // Example formatting logic (can be expanded as needed)
    const range = sheet.getRange(6, 2, sheet.getLastRow() - 5, sheet.getLastColumn() - 1);
    range.setFontSize(10).setFontFamily("Arial");

    // Apply conditional formatting for percentages
    const percentageColumns = metricTypes.PERCENTAGE;
    percentageColumns.forEach(columnName => {
      const colIndex = sheet.getRange(5, 2, 1, sheet.getLastColumn()).getValues()[0].indexOf(columnName) + 2;
      if (colIndex > 1) {
        const colRange = sheet.getRange(6, colIndex, sheet.getLastRow() - 5, 1);
        colRange.setNumberFormat("0.0%")
          .setFontWeight("bold");
      }
    });
  }

  /**
   * Validates predictions against actual results.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet containing results.
   * @param {Array} playerRows - The player data rows.
   */
  function validateTournamentPredictions(sheet, playerRows) {
    // Example validation logic (can be expanded as needed)
    const validationResults = playerRows.map(player => {
      const predictedRank = player.data[2]; // Model Rank
      const actualRank = player.data[3]; // Finish Position
      return {
        player: player.data[1],
        predictedRank,
        actualRank,
        isAccurate: predictedRank === actualRank
      };
    });

    // Log validation results
    console.log("Validation Results:", validationResults);
  }
}
