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
}