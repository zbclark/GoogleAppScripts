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
function validatePredictions(eventId, predictions) {
  if (!predictions || predictions.length === 0) {
    return { error: "No predictions provided" };
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName("Historical Data");
  if (!sheet) {
    return { error: "Historical Data sheet not found" };
  }

  const data = sheet.getDataRange().getValues();
  
  // Extract actual results for this event
  // Assuming columns: dgId, eventId, finishPosition, score, ...
  const actualResults = new Map();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[5]?.toString() === eventId.toString()) { // eventId at index 5
      const dgId = row[0];
      const position = row[10]; // fin_text at index 10
      
      // Skip if position is "CUT" or "WD"
      if (typeof position === 'string') continue;
      
      if (!actualResults.has(dgId)) {
        actualResults.set(dgId, {
          playerId: dgId,
          actualPosition: position
        });
      }
    }
  }
  
  if (actualResults.size === 0) {
    return { error: `No actual results found for event ${eventId}` };
  }
  
  // Match predictions to actuals
  const matches = [];
  for (const pred of predictions) {
    const actual = actualResults.get(pred.dgId || pred.playerId);
    if (actual) {
      matches.push({
        playerId: pred.dgId || pred.playerId,
        name: pred.name,
        predictedRank: pred.rank || pred.predictedRank,
        predictedScore: pred.finalScore || pred.predictedScore,
        actualPosition: actual.actualPosition
      });
    }
  }
  
  if (matches.length === 0) {
    return { 
      error: `No matching players between predictions (${predictions.length}) and actuals (${actualResults.size})`,
      predictionsCount: predictions.length,
      actualsCount: actualResults.size
    };
  }
  
  // Calculate statistical metrics
  const predictedRanks = matches.map(m => m.predictedRank);
  const actualPositions = matches.map(m => m.actualPosition);
  
  const correlation = calculatePearsonCorrelation(
    predictedRanks,
    actualPositions
  );
  
  const rmse = calculateRMSE(predictedRanks, actualPositions);
  const mae = calculateMAE(predictedRanks, actualPositions);
  
  // Top-10 accuracy: did we correctly predict top 10?
  const topTenPredicted = matches.filter(m => m.predictedRank <= 10);
  const topTenInActual = topTenPredicted.filter(m => m.actualPosition <= 10);
  const topTenAccuracy = topTenPredicted.length > 0 ? 
    (topTenInActual.length / topTenPredicted.length) : 0;
  
  // Top-20 accuracy
  const topTwentyPredicted = matches.filter(m => m.predictedRank <= 20);
  const topTwentyInActual = topTwentyPredicted.filter(m => m.actualPosition <= 20);
  const topTwentyAccuracy = topTwentyPredicted.length > 0 ?
    (topTwentyInActual.length / topTwentyPredicted.length) : 0;
  
  // Calculate prediction error distribution
  const errors = matches.map(m => m.predictedRank - m.actualPosition);
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
    rmse: parseFloat(rmse.toFixed(2)),
    mae: parseFloat(mae.toFixed(2)),
    topTenAccuracy: parseFloat((topTenAccuracy * 100).toFixed(1)),
    topTwentyAccuracy: parseFloat((topTwentyAccuracy * 100).toFixed(1)),
    errorMean: parseFloat(errorStats.mean.toFixed(2)),
    errorStdDev: parseFloat(errorStats.stdDev.toFixed(2)),
    timestamp: new Date().toISOString(),
    summary: generateValidationSummary({
      correlation,
      rmse,
      topTenAccuracy,
      errorMean: errorStats.mean
    })
  };
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

/**
 * Stores validation results to Configuration Sheet for review
 */
function storeValidationResults(metrics) {
  const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
  if (!configSheet) {
    console.error("Configuration Sheet not found");
    return false;
  }
  
  try {
    // Use rows 48-55 for validation area
    const validationRange = configSheet.getRange("A48:G55");
    validationRange.clearContent();
    
    // Headers
    configSheet.getRange("A48").setValue("LAST VALIDATION RESULTS");
    configSheet.getRange("A48").setFontWeight("bold").setFontSize(12);
    
    const headerRow = 49;
    const headers = ["Event ID", "Sample Size", "Correlation", "RMSE", "MAE", "Top-10 Acc%", "Timestamp"];
    for (let i = 0; i < headers.length; i++) {
      configSheet.getRange(headerRow, i + 1).setValue(headers[i]).setFontWeight("bold");
    }
    
    // Data
    const dataRow = 50;
    configSheet.getRange(dataRow, 1).setValue(metrics.eventId);
    configSheet.getRange(dataRow, 2).setValue(metrics.matchedPlayers);
    configSheet.getRange(dataRow, 3).setValue(metrics.correlation);
    configSheet.getRange(dataRow, 4).setValue(metrics.rmse);
    configSheet.getRange(dataRow, 5).setValue(metrics.mae);
    configSheet.getRange(dataRow, 6).setValue(metrics.topTenAccuracy);
    configSheet.getRange(dataRow, 7).setValue(metrics.timestamp);
    
    // Summary
    configSheet.getRange("A52").setValue("SUMMARY");
    configSheet.getRange("A52").setFontWeight("bold");
    configSheet.getRange("A53").setValue(metrics.summary);
    configSheet.getRange("A53:G53").merge();
    configSheet.getRange("A53").setWrap(true);
    
    return true;
  } catch (e) {
    console.error("Error storing validation results:", e);
    return false;
  }
}

/**
 * ============================================================================
 * SECTION 2: DATA QUALITY VALIDATION
 * ============================================================================
 * Checks player data sufficiency before using in predictions
 */

/**
 * Validates player data quality and returns confidence score
 * @param {Object} playerData - Player's historical data
 * @returns {Object} {isValid, confidence, warnings, suggestions}
 */
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
  
  // Check 1: Recent tournament participation
  const recentEvents = (playerData.events || []).filter(e => 
    isWithinMonths(e.date || e.year, 12)
  );
  
  if (recentEvents.length < 5) {
    warnings.push(`Only ${recentEvents.length} events in last 12 months`);
    suggestions.push("Player needs more recent tournament data for reliable predictions");
    confidence *= 0.6;
  } else if (recentEvents.length < 10) {
    warnings.push(`${recentEvents.length} events in last 12 months (ideal: 10+)`);
    confidence *= 0.85;
  }
  
  // Check 2: Data completeness (rounds per event)
  const totalRounds = (playerData.historicalRounds || []).length;
  const totalEvents = (playerData.events || []).length;
  
  if (totalEvents > 0) {
    const avgRoundsPerEvent = totalRounds / totalEvents;
    if (avgRoundsPerEvent < 3.0) {
      warnings.push(`Incomplete round data (avg ${avgRoundsPerEvent.toFixed(1)} rounds/event)`);
      confidence *= 0.75;
    }
  }
  
  // Check 3: Metric coverage
  const metrics = playerData.metrics || [];
  const nonZeroMetrics = metrics.filter(m => m !== 0 && m !== null).length;
  const metricCoverage = metrics.length > 0 ? nonZeroMetrics / metrics.length : 0;
  
  if (metricCoverage < 0.7) {
    warnings.push(`Low metric coverage: ${(metricCoverage * 100).toFixed(0)}% of metrics available`);
    suggestions.push("Player missing data for some key performance metrics");
    confidence *= 0.8;
  }
  
  // Check 4: Course-specific data (if current event specified)
  if (playerData.similarCourseRounds) {
    const similarRounds = playerData.similarCourseRounds.length;
    if (similarRounds < 5) {
      warnings.push(`Limited similar-course data: ${similarRounds} rounds`);
      confidence *= 0.9;
      suggestions.push("Limited history at similar courses; predictions less precise");
    }
  }
  
  // Check 5: Performance consistency
  if (playerData.historicalRounds && playerData.historicalRounds.length > 10) {
    const scores = playerData.historicalRounds
      .map(r => r.metrics?.scoringAverage)
      .filter(s => s !== undefined);
    
    if (scores.length > 5) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev > 3.5) {
        warnings.push(`High scoring variance (±${stdDev.toFixed(1)} strokes): inconsistent form`);
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

/**
 * Creates confidence-weighted adjustment for predictions
 * Better data quality = more extreme predictions; poor data = regress to mean
 * @param {number} rawPredictedRank - Initial predicted ranking
 * @param {number} confidence - Confidence score (0-1)
 * @returns {number} Adjusted rank
 */
function applyConfidenceAdjustment(rawPredictedRank, confidence) {
  const fieldMean = 75; // Average field position
  
  // Low confidence pulls prediction toward mean
  // High confidence preserves prediction
  const adjustedRank = fieldMean + (rawPredictedRank - fieldMean) * confidence;
  
  return adjustedRank;
}

/**
 * ============================================================================
 * SECTION 3: A/B TESTING FRAMEWORK
 * ============================================================================
 * Compares different algorithm versions
 */

/**
 * Compares two algorithm versions against the same tournament
 * @param {string} eventId - Tournament to test
 * @param {string} version1Name - Name of first algorithm
 * @param {Function} version1Fn - Function that generates rankings for version 1
 * @param {string} version2Name - Name of second algorithm
 * @param {Function} version2Fn - Function that generates rankings for version 2
 * @returns {Object} Comparison results with winner
 */
function compareAlgorithmVersions(eventId, version1Name, version1Fn, version2Name, version2Fn) {
  console.log(`Starting A/B test: ${version1Name} vs ${version2Name} on event ${eventId}`);
  
  // Generate predictions from both versions
  let predictions1, predictions2;
  
  try {
    predictions1 = version1Fn();
  } catch (e) {
    console.error(`${version1Name} failed: ${e.message}`);
    return { error: `${version1Name} execution failed: ${e.message}` };
  }
  
  try {
    predictions2 = version2Fn();
  } catch (e) {
    console.error(`${version2Name} failed: ${e.message}`);
    return { error: `${version2Name} execution failed: ${e.message}` };
  }
  
  // Validate both
  const validation1 = validatePredictions(eventId, predictions1);
  const validation2 = validatePredictions(eventId, predictions2);
  
  if (validation1.error || validation2.error) {
    return {
      error: "Validation failed",
      details: { validation1, validation2 }
    };
  }
  
  // Determine winner based on multiple metrics
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

/**
 * Stores A/B test results to Validation Results sheet
 */
function storeABTestResults(comparison) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName("Validation Results");
  
  if (!sheet) {
    sheet = ss.insertSheet("Validation Results");
  }
  
  // Create headers if not present
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Timestamp", "Event ID", "Version 1", "V1 Correlation", "V1 RMSE",
      "Version 2", "V2 Correlation", "V2 RMSE", "Winner", "Corr Diff"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  
  // Add row
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

/**
 * ============================================================================
 * SECTION 4: UTILITY FUNCTIONS
 * ============================================================================
 */

/**
 * Checks if a date is within X months of today
 */
function isWithinMonths(date, months) {
  if (!date) return false;
  
  const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - months);
  
  return dateObj >= monthsAgo;
}

/**
 * Calculates days since a date
 */
function daysSince(date) {
  if (!date) return Infinity;
  const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
  return Math.floor((new Date() - dateObj) / (1000 * 60 * 60 * 24));
}

/**
 * Calculates average of array
 */
function calculateAverage(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculates variance of array
 */
function calculateVariance(arr) {
  if (!arr || arr.length < 2) return 0;
  const mean = calculateAverage(arr);
  const squaredDiffs = arr.map(x => Math.pow(x - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Generates summary HTML for validation report
 */
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
