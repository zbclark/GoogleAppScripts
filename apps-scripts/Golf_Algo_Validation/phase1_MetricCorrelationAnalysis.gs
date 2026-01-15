/**
 * Metric Correlation Analysis - Per-Tournament & Course Type Classification
 * Supports incremental updates: processes only new tournaments, recalculates aggregates
 * 
 * 1. Checks processing log for already-analyzed tournaments
 * 2. Processes only new tournaments (appends to existing 02_ sheets)
 * 3. Recalculates 03_ type summaries and 04_ weight guide from all data
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
    
    // Get processing log to check which tournaments are already analyzed
    const processedTournaments = getProcessedTournaments(masterSs);
    console.log("Already processed:", processedTournaments);
    
    let filesProcessed = 0;
    let filesWithData = 0;
    let newTournamentsProcessed = [];
    const tournamentFiles = {};  // Map tournament names to file objects
    
    // Define all 35 metrics - matches sortOrder exactly
    const allMetrics = [
          "Driving Distance",
          "Driving Accuracy",
          "SG OTT",
          "Approach <100 GIR",
          "Approach <100 SG",
          "Approach <100 Prox",
          "Approach <150 FW GIR",
          "Approach <150 FW SG",
          "Approach <150 FW Prox",
          "Approach <200 FW GIR",
          "Approach <200 FW SG",
          "Approach <200 FW Prox",
          "Approach >200 FW GIR",
          "Approach >200 FW SG",
          "Approach >200 FW Prox",
          "SG Putting",
          "SG Around Green",
          "SG T2G",
          "Scoring Average",
          "Birdie Chances Created",
          "Approach <100 SG",
          "Approach <150 FW SG",
          "Approach <150 Rough SG",
          "Approach >150 Rough SG",
          "Approach <200 FW SG",
          "Approach >200 FW SG",
          "Scrambling",
          "Great Shots",
          "Poor Shot Avoidance",
          "Approach <100 Prox",
          "Approach <150 FW Prox",
          "Approach <150 Rough Prox",
          "Approach >150 Rough Prox",
          "Approach <200 FW Prox",
          "Approach >200 FW Prox"
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
      
      // Skip if already processed
      if (processedTournaments.includes(fileName)) {
        console.log(`⏭️  ${fileName}: Already processed, skipping`);
        continue;
      }
      
      const ss = SpreadsheetApp.open(file);
      
      console.log(`\n=== Processing ${fileName} ===`);
      newTournamentsProcessed.push(fileName);
      
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
          
          // Calculate correlation for this tournament's metric
          const positions = data.values.map(v => v.position);
          const values = data.values.map(v => v.value);
          if (positions.length > 2) {
            data.correlation = calculatePearsonCorrelation(positions, values);
          } else {
            data.correlation = 0;
          }
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
        
        // NOTE: Position inversion in calculatePearsonCorrelation handles the golf scoring direction
        // Result: positive correlation = metric predicts winners, negative = metric worsens with winners
        // No additional inversion needed - correlations are semantically correct as-is
        
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
      createIndividualTournamentSheets(masterSs, correlationData, courseTypeGroups);
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
    
    // 2.75. COMPREHENSIVE WEIGHT TEMPLATES SHEET (all metrics with 3-way comparison)
    if (Object.keys(courseTypeGroups).length > 0) {
      createComprehensiveWeightTemplatesSheet(masterSs, courseTypeGroups, correlationData);
    }
    
    SpreadsheetApp.getUi().alert(
      `✅ Metric Correlation Analysis Complete!\n\n` +
      `Files processed: ${filesProcessed}\n` +
      `Tournaments analyzed: ${correlationData.tournaments.length}\n` +
      `Valid tournaments: ${validTournaments.length}\n` +
      `Course types: ${Object.keys(courseTypeGroups).length}\n` +
      `Total observations: ${correlationData.finisherMetrics.length}\n` +
      `New tournaments processed: ${newTournamentsProcessed.length}\n\n` +
      `Sheets created:\n` +
      (Object.keys(courseTypeGroups).length > 0 ? `• 00_Course_Type_Classification\n` : ``) +
      (validTournaments.length > 0 ? `• 02_Tournament_[Name] sheets\n` : ``) +
      (Object.keys(courseTypeGroups).length > 0 ? `• 03_[Type]_Summary sheets\n` : ``) +
      (Object.keys(courseTypeGroups).length > 0 ? `• 04_Weight_Calibration_Guide\n` : ``)
    );
    
    // Update processing log
    if (newTournamentsProcessed.length > 0) {
      updateProcessedTournaments(masterSs, newTournamentsProcessed);
      console.log(`✅ Added ${newTournamentsProcessed.length} tournaments to processing log`);
    }
    
  } catch (e) {
    console.error("Error in analyzeMetricCorrelations:", e);
    SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}\n\nCheck Apps Script console for details.`);
  }
}

/**
 * Classify courses into types based on correlation patterns
 * POWER: Driving Distance, OTT metrics have strong positive correlation (>0.05)
 * TECHNICAL: SG Approach, short game metrics have strong positive correlation (>0.05)
 * BALANCED: More even distribution or no clear dominant type
 */
function classifyCoursesIntoTypes(tournamentCorrelations, tournaments) {
  const courseTypes = {
    'POWER': { name: 'POWER', tournaments: [] },
    'TECHNICAL': { name: 'TECHNICAL', tournaments: [] },
    'BALANCED': { name: 'BALANCED', tournaments: [] }
  };
  
  const CORRELATION_THRESHOLD = 0.05;  // Only count correlations above this threshold
  
  // Analyze each tournament's correlation profile
  tournaments.forEach(tournament => {
    const metrics = tournamentCorrelations[tournament.name];
    if (!metrics || metrics.length === 0) return;
    
    // Calculate strength of different metric categories (only count positive correlations)
    let powerMetrics = ['driving distance', 'sg ott'];
    let technicalMetrics = ['sg approach', 'sg around green', 'sg putting'];
    let proximityMetrics = ['proximity', 'fairway', 'rough'];
    
    let powerScore = 0, technicalScore = 0, proximityScore = 0;
    
    metrics.forEach(metric => {
      const metricLower = metric.metric.toLowerCase();
      const corr = metric.correlation;  // Keep sign
      
      // Only count if correlation is positive and above threshold
      if (corr > CORRELATION_THRESHOLD) {
        if (powerMetrics.some(p => metricLower.includes(p))) {
          powerScore += corr;
        } else if (technicalMetrics.some(t => metricLower.includes(t))) {
          technicalScore += corr;
        } else if (proximityMetrics.some(p => metricLower.includes(p))) {
          proximityScore += corr;
        }
      }
    });
    
    // Classify based on dominant positive correlation pattern
    const scores = [
      { type: 'POWER', score: powerScore },
      { type: 'TECHNICAL', score: technicalScore }
    ];
    
    scores.sort((a, b) => b.score - a.score);
    
    // Classify: assign to type with highest score if it has clear dominance (2x difference)
    if (scores[0].score > 0) {
      const secondScore = scores[1].score > 0 ? scores[1].score : 0;
      if (scores[0].score >= secondScore * 2) {
        // Clear dominant type (at least 2x the second score)
        courseTypes[scores[0].type].tournaments.push(tournament.name);
      } else {
        // No clear dominance - mark as BALANCED
        courseTypes['BALANCED'].tournaments.push(tournament.name);
      }
    } else {
      // No positive correlations - mark as BALANCED
      courseTypes['BALANCED'].tournaments.push(tournament.name);
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
function createIndividualTournamentSheets(masterSs, correlationData, courseTypes) {
  // Get tournament files for winner analysis and config weights
  const folders = DriveApp.getFoldersByName("Golf 2025");
  let tournamentFiles = {};
  if (folders.hasNext()) {
    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      tournamentFiles[file.getName()] = file;
    }
  }
  
  correlationData.tournaments.forEach((tournament, idx) => {
    const breakdown = correlationData.tournamentBreakdown[tournament.name];
    const metrics = correlationData.tournamentCorrelations[tournament.name] || [];
    
    // Get tournament-specific config weights from the tournament workbook
    const tournamentWorkbook = tournamentFiles[tournament.name] 
      ? SpreadsheetApp.open(tournamentFiles[tournament.name])
      : null;
    const configWeights = getTournamentConfigurationWeights(tournamentWorkbook);
    console.log(`Tournament "${tournament.name}": Config weights loaded: ${Object.keys(configWeights).length} entries`);
    
    // Determine course type for this tournament
    let tournamentType = "BALANCED";  // Default
    for (const [typeName, typeData] of Object.entries(courseTypes)) {
      if (typeData.tournaments.includes(tournament.name)) {
        tournamentType = typeName;
        break;
      }
    }
    
    const sheetName = `02_${tournament.name}`.substring(0, 49);  // Sheet name limit
    const sheet = masterSs.insertSheet(sheetName);
    
    // Header
    sheet.appendRow([`${tournament.name} - Metric Analysis (${tournamentType} Course)`]);
    sheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
    
    sheet.appendRow([`Top 10: ${breakdown.top10Count} | Total Finishers: ${breakdown.totalFinishers}`]);
    
    sheet.appendRow([" "]);
    sheet.appendRow([
      "Metric",
      "Top 10 Avg",
      "Field Avg",
      "Delta",
      "% Above Field",
      "Correlation",
      "Config Weight",
      "Template Weight",
      "Recommended Weight"
    ]);
    
    const headerRange = sheet.getRange(4, 1, 1, 9);
    headerRange.setBackground("#70AD47").setFontColor("white").setFontWeight("bold");
    
    // Add all metrics sorted by % above field (descending by absolute percentage)
    const sortedMetrics = Object.values(breakdown.metricAverages)
      .map((data, idx) => ({
        metric: Object.keys(breakdown.metricAverages)[idx],
        ...data
      }))
      .filter(m => m.delta !== undefined && m.fieldAvg !== 0)
      .sort((a, b) => {
        // Exact sort order as specified - group by distance threshold, then by metric type within each threshold
        const sortOrder = [
          "Driving Distance",
          "Driving Accuracy",
          "SG OTT",
          "Approach <100 GIR",
          "Approach <100 SG",
          "Approach <100 Prox",
          "Approach <150 FW GIR",
          "Approach <150 FW SG",
          "Approach <150 FW Prox",
          "Approach <200 FW GIR",
          "Approach <200 FW SG",
          "Approach <200 FW Prox",
          "Approach >200 FW GIR",
          "Approach >200 FW SG",
          "Approach >200 FW Prox",
          "SG Putting",
          "SG Around Green",
          "SG T2G",
          "Scoring Average",
          "Birdie Chances Created",
          "Approach <100 SG",
          "Approach <150 FW SG",
          "Approach <150 Rough SG",
          "Approach >150 Rough SG",
          "Approach <200 FW SG",
          "Approach >200 FW SG",
          "Scrambling",
          "Great Shots",
          "Poor Shot Avoidance",
          "Approach <100 Prox",
          "Approach <150 FW Prox",
          "Approach <150 Rough Prox",
          "Approach >150 Rough Prox",
          "Approach <200 FW Prox",
          "Approach >200 FW Prox"
        ];
        
        // Find best matching index - check for exact match first, then partial
        const findBestMatch = (metricName) => {
          const metricLower = metricName.toLowerCase();
          
          for (let i = 0; i < sortOrder.length; i++) {
            const sortKeyLower = sortOrder[i].toLowerCase();
            // Exact match (highest priority)
            if (metricLower === sortKeyLower) {
              return i;
            }
          }
          
          // Partial match - metricLower contains sortKey
          let bestIndex = sortOrder.length;
          let bestLength = 0;
          
          for (let i = 0; i < sortOrder.length; i++) {
            const sortKeyLower = sortOrder[i].toLowerCase();
            if (metricLower.includes(sortKeyLower)) {
              if (sortKeyLower.length > bestLength) {
                bestIndex = i;
                bestLength = sortKeyLower.length;
              }
            }
          }
          
          return bestIndex;
        };
        
        const indexA = findBestMatch(a.metric);
        const indexB = findBestMatch(b.metric);
        
        return indexA - indexB;
      });
    
    // Calculate recommended weights based on correlation strength within each group
    // Group metrics and find max correlation per group
    const metricGroups = getMetricGroupings();
    const groupMaxCorrelations = {};
    
    // Find max correlation by group
    for (const [groupName, metrics] of Object.entries(metricGroups)) {
      let maxCorrelation = 0;
      for (const metricName of metrics) {
        const metricData = breakdown.metricAverages[metricName];
        if (metricData) {
          const absCorr = Math.abs(metricData.correlation || 0);
          if (absCorr > maxCorrelation) {
            maxCorrelation = absCorr;
          }
        }
      }
      groupMaxCorrelations[groupName] = maxCorrelation;
    }
    
    // Get group weights for this course type
    const groupWeights = getGroupWeights(tournamentType);
    
    sortedMetrics.forEach((m, idx) => {
      // Calculate percentage with special handling for lower-is-better metrics
      let pct = "N/A";
      if (m.fieldAvg !== 0) {
        const metricNameLower = m.metric.toLowerCase();
        const isLowerBetter = metricNameLower.includes("proximity") || 
                             metricNameLower.includes("scoring") || 
                             metricNameLower.includes("poor shot");
        
        if (isLowerBetter) {
          // For Proximity, Scoring Average, and Poor Shots (lower is better):
          // Flip sign if top10 is actually better (lower values = improvement = positive %)
          let adjustedDelta = m.delta;
          if (m.top10Avg < m.fieldAvg) {
            // Top 10 is better (lower values), show as positive improvement
            adjustedDelta = Math.abs(m.delta);
          } else if (m.top10Avg > m.fieldAvg) {
            // Top 10 is worse (higher values), show as negative decline
            adjustedDelta = -Math.abs(m.delta);
          }
          pct = ((adjustedDelta / Math.abs(m.fieldAvg)) * 100).toFixed(1);
        } else {
          // For all other metrics (higher is better): natural calculation
          // Positive delta = improvement, negative delta = decline
          pct = ((m.delta / m.fieldAvg) * 100).toFixed(1);
        }
      }
      
      const correlation = m.correlation !== undefined ? m.correlation : 0;
      const templateWeight = getTemplateWeightForMetric(tournamentType, m.metric);
      
      // Calculate recommended weight based on correlation strength within the metric's group
      // Formula: templateWeight * (metricCorrelation / maxCorrelationInGroup)
      let recommendedWeight = 0;
      const metricGroup = getMetricGroup(m.metric);
      if (metricGroup && groupMaxCorrelations[metricGroup] > 0) {
        const maxCorr = groupMaxCorrelations[metricGroup];
        const correlationRatio = Math.abs(correlation) / maxCorr;
        recommendedWeight = templateWeight * correlationRatio;
      }
      
      // Find matching config weight for this metric
      // Try exact match first, then fuzzy matching
      let configWeight = configWeights[m.metric] || 0;
      
      if (configWeight === 0) {
        // Try partial matches if exact match didn't work
        const metricLower = m.metric.toLowerCase();
        for (const [configMetric, weight] of Object.entries(configWeights)) {
          if (weight > 0) {  // Only consider non-zero weights
            const configLower = configMetric.toLowerCase();
            if (metricLower.includes(configLower) || configLower.includes(metricLower)) {
              configWeight = weight;
              console.log(`  Matched "${m.metric}" to config metric "${configMetric}" = ${weight}`);
              break;
            }
          }
        }
      }
      
      if (configWeight > 0) {
        console.log(`  ${m.metric}: configWeight = ${configWeight}`);
      }

      // Always show Template Weight and Recommended Weight for all metrics
      const templateWeightValue = templateWeight.toFixed(4);
      const recommendedWeightValue = recommendedWeight.toFixed(4);

      sheet.appendRow([
        m.metric,
        m.top10Avg.toFixed(3),
        m.fieldAvg.toFixed(3),
        m.delta.toFixed(3),
        pct + "%",
        correlation.toFixed(4),
        configWeight.toFixed(4),
        templateWeightValue,
        recommendedWeightValue
      ]);
      
      const rowIdx = idx + 5;
      const absDelta = Math.abs(m.delta);
      if (absDelta > 0.5) {
        sheet.getRange(rowIdx, 4).setBackground("#90EE90");
      } else if (absDelta > 0.2) {
        sheet.getRange(rowIdx, 4).setBackground("#FFFFE0");
      }
    });
    
    // ========== PLAYER ACCURACY DATA SECTION (DELTAS) ==========
    // Add spacing and header
    const metricsEndRow = sheet.getLastRow();
    sheet.appendRow([" "]);
    sheet.appendRow(["PLAYER-LEVEL ACCURACY ANALYSIS"]);
    sheet.getRange(metricsEndRow + 2, 1).setFontWeight("bold").setFontSize(11).setBackground("#e5e7eb");
    
    // Load tournament file with actual results and model data
    const tournamentFile = tournamentFiles[tournament.name];
    if (tournamentFile) {
      try {
        const tournamendSs = SpreadsheetApp.open(tournamentFile);
        const resultsSheet = tournamendSs.getSheetByName("Tournament Results");
        
        if (resultsSheet) {
          // Read Tournament Results to get player data with model and actual values
          const resultsRange = resultsSheet.getDataRange();
          const resultsData = resultsRange.getValues();
          
          // Map column headers to indices
          let colMap = {};
          const headerRow = resultsData[4]; // Row 5 (index 4) contains headers
          
          headerRow.forEach((header, idx) => {
            const h = String(header || "").toLowerCase().trim();
            if (h === "dg id") colMap.dgId = idx;
            if (h === "player name") colMap.name = idx;
            if (h === "model rank") colMap.modelRank = idx;
            if (h === "finish position") colMap.finishPos = idx;
            
            // Actual metric values
            if (h === "sg total") colMap.sgTotal = idx;
            if (h === "driving distance") colMap.drivDist = idx;
            if (h === "driving accuracy") colMap.drivAcc = idx;
            if (h === "sg t2g") colMap.sgT2G = idx;
            if (h === "sg approach") colMap.sgApproach = idx;
            if (h === "sg around green") colMap.sgAroundGreen = idx;
            if (h === "sg ott") colMap.sgOTT = idx;
            if (h === "sg putting") colMap.sgPutting = idx;
            if (h === "greens in regulation") colMap.gir = idx;
            if (h === "fairway proximity") {
              colMap.fairwayProx = idx;
              console.log(`✓ Found Fairway Proximity at column ${idx}`);
            }
            if (h === "rough proximity") {
              colMap.roughProx = idx;
              console.log(`✓ Found Rough Proximity at column ${idx}`);
            }
            
            // Model metric values
            if (h === "sg total - model") colMap.sgTotalModel = idx;
            if (h === "driving distance - model") colMap.drivDistModel = idx;
            if (h === "driving accuracy - model") colMap.drivAccModel = idx;
            if (h === "sg t2g - model") colMap.sgT2GModel = idx;
            if (h === "sg approach - model") colMap.sgApproachModel = idx;
            if (h === "sg around green - model") colMap.sgAroundGreenModel = idx;
            if (h === "sg ott - model") colMap.sgOTTModel = idx;
            if (h === "sg putting - model") colMap.sgPuttingModel = idx;
            if (h === "greens in regulation - model") colMap.girModel = idx;
            if (h === "fairway proximity - model") {
              colMap.fairwayProxModel = idx;
              console.log(`✓ Found Fairway Proximity - Model at column ${idx}`);
            }
            if (h === "rough proximity - model") {
              colMap.roughProxModel = idx;
              console.log(`✓ Found Rough Proximity - Model at column ${idx}`);
            }
          });
          
          // Log all found columns
          console.log("Full colMap:", colMap);
          console.log("Total columns in data:", headerRow.length);
          console.log("Column headers around Y-AB:", headerRow.slice(24, 28));
          
          // Parse player data
          const playerDataWithDeltas = [];
          for (let i = 5; i < resultsData.length; i++) {
            const row = resultsData[i];
            const dgId = String(row[colMap.dgId] || "").trim();
            const name = String(row[colMap.name] || "").trim();
            
            if (!dgId) break;
            
            const modelRank = parseInt(row[colMap.modelRank]) || 999;
            const finishStr = String(row[colMap.finishPos] || "").trim();
            let finishPos = 999;
            if (!isNaN(parseInt(finishStr))) {
              finishPos = parseInt(finishStr);
            } else if (finishStr.includes("T")) {
              finishPos = parseInt(finishStr.replace("T", "")) || 999;
            }
            
            if (finishPos === 999) continue; // Skip non-finishers
            
            // Calculate deltas for all metrics (Model - Actual)
            const statDeltas = {
              "SG Total": (parseFloat(row[colMap.sgTotalModel]) || 0) - (parseFloat(row[colMap.sgTotal]) || 0),
              "Driving Distance": (parseFloat(row[colMap.drivDistModel]) || 0) - (parseFloat(row[colMap.drivDist]) || 0),
              "Driving Accuracy": (parseFloat(row[colMap.drivAccModel]) || 0) - (parseFloat(row[colMap.drivAcc]) || 0),
              "SG T2G": (parseFloat(row[colMap.sgT2GModel]) || 0) - (parseFloat(row[colMap.sgT2G]) || 0),
              "SG Approach": (parseFloat(row[colMap.sgApproachModel]) || 0) - (parseFloat(row[colMap.sgApproach]) || 0),
              "SG Around Green": (parseFloat(row[colMap.sgAroundGreenModel]) || 0) - (parseFloat(row[colMap.sgAroundGreen]) || 0),
              "SG OTT": (parseFloat(row[colMap.sgOTTModel]) || 0) - (parseFloat(row[colMap.sgOTT]) || 0),
              "SG Putting": (parseFloat(row[colMap.sgPuttingModel]) || 0) - (parseFloat(row[colMap.sgPutting]) || 0),
              "GIR": (parseFloat(row[colMap.girModel]) || 0) - (parseFloat(row[colMap.gir]) || 0),
              "Fairway Proximity": (parseFloat(row[colMap.fairwayProxModel]) || 0) - (parseFloat(row[colMap.fairwayProx]) || 0),
              "Rough Proximity": (parseFloat(row[colMap.roughProxModel]) || 0) - (parseFloat(row[colMap.roughProx]) || 0)
            };
            
            playerDataWithDeltas.push({
              name: name,
              dgId: dgId,
              modelRank: modelRank,
              finishPos: finishPos,
              finishText: finishStr,
              statDeltas: statDeltas
            });
          }
          
          if (playerDataWithDeltas.length > 0) {
            // Sort by model rank ascending (low to high)
            playerDataWithDeltas.sort((a, b) => a.modelRank - b.modelRank);
            
            // Build header row
            const deltaMetrics = [
              "SG Total Δ", "Driving Distance Δ", "Driving Accuracy Δ",
              "SG T2G Δ", "SG Approach Δ", "SG Around Green Δ",
              "SG OTT Δ", "SG Putting Δ", "GIR Δ",
              "Fairway Proximity Δ", "Rough Proximity Δ"
            ];
            
            const playerHeaderRow = ["Player", "Model Rank", "Finish Pos", "Miss Score", "Gap Analysis", ...deltaMetrics];
            sheet.appendRow(playerHeaderRow);
            
            const playerDataHeaderRow = sheet.getLastRow();
            sheet.getRange(playerDataHeaderRow, 1, 1, playerHeaderRow.length)
              .setFontWeight("bold")
              .setBackground("#1f2937")
              .setFontColor("white");
            
            // Add each player's data
            playerDataWithDeltas.forEach((player, idx) => {
              // Calculate Miss Score and Gap Analysis
              const missScore = player.modelRank - player.finishPos;
              let gapAnalysis = "";
              if (missScore === 0) {
                gapAnalysis = "Perfect";
              } else if (missScore > 0) {
                gapAnalysis = `Predicted ${missScore} spots too high`;
              } else {
                gapAnalysis = `Predicted ${Math.abs(missScore)} spots too low`;
              }
              
              const rowData = [
                player.name,
                player.modelRank,
                player.finishText,
                missScore,
                gapAnalysis
              ];
              
              // Debug: Log metrics
              if (idx === 0) {
                console.log("statDeltas keys:", Object.keys(player.statDeltas));
              }
              
              // Add delta values for this player
              deltaMetrics.forEach(deltaKey => {
                const metricKey = deltaKey.replace(" Δ", "");
                const delta = player.statDeltas[metricKey];
                
                // Debug first player
                if (idx === 0) {
                  console.log(`  ${metricKey}: delta=${delta}`);
                }
                
                // Format based on metric type
                if (metricKey.includes("Distance") || metricKey === "Scoring Average") {
                  rowData.push(delta !== undefined ? delta.toFixed(0) : "");
                } else if (metricKey === "Driving Accuracy" || metricKey.includes("Proximity")) {
                  rowData.push(delta !== undefined ? delta.toFixed(1) : "");
                } else {
                  rowData.push(delta !== undefined ? delta.toFixed(2) : "");
                }
              });
              
              sheet.appendRow(rowData);
              
              // Highlight top 10 finishers
              if (player.finishPos <= 10) {
                sheet.getRange(sheet.getLastRow(), 1, 1, rowData.length).setBackground("#ffffcc");
              }
            });
            
            // Auto-resize columns
            sheet.autoResizeColumns(1, playerHeaderRow.length);
            console.log(`✓ Added ${playerDataWithDeltas.length} players with delta data to ${tournament.name}`);
          }
        }
      } catch (e) {
        console.log(`Note: Could not load player delta data from ${tournament.name}: ${e.message}`);
      }
    }
    
    sheet.autoResizeColumns(1, 9);
  });
}

/**
 * Create comprehensive weight templates sheet showing all metrics with 3-way weight comparison
 * Shows Config Weight vs Template Weight vs Recommended Weight across all course types
 */
function createComprehensiveWeightTemplatesSheet(masterSs, courseTypes, correlationData) {
  // Get config weights - average across all tournaments
  const allConfigWeights = {};
  let tournamentCount = 0;
  
  // Get tournament files to read config weights from each
  const folders = DriveApp.getFoldersByName("Golf 2025");
  if (folders.hasNext()) {
    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const tourFiles = {};
    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      tourFiles[file.getName()] = file;
    }
    
    // Aggregate config weights from each tournament
    correlationData.tournaments.forEach(tournament => {
      if (tourFiles[tournament.name]) {
        const tourSs = SpreadsheetApp.open(tourFiles[tournament.name]);
        const weights = getTournamentConfigurationWeights(tourSs);
        if (Object.keys(weights).length > 0) {
          Object.entries(weights).forEach(([metric, weight]) => {
            if (!allConfigWeights[metric]) {
              allConfigWeights[metric] = { sum: 0, count: 0 };
            }
            allConfigWeights[metric].sum += weight || 0;
            allConfigWeights[metric].count += 1;
          });
          tournamentCount++;
        }
      }
    });
  }
  
  // Calculate averages
  const configWeights = {};
  Object.entries(allConfigWeights).forEach(([metric, data]) => {
    configWeights[metric] = data.count > 0 ? data.sum / data.count : 0;
  });
  
  console.log(`Comprehensive sheet: Aggregated ${Object.keys(configWeights).length} config weight metrics from ${tournamentCount} tournaments`);
  
  // Delete old Weight Templates if it exists (will be replaced)
  let oldSheet = masterSs.getSheetByName("Weight Templates");
  if (oldSheet) {
    masterSs.deleteSheet(oldSheet);
  }
  
  const sheet = masterSs.insertSheet("Weight Templates");
  
  sheet.appendRow(["COMPREHENSIVE WEIGHT TEMPLATES - All Metrics by Course Type"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  
  sheet.appendRow([" "]);
  
  let currentRow = 3;
  const displayOrder = ['POWER', 'TECHNICAL', 'BALANCED'];
  
  displayOrder.forEach(typeName => {
    if (!courseTypes[typeName] || courseTypes[typeName].tournaments.length === 0) return;
    
    const courseType = courseTypes[typeName];
    
    // Type header
    sheet.getRange(currentRow, 1).setValue(
      `${typeName} COURSES (${courseType.tournaments.length} tournaments)`
    ).setFontWeight("bold").setFontSize(11).setBackground("#4472C4").setFontColor("white");
    
    currentRow++;
    
    // Column headers
    sheet.appendRow([
      "Metric",
      "Config Weight",
      "Template Weight",
      "Recommended Weight",
      "Config vs Template",
      "Config vs Recommended"
    ]);
    
    const headerRange = sheet.getRange(currentRow, 1, 1, 6);
    headerRange.setBackground("#D9E8F5").setFontWeight("bold");
    currentRow++;
    
    // Collect all metrics with their weights
    const allMetrics = getMetricGroupings();
    const metricsList = [];
    
    for (const [groupName, metrics] of Object.entries(allMetrics)) {
      for (const metricName of metrics) {
        metricsList.push({
          name: metricName,
          group: groupName
        });
      }
    }
    
    // Group correlations for recommended weight calculation
    const groupCorrelationTotals = {};
    for (const [groupName, metrics] of Object.entries(allMetrics)) {
      let maxCorrelation = 0;
      let hasData = false;
      for (const metricName of metrics) {
        // Get average correlation across all tournaments for this metric
        let avgCorr = 0;
        let corrCount = 0;
        for (const tournament of correlationData.tournaments) {
          const breakdown = correlationData.tournamentBreakdown[tournament.name];
          if (breakdown && breakdown.metricAverages[metricName]) {
            avgCorr += Math.abs(breakdown.metricAverages[metricName].correlation || 0);
            corrCount++;
            hasData = true;
          }
        }
        if (corrCount > 0) {
          avgCorr = avgCorr / corrCount;
          if (avgCorr > maxCorrelation) {
            maxCorrelation = avgCorr;
          }
        }
      }
      groupCorrelationTotals[groupName] = { max: maxCorrelation, hasData: hasData };
    }
    
    const groupWeights = getGroupWeights(typeName);
    
    // Add each metric
    metricsList.forEach(m => {
      const configWeight = configWeights[m.name] || 0;
      const templateWeight = getTemplateWeightForMetric(typeName, m.name);
      
      // Calculate recommended weight: templateWeight * (metricCorrelation / maxCorrelationInGroup)
      let recommendedWeight = 0;
      const groupData = groupCorrelationTotals[m.group];
      if (groupData && groupData.max > 0) {
        // Get this specific metric's average correlation
        let metricAvgCorr = 0;
        let metricCorrCount = 0;
        for (const tournament of correlationData.tournaments) {
          const breakdown = correlationData.tournamentBreakdown[tournament.name];
          if (breakdown && breakdown.metricAverages[m.name]) {
            metricAvgCorr += Math.abs(breakdown.metricAverages[m.name].correlation || 0);
            metricCorrCount++;
          }
        }
        if (metricCorrCount > 0) {
          metricAvgCorr = metricAvgCorr / metricCorrCount;
          const correlationRatio = metricAvgCorr / groupData.max;
          recommendedWeight = templateWeight * correlationRatio;
        }
      }
      
      const configVsTemplate = templateWeight > 0 ? (((configWeight - templateWeight) / templateWeight) * 100).toFixed(1) : "N/A";
      const configVsRec = recommendedWeight > 0 ? (((configWeight - recommendedWeight) / recommendedWeight) * 100).toFixed(1) : "N/A";
      
      sheet.appendRow([
        m.name,
        configWeight.toFixed(4),
        templateWeight.toFixed(4),
        recommendedWeight.toFixed(4),
        configVsTemplate === "N/A" ? "N/A" : configVsTemplate + "%",
        configVsRec === "N/A" ? "N/A" : configVsRec + "%"
      ]);
      
      currentRow++;
    });
    
    currentRow += 2; // Space between course types
  });
  
  sheet.autoResizeColumns(1, 6);
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
 * Create weight calibration sheet showing template vs recommended weights by course type
 */
function createWeightCalibrationSheet(masterSs, courseTypes, correlationData) {
  const sheet = masterSs.insertSheet("04_Weight_Calibration_Guide");
  
  sheet.appendRow(["WEIGHT CALIBRATION - Template vs Recommended by Course Type"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  
  sheet.appendRow([" "]);
  
  // Display each course type
  let currentRow = 3;
  const displayOrder = ['POWER', 'TECHNICAL', 'BALANCED'];
  
  displayOrder.forEach(typeName => {
    if (!courseTypes[typeName] || courseTypes[typeName].tournaments.length === 0) return;
    
    const courseType = courseTypes[typeName];
    
    // Type header
    sheet.getRange(currentRow, 1).setValue(
      `${typeName} COURSES (${courseType.tournaments.length} tournaments)`
    ).setFontWeight("bold").setFontSize(11).setBackground("#4472C4").setFontColor("white");
    
    currentRow++;
    
    // Column headers
    sheet.appendRow([
      "Metric",
      "Template Weight",
      "Recommended*",
      "Gap",
      "% Change"
    ]);
    
    const headerRange = sheet.getRange(currentRow, 1, 1, 5);
    headerRange.setBackground("#E0E0E0").setFontWeight("bold");
    currentRow++;
    
    // Get type summary sheet to read correlations
    const typeSummarySheetName = `03_${typeName}_Summary`;
    const typeSummarySheet = masterSs.getSheetByName(typeSummarySheetName);
    
    let metricsData = [];
    if (typeSummarySheet) {
      const data = typeSummarySheet.getRange("A1:D100").getValues();
      // Headers start at row 4, data at row 5
      for (let i = 4; i < data.length; i++) {
        const metricName = data[i][0];
        const avgCorr = parseFloat(data[i][2]) || 0;
        if (metricName) {
          metricsData.push({
            metric: metricName.toString().trim(),
            correlation: avgCorr
          });
        }
      }
    }
    
    // Sort by absolute correlation
    metricsData.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    
    // Add rows for each metric (ALL metrics, not just top 15)
    metricsData.forEach(m => {
      // Get template weight
      const templateWeight = getTemplateWeightForMetric(typeName, m.metric);
      
      // Recommended weight is normalized correlation
      const recommendedWeight = Math.abs(m.correlation);
      
      // Calculate gap
      const gap = (recommendedWeight - templateWeight).toFixed(4);
      const pctChange = templateWeight > 0 ? ((gap / templateWeight) * 100).toFixed(1) : "N/A";
      
      sheet.appendRow([
        m.metric,
        templateWeight.toFixed(4),
        recommendedWeight.toFixed(4),
        gap,
        pctChange + "%"
      ]);
      
      // Color code by gap magnitude
      const gapVal = Math.abs(parseFloat(gap));
      if (gapVal > 0.1) {
        sheet.getRange(currentRow, 3).setBackground("#FFE699");  // Yellow for significant gaps
      }
      
      currentRow++;
    });
    
    sheet.appendRow([" "]);
    currentRow += 2;
  });
  
  // Add legend
  sheet.appendRow(["*Recommended weights are normalized from tournament correlation values (absolute)"]);
  sheet.appendRow(["Gap = Recommended - Template (positive = increase weight, negative = decrease)"]);
  sheet.appendRow(["% Change = (Gap / Template Weight) × 100"]);
  
  sheet.autoResizeColumns(1, 5);
}

/**
 * Get template weight for a specific metric in a course type
 * Maps metric names to template individual metric weights from templateLoader.js
 * Returns the individual metric weight (distribution within group, not multiplied by group weight)
 */
function getTemplateWeightForMetric(courseType, metricName) {
  // Individual metric weights from WEIGHT_TEMPLATES in templateLoader.js
  // These are the distribution percentages within each group (before multiplying by group weight)
  const METRIC_TEMPLATES = {
    POWER: {
      // Driving Performance [0.404, 0.123, 0.472]
      "Driving Distance": 0.404,
      "Driving Accuracy": 0.123,
      "SG OTT": 0.472,
      
      // Approach <100 [0.14, 0.33, 0.53]
      "Approach <100 GIR": 0.14,
      "Approach <100 SG": 0.33,
      "Approach <100 Prox": 0.53,
      
      // Approach 100-150 [0.12, 0.32, 0.56]
      "Approach <150 FW GIR": 0.12,
      "Approach <150 FW SG": 0.32,
      "Approach <150 FW Prox": 0.56,
      "Approach <150 Rough GIR": 0.0,
      "Approach <150 Rough SG": 0.0,
      "Approach <150 Rough Prox": 0.0,
      
      // Approach 150-200 [0.11, 0.30, 0.59]
      "Approach <200 FW GIR": 0.11,
      "Approach <200 FW SG": 0.30,
      "Approach <200 FW Prox": 0.59,
      "Approach >150 Rough GIR": 0.0,
      "Approach >150 Rough SG": 0.0,
      "Approach >150 Rough Prox": 0.0,
      
      // Approach >200 [0.10, 0.25, 0.65]
      "Approach >200 FW GIR": 0.10,
      "Approach >200 FW SG": 0.25,
      "Approach >200 FW Prox": 0.65,
      "Approach >200 FW Rough GIR": 0.0,
      "Approach >200 FW Rough SG": 0.0,
      "Approach >200 FW Rough Prox": 0.0,
      
      // Putting [1.0]
      "SG Putting": 1.0,
      
      // Around Green [1.0]
      "SG Around Green": 1.0,
      
      // Scoring [0.20, 0.10, 0.10, 0.15, 0.15, 0.15, 0.10, 0.05, 0.00]
      "SG T2G": 0.20,
      "Scoring Average": 0.10,
      "Birdie Chances Created": 0.10,
      "Birdies or Better": 0.15,
      "Greens in Regulation": 0.15,
      "Approach <100 SG": 0.15,
      "Approach <150 FW SG": 0.10,
      "Approach <150 Rough SG": 0.05,
      "Approach >150 Rough SG": 0.0,
      
      // Course Management [0.12, 0.08, 0.08, 0.10, 0.10, 0.15, 0.20, 0.12, 0.05]
      "Scrambling": 0.12,
      "Great Shots": 0.08,
      "Poor Shots": 0.08,
      "Approach <100 Prox": 0.10,
      "Approach <150 FW Prox": 0.10,
      "Approach <150 Rough Prox": 0.15,
      "Approach >150 Rough Prox": 0.20,
      "Approach <200 FW Prox": 0.12,
      "Approach >200 FW Prox": 0.05
    },
    TECHNICAL: {
      // Driving Performance [0.086, 0.354, 0.560]
      "Driving Distance": 0.086,
      "Driving Accuracy": 0.354,
      "SG OTT": 0.560,
      
      // Approach <100 [0.09, 0.32, 0.59]
      "Approach <100 GIR": 0.09,
      "Approach <100 SG": 0.32,
      "Approach <100 Prox": 0.59,
      
      // Approach 100-150 [0.09, 0.29, 0.62]
      "Approach <150 FW GIR": 0.09,
      "Approach <150 FW SG": 0.29,
      "Approach <150 FW Prox": 0.62,
      "Approach <150 Rough GIR": 0.0,
      "Approach <150 Rough SG": 0.0,
      "Approach <150 Rough Prox": 0.0,
      
      // Approach 150-200 [0.08, 0.27, 0.65]
      "Approach <200 FW GIR": 0.08,
      "Approach <200 FW SG": 0.27,
      "Approach <200 FW Prox": 0.65,
      "Approach >150 Rough GIR": 0.0,
      "Approach >150 Rough SG": 0.0,
      "Approach >150 Rough Prox": 0.0,
      
      // Approach >200 [0.08, 0.22, 0.70]
      "Approach >200 FW GIR": 0.08,
      "Approach >200 FW SG": 0.22,
      "Approach >200 FW Prox": 0.70,
      "Approach >200 FW Rough GIR": 0.0,
      "Approach >200 FW Rough SG": 0.0,
      "Approach >200 FW Rough Prox": 0.0,
      
      // Putting [1.0]
      "SG Putting": 1.0,
      
      // Around Green [1.0]
      "SG Around Green": 1.0,
      
      // Scoring [0.18, 0.12, 0.10, 0.15, 0.15, 0.15, 0.10, 0.05, 0.00]
      "SG T2G": 0.18,
      "Scoring Average": 0.12,
      "Birdie Chances Created": 0.10,
      "Birdies or Better": 0.15,
      "Greens in Regulation": 0.15,
      "Approach <100 SG": 0.15,
      "Approach <150 FW SG": 0.10,
      "Approach <150 Rough SG": 0.05,
      "Approach >150 Rough SG": 0.0,
      
      // Course Management [0.12, 0.08, 0.08, 0.10, 0.10, 0.15, 0.20, 0.12, 0.05]
      "Scrambling": 0.12,
      "Great Shots": 0.08,
      "Poor Shots": 0.08,
      "Approach <100 Prox": 0.10,
      "Approach <150 FW Prox": 0.10,
      "Approach <150 Rough Prox": 0.15,
      "Approach >150 Rough Prox": 0.20,
      "Approach <200 FW Prox": 0.12,
      "Approach >200 FW Prox": 0.05
    },
    BALANCED: {
      // Driving Performance [0.061, 0.410, 0.529]
      "Driving Distance": 0.061,
      "Driving Accuracy": 0.410,
      "SG OTT": 0.529,
      
      // Approach <100 [0.12, 0.34, 0.54]
      "Approach <100 GIR": 0.12,
      "Approach <100 SG": 0.34,
      "Approach <100 Prox": 0.54,
      
      // Approach 100-150 [0.11, 0.35, 0.54]
      "Approach <150 FW GIR": 0.11,
      "Approach <150 FW SG": 0.35,
      "Approach <150 FW Prox": 0.54,
      "Approach <150 Rough GIR": 0.0,
      "Approach <150 Rough SG": 0.0,
      "Approach <150 Rough Prox": 0.0,
      
      // Approach 150-200 [0.10, 0.32, 0.58]
      "Approach <200 FW GIR": 0.10,
      "Approach <200 FW SG": 0.32,
      "Approach <200 FW Prox": 0.58,
      "Approach >150 Rough GIR": 0.0,
      "Approach >150 Rough SG": 0.0,
      "Approach >150 Rough Prox": 0.0,
      
      // Approach >200 [0.09, 0.27, 0.64]
      "Approach >200 FW GIR": 0.09,
      "Approach >200 FW SG": 0.27,
      "Approach >200 FW Prox": 0.64,
      "Approach >200 FW Rough GIR": 0.0,
      "Approach >200 FW Rough SG": 0.0,
      "Approach >200 FW Rough Prox": 0.0,
      
      // Putting [1.0]
      "SG Putting": 1.0,
      
      // Around Green [1.0]
      "SG Around Green": 1.0,
      
      // Scoring [0.19, 0.11, 0.10, 0.15, 0.15, 0.15, 0.10, 0.05, 0.00]
      "SG T2G": 0.19,
      "Scoring Average": 0.11,
      "Birdie Chances Created": 0.10,
      "Birdies or Better": 0.15,
      "Greens in Regulation": 0.15,
      "Approach <100 SG": 0.15,
      "Approach <150 FW SG": 0.10,
      "Approach <150 Rough SG": 0.05,
      "Approach >150 Rough SG": 0.0,
      
      // Course Management [0.12, 0.08, 0.08, 0.10, 0.10, 0.15, 0.20, 0.12, 0.05]
      "Scrambling": 0.12,
      "Great Shots": 0.08,
      "Poor Shots": 0.08,
      "Approach <100 Prox": 0.10,
      "Approach <150 FW Prox": 0.10,
      "Approach <150 Rough Prox": 0.15,
      "Approach >150 Rough Prox": 0.20,
      "Approach <200 FW Prox": 0.12,
      "Approach >200 FW Prox": 0.05
    }
  };
  
  // Return the individual metric weight for the given course type and metric
  return METRIC_TEMPLATES[courseType]?.[metricName] || 0;
}

/**
 * Read metric weights from a tournament's Configuration Sheet
 * Each tournament workbook has its own unique weights
 */
function getTournamentConfigurationWeights(tournamentWorkbook) {
  try {
    if (!tournamentWorkbook) {
      console.log("⚠️ No tournament workbook provided");
      return {};
    }
    
    const configSheet = tournamentWorkbook.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      console.log("⚠️ Configuration Sheet not found in tournament workbook");
      return {};
    }
    
    // Read individual metric weights from columns G-O (loaded by template)
    const metricWeights = {};
    
    // Driving Performance (Row 16, Columns G-I)
    metricWeights["Driving Distance"] = configSheet.getRange("G16").getValue() || 0;
    metricWeights["Driving Accuracy"] = configSheet.getRange("H16").getValue() || 0;
    metricWeights["SG OTT"] = configSheet.getRange("I16").getValue() || 0;
    
    // Approach - Short (<100) (Row 17, Columns G-I)
    metricWeights["Approach <100 GIR"] = configSheet.getRange("G17").getValue() || 0;
    metricWeights["Approach <100 SG"] = configSheet.getRange("H17").getValue() || 0;
    metricWeights["Approach <100 Prox"] = configSheet.getRange("I17").getValue() || 0;
    
    // Approach - Mid (<150 FW) (Row 18, Columns G-I)
    metricWeights["Approach <150 FW GIR"] = configSheet.getRange("G18").getValue() || 0;
    metricWeights["Approach <150 FW SG"] = configSheet.getRange("H18").getValue() || 0;
    metricWeights["Approach <150 FW Prox"] = configSheet.getRange("I18").getValue() || 0;
    
    // Approach - Long (150-200 FW) (Row 19, Columns G-I)
    metricWeights["Approach <200 FW GIR"] = configSheet.getRange("G19").getValue() || 0;
    metricWeights["Approach <200 FW SG"] = configSheet.getRange("H19").getValue() || 0;
    metricWeights["Approach <200 FW Prox"] = configSheet.getRange("I19").getValue() || 0;
    
    // Approach - Very Long (>200 FW) (Row 20, Columns G-I)
    metricWeights["Approach >200 FW GIR"] = configSheet.getRange("G20").getValue() || 0;
    metricWeights["Approach >200 FW SG"] = configSheet.getRange("H20").getValue() || 0;
    metricWeights["Approach >200 FW Prox"] = configSheet.getRange("I20").getValue() || 0;
    
    // Putting (Row 21, Column G)
    metricWeights["SG Putting"] = configSheet.getRange("G21").getValue() || 0;

    // Around the Green (Row 22, Columnn G)
    metricWeights["SG Around Green"] = configSheet.getRange("G22").getValue() || 0;

    // Scoring (Row 23, Column G-O) - Context-based SG metrics
    metricWeights["SG T2G"] = configSheet.getRange("G23").getValue() || 0;
    metricWeights["Scoring Average"] = configSheet.getRange("H23").getValue() || 0;
    metricWeights["Birdie Chances Created"] = configSheet.getRange("I23").getValue() || 0;
    metricWeights["Scoring - Approach <100 SG"] = configSheet.getRange("J23").getValue() || 0;
    metricWeights["Scoring - Approach <150 FW SG"] = configSheet.getRange("K23").getValue() || 0;
    metricWeights["Scoring - Approach <150 Rough SG"] = configSheet.getRange("L23").getValue() || 0;
    metricWeights["Scoring - Approach >150 Rough SG"] = configSheet.getRange("M23").getValue() || 0;
    metricWeights["Scoring - Approach <200 FW SG"] = configSheet.getRange("N23").getValue() || 0;
    metricWeights["Scoring - Approach >200 FW SG"] = configSheet.getRange("O23").getValue() || 0;

    // Course Management (Row 24, Columns G-O) - Context-based Prox metrics
    metricWeights["Scrambling"] = configSheet.getRange("G24").getValue() || 0;
    metricWeights["Great Shots"] = configSheet.getRange("H24").getValue() || 0;
    metricWeights["Poor Shot Avoidance"] = configSheet.getRange("I24").getValue() || 0;
    metricWeights["Course Management - Approach <100 Prox"] = configSheet.getRange("J24").getValue() || 0;
    metricWeights["Course Management - Approach <150 FW Prox"] = configSheet.getRange("K24").getValue() || 0;
    metricWeights["Course Management - Approach <150 Rough Prox"] = configSheet.getRange("L24").getValue() || 0;
    metricWeights["Course Management - Approach >150 Rough Prox"] = configSheet.getRange("M24").getValue() || 0;
    metricWeights["Course Management - Approach <200 FW Prox"] = configSheet.getRange("N24").getValue() || 0;
    metricWeights["Course Management - Approach >200 FW Prox"] = configSheet.getRange("O24").getValue() || 0;
    
    console.log(`Config weights loaded: ${Object.keys(metricWeights).length} metrics`);
    return metricWeights;
  } catch (e) {
    console.log(`Error reading tournament config weights: ${e.message}`);
    return {};
  }
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
/**
 * Get list of already-processed tournaments from processing log sheet
 */
function getProcessedTournaments(masterSs) {
  let logSheet = masterSs.getSheetByName("_Processing_Log");
  if (!logSheet) {
    return [];
  }
  
  const data = logSheet.getRange("A2:A1000").getValues();
  const processed = [];
  data.forEach(row => {
    if (row[0]) {
      processed.push(row[0].toString().trim());
    }
  });
  return processed;
}

/**
 * Update processing log with newly processed tournaments
 */
function updateProcessedTournaments(masterSs, newTournaments) {
  let logSheet = masterSs.getSheetByName("_Processing_Log");
  
  // Create log sheet if it doesn't exist
  if (!logSheet) {
    logSheet = masterSs.insertSheet("_Processing_Log");
    logSheet.appendRow(["Tournament Name", "Processed Date", "Status"]);
    logSheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#E0E0E0");
  }
  
  // Add new tournaments to log
  const now = new Date();
  newTournaments.forEach(tournamentName => {
    logSheet.appendRow([
      tournamentName,
      now.toLocaleString(),
      "Processed"
    ]);
  });
  
  logSheet.autoResizeColumns(1, 3);
}

/**
 * Get all metrics grouped by their category
 * Used for calculating recommended weights based on correlation strength
 */
function getMetricGroupings() {
  return {
    "Driving Performance": [
      "Driving Distance", "Driving Accuracy", "SG OTT"
    ],
    "Approach - Short (<100)": [
      "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox"
    ],
    "Approach - Mid (100-150)": [
      "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox",
      "Approach <150 Rough GIR", "Approach <150 Rough SG", "Approach <150 Rough Prox"
    ],
    "Approach - Long (150-200)": [
      "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox",
      "Approach >150 Rough GIR", "Approach >150 Rough SG", "Approach >150 Rough Prox"
    ],
    "Approach - Very Long (>200)": [
      "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox",
      "Approach >200 FW Rough GIR", "Approach >200 FW Rough SG", "Approach >200 FW Rough Prox"
    ],
    "Putting": [
      "SG Putting"
    ],
    "Around the Green": [
      "SG Around Green"
    ],
    "Scoring": [
      "SG T2G", "Scoring Average", "Birdie Chances Created",
      "Birdies or Better", "Greens in Regulation"
    ],
    "Course Management": [
      "Scrambling", "Great Shots", "Poor Shots"
    ]
  };
}

/**
 * Get the group name for a specific metric
 */
function getMetricGroup(metricName) {
  const groupings = getMetricGroupings();
  for (const [groupName, metrics] of Object.entries(groupings)) {
    if (metrics.includes(metricName)) {
      return groupName;
    }
  }
  return null;
}

/**
 * Get group weights for a specific course type
 */
function getGroupWeights(courseType) {
  const COURSE_TYPE_GROUP_WEIGHTS = {
    POWER: {
      "Driving Performance": 0.130,
      "Approach - Short (<100)": 0.145,
      "Approach - Mid (100-150)": 0.180,
      "Approach - Long (150-200)": 0.150,
      "Approach - Very Long (>200)": 0.030,
      "Putting": 0.120,
      "Around the Green": 0.080,
      "Scoring": 0.110,
      "Course Management": 0.055
    },
    TECHNICAL: {
      "Driving Performance": 0.065,
      "Approach - Short (<100)": 0.148,
      "Approach - Mid (100-150)": 0.185,
      "Approach - Long (150-200)": 0.167,
      "Approach - Very Long (>200)": 0.037,
      "Putting": 0.107,
      "Around the Green": 0.125,
      "Scoring": 0.097,
      "Course Management": 0.069
    },
    BALANCED: {
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
  };
  
  return COURSE_TYPE_GROUP_WEIGHTS[courseType] || COURSE_TYPE_GROUP_WEIGHTS.BALANCED;
}