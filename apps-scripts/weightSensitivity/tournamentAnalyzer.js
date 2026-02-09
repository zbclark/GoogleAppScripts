/**
 * Tournament Analyzer
 * 
 * Main orchestrator for weight optimization workflow:
 * 1. Load historical data (past years + current tournament)
 * 2. Load current field and approach data
 * 3. Compute metric correlations with finish positions
 * 4. Identify inverted metrics (negative correlations)
 * 5. Generate correlation report
*/

const path = require('path');
const fs = require('fs');

const { loadCsv } = require('./utilities/csvLoader');
const { buildPlayerData } = require('./utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('./modelCore');
const { getSharedConfig } = require('./utilities/configParser');
const { buildMetricGroupsFromConfig } = require('./metricConfigBuilder');

const DATA_DIR = __dirname;
const OUTPUT_DIR = path.resolve(__dirname, 'output');
function findFileByPattern(dirPath, patterns) {
  try {
    const files = fs.readdirSync(dirPath);
    for (const pattern of patterns) {
      const matchingFile = files.find(file => {
        if (typeof pattern === 'string') {
          return file.includes(pattern);
        } else if (pattern instanceof RegExp) {
          return pattern.test(file);
        }
        return false;
      });
      if (matchingFile) {
        return path.join(dirPath, matchingFile);
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  return null;
}

// Get eventId and tournament name from command line
const EVENT_ID = process.argv[2] || '6';
const TOURNAMENT_NAME = process.argv[3] || null;

function parseFinishPosition(posStr) {
  if (!posStr) return null;
  const str = String(posStr).trim().toUpperCase();
  if (str.startsWith('T')) {
    const num = parseInt(str.substring(1));
    return Number.isNaN(num) ? null : num;
  }
  if (str === 'CUT' || str === 'WD' || str === 'DQ') return 999;
  const num = parseInt(str);
  return Number.isNaN(num) ? null : num;
}

function loadActualResults(resultsPath) {
  const rawData = loadCsv(resultsPath, { skipFirstColumn: true });
  const results = [];

  rawData.forEach(row => {
    const dgId = String(row['DG ID'] || '').trim();
    if (!dgId) return;

    const finishPosition = parseFinishPosition(row['Finish Position']);
    if (finishPosition === null || finishPosition === 999) return;

    results.push({
      dgId,
      name: row['Player Name'] || '',
      finishPosition
    });
  });
  return results;
}

function shouldInvertMetric(metricLabel, correlation) {
  // Only invert metrics that are "better when lower" AND have negative correlation
  // Metrics that are "better when lower": proximity metrics, scoring average, score
  const lowerIsBetter = metricLabel.includes('Prox') || 
                       metricLabel.includes('Scoring Average') || 
                       metricLabel.includes('Score');
  
  // Only invert if it's a "lower is better" metric AND correlation is negative
  return lowerIsBetter && correlation < 0;
}

function calculatePearsonCorrelation(xValues, yValues) {
  if (xValues.length < 3) return 0; // Need at least 3 data points
  
  const n = xValues.length;
  const meanX = xValues.reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 0;
  
  return numerator / denom;
}

function analyzeMetricCorrelations(rankedPlayers, actualResults, metricConfig, analysisName = 'Metric Analysis') {
  const correlations = [];

  metricConfig.groups.forEach((group, groupIdx) => {
    group.metrics.forEach((metric, localIdx) => {
      const metricLabel = `${group.name}::${metric.name}`;
      const metricValues = [];
      const positions = [];

      rankedPlayers.forEach(player => {
        const actualResult = actualResults.find(r => r.dgId === player.dgId);
        if (!actualResult) return;

        const metricValue = player.metrics[localIdx];
        // Exclude only NaN or blank values, allow zero as valid
        if (typeof metricValue === 'number' && !isNaN(metricValue) && isFinite(metricValue)) {
          metricValues.push(metricValue);
          positions.push(actualResult.finishPosition);
        }
      });

      if (metricValues.length < 3) {
        console.log(`⚠️ ${analysisName} - Metric excluded: ${metricLabel} (Insufficient data points: ${metricValues.length})`);
        if (metricValues.length > 0) {
          console.log(`   Sample values: ${metricValues.slice(0, 5).join(', ')}`);
          console.log(`   Sample positions: ${positions.slice(0, 5).join(', ')}`);
        }
        return;
      }

      const correlation = calculatePearsonCorrelation(metricValues, positions);
      const absCorrelation = Math.abs(correlation);

      // Debug: Show details for zero correlations
      if (Math.abs(correlation) < 0.001) {
        console.log(`🔍 ${analysisName} - ${metricLabel}: correlation = ${correlation.toFixed(6)}`);
        console.log(`   Sample metric values: ${metricValues.slice(0, 10).map(v => v.toFixed(3)).join(', ')}`);
        console.log(`   Sample positions: ${positions.slice(0, 10).join(', ')}`);
        console.log(`   Data points: ${metricValues.length}`);
        console.log(`   Metric value range: ${Math.min(...metricValues).toFixed(3)} to ${Math.max(...metricValues).toFixed(3)}`);
        console.log(`   Position range: ${Math.min(...positions)} to ${Math.max(...positions)}`);
        const uniqueValues = [...new Set(metricValues)];
        console.log(`   Unique metric values: ${uniqueValues.length} (${uniqueValues.slice(0, 5).join(', ')})`);
      }

      // Determine expected direction based on metric name
      let expectedDirection = 'positive'; // Default
      if (metric.name.includes('Prox') || metric.name === 'Scoring Average' || metric.name === 'Poor Shots') {
        expectedDirection = 'negative';
      }

      const directionMatch = (correlation > 0 && expectedDirection === 'positive') ||
                           (correlation < 0 && expectedDirection === 'negative');

      correlations.push({
        group: group.name,
        metric: metric.name,
        label: metricLabel,
        correlation: correlation,
        absCorrelation: absCorrelation,
        sampleSize: metricValues.length,
        expectedDirection: expectedDirection,
        directionMatch: directionMatch,
        strength: absCorrelation > 0.3 ? 'Strong' :
                 absCorrelation > 0.2 ? 'Moderate' :
                 absCorrelation > 0.1 ? 'Weak' : 'Very Weak'
      });

    });
  });

  // Sort by absolute correlation strength
  correlations.sort((a, b) => b.absCorrelation - a.absCorrelation);

  console.log(`\n📈 ${analysisName} - Metric Correlations (n=${rankedPlayers.length}):`);
  console.log('─'.repeat(90));
  console.log('Metric'.padEnd(50) + 'Correlation'.padEnd(15) + 'Strength');
  console.log('─'.repeat(90));

  correlations.forEach(corr => {
    const corrStr = corr.correlation.toFixed(4);
    const strength = corr.strength.padEnd(12);

    console.log(`${corr.label.substring(0, 48).padEnd(50)}${corrStr.padStart(14)} ${strength}`);
  });

  return correlations;
}

async function analyzeCorrelations() {
  const analysisName = 'Metric Analysis';
  console.log('\n' + '='.repeat(90));
  console.log(`TOURNAMENT ANALYZER - CORRELATION ANALYSIS`);
  console.log(`Tournament: ${TOURNAMENT_NAME || `Event ${EVENT_ID}`} | Event ID: ${EVENT_ID}`);
  console.log('='.repeat(90));

  // Load historical data directly
  const dataDir = path.join(DATA_DIR, 'data');

  // Find historical data file
  const historyPath = findFileByPattern(dataDir, ['Historical Data.csv']);
  if (!historyPath) {
    console.error(`❌ Error: Could not find historical data file for ${TOURNAMENT_NAME}`);
    process.exit(1);
  }

  console.log(`\n🔄 Loading historical data from: ${historyPath}`);

  let rawHistoryData;
  try {
    rawHistoryData = loadCsv(historyPath, { skipFirstColumn: true });
    console.log(`✅ Loaded ${rawHistoryData.length} historical records`);
  } catch (err) {
    console.error(`❌ Error loading historical data: ${err.message}`);
    process.exit(1);
  }

  // Filter for current tournament
  const tournamentData = rawHistoryData.filter(row => {
    const eventId = String(row['event_id'] || '').trim();
    return eventId === EVENT_ID;
  });

  console.log(`✅ Found ${tournamentData.length} records for tournament ${TOURNAMENT_NAME} (Event ID: ${EVENT_ID})`);

  if (tournamentData.length === 0) {
    console.error(`❌ No data found for tournament with Event ID ${EVENT_ID}`);
    process.exit(1);
  }

  // Load configuration - find config file for this tournament
  const configPath = findFileByPattern(dataDir, ['Configuration Sheet.csv']);
  if (!configPath) {
    console.error(`❌ Error: Could not find configuration file for ${TOURNAMENT_NAME}`);
    process.exit(1);
  }

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(configPath);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });

  console.log('🔄 Loading tournament data...');

  // Find field data file (could be "Tournament Field" or "Debug - Calculations")
  const fieldPath = findFileByPattern(dataDir, ['Tournament Field.csv', 'Debug - Calculations', 'Field.csv']);

  // Find approach data file
  const approachPath = findFileByPattern(dataDir, ['Approach Skill.csv', 'Approach.csv']);

  console.log(`📊 Historical data: ${path.basename(historyPath)}`);
  if (fieldPath) console.log(`📊 Field data: ${path.basename(fieldPath)}`);
  if (approachPath) console.log(`📊 Approach data: ${path.basename(approachPath)}`);

  let fieldData = [], approachData = [];
  try {
    if (fieldPath) fieldData = loadCsv(fieldPath, { skipFirstColumn: true });
    if (approachPath) approachData = loadCsv(approachPath, { skipFirstColumn: true });
  } catch (err) {
    console.error(`❌ Error loading field/approach data: ${err.message}`);
    console.log('Note: Continuing with available data...');
  }

  // Create actual results from historical data
  const actualResults = [];
  tournamentData.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const finText = String(row['fin_text'] || '').trim();
    const finishPos = parseFinishPosition(finText);

    if (!dgId || finishPos === null || finishPos === 999) return;

    actualResults.push({
      dgId,
      name: row['player_name'] || '',
      finishPosition: finishPos
    });
  });

  console.log(`✅ Found ${actualResults.length} actual results from historical data`);

  // Use real historical metric data instead of mock data
  console.log('🔄 Extracting real historical metrics...');

  // First, get the list of players who actually played in this tournament
  const tournamentPlayerIds = new Set(actualResults.map(r => r.dgId));
  console.log(`📊 Current tournament field: ${tournamentPlayerIds.size} players`);

  // Create player metrics from historical data - ONLY for players in current field
  const playerMetrics = {};

  tournamentData.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();

    // Only include players who played in the current tournament
    if (!tournamentPlayerIds.has(dgId)) return;

    const year = String(row['year'] || '').trim();
    const finText = String(row['fin_text'] || '').trim();
    const finishPos = parseFinishPosition(finText);

    if (!dgId || finishPos === null || finishPos === 999) return;

    const key = `${dgId}_${year}`;

    // Find corresponding approach data for this player
    const approachRow = approachData ? approachData.find(a => String(a['dg_id'] || '').trim() === dgId) : null;

    if (!approachRow) {
      console.log(`⚠️ No approach data found for player ${row['player_name']} (${dgId})`);
    }

    // Extract real metrics from historical data and approach data
    const metrics = {
      sgTotal: parseFloat(row['sg_total']) || 0,
      sgT2g: parseFloat(row['sg_t2g']) || 0,
      sgApp: parseFloat(row['sg_app']) || 0,
      sgArg: parseFloat(row['sg_arg']) || 0,
      sgOtt: parseFloat(row['sg_ott']) || 0,
      sgPutt: parseFloat(row['sg_putt']) || 0,
      drivingAcc: parseFloat(row['driving_acc']) || 0,
      drivingDist: parseFloat(row['driving_dist']) || 0,
      gir: parseFloat(row['gir']) || 0,
      scrambling: parseFloat(row['scrambling']) || 0,
      greatShots: parseFloat(row['great_shots']) || 0,
      poorShots: parseFloat(row['poor_shots']) || 0,
      score: parseFloat(row['score']) || 72, // Use actual score as scoring average
      proxFw: parseFloat(row['prox_fw']) || 0,
      proxRgh: parseFloat(row['prox_rgh']) || 0,
      // Approach metrics from approach data
      approach_50_100_gir: parseFloat(approachRow?.['50_100_fw_gir_rate']) || 0,
      approach_50_100_sg: parseFloat(approachRow?.['50_100_fw_sg_per_shot']) || 0,
      approach_50_100_prox: parseFloat(approachRow?.['50_100_fw_proximity_per_shot']) || 0,
      approach_100_150_gir: parseFloat(approachRow?.['100_150_fw_gir_rate']) || 0,
      approach_100_150_sg: parseFloat(approachRow?.['100_150_fw_sg_per_shot']) || 0,
      approach_100_150_prox: parseFloat(approachRow?.['100_150_fw_proximity_per_shot']) || 0,
      approach_150_200_gir: parseFloat(approachRow?.['150_200_fw_gir_rate']) || 0,
      approach_150_200_sg: parseFloat(approachRow?.['150_200_fw_sg_per_shot']) || 0,
      approach_150_200_prox: parseFloat(approachRow?.['150_200_fw_proximity_per_shot']) || 0,
      approach_over_200_gir: parseFloat(approachRow?.['over_200_fw_gir_rate']) || 0,
      approach_over_200_sg: parseFloat(approachRow?.['over_200_fw_sg_per_shot']) || 0,
      approach_over_200_prox: parseFloat(approachRow?.['over_200_fw_proximity_per_shot']) || 0,
      approach_under_150_rgh_gir: parseFloat(approachRow?.['under_150_rgh_gir_rate']) || 0,
      approach_under_150_rgh_sg: parseFloat(approachRow?.['under_150_rgh_sg_per_shot']) || 0,
      approach_under_150_rgh_prox: parseFloat(approachRow?.['under_150_rgh_proximity_per_shot']) || 0,
      approach_over_150_rgh_gir: parseFloat(approachRow?.['over_150_rgh_gir_rate']) || 0,
      approach_over_150_rgh_sg: parseFloat(approachRow?.['over_150_rgh_sg_per_shot']) || 0,
      approach_over_150_rgh_prox: parseFloat(approachRow?.['over_150_rgh_proximity_per_shot']) || 0
    };

    playerMetrics[key] = {
      dgId,
      year,
      playerName: row['player_name'] || '',
      finishPos,
      metrics
    };
  });

  console.log(`✅ Extracted metrics for ${Object.keys(playerMetrics).length} player-year combinations from current field`);

  // Create current year only dataset for initial analysis
  const currentYearPlayerMetrics = {};
  Object.values(playerMetrics).forEach(pm => {
    if (pm.year === '2026') {
      currentYearPlayerMetrics[`${pm.dgId}_2026`] = pm;
    }
  });

  // Create current tournament field dataset using historical data for current players
  const currentFieldPlayerIds = new Set(Object.values(currentYearPlayerMetrics).map(pm => pm.dgId));
  const currentFieldHistoricalMetrics = {};
  Object.values(playerMetrics).forEach(pm => {
    if (currentFieldPlayerIds.has(pm.dgId) && pm.year !== '2026') {
      currentFieldHistoricalMetrics[`${pm.dgId}_${pm.year}`] = pm;
    }
  });
  console.log(`📊 Current field analysis: ${Object.keys(currentFieldHistoricalMetrics).length} player-year combinations from historical data`);

  // Use historical metrics directly for correlation analysis
  console.log('🔄 Analyzing correlations with historical metrics...');

  // Convert currentFieldHistoricalMetrics to the format expected by correlation analysis
  const rankedPlayers = Object.values(currentFieldHistoricalMetrics).map(pm => ({
    dgId: pm.dgId,
    name: pm.playerName,
    metrics: [
      pm.metrics.drivingDist,     // 0: Driving Distance
      pm.metrics.drivingAcc,      // 1: Driving Accuracy
      pm.metrics.sgOtt,           // 2: SG OTT
      pm.metrics.sgTotal,         // 3: SG Total
      pm.metrics.sgT2g,           // 4: SG T2G
      pm.metrics.sgApp,           // 5: SG Approach
      pm.metrics.sgArg,           // 6: SG Around Green
      pm.metrics.sgPutt,          // 7: SG Putting
      pm.metrics.gir,             // 8: GIR
      pm.metrics.scrambling,      // 9: Scrambling
      pm.metrics.greatShots,      // 10: Great Shots
      pm.metrics.poorShots,       // 11: Poor Shots
      pm.metrics.score,      // 12: Scoring Average
      0,                          // 13: Birdie Chances Created (placeholder)
      pm.metrics.proxFw,          // 14: Fairway Proximity
      pm.metrics.proxRgh,         // 15: Rough Proximity
      // Approach metrics from approach data (matching METRIC_INDICES)
      pm.metrics.approach_50_100_gir,     // 16: Approach <100 GIR
      pm.metrics.approach_50_100_sg,      // 17: Approach <100 SG
      pm.metrics.approach_50_100_prox,    // 18: Approach <100 Prox
      pm.metrics.approach_100_150_gir,    // 19: Approach <150 FW GIR
      pm.metrics.approach_100_150_sg,     // 20: Approach <150 FW SG
      pm.metrics.approach_100_150_prox,   // 21: Approach <150 FW Prox (also Course Management)
      pm.metrics.approach_under_150_rgh_gir,  // 22: Approach <150 Rough GIR
      pm.metrics.approach_under_150_rgh_sg,   // 23: Approach <150 Rough SG
      pm.metrics.approach_under_150_rgh_prox, // 24: Approach <150 Rough Prox (also Course Management)
      pm.metrics.approach_over_150_rgh_gir,   // 25: Approach >150 Rough GIR
      pm.metrics.approach_over_150_rgh_sg,    // 26: Approach >150 Rough SG
      pm.metrics.approach_over_150_rgh_prox,  // 27: Approach >150 Rough Prox (also Course Management)
      pm.metrics.approach_150_200_gir,    // 28: Approach <200 FW GIR
      pm.metrics.approach_150_200_sg,     // 29: Approach <200 FW SG
      pm.metrics.approach_150_200_prox,   // 30: Approach <200 FW Prox (also Course Management)
      pm.metrics.approach_over_200_gir,   // 31: Approach >200 FW GIR
      pm.metrics.approach_over_200_sg,    // 32: Approach >200 FW SG
      pm.metrics.approach_over_200_prox   // 33: Approach >200 FW Prox (also Course Management)
    ]
  }));

  console.log(`✅ Prepared ${rankedPlayers.length} players with historical metrics`);

  /** Debug: Check first few players - show ALL metrics
  console.log('🔍 Debug: First 3 rankedPlayers (showing all metrics):');
  rankedPlayers.slice(0, 3).forEach((p, i) => {
    console.log(`  Player ${i+1}: ${p.name} (${p.dgId})`);
    console.log(`    Total metrics: ${p.metrics.length}`);
    console.log(`    Metrics breakdown:`);
    const metricNames = [
      'drivingDist', 'drivingAcc', 'sgOtt', 'sgTotal', 'sgT2g', 'sgApp', 'sgArg', 'sgPutt',
      'gir', 'scrambling', 'greatShots', 'poorShots', 'score', 'birdieChances',
      'proxFw', 'proxRgh',
      'app_<100_gir', 'app_<100_sg', 'app_<100_prox',
      'app_<150fw_gir', 'app_<150fw_sg', 'app_<150fw_prox',
      'app_<150rgh_gir', 'app_<150rgh_sg', 'app_<150rgh_prox',
      'app_>150rgh_gir', 'app_>150rgh_sg', 'app_>150rgh_prox',
      'app_<200fw_gir', 'app_<200fw_sg', 'app_<200fw_prox',
      'app_>200fw_gir', 'app_>200fw_sg', 'app_>200fw_prox'
    ];
    metricNames.forEach((name, idx) => {
      console.log(`      ${idx}: ${name} = ${p.metrics[idx]}`);
    });
  });
  */

  // Filter to top finishers (e.g., top 10)
  const topFinishers = rankedPlayers.filter(player => {
    const actualResult = actualResults.find(r => r.dgId === player.dgId);
    return actualResult && actualResult.finishPosition <= 10;
  });

  console.log(`✅ Top finishers analyzed: ${topFinishers.length}`);

  // Compute correlations
  console.log('🔄 Computing metric correlations...');
  const correlations = [];

  metricConfig.groups.forEach((group, groupIdx) => {
    group.metrics.forEach((metric, localIdx) => {
      const metricLabel = `${group.name}::${metric.name}`;
      const metricValues = [];
      const positions = [];

      rankedPlayers.forEach(player => {
        const actualResult = actualResults.find(r => r.dgId === player.dgId);
        if (!actualResult) return;

        const metricValue = player.metrics[localIdx];
        // Exclude only NaN or blank values, allow zero as valid
        if (typeof metricValue === 'number' && !isNaN(metricValue) && isFinite(metricValue)) {
          metricValues.push(metricValue);
          positions.push(actualResult.finishPosition);
        }
      });

      if (metricValues.length < 3) {
        console.log(`⚠️ ${analysisName} - Metric excluded: ${metricLabel} (Insufficient data points: ${metricValues.length})`);
        if (metricValues.length > 0) {
          console.log(`   Sample values: ${metricValues.slice(0, 5).join(', ')}`);
          console.log(`   Sample positions: ${positions.slice(0, 5).join(', ')}`);
        }
        return;
      }

      const correlation = calculatePearsonCorrelation(metricValues, positions);
      const absCorrelation = Math.abs(correlation);

      // Debug: Show details for zero correlations
      if (Math.abs(correlation) < 0.001) {
        console.log(`🔍 ${analysisName} - ${metricLabel}: correlation = ${correlation.toFixed(6)}`);
        console.log(`   Sample metric values: ${metricValues.slice(0, 10).map(v => v.toFixed(3)).join(', ')}`);
        console.log(`   Sample positions: ${positions.slice(0, 10).join(', ')}`);
        console.log(`   Data points: ${metricValues.length}`);
        console.log(`   Metric value range: ${Math.min(...metricValues).toFixed(3)} to ${Math.max(...metricValues).toFixed(3)}`);
        console.log(`   Position range: ${Math.min(...positions)} to ${Math.max(...positions)}`);
        const uniqueValues = [...new Set(metricValues)];
        console.log(`   Unique metric values: ${uniqueValues.length} (${uniqueValues.slice(0, 5).join(', ')})`);
      }

      // Determine expected direction based on metric name
      let expectedDirection = 'positive'; // Default
      if (metric.name.includes('Prox') || metric.name === 'Scoring Average' || metric.name === 'Poor Shots') {
        expectedDirection = 'negative';
      }

      const directionMatch = (correlation > 0 && expectedDirection === 'positive') ||
                           (correlation < 0 && expectedDirection === 'negative');

      correlations.push({
        group: group.name,
        metric: metric.name,
        label: metricLabel,
        correlation: correlation,
        absCorrelation: absCorrelation,
        sampleSize: metricValues.length,
        expectedDirection: expectedDirection,
        directionMatch: directionMatch,
        strength: absCorrelation > 0.3 ? 'Strong' :
                 absCorrelation > 0.2 ? 'Moderate' :
                 absCorrelation > 0.1 ? 'Weak' : 'Very Weak'
      });

    });
  });

  // Sort by absolute correlation strength
  correlations.sort((a, b) => b.absCorrelation - a.absCorrelation);

  console.log(`\n📈 ${analysisName} - Metric Correlations (n=${rankedPlayers.length}):`);
  console.log('─'.repeat(90));
  console.log('Metric'.padEnd(50) + 'Correlation'.padEnd(15) + 'Strength');
  console.log('─'.repeat(90));

  correlations.forEach(corr => {
    const corrStr = corr.correlation.toFixed(4);
    const strength = corr.strength.padEnd(12);

    console.log(`${corr.label.substring(0, 48).padEnd(50)}${corrStr.padStart(14)} ${strength}`);
  });

  return correlations;
}

// Run analysis
analyzeCorrelations().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

