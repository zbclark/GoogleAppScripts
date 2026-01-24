// Consolidated archive of unused or rarely used functions from Golf_Algorithm_Library
// These are preserved for possible future use or reference.

// ========== From algorithmValidation_archive.js ==========

function validatePlayerDataQuality(playerData) {
  const warnings = [];
  let confidence = 1.0; // Start at full confidence
  const suggestions = [];
  if (!playerData) {
    return {
      isValid: false,
      confidence: 0,
      warnings: ["No player data provided"],
      suggestions: []
    };
  }
  const recentEvents = (playerData.events || []).filter(e => isWithinMonths(e.date || e.year, 12));
  if (recentEvents.length < 5) {
    warnings.push(`Only ${recentEvents.length} events in last 12 months`);
    suggestions.push("Player needs more recent tournament data for reliable predictions");
    confidence *= 0.6;
  } else if (recentEvents.length < 10) {
    warnings.push(`${recentEvents.length} events in last 12 months (ideal: 10+)`);
    confidence *= 0.85;
  }
  const totalRounds = (playerData.historicalRounds || []).length;
  const totalEvents = (playerData.events || []).length;
  if (totalEvents > 0) {
    const avgRoundsPerEvent = totalRounds / totalEvents;
    if (avgRoundsPerEvent < 3.0) {
      warnings.push(`Incomplete round data (avg ${avgRoundsPerEvent.toFixed(1)} rounds/event)`);
      confidence *= 0.75;
    }
  }
  const metrics = playerData.metrics || [];
  const nonZeroMetrics = metrics.filter(m => m !== 0 && m !== null).length;
  const metricCoverage = metrics.length > 0 ? nonZeroMetrics / metrics.length : 0;
  if (metricCoverage < 0.7) {
    warnings.push(`Low metric coverage: ${(metricCoverage * 100).toFixed(0)}% of metrics available`);
    suggestions.push("Player missing data for some key performance metrics");
    confidence *= 0.8;
  }
  if (playerData.similarCourseRounds) {
    const similarRounds = playerData.similarCourseRounds.length;
    if (similarRounds < 5) {
      warnings.push(`Limited similar-course data: ${similarRounds} rounds`);
      confidence *= 0.9;
      suggestions.push("Limited history at similar courses; predictions less precise");
    }
  }
  if (playerData.historicalRounds && playerData.historicalRounds.length > 10) {
    const scores = playerData.historicalRounds.map(r => r.metrics?.scoringAverage).filter(s => s !== undefined);
    if (scores.length > 5) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 3.5) {
        warnings.push(`High scoring variance (${stdDev.toFixed(1)} strokes): inconsistent form`);
        confidence *= 0.85;
        suggestions.push("Player showing high variance in recent form");
      }
    }
  }
  const isValid = confidence > 0.5 && recentEvents.length >= 3;
  return {
    playerId: playerData.dgId || playerData.playerId,
    name: playerData.name,
    isValid,
    confidence: parseFloat(confidence.toFixed(2)),
    recentEventCount: recentEvents.length,
    totalRounds,
    metricCoverage: parseFloat((metricCoverage * 100).toFixed(1)),
    warnings,
    suggestions,
    confidenceLevel: confidence > 0.85 ? "HIGH" : confidence > 0.65 ? "MEDIUM" : "LOW"
  };
}

function applyConfidenceAdjustment(rawPredictedRank, confidence) {
  const fieldMean = 75; // Average field position
  const adjustedRank = fieldMean + (rawPredictedRank - fieldMean) * confidence;
  return adjustedRank;
}

function compareAlgorithmVersions(eventId, version1Name, version1Fn, version2Name, version2Fn) {
  console.log(`Starting A/B test: ${version1Name} vs ${version2Name} on event ${eventId}`);
  let predictions1, predictions2;
  try { predictions1 = version1Fn(); } catch (e) { console.error(`${version1Name} failed: ${e.message}`); return { error: `${version1Name} execution failed: ${e.message}` }; }
  try { predictions2 = version2Fn(); } catch (e) { console.error(`${version2Name} failed: ${e.message}`); return { error: `${version2Name} execution failed: ${e.message}` }; }
  const validation1 = validatePredictions(eventId, predictions1);
  const validation2 = validatePredictions(eventId, predictions2);
  if (validation1.error || validation2.error) {
    return { error: "Validation failed", details: { validation1, validation2 } };
  }
  const score1 = (validation1.correlation * 0.5) + ((1 - (validation1.rmse / 30)) * 0.3) + (validation1.topTenAccuracy / 100 * 0.2);
  const score2 = (validation2.correlation * 0.5) + ((1 - (validation2.rmse / 30)) * 0.3) + (validation2.topTenAccuracy / 100 * 0.2);
  const winner = score1 > score2 ? version1Name : score2 > score1 ? version2Name : "TIE";
  const comparison = {
    event: eventId,
    timestamp: new Date().toISOString(),
    version1: {
      name: version1Name,
      correlation: validation1.correlation,
      rmse: validation1.rmse,
      mae: validation1.mae,
      topTenAccuracy: validation1.topTenAccuracy,
      compositeScore: parseFloat(score1.toFixed(3))
    },
    version2: {
      name: version2Name,
      correlation: validation2.correlation,
      rmse: validation2.rmse,
      mae: validation2.mae,
      topTenAccuracy: validation2.topTenAccuracy,
      compositeScore: parseFloat(score2.toFixed(3))
    },
    winner,
    correlationDifference: parseFloat((validation1.correlation - validation2.correlation).toFixed(3)),
    rmseDifference: parseFloat((validation2.rmse - validation1.rmse).toFixed(2))
  };
  return comparison;
}

function storeABTestResults(comparison) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("Validation Results");
  if (!sheet) { sheet = ss.insertSheet("Validation Results"); }
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Timestamp", "Event ID", "Version 1", "V1 Correlation", "V1 RMSE",
      "Version 2", "V2 Correlation", "V2 RMSE", "Winner", "Corr Diff"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  sheet.appendRow([
    comparison.timestamp,
    comparison.event,
    comparison.version1.name,
    comparison.version1.correlation,
    comparison.version1.rmse,
    comparison.version2.name,
    comparison.version2.correlation,
    comparison.version2.rmse,
    comparison.winner,
    comparison.correlationDifference
  ]);
  console.log(`A/B test results stored. Winner: ${comparison.winner}`);
}

function isWithinMonths(date, months) {
  if (!date) return false;
  const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - months);
  return dateObj >= monthsAgo;
}

function daysSince(date) {
  if (!date) return Infinity;
  const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
  return Math.floor((new Date() - dateObj) / (1000 * 60 * 60 * 24));
}

function calculateAverage(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calculateVariance(arr) {
  if (!arr || arr.length < 2) return 0;
  const mean = calculateAverage(arr);
  const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
}

function generateValidationReportHTML(metrics) {
  return `
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      .header { background: #1f2937; color: white; padding: 15px; border-radius: 5px; }
      .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
      .metric-value { font-weight: bold; color: #1f2937; }
      .summary { background: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 15px; }
    </style>
    <div class="header">
      <h2>Validation Report - Event ${metrics.eventId}</h2>
      <p>Generated: ${metrics.timestamp}</p>
    </div>
    <div class="metric">
      <span>Correlation:</span>
      <span class="metric-value">${metrics.correlation}</span>
    </div>
    <div class="metric">
      <span>R2:</span>
      <span class="metric-value">${metrics.rSquared}</span>
    </div>
    <div class="metric">
      <span>RMSE:</span>
      <span class="metric-value">${metrics.rmse}</span>
    </div>
    <div class="metric">
      <span>MAE:</span>
      <span class="metric-value">${metrics.mae}</span>
    </div>
    <div class="metric">
      <span>Top-10 Accuracy:</span>
      <span class="metric-value">${metrics.topTenAccuracy}%</span>
    </div>
    <div class="summary">
      <strong>Summary:</strong><br/>
      ${metrics.summary}
    </div>
  `;
}

// ========== From utilities_tournamentValidation_archive.js ==========

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
    const weights = determineTournamentWeights();
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

// Helper to robustly read G9 after async edits
function getG9WithRetry(sheet, retries = 5, delay = 500) {
  for (let i = 0; i < retries; i++) {
    const value = sheet.getRange("G9").getValue();
    if (value) return value;
    Utilities.sleep(delay);
  }
  return null;
}