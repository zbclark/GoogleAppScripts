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
 * Fetches tournament data from DataGolf API and formats it with your model data
 */
function fetchTournamentFinalResults() {  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultsSheet = ss.getSheetByName("Tournament Results");
  
  // Check all available sheet names for debugging
  const allSheets = ss.getSheets();
  console.log("All available sheets:");
  allSheets.forEach(sheet => console.log(`- ${sheet.getName()}`));
  
  // Try to find the model sheet using the correct name
  const modelSheet = ss.getSheetByName("Player Ranking Model");
  
  if (!modelSheet) {
    console.error("Model sheet not found - check the exact sheet name");
    if (resultsSheet) {
      resultsSheet.getRange("F3").setValue("Error: Model sheet not found - check Sheet name in code");
    }
    return;
  }

  console.log(`Found model sheet: ${modelSheet.getName()}`);
  
  if (!resultsSheet) {
    console.error("Tournament Results sheet not found");
    return;
  }

  // Clear sheet
  if (resultsSheet.getLastRow() >= 5) {
    // Only clear if there are at least 5 rows of data
    resultsSheet.getRange(5, 1, resultsSheet.getLastRow() - 4, resultsSheet.getLastColumn())
    .clearContent();
  }

  resultsSheet.getRange(2, 3, 3, 4).clearContent();
  resultsSheet.clearConditionalFormatRules();

  // API parameters
  const apiKey = "764c0376abb1182965e53df33338"; // Your API key
  const stats = "sg_ott,sg_app,sg_arg,sg_putt,sg_t2g,sg_total,distance,accuracy,gir,scrambling,prox_fw";
  const round = "event_avg";
  const display = "values";
  const fileFormat = "json";
  
  // Build API URL
  const apiUrl = `https://feeds.datagolf.com/preds/live-tournament-stats?stats=${stats}&round=${round}&display=${display}&file_format=${fileFormat}&key=${apiKey}`;
  
  try {
    // Fetch data from API
    const response = UrlFetchApp.fetch(apiUrl);
    const data = JSON.parse(response.getContentText());
    
    // Extract metadata
    const eventName = data.event_name || "Tournament";
    const courseName = data.course_name || "Course";
    const lastUpdated = data.last_updated || new Date().toISOString();
    
    // Write metadata to sheet
    resultsSheet.getRange("C2").setValue(eventName);
    resultsSheet.getRange("C3").setValue(courseName);
    resultsSheet.getRange("C4").setValue(lastUpdated);
    
    // Define headers
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
      "Rough Proximity - Model", "SG BS"
    ];
    
    // Write headers
    for (let i = 0; i < headers.length; i++) {
      resultsSheet.getRange(5, 2 + i)
        .setValue(headers[i])
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setWrap(true);
    }
    
    // Initialize model data object - THIS WAS MISSING
    const modelData = {};
    
    // Read data from both model sheets
    readModelData(modelSheet, modelData);
    
    // Log how many players we found in model data
    console.log(`Loaded model data for ${Object.keys(modelData).length} players`);
    
    // Process player data from API
    let playerRows = [];
    
    if (data.live_stats && Array.isArray(data.live_stats)) {
        data.live_stats.forEach(player => {
            const dgId = player.dg_id;
            const modelInfo = modelData[dgId] || {};
            
            // Map API fields to our desired output
            const row = [
            dgId,                                  // DG ID
            player.player_name,                    // Player Name
            modelInfo.rank || "N/A",               // Model Rank
            player.position || "N/A",              // Finish Position
            player.total || "N/A",                 // Score
            player.sg_total || 0,                  // SG Total
            modelInfo.sgTotal || 0,                // SG Total - Model
            player.distance || 0,                  // Driving Distance
            modelInfo.drivingDistance || 0,        // Driving Distance - Model
            player.accuracy || 0,                  // Driving Accuracy
            modelInfo.drivingAccuracy || 0,        // Driving Accuracy - Model
            player.sg_t2g || 0,                    // SG T2G
            modelInfo.sgT2G || 0,                  // SG T2G - Model
            player.sg_app || 0,                    // SG Approach
            modelInfo.sgApproach || 0,             // SG Approach - Model
            player.sg_arg || 0,                    // SG Around Green
            modelInfo.sgAroundGreen || 0,          // SG Around Green - Model
            player.sg_ott || 0,                    // SG OTT
            modelInfo.sgOTT || 0,                  // SG OTT - Model
            player.sg_putt || 0,                   // SG Putting
            modelInfo.sgPutting || 0,              // SG Putting - Model
            player.gir || 0,                       // Greens in Regulation
            modelInfo.gir || 0,                    // Greens in Regulation - Model
            player.prox_fw || 0,                   // Fairway Proximity
            modelInfo.fairwayProx || 0,            // Fairway Proximity - Model
            player.prox_rough || 0,                // Rough Proximity
            modelInfo.roughProx || 0,              // Rough Proximity - Model
            player.sg_bs || 0                      // SG BS
            ];
            
        playerRows.push({
            position: player.position,
            data: row
        });
    });
          
      
      // Sort by finish position
      playerRows.sort((a, b) => {
        // Handle "T" tied positions
        const posA = a.position.replace("T", "");
        const posB = b.position.replace("T", "");
        return parseInt(posA) - parseInt(posB);
      });
      
      // Extract just the data rows
      const sortedRows = playerRows.map(pr => pr.data);
      
      // Write to sheet
      if (sortedRows.length > 0) {
        resultsSheet.getRange(6, 2, sortedRows.length, headers.length)
            .setValues(sortedRows)
            .setHorizontalAlignment("center");

        formatTournamentResults(resultsSheet, RESULTS_METRIC_TYPES);
        
        // Add success message
        resultsSheet.getRange("F2").setValue("Last updated: " + new Date().toLocaleString());
        resultsSheet.getRange("F3").setValue(`Found ${sortedRows.length} players from API`);
      } else {
        resultsSheet.getRange("F3").setValue("No player data found in API response");
      }
    } else {
      resultsSheet.getRange("F3").setValue("Invalid API response format");
    }


    
  } catch (error) {
    console.error(`Error fetching DataGolf results: ${error.message}`);
    resultsSheet.getRange("F3").setValue(`Error: ${error.message}`);
    resultsSheet.getRange("F4").setValue(error.stack);
  }


}

// Function to read model data from a sheet
function readModelData(sheet, modelData) {
    if (!sheet) return;
      
    // Find DG ID and Player Name column indices
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
      
    // Log column indices for debugging
    console.log(`Column indices found: 
      DG ID: ${dgIdIndex}, 
      Rank: ${rankIndex},
      SG Total: ${sgTotalIndex},
      Driving Distance: ${drivingDistanceIndex},
      Driving Accuracy: ${drivingAccuracyIndex}`);
    
    // Check if critical columns were found
    if (dgIdIndex === -1) {
      console.error("DG ID column not found in headers");
      return;
    }
    
    if (rankIndex === -1) {
      console.error("Rank column not found in headers");
      return;
    }
    
    // Read model data
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.error("No data rows found in sheet");
      return;
    }
    
    // Read model data
    const modelRange = sheet.getRange(6, 2, sheet.getLastRow() - 1, sheet.getLastColumn());
    const modelValues = modelRange.getValues();
      
    for (const row of modelValues) {
        const dgId = row[dgIdIndex];
        if (!dgId || isNaN(parseInt(dgId))) continue;
            
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
}

function getColumnMap(sheet) {
    const headerRow = 5;
    const headerRange = sheet.getRange(headerRow, 2, 1, sheet.getLastColumn() - 1);
    const headerValues = headerRange.getValues()[0];
    
    const columnMap = {};
    headerValues.forEach((header, index) => {
        if (header) {
        columnMap[header] = index + 2; // +2 because we're starting at column B (index 2)
        }
    });
    
    return columnMap;
}

/**
 * Format the Tournament Results sheet
 */
function formatTournamentResults(sheet, metricTypes) {
  const resultsSheet = sheet;
  const RESULTS_METRIC_TYPES = metricTypes || window.RESULTS_METRIC_TYPES ||{
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
  
  console.log("HAS_MODEL array: ", Array.from(RESULTS_METRIC_TYPES.HAS_MODEL));
  
  if (!resultsSheet) {
    console.error("Tournament Results sheet not found");
    return;
  }
  
  // Set column widths
  resultsSheet.setColumnWidth(2, 80);  // DG ID (B)
  resultsSheet.setColumnWidth(3, 130); // Player Name (C)
  resultsSheet.setColumnWidth(4, 80);  // Model Rank (D)
  resultsSheet.setColumnWidth(5, 80);  // Finish Position (E)
  resultsSheet.setColumnWidth(6, 80);  // Score (F)
  
  // Set all other columns to 90px
  for (let col = 7; col <= 29; col++) {
    resultsSheet.setColumnWidth(col, 90);
  }
  
  // Format header row
  const headerRow = 5;
  const headerRange = resultsSheet.getRange(headerRow, 2, 1, 28);
  headerRange.setFontWeight("bold")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle")
             .setWrap(true);
  
  // Format metadata
  resultsSheet.getRange("B2:B4").setFontWeight("bold").setHorizontalAlignment("right");
  resultsSheet.getRange("C2:C4").setHorizontalAlignment("left");
  
  // Get column map
  const columnMap = getColumnMap(resultsSheet);
  
  // Get data range
  const dataStartRow = 6;
  const lastRow = Math.max(dataStartRow, resultsSheet.getLastRow());
  const numDataRows = lastRow - dataStartRow + 1;
  
  if (numDataRows <= 0) return;
  
  // Apply number formats based on metric types
  for (const header in columnMap) {
    const col = columnMap[header];
    const range = resultsSheet.getRange(dataStartRow, col, numDataRows, 1);
    
    if (RESULTS_METRIC_TYPES.PERCENTAGE.has(header)) {
      range.setNumberFormat("0.00%");
    } else if (RESULTS_METRIC_TYPES.DECIMAL_3.has(header)) {
      range.setNumberFormat("0.000");
    } else if (RESULTS_METRIC_TYPES.DECIMAL_2.has(header)) {
      range.setNumberFormat("0.00");
    } else if (RESULTS_METRIC_TYPES.RANK.has(header)) {
      range.setNumberFormat("0");
    }
  }
  
  // Apply conditional formatting
  applyConditionalFormatting(resultsSheet, columnMap, dataStartRow, numDataRows, metricTypes);
  removeProtections();
}

/**
 * Apply conditional formatting based on metric types
 */
function applyConditionalFormatting(sheet, columnMap, dataStartRow, numRows, metricTypes) {
  const RESULTS_METRIC_TYPES = metricTypes || window.RESULTS_METRIC_TYPES ||{
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
  
  console.log("HAS_MODEL array: ", Array.from(RESULTS_METRIC_TYPES.HAS_MODEL));
  
  let rules = [];
  
  // Process each column
  for (const header in columnMap) {
    const col = columnMap[header];
    
    // Model comparison formatting - this is the key part
    if (RESULTS_METRIC_TYPES.HAS_MODEL.has(header)) {
      // Get the model column - should be the next column
      const modelHeader = `${header} - Model`;
      if (columnMap[modelHeader]) {
        const colLetter = String.fromCharCode(64 + col);
        const modelCol = columnMap[modelHeader];
        const modelLetter = String.fromCharCode(64 + modelCol);
        
        const isHigherBetter = RESULTS_METRIC_TYPES.HIGHER_BETTER.has(header);
        
        // Get the data ranges
        const dataRange = sheet.getRange(dataStartRow, col, numRows, 1);
        const modelRange = sheet.getRange(dataStartRow, modelCol, numRows, 1);
        
        // Get the values
        const dataValues = dataRange.getValues();
        const modelValues = modelRange.getValues();
        
        // Apply direct formatting based on comparison
        for (let i = 0; i < numRows; i++) {
          const dataValue = dataValues[i][0];
          const modelValue = modelValues[i][0];
          
          // Skip if either value is missing or not a number
          if (dataValue === "" || modelValue === "" || 
              isNaN(dataValue) || isNaN(modelValue)) continue;
          
          const cellRange = sheet.getRange(dataStartRow + i, col);
          
          if (isHigherBetter) {
            // For higher better metrics (SG, etc.)
            if (dataValue > modelValue) {
              cellRange.setBackground("#DFF0D8"); // Green - better than model
            } else if (dataValue < modelValue) {
              cellRange.setBackground("#F2DEDE"); // Red - worse than model
            }
          } else {
            // For lower better metrics (proximities)
            if (dataValue < modelValue) {
              cellRange.setBackground("#DFF0D8"); // Green - better than model
            } else if (dataValue > modelValue) {
              cellRange.setBackground("#F2DEDE"); // Red - worse than model
            }
          }
        }
      }
    }
    
    // Special formatting for Finish Position
    if (header === "Finish Position") {
        const range = sheet.getRange(dataStartRow, col, numRows, 1);
    
        // Get all position values in the column
        const positionValues = range.getValues();
        
        // Directly apply formatting based on exact position matching
        for (let i = 0; i < numRows; i++) {
            const position = positionValues[i][0].toString();
            const cellRange = sheet.getRange(dataStartRow + i, col);
            
            // Parse the position to handle "T" prefix
            let positionNum;
            if (position.startsWith("T")) {
            positionNum = parseInt(position.substring(1));
            } else {
            positionNum = parseInt(position);
            }
            
            // Skip if not a valid number
            if (isNaN(positionNum)) continue;
            
            // Apply formatting based on exact position
            if (positionNum === 1) {
            // Winner (exactly 1 or T1)
            cellRange.setBackground("#FFD700") // Gold
                    .setFontWeight("bold");
            } else if (positionNum >= 2 && positionNum <= 5) {
            // Top 5 (positions 2-5 or T2-T5)
            cellRange.setBackground("#C0C0C0") // Silver
                    .setFontWeight("bold");
            } else if (positionNum >= 6 && positionNum <= 10) {
            // Top 10 (positions 6-10 or T6-T10)
            cellRange.setBackground("#CD7F32"); // Bronze
            }
        }
    }

    // Special formatting for Model Rank vs Finish Position
    if (header === "Model Rank") {
      const modelRankCol = columnMap[header];
      const finishPosCol = columnMap["Finish Position"];
      
      if (finishPosCol) {
        // Get all model rank values
        const modelRankRange = sheet.getRange(dataStartRow, modelRankCol, numRows, 1);
        const modelRankValues = modelRankRange.getValues();
        
        // Get all finish position values
        const finishPosRange = sheet.getRange(dataStartRow, finishPosCol, numRows, 1);
        const finishPosValues = finishPosRange.getValues();
        
        // Apply highlighting for big model misses
        for (let i = 0; i < numRows; i++) {
          const modelRank = modelRankValues[i][0];
          const finishPos = String(finishPosValues[i][0]);
          
          if (!finishPos || !modelRank) continue;
          
          // Parse finish position
          let finishPosNum;
          if (finishPos.startsWith("T")) {
            finishPosNum = parseInt(finishPos.substring(1));
          } else {
            finishPosNum = parseInt(finishPos);
          }
          
          if (isNaN(finishPosNum)) continue;
          
          const cellRange = sheet.getRange(dataStartRow + i, modelRankCol);
          
          // Highlight major misses - model ranked 100+ but finished top 10
          if (modelRank > 100 && finishPosNum <= 10) {
            cellRange.setBackground("#FFC7CE") // Light red
                    .setFontColor("#9C0006") // Dark red
                    .setFontWeight("bold");
          }
          // Highlight good predictions - model ranked top 10 and finished top 10
          else if (modelRank <= 20 && finishPosNum <= 10) {
            cellRange.setBackground("#C6EFCE") // Light green
                    .setFontColor("#006100") // Dark green
                    .setFontWeight("bold");
          }
        }
      }
    }
  }
 
  // Apply all the conditional format rules we built
  sheet.setConditionalFormatRules(rules);
  addAnalysisNotes(sheet, columnMap, dataStartRow, numRows, RESULTS_METRIC_TYPES);
}

function addAnalysisNotes(sheet, columnMap, dataStartRow, numRows, metricTypes) {
  console.log("Starting addAnalysisNotes function...");

  const RESULTS_METRIC_TYPES = metricTypes || window.RESULTS_METRIC_TYPES ||{
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
  
  console.log("HAS_MODEL array: ", Array.from(RESULTS_METRIC_TYPES.HAS_MODEL));
  
  // Try to get cached group statistics
  const groupStats = getCachedGroupStats();
  
  if (groupStats) {
    console.log("Using cached group statistics");
    // Log which metrics we have stats for
    for (const groupName in groupStats) {
      console.log(`Group ${groupName} metrics:`, Object.keys(groupStats[groupName]));
    }
  } else {
    console.log("No cached group statistics available - will use fallback methods");
  }
  
  // Create a notes column if it doesn't exist
  let notesCol = 1;
  sheet.getRange(5, notesCol).setValue("Performance Analysis")
                           .setBackground("#20487C")
                           .setFontColor("white")
                           .setFontWeight("bold")
                           .setHorizontalAlignment("center");
  
  sheet.setColumnWidth(notesCol, 300);

  // Get player ranking data for trends and WAR
  const playerRankingSheet = SpreadsheetApp.getActive().getSheetByName("Player Ranking Model");
  if (!playerRankingSheet) {
    console.error("Could not find Player Ranking Model sheet - cannot retrieve trend data");
    return;
  }
  
  // Get all headers from the Player Ranking Model sheet
  const rankingHeaders = playerRankingSheet.getRange(5, 1, 1, playerRankingSheet.getLastColumn()).getValues()[0];
  
  // Find DG ID column
  const rankingDgIdCol = findColumnIndex(rankingHeaders, "DG ID");
  if (rankingDgIdCol < 0) {
    console.error("Could not find DG ID column in Player Ranking Model sheet");
    return;
  }
  
  // Find Player Name column for debugging
  const playerNameCol = findColumnIndex(rankingHeaders, "Player Name");
  
  // Find all trend columns in the Player Ranking Model sheet
  const trendColumns = {};
  rankingHeaders.forEach((header, index) => {
    if (!header) return;
    const headerStr = String(header);
    if (headerStr.includes("Trend")) {
      const baseMetric = headerStr.replace(" Trend", "");
      // Only track trends for metrics in HAS_MODEL
      if (RESULTS_METRIC_TYPES.HAS_MODEL.has(baseMetric)) {
        trendColumns[headerStr] = {
          index: index,
          baseMetric: baseMetric
        };
        console.log(`Found trend column for HAS_MODEL metric: ${headerStr} at index ${index}`);
      }
    }
  });
  
  console.log(`Found ${Object.keys(trendColumns).length} trend columns for HAS_MODEL metrics`);
  
  // Find WAR & DG ID column
  const warCol = findColumnIndex(rankingHeaders, "WAR");
  const dgIdCol = findColumnIndex(rankingHeaders, "DG ID");
  
  // Get all player rows from the Player Ranking Model sheet
  const playerModelData = playerRankingSheet.getRange(6, 1, playerRankingSheet.getLastRow() - 5, playerRankingSheet.getLastColumn()).getValues();
  console.log(`Retrieved ${playerModelData.length} rows from Player Ranking Model sheet`);
  
  // Process player data into a lookup structure keyed by DG ID
  const playerData = {};
  
  playerModelData.forEach((row) => {
    const dgId = row[dgIdCol];
    
    // Skip rows without a DG ID
    if (!dgId) return;
    
    const playerName = playerNameCol >= 0 ? row[playerNameCol] : "Unknown";
    
    // Create player entry
    playerData[dgId] = {
      name: playerName,
      war: warCol >= 0 ? row[warCol] : null,
      trends: {}
    };
    
    // Add all trend values for HAS_MODEL metrics
    Object.entries(trendColumns).forEach(([trendName, columnInfo]) => {
      const trendValue = row[columnInfo.index];
      if (trendValue !== null && !isNaN(trendValue)) {
        playerData[dgId].trends[trendName] = trendValue;
      }
    });
  });
  
  console.log(`Successfully processed ${Object.keys(playerData).length} players with DG IDs`);
  
  // Sample one player's data for debugging
  const sampleId = Object.keys(playerData)[0];
  if (sampleId) {
      console.log(`Sample player - 
      name: ${playerData[sampleId].name},
      trendCount: ${Object.keys(playerData[sampleId].trends).length
    }`);
  }
  
  // Get relevant column indices from results sheet
  const resultsDgIdCol = columnMap["DG ID"];
  const playerCol = columnMap["Player Name"];
  const modelRankCol = columnMap["Model Rank"];
  const finishPosCol = columnMap["Finish Position"];
  
  if (!dgIdCol || !playerCol || !modelRankCol || !finishPosCol) {
    console.error("Missing required columns in results sheet");
    return;
  }
  
  // Get all player data from the results sheet
  const allRanges = sheet.getRange(dataStartRow, 1, numRows, sheet.getLastColumn()).getValues();
  console.log(`Retrieved ${allRanges.length} rows from results sheet`);
  
  // Track player matching statistics
  let playersWithTrends = 0;
  let playersWithoutTrends = 0;

  // Process each player in the results sheet
  for (let i = 0; i < numRows && i < allRanges.length; i++) {
    const rowData = allRanges[i];
    const dgId = rowData[resultsDgIdCol - 1];
    const playerName = rowData[playerCol - 1];
    const modelRank = rowData[modelRankCol - 1];
    const finishPos = String(rowData[finishPosCol - 1] || "");
    
    // Skip if missing essential data
    if (!playerName || !modelRank || !finishPos) {
      continue;
    }
    
    // Parse finish position
    let finishPosNum;
    if (finishPos.startsWith("T")) {
      finishPosNum = parseInt(finishPos.substring(1));
    } else {
      finishPosNum = parseInt(finishPos);
    }
    
    if (isNaN(finishPosNum)) {
      console.log(`Invalid finish position for ${playerName}: ${finishPos}`);
      continue;
    }
    
    // Start building notes for this player
    const notes = [];
    
    // 1. Basic Model vs Actual Performance
    if (modelRank <= 10 && finishPosNum <= 10) {
      notes.push(`🎯 Model prediction on target: #${modelRank} → ${finishPos}`);
    } else if (finishPosNum <= 10 && modelRank > 50) {
      notes.push(`⚠️ Major model miss: #${modelRank} → ${finishPos}`);
    } else if (modelRank <= 10 && finishPosNum > 50) {
      notes.push(`⚠️ Model overestimated performance`);
    } else if (Math.abs(modelRank - finishPosNum) > 30) {
      const direction = modelRank > finishPosNum ? "better" : "worse";
      notes.push(`${direction === "better" ? "↑" : "↓"} Finished ${direction} than predicted`);
    }
    
    // Check if we have trend data for this player
    if (!playerData[dgId]) {
      playersWithoutTrends++;
      
      // Write basic notes to the sheet
      if (notes.length > 0) {
        sheet.getRange(dataStartRow + i, notesCol)
          .setValue(notes.join(" | "))
          .setHorizontalAlignment("left")
          .setVerticalAlignment("middle")
          .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      }
      
      continue;
    }
    
    playersWithTrends++;
    
    // 2. Analyze trends for metrics in HAS_MODEL
    const trendAnalysis = [];
    
    // Check each trend to see if it corresponds to a metric in the results sheet
    for (const [trendName, trendValue] of Object.entries(playerData[dgId].trends)) {
      // Get the base metric name
      const metricName = trendName.replace(" Trend", "");
      
      // Skip if this metric isn't in the current sheet
      if (!columnMap[metricName]) {
        continue;
      }
      
      const currentValue = rowData[columnMap[metricName] - 1];
      
      // Skip if invalid performance data
      if (currentValue === undefined || currentValue === null || isNaN(currentValue)) {
        continue;
      }
      
      // Find standard deviation for this metric from cached groupStats
      let stdDev = null;
      let mean = null;
      
      // Search through all groups to find this metric
      if (groupStats) {
        for (const groupName in groupStats) {
          if (groupStats[groupName][metricName]) {
            stdDev = groupStats[groupName][metricName].stdDev;
            mean = groupStats[groupName][metricName].mean;
            break;
          }
        }
      }
      
      // Determine if trend is statistically significant
      let isTrendSignificant = false;
      let trendZScore = null;

      if (stdDev !== null && stdDev > 0) {
        // For trends, we typically expect smaller variations than the metric itself
        // A reasonable approach is to use 20-25% of the metric's standard deviation
        const trendStdDev = stdDev * 0.2;
        trendZScore = trendValue / trendStdDev;
        
        // Standard statistical significance threshold (95% confidence)
        isTrendSignificant = Math.abs(trendZScore) > 1.96;
      } else {
        // Fall back to the arbitrary threshold only if we don't have stdDev
        isTrendSignificant = Math.abs(trendValue) > 0.05;
      }

      // Skip if trend is not statistically significant
      if (!isTrendSignificant) {
        continue;
      }
            
      // For most metrics higher is better (except proximity)
      const isHigherBetter = !RESULTS_METRIC_TYPES.LOWER_BETTER.has(metricName);
      
      // Determine trend direction
      const isPositiveTrend = trendValue > 0;
      
      // Determine if current performance is good
      // For SG metrics, compare to zero (tour average)
      let isGoodPerformance;
      if (metricName.includes("SG")) {
        isGoodPerformance = isHigherBetter ? currentValue > 0 : currentValue < 0;
      } else if (mean !== null) {
        // Compare to cached mean
        isGoodPerformance = isHigherBetter ? currentValue > mean : currentValue < mean;
      } else {
        // Fallback - compare to zero or another reasonable baseline
        isGoodPerformance = isHigherBetter ? currentValue > 0 : currentValue < 0;
      }
      
      // Determine correlation
      const isCorrelationConfirmed = (isPositiveTrend && isGoodPerformance) || 
                                    (!isPositiveTrend && !isGoodPerformance);
      
      // Calculate a significance score
      const significanceScore = Math.abs(trendValue) * (isCorrelationConfirmed ? 2 : 1);
      
      trendAnalysis.push({
        metric: metricName, // Full metric name
        trendValue: trendValue,
        actualValue: currentValue,
        trendDirection: isPositiveTrend ? "improving" : "declining",
        performance: isGoodPerformance ? "good" : "poor",
        correlation: isCorrelationConfirmed ? "confirmed" : "contradicted",
        significance: significanceScore
      });
    }
    
    // Sort trend analysis by significance
    trendAnalysis.sort((a, b) => b.significance - a.significance);
    
    // Add up to three most significant trend correlations to notes
    if (trendAnalysis.length > 0) {
      // Process up to 3 trends
      const trendsToShow = Math.min(trendAnalysis.length, 3);
      
      // Add primary category indicator based on the most significant trend
      const primaryTrend = trendAnalysis[0];
      let category = getCategoryForMetric(primaryTrend.metric);
      
      if (category) {
        const directionArrow = primaryTrend.trendDirection === "improving" ? "↑" : "↓";
        notes.push(`${directionArrow} ${category}`);
      }
      
      // Add detailed trend notes
      for (let t = 0; t < trendsToShow; t++) {
        const trend = trendAnalysis[t];
        
        // Create a clear emoji indicator
        const trendEmoji = trend.trendDirection === "improving" ? "📈" : "📉";
        
        // Format the values for display
        const trendDisplay = Math.abs(trend.trendValue).toFixed(3);
        const actualDisplay = trend.metric.includes("SG") ? 
          trend.actualValue.toFixed(3) : trend.actualValue.toFixed(1);
        
        // Create the full note with the complete metric name
        const trendNote = `${trendEmoji} ${trend.metric}: ${trend.correlation === "confirmed" ? "trend continuing" : "trend reversing"} (${trendDisplay})`;
        
        notes.push(trendNote);
      }
    }
    
    // 3. Add WAR context if available
    if (playerData[dgId].war !== null && playerData[dgId].war !== undefined) {
      const war = playerData[dgId].war;
      if (war >= 1.0) {
        notes.push(`⭐ Elite performer (WAR: ${war.toFixed(1)})`);
      } else if (war >= 0.5) {
        notes.push(`↑ Above average performer`);
      } else if (war <= -0.5) {
        notes.push(`↓ Below average performer`);
      }
    }
    
    // 4. Add model alignment note
    const performedWell = finishPosNum <= 20;
    const predictedWell = modelRank <= 20;
    
    if (performedWell && predictedWell) {
      notes.push("✅ Success aligned with model");
    } else if (performedWell && !predictedWell) {
      notes.push("⚠️ Success despite model prediction");
    } else if (!performedWell && predictedWell) {
      notes.push("❌ Underperformed model prediction");
    }
    
    // Write notes to the sheet
    if (notes.length > 0) {
      sheet.getRange(dataStartRow + i, notesCol)
        .setValue(notes.join(" | "))
        .setHorizontalAlignment("left")
        .setVerticalAlignment("middle")
        .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    }
  }
      
  console.log("Completed addAnalysisNotes function");
}

/**
 * Retrieves cached group statistics if available and not expired
 * @param {number} maxAgeInDays - Maximum age of cached data in days
 * @return {Object|null} The cached group stats or null if unavailable/expired
 */
function getCachedGroupStats(maxAgeInDays = 7) {
  const cachedJson = PropertiesService.getScriptProperties().getProperty("groupStatsCache");
  
  if (!cachedJson) {
    console.log("No cached group statistics found");
    return null;
  }
  
  try {
    const cached = JSON.parse(cachedJson);
    
    // Check if cache is expired
    const maxAgeMs = maxAgeInDays * 24 * 60 * 60 * 1000;
    const currentTime = new Date().getTime();
    const cacheAge = currentTime - cached.timestamp;
    
    if (cacheAge > maxAgeMs) {
      console.log(`Cached stats are too old (${(cacheAge/(24*60*60*1000)).toFixed(1)} days)`);
      return null;
    }
    
    console.log(`Using cached group statistics (${(cacheAge/(24*60*60*1000)).toFixed(1)} days old)`);
    return cached.groupStats;
  } catch (e) {
    console.error("Error retrieving cached group statistics:", e);
    return null;
  }
}

/**
 * Helper function to find column index by header name
 * @param {Array} headers - The array of header values
 * @param {string} name - The name to search for
 * @return {number} The index of the column or -1 if not found
 */
function findColumnIndex(headers, name) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] && String(headers[i]).includes(name)) {
      return i;
    }
  }
  return -1;
}

/**
 * Helper function to get category for a metric
 * @param {string} metricName - The name of the metric
 * @return {string} The category name or empty string if not categorized
 */
function getCategoryForMetric(metricName) {
  if (!metricName) return "";
  
  const metricLower = metricName.toLowerCase();
  
  if (metricLower.includes("ott") || metricLower.includes("driving")) {
    return "Driving";
  } else if (metricLower.includes("approach") || metricLower.includes("iron")) {
    return "Approach";
  } else if (metricLower.includes("around") || metricLower.includes("arg") || metricLower.includes("short game")) {
    return "Short Game";
  } else if (metricLower.includes("putting") || metricLower.includes("putt")) {
    return "Putting";
  } else if (metricLower.includes("total") || metricLower.includes("t2g")) {
    return "Overall";
  } else if (metricLower.includes("gir") || metricLower.includes("greens")) {
    return "Approach";
  } else if (metricLower.includes("proximity") || metricLower.includes("prox")) {
    return "Approach";
  }
  
  return "";
}


