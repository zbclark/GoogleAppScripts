/**
 * Algorithm Validation & Testing Module
 * 
 * Validates golf ranking predictions against actual tournament results
 * Includes data quality checks, performance metrics, and A/B testing framework
 */

/**
 * ============================================================================
 * SECTION 1: PREDICTION VALIDATION
 * ============================================================================
 * Tests predictions against actual tournament finishes
 */

/**
 * Validates algorithm predictions against actual tournament finishes
 * @param {string} eventId - The tournament to validate against
 * @param {Array} predictions - Array of {playerId, name, predictedScore, predictedRank}
 * @returns {Object} Validation metrics {correlation, rmse, mae, accuracy}
 */
function validatePredictions(eventId, year) {
  Logger.log("[validatePredictions] Called with eventId: %s, year: %s", eventId, year);

  // Use loadTournamentResults to get unified data
  const resultsObj = loadTournamentResults(eventId, year);
  Logger.log("[validatePredictions] typeof resultsObj: %s", typeof resultsObj);
  Logger.log("[validatePredictions] resultsObj: %s", JSON.stringify(resultsObj));

  if (!resultsObj || typeof resultsObj !== 'object' || !Array.isArray(resultsObj.results)) {
    Logger.log("[validatePredictions] loadTournamentResults did not return expected object with results array");
    return { error: "loadTournamentResults did not return expected object with results array", resultsObjType: typeof resultsObj, resultsObj: resultsObj };
  }
  const results = resultsObj.results;
  if (results.length === 0) {
    Logger.log("[validatePredictions] No tournament results returned");
    return { error: "No tournament results found for event " + eventId + (year ? (" in year " + year) : "") };
  }

  Logger.log('[validatePredictions] Raw input data: ' + JSON.stringify(results));
  // Filter out entries missing modelRank or finishPos, and convert modelRank to number
  const matches = results
    .map(r => {
      let finishPos = r.finishPos;
      if (typeof finishPos === 'string') {
        const match = finishPos.match(/^T?(\d+)/i);
        finishPos = match ? parseInt(match[1]) : NaN;
      }
      return {
        ...r,
        modelRank: parseInt(r.modelRank),
        finishPos: typeof finishPos === 'number' ? finishPos : parseInt(finishPos)
      };
    });
  Logger.log('[validatePredictions] Converted modelRank/finishPos: ' + JSON.stringify(matches.map(m => ({ dgId: m.dgId, name: m.name, modelRank: m.modelRank, finishPos: m.finishPos }))));

  // Calculate statistical metrics
  const predictedRanks = matches.map(m => m.modelRank);
  const actualPositions = matches.map(m => m.finishPos);

  const correlation = calculatePearsonCorrelation(predictedRanks, actualPositions);
  const rmse = calculateRMSE(predictedRanks, actualPositions);
  const mae = calculateMAE(predictedRanks, actualPositions);
  const rSquared = calculateRSquared(predictedRanks, actualPositions);

  // Only show overlap-based metrics
  // Top-10 overlap: how many of the actual top 10 finishers did we predict in our top 10?
  const actualTopTen = matches.filter(m => m.finishPos <= 10);
  const predictedTopTenIds = new Set(matches.filter(m => m.modelRank <= 10).map(m => m.dgId));
  const topTenOverlap = actualTopTen.filter(m => predictedTopTenIds.has(m.dgId)).length;
  const topTenOverlapAccuracy = actualTopTen.length > 0 ? (topTenOverlap / actualTopTen.length) : 0;

  // Top-20 overlap: how many of the actual top 20 finishers did we predict in our top 20?
  const actualTopTwenty = matches.filter(m => m.finishPos <= 20);
  const predictedTopTwentyIds = new Set(matches.filter(m => m.modelRank <= 20).map(m => m.dgId));
  const topTwentyOverlap = actualTopTwenty.filter(m => predictedTopTwentyIds.has(m.dgId)).length;
  const topTwentyOverlapAccuracy = actualTopTwenty.length > 0 ? (topTwentyOverlap / actualTopTwenty.length) : 0;

  // Debug logging for overlap sets
  Logger.log('[validatePredictions] Actual Top 10: ' + JSON.stringify(actualTopTen.map(m => ({ dgId: m.dgId, name: m.name, modelRank: m.modelRank, finishPos: m.finishPos }))));
  Logger.log('[validatePredictions] Predicted Top 10 IDs: ' + JSON.stringify(Array.from(predictedTopTenIds)));
  Logger.log('[validatePredictions] Top 10 Overlap: ' + JSON.stringify(actualTopTen.filter(m => predictedTopTenIds.has(m.dgId)).map(m => ({ dgId: m.dgId, name: m.name, modelRank: m.modelRank, finishPos: m.finishPos }))));

  Logger.log('[validatePredictions] Actual Top 20: ' + JSON.stringify(actualTopTwenty.map(m => ({ dgId: m.dgId, name: m.name, modelRank: m.modelRank, finishPos: m.finishPos }))));
  Logger.log('[validatePredictions] Predicted Top 20 IDs: ' + JSON.stringify(Array.from(predictedTopTwentyIds)));
  Logger.log('[validatePredictions] Top 20 Overlap: ' + JSON.stringify(actualTopTwenty.filter(m => predictedTopTwentyIds.has(m.dgId)).map(m => ({ dgId: m.dgId, name: m.name, modelRank: m.modelRank, finishPos: m.finishPos }))));

  // Calculate prediction error distribution
  const errors = matches.map(m => m.modelRank - m.finishPos);
  const errorStats = {
    mean: errors.reduce((a, b) => a + b, 0) / errors.length,
    stdDev: Math.sqrt(
      errors.reduce((sum, e) => sum + (e - (errors.reduce((a, b) => a + b, 0) / errors.length)) ** 2, 0) / errors.length
    )
  };

  return {
    eventId,
    matchedPlayers: matches.length,
    correlation: parseFloat(correlation.toFixed(3)),
    rSquared: parseFloat(rSquared.toFixed(3)),
    rmse: parseFloat(rmse.toFixed(2)),
    mae: parseFloat(mae.toFixed(2)),
    topTenOverlapAccuracy: parseFloat(topTenOverlapAccuracy.toFixed(4)),
    topTwentyOverlapAccuracy: parseFloat(topTwentyOverlapAccuracy.toFixed(4)),
    errorMean: parseFloat(errorStats.mean.toFixed(2)),
    errorStdDev: parseFloat(errorStats.stdDev.toFixed(2)),
    timestamp: new Date().toISOString(),
    summary: generateValidationSummary({
      correlation,
      rSquared,
      rmse,
      topTenOverlapAccuracy,
      errorMean: errorStats.mean
    })
  };
}

/**
 * Coefficient of Determination (R^2)
 * @param {Array<number>} predicted
 * @param {Array<number>} actual
 * @returns {number} R^2 value between 0 and 1
 */
function calculateRSquared(predicted, actual) {
  if (predicted.length !== actual.length) {
    throw new Error("Arrays must be same length");
  }
  const meanActual = actual.reduce((a, b) => a + b, 0) / actual.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < actual.length; i++) {
    ssTot += Math.pow(actual[i] - meanActual, 2);
    ssRes += Math.pow(actual[i] - predicted[i], 2);
  }
  return ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
}

/**
 * Pearson correlation coefficient
 * @returns {number} Correlation between -1 and 1
 */
function calculatePearsonCorrelation(xArray, yArray) {
  if (xArray.length !== yArray.length) {
    throw new Error("Arrays must be same length");
  }
  
  const n = xArray.length;
  const sumX = xArray.reduce((a, b) => a + b, 0);
  const sumY = yArray.reduce((a, b) => a + b, 0);
  const sumXY = xArray.reduce((sum, x, i) => sum + x * yArray[i], 0);
  const sumX2 = xArray.reduce((sum, x) => sum + x * x, 0);
  const sumY2 = yArray.reduce((sum, y) => sum + y * y, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Root Mean Square Error
 */
function calculateRMSE(predicted, actual) {
  if (predicted.length !== actual.length) {
    throw new Error("Arrays must be same length");
  }
  
  const squaredErrors = predicted.map((p, i) => Math.pow(p - actual[i], 2));
  const mse = squaredErrors.reduce((a, b) => a + b, 0) / predicted.length;
  return Math.sqrt(mse);
}

/**
 * Mean Absolute Error
 */
function calculateMAE(predicted, actual) {
  if (predicted.length !== actual.length) {
    throw new Error("Arrays must be same length");
  }
  
  const errors = predicted.map((p, i) => Math.abs(p - actual[i]));
  return errors.reduce((a, b) => a + b, 0) / predicted.length;
}

/**
 * Generates human-readable summary of validation results
 */
function generateValidationSummary(metrics) {
  let summary = [];
  
  // Correlation interpretation
  const corr = metrics.correlation;
  if (corr > 0.7) {
    summary.push("✅ Strong correlation (>0.7): Algorithm is predictive");
  } else if (corr > 0.5) {
    summary.push("⚠️ Moderate correlation (0.5-0.7): Room for improvement");
  } else if (corr > 0.3) {
    summary.push("⚠️ Weak correlation (0.3-0.5): Limited predictive power");
  } else {
    summary.push("❌ Very weak correlation (<0.3): Algorithm needs major revision");
  }
  
  // R^2 interpretation
  if (typeof metrics.rSquared === 'number') {
    const r2 = metrics.rSquared;
    if (r2 > 0.7) {
      summary.push(`✅ R² (${r2.toFixed(2)}): Strong predictive fit`);
    } else if (r2 > 0.4) {
      summary.push(`⚠️ R² (${r2.toFixed(2)}): Moderate fit`);
    } else {
      summary.push(`❌ R² (${r2.toFixed(2)}): Weak fit`);
    }
  }

  // RMSE interpretation
  const rmse = metrics.rmse;
  if (rmse < 10) {
    summary.push(`✅ Low RMSE (${rmse}): Predictions are close to actuals`);
  } else if (rmse < 20) {
    summary.push(`⚠️ Moderate RMSE (${rmse}): Average prediction off by ~${rmse} positions`);
  } else {
    summary.push(`❌ High RMSE (${rmse}): Predictions significantly off`);
  }
  
  // Accuracy interpretation
  const acc = metrics.topTenAccuracy;
  if (acc > 0.6) {
    summary.push(`✅ Top-10 Accuracy: ${(acc*100).toFixed(0)}% (strong)`);
  } else if (acc > 0.4) {
    summary.push(`⚠️ Top-10 Accuracy: ${(acc*100).toFixed(0)}% (moderate)`);
  } else {
    summary.push(`❌ Top-10 Accuracy: ${(acc*100).toFixed(0)}% (poor)`);
  }
  
  return summary.join(" | ");
}

