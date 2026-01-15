/**
 * Utilities: Data Loading
 * Consolidated data loading functions used across phases
 * 
 * Functions (from tournamentAnalysis.gs):
 * - listAvailableTournamentWorkbooks() - Find all tournament files
 * - loadTournamentPredictions() - Load from Player Ranking Model sheet
 * - loadTournamentResults() - Load from Tournament Results sheet
 * - loadTournamentConfig() - Load from Configuration Sheet
 * - validateSingleTournament() - Single tournament validation
 * - validateAllTournaments() - All tournaments validation
 */

/**
 * Lists all tournament workbooks in the Golf 2025 folder
 */
function listAvailableTournamentWorkbooks() {
  try {
    const folders = DriveApp.getFoldersByName("Golf 2025");
    
    if (!folders.hasNext()) {
      return { error: "Golf 2025 folder not found in Google Drive" };
    }
    
    const golfFolder = folders.next();
    const files = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    const tournaments = [];
    
    while (files.hasNext()) {
      const file = files.next();
      tournaments.push({
        name: file.getName(),
        id: file.getId(),
        url: file.getUrl(),
        lastModified: file.getLastUpdated()
      });
    }
    
    tournaments.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      count: tournaments.length,
      tournaments: tournaments,
      folderUrl: golfFolder.getUrl()
    };
  } catch (e) {
    return { error: `Error accessing Google Drive: ${e.message}` };
  }
}

/**
 * Loads predictions from a tournament workbook
 */
function loadTournamentPredictions(fileId, sheetName = "Player Ranking Model") {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { error: `Sheet "${sheetName}" not found` };
    }
    
    const data = sheet.getRange("C6:D" + sheet.getLastRow()).getValues();
    
    console.log(`Loading predictions from ${sheetName}: lastRow=${sheet.getLastRow()}, dataRows=${data.length}`);
    if (data.length > 0) {
      console.log(`First prediction row: ${JSON.stringify(data[0])}`);
    }
    
    const predictions = data
      .map((row, idx) => ({
        rank: idx + 1,
        dgId: String(row[0]).trim(),
        name: String(row[1]).trim()
      }))
      .filter(p => p.dgId && p.dgId !== "" && p.name && p.name !== "")
      .slice(0, 150);
    
    console.log(`Loaded ${predictions.length} predictions`);
    
    return {
      count: predictions.length,
      predictions: predictions
    };
  } catch (e) {
    return { error: `Error loading predictions: ${e.message}` };
  }
}

/**
 * Loads actual results from a tournament workbook
 */
function loadTournamentResults(fileId, sheetName = "Tournament Results") {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { error: `Sheet "${sheetName}" not found` };
    }
    
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange("B6:E" + lastRow).getValues();
    
    const results = data
      .map(row => ({
        dgId: String(row[0]).trim(),
        name: String(row[1]).trim(),
        finishStr: String(row[2]).trim(),
        finish: parseInt(row[3]) || null
      }))
      .filter(r => r.dgId && r.dgId !== "" && r.finish !== null)
      .slice(0, 200);
    
    console.log(`Loaded ${results.length} results`);
    
    return {
      count: results.length,
      results: results
    };
  } catch (e) {
    return { error: `Error loading results: ${e.message}` };
  }
}

/**
 * Loads configuration from a tournament workbook
 */
function loadTournamentConfig(fileId) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const configSheet = ss.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      return { error: "Configuration Sheet not found" };
    }
    
    // Read config data
    const config = {
      eventId: configSheet.getRange("G9").getValue(),
      courseType: configSheet.getRange("G10").getValue(),
      courseName: configSheet.getRange("G11").getValue()
    };
    
    return config;
  } catch (e) {
    return { error: `Error loading config: ${e.message}` };
  }
}

/**
 * Validates a single tournament's predictions vs actual results
 */
function validateSingleTournament(fileId, tournamentName) {
  try {
    const predictions = loadTournamentPredictions(fileId);
    const results = loadTournamentResults(fileId);
    
    if (predictions.error || results.error) {
      return { error: predictions.error || results.error };
    }
    
    // Match predictions to results
    const matchedPlayers = [];
    predictions.predictions.forEach(pred => {
      const result = results.results.find(r => r.dgId === pred.dgId);
      if (result) {
        matchedPlayers.push({
          name: pred.name,
          predictedRank: pred.rank,
          actualFinish: result.finish,
          error: Math.abs(pred.rank - result.finish)
        });
      }
    });
    
    // Calculate metrics
    const top10Predictions = matchedPlayers.filter(p => p.predictedRank <= 10);
    const top10Actual = matchedPlayers.filter(p => p.actualFinish <= 10);
    const top10Hit = top10Predictions.filter(p => p.actualFinish <= 10).length;
    
    return {
      tournament: tournamentName,
      totalMatched: matchedPlayers.length,
      top10Accuracy: top10Predictions.length > 0 ? (top10Hit / top10Predictions.length * 100).toFixed(1) : 0,
      avgError: (matchedPlayers.reduce((sum, p) => sum + p.error, 0) / matchedPlayers.length).toFixed(1),
      matchedPlayers: matchedPlayers
    };
  } catch (e) {
    return { error: `Error validating tournament: ${e.message}` };
  }
}

/**
 * Validates all tournaments
 */
function validateAllTournaments() {
  try {
    const available = listAvailableTournamentWorkbooks();
    
    if (available.error) {
      return { error: available.error };
    }
    
    const results = [];
    available.tournaments.forEach(tournament => {
      const validation = validateSingleTournament(tournament.id, tournament.name);
      if (!validation.error) {
        results.push(validation);
      }
    });
    
    return {
      totalTournaments: results.length,
      results: results
    };
  } catch (e) {
    return { error: `Error validating all tournaments: ${e.message}` };
  }
}
