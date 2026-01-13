/**
 * Course Type Classification and Template Weighting
 * Groups tournaments by metric correlation signatures
 * Derives template weights from actual metric effectiveness by course type
 */

function classifyTournamentsByCourseType() {
  try {
    const ui = SpreadsheetApp.getUi();
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();
    
    // Calculate correlations for all tournaments
    console.log("🏌️ Starting tournament classification...");
    const correlationData = calculateAllTournamentCorrelations();
    
    if (!correlationData || correlationData.tournaments.length === 0) {
      ui.alert("❌ No correlation data found.\n\nMake sure you have tournament workbooks in the 'Golf 2025' folder with 'Tournament Results' sheets.");
      return;
    }

    console.log(`\n✅ Found ${correlationData.tournaments.length} tournaments with correlation data`);

    // Classify tournaments by their correlation signatures
    const classified = classifyTournaments(correlationData.tournaments);
    
    console.log(`\nClassification results:`);
    console.log(`  POWER: ${classified.POWER.length} tournaments`);
    console.log(`  TECHNICAL: ${classified.TECHNICAL.length} tournaments`);
    console.log(`  BALANCED: ${classified.BALANCED.length} tournaments`);
    
    // Calculate average metrics per course type
    const templateMetrics = deriveTemplateMetrics(classified);
    
    // Write results to sheets
    writeClassificationResults(masterSs, classified, templateMetrics);
    
    ui.alert(`✅ Classification Complete!\n\nTournaments classified:\n  POWER: ${classified.POWER.length}\n  TECHNICAL: ${classified.TECHNICAL.length}\n  BALANCED: ${classified.BALANCED.length}\n\nTemplate weights ready in "Template Metrics by Type" sheet.`);
    
  } catch (e) {
    console.error("Error:", e);
    SpreadsheetApp.getUi().alert("❌ Error: " + e.message);
  }
}

/**
 * Calculate correlations for ALL tournaments independently
 * Finds Golf 2025 folder and processes all spreadsheets with Tournament Results sheets
 */
function calculateAllTournamentCorrelations() {
  const tournaments = [];
  let processedCount = 0;
  
  try {
    console.log("🏌️ Searching for tournament workbooks...");
    
    let foundFiles = [];
    let golfFolder = null;
    
    // Try to find Golf 2025 folder
    console.log("\n📂 Looking for 'Golf 2025' folder...");
    try {
      const folders = DriveApp.getFoldersByName("Golf 2025");
      
      let folderCount = 0;
      while (folders.hasNext()) {
        if (folderCount === 0) {
          golfFolder = folders.next();
          folderCount++;
        }
      }
      
      if (!golfFolder) {
        console.log("❌ 'Golf 2025' folder not found");
        console.log("Available folders in My Drive:");
        const rootFolders = DriveApp.getRootFolder().getFolders();
        let rootCount = 0;
        while (rootFolders.hasNext() && rootCount < 10) {
          console.log(`   - ${rootFolders.next().getName()}`);
          rootCount++;
        }
        return { tournaments: [] };
      }
      
      console.log("✅ Found 'Golf 2025' folder");
      console.log(`   Folder ID: ${golfFolder.getId()}`);
      
    } catch (folderError) {
      console.log(`❌ Error finding folder: ${folderError.message}`);
      return { tournaments: [] };
    }
    
    // Get ALL spreadsheets in the folder
    console.log("\n📋 Searching for spreadsheets in folder...");
    try {
      const files = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
      let fileCount = 0;
      while (files.hasNext()) {
        const file = files.next();
        foundFiles.push(file);
        fileCount++;
        console.log(`   ✓ Found: ${file.getName()}`);
      }
      console.log(`\n📋 Total: ${fileCount} spreadsheet(s) found`);
      
    } catch (filesError) {
      console.log(`❌ Error reading files from folder: ${filesError.message}`);
      return { tournaments: [] };
    }
    
    if (foundFiles.length === 0) {
      console.log("⚠️  No spreadsheets found in Golf 2025 folder");
      console.log("Check that:");
      console.log("   1. The folder contains spreadsheet files");
      console.log("   2. You have permission to access them");
      return { tournaments: [] };
    }
    
    console.log(`\n🏌️ Processing ${foundFiles.length} file(s)...`);
    
    for (const file of foundFiles) {
      const fileName = file.getName();
      
      try {
        console.log(`\n📄 ${fileName}`);
        let ss;
        
        try {
          ss = SpreadsheetApp.open(file);
        } catch (openError) {
          console.log(`   ❌ Cannot open file: ${openError.message}`);
          continue;
        }
        
        // List all sheets in this file
        const allSheets = ss.getSheets();
        const sheetNames = allSheets.map(s => s.getName());
        console.log(`   Sheets available: ${sheetNames.join(", ")}`);
        
        let tournamentResultsSheet = null;
        try {
          tournamentResultsSheet = ss.getSheetByName("Tournament Results");
        } catch (sheetError) {
          console.log(`   ⏭️  Cannot access sheets: ${sheetError.message}`);
          continue;
        }
        
        if (!tournamentResultsSheet) {
          console.log(`   ⏭️  No 'Tournament Results' sheet`);
          continue;
        }
        
        console.log(`   ✅ Found Tournament Results sheet`);
        
        // Get all data
        const data = tournamentResultsSheet.getDataRange().getValues();
        if (data.length < 2) {
          console.log(`   ⏭️  Not enough data rows`);
          continue;
        }
        
        console.log(`   📊 Data: ${data.length} rows, ${data[0].length} columns`);
        
        // Find the header row - look for "POSITION" column in first 10 rows
        let headerRowIndex = -1;
        let positionIndex = -1;
        
        for (let rowIdx = 0; rowIdx < Math.min(10, data.length); rowIdx++) {
          const row = data[rowIdx];
          
          // Look for POSITION column in this row
          for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const cellStr = row[colIdx].toString().toUpperCase().trim();
            if (cellStr === "POSITION" || cellStr.includes("POSITION")) {
              headerRowIndex = rowIdx;
              positionIndex = colIdx;
              console.log(`   ✓ Found headers at row ${rowIdx + 1}, POSITION at column ${colIdx + 1}`);
              break;
            }
          }
          
          if (headerRowIndex !== -1) break;
        }
        
        if (headerRowIndex === -1) {
          console.log(`   ⏭️  No POSITION column found in first 10 rows`);
          continue;
        }
        
        // Extract headers and data rows
        const headers = data[headerRowIndex];
        const rows = data.slice(headerRowIndex + 1);
        
        console.log(`   ✓ Position column at index ${positionIndex}`);
        
        // Extract position values - handle "T3", "CUT", "WD", etc.
        const positionPairs = [];
        for (let i = 0; i < rows.length; i++) {
          const posStr = rows[i][positionIndex];
          
          if (!posStr || posStr === "") continue;
          
          const posStrTrim = posStr.toString().trim().toUpperCase();
          
          // Skip non-finishers
          if (posStrTrim.includes("CUT") || posStrTrim.includes("WD")) continue;
          
          // Extract numeric position (handles "T3", "3", "T30", etc.)
          const match = posStrTrim.match(/\d+/);
          if (match) {
            const posNum = parseInt(match[0]);
            if (!isNaN(posNum) && posNum > 0) {
              positionPairs.push({
                rowIndex: i,
                position: posNum,
                original: posStr
              });
            }
          }
        }
        
        console.log(`   ✓ Found ${positionPairs.length} valid finishers (excluded CUT/WD)`);
        
        if (positionPairs.length < 3) {
          console.log(`   ⏭️  Not enough valid finishers to calculate correlations`);
          continue;
        }
        
        // Calculate correlations for each metric
        const correlations = {};
        const columnsSkip = ["player name", "dg id", "position", "id", "name", "finish position", ""];
        let metricCount = 0;
        let correlationsCalculated = 0;
        
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const headerName = headers[colIdx].toString().trim().toLowerCase();
          
          // Skip non-metric columns
          if (columnsSkip.includes(headerName)) continue;
          
          metricCount++;
          
          // Build pairs of (metric value, position) using only valid finishers
          const pairs = [];
          
          for (const posPair of positionPairs) {
            const rowIdx = posPair.rowIndex;
            if (rowIdx >= rows.length) continue; // Safety check
            
            const row = rows[rowIdx];
            if (!row) continue; // Skip if row doesn't exist
            
            const metricVal = row[colIdx];
            
            // Only include if metric is a valid number
            if (metricVal !== null && metricVal !== undefined && metricVal !== "") {
              const metricNum = parseFloat(metricVal);
              
              if (!isNaN(metricNum)) {
                pairs.push({
                  value: metricNum,
                  position: posPair.position
                });
              }
            }
          }
          
          // Only calculate correlation if we have enough data
          if (pairs.length < 3) continue;
          
          // Calculate Pearson correlation
          const correlation = calculatePearsonCorrelationTournaments(pairs);
          
          if (correlation && !isNaN(correlation) && correlation > 0) {
            const originalHeader = headers[colIdx].toString().trim();
            correlations[originalHeader] = correlation;
            correlationsCalculated++;
            
            if (correlation > 0.3) {
              console.log(`      ✓ ${originalHeader}: ${correlation.toFixed(3)}`);
            }
          }
        }
        
        console.log(`   📊 Analyzed ${metricCount} metrics, calculated ${correlationsCalculated} correlations`);
        
        if (Object.keys(correlations).length === 0) {
          console.log(`   ⏭️  No correlations could be calculated for this tournament`);
          continue;
        }
        
        // Successfully processed - add to tournaments
        tournaments.push({
          name: fileName,
          correlations: correlations
        });
        processedCount++;
        
      } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
        console.log(`   Stack: ${e.stack}`);
      }
    }
    
    console.log(`\n✅ Successfully processed ${processedCount} tournaments out of ${foundFiles.length}`);
    
    return { 
      tournaments: tournaments,
      totalProcessed: processedCount
    };
    
  } catch (e) {
    console.error("Error in calculateAllTournamentCorrelations:", e);
    return { tournaments: [] };
  }
}

/**
 * Calculate Pearson correlation coefficient for tournaments
 */
function calculatePearsonCorrelationTournaments(pairs) {
  if (!pairs || !Array.isArray(pairs) || pairs.length < 2) {
    return 0;
  }
  
  try {
    const n = pairs.length;
    
    // Extract positions and values, filtering out any undefined
    const positions = [];
    const values = [];
    
    for (const pair of pairs) {
      if (pair && typeof pair.position === 'number' && typeof pair.value === 'number') {
        positions.push(pair.position);
        values.push(pair.value);
      }
    }
    
    if (positions.length < 2 || values.length < 2) {
      return 0;
    }
    
    const meanPos = positions.reduce((a, b) => a + b, 0) / positions.length;
    const meanVal = values.reduce((a, b) => a + b, 0) / values.length;
    
    let numerator = 0;
    let denomPos = 0;
    let denomVal = 0;
    
    for (let i = 0; i < positions.length; i++) {
      const dPos = positions[i] - meanPos;
      const dVal = values[i] - meanVal;
      numerator += dPos * dVal;
      denomPos += dPos * dPos;
      denomVal += dVal * dVal;
    }
    
    const denominator = Math.sqrt(denomPos * denomVal);
    return denominator === 0 ? 0 : Math.abs(numerator / denominator);
    
  } catch (e) {
    console.log(`   ⚠️  Error calculating correlation: ${e.message}`);
    return 0;
  }
}

/**
 * Classify tournaments based on metric correlation variance
 * Identifies discriminating metrics (high variance across tournaments)
 * Clusters tournaments by their correlation patterns on those metrics
 * No assumptions - purely data-driven
 */
function classifyTournaments(tournaments) {
  if (tournaments.length === 0) return { POWER: [], TECHNICAL: [], BALANCED: [] };
  
  // Step 1: Identify all metrics and their variance across tournaments
  const allMetrics = new Set();
  tournaments.forEach(t => {
    Object.keys(t.correlations).forEach(m => allMetrics.add(m));
  });
  
  const metricVariance = {};
  const metricStats = {};
  
  allMetrics.forEach(metric => {
    const values = tournaments
      .map(t => t.correlations[metric] || 0)
      .filter(v => v > 0);
    
    if (values.length > 0) {
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      metricVariance[metric] = stdDev;
      metricStats[metric] = {
        mean: mean,
        stdDev: stdDev,
        min: Math.min(...values),
        max: Math.max(...values),
        range: Math.max(...values) - Math.min(...values)
      };
    }
  });
  
  // Step 2: Identify discriminating metrics (high variance/range)
  const sortedMetrics = Object.entries(metricVariance)
    .sort((a, b) => b[1] - a[1]); // Sort by variance descending
  
  const discriminatingMetrics = sortedMetrics
    .slice(0, 6) // Top 6 most variable metrics
    .map(entry => entry[0]);
  
  console.log("Discriminating metrics:", discriminatingMetrics.join(", "));
  console.log("Metric statistics:", metricStats);
  
  // Step 3: Use k-means style clustering on discriminating metrics
  const clusters = clusterTournaments(tournaments, discriminatingMetrics, 3);
  
  // Step 4: Assign labels based on the cluster characteristics
  const classified = labelClusters(clusters, discriminatingMetrics, metricStats);
  
  return classified;
}

/**
 * K-means clustering of tournaments based on metric correlations
 */
function clusterTournaments(tournaments, metrics, k) {
  if (tournaments.length <= k) {
    const clusters = [];
    tournaments.forEach(t => clusters.push([t]));
    return clusters;
  }
  
  // Convert tournaments to vectors using discriminating metrics
  const vectors = tournaments.map(t => 
    metrics.map(m => t.correlations[m] || 0)
  );
  
  // Initialize centroids randomly
  let centroids = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(Math.random() * vectors.length);
    centroids.push([...vectors[idx]]);
  }
  
  // K-means iterations
  let assignments = [];
  for (let iter = 0; iter < 10; iter++) {
    // Assign points to nearest centroid
    assignments = vectors.map(v => {
      let minDist = Infinity;
      let cluster = 0;
      
      for (let i = 0; i < centroids.length; i++) {
        const dist = calculateEuclideanDistance(v, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          cluster = i;
        }
      }
      
      return cluster;
    });
    
    // Recalculate centroids
    const newCentroids = [];
    for (let i = 0; i < k; i++) {
      const points = vectors.filter((_, idx) => assignments[idx] === i);
      if (points.length > 0) {
        const centroid = [];
        for (let j = 0; j < metrics.length; j++) {
          const avg = points.reduce((sum, p) => sum + p[j], 0) / points.length;
          centroid.push(avg);
        }
        newCentroids.push(centroid);
      } else {
        newCentroids.push([...centroids[i]]);
      }
    }
    centroids = newCentroids;
  }
  
  // Build clusters
  const clusters = [];
  for (let i = 0; i < k; i++) {
    clusters.push([]);
  }
  
  tournaments.forEach((t, idx) => {
    clusters[assignments[idx]].push(t);
  });
  
  return clusters.filter(c => c.length > 0);
}

/**
 * Calculate Euclidean distance between two vectors
 */
function calculateEuclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    sum += Math.pow(v1[i] - v2[i], 2);
  }
  return Math.sqrt(sum);
}

/**
 * Label clusters as POWER, TECHNICAL, BALANCED based on their characteristics
 */
function labelClusters(clusters, discriminatingMetrics, metricStats) {
  const clusterProfiles = clusters.map(cluster => {
    const profile = {};
    
    // Calculate average metrics for this cluster
    discriminatingMetrics.forEach(metric => {
      const values = cluster.map(t => t.correlations[metric] || 0).filter(v => v > 0);
      profile[metric] = values.length > 0 ? values.reduce((a, b) => a + b) / values.length : 0;
    });
    
    return { cluster, profile };
  });
  
  // Score clusters - look for patterns
  const scored = clusterProfiles.map((cp, idx) => {
    let powerScore = 0;
    let technicalScore = 0;
    
    // Simple heuristic: which metrics are strongest in this cluster
    for (const [metric, value] of Object.entries(cp.profile)) {
      if (metric.toLowerCase().includes("distance") || 
          metric.toLowerCase().includes("carry") ||
          metric.toLowerCase().includes("proximity")) {
        powerScore += value;
      } else if (metric.toLowerCase().includes("sg") ||
                 metric.toLowerCase().includes("strokes gained")) {
        technicalScore += value;
      }
    }
    
    return { idx, powerScore, technicalScore, cluster: cp.cluster };
  });
  
  // Sort by score
  scored.sort((a, b) => b.powerScore - a.powerScore);
  
  const result = { POWER: [], TECHNICAL: [], BALANCED: [] };
  
  if (scored.length > 0) {
    result.POWER = scored[0].cluster;
  }
  if (scored.length > 1) {
    result.TECHNICAL = scored[scored.length - 1].cluster;
  }
  if (scored.length > 2) {
    result.BALANCED = scored[1].cluster;
  }
  
  return result;
}

/**
 * Calculate template metrics (average correlations by course type)
 */
function deriveTemplateMetrics(classified) {
  const templates = {};
  
  for (const [courseType, tournaments] of Object.entries(classified)) {
    if (tournaments.length === 0) continue;
    
    const metricAverages = {};
    const allMetrics = new Set();
    
    // Collect all metrics
    tournaments.forEach(t => {
      Object.keys(t.correlations).forEach(m => allMetrics.add(m));
    });
    
    // Calculate averages
    allMetrics.forEach(metric => {
      const values = tournaments
        .map(t => t.correlations[metric] || 0)
        .filter(v => v > 0);
      
      if (values.length > 0) {
        metricAverages[metric] = values.reduce((a, b) => a + b) / values.length;
      }
    });
    
    templates[courseType] = metricAverages;
  }
  
  return templates;
}

/**
 * Write classification results to output sheets
 */
function writeClassificationResults(ss, classified, templateMetrics) {
  // Sheet 1: Course Type Classification
  const classificationSheet = ss.getSheetByName("Course Type Classification") || 
                             ss.insertSheet("Course Type Classification");
  classificationSheet.clear();
  
  const classData = [["Course Type", "Tournament Name", "Correlation Count"]];
  for (const [courseType, tournaments] of Object.entries(classified)) {
    tournaments.forEach(t => {
      classData.push([
        courseType,
        t.name,
        Object.keys(t.correlations).length
      ]);
    });
  }
  
  classificationSheet.getRange(1, 1, classData.length, 3).setValues(classData);
  const headerRange = classificationSheet.getRange(1, 1, 1, 3);
  headerRange.setBackground("#4285F4").setFontColor("white").setFontWeight("bold");
  
  // Sheet 2: Template Metrics by Type
  const metricsSheet = ss.getSheetByName("Template Metrics by Type") || 
                      ss.insertSheet("Template Metrics by Type");
  metricsSheet.clear();
  
  const metricsData = [["Metric", "POWER", "TECHNICAL", "BALANCED"]];
  const allMetrics = new Set();
  
  Object.values(templateMetrics).forEach(metrics => {
    Object.keys(metrics).forEach(m => allMetrics.add(m));
  });
  
  allMetrics.forEach(metric => {
    metricsData.push([
      metric,
      templateMetrics.POWER?.[metric] || 0,
      templateMetrics.TECHNICAL?.[metric] || 0,
      templateMetrics.BALANCED?.[metric] || 0
    ]);
  });
  
  metricsSheet.getRange(1, 1, metricsData.length, 4).setValues(metricsData);
  
  // Format
  const headerRange2 = metricsSheet.getRange(1, 1, 1, 4);
  headerRange2.setBackground("#4285F4").setFontColor("white").setFontWeight("bold");
  
  metricsSheet.setColumnWidth(1, 250);
  metricsSheet.setColumnWidths(2, 3, 120);
  
  console.log("✅ Classification results written to sheets");
}
