/**
 * Metric Correlation Analysis - Top 10 Finisher Focus
 * Analyzes which metrics have the strongest correlation with top 10 finishes
 * Compares top 10 finishers vs field average for all 35 metrics
 */

function analyzeMetricCorrelations() {
  try {
    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert("Golf 2025 folder not found");
      return;
    }
    
    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();
    
    // Define all 35 metrics
    const allMetrics = [
      // Historical Metrics (17)
      "SG Total", "Driving Distance", "Driving Accuracy",
      "SG T2G", "SG Approach", "SG Around Green",
      "SG OTT", "SG Putting", "Greens in Regulation",
      "Scrambling", "Great Shots", "Poor Shots", 
      "Scoring Average", "Birdies or Better", "Birdie Chances Created",
      "Fairway Proximity", "Rough Proximity",
      
      // Approach Metrics (18)
      "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox",
      "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox",
      "Approach <150 Rough GIR", "Approach <150 Rough SG", "Approach <150 Rough Prox",
      "Approach >150 Rough GIR", "Approach >150 Rough SG", "Approach >150 Rough Prox",
      "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox",
      "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox"
    ];
    
    // Initialize correlation tracker
    let correlationData = {
      tournaments: [],
      metricCorrelations: {},
      finisherMetrics: [],  // All winner/finisher data with their metrics
      tournamentBreakdown: {},  // Per-tournament analysis
      summary: {}
    };
    
    // Initialize metric correlation accumulator
    allMetrics.forEach(metric => {
      correlationData.metricCorrelations[metric] = {
        metric: metric,
        values: [],  // Array of {position, value} for correlation calc
        correlation: 0,
        avgForTop10: 0,
        avgForField: 0,
        deltaTop10VsField: 0,
        countTop10: 0,
        countField: 0
      };
    });
    
    // Analyze each tournament
    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      const fileName = file.getName();
      const ss = SpreadsheetApp.open(file);
      
      console.log(`\n=== Processing ${fileName} ===`);
      
      // Get actual results
      const resultsSheet = ss.getSheetByName("Tournament Results");
      if (!resultsSheet) {
        console.log(`⚠️ ${fileName}: No Tournament Results sheet found`);
        continue;
      }
      
      const resultsData = resultsSheet.getDataRange().getValues();
      console.log(`Tournament Results sheet has ${resultsData.length} rows`);
      
      // Find header row (row 5 = index 4)
      const headerRow = resultsData[4];
      const headerMap = {};
      headerRow.forEach((header, idx) => {
        if (header) headerMap[header.toString().trim()] = idx;
      });
      
      console.log(`Headers found:`, Object.keys(headerMap));
      
      // Extract DG ID and finishing position from results
      const dgIdIdx = headerMap['DG ID'];
      const positionIdx = headerMap['Finish Position'];
      
      console.log(`DG ID column index: ${dgIdIdx}, Finish Position column index: ${positionIdx}`);
      
      // Collect winner/finisher data - starts at row 6 (index 5)
      let tournamentFinishers = [];
      
      for (let i = 5; i < Math.min(resultsData.length, 500); i++) {
        const row = resultsData[i];
        const dgId = row[dgIdIdx];
        const position = row[positionIdx];
        
        // Skip if no DG ID or invalid position
        if (!dgId || position === undefined || position === '' || typeof position === 'string') continue;
        
        const pos = parseInt(position);
        if (isNaN(pos)) continue;
        
        tournamentFinishers.push({
          dgId: dgId,
          position: pos,
          metrics: {}
        });
      }
      
      console.log(`Found ${tournamentFinishers.length} finishers with valid positions`);
      
      // Now get player stats from the same workbook
      const playerStatsSheet = ss.getSheetByName("Player Ranking Model");
      if (!playerStatsSheet) {
        console.log(`⚠️ ${fileName}: No Player Ranking Model sheet found`);
        continue;
      }
      
      const playerData = playerStatsSheet.getDataRange().getValues();
      console.log(`Player Ranking Model has ${playerData.length} rows, ${playerData[0] ? playerData[0].length : 0} columns`);
      
      // Headers are on row 5 (index 4)
      const playerHeaderRow = playerData[4];
      const playerHeaderMap = {};
      playerHeaderRow.forEach((header, idx) => {
        if (header) playerHeaderMap[header.toString().trim()] = idx;
      });
      
      console.log(`Player metric columns found:`, Object.keys(playerHeaderMap).filter(h => allMetrics.includes(h)).slice(0, 10));
      
      // Map player DG IDs to their metrics
      const playerMetricsMap = new Map();
      
      // Data starts at row 6 (index 5)
      for (let i = 5; i < playerData.length; i++) {
        const row = playerData[i];
        const dgId = row[playerHeaderMap['DG ID']];
        
        if (!dgId) continue;
        
        const playerMetrics = {};
        allMetrics.forEach(metric => {
          const colIdx = playerHeaderMap[metric];
          if (colIdx !== undefined) {
            const value = row[colIdx];
            playerMetrics[metric] = parseFloat(value) || 0;
          }
        });
        
        playerMetricsMap.set(dgId.toString(), playerMetrics);
      }
      
      console.log(`Found ${playerMetricsMap.size} players with metric data`);
      
      // Match finishers with their metrics
      tournamentFinishers.forEach(finisher => {
        const metrics = playerMetricsMap.get(finisher.dgId.toString());
        if (metrics) {
          finisher.metrics = metrics;
          correlationData.finisherMetrics.push({
            tournament: fileName,
            dgId: finisher.dgId,
            position: finisher.position,
            isTop10: finisher.position <= 10,
            ...metrics
          });
          
          // Add to correlation data
          allMetrics.forEach(metric => {
            const value = metrics[metric];
            if (value !== undefined && !isNaN(value)) {
              const isTop10 = finisher.position <= 10;
              correlationData.metricCorrelations[metric].values.push({
                position: finisher.position,
                value: value,
                isTop10: isTop10
              });
            }
          });
        }
      });
      
      console.log(`Matched ${tournamentFinishers.filter(f => f.metrics && Object.keys(f.metrics).length > 0).length} finishers with metrics`);
      
      // Store tournament breakdown
      const top10Finishers = tournamentFinishers.filter(f => f.position <= 10);
      correlationData.tournamentBreakdown[fileName] = {
        name: fileName,
        totalFinishers: tournamentFinishers.length,
        top10Count: top10Finishers.length,
        metricAverages: {}
      };
      
      // Calculate per-tournament metric averages
      allMetrics.forEach(metric => {
        const top10Values = top10Finishers
          .map(f => f.metrics[metric])
          .filter(v => v !== undefined && !isNaN(v));
        
        const allValues = tournamentFinishers
          .map(f => f.metrics[metric])
          .filter(v => v !== undefined && !isNaN(v));
        
        const top10Avg = top10Values.length > 0 ? 
          top10Values.reduce((a, b) => a + b, 0) / top10Values.length : 0;
        
        const fieldAvg = allValues.length > 0 ? 
          allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;
        
        correlationData.tournamentBreakdown[fileName].metricAverages[metric] = {
          top10Avg: top10Avg,
          fieldAvg: fieldAvg,
          delta: top10Avg - fieldAvg
        };
      });
      
      correlationData.tournaments.push({
        name: fileName,
        finisherCount: tournamentFinishers.length,
        top10Count: top10Finishers.length
      });
    }
    
    // Calculate correlations across all tournaments
    allMetrics.forEach(metric => {
      const data = correlationData.metricCorrelations[metric];
      
      if (data.values.length > 0) {
        // Calculate Pearson correlation coefficient with position
        data.correlation = calculatePearsonCorrelation(
          data.values.map(v => v.position),
          data.values.map(v => v.value)
        );
        
        // Separate top 10 vs field
        const top10Values = data.values.filter(v => v.isTop10);
        const allValues = data.values;
        
        data.avgForTop10 = top10Values.length > 0 ? 
          top10Values.reduce((sum, v) => sum + v.value, 0) / top10Values.length : 0;
        
        data.avgForField = allValues.length > 0 ? 
          allValues.reduce((sum, v) => sum + v.value, 0) / allValues.length : 0;
        
        data.deltaTop10VsField = data.avgForTop10 - data.avgForField;
        data.countTop10 = top10Values.length;
        data.countField = allValues.length;
        
        console.log(`Metric '${metric}': ${data.values.length} obs, Top10 avg: ${data.avgForTop10.toFixed(3)}, Field avg: ${data.avgForField.toFixed(3)}, Delta: ${data.deltaTop10VsField.toFixed(3)}`);
      }
    });
    
    // Sort metrics by delta (top 10 vs field) to find which metrics separate winners
    const sortedMetrics = Object.values(correlationData.metricCorrelations)
      .sort((a, b) => Math.abs(b.deltaTop10VsField) - Math.abs(a.deltaTop10VsField));
    
    // Output results to sheet
    const reportSheet = masterSs.insertSheet("Metric Correlation Report");
    
    // ========== MAIN REPORT: Top 10 vs Field Comparison ==========
    reportSheet.appendRow([
      "METRIC EFFECTIVENESS - TOP 10 FINISHERS vs FIELD AVERAGE"
    ]);
    reportSheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
    
    reportSheet.appendRow([" "]);
    reportSheet.appendRow([
      "Metric",
      "Top 10 Avg",
      "Field Avg",
      "Delta (Difference)",
      "% Above Field",
      "Correlation",
      "# Obs"
    ]);
    
    // Format header
    const headerRange = reportSheet.getRange(3, 1, 1, 7);
    headerRange.setBackground("#4472C4").setFontColor("white").setFontWeight("bold");
    
    // Add metric data
    sortedMetrics.forEach((metric, idx) => {
      const pctAboveField = metric.avgForField !== 0 ? 
        ((metric.deltaTop10VsField / metric.avgForField) * 100).toFixed(1) : "N/A";
      
      reportSheet.appendRow([
        metric.metric,
        metric.avgForTop10.toFixed(3),
        metric.avgForField.toFixed(3),
        metric.deltaTop10VsField.toFixed(3),
        pctAboveField + "%",
        metric.correlation.toFixed(4),
        metric.countTop10
      ]);
      
      // Color code by delta magnitude
      const rowIdx = idx + 4;
      const absDelta = Math.abs(metric.deltaTop10VsField);
      if (absDelta > 0.5) {
        reportSheet.getRange(rowIdx, 4).setBackground("#90EE90");  // Green - very strong difference
      } else if (absDelta > 0.2) {
        reportSheet.getRange(rowIdx, 4).setBackground("#FFFFE0");  // Yellow - moderate difference
      } else {
        reportSheet.getRange(rowIdx, 4).setBackground("#FFB6C1");  // Light red - weak difference
      }
    });
    
    // Auto-fit columns
    reportSheet.autoResizeColumns(1, 7);
    
    // ========== TOURNAMENT BREAKDOWN SHEET ==========
    const breakdownSheet = masterSs.insertSheet("Tournament Breakdown");
    
    breakdownSheet.appendRow([
      "TOURNAMENT BREAKDOWN - Top 10 Average by Tournament",
      ""
    ]);
    breakdownSheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
    
    // Get tournament names sorted by top 10 count
    const tournaments = correlationData.tournaments.sort((a, b) => b.top10Count - a.top10Count);
    
    // For each tournament, create a small table
    let currentRow = 3;
    tournaments.forEach(tournament => {
      const breakdown = correlationData.tournamentBreakdown[tournament.name];
      
      // Tournament header
      breakdownSheet.getRange(currentRow, 1).setValue(
        `${tournament.name} (${breakdown.top10Count}/${breakdown.totalFinishers} top 10)`
      ).setFontWeight("bold").setBackground("#E7E6E6");
      
      currentRow++;
      
      // Column headers
      breakdownSheet.appendRow([
        "Metric",
        "Top 10 Avg",
        "Field Avg",
        "Delta"
      ]);
      currentRow++;
      
      // Get top impactful metrics for this tournament
      const tournamentMetrics = allMetrics.map(metric => ({
        metric: metric,
        ...breakdown.metricAverages[metric]
      })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      
      // Show top 15 metrics for this tournament
      tournamentMetrics.slice(0, 15).forEach(m => {
        breakdownSheet.appendRow([
          m.metric,
          m.top10Avg.toFixed(3),
          m.fieldAvg.toFixed(3),
          m.delta.toFixed(3)
        ]);
        currentRow++;
      });
      
      breakdownSheet.appendRow([" "]);
      currentRow += 2; // Space between tournaments
    });
    
    breakdownSheet.autoResizeColumns(1, 4);
    
    // ========== SUMMARY SHEET ==========
    const summarySheet = masterSs.insertSheet("Metric Summary");
    
    summarySheet.appendRow(["KEY FINDINGS"]);
    summarySheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
    
    summarySheet.appendRow([" "]);
    summarySheet.appendRow(["Total Observations: " + correlationData.finisherMetrics.length]);
    summarySheet.appendRow(["Top 10 Observations: " + 
      sortedMetrics[0].countTop10]);
    summarySheet.appendRow(["Tournaments Analyzed: " + tournaments.length]);
    
    summarySheet.appendRow([" "]);
    summarySheet.appendRow(["STRONGEST METRICS (Biggest Delta Top 10 vs Field):"]);
    
    sortedMetrics.slice(0, 10).forEach((m, idx) => {
      const pct = m.avgForField !== 0 ? 
        ((m.deltaTop10VsField / m.avgForField) * 100).toFixed(1) : "N/A";
      summarySheet.appendRow([
        `${idx + 1}. ${m.metric}`,
        `Top10: ${m.avgForTop10.toFixed(3)} | Field: ${m.avgForField.toFixed(3)} | Delta: ${m.deltaTop10VsField.toFixed(3)} (${pct}%)`
      ]);
    });
    
    summarySheet.appendRow([" "]);
    summarySheet.appendRow(["WEAKEST METRICS (Smallest or Negative Delta):"]);
    
    sortedMetrics.slice(-10).forEach((m, idx) => {
      const pct = m.avgForField !== 0 ? 
        ((m.deltaTop10VsField / m.avgForField) * 100).toFixed(1) : "N/A";
      summarySheet.appendRow([
        `${idx + 1}. ${m.metric}`,
        `Top10: ${m.avgForTop10.toFixed(3)} | Field: ${m.avgForField.toFixed(3)} | Delta: ${m.deltaTop10VsField.toFixed(3)} (${pct}%)`
      ]);
    });
    
    summarySheet.autoResizeColumns(1, 2);
    
    SpreadsheetApp.getUi().alert(
      `Metric Correlation Analysis Complete!\n\n` +
      `Analyzed ${tournaments.length} tournaments\n` +
      `${correlationData.finisherMetrics.length} total player observations\n` +
      `${sortedMetrics[0].countTop10} top-10 finisher observations\n\n` +
      `See 'Metric Correlation Report' for full metric rankings`
    );
    
  } catch (e) {
    console.error("Error in analyzeMetricCorrelations:", e);
    SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
  }
}

/**
 * Calculate Pearson correlation coefficient
 * Negative correlation with position = better metric (lower position = better rank)
 */
function calculatePearsonCorrelation(positions, values) {
  const n = positions.length;
  if (n < 2) return 0;
  
  const meanPos = positions.reduce((a, b) => a + b, 0) / n;
  const meanVal = values.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let sumSquaredPos = 0;
  let sumSquaredVal = 0;
  
  for (let i = 0; i < n; i++) {
    const posDiff = positions[i] - meanPos;
    const valDiff = values[i] - meanVal;
    
    numerator += posDiff * valDiff;
    sumSquaredPos += posDiff * posDiff;
    sumSquaredVal += valDiff * valDiff;
  }
  
  const denominator = Math.sqrt(sumSquaredPos * sumSquaredVal);
  
  if (denominator === 0) return 0;
  
  return numerator / denominator;
}
