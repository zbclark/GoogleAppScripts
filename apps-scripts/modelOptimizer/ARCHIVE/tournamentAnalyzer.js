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

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('../core/modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = ROOT_DIR;
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');
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

function sigmoid(value) {
  if (value < -50) return 0;
  if (value > 50) return 1;
  return 1 / (1 + Math.exp(-value));
}

function isLowerBetterMetric(metricName) {
  return metricName.includes('Prox') || metricName === 'Scoring Average' || metricName === 'Poor Shots';
}

function resolveMetricValue(metrics, metricName) {
  switch (metricName) {
    case 'SG Total':
      return metrics.sgTotal;
    case 'SG T2G':
      return metrics.sgT2g;
    case 'SG Approach':
      return metrics.sgApp;
    case 'SG Around Green':
      return metrics.sgArg;
    case 'SG OTT':
      return metrics.sgOtt;
    case 'SG Putting':
      return metrics.sgPutt;
    case 'Driving Distance':
      return metrics.drivingDist;
    case 'Driving Accuracy':
      return metrics.drivingAcc;
    case 'Greens in Regulation':
    case 'GIR':
      return metrics.gir;
    case 'Scrambling':
      return metrics.scrambling;
    case 'Great Shots':
      return metrics.greatShots;
    case 'Poor Shots':
      return metrics.poorShots;
    case 'Scoring Average':
      return metrics.score;
    case 'Birdies':
      return metrics.birdies;
    case 'Eagles or Better':
      return metrics.eaglesOrBetter;
    case 'Birdies or Better':
      return (metrics.birdies || 0) + (metrics.eaglesOrBetter || 0);
    case 'Birdie Chances Created':
      return metrics.birdieChancesCreated ?? 0;
    case 'Fairway Proximity':
      return metrics.proxFw;
    case 'Rough Proximity':
      return metrics.proxRgh;
    case 'Approach <100 GIR':
      return metrics.approach_50_100_gir;
    case 'Approach <100 SG':
      return metrics.approach_50_100_sg;
    case 'Approach <100 Prox':
      return metrics.approach_50_100_prox;
    case 'Approach <150 FW GIR':
      return metrics.approach_100_150_gir;
    case 'Approach <150 FW SG':
      return metrics.approach_100_150_sg;
    case 'Approach <150 FW Prox':
      return metrics.approach_100_150_prox;
    case 'Approach <150 Rough GIR':
      return metrics.approach_under_150_rgh_gir;
    case 'Approach <150 Rough SG':
      return metrics.approach_under_150_rgh_sg;
    case 'Approach <150 Rough Prox':
      return metrics.approach_under_150_rgh_prox;
    case 'Approach >150 Rough GIR':
      return metrics.approach_over_150_rgh_gir;
    case 'Approach >150 Rough SG':
      return metrics.approach_over_150_rgh_sg;
    case 'Approach >150 Rough Prox':
      return metrics.approach_over_150_rgh_prox;
    case 'Approach <200 FW GIR':
      return metrics.approach_150_200_gir;
    case 'Approach <200 FW SG':
      return metrics.approach_150_200_sg;
    case 'Approach <200 FW Prox':
      return metrics.approach_150_200_prox;
    case 'Approach >200 FW GIR':
      return metrics.approach_over_200_gir;
    case 'Approach >200 FW SG':
      return metrics.approach_over_200_sg;
    case 'Approach >200 FW Prox':
      return metrics.approach_over_200_prox;
    default:
      return null;
  }
}

function computeTopNMetricCorrelations(rankedPlayers, actualResults, metricSchema, topN = 20) {
  const actualMap = new Map(actualResults.map(r => [String(r.dgId), r.finishPosition]));
  return metricSchema.map((schemaEntry, index) => {
    const metricValues = [];
    const outcomes = [];

    rankedPlayers.forEach(player => {
      const finishPosition = actualMap.get(String(player.dgId));
      if (!finishPosition) return;
      const rawValue = player.metrics[index];
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue) || !isFinite(rawValue)) return;
      const adjustedValue = isLowerBetterMetric(schemaEntry.metricName) ? -rawValue : rawValue;
      metricValues.push(adjustedValue);
      outcomes.push(finishPosition <= topN ? 1 : 0);
    });

    return {
      label: `${schemaEntry.groupName}::${schemaEntry.metricName}`,
      correlation: metricValues.length >= 3 ? calculatePearsonCorrelation(metricValues, outcomes) : 0,
      sampleSize: metricValues.length
    };
  });
}

function trainTopNLogisticModel(rankedPlayers, actualResults, metricSchema, topN = 20, options = {}) {
  const { iterations = 400, learningRate = 0.15, l2 = 0.01 } = options;
  const actualMap = new Map(actualResults.map(r => [String(r.dgId), r.finishPosition]));

  const rows = [];
  const labels = [];

  rankedPlayers.forEach(player => {
    const finishPosition = actualMap.get(String(player.dgId));
    if (!finishPosition) return;
    const row = [];
    for (let i = 0; i < metricSchema.length; i++) {
      const rawValue = player.metrics[i];
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue) || !isFinite(rawValue)) return;
      const adjustedValue = isLowerBetterMetric(metricSchema[i].metricName) ? -rawValue : rawValue;
      row.push(adjustedValue);
    }
    rows.push(row);
    labels.push(finishPosition <= topN ? 1 : 0);
  });

  if (rows.length < 10) {
    return { success: false, message: 'Not enough samples for logistic model', samples: rows.length };
  }

  const featureCount = metricSchema.length;
  const means = Array(featureCount).fill(0);
  const stds = Array(featureCount).fill(0);

  rows.forEach(row => {
    row.forEach((value, idx) => {
      means[idx] += value;
    });
  });
  for (let i = 0; i < featureCount; i++) means[i] /= rows.length;
  rows.forEach(row => {
    row.forEach((value, idx) => {
      const diff = value - means[idx];
      stds[idx] += diff * diff;
    });
  });
  for (let i = 0; i < featureCount; i++) {
    stds[i] = Math.sqrt(stds[i] / rows.length) || 1;
  }

  const normalizedRows = rows.map(row => row.map((value, idx) => (value - means[idx]) / stds[idx]));
  let weights = Array(featureCount).fill(0);
  let bias = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const grad = Array(featureCount).fill(0);
    let gradBias = 0;
    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      const linear = row.reduce((sum, value, idx) => sum + value * weights[idx], bias);
      const pred = sigmoid(linear);
      const error = pred - labels[i];
      for (let j = 0; j < featureCount; j++) {
        grad[j] += error * row[j];
      }
      gradBias += error;
    }
    const n = normalizedRows.length;
    for (let j = 0; j < featureCount; j++) {
      grad[j] = grad[j] / n + l2 * weights[j];
      weights[j] -= learningRate * grad[j];
    }
    bias -= learningRate * (gradBias / n);
  }

  const predictions = normalizedRows.map(row => sigmoid(row.reduce((sum, value, idx) => sum + value * weights[idx], bias)));
  const predictedClass = predictions.map(p => (p >= 0.5 ? 1 : 0));
  const accuracy = predictedClass.filter((pred, idx) => pred === labels[idx]).length / labels.length;
  const logLoss = predictions.reduce((sum, p, idx) => {
    const y = labels[idx];
    return sum - (y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
  }, 0) / labels.length;

  const weightRanking = weights
    .map((weight, idx) => ({
      label: `${metricSchema[idx].groupName}::${metricSchema[idx].metricName}`,
      weight,
      absWeight: Math.abs(weight)
    }))
    .sort((a, b) => b.absWeight - a.absWeight)
    .slice(0, 10);

  return {
    success: true,
    samples: rows.length,
    accuracy,
    logLoss,
    bias,
    weights,
    topWeights: weightRanking
  };
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
      birdies: parseFloat(row['birdies']) || 0,
      eaglesOrBetter: parseFloat(row['eagles_or_better']) || 0,
      birdieChancesCreated: null,
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

  const metricSchema = [];
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      metricSchema.push({ groupName: group.name, metricName: metric.name });
    });
  });

  const rankedPlayers = Object.values(currentFieldHistoricalMetrics).map(pm => ({
    dgId: pm.dgId,
    name: pm.playerName,
    metrics: metricSchema.map(entry => resolveMetricValue(pm.metrics, entry.metricName))
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
  const actualMap = new Map(actualResults.map(r => [String(r.dgId), r.finishPosition]));

  metricSchema.forEach((schemaEntry, index) => {
    const metricLabel = `${schemaEntry.groupName}::${schemaEntry.metricName}`;
    const metricValues = [];
    const positions = [];

    rankedPlayers.forEach(player => {
      const actualPosition = actualMap.get(String(player.dgId));
      if (!actualPosition) return;
      const metricValue = player.metrics[index];
      if (typeof metricValue === 'number' && !isNaN(metricValue) && isFinite(metricValue)) {
        metricValues.push(metricValue);
        positions.push(actualPosition);
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

    const expectedDirection = isLowerBetterMetric(schemaEntry.metricName) ? 'negative' : 'positive';
    const directionMatch = (correlation > 0 && expectedDirection === 'positive') ||
                           (correlation < 0 && expectedDirection === 'negative');

    correlations.push({
      group: schemaEntry.groupName,
      metric: schemaEntry.metricName,
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

  const invertedMetrics = correlations
    .filter(corr => shouldInvertMetric(corr.label, corr.correlation))
    .map(corr => corr.label);

  const top20Signal = computeTopNMetricCorrelations(rankedPlayers, actualResults, metricSchema, 20);
  const top20Logistic = trainTopNLogisticModel(rankedPlayers, actualResults, metricSchema, 20);

  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: TOURNAMENT_NAME || `Event ${EVENT_ID}`,
    metricsAnalyzed: correlations.length,
    correlations,
    invertedMetrics,
    top20SignalCorrelations: top20Signal,
    top20LogisticModel: top20Logistic
  };

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const outputPath = path.resolve(OUTPUT_DIR, 'correlation_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Correlation analysis saved to: ${outputPath}`);

  return correlations;
}

// Run analysis
analyzeCorrelations().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

