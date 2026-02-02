// Archive of unused or rarely used functions from utilities_tournamentValidation.js
// These are preserved for possible future use or reference.

function loadTournamentPredictions(ss) {
  Logger.log("[loadTournamentPredictions] Called with ss: %s", ss ? ss.getName && ss.getName() : typeof ss);
  try {
    var sheetName = "Player Ranking Model";
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`[loadTournamentPredictions] Sheet '${sheetName}' not found`);
      return { error: `Sheet \"${sheetName}\" not found` };
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

function debugScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProps = scriptProperties.getProperties();
  Logger.log("Script Properties: %s", JSON.stringify(allProps, null, 2));
}

function logScriptId() {
  const id = ScriptApp.getScriptId();
  Logger.log("Script ID: %s", id);
}
