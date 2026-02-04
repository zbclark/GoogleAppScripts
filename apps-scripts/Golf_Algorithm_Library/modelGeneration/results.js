// Ported to test
const METRIC_MAX_VALUES = {
  'Approach <100 Prox': 40,         // Avg: 16ft from <100y
  'Approach <150 FW Prox': 50,      // Avg: 23.6 ft from 125y
  'Approach <150 Rough Prox': 60,   // Avg: 37.9 ft from 
  'Approach >150 Rough Prox': 75,   // Avg: 50 ft      
  'Approach <200 FW Prox': 65,      // Avg: 35ft from 175y
  'Approach >200 FW Prox': 90,      // Avg: 45ft from 210y
  'Fairway Proximity': 60,          // Avg general fairway proximity
  'Rough Proximity': 80,            // Avg: general rough proximity
  'Poor Shots': 12,                 // 12 poor shots/round = terrible performance
  'Scoring Average': 74,            // Refine based on PGA Average
  'Birdie Chances Created': 10      // Composit metric, max value estimate
};

// Ported to test
const METRIC_TYPES = {
  LOWER_BETTER: new Set([
    'Poor Shots', 
    'Scoring Average',
    'Fairway Proximity',
    'Rough Proximity',
    'Approach <100 Prox',
    'Approach <150 FW Prox',
    'Approach <150 Rough Prox',
    'Approach >150 Rough Prox',
    'Approach <200 FW Prox',
    'Approach >200 FW Prox']),
  SCORING_AVG: new Set(['Scoring Average']),
  PERCENTAGE: new Set(['Driving Accuracy', 'GIR', 'Scrambling']),
  COUNT: new Set(['Great Shots', 'Birdies or Better']),
  COMPOSITE: new Set(['Birdie Chances Created'])
};

function generatePlayerRankings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Configuration Sheet");
  const outputSheet = ss.getSheetByName("Player Ranking Model") || ss.insertSheet("Player Ranking Model");

  // ===== DEBUG LOG CAPTURE =====
  const debugLogSheetName = "Debug Execution Log";
  let debugLogSheet = ss.getSheetByName(debugLogSheetName);
  if (!debugLogSheet) {
    debugLogSheet = ss.insertSheet(debugLogSheetName);
  }
  debugLogSheet.clearContents();
  debugLogSheet.getRange(1, 1, 1, 2).setValues([["Time", "Message"]]).setFontWeight("bold");

  const logs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const logToBuffer = (level, args) => {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    logs.push([new Date().toLocaleTimeString(), `[${level}] ${msg}`]);
  };

  console.log = function(...args) {
    logToBuffer('LOG', args);
    originalLog(...args);
  };
  console.warn = function(...args) {
    logToBuffer('WARN', args);
    originalWarn(...args);
  };
  console.error = function(...args) {
    logToBuffer('ERROR', args);
    originalError(...args);
  };

  // Ensure at least one entry so the sheet is never blank
  logs.push([new Date().toLocaleTimeString(), '[LOG] Debug log capture initialized']);

  const flushLogs = () => {
    if (logs.length === 0) {
      logs.push([new Date().toLocaleTimeString(), '[WARN] No console logs captured']);
    }

    const requiredRows = logs.length + 1; // +1 for header row
    if (debugLogSheet.getMaxRows() < requiredRows) {
      debugLogSheet.insertRowsAfter(debugLogSheet.getMaxRows(), requiredRows - debugLogSheet.getMaxRows());
    }

    debugLogSheet.getRange(2, 1, logs.length, 2).setValues(logs);
    debugLogSheet.setColumnWidths(1, 1, 100);
    debugLogSheet.setColumnWidth(2, 800);
    SpreadsheetApp.flush();
  };

  try {
    logs.push([new Date().toLocaleTimeString(), '[LOG] Starting generatePlayerRankings']);
    // Clear previous output
    outputSheet.clearContents().clearFormats();

    // 1. Get Configuration Values
    const metricConfig = getMetricGroups(configSheet);
    const metricGroups = metricConfig.groups;
    const pastPerformance = metricConfig.pastPerformance;

    // Add this validation after getting metricConfig:
    if (!metricConfig.pastPerformance.currentEventId) {
      throw new Error("Event ID not found in G10");
    }

    const metricLabels = [
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

  // 2. Aggregate Player Data - FIXED INITIALIZATION
  const players = aggregatePlayerData(metricGroups); // Properly declared with const
  
  // 3. Calculate Metrics and Apply Weights
  const rankedPlayers = calculatePlayerMetrics(players, {
    groups: metricGroups,
    pastPerformance: pastPerformance
  });

  const processedData = rankedPlayers.players;
  const groupStats = rankedPlayers.groupStats || {};

  // ===== DEBUG SNAPSHOT (EXPLICIT, NOT VIA console.log) =====
  const snapshotTime = () => new Date().toLocaleTimeString();
  const targetName = "Scheffler, Scottie";
  const targetPlayer = processedData.find(p => p && p.name === targetName);

  logs.push([snapshotTime(), `[SNAPSHOT] Players processed: ${processedData.length}`]);
  logs.push([snapshotTime(), `[SNAPSHOT] Target player found: ${targetPlayer ? 'YES' : 'NO'}`]);

  if (targetPlayer) {
    logs.push([snapshotTime(), `[SNAPSHOT] ${targetPlayer.name} DG ID: ${targetPlayer.dgId}`]);
    
    // Log round categorization details for Scheffler
    const targetData = players[targetPlayer.dgId];
    if (targetData) {
      logs.push([snapshotTime(), `[SNAPSHOT] Round Categorization:`]);
      logs.push([snapshotTime(), `[SNAPSHOT]   Putting rounds: ${targetData.puttingRounds.length}`]);
      logs.push([snapshotTime(), `[SNAPSHOT]   Historical rounds: ${targetData.historicalRounds.length}`]);
      logs.push([snapshotTime(), `[SNAPSHOT]   Similar rounds: ${targetData.similarRounds.length}`]);
      
      // Log individual putting rounds if any
      if (targetData.puttingRounds.length > 0) {
        targetData.puttingRounds.forEach((r, i) => {
          logs.push([snapshotTime(), `[SNAPSHOT]     Putting Round ${i}: event=${r.eventId}, sg_putt=${r.metrics?.strokesGainedPutt}, roundNum=${r.roundNum}`]);
        });
      }
      
      // Log individual historical rounds with sg_putt values
      if (targetData.historicalRounds.length > 0) {
        logs.push([snapshotTime(), `[SNAPSHOT]   Historical sg_putt values:`]);
        targetData.historicalRounds.forEach((r, i) => {
          logs.push([snapshotTime(), `[SNAPSHOT]     Historical Round ${i}: event=${r.eventId}, sg_putt=${r.metrics?.strokesGainedPutt}, roundNum=${r.roundNum}`]);
        });
        
        // Calculate what the weighted average SHOULD be
        const sgPuttValues = targetData.historicalRounds
          .map(r => r.metrics?.strokesGainedPutt)
          .filter(v => typeof v === 'number' && !isNaN(v));
        
        if (sgPuttValues.length > 0) {
          // Calculate weighted average with lambda=0.2
          let sumWeighted = 0;
          let sumWeights = 0;
          sgPuttValues.forEach((value, i) => {
            const weight = Math.exp(-0.2 * i);
            sumWeighted += weight * value;
            sumWeights += weight;
          });
          const weightedAvg = sumWeights > 0 ? sumWeighted / sumWeights : 0;
          logs.push([snapshotTime(), `[SNAPSHOT]   Weighted Average SG Putt (lambda=0.2): ${weightedAvg}`]);
          logs.push([snapshotTime(), `[SNAPSHOT]   Calculation: ${sgPuttValues.map((v, i) => `${v}*exp(-0.2*${i})`).join(' + ')} / sum(weights)`]);
        }
      }
      
      // Log approach metrics raw data
      if (targetData.approachMetrics) {
        logs.push([snapshotTime(), `[SNAPSHOT] Approach Metrics Raw Data:`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   <100 FW GIR: ${targetData.approachMetrics['<100']?.fwGIR}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   <100 SG (per-shot): ${targetData.approachMetrics['<100']?.strokesGained}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   <100 Prox: ${targetData.approachMetrics['<100']?.shotProx}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   <150 FW GIR: ${targetData.approachMetrics['<150']?.fwGIR}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   <150 FW SG (per-shot): ${targetData.approachMetrics['<150']?.fwStrokesGained}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   <150 FW Prox: ${targetData.approachMetrics['<150']?.fwShotProx}`]);
      }
      
      // Log BCC calculation components
      if (Array.isArray(targetPlayer.metrics) && targetPlayer.metrics.length > 14) {
        const bccValue = targetPlayer.metrics[14];
        logs.push([snapshotTime(), `[SNAPSHOT] BCC Calculation Components:`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Driving Accuracy (metric 2): ${targetPlayer.metrics[2]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   SG Putting (metric 7): ${targetPlayer.metrics[7]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach <100 GIR (metric 17): ${targetPlayer.metrics[17]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach <150 FW GIR (metric 20): ${targetPlayer.metrics[20]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach <150 Rough GIR (metric 23): ${targetPlayer.metrics[23]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach >150 Rough GIR (metric 26): ${targetPlayer.metrics[26]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach <200 FW GIR (metric 29): ${targetPlayer.metrics[29]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach >200 FW GIR (metric 32): ${targetPlayer.metrics[32]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach <100 SG (metric 18): ${targetPlayer.metrics[18]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Approach <150 FW SG (metric 21): ${targetPlayer.metrics[21]}`]);
        logs.push([snapshotTime(), `[SNAPSHOT]   Calculated BCC (metric 14): ${bccValue}`]);
      }
    }
    
    logs.push([snapshotTime(), `[SNAPSHOT] WeightedScore: ${targetPlayer.weightedScore}`]);
    logs.push([snapshotTime(), `[SNAPSHOT] RefinedWeightedScore: ${targetPlayer.refinedWeightedScore}`]);
    logs.push([snapshotTime(), `[SNAPSHOT] PastPerfMultiplier: ${targetPlayer.pastPerformanceMultiplier}`]);
    logs.push([snapshotTime(), `[SNAPSHOT] DataCoverage: ${targetPlayer.dataCoverage} | Confidence: ${targetPlayer.confidenceFactor}`]);

    if (targetPlayer.groupScores) {
      Object.entries(targetPlayer.groupScores).forEach(([groupName, score]) => {
        logs.push([snapshotTime(), `[SNAPSHOT] GroupScore ${groupName}: ${score}`]);
      });
    }

    if (Array.isArray(targetPlayer.metrics)) {
      targetPlayer.metrics.forEach((val, idx) => {
        const label = metricLabels[idx] || `Metric ${idx}`;
        logs.push([snapshotTime(), `[SNAPSHOT] Metric ${idx} ${label}: ${val}`]);
      });
    }

    // Putting metric calculation detail (z-score inputs)
    if (Array.isArray(targetPlayer.metrics)) {
      const puttingValue = targetPlayer.metrics[7];
      const puttingStats = groupStats?.["Putting"]?.["SG Putting"];
      if (typeof puttingValue === 'number' && puttingStats) {
        const puttingStdDev = puttingStats.stdDev || 0.001;
        const puttingZ = (puttingValue - puttingStats.mean) / puttingStdDev;
        logs.push([snapshotTime(), `[SNAPSHOT] Putting Metric Value (index 7): ${puttingValue}`]);
        logs.push([snapshotTime(), `[SNAPSHOT] Putting Stats mean=${puttingStats.mean}, stdDev=${puttingStdDev}`]);
        logs.push([snapshotTime(), `[SNAPSHOT] Putting Z-Score: ${puttingZ}`]);
      }
    }

    // Approach metrics summary (indices 17-34 in metricLabels)
    if (Array.isArray(targetPlayer.metrics) && targetPlayer.metrics.length >= 35) {
      for (let i = 17; i <= 34; i++) {
        const label = metricLabels[i] || `Approach Metric ${i}`;
        logs.push([snapshotTime(), `[SNAPSHOT] Approach Metric ${i} ${label}: ${targetPlayer.metrics[i]}`]);
      }
    }

    // Derived metric: Birdie Chances Created is index 14
    if (Array.isArray(targetPlayer.metrics) && targetPlayer.metrics.length > 14) {
      logs.push([snapshotTime(), `[SNAPSHOT] Derived Metric BCC (index 14): ${targetPlayer.metrics[14]}`]);
    }

    // Detailed Group Score Calculation for Scoring and Course Management
    if (Array.isArray(targetPlayer.metrics)) {
      // Find Scoring and Course Management groups
      const scoringGroup = metricGroups.find(g => g.name === 'Scoring');
      const courseManagementGroup = metricGroups.find(g => g.name === 'Course Management');
      const puttingGroup = metricGroups.find(g => g.name === 'Putting');
      
      // Log Putting group calculation (simple, one metric)
      if (puttingGroup) {
        logs.push([snapshotTime(), `[SNAPSHOT] === PUTTING GROUP SCORE CALCULATION ===`]);
        let puttingGroupScore = 0;
        let puttingTotalWeight = 0;
        
        puttingGroup.metrics.forEach(metric => {
          const rawValue = targetPlayer.metrics[metric.index];
          
          // SG metrics (Strokes Gained) are already in correct direction - higher is better
          // No transformation needed
          let transformedValue = rawValue;
          
          const stats = groupStats?.["Putting"]?.[metric.name];
          if (stats) {
            const zScore = (transformedValue - stats.mean) / (stats.stdDev || 0.001);
            const contribution = zScore * metric.weight;
            logs.push([snapshotTime(), `[SNAPSHOT]   ${metric.name}: raw=${rawValue}, transformed=${transformedValue.toFixed(4)}, z=${zScore.toFixed(4)}, weight=${metric.weight}, contrib=${contribution.toFixed(4)}`]);
            puttingGroupScore += contribution;
            puttingTotalWeight += metric.weight;
          }
        });
        
        const finalPuttingScore = puttingTotalWeight > 0 ? puttingGroupScore / puttingTotalWeight : 0;
        logs.push([snapshotTime(), `[SNAPSHOT]   Total: ${puttingGroupScore.toFixed(4)} / ${puttingTotalWeight} = ${finalPuttingScore.toFixed(4)}`]);
      }
      
      // Log Scoring group calculation
      if (scoringGroup) {
        logs.push([snapshotTime(), `[SNAPSHOT] === SCORING GROUP SCORE CALCULATION ===`]);
        let scoringGroupScore = 0;
        let scoringTotalWeight = 0;
        
        scoringGroup.metrics.forEach(metric => {
          let rawValue = targetPlayer.metrics[metric.index];
          
          // Apply same transformations as in main calculation
          let transformedValue = rawValue;
          if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            transformedValue = maxScore - rawValue;
          }
          
          const stats = groupStats?.["Scoring"]?.[metric.name];
          if (stats) {
            const zScore = (transformedValue - stats.mean) / (stats.stdDev || 0.001);
            const contribution = zScore * metric.weight;
            logs.push([snapshotTime(), `[SNAPSHOT]   ${metric.name}: raw=${rawValue}, transformed=${transformedValue.toFixed(4)}, z=${zScore.toFixed(4)}, weight=${metric.weight}, contrib=${contribution.toFixed(4)}`]);
            scoringGroupScore += contribution;
            scoringTotalWeight += metric.weight;
          }
        });
        
        const finalScoringScore = scoringTotalWeight > 0 ? scoringGroupScore / scoringTotalWeight : 0;
        logs.push([snapshotTime(), `[SNAPSHOT]   Total: ${scoringGroupScore.toFixed(4)} / ${scoringTotalWeight} = ${finalScoringScore.toFixed(4)}`]);
      }
      
      // Log Course Management group calculation
      if (courseManagementGroup) {
        logs.push([snapshotTime(), `[SNAPSHOT] === COURSE MANAGEMENT GROUP SCORE CALCULATION ===`]);
        let cmGroupScore = 0;
        let cmTotalWeight = 0;
        
        courseManagementGroup.metrics.forEach(metric => {
          let rawValue = targetPlayer.metrics[metric.index];
          
          // Apply same transformations as in main calculation
          let transformedValue = rawValue;
          if (metric.name.includes('Prox') ||
              metric.name === 'Fairway Proximity' ||
              metric.name === 'Rough Proximity') {
            // Get the appropriate max value - handle both plain and group-prefixed names
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
              baseMetricName = metric.name.split(':')[1].trim();
            }
            const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                                 (metric.name.includes('Fairway') ? 60 :
                                 metric.name.includes('Rough') ? 80 : 60);
            transformedValue = Math.max(0, maxProxValue - rawValue);
          }
          
          const stats = groupStats?.["Course Management"]?.[metric.name];
          if (stats) {
            const zScore = (transformedValue - stats.mean) / (stats.stdDev || 0.001);
            const contribution = zScore * metric.weight;
            logs.push([snapshotTime(), `[SNAPSHOT]   ${metric.name}: raw=${rawValue}, transformed=${transformedValue.toFixed(4)}, z=${zScore.toFixed(4)}, weight=${metric.weight}, contrib=${contribution.toFixed(4)}`]);
            cmGroupScore += contribution;
            cmTotalWeight += metric.weight;
          }
        });
        
        const finalCMScore = cmTotalWeight > 0 ? cmGroupScore / cmTotalWeight : 0;
        logs.push([snapshotTime(), `[SNAPSHOT]   Total: ${cmGroupScore.toFixed(4)} / ${cmTotalWeight} = ${finalCMScore.toFixed(4)}`]);
      }
    }

    // Trend calculations (historical metrics only)
    if (Array.isArray(targetPlayer.trends)) {
      const trendLabels = [
        'SG Total', 'Driving Distance', 'Driving Accuracy', 'SG T2G',
        'SG Approach', 'SG Around Green', 'SG OTT', 'SG Putting',
        'Greens in Regulation', 'Scrambling', 'Great Shots', 'Poor Shots',
        'Scoring Average', 'Birdies or Better', 'Fairway Proximity', 'Rough Proximity'
      ];
      targetPlayer.trends.forEach((trendVal, idx) => {
        const label = trendLabels[idx] || `Trend ${idx}`;
        logs.push([snapshotTime(), `[SNAPSHOT] Trend ${idx} ${label}: ${trendVal}`]);
      });
    }

    // Group score dampening details if present
    if (targetPlayer.groupScoresBeforeDampening) {
      logs.push([snapshotTime(), `[SNAPSHOT] GroupScores Before Dampening: ${JSON.stringify(targetPlayer.groupScoresBeforeDampening)}`]);
    }
    if (targetPlayer.groupScoresAfterDampening) {
      logs.push([snapshotTime(), `[SNAPSHOT] GroupScores After Dampening: ${JSON.stringify(targetPlayer.groupScoresAfterDampening)}`]);
    }
  }

  // Log groupStats for key metrics (mean/stdDev)
  const statsFocus = new Set([
    'Scoring Average',
    'Birdie Chances Created',
    'SG T2G',
    'SG Putting',
    'SG Around Green'
  ]);

  Object.entries(groupStats).forEach(([groupName, metrics]) => {
    Object.entries(metrics).forEach(([metricName, stats]) => {
      if (metricName.includes('Approach') || metricName.includes('Prox') || statsFocus.has(metricName)) {
        logs.push([snapshotTime(), `[SNAPSHOT] Stats ${groupName} -> ${metricName}: mean=${stats.mean}, stdDev=${stats.stdDev}`]);
      }
    });
  });

  // After calculating in calculatePlayerMetrics
  const cacheData = JSON.stringify({
    players: processedData,
    groupStats: groupStats,
    timestamp: new Date().getTime()
  });
  PropertiesService.getScriptProperties().setProperty("playerMetricsCache", cacheData);


  // 4. Sort and Prepare Output
  const sortedData = prepareRankingOutput(processedData, metricLabels);

  // 5. Write to Sheet
  writeRankingOutput(outputSheet, sortedData, metricLabels, metricGroups, groupStats);

  // 6. Create Debug Sheet with calculation breakdown - USE SORTED DATA WITH RANKS
  createDebugCalculationSheet(ss, sortedData, metricGroups, groupStats);

    logs.push([new Date().toLocaleTimeString(), '[LOG] generatePlayerRankings completed successfully']);
    return "Rankings generated successfully!";
  } catch (error) {
    console.log(`ERROR: ${error && error.message ? error.message : error}`);
    throw error;
  } finally {
    flushLogs();
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

// Ported to test
function getMetricGroups(configSheet) {

  // Read past performance configuration
  const pastPerformanceEnabled = configSheet.getRange("F27").getValue() === "Yes";
  const pastPerformanceWeight = configSheet.getRange("G27").getValue() || 0;
  
  // Get current tournament ID
  const currentEventId = configSheet.getRange("G9").getValue();

  // Master index registry - single source of truth
  const METRIC_INDICES = {
    // Historical Metrics (0-16)
    "SG Total": 0,
    "Driving Distance": 1,
    "Driving Accuracy": 2,
    "SG T2G": 3,
    "SG Approach": 4,
    "SG Around Green": 5,
    "SG OTT": 6,
    "SG Putting": 7,
    "Greens in Regulation": 8,
    "Scrambling": 9,
    "Great Shots": 10,
    "Poor Shots": 11,
    "Scoring Average": 12,
    "Birdies or Better": 13,
    "Birdie Chances Created": 14,
    "Fairway Proximity": 15,
    "Rough Proximity": 16,
    
    // Approach Metrics (17-34)
    "Approach <100 GIR": 17,
    "Approach <100 SG": 18,
    "Approach <100 Prox": 19,
    "Approach <150 FW GIR": 20,
    "Approach <150 FW SG": 21,
    "Approach <150 FW Prox": 22,
    "Approach <150 Rough GIR": 23,
    "Approach <150 Rough SG": 24,
    "Approach <150 Rough Prox": 25,
    "Approach >150 Rough GIR": 26,
    "Approach >150 Rough SG": 27,
    "Approach >150 Rough Prox": 28,
    "Approach <200 FW GIR": 29,
    "Approach <200 FW SG": 30,
    "Approach <200 FW Prox": 31,
    "Approach >200 FW GIR": 32,
    "Approach >200 FW SG": 33,
    "Approach >200 FW Prox": 34
  };

  const configuration = {
    "Driving Performance": {
      metrics: {
        "Driving Distance": METRIC_INDICES["Driving Distance"],
        "Driving Accuracy": METRIC_INDICES["Driving Accuracy"],
        "SG OTT": METRIC_INDICES["SG OTT"]
      },
      weights: {
        "Driving Distance": configSheet.getRange("G16").getValue(),
        "Driving Accuracy": configSheet.getRange("H16").getValue(),
        "SG OTT": configSheet.getRange("I16").getValue()
      }
    },
    "Approach - Short (<100)": {
      metrics: {
        "Approach <100 GIR": METRIC_INDICES["Approach <100 GIR"],
        "Approach <100 SG": METRIC_INDICES["Approach <100 SG"],
        "Approach <100 Prox": METRIC_INDICES["Approach <100 Prox"]
      },
      weights: {
        "Approach <100 GIR": configSheet.getRange("G17").getValue(),
        "Approach <100 SG": configSheet.getRange("H17").getValue(),
        "Approach <100 Prox": configSheet.getRange("I17").getValue()
      }
    },
    "Approach - Mid (100-150)": {
      metrics: {
        "Approach <150 FW GIR": METRIC_INDICES["Approach <150 FW GIR"],
        "Approach <150 FW SG": METRIC_INDICES["Approach <150 FW SG"],
        "Approach <150 FW Prox": METRIC_INDICES["Approach <150 FW Prox"],
        "Approach <150 Rough GIR": METRIC_INDICES["Approach <150 Rough GIR"],
        "Approach <150 Rough SG": METRIC_INDICES["Approach <150 Rough SG"],
        "Approach <150 Rough Prox": METRIC_INDICES["Approach <150 Rough Prox"]
      },
      weights: {
        "Approach <150 FW GIR": configSheet.getRange("G18").getValue(),
        "Approach <150 FW SG": configSheet.getRange("H18").getValue(),
        "Approach <150 FW Prox": configSheet.getRange("I18").getValue(),
        "Approach <150 Rough GIR": configSheet.getRange("G18").getValue(),
        "Approach <150 Rough SG": configSheet.getRange("H18").getValue(),
        "Approach <150 Rough Prox": configSheet.getRange("I18").getValue()
      }
    },
    "Approach - Long (150-200)": {
      metrics: {
        "Approach <200 FW GIR": METRIC_INDICES["Approach <200 FW GIR"],
        "Approach <200 FW SG": METRIC_INDICES["Approach <200 FW SG"],
        "Approach <200 FW Prox": METRIC_INDICES["Approach <200 FW Prox"],
        "Approach >150 Rough GIR": METRIC_INDICES["Approach >150 Rough GIR"],
        "Approach >150 Rough SG": METRIC_INDICES["Approach >150 Rough SG"],
        "Approach >150 Rough Prox": METRIC_INDICES["Approach >150 Rough Prox"]
      },
      weights: {
        "Approach <200 FW GIR": configSheet.getRange("G19").getValue(),
        "Approach <200 FW SG": configSheet.getRange("H19").getValue(),
        "Approach <200 FW Prox": configSheet.getRange("I19").getValue(),
        "Approach >150 Rough GIR": configSheet.getRange("G19").getValue(),
        "Approach >150 Rough SG": configSheet.getRange("H19").getValue(),
        "Approach >150 Rough Prox": configSheet.getRange("I19").getValue()
      }
    },
    "Approach - Very Long (>200)": {
      metrics: {
        "Approach >200 FW GIR": METRIC_INDICES["Approach >200 FW GIR"],
        "Approach >200 FW SG": METRIC_INDICES["Approach >200 FW SG"],
        "Approach >200 FW Prox": METRIC_INDICES["Approach >200 FW Prox"]
      },
      weights: {
        "Approach >200 FW GIR": configSheet.getRange("G20").getValue(),
        "Approach >200 FW SG": configSheet.getRange("H20").getValue(),
        "Approach >200 FW Prox": configSheet.getRange("I20").getValue()
      }
    },
    "Putting": {
      metrics: {
        "SG Putting": METRIC_INDICES["SG Putting"]
      },
      weights: {
        "SG Putting": configSheet.getRange("G21").getValue()
      }
    },
    "Around the Green": {
      metrics: {
        "SG Around Green": METRIC_INDICES["SG Around Green"]
      },
      weights: {
        "SG Around Green": configSheet.getRange("G22").getValue()
      }
    },
    "Scoring": {
      metrics: {
        "SG T2G": METRIC_INDICES["SG T2G"],
        "Scoring Average": METRIC_INDICES["Scoring Average"],
        "Birdie Chances Created": METRIC_INDICES["Birdie Chances Created"],
        "Scoring: Approach <100 SG": METRIC_INDICES["Approach <100 SG"],
        "Scoring: Approach <150 FW SG": METRIC_INDICES["Approach <150 FW SG"],
        "Scoring: Approach <150 Rough SG": METRIC_INDICES["Approach <150 Rough SG"],
        "Scoring: Approach <200 FW SG": METRIC_INDICES["Approach <200 FW SG"],
        "Scoring: Approach >200 FW SG": METRIC_INDICES["Approach >200 FW SG"],
        "Scoring: Approach >150 Rough SG": METRIC_INDICES["Approach >150 Rough SG"]
      },
      weights: {
        "SG T2G": configSheet.getRange("G23").getValue(),
        "Scoring Average": configSheet.getRange("H23").getValue(),
        "Birdie Chances Created": configSheet.getRange("I23").getValue(),
        "Scoring: Approach <100 SG": configSheet.getRange("P17").getValue(),
        "Scoring: Approach <150 FW SG": configSheet.getRange("P18").getValue(),
        "Scoring: Approach <150 Rough SG": configSheet.getRange("P18").getValue(),
        "Scoring: Approach <200 FW SG": configSheet.getRange("P19").getValue(),
        "Scoring: Approach >200 FW SG": configSheet.getRange("P20").getValue(),
        "Scoring: Approach >150 Rough SG": configSheet.getRange("P20").getValue()
      }
    },
    "Course Management": {
      metrics: {
        "Scrambling": METRIC_INDICES["Scrambling"],
        "Great Shots": METRIC_INDICES["Great Shots"],
        "Poor Shots": METRIC_INDICES["Poor Shots"],
        "Course Management: Approach <100 Prox": METRIC_INDICES["Approach <100 Prox"],
        "Course Management: Approach <150 FW Prox": METRIC_INDICES["Approach <150 FW Prox"],
        "Course Management: Approach <150 Rough Prox": METRIC_INDICES["Approach <150 Rough Prox"],
        "Course Management: Approach >150 Rough Prox": METRIC_INDICES["Approach >150 Rough Prox"],
        "Course Management: Approach <200 FW Prox": METRIC_INDICES["Approach <200 FW Prox"],
        "Course Management: Approach >200 FW Prox": METRIC_INDICES["Approach >200 FW Prox"]
      },
      weights: {
        "Scrambling": configSheet.getRange("G24").getValue(),
        "Great Shots": configSheet.getRange("H24").getValue(),
        "Poor Shots": configSheet.getRange("I24").getValue(),
        "Course Management: Approach <100 Prox": configSheet.getRange("J24").getValue(),
        "Course Management: Approach <150 FW Prox": configSheet.getRange("K24").getValue(),
        "Course Management: Approach <150 Rough Prox": configSheet.getRange("L24").getValue(),
        "Course Management: Approach >150 Rough Prox": configSheet.getRange("M24").getValue(),
        "Course Management: Approach <200 FW Prox": configSheet.getRange("N24").getValue(),
        "Course Management: Approach >200 FW Prox": configSheet.getRange("O24").getValue()
      }
    },
    "Past Performance": {
      enabled: pastPerformanceEnabled,
      weight: pastPerformanceWeight,
      currentEventId: currentEventId
    }
  };

  // Validate configuration structure
  if (!configuration || typeof configuration !== "object") {
    throw new Error("Invalid configuration format");
  }

  // Retrieve group-level weights from column Q (Q16-Q24 for each group)
  const groupWeightMap = {
    "Driving Performance": configSheet.getRange("Q16").getValue() || 0,
    "Approach - Short (<100)": configSheet.getRange("Q17").getValue() || 0,
    "Approach - Mid (100-150)": configSheet.getRange("Q18").getValue() || 0,
    "Approach - Long (150-200)": configSheet.getRange("Q19").getValue() || 0,
    "Approach - Very Long (>200)": configSheet.getRange("Q20").getValue() || 0,
    "Putting": configSheet.getRange("Q21").getValue() || 0,
    "Around the Green": configSheet.getRange("Q22").getValue() || 0,
    "Scoring": configSheet.getRange("Q23").getValue() || 0,
    "Course Management": configSheet.getRange("Q24").getValue() || 0
  };

  // Convert to final format with proper error handling
  try {
    return {
      groups: Object.entries(configuration)
        .filter(([key]) => key !== "Past Performance")
        .map(([groupName, groupData]) => ({
          name: groupName,
          metrics: Object.entries(groupData.metrics).map(([metricName, index]) => ({
            name: metricName,
            index,
            weight: groupData.weights[metricName] || 0
          })),
          weight: groupWeightMap[groupName] || Object.values(groupData.weights).reduce((sum, w) => sum + w, 0)
        })),
      pastPerformance: configuration["Past Performance"]
    };
  } catch (e) {
    console.error("Configuration processing failed:", e);
    throw new Error("Invalid metric group configuration format");
  }
}

// Helper function to convert per-shot SG values to per-round values
// Ported to test
function normalizeApproachSG(perShotValue) {
  // Average number of approach shots per round on PGA Tour
  const AVG_APPROACH_SHOTS_PER_ROUND = 18;
  
  // Convert per-shot value to per-round value
  return perShotValue * AVG_APPROACH_SHOTS_PER_ROUND;
}

// Helper function to calculate Birdie Chances Created using clean metrics
// Ported to test
function calculateBCC(metrics, courseSetupWeights) {
  // Define metric indices for easier reference (BEFORE BCC insertion)
  const DRIVING_ACCURACY_INDEX = 2;    // Driving accuracy percentage
    
  // GIR indices for different distances
  const GIR_UNDER_100_INDEX = 16;      // Approach <100 GIR
  const GIR_FW_100_TO_150_INDEX = 19;  // Approach <150 FW GIR  
  const GIR_ROUGH_100_TO_150_INDEX = 22; // Approach <150 Rough GIR
  const GIR_ROUGH_OVER_150_INDEX = 25; // Approach >150 Rough GIR
  const GIR_FW_150_TO_200_INDEX = 28;  // Approach <200 FW GIR
  const GIR_FW_OVER_200_INDEX = 31;    // Approach >200 FW GIR
    
  // SG indices
  const SG_PUTTING_INDEX = 7;          // SG Putting
  const SG_UNDER_100_INDEX = 17;       // Approach <100 SG
  const SG_FW_100_TO_150_INDEX = 20;   // Approach <150 FW SG
  const SG_ROUGH_100_TO_150_INDEX = 23; // Approach <150 Rough SG  
  const SG_ROUGH_OVER_150_INDEX = 26;  // Approach >150 Rough SG
  const SG_FW_150_TO_200_INDEX = 29;   // Approach <200 FW SG
  const SG_FW_OVER_200_INDEX = 32;     // Approach >200 FW SG
    
  // Proximity indices
  const PROX_UNDER_100_INDEX = 18;     // Approach <100 Prox
  const PROX_FW_100_TO_150_INDEX = 21; // Approach <150 FW Prox
  const PROX_ROUGH_100_TO_150_INDEX = 24; // Approach <150 Rough Prox
  const PROX_ROUGH_OVER_150_INDEX = 27; // Approach >150 Rough Prox
  const PROX_FW_150_TO_200_INDEX = 30; // Approach <200 FW Prox
  const PROX_FW_OVER_200_INDEX = 33;   // Approach >200 FW Prox
  
  // Get player's actual driving accuracy (use 0.6 as default if missing)
  const drivingAccuracy = metrics[DRIVING_ACCURACY_INDEX] || 0.6;
  const fairwayPercent = drivingAccuracy;
  const roughPercent = 1 - fairwayPercent;
    
  // Extract putting
  const sgPutting = isNaN(metrics[SG_PUTTING_INDEX]) ? 0 : metrics[SG_PUTTING_INDEX];
    
  // Calculate weighted GIR by distance (higher is better)
  const girUnder100 = isNaN(metrics[GIR_UNDER_100_INDEX]) ? 0 : metrics[GIR_UNDER_100_INDEX];
  const girFW100to150 = isNaN(metrics[GIR_FW_100_TO_150_INDEX]) ? 0 : metrics[GIR_FW_100_TO_150_INDEX];
  const girFW150to200 = isNaN(metrics[GIR_FW_150_TO_200_INDEX]) ? 0 : metrics[GIR_FW_150_TO_200_INDEX];
  const girFWOver200 = isNaN(metrics[GIR_FW_OVER_200_INDEX]) ? 0 : metrics[GIR_FW_OVER_200_INDEX];
    
  // Include rough approaches
  const girRough100to150 = isNaN(metrics[GIR_ROUGH_100_TO_150_INDEX]) ? 0 : metrics[GIR_ROUGH_100_TO_150_INDEX];
  const girRoughOver150 = isNaN(metrics[GIR_ROUGH_OVER_150_INDEX]) ? 0 : metrics[GIR_ROUGH_OVER_150_INDEX];
    
  // Calculate weighted GIR - using player's actual fairway/rough percentages
  const weightedGIR = 
    (girUnder100 * courseSetupWeights.under100) +
    (girFW100to150 * courseSetupWeights.from100to150 * fairwayPercent) +
    (girRough100to150 * courseSetupWeights.from100to150 * roughPercent) +
    (girFW150to200 * courseSetupWeights.from150to200 * fairwayPercent) +
    (girRoughOver150 * (courseSetupWeights.from150to200 + courseSetupWeights.over200) * roughPercent) +
    (girFWOver200 * courseSetupWeights.over200 * fairwayPercent);

  // Get raw SG Approach metrics
  const sgUnder100_raw = metrics[SG_UNDER_100_INDEX] || 0;
  const sgFW100to150_raw = metrics[SG_FW_100_TO_150_INDEX] || 0;
  const sgFW150to200_raw = metrics[SG_FW_150_TO_200_INDEX] || 0;
  const sgFWOver200_raw = metrics[SG_FW_OVER_200_INDEX] || 0;
  const sgRough100to150_raw = metrics[SG_ROUGH_100_TO_150_INDEX] || 0;
  const sgRoughOver150_raw = metrics[SG_ROUGH_OVER_150_INDEX] || 0;
  
  // Convert from per-shot to per-round values
  const sgUnder100 = normalizeApproachSG(sgUnder100_raw);
  const sgFW100to150 = normalizeApproachSG(sgFW100to150_raw);
  const sgFW150to200 = normalizeApproachSG(sgFW150to200_raw);
  const sgFWOver200 = normalizeApproachSG(sgFWOver200_raw);
  const sgRough100to150 = normalizeApproachSG(sgRough100to150_raw);
  const sgRoughOver150 = normalizeApproachSG(sgRoughOver150_raw);
    
  // Calculate weighted approach SG - using player's actual fairway/rough percentages
  const weightedApproachSG = 
    (sgUnder100 * courseSetupWeights.under100) +
    (sgFW100to150 * courseSetupWeights.from100to150 * fairwayPercent) +
    (sgRough100to150 * courseSetupWeights.from100to150 * roughPercent) +
    (sgFW150to200 * courseSetupWeights.from150to200 * fairwayPercent) +
    (sgRoughOver150 * (courseSetupWeights.from150to200 + courseSetupWeights.over200) * roughPercent) +
    (sgFWOver200 * courseSetupWeights.over200 * fairwayPercent);
    
  // Get proximity metrics (lower is better)
  const proxUnder100 = metrics[PROX_UNDER_100_INDEX] || 0;
  const proxFW100to150 = metrics[PROX_FW_100_TO_150_INDEX] || 0;
  const proxFW150to200 = metrics[PROX_FW_150_TO_200_INDEX] || 0;
  const proxFWOver200 = metrics[PROX_FW_OVER_200_INDEX] || 0;
  const proxRough100to150 = metrics[PROX_ROUGH_100_TO_150_INDEX] || 0;
  const proxRoughOver150 = metrics[PROX_ROUGH_OVER_150_INDEX] || 0;
    
  // Calculate weighted proximity - using player's actual fairway/rough percentages
  const weightedProximity = 
    (proxUnder100 * courseSetupWeights.under100) +
    (proxFW100to150 * courseSetupWeights.from100to150 * fairwayPercent) +
    (proxRough100to150 * courseSetupWeights.from100to150 * roughPercent) +
    (proxFW150to200 * courseSetupWeights.from150to200 * fairwayPercent) +
    (proxRoughOver150 * (courseSetupWeights.from150to200 + courseSetupWeights.over200) * roughPercent) +
    (proxFWOver200 * courseSetupWeights.over200 * fairwayPercent);
    
  // Retrieve scoring average to factor in overall player performance
  const scoringAvg = metrics[12] || 72;
    
  // Hardcoded, statistically-determined component weights
  const girWeight = 0.40;      // GIR is the strongest predictor
  const approachWeight = 0.30; // Approach quality
  const puttingWeight = 0.25;  // Putting importance
  const scoringWeight = 0.05;  // Overall scoring ability
    
  // Calculate component values
  const girComponent = weightedGIR;
  const approachComponent = weightedApproachSG - (weightedProximity / 30); // Scaled proximity penalty
  const puttingComponent = sgPutting;
  const scoringComponent = 74 - scoringAvg; // 74 is max value from METRIC_MAX_VALUES
    
  // Final formula
  return (girComponent * girWeight) + 
         (approachComponent * approachWeight) + 
         (puttingComponent * puttingWeight) + 
         (scoringComponent * scoringWeight);
}

// Helper function to apply trends to metrics with proper index mapping
// Ported to test
function applyTrends(updatedMetrics, trends, playerName) {
  // Define constants
  const TREND_WEIGHT = 0.30; // How much trends influence the overall score
  const TREND_THRESHOLD = 0.005; // Minimum trend value to consider significant
  const BCC_INDEX = 14; // Index where BCC was inserted
 
  // Create a copy of metrics
  const adjustedMetrics = [...updatedMetrics];
  
  // Log for debugging
  console.log(`${playerName}: Trends array length: ${trends.length}, Metrics array length: ${updatedMetrics.length}`);
  
  // Process each trend in the original trends array
  for (let originalIndex = 0; originalIndex < trends.length; originalIndex++) {
    // Skip insignificant trends
    if (Math.abs(trends[originalIndex]) <= TREND_THRESHOLD) {
      continue;
    }
    
    // Calculate the adjusted index (accounting for BCC insertion)
    // If the original index is 14 or higher, we need to add 1 to account for BCC
    const adjustedIndex = originalIndex >= 14 ? originalIndex + 1 : originalIndex;
    
    // Skip if adjusted index is out of bounds (shouldn't happen, but safety check)
    if (adjustedIndex >= updatedMetrics.length) {
      console.warn(`${playerName}: Skipping trend at adjusted index ${adjustedIndex} (out of bounds)`);
      continue;
    }
    
    // Get metric name (for logging)
    const metricNames = [
      'strokesGainedTotal', 'drivingDistance', 'drivingAccuracy', 'strokesGainedT2G',
      'strokesGainedApp', 'strokesGainedArg', 'strokesGainedOTT', 'strokesGainedPutt',
      'greensInReg', 'scrambling', 'greatShots', 'poorShots',
      'scoringAverage', 'birdiesOrBetter', 'fairwayProx', 'roughProx',
      // Approach metrics...
      'approach <100 GIR', 'approach <100 SG', 'approach <100 Prox',
      'approach <150 FW GIR', 'approach <150 FW SG', 'approach <150 FW Prox',
      'approach <150 Rough GIR', 'approach <150 Rough SG', 'approach <150 Rough Prox',
      'approach >150 Rough GIR', 'approach >150 Rough SG', 'approach >150 Rough Prox',
      'approach <200 FW GIR', 'approach <200 FW SG', 'approach <200 FW Prox',
      'approach >200 FW GIR', 'approach >200 FW SG', 'approach >200 FW Prox'
    ];
    const metricName = metricNames[originalIndex] || `Unknown Metric ${originalIndex}`;
    
    // Determine if this is a "lower is better" metric
    const isLowerBetter = Array.from(METRIC_TYPES.LOWER_BETTER)
      .some(lowerBetterName => 
        normalizeMetricName(lowerBetterName) === normalizeMetricName(metricName)
      );
    
    // Calculate trend impact
    let trendImpact = trends[originalIndex] * TREND_WEIGHT;
    
    // For "lower is better" metrics, invert the trend impact
    if (isLowerBetter) {
      trendImpact = -trendImpact;
    }
    
    // Apply the trend multiplicatively to preserve proportionality
    const trendFactor = 1 + trendImpact;
    const safeTrendFactor = trendFactor === 0 ? 0.0001 : trendFactor;
    const originalValue = adjustedMetrics[adjustedIndex];
    adjustedMetrics[adjustedIndex] = originalValue * safeTrendFactor;
    
    console.log(`${playerName}: Applied trend to ${metricName} (original idx: ${originalIndex}, adjusted idx: ${adjustedIndex}): 
      ${originalValue.toFixed(3)} → ${adjustedMetrics[adjustedIndex].toFixed(3)} 
      (trend: ${trends[originalIndex].toFixed(3)}, impact: ${trendImpact.toFixed(3)}, factor: ${safeTrendFactor.toFixed(3)})`);
  }
  
  return adjustedMetrics;
}

// Helper function to calculate WAR without index adjustments
// Ported to test
function calculateWAR(adjustedMetrics, validatedKpis, groupStats, playerName, groups) {
  let war = 0;
  
  console.log(`${playerName}: Starting WAR calculation with ${validatedKpis.length} KPIs`);
  
  // First, validate all inputs to the WAR calculation
  if (!Array.isArray(adjustedMetrics) || !Array.isArray(validatedKpis)) {
    console.error(`Invalid inputs for ${playerName} WAR calculation`);
    return 0;
  }
  
  validatedKpis.forEach(kpi => {
    try {
      // Validate the KPI
      if (!kpi || typeof kpi.index !== 'number' || 
          typeof kpi.weight !== 'number' || !kpi.name) {
        console.warn(`Skipping invalid KPI for ${playerName}`);
        return;
      }
      
      const kpiIndex = kpi.index;
      
      // Safety check for array bounds
      if (kpiIndex < 0 || kpiIndex >= adjustedMetrics.length) {
        console.warn(`${playerName}: KPI index ${kpiIndex} out of bounds`);
        return;
      }
      
      // Get and validate the metric value
      let kpiValue = adjustedMetrics[kpiIndex];
      if (typeof kpiValue !== 'number' || isNaN(kpiValue)) {
        console.warn(`${playerName}: Invalid metric value at index ${kpiIndex}`);
        kpiValue = 0;
      }
      
      // APPLY TRANSFORMATIONS (same as group score calculation)
      // Transform "lower is better" metrics to "higher is better" for consistent z-score interpretation
      if (kpi.name === 'Poor Shots') {
        const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
        kpiValue = maxPoorShots - kpiValue;
      } else if (kpi.name.includes('Prox') ||
                 kpi.name === 'Fairway Proximity' ||
                 kpi.name === 'Rough Proximity') {
        const maxProxValue = METRIC_MAX_VALUES[kpi.name] ||
                             (kpi.name === 'Fairway Proximity' ? 60 :
                             kpi.name === 'Rough Proximity' ? 80 : 60);
        kpiValue = maxProxValue - kpiValue;
        kpiValue = Math.max(0, kpiValue);
      } else if (kpi.name === 'Scoring Average') {
        const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
        kpiValue = maxScore - kpiValue;
      }
      
      // Find the group for this KPI
      let kpiGroup = null;
      for (const group of groups) {
        if (group.metrics.some(m => m.name === kpi.name)) {
          kpiGroup = group.name;
          break;
        }
      }
      
      if (!kpiGroup) {
        console.warn(`${playerName}: Could not find group for KPI: ${kpi.name}`);
        return;
      }
      
      // Get and validate the stats
      const kpiStats = groupStats[kpiGroup]?.[kpi.name];
      if (!kpiStats) {
        console.warn(`${playerName}: Stats not found for ${kpiGroup} -> ${kpi.name}`);
        return;
      }
      
      const mean = typeof kpiStats.mean === 'number' ? kpiStats.mean : 0;
      const stdDev = typeof kpiStats.stdDev === 'number' && kpiStats.stdDev > 0 ? kpiStats.stdDev : 0.0001;
      
      // Calculate z-score safely (now using transformed value)
      let zScore = (kpiValue - mean) / stdDev;
      
      // Apply transformation safely
      let transformedZScore = Math.sign(zScore) * Math.log(1 + Math.abs(zScore));
      
      // Calculate WAR contribution
      let kpiContribution = transformedZScore * kpi.weight;
      
      // Add to total WAR safely
      if (!isNaN(kpiContribution)) {
        war += kpiContribution;
      }
      
      console.log(`${playerName} - KPI: ${kpi.name}, Value: ${kpiValue.toFixed(3)}, Weight: ${kpi.weight.toFixed(4)}, Contribution: ${kpiContribution.toFixed(4)}`);
    } catch (e) {
      console.error(`Error processing KPI for ${playerName}: ${e.message}`);
    }
  });
  
  console.log(`${playerName}: Final WAR: ${war.toFixed(4)}`);
  return war;
}

// Helper function to calculate historical impact
function calculateHistoricalImpact(playerEvents, playerName, pastPerformance) {
  // Access globals from parent scope
  const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
  const PAST_PERF_ENABLED = pastPerformance?.enabled || false;
  const PAST_PERF_WEIGHT = Math.min(Math.max(pastPerformance?.weight || 0, 0), 1);
  const CURRENT_EVENT_ID = pastPerformance?.currentEventId ? String(pastPerformance.currentEventId) : null;
  
  // If no current event ID or no player events, return 0
  if (!CURRENT_EVENT_ID || !playerEvents) return 0;

  console.log(`===== Beginning historical impact calc for ${playerName} at event ${CURRENT_EVENT_ID} =====`);
  console.log(`===== Player events keys: ${Object.keys(playerEvents).join(', ')} =====`);
  
  const currentYear = new Date().getFullYear();
  const pastEvents = [];

  // Find all events matching the current event ID using a for loop
  const matchingEvents = [];
  const playerEventKeys = Object.keys(playerEvents);

  for (let i = 0; i < playerEventKeys.length; i++) {
    const key = playerEventKeys[i];
    const event = playerEvents[key];

    // Check if this is the target event by eventId
    if (String(event.eventId) === CURRENT_EVENT_ID) {
      // Only include if this is a past event (has year property and year < currentYear)
      if (event.year && event.year < currentYear) {
        matchingEvents.push([key, event]);
      }
    }
  }

  console.log(`Found ${matchingEvents.length} matching historical events for event ${CURRENT_EVENT_ID}`);

  // DUMP FULL RAW DATA FOR MATCHING EVENTS
  for (let i = 0; i < matchingEvents.length; i++) {
    const [key, event] = matchingEvents[i];
    console.log(`\n========== EVENT #${i + 1} (${event.year}) ==========`);
    console.log(`Event key: ${key}, eventId: ${event.eventId}, year: ${event.year}, position: ${event.position}`);

    // Log all top-level keys in the event
    console.log(`Event object keys: ${Object.keys(event).join(', ')}`);

    // Create a version we can stringify without the full round details
    const eventSummary = {
      ...event,
      rounds: `[Array of ${event.rounds?.length || 0} rounds]` // Replace actual rounds array with summary
    };

    // Stringify the event summary with indentation for readability
    console.log(`\nEvent structure:\n${JSON.stringify(eventSummary, null, 2)}`);

    // Show round numbers if available
    if (event.rounds && event.rounds.length > 0) {
      const roundNumbers = [];
      for (let j = 0; j < event.rounds.length; j++) {
        roundNumbers.push(event.rounds[j].roundNum);
      }
      roundNumbers.sort();
      console.log(`Round numbers present: ${roundNumbers.join(', ')}`);
    }
  }

  // Process each matching event
  for (let i = 0; i < matchingEvents.length; i++) {
    const [key, event] = matchingEvents[i];
    console.log(`\nProcessing event key: ${key}, eventId: ${event.eventId}, year: ${event.year}, position: ${event.position}`);

    // Determine if this event has all rounds or player missed the cut
    let isCompleteEvent = false;
    let missedCut = false;

    if (event.rounds && event.rounds.length > 0) {
      const roundNumbers = [];
      for (let j = 0; j < event.rounds.length; j++) {
        roundNumbers.push(event.rounds[j].roundNum);
      }
      roundNumbers.sort();

      isCompleteEvent = roundNumbers.includes(4); // Has final round
      missedCut = !isCompleteEvent && (roundNumbers.includes(1) || roundNumbers.includes(2)); // Only early rounds

      console.log(`Event has rounds: ${roundNumbers.join(', ')}`);
      console.log(`Complete event: ${isCompleteEvent}, Missed cut: ${missedCut}`);
    }

    // Position handling
    // Handle first the missed cut case regardless of position value
    if (missedCut) {
      // Player only played early rounds, treat as missed cut
      console.log(`Year ${event.year}: Round pattern indicates missed cut`);
      pastEvents.push({
        year: event.year,
        position: 100,
        finText: "CUT",
        specialFinish: true,
        source: 'missedCut'
      });
    
    } else if (event.position !== undefined && event.position !== null && !isNaN(event.position)) {
      // Normal finish with valid position
      console.log(`Year ${event.year}: Actual finish position ${event.position}`);
      pastEvents.push({
        year: event.year,
        position: event.position,
        finText: event.position.toString(),
        estimated: false,
        source: 'actual'
      });
    
    // Finally, handle completed events with missing position data
    } else if (isCompleteEvent) {
      // Player completed all rounds but we don't have position data
      console.log(`Year ${event.year}: Player completed all rounds but no position data`);
      const estimatedPosition = 35; // Default estimate

      pastEvents.push({
        year: event.year,
        position: estimatedPosition,
        finText: "Unknown",
        estimated: true,
        source: 'completed'
      });
    } else {
      console.log(`Year ${event.year}: Cannot determine finish position reliably, skipping`);
    }
  }

  console.log(`Found ${pastEvents.length} past events for ${playerName} at event ${CURRENT_EVENT_ID}`);

  if (pastEvents.length === 0) {
    console.log(`No past events found for ${playerName} at event ${CURRENT_EVENT_ID} - applying inexperience penalty`);
    return -0.25; // Small penalty for no course history
  }

  // Sort events by year, most recent first
  pastEvents.sort((a, b) => b.year - a.year);

  console.log(`After sorting: ${pastEvents.length} past events`);
  
  for (let i = 0; i < pastEvents.length; i++) {
    const event = pastEvents[i];
    console.log(`Event ${i + 1}: Year=${event.year}, Position=${event.position}, Text=${event.finText}, Type=${event.specialFinish ? 'Special' : (event.estimated ? 'Estimated' : 'Normal')}, Source=${event.source || 'unknown'}`);
  }

  let totalWeightedImpact = 0;
  let totalWeight = 0;

  // Calculate impact with recency weighting
  for (let i = 0; i < pastEvents.length; i++) {
    const event = pastEvents[i];
    // Ensure position is a valid number
    const position = isNaN(event.position) ? 100 : event.position;
    let eventImpact;

    // Special handling for WD/CUT
    if (event.specialFinish === true) {
      // Negative impact for WD/CUT
      eventImpact = -0.5;  // Penalty for WD/CUT
      console.log(`Event year ${event.year}, result: ${event.finText}, impact: ${eventImpact} (special finish)`);
    
    // Estimated positions get reduced impact
    } else if (event.estimated === true) {
      // Conservative impact for estimated positions
      if (position <= 25) eventImpact = 0.3;  // Assume decent finish
      else if (position <= 50) eventImpact = 0.1;  // Assume mediocre finish
      else eventImpact = -0.1;  // Assume below-average finish

      console.log(`Event year ${event.year}, result: ${event.finText}, impact: ${eventImpact} (estimated position)`);
    
    // Normal position-based impact for finished tournaments
    } else {
      if (position === 1) eventImpact = 2.0;       // Win gets double impact
      else if (position <= 3) eventImpact = 1.2;   // Top 3 gets enhanced impact
      else if (position <= 5) eventImpact = 0.9;   // Top 5 gets strong impact
      else if (position <= 10) eventImpact = 0.7;  // Top 10 gets good impact
      else if (position <= 25) eventImpact = 0.4;  // Top 25 gets moderate impact
      else if (position <= 50) eventImpact = 0.2;  // Made cut gets minor impact
      else if (position <= 65) eventImpact = 0.0;  // Poor finish, neutral impact
      else eventImpact = -0.3;                     // Very poor finish, minor negative

      console.log(`Event year ${event.year}, result: ${event.finText || position}, position: ${position}, impact: ${eventImpact} (normal finish)`);
    }

    // Recency weighting - more recent performances matter more
    const recencyWeight = Math.pow(0.8, i);
    totalWeightedImpact += eventImpact * recencyWeight;
    totalWeight += recencyWeight;

    console.log(`Event year ${event.year}, impact: ${eventImpact}, weight: ${recencyWeight.toFixed(2)}`);
  }

  // Calculate weighted average impact
  const weightedAvgImpact = totalWeightedImpact / totalWeight;

  // Enhanced appearance bonus - adjusted based on finish types
  const specialFinishCount = pastEvents.filter(e => e.specialFinish === true).length;
  const estimatedCount = pastEvents.filter(e => e.estimated === true).length;
  const standardFinishCount = pastEvents.length - specialFinishCount - estimatedCount;

  // Full bonus for normal finishes, reduced for WD/CUT
  const appearanceBonus = (standardFinishCount * 0.02) + (estimatedCount * 0.01) - (specialFinishCount * 0.01);

  const finalImpact = weightedAvgImpact + appearanceBonus;

  console.log(`Weighted avg impact: ${weightedAvgImpact.toFixed(2)}, Appearance bonus: ${appearanceBonus.toFixed(2)}, Final impact: ${finalImpact.toFixed(2)}`);

  return finalImpact;
}

// Ported to test
function calculatePlayerMetrics(players, { groups, pastPerformance }) {
  // Define constants
  const TREND_THRESHOLD = 0.005; // Minimum trend value to consider significant
  const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
  const PAST_PERF_ENABLED = pastPerformance?.enabled || false;
  const PAST_PERF_WEIGHT = Math.min(Math.max(pastPerformance?.weight || 0, 0), 1);
  const CURRENT_EVENT_ID = pastPerformance?.currentEventId ? String(pastPerformance.currentEventId) : null;
 
  console.log(`** CURRENT_EVENT_ID = "${CURRENT_EVENT_ID}" **`);
 
  // Read the weights from configuration or use defaults
  const similarCoursesWeight = configSheet.getRange("H33").getValue() || 0.7;
  const puttingCoursesWeight = configSheet.getRange("H40").getValue() || 0.8;

  // Fix group weights before using them
  groups = groups.map(group => {
    // Parse weight properly to ensure it's a valid number
    let cleanWeight = parseFloat(String(group.weight).replace(/[^0-9.]/g, ''));
    
    // Validate the weight
    if (isNaN(cleanWeight) || cleanWeight <= 0) {
      console.warn(`Invalid weight for group ${group.name}: ${group.weight}, using default 0.1`);
      cleanWeight = 0.1;
    }
    
    // For debugging, log the original and cleaned weight
    console.log(`Group ${group.name}: Original weight=${group.weight}, Cleaned weight=${cleanWeight}`);
    
    return {
      ...group,
      weight: cleanWeight
    };
  });
  
  // Normalize group weights to sum to 1.0
  // Only normalize if weights don't already sum to ~1.0
  const totalGroupWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const isAlreadyNormalized = Math.abs(totalGroupWeight - 1.0) < 0.01;
  
  if (!isAlreadyNormalized && totalGroupWeight > 0) {
    groups = groups.map(group => ({
      ...group,
      weight: group.weight / totalGroupWeight
    }));
    console.log(`Group weights were not normalized, normalized from total ${totalGroupWeight.toFixed(3)} to 1.0`);
  } else if (totalGroupWeight === 0) {
    console.warn("All group weights are 0! Using equal weights.");
    const equalWeight = 1.0 / groups.length;
    groups = groups.map(group => ({
      ...group,
      weight: equalWeight
    }));
  } else {
    console.log(`Group weights already normalized (total: ${totalGroupWeight.toFixed(3)})`);
  }
  
  console.log("Group weights:");
  groups.forEach(group => console.log(`  ${group.name}: ${group.weight.toFixed(3)}`));

 
  // 1. Extract Metric Values
  const allMetricValues = Object.entries(players).reduce((acc, [dgId, data]) => {
    const historicalAvgs = calculateHistoricalAverages(
      data.historicalRounds,
      data.similarRounds,
      data.puttingRounds,
      {
        similarWeight: similarCoursesWeight,
        puttingWeight: puttingCoursesWeight
      }
    );
    
    // Calculate approach metrics
    const approachMetrics = getApproachMetrics(data.approachMetrics);
 
    // Combine historical and approach metrics
    const combinedMetrics = [...historicalAvgs, ...approachMetrics];
 
    // Store the combined metrics in the accumulator
    acc[dgId] = combinedMetrics;
    return acc;
  }, {});
 
  // Validate data
  const playerCount = Object.keys(allMetricValues).length;
  const metricCount = Object.values(allMetricValues)[0]?.length || 0;
  console.log(`Player data summary: ${playerCount} players, ${metricCount} metrics per player`);
 
  // 2. Calculate Group Statistics (Mean and Standard Deviation)
  const groupStats = {};
  const problematicMetrics = new Set(['Approach >200 FW Prox']);
  
  // Read course setup weights from configuration sheet
  const courseSetupWeights = {
    under100: configSheet.getRange("P17").getValue(),
    from100to150: configSheet.getRange("P18").getValue(),
    from150to200: configSheet.getRange("P19").getValue(),
    over200: configSheet.getRange("P20").getValue()
  };
  
  console.log("Course setup weights:", courseSetupWeights);
  
  // Ensure weights sum to 1.0
  const totalWeight = Object.values(courseSetupWeights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    console.warn(`Course setup weights sum to ${totalWeight.toFixed(3)}, normalizing...`);
    Object.keys(courseSetupWeights).forEach(key => {
      courseSetupWeights[key] /= totalWeight;
    });
  }
 
  // First, we should create a version of allMetricValues that includes BCC at index 14
  const metricsWithBCC = {};
  for (const [dgId, metrics] of Object.entries(allMetricValues)) {
    // Calculate BCC for this player
    const player = players[dgId];
    const bcc = calculateBCC(metrics, courseSetupWeights);
    
    // Insert BCC at position 14
    metricsWithBCC[dgId] = [
      ...metrics.slice(0, 14),
      bcc,
      ...metrics.slice(14)
    ];
  }
 
  // Now use metricsWithBCC to calculate stats
  for (const group of groups) {
    groupStats[group.name] = {};
    console.log(`Processing group: ${group.name}`);
    
    for (const metric of group.metrics) {
      console.log(`  Processing metric: ${metric.name} (index: ${metric.index})`);
      
      // Extract metric values using the correct array with BCC included
      const metricValues = [];
      const isProblematicMetric = problematicMetrics.has(metric.name);
      
      Object.entries(players).forEach(([dgId, player]) => {
        const rawValue = metricsWithBCC[dgId]?.[metric.index];
        
        if (isProblematicMetric) {
          console.log(`  ${player.name}: value=${rawValue}, type=${typeof rawValue}, isNaN=${isNaN(rawValue)}`);
        }
        
        // Include zero values for metrics where zero can be a valid outcome
        const zeroIsValid = metric.name !== 'Driving Distance' && metric.name !== 'Scoring Average';
        if (typeof rawValue === 'number' && !isNaN(rawValue) && (rawValue !== 0 || zeroIsValid)) {
          // APPLY TRANSFORM for correct field statistics
          let transformedValue = rawValue;
          
          // Apply same transforms as later in z-score calculation
          if (metric.name === 'Poor Shots') {
            const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
            transformedValue = maxPoorShots - rawValue;
          } else if (metric.name.includes('Prox') ||
                     metric.name === 'Fairway Proximity' ||
                     metric.name === 'Rough Proximity') {
            // Strip group prefix to find correct METRIC_MAX_VALUES entry
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
              baseMetricName = metric.name.split(':')[1].trim();
            }
            const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                                 (baseMetricName === 'Fairway Proximity' ? 60 :
                                 baseMetricName === 'Rough Proximity' ? 80 : 60);
            transformedValue = maxProxValue - rawValue;
            transformedValue = Math.max(0, transformedValue);
          } else if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            transformedValue = maxScore - rawValue;
          }
          
          metricValues.push(transformedValue);
        }
      });
 
      // Initialize metric in groupStats
      groupStats[group.name][metric.name] = { 
        mean: 0, 
        stdDev: 0.001 // Minimum stdDev to avoid division by zero
      };
 
      console.log(`Found ${metricValues.length} valid values for ${metric.name}`);
      
      if (metricValues.length === 0) {
        console.error(`No valid values for ${metric.name} in ${group.name}`);
        
        // Use baseline standard deviations for known metrics
        const baselineStdDevs = {
          'Approach <100 Prox': 5.0,
          'Approach <150 FW Prox': 7.0,
          'Approach <150 Rough Prox': 9.0,
          'Approach >150 Rough Prox': 12.0,
          'Approach <200 FW Prox': 10.0,
          'Approach >200 FW Prox': 14.0,
          'Fairway Proximity': 7.0,
          'Rough Proximity': 10.0,
          'Birdie Chances Created': 3.0,
          // Add more baselines as needed
        };
        
        if (baselineStdDevs[metric.name]) {
          groupStats[group.name][metric.name].stdDev = baselineStdDevs[metric.name];
          
          // Use more appropriate default means for different metric types
          if (metric.name.includes('Prox')) {
            groupStats[group.name][metric.name].mean = 30; // Proximity in feet
          } else if (metric.name === 'Birdie Chances Created') {
            groupStats[group.name][metric.name].mean = 4.0; // Typical value
          } else if (metric.name.includes('SG')) {
            groupStats[group.name][metric.name].mean = 0.0; // Strokes Gained baseline
          } else {
            groupStats[group.name][metric.name].mean = 0.5; // Generic default
          }
          
          console.log(`Using baseline values for ${metric.name}: mean=${groupStats[group.name][metric.name].mean}, stdDev=${baselineStdDevs[metric.name]}`);
        }
        
        continue;
      }
 
      // Calculate stats only if we have valid data
      const metricMean = metricValues.reduce((sum, v) => sum + v, 0) / metricValues.length;
      const sumSquares = metricValues.reduce((sum, v) => sum + Math.pow(v - metricMean, 2), 0);
      const metricStdDev = metricValues.length > 1 ? Math.sqrt(sumSquares / (metricValues.length - 1)) : 0;
 
      // Update groupStats with calculated values
      groupStats[group.name][metric.name] = {
        mean: metricMean,
        stdDev: metricStdDev || 0.001 // Ensure non-zero stdDev
      };
 
      console.log(`Group: ${group.name}, Metric: ${metric.name}`, {
        mean: metricMean,
        stdDev: metricStdDev,
        sampleValues: metricValues.slice(0, 5) // Show first 5 values
      });
    }
  }
 
  const processedPlayers = Object.entries(players).map(([dgId, data]) => {
  // Get similar course event IDs from configuration
  const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
  const similarCourseRange = configSheet.getRange("G33:G37").getValues();
  
  // Process the similar course IDs
  const similarCourseIds = similarCourseRange
    .flat()
    .filter(String)
    .flatMap(cell => cell.toString().split(','))
    .map(id => id.trim())
    .filter(id => id);
  
  // Get ALL tournament finishes (not just similar courses) for Top 5/Top 10 counting
  const allTournamentFinishes = Object.values(data.events)
    .map(event => event.position)
    .filter(pos => typeof pos === 'number' && !isNaN(pos) && pos !== 100); // Exclude missed cuts (position 100)
  
  const top5 = allTournamentFinishes.filter(pos =>
    typeof pos === 'number' && pos <= 5
  ).length;
  
  const top10 = allTournamentFinishes.filter(pos =>
    typeof pos === 'number' && pos >= 1 && pos <= 10
  ).length;
 
    // Calculate Metrics using all three round types with weights
    console.log(`Processing player: ${data.name}`);
    console.log(`Round counts: Historical=${data.historicalRounds.length}, Similar=${data.similarRounds.length}, Putting=${data.puttingRounds.length}`);
 
    // Calculate historical averages
    const historicalAvgs = calculateHistoricalAverages(
      data.historicalRounds,
      data.similarRounds,
      data.puttingRounds,
      {
        similarWeight: similarCoursesWeight,
        puttingWeight: puttingCoursesWeight
      }
    );
 
    // Calculate trends using historical rounds
    const trends = calculateMetricTrends(data.historicalRounds);
 
    // Get approach metrics
    const approachMetrics = getApproachMetrics(data.approachMetrics);
    
    // Calculate which metrics have actual data (for data coverage purposes)
    const metricsWithData = calculateMetricsWithData(
      data.historicalRounds,
      data.similarRounds,
      data.puttingRounds,
      data.approachMetrics
    );
 
    // Create safe metrics array with exactly 34 elements
    const safeMetrics = [
      ...historicalAvgs.slice(0, 16), // First 16 historical metrics
      ...approachMetrics.slice(0, 18) // First 18 approach metrics
    ];
 
    // Validation check
    if (safeMetrics.length !== 34) {
      console.error(`Invalid metric count for ${data.name}: ${safeMetrics.length}`);
      safeMetrics.splice(34); // Truncate to 34 if over
      safeMetrics.push(...Array(34 - safeMetrics.length).fill(0)); // Pad if under
    }
 
    // Ensure numeric values
    const cleanMetrics = safeMetrics.map(m => {
      if (typeof m !== 'number' || isNaN(m)) {
        console.warn('Invalid metric found:', m);
        return 0;
      }
      return m;
    });
 
    // Calculate Birdie Chances Created using the helper function
    const birdieChancesCreated = calculateBCC(cleanMetrics, courseSetupWeights);
 
    // Create a new array with the Birdie Chances Created metric inserted at position 14
    const updatedMetrics = [
      ...cleanMetrics.slice(0, 14),  // Metrics before Birdie Chances Created
      birdieChancesCreated,          // Insert new metric
      ...cleanMetrics.slice(14)      // Metrics after Birdie Chances Created
    ];
 
    // Apply trends to metrics using the helper function
    const adjustedMetrics = applyTrends(updatedMetrics, trends, data.name);
 
    // Calculate Group Scores
    let totalMetricsCount = 0;
    let nonZeroMetricsCount = 0;
    const groupScores = {};
    
    for (const group of groups) {
      let groupScore = 0;
      let totalWeight = 0;
 
      for (const metric of group.metrics) {
        let value = adjustedMetrics[metric.index];
 
        // 1. Transform Poor Shots to Poor Shot Avoidance
        if (metric.name === 'Poor Shots') {
          const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
          value = maxPoorShots - value;
        
        // 2. Transform Proximity metrics to Approach Quality
        } else if (metric.name.includes('Prox') ||
                  metric.name === 'Fairway Proximity' ||
                  metric.name === 'Rough Proximity') {
          // Strip group prefix to find correct METRIC_MAX_VALUES entry
          let baseMetricName = metric.name;
          if (metric.name.includes(':')) {
            baseMetricName = metric.name.split(':')[1].trim();
          }
          // Get the appropriate max value for this proximity type
          const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                               (baseMetricName === 'Fairway Proximity' ? 60 :
                               baseMetricName === 'Rough Proximity' ? 80 : 60);
 
          // Transform to "approach quality" where higher is better
          value = maxProxValue - value;
 
          // Ensure non-negative values
          value = Math.max(0, value);
        
        // 3. Transform Scoring Average to Scoring Quality
        } else if (metric.name === 'Scoring Average') {
          const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
          value = maxScore - value;
        }

        const metricStats = groupStats[group.name]?.[metric.name];
        if (!metricStats) {
          console.error(`Metric stats missing for ${group.name} -> ${metric.name}`);
          console.error("Available groups:", Object.keys(groupStats));
          continue; // Skip this metric
        }
        
        const stdDev = metricStats.stdDev || 0.001; // Ensure non-zero
        let zScore = (value - metricStats.mean) / stdDev;
        
        // Apply scoring differential penalties for scoring related metrics
        if (metric.name.includes('Score') || 
            metric.name.includes('Birdie') || 
            metric.name.includes('Par')) {
          
          const absZScore = Math.abs(zScore);
          if (absZScore > 2.0) {
            zScore *= Math.pow(absZScore / 2.0, 0.75);
          }
        }
        
        totalMetricsCount++;
        // Check if this metric has actual data (not just default/zero value)
        if (metricsWithData.has(metric.index)) {
          nonZeroMetricsCount++;
        }
        
        // Only apply weights if metric is significant
        if (metric.weight && typeof value === 'number' && !isNaN(value)) {
          groupScore += zScore * metric.weight;
          totalWeight += metric.weight;
        }
      }
      
      // Normalize by total weight if available
      if (totalWeight > 0) {
        groupScore = groupScore / totalWeight;
      }
      
      // Store the group score
      groupScores[group.name] = groupScore;
    }
    
    // Add explicit debug points to trace values
    console.log(`DEBUG - BEFORE CALCULATION - Player ${data.name}`);
    
    console.log(`GROUP SCORES DEBUGGING - Player: ${data.name}`);
    let groupScoreCount = 0;
    for (const [groupName, score] of Object.entries(groupScores)) {
      console.log(`  Group: ${groupName}, Score: ${score}, Valid: ${typeof score === 'number' && !isNaN(score)}`);
      if (typeof score === 'number' && !isNaN(score)) {
        groupScoreCount++;
      }
    }
    console.log(`  Total valid group scores: ${groupScoreCount} of ${Object.keys(groupScores).length}`);
    
    // Calculate weighted score from group scores with extensive validation
    let weightedScore = 0;
    let totalWeightUsed = 0;
    
    for (const group of groups) {
      // Get the corresponding group score if it exists
      const groupScore = groupScores[group.name];
      const groupWeight = group.weight || 0;
      
      // Debug the group's contribution
      console.log(`    Checking group: ${group.name}`);
      console.log(`    Score: ${groupScore}, Weight: ${groupWeight}`);
      console.log(`    Valid score: ${typeof groupScore === 'number' && !isNaN(groupScore)}`);
      console.log(`    Valid weight: ${typeof groupWeight === 'number' && groupWeight > 0}`);
      
      // Only use valid scores and weights
      if (typeof groupWeight === 'number' && groupWeight > 0 && 
          typeof groupScore === 'number' && !isNaN(groupScore)) {
        weightedScore += groupScore * groupWeight;
        totalWeightUsed += groupWeight;
        console.log(`    Adding to score: ${groupScore * groupWeight}, total now: ${weightedScore}`);
      } else {
        console.warn(`    Skipping invalid group: ${group.name}`);
      }
    }
    
    // Normalize weighted score with validation
    if (totalWeightUsed > 0) {
      weightedScore = weightedScore / totalWeightUsed;
      console.log(`  Final normalized weighted score: ${weightedScore}`);
    } else {
      // If no valid weights were found, set a default score of 0
      console.warn(`No valid weights for ${data.name}, defaulting to 0`);
      weightedScore = 0;
    }
    
    // Safety check for weightedScore
    if (isNaN(weightedScore)) {
      console.error(`Got NaN for weightedScore for ${data.name}, setting to 0`);
      weightedScore = 0;
    }
    
    // Calculate data coverage with validation
    const dataCoverage = nonZeroMetricsCount > 0 && totalMetricsCount > 0 ? 
                         nonZeroMetricsCount / totalMetricsCount : 0.5;
    
    // Get confidence factor with safety checks
    let confidenceFactor;
    try {
      confidenceFactor = getCoverageConfidence(dataCoverage);
      if (isNaN(confidenceFactor)) {
        console.error(`Got NaN from getCoverageConfidence for ${data.name}, using 1.0`);
        confidenceFactor = 1.0;
      }
    } catch (e) {
      console.error(`Error in getCoverageConfidence for ${data.name}: ${e.message}`);
      confidenceFactor = 1.0;
    }
    
    console.log(`Data coverage: ${dataCoverage}, Confidence factor: ${confidenceFactor}`);
    
    // Capture group scores BEFORE dampening for debug
    const groupScoresBeforeDampening = {...groupScores};
    let groupScoresAfterDampening = null;
    
    // Unified dampening based on data coverage (smooth, no hard cliffs)
    const coverageDampingFactor = dataCoverage < 0.70
      ? Math.exp(-1.5 * (1.0 - dataCoverage))
      : 1.0;
    
    if (coverageDampingFactor < 1.0) {
      console.log(`${data.name}: Applying coverage dampening factor of ${coverageDampingFactor.toFixed(3)} (coverage: ${dataCoverage.toFixed(3)})`);
      
      // Recalculate all group scores with dampened z-scores
      for (const group of groups) {
        let groupScore = 0;
        let totalWeight = 0;
        
        for (const metric of group.metrics) {
          let value = adjustedMetrics[metric.index];
          
          // Apply same transformations as main calculation
          if (metric.name === 'Poor Shots') {
            const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
            value = maxPoorShots - value;
          } else if (metric.name.includes('Prox') ||
                    metric.name === 'Fairway Proximity' ||
                    metric.name === 'Rough Proximity') {
            // Strip group prefix to find correct METRIC_MAX_VALUES entry
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
              baseMetricName = metric.name.split(':')[1].trim();
            }
            const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                                 (baseMetricName === 'Fairway Proximity' ? 60 :
                                 baseMetricName === 'Rough Proximity' ? 80 : 60);
            value = maxProxValue - value;
            value = Math.max(0, value);
          } else if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            value = maxScore - value;
          }
          
          const metricStats = groupStats[group.name]?.[metric.name];
          if (!metricStats) continue;
          
          let zScore = (value - metricStats.mean) / (metricStats.stdDev || 0.001);
          zScore *= coverageDampingFactor;
          
          // Apply scoring differential penalties
          if (metric.name.includes('Score') || 
              metric.name.includes('Birdie') || 
              metric.name.includes('Par')) {
            const absZScore = Math.abs(zScore);
            if (absZScore > 2.0) {
              zScore *= Math.pow(absZScore / 2.0, 0.75);
            }
          }
          
          if (metric.weight && typeof value === 'number' && !isNaN(value)) {
            groupScore += zScore * metric.weight;
            totalWeight += metric.weight;
          }
        }
        
        if (totalWeight > 0) {
          groupScore = groupScore / totalWeight;
        }
        
        // Update the group score with dampened value
        groupScores[group.name] = groupScore;
        console.log(`  Recalculated group ${group.name}: ${groupScore.toFixed(3)} (dampened)`);
      }
      
      // Capture group scores AFTER dampening for debug
      groupScoresAfterDampening = {...groupScores};
      
      // Recalculate weighted score with dampened group scores
      weightedScore = 0;
      let totalWeightUsed = 0;
      
      for (const group of groups) {
        const groupScore = groupScores[group.name];
        const groupWeight = group.weight || 0;
        
        if (typeof groupWeight === 'number' && groupWeight > 0 && 
            typeof groupScore === 'number' && !isNaN(groupScore)) {
          weightedScore += groupScore * groupWeight;
          totalWeightUsed += groupWeight;
        }
      }
      
      if (totalWeightUsed > 0) {
        weightedScore = weightedScore / totalWeightUsed;
      } else {
        weightedScore = 0;
      }
      
      console.log(`${data.name}: Recalculated weighted score with dampening: ${weightedScore.toFixed(3)}`);
    }
    
    // Refined score: apply confidence and coverage multipliers
    // Use smoother degradation curve for low-coverage players
    const dataCoverageMultiplier = dataCoverage < 0.70
      ? Math.max(0.4, 0.7 + (dataCoverage / 0.70) * 0.3) // Smooth curve from 0.4 to 1.0
      : 1.0;
    const refinedWeightedScore = weightedScore * confidenceFactor * dataCoverageMultiplier;
    
    // Defaults retained for debug fields
    const isLowConfidencePlayer = false;
    const baselineScore = null;
    const hasRecentTop10 = false;
    
    // Pre-sort events to check for recent win/top 10 (used in past perf section)
    const pastPerformances = data.events || {};
    const sortedEvents = Object.entries(pastPerformances)
      .sort((a, b) => {
        const yearA = a[0].split('-').pop();
        const yearB = b[0].split('-').pop();
        return parseInt(yearB) - parseInt(yearA);
      });
    
    if (isNaN(refinedWeightedScore)) {
      console.error(`Got NaN for refinedWeightedScore for ${data.name}, setting to 0`);
    }
    
    let pastPerformanceMultiplier = 1.0;
    if (PAST_PERF_ENABLED && PAST_PERF_WEIGHT > 0) {
      if (sortedEvents.length > 0) {
        // Player has data - calculate full multiplier based on their performance
        // Calculate recency-weighted past performance score
        let weightedPerformanceScore = 0;
        let totalWeight = 0;
        let eventIndex = 0;
        
        sortedEvents.forEach(([eventKey, event]) => {
          // Skip current event
          if (CURRENT_EVENT_ID && event.eventId?.toString() === CURRENT_EVENT_ID) {
            return;
          }
          
          // Calculate position score with broader range (not just top 10)
          let positionScore = 0;
          const position = event.position;
          
          if (position === 1) {
            positionScore = 1.5; // Wins get highest score
          } else if (position <= 3) {
            positionScore = 1.2; // Top 3
          } else if (position <= 5) {
            positionScore = 1.0; // Top 5
          } else if (position <= 10) {
            positionScore = 0.8; // Top 10
          } else if (position <= 25) {
            positionScore = 0.4; // Top 25 (still counts!)
          } else if (position <= 50) {
            positionScore = 0.1; // Made cut (minor credit)
          } else {
            positionScore = -0.2; // Missed cut or very poor finish
          }
          
          // Apply STRONG recency decay - much heavier emphasis on recent events
          // Event 0 (most recent): weight = 1.0
          // Event 1: weight = 0.5
          // Event 2: weight = 0.25
          // Event 3+: weight = 0.1 (older results matter much less)
          const recencyWeight = eventIndex === 0 ? 1.0 : Math.pow(0.5, eventIndex);
          weightedPerformanceScore += positionScore * recencyWeight;
          totalWeight += recencyWeight;
          eventIndex++;
        });

        // Only apply multiplier if player has recent performances
        if (totalWeight > 0) {
          const avgPerformanceScore = weightedPerformanceScore / totalWeight;
          
          // Linear scale with bounded effect to prevent past performance from overwhelming current metrics
          // Score 0.0 → 0.7x, 0.5 → 1.0x, 1.0 → 1.3x, 2.0 → 1.9x (capped below)
          const rawMultiplier = 0.7 + (avgPerformanceScore * 0.6);
          const cappedMultiplier = Math.max(0.5, Math.min(1.8, rawMultiplier));
          
          // Apply weight to scale the boost/penalty magnitude
          pastPerformanceMultiplier = 1.0 + ((cappedMultiplier - 1.0) * PAST_PERF_WEIGHT);
          
          const capIndicator = rawMultiplier !== cappedMultiplier ? " [CAP APPLIED]" : "";
          console.log(`${data.name}: Avg perf score=${avgPerformanceScore.toFixed(2)}, raw=${rawMultiplier.toFixed(3)}, capped=${cappedMultiplier.toFixed(3)}, final=${pastPerformanceMultiplier.toFixed(3)}${capIndicator}`);
        } else {
          console.log(`${data.name}: No usable performance data (staying at 1.0x)`);
        }
      } else {
        console.log(`${data.name}: No sortedEvents (staying at 1.0x)`);
      }
    }

    // Extract KPI names and weights from metric groups
    const kpis = groups.flatMap(group =>
        group.metrics.map(metric => ({
            name: metric.name,
            index: metric.index,
            weight: group.weight * metric.weight
        }))
    );

    // Normalize KPI weights
    const totalKpiWeight = kpis.reduce((sum, kpi) => sum + kpi.weight, 0);
    const normalizedKpis = kpis.map(kpi => ({
        ...kpi,
        weight: kpi.weight / totalKpiWeight
    }));

    // Validate and potentially adjust the weights
    const validatedKpis = validateKpiWeights(normalizedKpis);
    
    // Final score calculation with validation
    let finalScore = refinedWeightedScore * pastPerformanceMultiplier;
    if (isNaN(finalScore)) {
      console.error(`Got NaN for finalScore for ${data.name}, setting to 0`);
      finalScore = 0;
    }
    
    // Calculate WAR with validation
    let war;
    try {
      war = calculateWAR(adjustedMetrics, validatedKpis, groupStats, data.name, groups);
      if (isNaN(war)) {
        console.error(`Got NaN for war for ${data.name}, setting to 0`);
        war = 0;
      }
    } catch (e) {
      console.error(`Error calculating WAR for ${data.name}: ${e.message}`);
      war = 0;
    }
    
    // Return the player object with explicit property assignments
    return {
      dgId,
      name: data.name,
      groupScores, 
      top5,
      top10,
      metrics: updatedMetrics,
      weightedScore: weightedScore, 
      refinedWeightedScore: refinedWeightedScore,
      pastPerformanceMultiplier: pastPerformanceMultiplier,
      finalScore: finalScore,
      war: war,
      dataCoverage: dataCoverage,
      dataCoverageConfidence: getCoverageConfidence(dataCoverage) || 1.0,
      trends,
      // Debug fields for calculation sheet
      isLowConfidencePlayer: isLowConfidencePlayer,
      baselineScore: baselineScore,
      hasRecentTop10: hasRecentTop10,
      confidenceFactor: confidenceFactor,
      groupScoresBeforeDampening: groupScoresBeforeDampening,
      groupScoresAfterDampening: groupScoresAfterDampening
    };
  });

  cacheGroupStats(groupStats);

  return {
    players: processedPlayers,
    groupStats: groupStats
  };
}


// Ported to test
function validateKpiWeights(normalizedKpis) {
  const totalWeight = normalizedKpis.reduce((sum, kpi) => sum + kpi.weight, 0);
  
  // Check if weights sum to approximately 1.0 (allowing for small floating point errors)
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    console.warn(`KPI weights sum to ${totalWeight.toFixed(3)}, not 1.0. Normalizing weights.`);
    
    // Normalize the weights to ensure they sum to 1.0
    return normalizedKpis.map(kpi => ({
      ...kpi,
      weight: kpi.weight / totalWeight
    }));
  }
  
  return normalizedKpis;
}


// Helper function to get coverage confidence level
// Ported to test
function getCoverageConfidence(dataCoverage) {
  // Validate input
  if (typeof dataCoverage !== 'number' || isNaN(dataCoverage)) {
    console.warn(`Invalid dataCoverage value: ${dataCoverage}, using default confidence of 1.0`);
    return 1.0;
  }
  
  // Ensure coverage is between 0 and 1
  const validCoverage = Math.max(0, Math.min(1, dataCoverage));
  
  // Use a simple curve where confidence increases with data coverage
  // This gives 0.6 at 50% coverage, 0.8 at 75% coverage, 1.0 at 100% coverage
  const confidence = Math.pow(validCoverage, 0.5);
  
  // Ensure we never return less than 0.5 confidence
  const finalConfidence = 0.5 + (confidence * 0.5);
  
  // Final validation to ensure no NaN is returned
  if (isNaN(finalConfidence)) {
    console.warn(`Calculated invalid confidence from coverage ${dataCoverage}, using default 1.0`);
    return 1.0;
  }
  
  return finalConfidence;
}

// Ported to test
function calculateMetricTrends(finishes) {
  const TOTAL_ROUNDS = 24;
  const LAMBDA = 0.2 // Exponential decay factor
  const TREND_THRESHOLD = 0.005;
  const SMOOTHING_WINDOW = 3; // Size of smoothing window

  // Sort rounds by date descending
  const sortedRounds = (finishes || []).sort((a, b) => 
    new Date(b.date) - new Date(a.date) || b.roundNum - a.roundNum
  );

  // Get most recent valid rounds
  const recentRounds = sortedRounds.slice(0, TOTAL_ROUNDS).filter(round => {
    const isValid = round.metrics?.scoringAverage !== undefined;
    if (!isValid) console.log('Filtering invalid round:', round.date);
    return isValid;
  });

  // Return zeros if insufficient data
  if (recentRounds.length < 15) return Array(16).fill(0);

  // Complete metric mapping with all indices
  const metricMap = {
    0: 'strokesGainedTotal',
    1: 'drivingDistance',
    2: 'drivingAccuracy',
    3: 'strokesGainedT2G',
    4: 'strokesGainedApp',
    5: 'strokesGainedArg',
    6: 'strokesGainedOTT',
    7: 'strokesGainedPutt',
    8: 'greensInReg',
    9: 'scrambling',
    10: 'greatShots',
    11: 'poorShots',
    12: 'scoringAverage',
    13: 'birdiesOrBetter',
    14: 'fairwayProx',
    15: 'roughProx'
  };

  return Array(16).fill().map((_, metricIndex) => {
    const metricName = metricMap[metricIndex];
    if (!metricName) return 0;

    // Extract metric values in chronological order (oldest to newest)
    const values = recentRounds
      .slice()
      .reverse() // Oldest first for regression calculation
      .map(round => round.metrics[metricName])
      .filter(value => typeof value === 'number' && !isNaN(value));

    // Skip if not enough data points
    if (values.length < 10) return 0;

    // Apply smoothing before calculating trend
    const smoothedValues = smoothData(values, SMOOTHING_WINDOW);
    
    // Calculate weighted linear regression with smoothed values
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumWeights = 0;
    
    smoothedValues.forEach((value, index) => {
      const x = index + 1; // Time period (1 = oldest)
      const y = value;
      const weight = Math.exp(-LAMBDA * (smoothedValues.length - index)); // More weight to recent
      
      sumX += weight * x;
      sumY += weight * y;
      sumXY += weight * x * y;
      sumX2 += weight * x * x;
      sumWeights += weight;
    });

    // Calculate regression slope (trend)
    const numerator = sumWeights * sumXY - sumX * sumY;
    const denominator = sumWeights * sumX2 - sumX * sumX;
    const slope = denominator !== 0 ? numerator / denominator : 0;
    
    // Apply significance threshold
    const finalTrend = Math.abs(slope) > TREND_THRESHOLD 
      ? Number(slope.toFixed(3))
      : 0;

    return finalTrend;
  });
}

// Function to apply moving average smoothing
// Ported to test
function smoothData(values, windowSize) {
  if (values.length < windowSize) return values;
      
    const smoothed = [];
    for (let i = 0; i < values.length; i++) {
      // Calculate window boundaries, handling edge cases
      const start = Math.max(0, i - Math.floor(windowSize/2));
      const end = Math.min(values.length, i + Math.ceil(windowSize/2));
        
      // Calculate mean of values in window
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += values[j];
      }
      smoothed.push(sum / (end - start));
    }
  return smoothed;
}

// Helper function to extract course IDs from a range
// Ported to test
function getSimilarCourseIds(sheet, rangeAddress) {
  const range = sheet.getRange(rangeAddress);
  const values = range.getValues();
  
  // Extract all IDs (handle both comma-separated lists and individual cells)
  const courseIds = [];
  
  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      const cellValue = values[row][col];
      if (cellValue) {
        // Handle comma-separated IDs in a single cell
        if (typeof cellValue === 'string' && cellValue.includes(',')) {
          const ids = cellValue.split(',').map(id => id.trim()).filter(id => id);
          courseIds.push(...ids);
        } else {
          // Handle single ID
          courseIds.push(String(cellValue).trim());
        }
      }
    }
  }
  
  return courseIds.filter(id => id !== '');
}

// Ported to test
function aggregatePlayerData(metricGroups) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const players = {};

    // Extract metrics from metricGroups
    const metrics = metricGroups.flatMap(group => group.metrics);

    // Tournament Field Players
    const tournamentSheet = ss.getSheetByName("Tournament Field");
    const tournamentPlayers = tournamentSheet.getRange("B6:C" + tournamentSheet.getLastRow())
        .getValues()
        .filter(row => row[0] && row[1]);

     // Configuration for similar courses and putting-specific courses
    const configSheet = ss.getSheetByName("Configuration Sheet");
    if (!configSheet) throw new Error("Configuration Sheet not found");
    
    // Get similar course IDs (both regular and putting-specific)
    const regularSimilarCourses = getSimilarCourseIds(configSheet, "G33:G37");
    const puttingSpecificCourses = getSimilarCourseIds(configSheet, "G40:G44");
    const currentEventId = String(configSheet.getRange("G9").getValue() || "");

    console.log(`Regular similar courses: ${regularSimilarCourses.join(", ")}`);
    console.log(`Putting-specific courses: ${puttingSpecificCourses.join(", ")}`);

    // Updated player initialization
    tournamentPlayers.forEach(([dgId, name]) => {
      console.log(`Processing row: dgId=${dgId}, name=${name}`); // ADDED
      if (!dgId) {
        console.warn(`Skipping player "${name}" because dgId is missing in "Tournament Field" sheet.`);
        return; // Skip to the next player
      }
      
      players[dgId] = {
        name: name,
        dgId: dgId,
        events: {}, // Changed from 'finishes' to event-based tracking
        historicalRounds: [], // For trend analysis
        similarRounds: [],
        puttingRounds: [], // For putting-specific metrics
        approachMetrics: {}
    };
    });

    // Modified historical data processing
    console.log("=== STARTING HISTORICAL DATA PROCESSING ===");
    const historicalSheet = ss.getSheetByName("Historical Data");
    if (!historicalSheet) throw new Error("Historical Data sheet not found");
    
    console.log("Historical Data sheet found, getting last row...");
    const lastRow = historicalSheet.getLastRow();
    console.log(`Historical Data sheet has ${lastRow} rows`);

    // First pass: Gather all event metadata to identify event types
    const eventMetadata = {};
    console.log("Starting first pass to gather event metadata...");
    historicalSheet.getRange("B6:AL" + historicalSheet.getLastRow())
      .getValues()
      .forEach(row => {
        const eventId = row[5];
          if (!eventId) return;
            
          if (!eventMetadata[eventId]) {
          // A course can be both similar and putting-specific
            const isSimilar = regularSimilarCourses.includes(eventId);
            const isPutting = puttingSpecificCourses.includes(eventId);
            
            eventMetadata[eventId] = {
                eventId: eventId,
                isPuttingSpecific: isPutting,
                isSimilar: isSimilar,
                categoryText: (isPutting && isSimilar) ? "Both" :
                              (isPutting) ? "Putting" :
                              (isSimilar) ? "Similar" : "Regular"
            };
          }
        });

      console.log(`Processed ${Object.keys(eventMetadata).length} unique events`);
      console.log(`Found ${Object.values(eventMetadata).filter(e => e.isPuttingSpecific).length} putting-specific events`);
      console.log(`Found ${Object.values(eventMetadata).filter(e => e.isSimilar).length} similar events`);
      console.log(`Found ${Object.values(eventMetadata).filter(e => e.isPuttingSpecific && e.isSimilar).length} events in both categories`);

    console.log("Starting second pass to process player data...");
    let roundsProcessed = 0;


    // Second pass: Process all data with event type awareness
    historicalSheet.getRange("B6:AL" + historicalSheet.getLastRow())
    .getValues()
    .forEach(row => {
      const dgId = row[0];
      if (!players[dgId]) return;
      
      roundsProcessed++;
      if (roundsProcessed <= 5 || roundsProcessed % 100 === 0) {
        console.log(`Processing round ${roundsProcessed} for player ${players[dgId].name} (ID: ${dgId})`);
      }

      // Convert all values to numbers and handle errors
      const safeRow = row.map((cell, index) => {
     
        if (index === 7) return new Date(cell); // Date column (H)
        if (index === 14) return cell; // Time column (O)

         // Special handling for position column (index 10)

        if (index === 10) { // Position column
          if (typeof cell === 'string') {
            if (cell.includes('T')) {
              return parseInt(cell.replace('T', ''), 10);
            }
            if (cell === 'CUT' || cell === 'WD') return 100; // Treat as bad finish
          }
          return cell ? Number(cell) : 100;
        }

        const num = Number(cell);
        return isNaN(num) ? null : num;
      });
        
      const eventId = safeRow[5];
      const roundDate = new Date(safeRow[7]);
      const roundYear = roundDate.getFullYear();

      // Exclude only current event rounds from the current year
      if (roundYear === 2026 && String(eventId) === currentEventId) {
        return;
      }
      
      // Create year-specific event key
      const eventKey = `${dgId}-${eventId}-${roundYear}`;

      // Check if this is from a putting-specific or regular similar course
      const eventType = eventMetadata[eventId] || { 
        isPuttingSpecific: false, 
        isSimilar: false,
        categoryText: "Regular" 
      };
        
      // Initialize event if not exists
      if (!players[dgId].events[eventKey]) {
          players[dgId].events[eventKey] = {
              eventId: eventId, // Store eventId directly in the event object
              year: roundYear,  // Store the year explicitly
              position: safeRow[10], // fin_text
              isPuttingSpecific: eventType.isPuttingSpecific,
              isSimilar: eventType.isSimilar, // Changed from isRegularSimilar
              categoryText: eventType.categoryText, // Added for clarity in debugging
              rounds: []
          };
      }

      // Store round-level metrics in event
      const roundData = {
          playerName: players[dgId].name,
          date: roundDate,
          eventId: eventId,
          isPuttingSpecific: eventType.isPuttingSpecific,
          isSimilar: eventType.isSimilar, // Changed from isRegularSimilar
          categoryText: eventType.categoryText, // Added for debugging
          roundNum: safeRow[12],
          metrics: {
              scoringAverage: cleanMetricValue(safeRow[15]),
              eagles: cleanMetricValue(safeRow[19]),
              birdies: cleanMetricValue(safeRow[16]),
              birdiesOrBetter: cleanMetricValue(safeRow[16]) + cleanMetricValue(safeRow[19]),
              strokesGainedTotal: cleanMetricValue(safeRow[29]),
              drivingDistance: cleanMetricValue(safeRow[22]),
              drivingAccuracy: cleanMetricValue(safeRow[21], true),
              strokesGainedT2G: cleanMetricValue(safeRow[30]),
              strokesGainedApp: cleanMetricValue(safeRow[31]),
              strokesGainedArg: cleanMetricValue(safeRow[32]),
              strokesGainedOTT: cleanMetricValue(safeRow[33]),
              strokesGainedPutt: cleanMetricValue(safeRow[34]),
              greensInReg: cleanMetricValue(safeRow[23], true),
              scrambling: cleanMetricValue(safeRow[24], true),
              greatShots: cleanMetricValue(safeRow[25]),
              poorShots: cleanMetricValue(safeRow[26]),
              fairwayProx: cleanMetricValue(safeRow[27]),
              roughProx: cleanMetricValue(safeRow[28])
          }
      };

      // Add round to the event
      players[dgId].events[eventKey].rounds.push(roundData);

      // Add round to appropriate collection (mutually exclusive categorization)
      if (eventType.isPuttingSpecific) {
          players[dgId].puttingRounds.push(roundData);
          console.log(`Added putting-specific round for ${players[dgId].name}, event ${eventId}`);
          
          // Log Scheffler's putting rounds details
          if (players[dgId].name === 'Scheffler, Scottie') {
            console.log(`[SNAPSHOT] GAS Scheffler putting round added: event=${eventId}, year=${roundYear}, sg_putt=${roundData.metrics.strokesGainedPutt}, round=${roundData.roundNum}`);
          }
      } 
      else if (eventType.isSimilar) {
          players[dgId].similarRounds.push(roundData);
          console.log(`Added similar course round for ${players[dgId].name}, event ${eventId}`);
      }
      else {
          // Only add to historicalRounds if NOT similar or putting-specific
          players[dgId].historicalRounds.push(roundData);
          
          // Log Scheffler's historical rounds details
          if (players[dgId].name === 'Scheffler, Scottie') {
            console.log(`[SNAPSHOT] GAS Scheffler historical round added: event=${eventId}, year=${roundYear}, sg_putt=${roundData.metrics.strokesGainedPutt}, round=${roundData.roundNum}`);
          }
      }
      });

      console.log(`COMPLETED: Processed ${roundsProcessed} total rounds from Historical Data`);
      
      // Post-processing for historical averages
      Object.values(players).forEach(player => {
          // Sort all rounds by date (most recent first)
          player.historicalRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
          player.similarRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
          player.puttingRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
          
          // For debugging, report on all round counts
          console.log(`Player ${player.name}: ${player.historicalRounds.length} historical rounds, ` +
                      `${player.similarRounds.length} similar course rounds, ` +
                      `${player.puttingRounds.length} putting-specific rounds`);
      });

  // Approach Skill Data
  const approachSheet = ss.getSheetByName("Approach Skill");

  approachSheet.getRange("B6:AS" + approachSheet.getLastRow())
    .getValues()
    .forEach(row => {
      const dgId = row[0];
      if (players[dgId]) {
        players[dgId].approachMetrics = {
          '<100': {
            fwGIR: cleanMetricValue(row[16], true),  // Percentage
            strokesGained: cleanMetricValue(row[21]),
            shotProx: cleanMetricValue(row[20])
          },
          '<150': {
            fwGIR: cleanMetricValue(row[2], true),   // Percentage
            fwStrokesGained: cleanMetricValue(row[7]),
            fwShotProx: cleanMetricValue(row[6]),
            roughGIR: cleanMetricValue(row[37], true), // Percentage
            roughStrokesGained: cleanMetricValue(row[42]),
            roughShotProx: cleanMetricValue(row[41])
          },
          '>150 - Rough': {
            roughGIR: cleanMetricValue(row[23], true), // Percentage
            roughStrokesGained: cleanMetricValue(row[28]),
            roughShotProx: cleanMetricValue(row[27])
          },
          '<200': {
            fwGIR: cleanMetricValue(row[9], true),   // Percentage
            fwStrokesGained: cleanMetricValue(row[14]),
            fwShotProx: cleanMetricValue(row[13])
          },
          '>200': {
            fwGIR: cleanMetricValue(row[30], true),  // Percentage
            fwStrokesGained: cleanMetricValue(row[35]),
            fwShotProx: cleanMetricValue(row[34])
          }
        };
      }
    });
  
  return players;
}

// Ported to test
function getApproachMetrics(approachData) {
  // Ensure each category has default values
  const categories = {
    '<100': { fwGIR: 0, strokesGained: 0, shotProx: 0 },
    '<150': { 
      fwGIR: 0, fwStrokesGained: 0, fwShotProx: 0,
      roughGIR: 0, roughStrokesGained: 0, roughShotProx: 0 
    },
    '>150 - Rough': { roughGIR: 0, roughStrokesGained: 0, roughShotProx: 0 },
    '<200': { fwGIR: 0, fwStrokesGained: 0, fwShotProx: 0 },
    '>200': { fwGIR: 0, fwStrokesGained: 0, fwShotProx: 0 }
  };
  
  const safeData = Object.fromEntries(
    Object.entries(categories).map(([key, defaults]) => [
      key,
      Object.fromEntries(
        Object.entries(defaults).map(([subKey]) => {
          // Get raw value
          const rawValue = approachData[key]?.[subKey] || 0;
          
          // Apply normalization for SG values - convert per-shot to per-round
          if (subKey.includes('SG') || subKey.includes('strokesGained') || 
              subKey.includes('StrokesGained')) {
            return [subKey, normalizeApproachSG(rawValue)];
          }
          
          return [subKey, rawValue];
        })
      )
    ])
  );
  
  // Log sample values after normalization
  if (approachData) {
    console.log('Approach metrics conversion example:');
    for (const [key, category] of Object.entries(safeData)) {
      for (const [metric, value] of Object.entries(category)) {
        if (metric.includes('SG') || metric.includes('strokesGained') || 
            metric.includes('StrokesGained')) {
          const originalValue = approachData[key]?.[metric] || 0;
          console.log(`  ${key}.${metric}: ${originalValue.toFixed(3)} → ${value.toFixed(3)}`);
        }
      }
    }
  }

  return [
    // <100 metrics
    safeData['<100'].fwGIR,
    safeData['<100'].strokesGained,
    safeData['<100'].shotProx,
    // <150 metrics
    safeData['<150'].fwGIR,
    safeData['<150'].fwStrokesGained,
    safeData['<150'].fwShotProx,
    safeData['<150'].roughGIR,
    safeData['<150'].roughStrokesGained,
    safeData['<150'].roughShotProx,
    // >150 rough metrics
    safeData['>150 - Rough'].roughGIR,
    safeData['>150 - Rough'].roughStrokesGained,
    safeData['>150 - Rough'].roughShotProx,
    // <200 metrics
    safeData['<200'].fwGIR,
    safeData['<200'].fwStrokesGained,
    safeData['<200'].fwShotProx,
    // >200 metrics
    safeData['>200'].fwGIR,
    safeData['>200'].fwStrokesGained,
    safeData['>200'].fwShotProx
  ];
}

// Ported to test
function calculateDynamicWeight(baseWeight, dataPoints, minPoints, maxPoints = 20) {
  // Scale weight based on amount of data available
  if (dataPoints <= minPoints) return baseWeight * 0.8; // Reduce weight if minimum data
  if (dataPoints >= maxPoints) return baseWeight; // Full weight if plenty of data
    
  // Linear scaling between min and max points
  const scaleFactor = 0.8 + (0.2 * (dataPoints - minPoints) / (maxPoints - minPoints));
  return baseWeight * scaleFactor;
}

/**
 * Calculates which metrics have actual tournament/approach data (vs. defaults)
 * Returns a Set of metric indices that have real data
 * If a player has any tournament rounds, they have data for all metrics
 */
// Ported to test
function calculateMetricsWithData(historicalRounds, similarRounds, puttingRounds, approachMetrics) {
  const metricsWithData = new Set();
  
  // Map of metric indices to their corresponding metric keys in round.metrics
  const historicalMetricKeys = {
    0: 'strokesGainedTotal',
    1: 'drivingDistance',
    2: 'drivingAccuracy',
    3: 'strokesGainedT2G',
    4: 'strokesGainedApp',
    5: 'strokesGainedArg',
    6: 'strokesGainedOTT',
    7: 'strokesGainedPutt',
    8: 'greensInReg',
    9: 'scrambling',
    10: 'greatShots',
    11: 'poorShots',
    12: 'scoringAverage',
    13: 'birdiesOrBetter',
    14: 'fairwayProx',
    15: 'roughProx'
  };
  
  // Check historical metrics (0-15) across all round types
  const allHistoricalRounds = [...(historicalRounds || []), ...(similarRounds || []), ...(puttingRounds || [])];
  
  for (let i = 0; i <= 15; i++) {
    const metricKey = historicalMetricKeys[i];
    const zeroIsValid = metricKey !== 'drivingDistance' && metricKey !== 'scoringAverage';
    
    // Check if ANY round has a value for this metric (zero is valid for most metrics)
    const hasData = allHistoricalRounds.some(round => {
      const value = round?.metrics?.[metricKey];
      return typeof value === 'number' && !isNaN(value) && (value !== 0 || zeroIsValid);
    });
    
    if (hasData) {
      metricsWithData.add(i);
    }
  }
  
  // Check approach metrics (16-33)
  // Approach metrics are stored as an array index in the order defined by getApproachMetrics
  if (approachMetrics && typeof approachMetrics === 'object') {
    const approachMetricMapping = {
      16: '<100.fwGIR',
      17: '<100.strokesGained',
      18: '<100.shotProx',
      19: '<150.fwGIR',
      20: '<150.fwStrokesGained',
      21: '<150.fwShotProx',
      22: '<150.roughGIR',
      23: '<150.roughStrokesGained',
      24: '<150.roughShotProx',
      25: '>150 - Rough.roughGIR',
      26: '>150 - Rough.roughStrokesGained',
      27: '>150 - Rough.roughShotProx',
      28: '<200.fwGIR',
      29: '<200.fwStrokesGained',
      30: '<200.fwShotProx',
      31: '>200.fwGIR',
      32: '>200.fwStrokesGained',
      33: '>200.fwShotProx'
    };
    
    for (let i = 16; i <= 33; i++) {
      const keyPath = approachMetricMapping[i];
      if (!keyPath) continue;
      
      const [category, metric] = keyPath.split('.');
      const value = approachMetrics[category]?.[metric];
      
      // Approach metrics can legitimately be zero; treat numeric values as data
      if (typeof value === 'number' && !isNaN(value)) {
        metricsWithData.add(i);
      }
    }
  }
  
  return metricsWithData;
}

// Ported to test
function calculateHistoricalAverages(historicalRounds, similarRounds = [], puttingRounds = [], options = {}) {
  // Default options
  const {
    lambda = 0.2, // Exponential decay factor for recency
    lambdaPutting = 0.3, // Faster decay for putting-specific data
    minHistoricalPoints = 2, // Min points needed for historical data (lowered from 10)
    minSimilarPoints = 2, // Min points needed for similar course data (lowered from 5)
    minPuttingPoints = 2, // Min points needed for putting-specific data (lowered from 5)
    similarWeight = 0.6, // Weight for similar course data (0.0-1.0)
    puttingWeight = 0.7 // Weight for putting-specific data (0.0-1.0)
  } = options;
  
  // Track metrics with insufficient data for notes
  const lowDataMetrics = [];
 
  const indexToMetricKey = {
    0: 'strokesGainedTotal',
    1: 'drivingDistance',
    2: 'drivingAccuracy',
    3: 'strokesGainedT2G',
    4: 'strokesGainedApp',
    5: 'strokesGainedArg',
    6: 'strokesGainedOTT',
    7: 'strokesGainedPutt',
    8: 'greensInReg',
    9: 'scrambling',
    10: 'greatShots',
    11: 'poorShots',
    12: 'scoringAverage',
    13: 'birdiesOrBetter',
    14: 'fairwayProx',
    15: 'roughProx'
  };
 
  // Log all configuration parameters at the start
  console.log(`
                === HISTORICAL AVERAGES CALCULATION CONFIG ===
                - Lambda (recency factor): ${lambda}
                - Lambda Putting (recency factor): ${lambdaPutting}
                - Min data points: Historical=${minHistoricalPoints}, Similar=${minSimilarPoints}, Putting=${minPuttingPoints}
                - Blending weights: Similar=${similarWeight.toFixed(2)}, Putting=${puttingWeight.toFixed(2)}
                - Available rounds: Historical=${historicalRounds.length}, Similar=${similarRounds.length}, Putting=${puttingRounds.length}
                =============================================`);
 
  // Track which data sources were used for each metric
  const metricSources = {
    historical: 0,
    similar: 0,
    putting: 0,
    blended: 0,
    noData: 0
  };
 
  // Specific putting-related indexes
  const puttingRelatedIndexes = new Set([7]); // SG Putting
 
  // Create standardized date strings for consistent sorting
  const prepareRounds = (rounds) => {
    return rounds
      .filter(round => round && round.metrics)
      .sort((a, b) => {
        // First convert dates to ISO string format for consistent comparison
        const dateA = new Date(a.date).toISOString();
        const dateB = new Date(b.date).toISOString();
        
        // Primary sort by date (newest first)
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        // Secondary sort by round number (if dates are identical)
        return b.roundNum - a.roundNum;
      });
  }
 
  // Calculate weighted average for a set of values
  const calculateWeightedAverage = (values, decayFactor = lambda) => {
    if (!values || values.length === 0) return null;
    
    let sumWeighted = 0;
    let sumWeights = 0;
    
    values.forEach((value, i) => {
      const weight = Math.exp(-decayFactor * i); // Newest first
      sumWeighted += weight * value;
      sumWeights += weight;
    });
    
    return sumWeights > 0 ? sumWeighted / sumWeights : null;
  };
 
    // Helper function to calculate average for a specific metric
  const calculateMetricAverage = (rounds, metricKey, isVirtualMetric = false, minPoints = 0, decayFactor = lambda) => {
    if (!rounds || rounds.length < minPoints) return null;
    
    // Extract values based on metric type
    let values = [];
    
    if (isVirtualMetric) {
      // Special case for birdies or better
      values = rounds
        .map(round => (round.metrics.eagles || 0) + (round.metrics.birdies || 0))
        .filter(v => typeof v === 'number' && !isNaN(v));
    } else {
      // Normal metrics
      values = rounds
        .map(round => round.metrics?.[metricKey])
        .filter(v => typeof v === 'number' && !isNaN(v));
    }
    
    if (values.length < minPoints) return null;
    
    // Convert percentages if needed
    const isPercentage = ['drivingAccuracy', 'greensInReg', 'scrambling'].includes(metricKey);
    const adjustedValues = values.map(v => {
      if (!isPercentage) return v;
      return v > 1 ? v/100 : v; // Convert 0-100% to 0-1 decimal
    });
    
    return calculateWeightedAverage(adjustedValues, decayFactor);
  };
 
  // Prepare all rounds datasets
  const sortedHistorical = prepareRounds(historicalRounds);
  const sortedSimilar = prepareRounds(similarRounds);
  const sortedPutting = prepareRounds(puttingRounds);
  
  // Log the number of rounds for each category
  const playerName = sortedHistorical.length > 0 ? sortedHistorical[0].playerName : 'Unknown';
  console.log(`${playerName}: Prepared ${sortedHistorical.length} historical, ${sortedSimilar.length} similar, and ${sortedPutting.length} putting rounds`);
 
  // Initialize results array
  const results = Array(16).fill(0);
 
  // For each metric, calculate the appropriate weighted average
  for (let index = 0; index < 16; index++) {
    const metricKey = indexToMetricKey[index];
    const isVirtualMetric = index === 13; // Birdies or Better
    const isPuttingMetric = puttingRelatedIndexes.has(index);
    
    // STEP 1: Get averages from each data source if available
    const historicalAvg = calculateMetricAverage(
      sortedHistorical, 
      metricKey, 
      isVirtualMetric, 
      minHistoricalPoints
    );
    
    const similarAvg = calculateMetricAverage(
      sortedSimilar, 
      metricKey, 
      isVirtualMetric, 
      minSimilarPoints
    );
    
    const puttingAvg = isPuttingMetric ? calculateMetricAverage(
      sortedPutting, 
      metricKey, 
      isVirtualMetric, 
      minPuttingPoints,
      lambdaPutting
    ) : null;
    
    // Add detailed logging for Scheffler's putting metric calculation
    if (playerName === 'Scheffler, Scottie' && isPuttingMetric) {
      console.log(`[SNAPSHOT] GAS SCHEFFLER ${metricKey} RAW DATA:`);
      console.log(`[SNAPSHOT]   Putting rounds: ${sortedPutting.length}`);
      sortedPutting.forEach((r, i) => {
        console.log(`[SNAPSHOT]     Round ${i}: ${metricKey}=${r.metrics?.[metricKey]}, date=${r.date}, event=${r.eventId}, roundNum=${r.roundNum}`);
      });
      console.log(`[SNAPSHOT]   Historical rounds: ${sortedHistorical.length}`);
      const histValues = sortedHistorical.map(r => r.metrics?.[metricKey]).filter(v => typeof v === 'number' && !isNaN(v));
      console.log(`[SNAPSHOT]     Valid ${metricKey} count: ${histValues.length}`);
      console.log(`[SNAPSHOT]     Valid ${metricKey} values: [${histValues.join(', ')}]`);
      console.log(`[SNAPSHOT]   Calculated puttingAvg: ${puttingAvg}`);
      console.log(`[SNAPSHOT]   Calculated historicalAvg: ${historicalAvg}`);
    }
    
    // Log what data we have available
    console.log(`${playerName} - Metric ${metricKey}: ` + 
      `Historical=${historicalAvg !== null ? historicalAvg.toFixed(3) : 'n/a'}, ` +
      `Similar=${similarAvg !== null ? similarAvg.toFixed(3) : 'n/a'}, ` +
      `Putting=${puttingAvg !== null ? puttingAvg.toFixed(3) : 'n/a'}`);
    
    // STEP 2: Determine the final value based on available data and weights
    let finalValue = 0;
    
    if (isPuttingMetric && puttingAvg !== null) {
      if (historicalAvg !== null) {
        // Dynamically adjust putting weight based on data quantity
        const dynamicPuttingWeight = calculateDynamicWeight(
          puttingWeight, 
          sortedPutting.length,
          minPuttingPoints
        );
        
        // Blend putting-specific with historical data
        finalValue = (puttingAvg * dynamicPuttingWeight) + (historicalAvg * (1 - dynamicPuttingWeight));
        
        console.log(`${playerName} - ${metricKey}: BLENDED PUTTING ${puttingAvg.toFixed(3)} × weight ${dynamicPuttingWeight.toFixed(2)} = ${(puttingAvg * dynamicPuttingWeight).toFixed(3)}
          Historical: ${historicalAvg.toFixed(3)} × weight ${(1-dynamicPuttingWeight).toFixed(2)} = ${(historicalAvg * (1-dynamicPuttingWeight)).toFixed(3)}
          Final value: ${finalValue.toFixed(3)}`);
        
        // Add detailed logging for Scheffler
        if (playerName === 'Scheffler, Scottie') {
          console.log(`[SNAPSHOT] SCHEFFLER PUTTING BLEND DETAIL:`);
          console.log(`[SNAPSHOT]   Putting rounds: ${sortedPutting.length}`);
          console.log(`[SNAPSHOT]   Historical rounds: ${sortedHistorical.length}`);
          console.log(`[SNAPSHOT]   Base putting weight: ${puttingWeight}`);
          console.log(`[SNAPSHOT]   Dynamic putting weight: ${dynamicPuttingWeight.toFixed(4)}`);
          console.log(`[SNAPSHOT]   Putting avg: ${puttingAvg.toFixed(6)}`);
          console.log(`[SNAPSHOT]   Historical avg: ${historicalAvg.toFixed(6)}`);
          console.log(`[SNAPSHOT]   Putting component: ${(puttingAvg * dynamicPuttingWeight).toFixed(6)}`);
          console.log(`[SNAPSHOT]   Historical component: ${(historicalAvg * (1-dynamicPuttingWeight)).toFixed(6)}`);
          console.log(`[SNAPSHOT]   Final blended metric 7: ${finalValue.toFixed(6)}`);
        }
        
        metricSources.blended++;
      } else {
        // Just use putting data
        finalValue = puttingAvg;
        console.log(`${playerName} - ${metricKey}: Using putting-specific data only: ${finalValue.toFixed(3)}`);
        metricSources.putting++;
      }
    } else if (similarAvg !== null) {
      // For non-putting metrics, prioritize similar course data if available
      if (historicalAvg !== null) {
        // Dynamically adjust similar course weight based on data quantity
        const dynamicSimilarWeight = calculateDynamicWeight(
          similarWeight, 
          sortedSimilar.length,
          minSimilarPoints
        );
        
        // Blend similar with historical data
        finalValue = (similarAvg * dynamicSimilarWeight) + (historicalAvg * (1 - dynamicSimilarWeight));
        
        console.log(`${playerName} - ${metricKey}: BLENDED: ${similarAvg.toFixed(3)} × weight ${dynamicSimilarWeight.toFixed(2)} = ${(similarAvg * dynamicSimilarWeight).toFixed(3)}
          Historical: ${historicalAvg.toFixed(3)} × weight ${(1-dynamicSimilarWeight).toFixed(2)} = ${(historicalAvg * (1-dynamicSimilarWeight)).toFixed(3)}
          Final value: ${finalValue.toFixed(3)}`);
        
        metricSources.blended++;
      } else {
        // Just use similar data
        finalValue = similarAvg;
        console.log(`${playerName} - ${metricKey}: Using similar course data only: ${finalValue.toFixed(3)}`);
        metricSources.similar++;
      }
    } else if (historicalAvg !== null) {
      // Use historical data only if that's all we have
      finalValue = historicalAvg;
      console.log(`${playerName} - ${metricKey}: Using historical data only: ${finalValue.toFixed(3)}`);
      metricSources.historical++;
    } else {
      // Last resort - try with combined rounds if we don't have enough in any category
      const allRounds = [...sortedHistorical, ...sortedSimilar, ...sortedPutting];
      if (allRounds.length >= minHistoricalPoints) {
        const combinedAvg = calculateMetricAverage(allRounds, metricKey, isVirtualMetric, minHistoricalPoints);
        if (combinedAvg !== null) {
          finalValue = combinedAvg;
          // Check if this is below standard minimum and add note
          const stdMinHistorical = 8; // Standard minimum for historical
          if (allRounds.length < stdMinHistorical) {
            lowDataMetrics.push(`${metricKey} (${allRounds.length} rounds)`);
          }
          console.log(`${playerName} - ${metricKey}: Using combined data (${allRounds.length} rounds): ${finalValue.toFixed(3)}`);
        } else {
          console.log(`${playerName} - ${metricKey}: No data available`);
          metricSources.noData++;
        }
      } else {
        console.log(`${playerName} - ${metricKey}: No data available`);
        metricSources.noData++;
      }
    }
    
    // Store the final calculated value
    results[index] = finalValue;
  }
 
  console.log(`
                === CALCULATION SUMMARY FOR ${playerName} ===
                - Metrics using historical data only: ${metricSources.historical}
                - Metrics using similar course data only: ${metricSources.similar}
                - Metrics using putting course data only: ${metricSources.putting} 
                - Metrics using blended data sources ${metricSources.blended}
                - Metrics with no data available: ${metricSources.noData}
                =======================================`);
 
  return results;
}

// Ported to test
function prepareRankingOutput(processedData) {
  // Constants for ranking calculations
  const CLOSE_SCORE_THRESHOLD = 0.05; // 5% difference threshold for considering scores "close"
  const WAR_WEIGHT = 0.3; // 30% weight given to WAR in the composite score

  console.log(`Preparing ranking output for ${processedData.length} players...`);
  
  // Calculate confidence intervals and composite scores
  const dataWithConfidenceIntervals = processedData.map(player => {
    // Calculate uncertainty based on data coverage (less data = wider interval)
    const dataCoverageUncertainty = Math.max(0.1, 0.5 * (1 - player.dataCoverage));
    
    // Calculate metric volatility - more volatile metrics = wider interval
    const metricVolatility = calculateMetricVolatility(player.metrics, player.trends);
    
    // Combined uncertainty factor
    const uncertaintyFactor = (dataCoverageUncertainty + metricVolatility) / 2;
    
    // Calculate confidence interval margins
    const intervalMargin = uncertaintyFactor * Math.abs(player.weightedScore) * 0.5;
    
    // Calculate composite score that blends weighted score with WAR
    const compositeScore = (player.weightedScore * (1 - WAR_WEIGHT)) + (player.war * WAR_WEIGHT);
    
    return {
      ...player,
      confidenceInterval: {
        low: player.weightedScore - intervalMargin,
        high: player.weightedScore + intervalMargin
      },
      compositeScore // Add the calculated composite score
    };
  });
  
  console.log(`DEBUG: Before sorting - Sample player:`, {
    name: dataWithConfidenceIntervals[0]?.name,
    weightedScore: dataWithConfidenceIntervals[0]?.weightedScore,
    refinedWeightedScore: dataWithConfidenceIntervals[0]?.refinedWeightedScore,
    hasRefined: typeof dataWithConfidenceIntervals[0]?.refinedWeightedScore === 'number'
  });
  
  // Sort primarily by refined weighted score (which includes confidence and data coverage multipliers)
  const sortedData = dataWithConfidenceIntervals.sort((a, b) => {
    // Use refinedWeightedScore if available, fallback to weightedScore
    const scoreA = typeof a.refinedWeightedScore === 'number' ? a.refinedWeightedScore : a.weightedScore;
    const scoreB = typeof b.refinedWeightedScore === 'number' ? b.refinedWeightedScore : b.weightedScore;
    
    // Log first few comparisons
    if (a.name === "Spaun, J.J." || a.name === "Brennan, Michael") {
      console.log(`SORT: ${a.name} (refined: ${scoreA?.toFixed(3)}) vs ${b.name} (refined: ${scoreB?.toFixed(3)})`);
    }
    
    // For exact ties, use WAR directly
    if (scoreA === scoreB) {
      return b.war - a.war;
    }
    
    // For very close scores, use the composite score
    const scoresDifference = Math.abs(scoreA - scoreB);
    if (scoresDifference <= CLOSE_SCORE_THRESHOLD) {
      return b.compositeScore - a.compositeScore;
    }
    
    // Otherwise, sort by refined weighted score (which has confidence applied)
    return scoreB - scoreA;
  });
  
  // Add rank to each player
  let currentRank = 1;
  let lastWeightedScore = null;
  let lastCompositeScore = null;
  
  sortedData.forEach((player, index) => {
    // Use refinedWeightedScore if available, fallback to weightedScore
    const playerScore = typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore : player.weightedScore;
    
    // Check if this player should share a rank with the previous player
    if (index > 0) {
      const prevPlayer = sortedData[index - 1];
      const prevScore = typeof prevPlayer.refinedWeightedScore === 'number' ? prevPlayer.refinedWeightedScore : prevPlayer.weightedScore;
      
      // If refined weighted scores are identical, check if WAR is also identical
      if (playerScore === prevScore && 
          Math.abs(player.war - prevPlayer.war) < 0.01) {
        player.rank = prevPlayer.rank; // Same rank for true ties
      } else {
        player.rank = currentRank;
      }
    } else {
      player.rank = currentRank;
    }
    
    // Update tracking variables
    lastWeightedScore = playerScore;
    lastCompositeScore = player.compositeScore;
    currentRank++;
    
    // Log the ranking details
    console.log(`Rank ${player.rank}: ${player.name} - Score: ${player.weightedScore.toFixed(3)}, Refined: ${playerScore.toFixed(3)}, ` +
                `WAR: ${player.war.toFixed(2)}, Composite: ${player.compositeScore.toFixed(3)}`);
    
    // Log when WAR affected ranking
    if (index > 0) {
      const prevPlayer = sortedData[index - 1];
      const scoresDifference = Math.abs(player.weightedScore - prevPlayer.weightedScore);
      
      if (scoresDifference <= CLOSE_SCORE_THRESHOLD && 
          player.compositeScore !== prevPlayer.compositeScore) {
        // Determine who got the advantage from WAR
        const advantagedPlayer = player.compositeScore > prevPlayer.compositeScore ? player : prevPlayer;
        const disadvantagedPlayer = advantagedPlayer === player ? prevPlayer : player;
        
        console.log(`  WAR Tiebreaker: ${advantagedPlayer.name} (WAR: ${advantagedPlayer.war.toFixed(2)}) outranked ${disadvantagedPlayer.name} (WAR: ${disadvantagedPlayer.war.toFixed(2)})`);
      }
    }
  });
  
  return sortedData;
}

// Ported to test
function calculateMetricVolatility(metrics, trends) {
  if (!metrics || !trends) return 0.5; // Default medium volatility if data missing
  
  // Get the magnitude of trends
  const trendsMagnitude = trends
    .filter(t => typeof t === 'number')
    .map(Math.abs)
    .reduce((sum, val) => sum + val, 0) / Math.max(1, trends.filter(t => typeof t === 'number').length);
  
  // Calculate standard deviation of available metrics as another volatility indicator
  const metricValues = Object.values(metrics).filter(v => typeof v === 'number' && !isNaN(v));
  
  let stdDev = 0;
  if (metricValues.length > 0) {
    const mean = metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;
    const squaredDiffs = metricValues.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / metricValues.length;
    stdDev = Math.sqrt(variance);
  }
  
  // Normalize standard deviation to a 0-1 scale (using a reasonable maximum value)
  const MAX_EXPECTED_STD_DEV = 5.0;
  const normalizedStdDev = Math.min(1, stdDev / MAX_EXPECTED_STD_DEV);
  
  // Normalize trends magnitude to a 0-1 scale
  const MAX_EXPECTED_TREND = 0.05;
  const normalizedTrendMagnitude = Math.min(1, trendsMagnitude / MAX_EXPECTED_TREND);
  
  // Combine both factors, giving more weight to trends
  const volatility = (normalizedTrendMagnitude * 0.7) + (normalizedStdDev * 0.3);
  
  console.log(`Volatility calculation: Trend magnitude = ${trendsMagnitude.toFixed(4)}, StdDev = ${stdDev.toFixed(2)}, Final volatility = ${volatility.toFixed(2)}`);
  
  // Return a value from 0.1 to 0.9 (never completely certain or uncertain)
  return 0.1 + (volatility * 0.8);
}


function writeRankingOutput(outputSheet, sortedData, metricLabels, groups, groupStats) {
  const TREND_DIRECTIONS = {
    // Metric Index: [positiveIsGood, neutralThreshold]
    0: [true, 0.01],    // strokesGainedTotal 
    1: [true, 0.05],    // drivingDistance (higher better)
    2: [true, 0.02],    // drivingAccuracy (%)
    3: [true, 0.01],    // strokesGainedT2G
    4: [true, 0.01],    // strokesGainedApp
    5: [true, 0.01],    // strokesGainedArg
    6: [true, 0.01],    // strokesGainedOTT
    7: [true, 0.01],    // strokesGainedPutt
    8: [true, 0.02],    // greensInReg (%)
    9: [true, 0.02],   // scrambling (%)
    10: [true, 0.02],   // greatShots
    11: [false, 0.02],  // poorShots (lower better) <-- WAS INDEX 12, NOW 11
    12: [false, 0.01],  // scoringAverage (lower better)
    13: [true, 0.02],   // birdiesOrBetter
    14: [true, 0.02],   // birdieChancesCreated
    15: [false, 0.01],  // fairwayProx (yards)
    16: [false, 0.01]   // roughProx (yards)
  };

  // Clear existing data and formats
    outputSheet.clear().clearFormats();

  // Constants
  const START_ROW = 5;
  const START_COL = 2; // Column B
  const NOTES_COL = START_COL -1;
  const HISTORICAL_METRICS = 17;
  const APPROACH_METRICS = 18;
  const STANDARD_COLS = 6;
  const TREND_COL_OFFSET = START_COL + STANDARD_COLS + 2;

  // Validate metrics
  if (metricLabels.length !== 35) throw new Error('Invalid metric labels');

  // Build headers
  const headers = [
    'Rank', 'DG ID', 'Player Name', 'Top 5', 'Top 10', 'Weighted Score', 'Past Perf. Mult.',
    ...metricLabels.slice(0, HISTORICAL_METRICS).flatMap(m => [m, `${m} Trend`]),
    ...metricLabels.slice(HISTORICAL_METRICS),
      'WAR' // ADDED: Header for Birdie Chances Created & Wins Above Replacement (WAR)
  ];

  // Write headers
  outputSheet.getRange(START_ROW, START_COL, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setWrap(true);

  // Write notes header
  outputSheet.getRange(START_ROW, NOTES_COL, 1, 1)
    .setValue("Expected Peformance Notes")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setWrap(true);

  // In the writeRankingOutput function:
  const notesData = [];
  const rowData = [];

  sortedData.forEach(player => {
    // Generate notes for column A
    notesData.push([generatePlayerNotes(player, groups, groupStats)]);
    
    // Validate player data and provide fallbacks if missing
    if (!player) {
      console.error("Invalid player data (undefined)");
      rowData.push(Array(headers.length).fill("")); // Empty row
      return; // Skip the rest of this iteration
    }
    
    if (!player.metrics) {
      console.error(`Missing metrics for player ${player.name || "unknown"}`);
      player.metrics = Array(35).fill(0); // Default metrics array
    }
    
    if (!player.trends) {
      console.error(`Missing trends for player ${player.name || "unknown"}`);
      player.trends = Array(17).fill(0); // Default trends array
    }

    // Base information
    const weightedScoreValue = (typeof player.weightedScore === 'number' && !isNaN(player.weightedScore)) 
      ? player.weightedScore.toFixed(2) 
      : "0.00"; // Fallback if weightedScore is missing
    
    if (!weightedScoreValue || weightedScoreValue === "0.00") {
      console.warn(`Missing or zero weightedScore for ${player.name}: ${player.weightedScore}`);
    }
    
    const base = [
      player.rank,
      player.dgId,
      player.name,
      Number(player.top5 || 0),
      Number(player.top10 || 0),
      weightedScoreValue,
      (player.pastPerformanceMultiplier || 1.0).toFixed(3) // Display the multiplier, defaulting to 1.0
    ];

    // Historical metrics with trends
    const historical = player.metrics.slice(0, 17).flatMap((val, idx) => {
      // For Birdie Chances Created at index 14, use a zero trend
      if (idx === 14) {
        return [
          formatMetricValue(val, idx),
          "0.000" // No trend for BCC
        ];
      }
      
      // For other metrics, map to the correct trend index
      const trendIdx = idx < 14 ? idx : idx - 1;
      
      // Ensure trends array exists and has valid values
      const trendValue = (player.trends && player.trends[trendIdx] !== undefined) 
        ? player.trends[trendIdx].toFixed(3) 
        : "0.000";

      return [
        formatMetricValue(val, idx),
        trendValue
      ];
    });

    // Approach metrics - fixed the missing return
    const approach = player.metrics.slice(17).map((val, idx) => 
      formatMetricValue(val, idx + 17)
    );

    // Return WAR
    const war = [player.war.toFixed(2)];

    rowData.push([...base, ...historical, ...approach, ...war]);
  });

  // Write data
  if (notesData.length > 0) {
    outputSheet.getRange(START_ROW + 1, NOTES_COL, notesData.length)
      .setValues(notesData)
      .setHorizontalAlignment("center")
      .setWrap(true);
  }
  
  if (rowData.length > 0) {
    outputSheet.getRange(START_ROW + 1, START_COL, rowData.length, headers.length)
      .setValues(rowData)
      .setHorizontalAlignment("center");
  }

  // ===== FORMATTING =====

  // Set column A width
  outputSheet.setColumnWidths(NOTES_COL, 1, 250);
    // Set columns 1,2,4,5 to 70px
  outputSheet.setColumnWidths(START_COL, 2, 70); // Columns 1-2
  outputSheet.setColumnWidths(START_COL + 3, 2, 70); // Columns 4-5

  // Set column 3 to 140px
  outputSheet.setColumnWidth(START_COL + 2, 140); // Column 3
  outputSheet.setColumnWidths(START_COL + STANDARD_COLS + 1, headers.length - STANDARD_COLS + 1, 110);

    // Dynamic Range
  const dataRange = outputSheet.getDataRange();
  const numColumns = dataRange.getNumColumns();

  // Calculate the WAR Column Number
   const warColumn = numColumns - 1;
   outputSheet.setColumnWidth(warColumn, 75);

  // 1. Percentage columns (number formatting only)
  const percentageColumns = [
    13,  // L - Driving Accuracy (data column)
    25,  // X - Greens in Regulation (data column)
    27,  // Z - Scrambling (data column)
    43,  // AN - Approach <100 GIR
    46,  // AQ - Approach <150 FW GIR
    49,  // AT - Approach <150 Rough GIR
    52,  // AW - Approach >150 Rough GIR
    55,  // AZ - Approach <200 FW GIR
    58   // BC - Approach >200 FW GIR
  ];

  percentageColumns.forEach(col => {
    outputSheet.getRange(START_ROW + 1, col, outputSheet.getLastRow() - START_ROW, 1)
      .setNumberFormat('0.00%')
      .setHorizontalAlignment('center');
  });

  // 2. Whole number columns (formatting only)
  const wholeNumberColumns = [5, 6];
  wholeNumberColumns.forEach(col => {
    outputSheet.getRange(START_ROW + 1, col, outputSheet.getLastRow() - START_ROW, 1)
      .setNumberFormat('0')
      .setHorizontalAlignment('center');
  });

  // 3. Historical metrics (z-score background coloring)
  const historicalColumns = Array.from({length: HISTORICAL_METRICS}, (_, i) => 
    START_COL + STANDARD_COLS + 1 + (i * 2)
  );
  historicalColumns.forEach((col, metricIndex) => {
    const range = outputSheet.getRange(START_ROW + 1, col, outputSheet.getLastRow() - START_ROW, 1);
    const [positiveIsGood] = TREND_DIRECTIONS[metricIndex] || [true];
    
    const rawValues = range.getValues();
    const values = rawValues.map(row => parseFloat(row[0])).filter(v => !isNaN(v));
    
    if (values.length >= 5) {
      const mean = values.reduce((a, b) => a + b) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length);
      
      if (stdDev > 0) {
        const backgrounds = rawValues.map(row => {
          const value = parseFloat(row[0]);
          if (isNaN(value)) return ['#FFFFFF'];
          
          // Zero values get gray background
          if (value === 0) return ['#D3D3D3'];
          
          const z = (value - mean) / stdDev;
          const directionalZ = positiveIsGood ? z : -z;
          
          if (directionalZ > 2) return ['#006837'];
          if (directionalZ > 1) return ['#31a354'];
          if (directionalZ > 0.5) return ['#a1d99b'];
          if (directionalZ < -2) return ['#a50f15'];
          if (directionalZ < -1) return ['#de2d26'];
          if (directionalZ < -0.5) return ['#fb6a4a'];
          return ['#FFFFFF'];
        });
        range.setBackgrounds(backgrounds);
      }
    }
    // Only set number format if this column is not in percentageColumns
    if (!percentageColumns || !percentageColumns.includes(col)) {
      range.setNumberFormat('0.000');
    }
  });

  // 4. Approach metrics (z-score background coloring)
  const APPROACH_DIRECTIONS = {
    // Metric Index: [positiveIsGood, threshold] (0-17)
    0: [true, 0.02],   // Approach <100 GIR
    1: [true, 0.02],   // Approach <100 SG
    2: [false, 0.01],   // Approach <100 Prox
    3: [true, 0.02],   // Approach <150 GIR
    4: [true, 0.02],   // Approach <150 SG
    5: [false, 0.01],   // Approach <150 FW Prox
    6: [true, 0.02],  // Approach <150 Rough GIR
    7: [true, 0.02],  // Approach <150 Rough SG
    8: [false, 0.01],   // Approach <150 Rough Prox
    9: [true, 0.02],   // Approach >150 Rough GIR
    10: [true, 0.02],  // Approach >150 Rough SG
    11: [false, 0.01],  // Approach >150 Rough Prox
    12: [true, 0.02],  // Approach <200 GIR
    13: [true, 0.02],  // Approach <200 SG
    14: [false, 0.01],  // Approach <200 Prox
    15: [true, 0.02],  // Approach >200 GIR
    16: [true, 0.02],  // Approach >200 SG
    17: [false, 0.01]   // Approach >200 Prox
  };

  const approachStartCol = START_COL + STANDARD_COLS + 1 + (HISTORICAL_METRICS * 2);
  const approachColumns = Array.from({length: APPROACH_METRICS}, (_, i) => approachStartCol + i);

  approachColumns.forEach((col, approachIndex) => {
    const range = outputSheet.getRange(START_ROW + 1, col, outputSheet.getLastRow() - START_ROW, 1);
    const [positiveIsGood] = APPROACH_DIRECTIONS[approachIndex] || [true];
    
    const rawValues = range.getValues();
    // Filter to non-NaN and non-zero values only (0 means no data)
    const values = rawValues.map(row => parseFloat(row[0])).filter(v => !isNaN(v) && v !== 0);
    
    if (values.length >= 5) {
      const mean = values.reduce((a, b) => a + b) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length);
      
      if (stdDev > 0) {
        const backgrounds = rawValues.map(row => {
          const value = parseFloat(row[0]);
          if (isNaN(value)) return ['#FFFFFF'];
          
          // Zero values get gray background (no data)
          if (value === 0) return ['#D3D3D3'];
          
          const z = (value - mean) / stdDev;
          const directionalZ = positiveIsGood ? z : -z;
          
          if (directionalZ > 2) return ['#006837'];
          if (directionalZ > 1) return ['#31a354'];
          if (directionalZ > 0.5) return ['#a1d99b'];
          if (directionalZ < -2) return ['#a50f15'];
          if (directionalZ < -1) return ['#de2d26'];
          if (directionalZ < -0.5) return ['#fb6a4a'];
          return ['#FFFFFF'];
        });
        range.setBackgrounds(backgrounds);
      }
    }
    // Set appropriate number format
    const isPercentage = percentageColumns.includes(col);
    range.setNumberFormat(isPercentage ? '0.00%' : '0.000');
  });

  // ===== NEW TREND FORMATTING LOGIC =====
  const trendColumns = Array.from({length: HISTORICAL_METRICS}, (_, i) => 
    TREND_COL_OFFSET + (i * 2)
  );

  // Modified trend formatting section
  trendColumns.forEach((col, metricIndex) => {
  const [positiveIsGood, threshold] = TREND_DIRECTIONS[metricIndex] || [true, 0.01];
  const range = outputSheet.getRange(START_ROW + 1, col, outputSheet.getLastRow() - START_ROW, 1);
  const values = range.getValues();
  
  // Convert to 2D array format
  const backgrounds = values.map(row => {
    const value = row[0];
    if (value === '' || isNaN(value)) return ['#FFFFFF'];
    
    const absValue = Math.abs(value);
    if (absValue < threshold) return ['#FFFFFF'];
    
    return [value > 0 ? 
      (positiveIsGood ? '#E6F4EA' : '#FCE8E8') : 
      (positiveIsGood ? '#FCE8E8' : '#E6F4EA')];
  });

  const textColors = values.map(row => {
    const value = row[0];
    if (value === '' || isNaN(value)) return ['#000000'];
    
    const absValue = Math.abs(value);
    if (absValue < threshold) return ['#000000'];
    
    return [value > 0 ? 
      (positiveIsGood ? '#137333' : '#A50E0E') : 
      (positiveIsGood ? '#A50E0E' : '#137333')];
  });

  // Apply formatting
  range.setBackgrounds(backgrounds)
       .setFontColors(textColors)
       .setNumberFormat('0.000');
  });
  removeProtections();
}

function formatMetricValue(value, index) {
  // Map to 0-based metric indices (not columns)
  const percentageIndices = [
    2,   // Driving Accuracy
    8,   // Greens in Regulation
    9,   // Scrambling
    16,  // Approach <100 GIR
    19,  // Approach <150 FW GIR
    22,  // Approach <150 Rough GIR
    25,  // Approach >150 Rough GIR
    28,  // Approach <200 FW GIR
    31   // Approach >200 FW GIR
  ];

  // Return raw numbers for percentage columns (formatting handled at sheet level)
  return percentageIndices.includes(index) ? value : Number(value.toFixed(3));
}

// Ported to test
function cleanMetricValue(value, isPercentage = false) {
  let numericValue = typeof value === 'string' 
    ? parseFloat(value.replace(/[^0-9.]/g, '')) 
    : Number(value);

  if (isNaN(numericValue)) {
    console.warn('Invalid value cleaned to 0:', value);
    numericValue = 0;
  }

  // Handle percentage normalization if needed
  if (isPercentage && numericValue > 1) {
    return numericValue / 100;
  }
  return numericValue;
}

// Helper function to normalize metric names for comparison
// Ported to test
function normalizeMetricName(name) {
  return String(name).toLowerCase()
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/strokes(gained)?/g, 'sg') // Handle strokes gained variations
    .replace(/proximity/g, 'prox') // Standardize proximity
    .replace(/greens(in)?reg(ulation)?/g, 'gir') // Handle GIR variations
    .replace(/approach/g, 'app') // Standardize approach
    .replace(/&/g, 'and') // Handle ampersands
    .replace(/[<>]/g, ''); // Remove angle brackets
}

// Enhanced player notes function that evaluates against key performance indicators
// Ported to test
function generatePlayerNotes(player, groups, groupStats) {
  const notes = [];
  
  // 1. WAR indicator with emoji
  if (player.war >= 1.0) {
    notes.push("⭐ Elite performer");
  } else if (player.war >= 0.5) {
    notes.push("↑ Above average");
  } else if (player.war <= -0.5) {
    notes.push("↓ Below field average");
  }
  
  // 2. Find the most important metrics based on weights
  // Extract all metrics across groups and sort by weight
  const allMetrics = [];
  groups.forEach(group => {
    group.metrics.forEach(metric => {
      allMetrics.push({
        name: metric.name,
        index: metric.index,
        weight: metric.weight,
        group: group.name
      });
    });
  });
  
  // Sort by weight descending to find the most important metrics
  const keyMetrics = allMetrics
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5); // Top 5 most important metrics
  
  // 3. Evaluate player against key metrics
  const strengths = [];
  const weaknesses = [];
  
  keyMetrics.forEach(metric => {
    // Skip if we don't have the metric value or stats
    if (!player.metrics || !player.metrics[metric.index] || 
        !groupStats || !groupStats[metric.group] || 
        !groupStats[metric.group][metric.name]) {
      return;
    }
    
    const playerValue = player.metrics[metric.index];
    const mean = groupStats[metric.group][metric.name].mean;
    const stdDev = groupStats[metric.group][metric.name].stdDev;
    
    // Calculate z-score
    const zScore = (playerValue - mean) / (stdDev || 0.001);
    
    // Determine if this is a positive or negative metric
    // For most metrics, higher is better (except these specific ones)
    const isNegativeMetric = metric.name.includes("Poor") || 
                           metric.name.includes("Scoring Average") ||
                           metric.name.includes("Prox");
    
    // Adjust z-score direction based on metric type
    const adjustedZScore = isNegativeMetric ? -zScore : zScore;
    
    // Classify as strength or weakness
    if (adjustedZScore >= 0.75) {
      // Simplify metric names for display
      const displayName = metric.name
        .replace("strokesGained", "SG")
        .replace("drivingDistance", "Distance")
        .replace("drivingAccuracy", "Accuracy")
        .replace("greensInReg", "GIR")
        .replace("birdiesOrBetter", "Birdies");
      
      strengths.push({
        name: displayName,
        score: adjustedZScore,
        weight: metric.weight
      });
    } else if (adjustedZScore <= -0.75) {
      const displayName = metric.name
        .replace("strokesGained", "SG")
        .replace("drivingDistance", "Distance")
        .replace("drivingAccuracy", "Accuracy")
        .replace("greensInReg", "GIR")
        .replace("birdiesOrBetter", "Birdies");
      
      weaknesses.push({
        name: displayName,
        score: adjustedZScore,
        weight: metric.weight
      });
    }
  });
  
  // 4. Create course fit note based on alignment with key metrics
  // Sort strengths by weighted z-score
  strengths.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
  
  // Add strengths to notes
  if (strengths.length > 0) {
    const strengthsText = strengths
      .slice(0, 2)
      .map(s => s.name)
      .join(", ");
    notes.push(`💪 ${strengthsText}`);
  }
  
  // Add note about course fit based on alignment of strengths with key metrics
  const totalKeyWeight = keyMetrics.reduce((sum, m) => sum + m.weight, 0);
  const playerStrengthWeight = strengths.reduce((sum, s) => {
    const matchingKeyMetric = keyMetrics.find(km => km.name.includes(s.name) || s.name.includes(km.name));
    return sum + (matchingKeyMetric ? matchingKeyMetric.weight : 0);
  }, 0);
  
  const fitPercentage = totalKeyWeight > 0 ? (playerStrengthWeight / totalKeyWeight) * 100 : 0;
  
  if (fitPercentage >= 50) {
    notes.push("✅ Strong course fit");
  } else if (fitPercentage >= 25) {
    notes.push("👍 Good course fit");
  } else if (weaknesses.length > 0 && weaknesses.some(w => w.weight > 0.1)) {
    notes.push("⚠️ Poor course fit");
  }
  
  // 5. Significant trends
  const trendMetricNames = [
    "Total game", "Driving", "Accuracy", "Tee-to-green", 
    "Approach", "Around green", "Off tee", "Putting",
    "GIR", "Scrambling", "Great shots", "Poor shots", 
    "Scoring", "Birdies"
  ];
  
  // Find most significant trend
  let strongestTrend = null;
  let strongestValue = 0;
  
  player.trends?.forEach((trend, i) => {
    if (Math.abs(trend) > Math.abs(strongestValue)) {
      strongestValue = trend;
      strongestTrend = {
        metric: i,
        value: trend
      };
    }
  });
  
  if (strongestTrend && Math.abs(strongestTrend.value) > 0.1) {
    const trendDirection = strongestTrend.value > 0 ? "↑" : "↓";
    const metricName = trendMetricNames[strongestTrend.metric] || "Overall";
    notes.push(`${trendDirection} ${metricName}`);
  }
  
  // 6. Data confidence warning
  if (player.dataCoverage < 0.75) {
    notes.push(`⚠️ Limited data (${Math.round(player.dataCoverage*100)}%)`);
  }
  
  // 7. Insufficient rounds note
  // Check if player has fewer rounds than standard thresholds (10 for historical, 5 for similar/putting)
  if (player.roundsCount && player.roundsCount < 10) {
    notes.push(`📊 Only ${player.roundsCount} rounds`);
  }
  
  // Return formatted notes
  return notes.join(" | ");
}

/**
 * Caches group statistics data for later use in analysis
 * @param {Object} groupStats - Group statistics with mean and stdDev for each metric
 */

// Ported to test
function cacheGroupStats(groupStats) {
  // Add timestamp for expiration checking
  const cacheData = {
    timestamp: new Date().getTime(),
    groupStats: groupStats
  };
  
  // Convert to JSON and store in script properties
  const jsonData = JSON.stringify(cacheData);
  PropertiesService.getScriptProperties().setProperty("groupStatsCache", jsonData);
  console.log("Group statistics cached successfully");
}





