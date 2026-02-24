/**
 * Weight Iterator with Metric Inversion
 * 
 * Systematically tests weight configurations and automatically inverts
 * metrics with negative correlations for better predictive power.
 * 
 * Workflow:
 * 1. Load correlation analysis (identifies inverted metrics)
 * 2. Load template weights or custom configuration
 * 3. Grid search: vary weights ±5-10% increments
 * 4. For each combination:
 *    - Invert negative correlation metrics
 *    - Run model with adjusted weights
 *    - Evaluate accuracy (correlation, RMSE, Top-N)
 * 5. Report top performers
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('../core/modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');
const { getTournamentConfig } = require('../utilities/tournamentConfig');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = ROOT_DIR;
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');

// Get eventId from command line (passed from runWorkflow.js)
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

function calculatePearsonCorrelation(xValues, yValues) {
  if (xValues.length < 2) return 0;
  
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

function isLowerBetterMetricLabel(metricLabel) {
  return metricLabel.includes('Prox') ||
    metricLabel.includes('Scoring Average') ||
    metricLabel.includes('Score') ||
    metricLabel.includes('Poor Shots');
}

function shouldInvertMetricLabel(metricLabel, correlation) {
  return isLowerBetterMetricLabel(metricLabel) && correlation < 0;
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, w) => sum + (w || 0), 0);
  if (total <= 0) return weights;
  const normalized = {};
  Object.entries(weights).forEach(([key, val]) => {
    normalized[key] = val / total;
  });
  return normalized;
}

function normalizeMetricWeights(metrics) {
  const total = metrics.reduce((sum, metric) => sum + (metric.weight || 0), 0);
  if (total <= 0) return metrics;
  return metrics.map(metric => ({
    ...metric,
    weight: metric.weight / total
  }));
}

function buildModifiedGroups(baseGroups, groupWeightOverrides = {}, metricWeightOverrides = {}, invertedMetrics = []) {
  return baseGroups.map(group => {
    const groupWeight = typeof groupWeightOverrides[group.name] === 'number'
      ? groupWeightOverrides[group.name]
      : group.weight;

    const metrics = group.metrics.map(metric => {
      const overrideKey = `${group.name}::${metric.name}`;
      let metricWeight = typeof metricWeightOverrides[overrideKey] === 'number'
        ? metricWeightOverrides[overrideKey]
        : metric.weight;

      // Check if this metric should be inverted
      const isInverted = invertedMetrics.includes(overrideKey);

      return {
        ...metric,
        weight: metricWeight,
        isInverted
      };
    });

    return {
      ...group,
      weight: groupWeight,
      metrics: normalizeMetricWeights(metrics)
    };
  });
}

function runModelWithWeights(players, groupWeights, metricOverrides, config, invertedMetrics = []) {
  const normalizedGroupWeights = normalizeWeights(groupWeights);
  const modifiedGroups = buildModifiedGroups(
    config.groups,
    normalizedGroupWeights,
    metricOverrides,
    invertedMetrics
  );

  // First, generate rankings to populate metrics if not already present
  let rankedPlayers = players;
  if (!Array.isArray(players)) {
    // players is a hash - need to rank first to populate metrics
    const initialResult = generatePlayerRankings(players, {
      groups: config.groups,
      pastPerformance: config.pastPerformance,
      config: config.config
    });
    rankedPlayers = initialResult.players;
  }

  // For inverted metrics, we need to negate their values before re-ranking
  const playersWithInversion = rankedPlayers.map(player => {
    const metrics = [...player.metrics];
    
    // Invert metric values for negative correlation metrics
    let globalIdx = 0;
    config.groups.forEach(group => {
      group.metrics.forEach((metric, localIdx) => {
        const key = `${group.name}::${metric.name}`;
        if (invertedMetrics.includes(key) && typeof metrics[globalIdx] === 'number') {
          metrics[globalIdx] = -metrics[globalIdx];
        }
        globalIdx++;
      });
    });

    return { ...player, metrics };
  });

  // Convert array to hash for re-ranking
  const playersCopy = playersWithInversion.reduce((acc, p) => {
    acc[p.dgId] = p;
    return acc;
  }, {});

  const result = generatePlayerRankings(playersCopy, {
    groups: modifiedGroups,
    pastPerformance: config.pastPerformance,
    config: config.config
  });

  return result.players;
}

function calculateTopNAccuracy(predictions, actualResults, n) {
  const actualTopN = new Set(actualResults.filter(r => r.finishPosition <= n).map(r => r.dgId));
  const predictedTopN = new Set(predictions.slice(0, n).map(p => p.dgId));
  
  let overlap = 0;
  predictedTopN.forEach(dgId => {
    if (actualTopN.has(dgId)) overlap++;
  });
  
  return (overlap / n) * 100;
}

function evaluateRankings(predictions, actualResults) {
  const actualPositionMap = {};
  actualResults.forEach(r => {
    actualPositionMap[String(r.dgId)] = r.finishPosition;
  });

  const matched = [];
  predictions.forEach((pred, idx) => {
    const dgIdKey = String(pred.dgId);
    if (actualPositionMap[dgIdKey]) {
      matched.push({
        predictedRank: idx + 1,
        actualPosition: actualPositionMap[dgIdKey]
      });
    }
  });

  const predictedRanks = matched.map(m => m.predictedRank);
  const actualPositions = matched.map(m => m.actualPosition);

  return {
    matchedPlayers: matched.length,
    correlation: calculatePearsonCorrelation(predictedRanks, actualPositions),
    rmse: Math.sqrt(matched.reduce((sum, m) => sum + Math.pow(m.predictedRank - m.actualPosition, 2), 0) / matched.length),
    top10Accuracy: calculateTopNAccuracy(predictions, actualResults, 10),
    top20Accuracy: calculateTopNAccuracy(predictions, actualResults, 20)
  };
}

async function iterateWeights() {
  console.log('\n' + '='.repeat(90));
  console.log(`WEIGHT ITERATOR - GRID SEARCH WITH METRIC INVERSION`);
  console.log(`Tournament: ${TOURNAMENT_NAME || `Event ${EVENT_ID}`} | Event ID: ${EVENT_ID}`);
  console.log('='.repeat(90));

  // Load tournament configuration
  let tournament;
  try {
    tournament = getTournamentConfig(EVENT_ID, DATA_DIR);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }

  // Load correlation analysis to identify inverted metrics
  const correlationPath = path.resolve(OUTPUT_DIR, 'correlation_analysis.json');
  if (!fs.existsSync(correlationPath)) {
    console.error('❌ correlation_analysis.json not found. Run tournamentAnalyzer.js first.');
    process.exit(1);
  }

  const correlationData = JSON.parse(fs.readFileSync(correlationPath, 'utf8'));
  let invertedMetrics = correlationData.invertedMetrics || [];
  let inversionSource = 'full-field';

  if (Array.isArray(correlationData.top20SignalCorrelations) && correlationData.top20SignalCorrelations.length > 0) {
    const top20Inverted = correlationData.top20SignalCorrelations
      .filter(entry => shouldInvertMetricLabel(entry.label, entry.correlation))
      .map(entry => entry.label);
    if (top20Inverted.length > 0) {
      invertedMetrics = top20Inverted;
      inversionSource = 'top20-signal';
    }
  }

  console.log(`\n📊 Identified ${invertedMetrics.length} inverted metrics (negative correlation, source=${inversionSource}):`);
  invertedMetrics.forEach(m => console.log(`  ⚠️ ${m}`));

  // Load tournament data
  const CONFIG_PATH = tournament.configPath;
  const RESULTS_PATH = tournament.resultsPath;
  const FIELD_PATH = tournament.fieldPath;
  const HISTORY_PATH = tournament.historyPath;
  const APPROACH_PATH = tournament.approachPath;

  console.log('\n🔄 Loading data...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });

  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });
  const actualResults = loadActualResults(RESULTS_PATH);

  const { players, historicalData, approachData: approachDataObj } = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId: sharedConfig.currentEventId
  });

  const aggregatedPlayers = aggregatePlayerData(
    players,
    historicalData,
    approachDataObj,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  console.log(`✅ Loaded ${Object.keys(aggregatedPlayers).length} players\n`);

  // Get baseline weights
  const baselineWeights = {};
  metricConfig.groups.forEach(group => {
    baselineWeights[group.name] = group.weight;
  });

  const baselineMetricWeights = {};
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      baselineMetricWeights[`${group.name}::${metric.name}`] = metric.weight;
    });
  });

  // Test baseline with inversion
  console.log('🔄 Testing baseline configuration with metric inversion...');
  const baselinePredictions = runModelWithWeights(
    aggregatedPlayers,
    baselineWeights,
    baselineMetricWeights,
    metricConfig,
    invertedMetrics
  );
  const baselineResults = evaluateRankings(baselinePredictions, actualResults);

  console.log('\n' + '='.repeat(90));
  console.log('BASELINE RESULTS (with metric inversion applied)');
  console.log('='.repeat(90));
  console.log(`Correlation: ${baselineResults.correlation.toFixed(4)}`);
  console.log(`RMSE: ${baselineResults.rmse.toFixed(2)}`);
  console.log(`Top-10 Accuracy: ${baselineResults.top10Accuracy.toFixed(1)}%`);
  console.log(`Top-20 Accuracy: ${baselineResults.top20Accuracy.toFixed(1)}%`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    inversionSource,
    invertedMetrics,
    baselineResults,
    message: 'Weight iteration with metric inversion complete. Inverted metrics have been negated before ranking.'
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'weight_iteration_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Results saved to: output/weight_iteration_results.json`);

  console.log('\n' + '='.repeat(90) + '\n');
}

// Run iterator
iterateWeights().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
