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
        
        // Skip if no DG ID or invalid position
        if (!dgId || position === undefined || position === '' || typeof position === 'string') continue;
        
        const pos = parseInt(position);
        if (isNaN(pos) || pos <= 0) continue;
        
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
            if (value !== undefined && !isNaN(value) && value !== 0) {
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
    
    // Sort metrics by delta (top 10 vs field) to find which metrics separate winners
    const sortedMetrics = Object.values(correlationData.metricCorrelations)
      .filter(m => m.values.length > 0 && !isNaN(m.deltaTop10VsField))
      .sort((a, b) => Math.abs(b.deltaTop10VsField) - Math.abs(a.deltaTop10VsField));
    
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
    
    // 2. COURSE TYPE CLASSIFICATION SHEET (only if we have types)
    if (Object.keys(courseTypeGroups).length > 0) {
      createCourseTypeSheet(masterSs, courseTypeGroups, correlationData);
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
 * Classify courses into types based on metric correlation patterns
 * Uses hierarchical clustering to find similar metric profiles
 */
function classifyCoursesIntoTypes(tournamentCorrelations, tournaments) {
  const courseTypes = {};
  
  // Create fingerprint for each tournament (top 10 metrics that differentiate winners)
  const tournamentProfiles = {};
  tournaments.forEach(tournament => {
    const metrics = tournamentCorrelations[tournament.name];
    if (metrics) {
      // Top 10 metrics that separate top 10 from field
      const topMetrics = metrics.slice(0, 10).map(m => m.metric);
      tournamentProfiles[tournament.name] = topMetrics;
    }
  });
  
  // Calculate similarity between tournament profiles (Jaccard similarity on metric overlap)
  const similarityMatrix = {};
  const tournamentNames = Object.keys(tournamentProfiles);
  
  tournamentNames.forEach((t1, i) => {
    similarityMatrix[t1] = {};
    tournamentNames.forEach((t2) => {
      if (t1 === t2) {
        similarityMatrix[t1][t2] = 1.0;
      } else if (!similarityMatrix[t2] || !similarityMatrix[t2][t1]) {
        // Jaccard similarity: intersection / union
        const set1 = new Set(tournamentProfiles[t1]);
        const set2 = new Set(tournamentProfiles[t2]);
        const intersection = [...set1].filter(x => set2.has(x)).length;
        const union = new Set([...set1, ...set2]).size;
        const similarity = union > 0 ? intersection / union : 0;
        similarityMatrix[t1][t2] = similarity;
      } else {
        similarityMatrix[t1][t2] = similarityMatrix[t2][t1];
      }
    });
  });
  
  // Simple clustering: group tournaments with high similarity (>0.5)
  const clustered = new Set();
  let typeNumber = 1;
  
  tournamentNames.forEach(tournament => {
    if (clustered.has(tournament)) return;
    
    const typeGroup = [tournament];
    clustered.add(tournament);
    
    // Find similar tournaments
    tournamentNames.forEach(other => {
      if (!clustered.has(other) && similarityMatrix[tournament][other] > 0.5) {
        typeGroup.push(other);
        clustered.add(other);
      }
    });
    
    const typeName = `Type ${typeNumber}`;
    courseTypes[typeName] = {
      name: typeName,
      tournaments: typeGroup,
      commonMetrics: getCommonMetrics(typeGroup, tournamentProfiles),
      distinctiveMetrics: getDistinctiveMetrics(typeGroup, tournamentProfiles)
    };
    
    typeNumber++;
  });
  
  return courseTypes;
}

/**
 * Get metrics common across all tournaments in a type
 */
function getCommonMetrics(tournaments, profiles) {
  if (tournaments.length === 0) return [];
  
  let commonMetrics = new Set(profiles[tournaments[0]]);
  tournaments.forEach(t => {
    const tSet = new Set(profiles[t]);
    commonMetrics = new Set([...commonMetrics].filter(x => tSet.has(x)));
  });
  
  return [...commonMetrics];
}

/**
 * Get metrics distinctive to this type (frequent in this type, rare in others)
 */
function getDistinctiveMetrics(typeTournaments, profiles) {
  const typeMetrics = {};
  
  // Count metric frequency in this type
  typeTournaments.forEach(t => {
    profiles[t].forEach(metric => {
      typeMetrics[metric] = (typeMetrics[metric] || 0) + 1;
    });
  });
  
  // Get metrics that appear in most tournaments of this type
  const threshold = Math.ceil(typeTournaments.length * 0.6);
  return Object.keys(typeMetrics)
    .filter(metric => typeMetrics[metric] >= threshold)
    .sort((a, b) => typeMetrics[b] - typeMetrics[a]);
}

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
      "% Above Field"
    ]);
    
    const headerRange = sheet.getRange(4, 1, 1, 5);
    headerRange.setBackground("#70AD47").setFontColor("white").setFontWeight("bold");
    
    // Add all metrics sorted by delta
    const sortedMetrics = Object.values(breakdown.metricAverages)
      .map((data, idx) => ({
        metric: Object.keys(breakdown.metricAverages)[idx],
        ...data
      }))
      .filter(m => m.delta !== undefined)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    
    sortedMetrics.forEach((m, idx) => {
      const pct = m.fieldAvg !== 0 ? ((m.delta / m.fieldAvg) * 100).toFixed(1) : "N/A";
      sheet.appendRow([
        m.metric,
        m.top10Avg.toFixed(3),
        m.fieldAvg.toFixed(3),
        m.delta.toFixed(3),
        pct + "%"
      ]);
      
      const rowIdx = idx + 5;
      const absDelta = Math.abs(m.delta);
      if (absDelta > 0.5) {
        sheet.getRange(rowIdx, 4).setBackground("#90EE90");
      } else if (absDelta > 0.2) {
        sheet.getRange(rowIdx, 4).setBackground("#FFFFE0");
      }
    });
    
    sheet.autoResizeColumns(1, 5);
  });
}

/**
 * Create course type classification sheet
 */
function createCourseTypeSheet(masterSs, courseTypes, correlationData) {
  const sheet = masterSs.insertSheet("00_Course_Type_Classification");
  
  sheet.appendRow(["COURSE TYPE CLASSIFICATION"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  
  sheet.appendRow([" "]);
  
  let currentRow = 3;
  
  Object.keys(courseTypes).forEach((typeName, typeIdx) => {
    const courseType = courseTypes[typeName];
    
    // Type header
    sheet.getRange(currentRow, 1).setValue(
      `${courseType.name} (${courseType.tournaments.length} courses)`
    ).setFontWeight("bold").setFontSize(11).setBackground("#4472C4").setFontColor("white");
    
    currentRow++;
    
    // Tournaments in this type
    sheet.appendRow(["Tournaments:"]);
    currentRow++;
    courseType.tournaments.forEach(t => {
      sheet.appendRow([`  • ${t}`]);
      currentRow++;
    });
    
    // Common metrics
    sheet.appendRow([" "]);
    currentRow++;
    sheet.appendRow(["Common Metrics (in all courses of this type):"]);
    currentRow++;
    
    if (courseType.commonMetrics.length > 0) {
      courseType.commonMetrics.forEach(m => {
        sheet.appendRow([`  • ${m}`]);
        currentRow++;
      });
    } else {
      sheet.appendRow(["  (No common metrics across all courses)"]);
      currentRow++;
    }
    
    // Distinctive metrics
    sheet.appendRow([" "]);
    currentRow++;
    sheet.appendRow(["Distinctive Metrics (key to this course type):"]);
    currentRow++;
    
    if (courseType.distinctiveMetrics.length > 0) {
      courseType.distinctiveMetrics.slice(0, 10).forEach(m => {
        sheet.appendRow([`  • ${m}`]);
        currentRow++;
      });
    } else {
      sheet.appendRow(["  (No distinctive metrics identified)"]);
      currentRow++;
    }
    
    // Spacing
    sheet.appendRow([" "]);
    currentRow += 2;
  });
  
  sheet.autoResizeColumns(1, 2);
  
  // Add summary statistics
  const summaryRow = currentRow + 2;
  sheet.appendRow(["SUMMARY"]);
  sheet.getRange(summaryRow, 1).setFontWeight("bold");
  
  sheet.appendRow([`Total Course Types: ${Object.keys(courseTypes).length}`]);
  sheet.appendRow([`Total Tournaments: ${correlationData.tournaments.length}`]);
  
  const avgCoursesPerType = correlationData.tournaments.length / Object.keys(courseTypes).length;
  sheet.appendRow([`Average Courses per Type: ${avgCoursesPerType.toFixed(1)}`]);
  
  sheet.autoResizeColumns(1, 2);
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
