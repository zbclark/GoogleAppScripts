/**
 * Metric Correlation Analysis - Per-Tournament & Course Type Classification
 * 1. Analyzes each tournament individually
 * 2. Identifies metrics that separate top 10 finishers for each course
 * 3. Classifies courses into types based on metric pattern similarities
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
    
    let filesProcessed = 0;
    let filesWithData = 0;
    
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
    
    // Initialize correlation tracker with per-tournament analysis
    let correlationData = {
      tournaments: [],
      metricCorrelations: {},  // Aggregate across all tournaments
      finisherMetrics: [],
      tournamentBreakdown: {},  // Per-tournament analysis
      tournamentCorrelations: {},  // Per-tournament metric rankings
      courseTypes: {},  // Course type classifications
      summary: {}
    };
    
    // Initialize metric correlation accumulator (aggregate)
    allMetrics.forEach(metric => {
      correlationData.metricCorrelations[metric] = {
        metric: metric,
        values: [],
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
      
      // Initialize per-tournament metric correlations
      let tournamentMetrics = {};
      allMetrics.forEach(metric => {
        tournamentMetrics[metric] = {
          metric: metric,
          values: [],
          deltaTop10VsField: 0,
          avgForTop10: 0,
          avgForField: 0,
          countTop10: 0,
          countField: 0
        };
      });
      
      // Get actual results
      const resultsSheet = ss.getSheetByName("Tournament Results");
      if (!resultsSheet) {
        console.log(`⚠️ ${fileName}: No Tournament Results sheet found`);
        continue;
      }
      
      const resultsData = resultsSheet.getDataRange().getValues();
      console.log(`Tournament Results sheet has ${resultsData.length} rows`);
      
      // Validate we have enough rows (header at row 5 + at least some data)
      if (resultsData.length <= 5) {
        console.log(`⚠️ ${fileName}: Not enough rows (need at least 6)`);
        continue;
      }
      
      // Find header row (row 5 = index 4)
      const headerRow = resultsData[4];
      const headerMap = {};
      headerRow.forEach((header, idx) => {
        if (header) headerMap[header.toString().trim()] = idx;
      });
      
      console.log(`Headers found:`, Object.keys(headerMap).slice(0, 10));
      
      // Validate required columns exist
      const dgIdIdx = headerMap['DG ID'];
      const positionIdx = headerMap['Finish Position'];
      
      if (dgIdIdx === undefined || positionIdx === undefined) {
        console.log(`⚠️ ${fileName}: Missing required columns (DG ID or Finish Position)`);
        continue;
      }
      
      console.log(`DG ID column index: ${dgIdIdx}, Finish Position column index: ${positionIdx}`);
      
      // Collect winner/finisher data - starts at row 6 (index 5)
      let tournamentFinishers = [];
      
      for (let i = 5; i < Math.min(resultsData.length, 500); i++) {
        const row = resultsData[i];
        if (!row || row.length === 0) continue;
        
        const dgId = row[dgIdIdx];
        const position = row[positionIdx];
        
        // Skip if no DG ID
        if (!dgId) continue;
        
        // Parse position - handle ties (T1, T3) and regular numbers
        let pos = null;
        if (typeof position === 'number') {
          pos = position;
        } else if (typeof position === 'string') {
          // Handle "T1", "T3", "1", etc.
          const posStr = position.toString().trim().toUpperCase();
          if (posStr.startsWith('T')) {
            pos = parseInt(posStr.substring(1));
          } else if (posStr === 'CUT' || posStr === 'WD' || posStr === '') {
            continue;  // Skip cuts and withdrawals
          } else {
            pos = parseInt(posStr);
          }
        }
        
        // Only include valid positions
        if (pos === null || isNaN(pos) || pos <= 0) continue;
        
        tournamentFinishers.push({
          dgId: dgId,
          position: pos,
          metrics: {}
        });
      }
      
      // Validate we have finishers
      if (tournamentFinishers.length < 5) {
        console.log(`⚠️ ${fileName}: Only ${tournamentFinishers.length} valid finishers (need at least 5)`);
        continue;
      }
      
      console.log(`Found ${tournamentFinishers.length} finishers with valid positions`);
      filesProcessed++;
      
      // Now get player stats from the same workbook
      const playerStatsSheet = ss.getSheetByName("Player Ranking Model");
      if (!playerStatsSheet) {
        console.log(`⚠️ ${fileName}: No Player Ranking Model sheet found`);
        continue;
      }
      
      const playerData = playerStatsSheet.getDataRange().getValues();
      console.log(`Player Ranking Model has ${playerData.length} rows, ${playerData[0] ? playerData[0].length : 0} columns`);
      
      // Validate player data has rows
      if (playerData.length <= 5) {
        console.log(`⚠️ ${fileName}: Player data too short (${playerData.length} rows)`);
        continue;
      }
      
      // Headers are on row 5 (index 4)
      const playerHeaderRow = playerData[4];
      const playerHeaderMap = {};
      playerHeaderRow.forEach((header, idx) => {
        if (header) playerHeaderMap[header.toString().trim()] = idx;
      });
      
      // Validate DG ID column exists in player data
      if (playerHeaderMap['DG ID'] === undefined) {
        console.log(`⚠️ ${fileName}: DG ID column not found in Player Ranking Model`);
        continue;
      }
      
      console.log(`Player metric columns found:`, Object.keys(playerHeaderMap).filter(h => allMetrics.includes(h)).slice(0, 10));
      
      // Map player DG IDs to their metrics
      const playerMetricsMap = new Map();
      
      // Data starts at row 6 (index 5)
      for (let i = 5; i < playerData.length; i++) {
        const row = playerData[i];
        if (!row || row.length === 0) continue;
        
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
      
      // Validate we have player data
      if (playerMetricsMap.size === 0) {
        console.log(`⚠️ ${fileName}: No player metric data found`);
        continue;
      }
      
      // Match finishers with their metrics
      let matchedCount = 0;
      tournamentFinishers.forEach(finisher => {
        const metrics = playerMetricsMap.get(finisher.dgId.toString());
        if (metrics) {
          finisher.metrics = metrics;
          matchedCount++;
          correlationData.finisherMetrics.push({
            tournament: fileName,
            dgId: finisher.dgId,
            position: finisher.position,
            isTop10: finisher.position <= 10,
            ...metrics
          });
          
          // Add to both aggregate and per-tournament correlation data
          allMetrics.forEach(metric => {
            const value = metrics[metric];
            // Include all numeric values (including 0) - 0 is a valid metric value
            if (value !== undefined && !isNaN(value)) {
              const isTop10 = finisher.position <= 10;
              
              // Aggregate data
              correlationData.metricCorrelations[metric].values.push({
                position: finisher.position,
                value: value,
                isTop10: isTop10
              });
              
              // Per-tournament data
              tournamentMetrics[metric].values.push({
                position: finisher.position,
                value: value,
                isTop10: isTop10
              });
            }
          });
        }
      });
      
      console.log(`Matched ${matchedCount} of ${tournamentFinishers.length} finishers with metrics`);
      
      // Validate we have meaningful data
      if (matchedCount < 3) {
        console.log(`⚠️ ${fileName}: Insufficient matched finishers (${matchedCount})`);
        continue;
      }
      
      // Calculate per-tournament metric correlations
      allMetrics.forEach(metric => {
        const data = tournamentMetrics[metric];
        
        if (data.values.length >= 5) {  // Need minimum observations
          const top10Values = data.values.filter(v => v.isTop10);
          const allValues = data.values;
          
          data.avgForTop10 = top10Values.length > 0 ? 
            top10Values.reduce((sum, v) => sum + v.value, 0) / top10Values.length : 0;
          
          data.avgForField = allValues.length > 0 ? 
            allValues.reduce((sum, v) => sum + v.value, 0) / allValues.length : 0;
          
          data.deltaTop10VsField = data.avgForTop10 - data.avgForField;
          data.countTop10 = top10Values.length;
          data.countField = allValues.length;
        }
      });
      
      // Store per-tournament correlations
      const sortedTournamentMetrics = Object.values(tournamentMetrics)
        .filter(m => m.values.length >= 5)
        .sort((a, b) => Math.abs(b.deltaTop10VsField) - Math.abs(a.deltaTop10VsField));
      
      correlationData.tournamentCorrelations[fileName] = sortedTournamentMetrics;
      
      // Store tournament breakdown
      const top10Finishers = tournamentFinishers.filter(f => f.position <= 10);
      correlationData.tournamentBreakdown[fileName] = {
        name: fileName,
        totalFinishers: tournamentFinishers.length,
        top10Count: top10Finishers.length,
        metricAverages: {},
        topMetrics: sortedTournamentMetrics.slice(0, 10)  // Top 10 differentiating metrics for this tournament
      };
      
      // Calculate per-tournament metric averages and correlations
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
        
        // Calculate correlation for this metric at this tournament
        let correlation = 0;
        if (allValues.length > 2) {
          const positions = tournamentFinishers
            .filter(f => f.metrics[metric] !== undefined && !isNaN(f.metrics[metric]))
            .map(f => f.position);
          const values = tournamentFinishers
            .filter(f => f.metrics[metric] !== undefined && !isNaN(f.metrics[metric]))
            .map(f => f.metrics[metric]);
          if (positions.length > 2) {
            correlation = calculatePearsonCorrelation(positions, values);
          }
        }
        
        // Invert correlation for metrics where lower is better
        const metricLower = metric.toLowerCase();
        const inverseMetrics = ['poor shots', 'scoring average', 'proximity', 'fairway', 'rough', 'approach'];
        const shouldInvert = inverseMetrics.some(inv => metricLower.includes(inv));
        if (shouldInvert) {
          correlation = -correlation;
        }
        
        correlationData.tournamentBreakdown[fileName].metricAverages[metric] = {
          top10Avg: top10Avg,
          fieldAvg: fieldAvg,
          delta: top10Avg - fieldAvg,
          correlation: correlation
        };
      });
      
      correlationData.tournaments.push({
        name: fileName,
        finisherCount: tournamentFinishers.length,
        top10Count: top10Finishers.length
      });
      filesWithData++;
    }
    
    // Validate we have at least some tournaments with valid data
    if (correlationData.tournaments.length === 0) {
      SpreadsheetApp.getUi().alert(
        `❌ No valid tournament data found.\n\n` +
        `Processed ${filesProcessed} files, but none had sufficient valid data.\n\n` +
        `Requirements:\n` +
        `• Headers on row 5\n` +
        `• DG ID and Finish Position columns\n` +
        `• At least 5 finishers with valid positions\n` +
        `• Player Ranking Model sheet with metrics\n` +
        `• At least 3 finishers matched with metric data`
      );
      return;
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
      }
    });
    
    // ========== COURSE TYPE CLASSIFICATION ==========
    // Cluster tournaments by their metric delta patterns
    const courseTypeGroups = classifyCoursesIntoTypes(correlationData.tournamentCorrelations, correlationData.tournaments);
    correlationData.courseTypes = courseTypeGroups;
    
    // Sort metrics by % above field (top 10 vs field) to find which metrics separate winners
    const sortedMetrics = Object.values(correlationData.metricCorrelations)
      .filter(m => m.values.length > 0 && !isNaN(m.deltaTop10VsField) && m.avgForField !== 0)
      .sort((a, b) => {
        const pctA = Math.abs(a.deltaTop10VsField / a.avgForField);
        const pctB = Math.abs(b.deltaTop10VsField / b.avgForField);
        return pctB - pctA;
      });
    
    // Validate we have meaningful metrics
    if (sortedMetrics.length === 0) {
      SpreadsheetApp.getUi().alert(
        `⚠️ No meaningful metric correlations found.\n\n` +
        `${correlationData.tournaments.length} tournaments processed, ` +
        `but metrics had insufficient variation.`
      );
      return;
    }
    
    // ========== CREATE SHEETS ==========
    
    // 1. INDIVIDUAL TOURNAMENT ANALYSIS SHEET (only for tournaments with valid data)
    const validTournaments = correlationData.tournaments.filter(t => 
      correlationData.tournamentBreakdown[t.name] && 
      correlationData.tournamentBreakdown[t.name].top10Count > 0
    );
    
    if (validTournaments.length > 0) {
      createIndividualTournamentSheets(masterSs, correlationData);
    }
    
    // 1.5. TYPE-SPECIFIC SUMMARY SHEETS (aggregates tournaments by classification)
    if (Object.keys(courseTypeGroups).length > 0) {
      createTypeSpecificSummaries(masterSs, courseTypeGroups, correlationData);
    }
    
    // 2. COURSE TYPE CLASSIFICATION SHEET (only if we have types)
    if (Object.keys(courseTypeGroups).length > 0) {
      createCourseTypeSheet(masterSs, courseTypeGroups, correlationData);
    }
    
    // 2.5. WEIGHT CALIBRATION SHEET (shows current vs recommended weights by type)
    if (Object.keys(courseTypeGroups).length > 0) {
      createWeightCalibrationSheet(masterSs, courseTypeGroups, correlationData);
    }
    
    // 3. MAIN AGGREGATE REPORT (only if we have sorted metrics)
    if (sortedMetrics.length > 0) {
      const reportSheet = masterSs.insertSheet("01_Aggregate_Metric_Report");
      
      reportSheet.appendRow([
        "AGGREGATE METRIC EFFECTIVENESS - TOP 10 FINISHERS vs FIELD AVERAGE"
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
        "# Observations"
      ]);
      
      // Format header
      const headerRange = reportSheet.getRange(3, 1, 1, 7);
      headerRange.setBackground("#4472C4").setFontColor("white").setFontWeight("bold");
      
      // Add metric data
      sortedMetrics.forEach((metric, idx) => {
        if (isNaN(metric.avgForField) || isNaN(metric.deltaTop10VsField)) return;
        
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
          reportSheet.getRange(rowIdx, 4).setBackground("#90EE90");  // Green
        } else if (absDelta > 0.2) {
          reportSheet.getRange(rowIdx, 4).setBackground("#FFFFE0");  // Yellow
        } else {
          reportSheet.getRange(rowIdx, 4).setBackground("#FFB6C1");  // Light red
        }
      });
      
      reportSheet.autoResizeColumns(1, 7);
    }
    
    SpreadsheetApp.getUi().alert(
      `✅ Metric Correlation Analysis Complete!\n\n` +
      `Files processed: ${filesProcessed}\n` +
      `Tournaments analyzed: ${correlationData.tournaments.length}\n` +
      `Valid tournaments: ${validTournaments.length}\n` +
      `Course types: ${Object.keys(courseTypeGroups).length}\n` +
      `Total observations: ${correlationData.finisherMetrics.length}\n\n` +
      `Sheets created:\n` +
      (Object.keys(courseTypeGroups).length > 0 ? `• 00_Course_Type_Classification\n` : ``) +
      (sortedMetrics.length > 0 ? `• 01_Aggregate_Metric_Report\n` : ``) +
      (validTournaments.length > 0 ? `• 02_Tournament_[Name] sheets` : ``)
    );
    
  } catch (e) {
    console.error("Error in analyzeMetricCorrelations:", e);
    SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}\n\nCheck Apps Script console for details.`);
  }
}

/**
 * Classify courses into types based on correlation patterns
 * POWER: Driving Distance, OTT metrics have high correlation
 * TECHNICAL: SG Approach, short game metrics have high correlation  
 * BALANCED: More even distribution across metric types
 */
function classifyCoursesIntoTypes(tournamentCorrelations, tournaments) {
  const courseTypes = {
    'POWER': { name: 'POWER', tournaments: [] },
    'TECHNICAL': { name: 'TECHNICAL', tournaments: [] },
    'BALANCED': { name: 'BALANCED', tournaments: [] }
  };
  
  // Analyze each tournament's correlation profile
  tournaments.forEach(tournament => {
    const metrics = tournamentCorrelations[tournament.name];
    if (!metrics || metrics.length === 0) return;
    
    // Calculate strength of different metric categories
    let powerMetrics = ['driving distance', 'sg ott'];
    let technicalMetrics = ['sg approach', 'sg around green', 'sg putting', 'approach <', 'approach >'];
    let proximityMetrics = ['proximity', 'fairway', 'rough'];
    
    let powerScore = 0, technicalScore = 0, proximityScore = 0;
    
    metrics.forEach(metric => {
      const metricLower = metric.metric.toLowerCase();
      const absCorr = Math.abs(metric.correlation);
      
      if (powerMetrics.some(p => metricLower.includes(p))) {
        powerScore += absCorr;
      } else if (technicalMetrics.some(t => metricLower.includes(t))) {
        technicalScore += absCorr;
      } else if (proximityMetrics.some(p => metricLower.includes(p))) {
        proximityScore += absCorr;
      }
    });
    
    // Classify based on dominant correlation pattern
    const scores = [
      { type: 'POWER', score: powerScore },
      { type: 'TECHNICAL', score: technicalScore },
      { type: 'BALANCED', score: (proximityScore + (powerScore + technicalScore) * 0.5) / 2 }
    ];
    
    scores.sort((a, b) => b.score - a.score);
    const dominantType = scores[0].type;
    
    // Check if it's truly balanced (scores are similar)
    if (scores[0].score > 0 && scores[1].score / scores[0].score > 0.7) {
      courseTypes['BALANCED'].tournaments.push(tournament.name);
    } else {
      courseTypes[dominantType].tournaments.push(tournament.name);
    }
  });
  
  return courseTypes;
}

/**
 * Get metrics common across all tournaments in a type
 */

/**
 * Create individual sheets for each tournament's metric analysis
 */
function createIndividualTournamentSheets(masterSs, correlationData) {
  correlationData.tournaments.forEach((tournament, idx) => {
    const breakdown = correlationData.tournamentBreakdown[tournament.name];
    const metrics = correlationData.tournamentCorrelations[tournament.name] || [];
    
    const sheetName = `02_${tournament.name}`.substring(0, 49);  // Sheet name limit
    const sheet = masterSs.insertSheet(sheetName);
    
    // Header
    sheet.appendRow([`${tournament.name} - Metric Analysis`]);
    sheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
    
    sheet.appendRow([`Top 10: ${breakdown.top10Count} | Total Finishers: ${breakdown.totalFinishers}`]);
    
    sheet.appendRow([" "]);
    sheet.appendRow([
      "Metric",
      "Top 10 Avg",
      "Field Avg",
      "Delta",
      "% Above Field",
      "Correlation"
    ]);
    
    const headerRange = sheet.getRange(4, 1, 1, 6);
    headerRange.setBackground("#70AD47").setFontColor("white").setFontWeight("bold");
    
    // Add all metrics sorted by % above field (descending by absolute percentage)
    const sortedMetrics = Object.values(breakdown.metricAverages)
      .map((data, idx) => ({
        metric: Object.keys(breakdown.metricAverages)[idx],
        ...data
      }))
      .filter(m => m.delta !== undefined && m.fieldAvg !== 0)
      .sort((a, b) => {
        const pctA = a.fieldAvg !== 0 ? Math.abs(a.delta / a.fieldAvg) : 0;
        const pctB = b.fieldAvg !== 0 ? Math.abs(b.delta / b.fieldAvg) : 0;
        return pctB - pctA;  // Descending
      });
    
    sortedMetrics.forEach((m, idx) => {
      const pct = m.fieldAvg !== 0 ? ((m.delta / m.fieldAvg) * 100).toFixed(1) : "N/A";
      const correlation = m.correlation !== undefined ? m.correlation : 0;
      sheet.appendRow([
        m.metric,
        m.top10Avg.toFixed(3),
        m.fieldAvg.toFixed(3),
        m.delta.toFixed(3),
        pct + "%",
        correlation.toFixed(4)
      ]);
      
      const rowIdx = idx + 5;
      const absDelta = Math.abs(m.delta);
      if (absDelta > 0.5) {
        sheet.getRange(rowIdx, 4).setBackground("#90EE90");
      } else if (absDelta > 0.2) {
        sheet.getRange(rowIdx, 4).setBackground("#FFFFE0");
      }
    });
    
    sheet.autoResizeColumns(1, 6);
  });
}

/**
 * Create type-specific summary sheets (aggregates tournament data by course type)
 */
function createTypeSpecificSummaries(masterSs, courseTypes, correlationData) {
  let typeIndex = 3;  // Start numbering at 03_
  
  Object.keys(courseTypes).forEach(typeName => {
    const courseType = courseTypes[typeName];
    const tournaments = courseType.tournaments;
    
    // Get all metrics from breakdowns
    const allMetrics = new Set();
    tournaments.forEach(tName => {
      const breakdown = correlationData.tournamentBreakdown[tName];
      if (breakdown && breakdown.metricAverages) {
        Object.keys(breakdown.metricAverages).forEach(m => allMetrics.add(m));
      }
    });
    
    // Calculate averages across tournaments in this type
    const typeMetricAverages = {};
    allMetrics.forEach(metric => {
      const values = [];
      const correlations = [];
      
      tournaments.forEach(tName => {
        const breakdown = correlationData.tournamentBreakdown[tName];
        if (breakdown && breakdown.metricAverages[metric]) {
          const data = breakdown.metricAverages[metric];
          values.push(data.delta);
          correlations.push(data.correlation);
        }
      });
      
      if (values.length > 0) {
        typeMetricAverages[metric] = {
          avgDelta: values.reduce((a, b) => a + b, 0) / values.length,
          avgCorrelation: correlations.reduce((a, b) => a + b, 0) / correlations.length,
          count: values.length
        };
      }
    });
    
    // Create sheet
    const sheetName = `03_${courseType.name}_Summary`.substring(0, 49);
    const sheet = masterSs.insertSheet(sheetName, typeIndex);
    typeIndex++;
    
    // Header
    sheet.appendRow([`${courseType.name} - Aggregated Metric Analysis`]);
    sheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
    
    sheet.appendRow([`Tournaments: ${tournaments.join(", ")}`]);
    sheet.appendRow([" "]);
    sheet.appendRow([
      "Metric",
      "Avg Delta (Top 10 vs Field)",
      "Avg Correlation",
      "Tournament Count"
    ]);
    
    const headerRange = sheet.getRange(4, 1, 1, 4);
    headerRange.setBackground("#4472C4").setFontColor("white").setFontWeight("bold");
    
    // Add metrics sorted by absolute delta
    const sortedMetrics = Object.entries(typeMetricAverages)
      .map(([metric, data]) => ({
        metric,
        ...data
      }))
      .sort((a, b) => Math.abs(b.avgDelta) - Math.abs(a.avgDelta));
    
    sortedMetrics.forEach((m, idx) => {
      sheet.appendRow([
        m.metric,
        m.avgDelta.toFixed(3),
        m.avgCorrelation.toFixed(4),
        m.count
      ]);
      
      // Color by correlation strength
      const rowIdx = idx + 5;
      if (Math.abs(m.avgCorrelation) > 0.5) {
        sheet.getRange(rowIdx, 3).setBackground("#90EE90");  // Green
      } else if (Math.abs(m.avgCorrelation) > 0.2) {
        sheet.getRange(rowIdx, 3).setBackground("#FFFFE0");  // Yellow
      }
    });
    
    sheet.appendRow([" "]);
    sheet.appendRow(["Note: Metrics show average delta and correlation across all tournaments of this type"]);
    
    sheet.autoResizeColumns(1, 4);
  });
}

/**
 * Create course type classification sheet
 */
function createCourseTypeSheet(masterSs, courseTypes, correlationData) {
  const sheet = masterSs.insertSheet("00_Course_Type_Classification");
  
  sheet.appendRow(["COURSE TYPE CLASSIFICATION (Based on Correlation Patterns)"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  
  sheet.appendRow([" "]);
  
  let currentRow = 3;
  
  // Display in order: POWER, TECHNICAL, BALANCED
  const displayOrder = ['POWER', 'TECHNICAL', 'BALANCED'];
  
  displayOrder.forEach(typeName => {
    if (!courseTypes[typeName]) return;
    
    const courseType = courseTypes[typeName];
    if (courseType.tournaments.length === 0) return;
    
    // Type header with description
    let description = '';
    if (typeName === 'POWER') {
      description = ' - Driving Distance & Power Metrics Dominant';
    } else if (typeName === 'TECHNICAL') {
      description = ' - Short Game & Approach Metrics Dominant';
    } else if (typeName === 'BALANCED') {
      description = ' - Multiple Metric Types Equally Important';
    }
    
    sheet.getRange(currentRow, 1).setValue(
      `${courseType.name}${description} (${courseType.tournaments.length} courses)`
    ).setFontWeight("bold").setFontSize(11).setBackground("#4472C4").setFontColor("white");
    
    currentRow++;
    
    // Tournaments in this type
    sheet.appendRow(["Tournaments:"]);
    currentRow++;
    courseType.tournaments.forEach(t => {
      sheet.appendRow([`  • ${t}`]);
      currentRow++;
    });
    
    // Spacing
    sheet.appendRow([" "]);
    currentRow += 2;
  });
  
  sheet.autoResizeColumns(1, 2);
  
  // Add summary statistics
  const summaryRow = currentRow + 2;
  sheet.appendRow(["SUMMARY"]);
  sheet.getRange(summaryRow, 1).setFontWeight("bold");
  
  sheet.appendRow([`POWER Courses: ${courseTypes['POWER'].tournaments.length}`]);
  sheet.appendRow([`TECHNICAL Courses: ${courseTypes['TECHNICAL'].tournaments.length}`]);
  sheet.appendRow([`BALANCED Courses: ${courseTypes['BALANCED'].tournaments.length}`]);
  sheet.appendRow([`Total Tournaments: ${correlationData.tournaments.length}`]);
  
  sheet.autoResizeColumns(1, 2);
}

/**
 * Create weight calibration sheet showing current vs recommended weights by course type
 */
function createWeightCalibrationSheet(masterSs, courseTypes, correlationData) {
  const sheet = masterSs.insertSheet("04_Weight_Calibration_Per_Tournament");
  
  sheet.appendRow(["WEIGHT CALIBRATION - Actual vs Template vs Recommended"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  
  sheet.appendRow([" "]);
  
  // Process each tournament in correlationData
  let currentRow = 3;
  
  correlationData.tournaments.forEach(tournamentName => {
    const tourCorrelations = correlationData.tournamentCorrelations[tournamentName];
    if (!tourCorrelations || tourCorrelations.length === 0) return;
    
    // Get tournament workbook to read actual Configuration Sheet weights
    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) return;
    
    const golfFolder = folders.next();
    const files = golfFolder.getFilesByName(tournamentName);
    if (!files.hasNext()) return;
    
    const tournamentSs = SpreadsheetApp.open(files.next());
    const configSheet = tournamentSs.getSheetByName("Configuration Sheet");
    
    // Determine course type for this tournament
    let courseType = null;
    Object.keys(courseTypes).forEach(type => {
      if (courseTypes[type].tournaments.includes(tournamentName)) {
        courseType = type;
      }
    });
    
    if (!courseType) return;
    
    // Tournament header
    sheet.getRange(currentRow, 1).setValue(`${tournamentName} (Type: ${courseType})`)
      .setFontWeight("bold").setFontSize(11).setBackground("#4472C4").setFontColor("white");
    
    currentRow++;
    
    // Column headers
    sheet.appendRow([
      "Metric",
      "Actual Weight",
      "Template Weight",
      "Recommended*",
      "Actual vs Template",
      "Template vs Recommended",
      "Correlation"
    ]);
    
    const headerRange = sheet.getRange(currentRow, 1, 1, 7);
    headerRange.setBackground("#E0E0E0").setFontWeight("bold");
    currentRow++;
    
    // Build metric data with actual, template, and recommended weights
    let metricsData = [];
    
    tourCorrelations.slice(0, 15).forEach(metric => {
      const metricName = metric.metric;
      const correlation = metric.correlation;
      
      // Get actual weight from Configuration Sheet (Q16:Q24 for groups, or need to map metrics)
      let actualWeight = 0;
      if (configSheet) {
        // Read group weights from column Q
        const groupWeights = configSheet.getRange("Q16:Q24").getValues();
        // For now, use the correlation as recommended weight normalized
        // In full implementation would need metric→group mapping
        const configData = configSheet.getRange("A1:O100").getValues();
        // Look for metric in configuration sheet rows
        for (let i = 0; i < configData.length; i++) {
          if (configData[i][0] && configData[i][0].toString().includes(metricName)) {
            actualWeight = parseFloat(configData[i][6]) || 0; // Column G onwards has metric weights
            break;
          }
        }
      }
      
      // Get template weight from WEIGHT_TEMPLATES
      const templateData = getTemplateWeightForMetric(courseType, metricName);
      const templateWeight = templateData || 0;
      
      // Recommended weight is the correlation value normalized
      const recommendedWeight = Math.abs(correlation);
      
      metricsData.push({
        metric: metricName,
        actual: actualWeight,
        template: templateWeight,
        recommended: recommendedWeight,
        correlation: correlation
      });
    });
    
    // Sort by absolute correlation
    metricsData.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    
    // Add rows for each metric
    metricsData.forEach(m => {
      const actualVsTemplate = (m.actual - m.template).toFixed(4);
      const templateVsRec = (m.template - m.recommended).toFixed(4);
      
      sheet.appendRow([
        m.metric,
        m.actual.toFixed(4),
        m.template.toFixed(4),
        m.recommended.toFixed(4),
        actualVsTemplate,
        templateVsRec,
        m.correlation.toFixed(4)
      ]);
      currentRow++;
    });
    
    sheet.appendRow([" "]);
    currentRow += 2;
  });
  
  // Add legend
  sheet.appendRow(["*Recommended weights are based on actual tournament correlation analysis"]);
  sheet.appendRow(["Gap = Recommended Weight - Current Weight (positive = increase, negative = decrease)"]);
  sheet.appendRow(["% Change = (Gap / Current Weight) × 100"]);
  
  sheet.autoResizeColumns(1, 7);
}

/**
 * Get template weight for a specific metric in a course type
 * Maps metric names to template group weights
 */
function getTemplateWeightForMetric(courseType, metricName) {
  // Map metric names to group weights from WEIGHT_TEMPLATES
  const WEIGHT_TEMPLATES = {
    POWER: {
      groupWeights: {
        "Driving Performance": 0.130,
        "Approach - Short (<100)": 0.145,
        "Approach - Mid (100-150)": 0.180,
        "Approach - Long (150-200)": 0.150,
        "Approach - Very Long (>200)": 0.030,
        "Putting": 0.120,
        "Around the Green": 0.080,
        "Scoring": 0.110,
        "Course Management": 0.055
      }
    },
    TECHNICAL: {
      groupWeights: {
        "Driving Performance": 0.065,
        "Approach - Short (<100)": 0.148,
        "Approach - Mid (100-150)": 0.185,
        "Approach - Long (150-200)": 0.167,
        "Approach - Very Long (>200)": 0.037,
        "Putting": 0.107,
        "Around the Green": 0.125,
        "Scoring": 0.097,
        "Course Management": 0.069
      }
    },
    BALANCED: {
      groupWeights: {
        "Driving Performance": 0.090,
        "Approach - Short (<100)": 0.148,
        "Approach - Mid (100-150)": 0.186,
        "Approach - Long (150-200)": 0.167,
        "Approach - Very Long (>200)": 0.033,
        "Putting": 0.119,
        "Around the Green": 0.100,
        "Scoring": 0.105,
        "Course Management": 0.052
      }
    }
  };
  
  // Metric to group mapping
  const metricToGroup = {
    "SG Total": "Driving Performance",
    "Driving Distance": "Driving Performance",
    "Driving Accuracy": "Driving Performance",
    "SG OTT": "Driving Performance",
    "Approach <100": "Approach - Short (<100)",
    "Approach <150": "Approach - Mid (100-150)",
    "Approach >150": "Approach - Long (150-200)",
    "Approach >200": "Approach - Very Long (>200)",
    "SG Putting": "Putting",
    "SG Around Green": "Around the Green",
    "Score": "Scoring",
    "Scoring": "Scoring",
    "Model Rank": "Course Management",
    "Scrambling": "Course Management"
  };
  
  // Find matching group for this metric
  let group = null;
  for (const [key, value] of Object.entries(metricToGroup)) {
    if (metricName.includes(key) || metricName.toLowerCase().includes(key.toLowerCase())) {
      group = value;
      break;
    }
  }
  
  if (!group) {
    // Default mapping for fuzzy matches
    if (metricName.includes("Driving") || metricName.includes("Distance") || metricName.includes("OTT")) {
      group = "Driving Performance";
    } else if (metricName.includes("Approach") || metricName.includes("Proximity") || metricName.includes("Fairway")) {
      // Determine which approach group based on yardage indicators
      if (metricName.includes("<100")) group = "Approach - Short (<100)";
      else if (metricName.includes("100") && !metricName.includes(">150")) group = "Approach - Mid (100-150)";
      else if (metricName.includes(">200")) group = "Approach - Very Long (>200)";
      else if (metricName.includes(">150") || metricName.includes("150")) group = "Approach - Long (150-200)";
      else group = "Approach - Short (<100)"; // Default
    } else if (metricName.includes("Putting")) {
      group = "Putting";
    } else if (metricName.includes("Around")) {
      group = "Around the Green";
    } else if (metricName.includes("Score") || metricName.includes("Scoring")) {
      group = "Scoring";
    } else {
      group = "Course Management";
    }
  }
  
  return WEIGHT_TEMPLATES[courseType]?.groupWeights[group] || 0;
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
