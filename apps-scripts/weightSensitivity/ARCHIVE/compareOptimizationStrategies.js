/**
 * Compare Three Optimization Strategies:
 * 1. Baseline (config weights)
 * 2. Single-year (2026 only)
 * 3. Multi-year (2024-2026 blended)
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('../modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../metricConfigBuilder');

const DATA_DIR = __dirname;

const CONFIG_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Configuration Sheet.csv');
const RESULTS_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Results.csv');
const FIELD_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Field.csv');
const HISTORY_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Historical Data.csv');
const APPROACH_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Approach Skill.csv');

const SINGLE_YEAR_WEIGHTS_PATH = path.resolve(DATA_DIR, 'output/optimized_sony_open_weights_v2.json');
const MULTI_YEAR_WEIGHTS_PATH = path.resolve(DATA_DIR, 'output/multi_year_optimized_weights.json');

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

function buildModifiedGroups(baseGroups, groupWeightOverrides = {}, metricWeightOverrides = {}) {
  return baseGroups.map(group => {
    const groupWeight = typeof groupWeightOverrides[group.name] === 'number'
      ? groupWeightOverrides[group.name]
      : group.weight;

    const metrics = group.metrics.map(metric => {
      const overrideKey = `${group.name}::${metric.name}`;
      const metricWeight = typeof metricWeightOverrides[overrideKey] === 'number'
        ? metricWeightOverrides[overrideKey]
        : metric.weight;

      return {
        ...metric,
        weight: metricWeight
      };
    });

    return {
      ...group,
      weight: groupWeight,
      metrics: normalizeMetricWeights(metrics)
    };
  });
}

function runModelWithWeights(players, groupWeights, metricOverrides, config) {
  const normalizedGroupWeights = normalizeWeights(groupWeights);
  const modifiedGroups = buildModifiedGroups(
    config.groups,
    normalizedGroupWeights,
    metricOverrides
  );

  const result = generatePlayerRankings(players, {
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

async function main() {
  console.log('\n' + '='.repeat(90));
  console.log('OPTIMIZATION STRATEGY COMPARISON');
  console.log('='.repeat(90));

  // Load data
  console.log('\n🔄 Loading tournament data...');
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
  
  console.log('🔄 Building player data...');
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

  console.log(`✅ Aggregated ${Object.keys(aggregatedPlayers).length} players`);
  
  // Load weight configurations
  const SINGLE_YEAR_WEIGHTS = JSON.parse(fs.readFileSync(SINGLE_YEAR_WEIGHTS_PATH, 'utf8'));
  const MULTI_YEAR_WEIGHTS = JSON.parse(fs.readFileSync(MULTI_YEAR_WEIGHTS_PATH, 'utf8'));
  
  // Test three configurations
  console.log('\n🔄 Testing configurations...\n');
  
  // 1. Baseline (config weights)
  const baselineGroupWeights = {};
  metricConfig.groups.forEach(group => {
    baselineGroupWeights[group.name] = group.weight;
  });
  const baselinePredictions = runModelWithWeights(aggregatedPlayers, baselineGroupWeights, {}, metricConfig);
  const baselineResults = evaluateRankings(baselinePredictions, actualResults);
  
  // 2. Single-year optimized (2026 only)
  const singleYearGroupWeights = SINGLE_YEAR_WEIGHTS.groupWeights;
  const singleYearMetricOverrides = SINGLE_YEAR_WEIGHTS.metricOverrides;
  const singleYearPredictions = runModelWithWeights(aggregatedPlayers, singleYearGroupWeights, singleYearMetricOverrides, metricConfig);
  const singleYearResults = evaluateRankings(singleYearPredictions, actualResults);
  
  // 3. Multi-year optimized (2024-2026 blended)
  const multiYearGroupWeights = MULTI_YEAR_WEIGHTS.groupWeights;
  const multiYearMetricOverrides = MULTI_YEAR_WEIGHTS.metricOverrides;
  const multiYearPredictions = runModelWithWeights(aggregatedPlayers, multiYearGroupWeights, multiYearMetricOverrides, metricConfig);
  const multiYearResults = evaluateRankings(multiYearPredictions, actualResults);
  
  // Display results
  console.log('='.repeat(90));
  console.log('RESULTS COMPARISON');
  console.log('='.repeat(90));
  console.log('\n' + 'Metric'.padEnd(25) + 'BASELINE'.padEnd(20) + 'SINGLE-YEAR'.padEnd(20) + 'MULTI-YEAR');
  console.log('-'.repeat(90));
  
  const metrics = [
    { name: 'Correlation', baseline: baselineResults.correlation, singleYear: singleYearResults.correlation, multiYear: multiYearResults.correlation, format: (v) => v.toFixed(4) },
    { name: 'RMSE', baseline: baselineResults.rmse, singleYear: singleYearResults.rmse, multiYear: multiYearResults.rmse, format: (v) => v.toFixed(2) },
    { name: 'Top-10 Accuracy', baseline: baselineResults.top10Accuracy, singleYear: singleYearResults.top10Accuracy, multiYear: multiYearResults.top10Accuracy, format: (v) => v.toFixed(1) + '%' },
    { name: 'Top-20 Accuracy', baseline: baselineResults.top20Accuracy, singleYear: singleYearResults.top20Accuracy, multiYear: multiYearResults.top20Accuracy, format: (v) => v.toFixed(1) + '%' }
  ];
  
  metrics.forEach(m => {
    console.log(
      m.name.padEnd(25) +
      m.format(m.baseline).padEnd(20) +
      m.format(m.singleYear).padEnd(20) +
      m.format(m.multiYear)
    );
  });
  
  console.log('\n' + '='.repeat(90));
  console.log('WINNER DETERMINATION');
  console.log('='.repeat(90));
  
  const scores = {
    baseline: 0,
    singleYear: 0,
    multiYear: 0
  };
  
  // Higher correlation is better
  if (baselineResults.correlation >= singleYearResults.correlation && baselineResults.correlation >= multiYearResults.correlation) scores.baseline++;
  else if (singleYearResults.correlation >= multiYearResults.correlation) scores.singleYear++;
  else scores.multiYear++;
  
  // Lower RMSE is better
  if (baselineResults.rmse <= singleYearResults.rmse && baselineResults.rmse <= multiYearResults.rmse) scores.baseline++;
  else if (singleYearResults.rmse <= multiYearResults.rmse) scores.singleYear++;
  else scores.multiYear++;
  
  // Higher Top-10 is better
  if (baselineResults.top10Accuracy >= singleYearResults.top10Accuracy && baselineResults.top10Accuracy >= multiYearResults.top10Accuracy) scores.baseline++;
  else if (singleYearResults.top10Accuracy >= multiYearResults.top10Accuracy) scores.singleYear++;
  else scores.multiYear++;
  
  // Higher Top-20 is better
  if (baselineResults.top20Accuracy >= singleYearResults.top20Accuracy && baselineResults.top20Accuracy >= multiYearResults.top20Accuracy) scores.baseline++;
  else if (singleYearResults.top20Accuracy >= multiYearResults.top20Accuracy) scores.singleYear++;
  else scores.multiYear++;
  
  console.log(`\nBaseline:     ${scores.baseline}/4 metrics won`);
  console.log(`Single-Year:  ${scores.singleYear}/4 metrics won`);
  console.log(`Multi-Year:   ${scores.multiYear}/4 metrics won`);
  
  let winner = 'BASELINE';
  if (scores.singleYear > scores.baseline && scores.singleYear >= scores.multiYear) winner = 'SINGLE-YEAR (2026 only)';
  else if (scores.multiYear > scores.baseline && scores.multiYear > scores.singleYear) winner = 'MULTI-YEAR (2024-2026)';
  
  console.log(`\n🏆 WINNER: ${winner}`);
  console.log('='.repeat(90) + '\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
