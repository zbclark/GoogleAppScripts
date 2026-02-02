// ====== UTILITIES FOR SINGLE TOURNAMENT VALIDATION ======

/**
 * Loads predictions from the active tournament workbook
 */
function loadTournamentPredictions(ss) {
  Logger.log("[loadTournamentPredictions] Called with ss: %s", ss ? ss.getName && ss.getName() : typeof ss);
  try {
    var sheetName = "Player Ranking Model";
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`[loadTournamentPredictions] Sheet '${sheetName}' not found`);
      return { error: `Sheet "${sheetName}" not found` };
    }
    const data = sheet.getRange("C6:D" + sheet.getLastRow()).getValues();
    Logger.log(`[loadTournamentPredictions] Data loaded: %s rows`, data.length);
    const predictions = data
      .map((row, idx) => ({
        rank: idx + 1,
        dgId: String(row[0]).trim(),
        name: String(row[1]).trim()
      }))
      .filter(p => p.dgId && p.dgId !== "" && p.name && p.name !== "")
      .slice(0, 150);
    Logger.log(`[loadTournamentPredictions] Predictions array: %s`, JSON.stringify(predictions));
    return {
      count: predictions.length,
      predictions: predictions
    };
  } catch (e) {
    Logger.log(`[loadTournamentPredictions] Error: %s`, e.message);
    return { error: `Error loading predictions: ${e.message}` };
  }
}

/**
 * Loads actual results from the active tournament workbook
 */
function loadTournamentResults() {
  try {
    var sheetName = "Tournament Results";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { error: `Sheet "${sheetName}" not found` };
    }
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange("B6:E" + lastRow).getValues();
    const results = data
      .map(row => {
        const dgId = String(row[0]).trim();
        const name = String(row[1]).trim();
        const modelRank = String(row[2]).trim();
        const finishRaw = String(row[3]).trim();
        let finishPos = null;
        if (finishRaw === '' || finishRaw.toUpperCase() === 'CUT' || finishRaw.toUpperCase() === 'WD') {
          finishPos = null;
        } else if (/^T?-?\s?(\d+)/i.test(finishRaw)) {
          // Handles 'T5', 'T-5', 'T 5', etc.
          const tieMatch = finishRaw.match(/^T?-?\s?(\d+)/i);
          if (tieMatch) finishPos = parseInt(tieMatch[1]);
        } else if (/(\d+)T$/i.test(finishRaw)) {
          // Handles '5T'
          const tieMatch = finishRaw.match(/(\d+)T$/i);
          if (tieMatch) finishPos = parseInt(tieMatch[1]);
        } else if (!isNaN(parseInt(finishRaw))) {
          finishPos = parseInt(finishRaw);
        }
        return {
          dgId,
          name,
          modelRank,
          finishPos
        };
      })
      .filter(r => r.dgId && r.dgId !== "" && r.finishPos !== null)
      .slice(0, 200);
    return {
      count: results.length,
      results: results
    };
  } catch (e) {
    return { error: `Error loading results: ${e.message}` };
  }
}

/**
 * Loads configuration from the active tournament workbook
 */
function loadTournamentConfig() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName("Configuration Sheet");
    if (!configSheet) {
      return { error: "Configuration Sheet not found" };
    }
    // Read config data
    const config = {
      eventId: configSheet.getRange("G9").getValue(),
    };
    return config;
  } catch (e) {
    return { error: `Error loading config: ${e.message}` };
  }
}

/**
 * Dynamically determine the tournament type and weights based on the eventId.
 * @returns {Object} - The selected weight template.
 */
function determineTournamentWeights(groupName, metricName) {
  const config = loadTournamentConfig();
  if (config.error) {
    throw new Error(config.error);
  }

  const selectedTemplate = getWeightTemplate(config.eventId);
  console.log(`Selected template: ${selectedTemplate.name}`);

  // Extract the weight for the specific group and metric
  const metricWeights = {};
  if (
    selectedTemplate.metricWeights[groupName] &&
    selectedTemplate.metricWeights[groupName][metricName]
  ) {
    metricWeights[metricName] =
      selectedTemplate.metricWeights[groupName][metricName].weight;
  } else {
    console.error(
      `Error: Metric '${metricName}' not found in group '${groupName}'.`
    );
  }

  return metricWeights;
}

/**
 * Validates a single tournament's predictions vs actual results
 */
function validateSingleTournament() {
  try {
    const config = loadTournamentConfig();
    const predictions = loadTournamentPredictions();
    const results = loadTournamentResults();
    if (predictions.error || results.error) {
      return { error: predictions.error || results.error };
    }

    // Determine tournament weights
    const weights = determineTournamentWeights();

    // Match predictions to results
    const matchedPlayers = [];
    predictions.predictions.forEach(pred => {
      const result = results.results.find(r => r.dgId === pred.dgId);
      if (result) {
        matchedPlayers.push({
          ...pred,
          finish: result.finish,
          weights: weights
        });
      }
    });

    return {
      matchedPlayers,
      weights
    };
  } catch (e) {
    return { error: `Error validating tournament: ${e.message}` };
  }
}

/**
 * Read metric weights from a tournament's Configuration Sheet
 * Each tournament workbook has its own unique weights
 */
function getTournamentConfigurationWeights(ss) {
  try {
    if (!ss) {
      console.log("⚠️ No tournament workbook provided");
      return {};
    }
    
    const configSheet = ss.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      console.log("⚠️ Configuration Sheet not found in tournament workbook");
      return {};
    }
    
    // Read individual metric weights from columns G-O (loaded by template)
    const metricWeights = {};
    
    // Driving Performance (Row 16, Columns G-I)
    metricWeights["Driving Distance"] = configSheet.getRange("G16").getValue() || 0;
    metricWeights["Driving Accuracy"] = configSheet.getRange("H16").getValue() || 0;
    metricWeights["SG OTT"] = configSheet.getRange("I16").getValue() || 0;
    
    // Approach - Short (<100) (Row 17, Columns G-I)
    metricWeights["Approach <100 GIR"] = configSheet.getRange("G17").getValue() || 0;
    metricWeights["Approach <100 SG"] = configSheet.getRange("H17").getValue() || 0;
    metricWeights["Approach <100 Prox"] = configSheet.getRange("I17").getValue() || 0;
    
    // Approach - Mid (<150 FW) (Row 18, Columns G-I)
    metricWeights["Approach <150 FW GIR"] = configSheet.getRange("G18").getValue() || 0;
    metricWeights["Approach <150 FW SG"] = configSheet.getRange("H18").getValue() || 0;
    metricWeights["Approach <150 FW Prox"] = configSheet.getRange("I18").getValue() || 0;
    
    // Approach - Long (150-200 FW) (Row 19, Columns G-I)
    metricWeights["Approach <200 FW GIR"] = configSheet.getRange("G19").getValue() || 0;
    metricWeights["Approach <200 FW SG"] = configSheet.getRange("H19").getValue() || 0;
    metricWeights["Approach <200 FW Prox"] = configSheet.getRange("I19").getValue() || 0;
    
    // Approach - Very Long (>200 FW) (Row 20, Columns G-I)
    metricWeights["Approach >200 FW GIR"] = configSheet.getRange("G20").getValue() || 0;
    metricWeights["Approach >200 FW SG"] = configSheet.getRange("H20").getValue() || 0;
    metricWeights["Approach >200 FW Prox"] = configSheet.getRange("I20").getValue() || 0;
    
    // Putting (Row 21, Column G)
    metricWeights["SG Putting"] = configSheet.getRange("G21").getValue() || 0;

    // Around the Green (Row 22, Columnn G)
    metricWeights["SG Around Green"] = configSheet.getRange("G22").getValue() || 0;

    // Scoring (Row 23, Column G-O) - Context-based SG metrics
    metricWeights["SG Total"] = configSheet.getRange("G23").getValue() || 0;
    metricWeights["Scoring Average"] = configSheet.getRange("H23").getValue() || 0;
    metricWeights["Birdie Chances Created"] = configSheet.getRange("I23").getValue() || 0;
    metricWeights["Scoring - Approach <100 SG"] = configSheet.getRange("J23").getValue() || 0;
    metricWeights["Scoring - Approach <150 FW SG"] = configSheet.getRange("K23").getValue() || 0;
    metricWeights["Scoring - Approach <150 Rough SG"] = configSheet.getRange("L23").getValue() || 0;
    metricWeights["Scoring - Approach >150 Rough SG"] = configSheet.getRange("M23").getValue() || 0;
    metricWeights["Scoring - Approach <200 FW SG"] = configSheet.getRange("N23").getValue() || 0;
    metricWeights["Scoring - Approach >200 FW SG"] = configSheet.getRange("O23").getValue() || 0;

    // Course Management (Row 24, Columns G-O) - Context-based Prox metrics
    metricWeights["Scrambling"] = configSheet.getRange("G24").getValue() || 0;
    metricWeights["Great Shots"] = configSheet.getRange("H24").getValue() || 0;
    metricWeights["Poor Shot Avoidance"] = configSheet.getRange("I24").getValue() || 0;
    metricWeights["Course Management - Approach <100 Prox"] = configSheet.getRange("J24").getValue() || 0;
    metricWeights["Course Management - Approach <150 FW Prox"] = configSheet.getRange("K24").getValue() || 0;
    metricWeights["Course Management - Approach <150 Rough Prox"] = configSheet.getRange("L24").getValue() || 0;
    metricWeights["Course Management - Approach >150 Rough Prox"] = configSheet.getRange("M24").getValue() || 0;
    metricWeights["Course Management - Approach <200 FW Prox"] = configSheet.getRange("N24").getValue() || 0;
    metricWeights["Course Management - Approach >200 FW Prox"] = configSheet.getRange("O24").getValue() || 0;
    
    console.log(`Config weights loaded: ${Object.keys(metricWeights).length} metrics`);
    return metricWeights;
  } catch (e) {
    console.log(`Error reading tournament config weights: ${e.message}`);
    return {};
  }
}
    
/**
 * Calculate Pearson correlation coefficient
 * Negative correlation with position = better metric (lower position = better rank)
 */
function calculatePearsonCorrelation(positions, values) {
  const n = positions.length;
  if (n < 2) return 0;
  
  // In golf, lower position number = better (1 is winner, 150 is worst)
  // To get proper correlation, negate positions so higher value = better
  const invertedPositions = positions.map(p => -p);
  
  const meanPos = invertedPositions.reduce((a, b) => a + b, 0) / n;
  const meanVal = values.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let sumSquaredPos = 0;
  let sumSquaredVal = 0;
  
  for (let i = 0; i < n; i++) {
    const posDiff = invertedPositions[i] - meanPos;
    const valDiff = values[i] - meanVal;
    
    numerator += posDiff * valDiff;
    sumSquaredPos += posDiff * posDiff;
    sumSquaredVal += valDiff * valDiff;
  }
  
  const denominator = Math.sqrt(sumSquaredPos * sumSquaredVal);
  
  if (denominator === 0) return 0;
  
  return numerator / denominator;
}

// Add RMSE calculation helper
function calculateRMSE(predicted, actual) {
    if (!predicted || !actual || predicted.length !== actual.length || predicted.length === 0) return NaN;
    let sumSq = 0;
    for (let i = 0; i < predicted.length; i++) {
        const diff = predicted[i] - actual[i];
        sumSq += diff * diff;
    }
    return Math.sqrt(sumSq / predicted.length);
}

// Function to get all metrics grouped by their category
function getMetricGroupings() {
  return {
    "Driving Performance": [
      "Driving Distance", "Driving Accuracy", "SG OTT"
    ],
    "Approach - Short (<100)": [
      "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox"
    ],
    "Approach - Mid (100-150)": [
      "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox"
    ],
    "Approach - Long (150-200)": [
      "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox"
    ],
    "Approach - Very Long (>200)": [
      "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox"
    ],
    "Putting": [
      "SG Putting"
    ],
    "Around the Green": [
      "SG Around Green"
    ],
    "Scoring": [
      "SG Total", "Scoring Average", "Birdie Chances Created", "Approach <100 SG", "Approach <150 FW SG",
      "Approach <150 Rough SG", "Approach >150 Rough SG", "Approach <200 FW SG", "Approach >200 FW SG"
      
    ],
    "Course Management": [
      "Scrambling", "Great Shots", "Poor Shot Avoidance", "Approach <100 Prox", "Approach <150 FW Prox",
      "Approach <150 Rough Prox", "Approach >150 Rough Prox", "Approach <200 FW Prox", "Approach >200 FW Prox"
    ]
  };
}

/**
 * Dynamically select the appropriate weight template based on eventId or default to BALANCED.
 * @param {string} eventId - The event ID to match.
 * @returns {Object} - The selected weight template.
 */
function getWeightTemplate(eventId) {
    // Iterate through WEIGHT_TEMPLATES to find a matching eventId
    for (const key in WEIGHT_TEMPLATES) {
        if (WEIGHT_TEMPLATES[key].eventId === eventId) {
            return WEIGHT_TEMPLATES[key];
        }
    }
    // Default to BALANCED if no specific match is found
    return WEIGHT_TEMPLATES.BALANCED;
}

/**
 * Get the group name for a specific metric
 */
function getMetricGroup(metricName) {
  const groupings = getMetricGroupings();
  for (const [groupName, metrics] of Object.entries(groupings)) {
    if (metrics.includes(metricName)) {
      return groupName;
    }
  }
  return null;
}


function setEventId(eventId) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('EVENT_ID', eventId);
  console.log(`Event ID set to: ${getEventId()}`);
  return true
}

function getEventId() {
  const scriptProperties = PropertiesService.getScriptProperties();
  var eventId = scriptProperties.getProperty('EVENT_ID');
  return eventId;
}

function setYear(year) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('YEAR', year);
  console.log(`Year set to: ${getYear()}`);
  return true;
}

function getYear() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const year = scriptProperties.getProperty('YEAR');
  return year;
}

function debugScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allKeys = scriptProperties.getKeys();
  Logger.log("All Script Properties:");
  allKeys.forEach(key => {
    Logger.log(key + ": " + scriptProperties.getProperty(key));
  });
}

function logScriptId() {
  try {
    Logger.log("Script ID: " + ScriptApp.getScriptId());
  } catch (e) {
    Logger.log("Script ID not available in this context.");
  }
}
