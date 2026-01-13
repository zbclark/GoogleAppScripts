/**
 * Tournament-Specific Analysis Module
 * FOR TRACKING SHEET - Analyzes all 2025+ tournament predictions vs results
 * Loads data from Google Drive tournament workbooks
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
    
    // Player Ranking Model: Rank=B, DG ID=C, Player Name=D
    // So we read C6:D (DG ID and Player Name)
    const data = sheet.getRange("C6:D" + sheet.getLastRow()).getValues();
    
    console.log(`Loading predictions from ${sheetName}: lastRow=${sheet.getLastRow()}, dataRows=${data.length}`);
    if (data.length > 0) {
      console.log(`First prediction row: ${JSON.stringify(data[0])}`);
    }
    
    const predictions = data
      .map((row, idx) => ({
        rank: idx + 1,
        dgId: String(row[0]).trim(),  // Column C = DG ID
        name: String(row[1]).trim()   // Column D = Player Name
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
    
    console.log(`Loading results from ${sheetName}: lastRow=${lastRow}, dataRows=${data.length}`);
    
    if (data.length === 0) {
      return { error: `No data found in ${sheetName}` };
    }
    
    // Log first few rows
    console.log(`First result row: ${JSON.stringify(data[0])}`);
    
    const results = data
      .map((row, idx) => {
        // Skip empty rows
        if (!row[0]) return null;
        
        const positionValue = row[3];
        let position = Number(positionValue);
        // For non-numeric positions (CUT, WD, etc), use a high number for sorting
        if (isNaN(position)) {
          position = 999; // CUT, WD, etc get position 999
        }
        
        return {
          dgId: String(row[0]).trim(),  // Column B = DG ID
          name: String(row[1]).trim(),  // Column C = Player Name
          modelRank: row[2],             // Column D = Model Rank
          position: position,            // Column E = Finish Position (or 999 for CUT)
          positionText: String(positionValue).trim() // Original position text
        };
      })
      .filter(r => r && r.dgId && r.dgId !== "")
      .slice(0, 300); // Increased to capture more results
    
    return {
      count: results.length,
      results: results
    };
  } catch (e) {
    return { error: `Error loading results: ${e.message}` };
  }
}

/**
 * Loads tournament configuration
 */
function loadTournamentConfig(fileId) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const configSheet = ss.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      return {};
    }
    
    const weights = {};
    const configRange = configSheet.getRange("A1:B100").getValues();
    
    for (let i = 0; i < configRange.length; i++) {
      const label = (configRange[i][0] || "").toString().toLowerCase();
      const value = configRange[i][1];
      
      if (label.includes("sg total") && label.includes("weight")) weights.sgTotalWeight = value;
      if (label.includes("approach") && label.includes("weight")) weights.approachWeight = value;
      if (label.includes("putting") && label.includes("weight")) weights.puttingWeight = value;
      if (label.includes("scoring") && label.includes("weight")) weights.scoringWeight = value;
      if ((label.includes("past") || label.includes("historical")) && label.includes("weight")) weights.pastPerfWeight = value;
    }
    
    return weights;
  } catch (e) {
    return {};
  }
}

/**
 * Validates a single tournament
 */
function validateSingleTournament(fileId, tournamentName) {
  try {
    const predictionsResult = loadTournamentPredictions(fileId);
    const resultsResult = loadTournamentResults(fileId);
    const config = loadTournamentConfig(fileId);
    
    if (predictionsResult.error || resultsResult.error) {
      return {
        error: predictionsResult.error || resultsResult.error,
        tournament: tournamentName
      };
    }
    
    const predictions = predictionsResult.predictions;
    const results = resultsResult.results;
    
    // Log for debugging
    console.log(`${tournamentName}: ${predictions.length} predictions, ${results.length} results`);
    
    // Match predictions to results - include CUT players for tracking
    const unmatched = [];
    const matches = predictions
      .map(p => {
        const result = results.find(r => r.dgId === p.dgId);
        if (!result) {
          unmatched.push({
            dgId: p.dgId,
            name: p.name,
            predictedRank: p.rank
          });
        }
        return result ? {
          dgId: p.dgId,
          name: p.name,
          predictedRank: p.rank,
          actualPosition: result.position,
          positionText: result.positionText,
          isCut: result.position === 999
        } : null;
      })
      .filter(m => m !== null);
    
    console.log(`${tournamentName}: Total predictions: ${predictions.length}, Total results: ${results.length}`);
    console.log(`${tournamentName}: Sample predictions dgIds (first 5): ${predictions.slice(0, 5).map(p => `"${p.dgId}"`).join(", ")}`);
    console.log(`${tournamentName}: Sample results dgIds (first 5): ${results.slice(0, 5).map(r => `"${r.dgId}"`).join(", ")}`);
    console.log(`${tournamentName}: ${matches.length} matched players out of ${results.length} results`);
    
    const cutCount = matches.filter(m => m.isCut).length;
    const finishedCount = matches.length - cutCount;
    console.log(`${tournamentName}: ${finishedCount} finished, ${cutCount} cut`);
    
    if (unmatched.length > 0 && unmatched.length <= 10) {
      console.log(`${tournamentName}: Unmatched players from predictions (${unmatched.length}):`);
      unmatched.forEach(u => console.log(`  "${u.dgId}" (${u.name}, rank ${u.predictedRank})`));
    }
    
    // Also check if results dgIds are in predictions
    const resultsNotInPredictions = results.filter(r => 
      !predictions.find(p => p.dgId === r.dgId)
    );
    if (resultsNotInPredictions.length > 0 && resultsNotInPredictions.length <= 10) {
      console.log(`${tournamentName}: Results NOT in predictions (${resultsNotInPredictions.length}):`);
      resultsNotInPredictions.forEach(r => console.log(`  "${r.dgId}" (${r.name}, position ${r.positionText})`));
    }
    
    if (matches.length === 0) {
      return {
        error: "No matching players between predictions and results",
        tournament: tournamentName
      };
    }
    
    // Filter to only finished players for ranking metrics (exclude CUT)
    const finishedMatches = matches.filter(m => !m.isCut);
    
    if (finishedMatches.length === 0) {
      return {
        error: "No finished players in results (all cut or withdrew)",
        tournament: tournamentName,
        matchedPlayers: matches.length,
        totalPredictions: predictions.length,
        totalResults: results.length,
        correlation: 0,
        rmse: 0,
        mae: 0,
        topTenAccuracy: 0,
        topTwentyAccuracy: 0
      };
    }
    
    // Calculate metrics only on finished players
    const predictedArray = finishedMatches.map(m => Number(m.predictedRank));
    const actualArray = finishedMatches.map(m => Number(m.actualPosition));
    
    // Check for NaN values
    const hasNaN = predictedArray.some(v => isNaN(v)) || actualArray.some(v => isNaN(v));
    if (hasNaN) {
      return {
        error: `Invalid data: NaN found in predictions or results`,
        tournament: tournamentName
      };
    }
    
    // Pearson correlation
    const meanPredicted = predictedArray.reduce((a, b) => a + b, 0) / predictedArray.length;
    const meanActual = actualArray.reduce((a, b) => a + b, 0) / actualArray.length;
    
    const numerator = finishedMatches.reduce((sum, m) => 
      sum + (Number(m.predictedRank) - meanPredicted) * (Number(m.actualPosition) - meanActual), 0);
    const denominator = Math.sqrt(
      finishedMatches.reduce((sum, m) => sum + (Number(m.predictedRank) - meanPredicted) ** 2, 0) *
      finishedMatches.reduce((sum, m) => sum + (Number(m.actualPosition) - meanActual) ** 2, 0)
    );
    
    const correlation = denominator === 0 ? 0 : numerator / denominator;
    
    // RMSE and MAE
    const rmse = Math.sqrt(finishedMatches.reduce((sum, m) => 
      sum + (m.predictedRank - m.actualPosition) ** 2, 0) / finishedMatches.length);
    const mae = finishedMatches.reduce((sum, m) => 
      sum + Math.abs(m.predictedRank - m.actualPosition), 0) / finishedMatches.length;
    
    // Top-10 and Top-20 accuracy: percentage of top finishers correctly identified
    // Count how many were top-10 in both prediction AND actual result
    const topTenMatches = finishedMatches.filter(m => m.predictedRank <= 10 && m.actualPosition <= 10).length;
    const topTwentyMatches = finishedMatches.filter(m => m.predictedRank <= 20 && m.actualPosition <= 20).length;
    
    // Accuracy = correct predictions / total actual top finishers
    const topTenActualCount = finishedMatches.filter(m => m.actualPosition <= 10).length;
    const topTwentyActualCount = finishedMatches.filter(m => m.actualPosition <= 20).length;
    
    const topTenAccuracy = topTenActualCount > 0 ? (topTenMatches / topTenActualCount) * 100 : 0;
    const topTwentyAccuracy = topTwentyActualCount > 0 ? (topTwentyMatches / topTwentyActualCount) * 100 : 0;
    
    return {
      tournament: tournamentName,
      fileId: fileId,
      config: config,
      matchedPlayers: matches.length,
      finishedPlayers: finishedMatches.length,
      cutPlayers: matches.filter(m => m.isCut).length,
      totalPredictions: predictions.length,
      totalResults: results.length,
      correlation: parseFloat(correlation.toFixed(3)),
      rmse: parseFloat(rmse.toFixed(2)),
      mae: parseFloat(mae.toFixed(2)),
      topTenAccuracy: parseFloat(topTenAccuracy.toFixed(1)),
      topTwentyAccuracy: parseFloat(topTwentyAccuracy.toFixed(1))
    };
  } catch (e) {
    return { error: `Validation error: ${e.message}`, tournament: tournamentName };
  }
}

/**
 * Validates all tournaments, skipping those without results
 */
function validateAllTournaments() {
  const workbooksResult = listAvailableTournamentWorkbooks();
  
  if (workbooksResult.error) {
    return { error: workbooksResult.error };
  }
  
  const results = [];
  const skipped = [];
  
  for (const tournament of workbooksResult.tournaments) {
    // Check if this tournament has a Tournament Results sheet
    try {
      const ss = SpreadsheetApp.openById(tournament.id);
      const resultsSheet = ss.getSheetByName("Tournament Results");
      
      if (!resultsSheet) {
        skipped.push({
          name: tournament.name,
          reason: "No Tournament Results sheet (results not posted yet)"
        });
        continue;
      }
      
      const validation = validateSingleTournament(tournament.id, tournament.name);
      results.push(validation);
    } catch (e) {
      skipped.push({
        name: tournament.name,
        reason: `Error accessing workbook: ${e.message}`
      });
    }
  }
  
  const successfulResults = results.filter(r => !r.error);
  const failedResults = results.filter(r => r.error);
  
  if (successfulResults.length === 0) {
    return { 
      error: "No successful validations",
      skipped: skipped
    };
  }
  
  const avgCorrelation = successfulResults.reduce((sum, r) => sum + r.correlation, 0) / successfulResults.length;
  const avgRMSE = successfulResults.reduce((sum, r) => sum + r.rmse, 0) / successfulResults.length;
  const avgMAE = successfulResults.reduce((sum, r) => sum + r.mae, 0) / successfulResults.length;
  const avgTopTen = successfulResults.reduce((sum, r) => sum + r.topTenAccuracy, 0) / successfulResults.length;
  const avgTopTwenty = successfulResults.reduce((sum, r) => sum + r.topTwentyAccuracy, 0) / successfulResults.length;
  
  const bestTournament = successfulResults.reduce((prev, current) => 
    prev.correlation > current.correlation ? prev : current);
  const worstTournament = successfulResults.reduce((prev, current) => 
    prev.correlation < current.correlation ? prev : current);
  
  return {
    totalTournaments: workbooksResult.count,
    tournamentsValidated: successfulResults.length,
    tournamentsSkipped: skipped.length,
    successfulValidations: successfulResults.length,
    failedValidations: failedResults.length,
    averageCorrelation: parseFloat(avgCorrelation.toFixed(3)),
    averageRMSE: parseFloat(avgRMSE.toFixed(2)),
    averageMAE: parseFloat(avgMAE.toFixed(2)),
    averageTopTenAccuracy: parseFloat(avgTopTen.toFixed(1)),
    averageTopTwentyAccuracy: parseFloat(avgTopTwenty.toFixed(1)),
    bestTournament: bestTournament,
    worstTournament: worstTournament,
    individualResults: successfulResults,
    failedResults: failedResults,
    skippedTournaments: skipped
  };
}
