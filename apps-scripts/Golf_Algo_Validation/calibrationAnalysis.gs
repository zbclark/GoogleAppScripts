/**
 * Post-Tournament Calibration Analysis
 * Analyzes actual results vs predictions to:
 * 1. Measure winner prediction accuracy
 * 2. Identify stat deltas causing misses
 * 3. Recommend weight adjustments for similar courses
 */
function analyzePostTournamentCalibration() {
  try {
    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert("Golf 2025 folder not found");
      return;
    }
    
    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();
    
    // Clear old calibration sheets
    const sheets = masterSs.getSheets();
    for (const sheet of sheets) {
      if (sheet.getName().includes("Calibration") || sheet.getName().includes("Winner Prediction")) {
        masterSs.deleteSheet(sheet);
      }
    }
    
    let calibrationData = {
      tournaments: [],
      topFinishersAnalysis: [],
      totalTop5: 0,
      predictedTop5InTop20: 0,
      totalTop10: 0,
      predictedTop10InTop30: 0,
      statAccuracy: {}
    };
    
    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      const fileName = file.getName();
      const ss = SpreadsheetApp.open(file);
      
      // Get actual results
      let resultsSheet = ss.getSheetByName("Tournament Results");
      if (!resultsSheet) {
        console.log(`⚠️ ${fileName}: No Tournament Results sheet found`);
        continue;
      }
      
      // Get pre-tournament predictions
      let rankingSheet = ss.getSheetByName("Player Ranking Model");
      if (!rankingSheet) {
        console.log(`⚠️ ${fileName}: No Player Ranking Model sheet found`);
        continue;
      }
      
      console.log(`📊 Analyzing: ${fileName}`);
      
      // Read actual results (row 5 headers, data starts row 6)
      const resultsRange = resultsSheet.getRange("A5:AB500");
      const resultsData = resultsRange.getValues();
      
      // Read pre-tournament predictions (row 5 headers, data starts row 6)
      const rankingRange = rankingSheet.getRange("A5:C500");
      const rankingData = rankingRange.getValues();
      
      // Parse headers from both sheets
      const resultsHeaders = resultsData[0];
      const rankingHeaders = rankingData[0];
      
      let resultsCols = {};
      for (let i = 0; i < resultsHeaders.length; i++) {
        const h = String(resultsHeaders[i] || "").toLowerCase().trim();
        if (h === "dg id") resultsCols.dgId = i;
        if (h === "player name") resultsCols.name = i;
        if (h === "finish position") resultsCols.finishPos = i;
        if (h === "sg total") resultsCols.sgTotal = i;
        if (h === "driving distance") resultsCols.drivDist = i;
        if (h === "driving accuracy") resultsCols.drivAcc = i;
        if (h === "sg approach") resultsCols.sgApproach = i;
        if (h === "sg around green") resultsCols.sgAroundGreen = i;
        if (h === "sg putting") resultsCols.sgPutting = i;
      }
      
      let rankingCols = {};
      for (let i = 0; i < rankingHeaders.length; i++) {
        const h = String(rankingHeaders[i] || "").toLowerCase().trim();
        if (h === "dg id") rankingCols.dgId = i;
        if (h === "player name") rankingCols.name = i;
        if (h === "rank") rankingCols.rank = i;
      }
      
      // Build actual results map
      let actualResults = {};
      for (let i = 1; i < resultsData.length; i++) {
        const row = resultsData[i];
        const dgId = String(row[resultsCols.dgId] || "").trim();
        if (!dgId) break;
        
        const finishStr = String(row[resultsCols.finishPos] || "").trim();
        let finishPos = 999;
        if (!isNaN(parseInt(finishStr))) {
          finishPos = parseInt(finishStr);
        } else if (finishStr.includes("T")) {
          const pos = parseInt(finishStr.replace("T", ""));
          if (!isNaN(pos)) finishPos = pos;
        }
        
        if (finishPos !== 999) {
          actualResults[dgId] = {
            name: String(row[resultsCols.name] || "").trim(),
            finishPos: finishPos,
            sgTotal: parseFloat(row[resultsCols.sgTotal]) || 0,
            drivDist: parseFloat(row[resultsCols.drivDist]) || 0,
            drivAcc: parseFloat(row[resultsCols.drivAcc]) || 0,
            sgApproach: parseFloat(row[resultsCols.sgApproach]) || 0,
            sgAroundGreen: parseFloat(row[resultsCols.sgAroundGreen]) || 0,
            sgPutting: parseFloat(row[resultsCols.sgPutting]) || 0
          };
        }
      }
      
      // Build prediction map and match with results
      let tournamentAnalysis = {
        name: fileName,
        topFinishers: [],
        accuracyMetrics: {
          top5Predicted: 0,
          top10Predicted: 0,
          top20Predicted: 0,
          avgMissTop5: 0,
          avgMissTop10: 0
        }
      };
      
      // Get top 10 actual finishers
      const topFinishers = Object.entries(actualResults)
        .filter(([_, data]) => data.finishPos <= 10)
        .sort((a, b) => a[1].finishPos - b[1].finishPos);
      
      for (const [dgId, actual] of topFinishers) {
        // Find prediction
        let predictedRank = 999;
        for (let i = 1; i < rankingData.length; i++) {
          const row = rankingData[i];
          const rankDgId = String(row[rankingCols.dgId] || "").trim();
          if (rankDgId === dgId) {
            predictedRank = parseInt(row[rankingCols.rank]) || 999;
            break;
          }
        }
        
        const miss = Math.abs(predictedRank - actual.finishPos);
        const analysis = {
          name: actual.name,
          actualFinish: actual.finishPos,
          predictedRank: predictedRank,
          missScore: miss,
          inTopXPredicted: predictedRank <= 20 ? "✓ Top 20" : predictedRank <= 50 ? "~ Top 50" : "✗ Outside Top 50",
          stats: actual
        };
        
        tournamentAnalysis.topFinishers.push(analysis);
        
        // Track accuracy
        if (predictedRank <= 20) tournamentAnalysis.accuracyMetrics.top5Predicted++;
        if (predictedRank <= 30) tournamentAnalysis.accuracyMetrics.top10Predicted++;
        if (predictedRank <= 50) tournamentAnalysis.accuracyMetrics.top20Predicted++;
        
        // Update global stats
        if (actual.finishPos <= 5) {
          calibrationData.totalTop5++;
          if (predictedRank <= 20) calibrationData.predictedTop5InTop20++;
        }
        if (actual.finishPos <= 10) {
          calibrationData.totalTop10++;
          if (predictedRank <= 30) calibrationData.predictedTop10InTop30++;
        }
      }
      
      if (tournamentAnalysis.topFinishers.length > 0) {
        tournamentAnalysis.accuracyMetrics.avgMissTop5 = 
          tournamentAnalysis.topFinishers
            .filter(t => t.actualFinish <= 5)
            .reduce((s, t) => s + t.missScore, 0) / 
          Math.max(1, tournamentAnalysis.topFinishers.filter(t => t.actualFinish <= 5).length);
        
        calibrationData.tournaments.push(tournamentAnalysis);
      }
    }
    
    // Create calibration report sheet
    createCalibrationReport(masterSs, calibrationData);
    
    let top5Accuracy = calibrationData.totalTop5 > 0 
      ? (calibrationData.predictedTop5InTop20 / calibrationData.totalTop5 * 100).toFixed(1)
      : "N/A";
    let top10Accuracy = calibrationData.totalTop10 > 0
      ? (calibrationData.predictedTop10InTop30 / calibrationData.totalTop10 * 100).toFixed(1)
      : "N/A";
    
    let msg = `🎯 POST-TOURNAMENT CALIBRATION COMPLETE\n\n`;
    msg += `Winner Prediction Accuracy:\n`;
    msg += `  Top 5 finishers predicted in top 20: ${top5Accuracy}%\n`;
    msg += `  Top 10 finishers predicted in top 30: ${top10Accuracy}%\n\n`;
    msg += `Tournaments analyzed: ${calibrationData.tournaments.length}\n`;
    msg += `Top finishers analyzed: ${calibrationData.tournaments.reduce((s, t) => s + t.topFinishers.length, 0)}\n\n`;
    msg += `✅ Created calibration report sheets\n`;
    msg += `🔍 Review for weight adjustment recommendations`;
    
    SpreadsheetApp.getUi().alert(msg);
    
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}\n\n${e.stack}`);
  }
}

function createCalibrationReport(masterSs, calibrationData) {
  let sheet = masterSs.insertSheet("Calibration Report");
  
  // Title
  sheet.appendRow(["🎯 POST-TOURNAMENT CALIBRATION ANALYSIS"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  
  // Winner prediction accuracy
  sheet.appendRow([" "]);
  sheet.appendRow(["WINNER PREDICTION ACCURACY"]);
  sheet.getRange(3, 1).setFontWeight("bold").setFontSize(12);
  
  sheet.appendRow(["Metric", "Accuracy", "Count"]);
  sheet.getRange(4, 1, 1, 3).setFontWeight("bold").setBackground("#e5e7eb");
  
  const top5Pct = calibrationData.totalTop5 > 0 
    ? (calibrationData.predictedTop5InTop20 / calibrationData.totalTop5 * 100).toFixed(1)
    : 0;
  const top10Pct = calibrationData.totalTop10 > 0
    ? (calibrationData.predictedTop10InTop30 / calibrationData.totalTop10 * 100).toFixed(1)
    : 0;
  
  sheet.appendRow(["Top 5 finishers in Top 20 predictions", `${top5Pct}%`, `${calibrationData.predictedTop5InTop20}/${calibrationData.totalTop5}`]);
  sheet.appendRow(["Top 10 finishers in Top 30 predictions", `${top10Pct}%`, `${calibrationData.predictedTop10InTop30}/${calibrationData.totalTop10}`]);
  
  // Tournament breakdown
  sheet.appendRow([" "]);
  sheet.appendRow(["TOURNAMENT BREAKDOWN"]);
  sheet.getRange(9, 1).setFontWeight("bold").setFontSize(12);
  
  sheet.appendRow(["Tournament", "Top Finishers", "Avg Miss (T5)", "Top 5 Accuracy", "Notes"]);
  sheet.getRange(10, 1, 1, 5).setFontWeight("bold").setBackground("#e5e7eb");
  
  let rowNum = 11;
  for (const t of calibrationData.tournaments.sort((a, b) => a.accuracyMetrics.avgMissTop5 - b.accuracyMetrics.avgMissTop5)) {
    const top5 = t.topFinishers.filter(f => f.actualFinish <= 5);
    const top5Pred = top5.filter(f => f.predictedRank <= 20).length;
    const top5Acc = top5.length > 0 ? (top5Pred / top5.length * 100).toFixed(0) : "N/A";
    
    sheet.appendRow([
      t.name,
      t.topFinishers.length,
      t.accuracyMetrics.avgMissTop5.toFixed(1),
      `${top5Acc}%`,
      top5Pred === top5.length ? "✓ Perfect" : top5Pred > 0 ? "~ Partial" : "✗ Missed"
    ]);
    rowNum++;
  }
  
  // Top finishers detail - with dynamic metrics pulled from each tournament's analysis
  sheet.appendRow([" "]);
  sheet.appendRow(["TOP FINISHERS ANALYSIS (All Tournaments)"]);
  const analysisRow = rowNum + 3;
  sheet.getRange(analysisRow, 1).setFontWeight("bold").setFontSize(12);
  
  // Build header with tournament-specific top metrics
  let headers = ["Tournament", "Finisher", "Finish", "Predicted Rank", "Miss", "Accuracy"];
  let metricsByTournament = {};
  
  // For each tournament, find its top 4 metrics by delta
  for (const t of calibrationData.tournaments) {
    const topMetrics = getTopMetricsForTournament(t.name);
    metricsByTournament[t.name] = topMetrics;
    headers.push(...topMetrics.map(m => m.name));
  }
  
  sheet.appendRow(headers);
  sheet.getRange(analysisRow + 1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e5e7eb");
  
  let detailRow = analysisRow + 2;
  for (const t of calibrationData.tournaments) {
    const topMetrics = metricsByTournament[t.name] || [];
    
    for (const finisher of t.topFinishers.sort((a, b) => a.actualFinish - b.actualFinish)) {
      let row = [
        t.name,
        finisher.name,
        finisher.actualFinish,
        finisher.predictedRank,
        finisher.missScore,
        finisher.inTopXPredicted
      ];
      
      // Add values for the tournament's top metrics
      topMetrics.forEach(metric => {
        const value = finisher.stats[metric.key];
        row.push(value !== undefined ? (typeof value === 'number' ? value.toFixed(2) : value) : "N/A");
      });
      
      sheet.appendRow(row);
      detailRow++;
    }
  }
  
  sheet.autoResizeColumns(1, headers.length);
  
  // Weight recommendations
  sheet.appendRow([" "]);
  const recRow = detailRow + 2;
  sheet.appendRow(["WEIGHT ADJUSTMENT RECOMMENDATIONS"]);
  sheet.getRange(recRow, 1).setFontWeight("bold").setFontSize(12);
  
  sheet.appendRow(["Based on actual finisher analysis:"]);
  sheet.appendRow(["• Review top finishers with high Miss Scores (> 15)"]);
  sheet.appendRow(["• Check their Top Metrics vs predictions"]);
  sheet.appendRow(["• Top Metrics are the ones that actually separated winners at each course"]);
  sheet.appendRow(["• If finishers exceed expected values in those metrics: increase their weights"]);
  sheet.appendRow(["• If finishers underperform on top metrics: check if you're measuring them correctly"]);
  sheet.appendRow(["• Save calibrated weights for similar course types"]);
}

/**
 * Get metrics (by delta) for a specific tournament from the master workbook's metric analysis sheets
 */
function getTopMetricsForTournament(tournamentName) {
  try {
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = masterSs.getSheets();
    
    // Look for metric analysis sheet in master workbook (02_Tournament_Name)
    let metricSheet = null;
    for (const s of sheets) {
      if (s.getName().includes(tournamentName) && s.getName().startsWith("02_")) {
        metricSheet = s;
        break;
      }
    }
    
    if (!metricSheet) return [];
    
    // Read metric data: headers on row 4, metrics start row 5
    const data = metricSheet.getRange("A1:F100").getValues();
    
    // Find column indices
    let metricCol = -1, deltaCol = -1;
    for (let i = 0; i < data[3].length; i++) {
      const header = (data[3][i] || "").toString().toLowerCase();
      if (header.includes("metric")) metricCol = i;
      if (header.includes("delta")) deltaCol = i;
    }
    
    if (metricCol === -1 || deltaCol === -1) return [];
    
    // Extract metrics with delta values (data starts at row 5, index 4)
    let metrics = [];
    for (let i = 4; i < data.length; i++) {
      const metricName = data[i][metricCol];
      const deltaValue = parseFloat(data[i][deltaCol]);
      
      if (metricName && !isNaN(deltaValue) && Math.abs(deltaValue) > 0.1) {
        metrics.push({
          name: metricName.toString().trim(),
          delta: Math.abs(deltaValue),
          key: metricName.toString().trim().toLowerCase().replace(/\s+/g, '')
        });
      }
    }
    
    // Sort by delta and return all metrics
    return metrics
      .sort((a, b) => b.delta - a.delta);
    
  } catch (e) {
    console.log(`Error getting metrics for ${tournamentName}: ${e.message}`);
    return [];
  }
}
