/**
 * HISTORICAL TOURNAMENT ANALYSIS MODULE
 * 
 * Fetches past tournament results and compares with model predictions.
 * Key features:
 * - Preserves all historical data (appends, never overwrites)
 * - Tags each dataset with tournament/year/date metadata
 * - Sandbox mode for safe testing
 * - Validation metrics for model performance assessment
 */

/**
 * Fetches historical tournament results - SANDBOX MODE
 * Creates/uses "Tournament Results - Sandbox" sheet for safe testing
 */
function fetchHistoricalTournamentResultsSandbox() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let sandboxSheet = ss.getSheetByName("Tournament Results - Sandbox");
  if (!sandboxSheet) {
    sandboxSheet = ss.insertSheet("Tournament Results - Sandbox");
    sandboxSheet.getRange("A1:Z1")
      .setBackground("#FFF3CD")
      .setFontWeight("bold");
    sandboxSheet.getRange("A1").setValue("🧪 SANDBOX MODE - Safe Testing Environment");
  }
  
  return fetchHistoricalTournamentResultsImpl(sandboxSheet, true);
}

/**
 * Fetches historical tournament results - PRODUCTION MODE
 * Writes to standard "Tournament Results" sheet
 * ALSO appends to "Historical Data" sheet with metadata
 */
function fetchHistoricalTournamentResults() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultsSheet = ss.getSheetByName("Tournament Results");
  
  if (!resultsSheet) {
    SpreadsheetApp.getUi().alert("Tournament Results sheet not found.");
    return;
  }
  
  return fetchHistoricalTournamentResultsImpl(resultsSheet, false);
}

/**
 * Core implementation for historical tournament fetching
 * @param {Sheet} resultsSheet - Target sheet for formatted results
 * @param {boolean} isSandbox - Whether running in sandbox mode
 */
function fetchHistoricalTournamentResultsImpl(resultsSheet, isSandbox) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const modelSheet = ss.getSheetByName("Player Ranking Model");
  const configSheet = ss.getSheetByName("Configuration Sheet");
  
  if (!modelSheet || !configSheet) {
    SpreadsheetApp.getUi().alert("Required sheets not found (Player Ranking Model or Configuration Sheet)");
    return;
  }
  
  // Get event ID from Configuration Sheet
  const eventId = configSheet.getRange("G9").getValue();
  if (!eventId) {
    SpreadsheetApp.getUi().alert("Event ID not found in Configuration Sheet (G9)");
    return;
  }
  
  // Prompt for year
  const ui = SpreadsheetApp.getUi();
  const prompt = isSandbox 
    ? "🧪 SANDBOX MODE\n\nEnter year for historical analysis:"
    : "Enter year for historical analysis:";
  const yearResponse = ui.prompt(prompt, ui.ButtonSet.OK_CANCEL);
  
  if (yearResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const year = yearResponse.getResponseText().trim();
  if (!year || isNaN(year) || year.length !== 4) {
    ui.alert("Invalid year format. Please enter a 4-digit year (e.g., 2024)");
    return;
  }
  
  // Get API key
  let apiKey = PropertiesService.getScriptProperties().getProperty("DATAGOLF_API_KEY");
  if (!apiKey) {
    apiKey = "764c0376abb1182965e53df33338"; // Fallback
  }
  
  const tour = "pga"; // DataGolf uses lowercase
  const apiUrl = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=${tour}&event_id=${eventId}&year=${year}&file_format=json&key=${apiKey}`;
  
  try {
    // Show progress
    const statusMsg = isSandbox 
      ? `🧪 Fetching ${year} data for event ${eventId}...`
      : `Fetching ${year} data for event ${eventId}...`;
    resultsSheet.getRange("F2").setValue(statusMsg);
    SpreadsheetApp.flush();
    
    // Fetch from API
    const response = UrlFetchApp.fetch(apiUrl);
    const data = JSON.parse(response.getContentText());
    
    if (!data || !data.event_name) {
      resultsSheet.getRange("F3").setValue(`No data found for event ${eventId} in ${year}`);
      return;
    }
    
    const eventName = data.event_name;
    const courseName = data.course_name || "Unknown Course";
    
    // Store raw historical data (only in production mode)
    if (!isSandbox) {
      appendToHistoricalDataSheet(data, eventId, year, eventName, courseName);
    }
    
    // Process and display results
    displayHistoricalResults(resultsSheet, data, modelSheet, eventId, year, eventName, courseName, isSandbox);
    
    const successMsg = isSandbox
      ? `🧪 Sandbox loaded: ${year} ${eventName}`
      : `✓ Historical analysis complete: ${year} ${eventName}`;
    SpreadsheetApp.getActiveSpreadsheet().toast(successMsg, "Success", 5);
    
  } catch (error) {
    console.error("Error fetching historical data:", error);
    resultsSheet.getRange("F3").setValue(`Error: ${error.message}`);
    SpreadsheetApp.getActiveSpreadsheet().toast(`Error: ${error.message}`, "Failed", 10);
  }
}

/**
 * Appends data to Historical Data sheet with metadata tags
 * This preserves all previous data - never overwrites
 */
function appendToHistoricalDataSheet(data, eventId, year, eventName, courseName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let historicalSheet = ss.getSheetByName("Historical Data");
  
  if (!historicalSheet) {
    historicalSheet = ss.insertSheet("Historical Data");
    
    // Create header row
    const headers = [
      "Fetch_Date", "Event_ID", "Year", "Event_Name", "Course_Name",
      "Round_Num", "DG_ID", "Player_Name", "Total_Score",
      "SG_Total", "SG_OTT", "SG_App", "SG_ARG", "SG_Putt", "SG_T2G", "SG_BS",
      "Driving_Dist", "Driving_Acc", "GIR", "Prox_FW", "Prox_Rgh"
    ];
    
    historicalSheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground("#20487C")
      .setFontColor("white")
      .setFontWeight("bold");
  }
  
  if (!data.rounds || data.rounds.length === 0) {
    console.log("No round data to append to Historical Data sheet");
    return;
  }
  
  const fetchDate = new Date().toISOString().split('T')[0];
  const rows = [];
  
  data.rounds.forEach(round => {
    rows.push([
      fetchDate,
      eventId,
      year,
      eventName,
      courseName,
      round.round_num || "",
      round.dg_id || "",
      round.player_name || "",
      round.total_score || "",
      round.sg_total || 0,
      round.sg_ott || 0,
      round.sg_app || 0,
      round.sg_arg || 0,
      round.sg_putt || 0,
      round.sg_t2g || 0,
      round.sg_bs || 0,
      round.distance || 0,
      round.accuracy || 0,
      round.gir || 0,
      round.prox_fw || 0,
      round.prox_rgh || 0
    ]);
  });
  
  // Append at the end (preserves all previous data)
  const lastRow = historicalSheet.getLastRow();
  historicalSheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  
  console.log(`✓ Appended ${rows.length} rounds to Historical Data (${year} ${eventName})`);
}

/**
 * Displays historical results in the Tournament Results sheet
 */
function displayHistoricalResults(resultsSheet, data, modelSheet, eventId, year, eventName, courseName, isSandbox) {
  // Define column headers
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
    "Fairway Proximity", "Fairway Proximity - Model",
    "Rough Proximity", "Rough Proximity - Model",
    "SG BS"
  ];
  
  // Clear previous data (rows 6+)
  const lastRow = resultsSheet.getLastRow();
  if (lastRow > 5) {
    resultsSheet.getRange(6, 1, lastRow - 5, resultsSheet.getLastColumn()).clear();
  }
  
  // Write metadata
  const metaRow = isSandbox ? 2 : 2;
  resultsSheet.getRange(metaRow, 2).setValue("Event:");
  resultsSheet.getRange(metaRow, 3).setValue(eventName);
  resultsSheet.getRange(metaRow + 1, 2).setValue("Course:");
  resultsSheet.getRange(metaRow + 1, 3).setValue(courseName);
  resultsSheet.getRange(metaRow + 2, 2).setValue("Year:");
  resultsSheet.getRange(metaRow + 2, 3).setValue(year);
  
  // Write headers
  resultsSheet.getRange(5, 2, 1, headers.length)
    .setValues([headers])
    .setBackground("#20487C")
    .setFontColor("white")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setWrap(true);
  
  // Read model data
  const modelData = readModelDataForComparison(modelSheet);
  console.log(`Loaded ${Object.keys(modelData).length} players from model`);
  
  // Process player stats
  const playerRows = [];
  
  if (data.live_stats && Array.isArray(data.live_stats)) {
    data.live_stats.forEach(player => {
      const dgId = player.dg_id;
      const modelInfo = modelData[dgId] || {};
      
      playerRows.push({
        dgId: dgId,
        position: player.position || "CUT",
        data: [
          dgId,
          player.player_name || "",
          modelInfo.rank || "N/A",
          player.position || "CUT",
          player.total || "",
          player.sg_total || 0,
          modelInfo.sgTotal || 0,
          player.distance || 0,
          modelInfo.drivingDistance || 0,
          player.accuracy || 0,
          modelInfo.drivingAccuracy || 0,
          player.sg_t2g || 0,
          modelInfo.sgT2G || 0,
          player.sg_app || 0,
          modelInfo.sgApproach || 0,
          player.sg_arg || 0,
          modelInfo.sgAroundGreen || 0,
          player.sg_ott || 0,
          modelInfo.sgOTT || 0,
          player.sg_putt || 0,
          modelInfo.sgPutting || 0,
          player.gir || 0,
          modelInfo.gir || 0,
          player.prox_fw || 0,
          modelInfo.fairwayProx || 0,
          player.prox_rgh || 0,
          modelInfo.roughProx || 0,
          player.sg_bs || 0
        ]
      });
    });
    
    // Sort by finish position
    playerRows.sort((a, b) => {
      const posA = String(a.position).replace("T", "");
      const posB = String(b.position).replace("T", "");
      return parseInt(posA || 999) - parseInt(posB || 999);
    });
    
    // Write player data
    const sortedRows = playerRows.map(p => p.data);
    if (sortedRows.length > 0) {
      resultsSheet.getRange(6, 2, sortedRows.length, headers.length)
        .setValues(sortedRows)
        .setHorizontalAlignment("center");
      
      // Apply formatting (reuse from tournamentResults.js)
      formatTournamentResults(resultsSheet, RESULTS_METRIC_TYPES);
      
      // Update status
      resultsSheet.getRange("F2").setValue(`${year} ${eventName}`);
      resultsSheet.getRange("F3").setValue(`${sortedRows.length} players analyzed`);
      resultsSheet.getRange("F4").setValue(`Updated: ${new Date().toLocaleString()}`);
      
      // Run validation
      try {
        validateTournamentPredictions(resultsSheet, playerRows);
      } catch (e) {
        console.error("Validation error:", e);
      }
    }
  } else {
    resultsSheet.getRange("F3").setValue("No live_stats data in API response");
  }
}

/**
 * Reads model prediction data for comparison
 */
function readModelDataForComparison(modelSheet) {
  const modelData = {};
  
  if (!modelSheet || modelSheet.getLastRow() <= 5) {
    console.warn("Model sheet is empty or not found");
    return modelData;
  }
  
  // Get headers
  const headers = modelSheet.getRange(5, 2, 1, modelSheet.getLastColumn()).getValues()[0];
  
  // Find column indices
  const colMap = {};
  headers.forEach((h, i) => {
    if (h) colMap[h] = i;
  });
  
  if (colMap["DG ID"] === undefined) {
    console.error("DG ID column not found in model sheet");
    return modelData;
  }
  
  // Read all player data
  const dataRange = modelSheet.getRange(6, 2, modelSheet.getLastRow() - 5, headers.length);
  const values = dataRange.getValues();
  
  values.forEach((row, idx) => {
    const dgId = row[colMap["DG ID"]];
    if (!dgId) return;
    
    modelData[dgId] = {
      rank: colMap["Rank"] !== undefined ? row[colMap["Rank"]] : idx + 1,
      sgTotal: colMap["SG Total"] !== undefined ? row[colMap["SG Total"]] : 0,
      drivingDistance: colMap["Driving Distance"] !== undefined ? row[colMap["Driving Distance"]] : 0,
      drivingAccuracy: colMap["Driving Accuracy"] !== undefined ? row[colMap["Driving Accuracy"]] : 0,
      sgT2G: colMap["SG T2G"] !== undefined ? row[colMap["SG T2G"]] : 0,
      sgApproach: colMap["SG Approach"] !== undefined ? row[colMap["SG Approach"]] : 0,
      sgAroundGreen: colMap["SG Around Green"] !== undefined ? row[colMap["SG Around Green"]] : 0,
      sgOTT: colMap["SG OTT"] !== undefined ? row[colMap["SG OTT"]] : 0,
      sgPutting: colMap["SG Putting"] !== undefined ? row[colMap["SG Putting"]] : 0,
      gir: colMap["Greens in Regulation"] !== undefined ? row[colMap["Greens in Regulation"]] : 0,
      fairwayProx: colMap["Fairway Proximity"] !== undefined ? row[colMap["Fairway Proximity"]] : 0,
      roughProx: colMap["Rough Proximity"] !== undefined ? row[colMap["Rough Proximity"]] : 0
    };
  });
  
  return modelData;
}
