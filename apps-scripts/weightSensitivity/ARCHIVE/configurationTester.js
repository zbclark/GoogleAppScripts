/**
 * Configuration Tester
 * 
 * Tests all available weight templates and configurations against
 * actual tournament results. Identifies best performers with support
 * for metric inversion.
 * 
 * Requires:
 * - correlation_analysis.json (from tournamentAnalyzer.js)
 * - weight_iteration_results.json (from weightIterator.js)
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

// Get eventId and tournament name from command line
const EVENT_ID = process.argv[2] || '6';
const TOURNAMENT_NAME = process.argv[3] || null;

// Import weight templates from Golf Algorithm Library
const TEMPLATE_LOADER_PATH = path.resolve(ROOT_DIR, '..', 'Golf_Algorithm_Library', 'utilities', 'templateLoader.js');

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
      const metricWeight = typeof metricWeightOverrides[overrideKey] === 'number'
        ? metricWeightOverrides[overrideKey]
        : metric.weight;

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

  // Invert metric values for negative correlation metrics
  const playersWithInversion = rankedPlayers.map(player => {
    const metrics = [...player.metrics];
    
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

async function testConfigurations() {
  console.log('\n' + '='.repeat(90));
  console.log(`CONFIGURATION TESTER - ALL TEMPLATES`);
  console.log(`Tournament: ${TOURNAMENT_NAME || `Event ${EVENT_ID}`} | Event ID: ${EVENT_ID}`);
  console.log('='.repeat(90));

  // Load tournament configuration
  let tournament;
  try {
    tournament = getTournamentConfig(EVENT_ID, DATA_DIR);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    console.log('\nAvailable tournaments:');
    require('./utilities/tournamentConfig').getAvailableTournaments().forEach(t => {
      console.log(`  - Event ID "${t.id}": ${t.name}`);
    });
    process.exit(1);
  }

  // Load correlation analysis for inverted metrics
  const correlationPath = path.resolve(OUTPUT_DIR, 'correlation_analysis.json');
  let invertedMetrics = [];
  let inversionSource = 'full-field';
  if (fs.existsSync(correlationPath)) {
    const correlationData = JSON.parse(fs.readFileSync(correlationPath, 'utf8'));
    invertedMetrics = correlationData.invertedMetrics || [];
    if (Array.isArray(correlationData.top20SignalCorrelations) && correlationData.top20SignalCorrelations.length > 0) {
      const top20Inverted = correlationData.top20SignalCorrelations
        .filter(entry => shouldInvertMetricLabel(entry.label, entry.correlation))
        .map(entry => entry.label);
      if (top20Inverted.length > 0) {
        invertedMetrics = top20Inverted;
        inversionSource = 'top20-signal';
      }
    }
    console.log(`\n⚠️ Using ${invertedMetrics.length} inverted metrics from correlation analysis (source=${inversionSource})`);
  } else {
    console.log('\n⚠️ No correlation analysis found. Testing without metric inversion.');
  }

  // Load data
  const CONFIG_PATH = tournament.configPath;
  const RESULTS_PATH = tournament.resultsPath;
  const FIELD_PATH = tournament.fieldPath;
  const HISTORY_PATH = tournament.historyPath;
  const APPROACH_PATH = tournament.approachPath;

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });

  console.log('🔄 Loading tournament data...');
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

  console.log(`✅ Aggregated ${Object.keys(aggregatedPlayers).length} players\n`);

  // Test each pre-defined configuration
  console.log('🔄 Testing pre-defined configurations...\n');

  const configurations = [
    {
      name: 'BASELINE (Default)',
      groupWeights: {},
      metricWeights: {}
    },
    {
      name: 'SONY_OPEN_OPTIMIZED_v2',
      groupWeights: {
        'Driving Performance': 0.037,
        'Approach - Short (<100)': 0.090,
        'Approach - Mid (100-150)': 0.077,
        'Approach - Long (150-200)': 0.087,
        'Approach - Very Long (>200)': 0.116,
        'Putting': 0.252,
        'Around the Green': 0.156,
        'Scoring': 0.115,
        'Course Management': 0.070
      },
      metricWeights: {
        'Putting::SG Putting': 1.0,
        'Around the Green::SG Around Green': 1.0
      }
    }
  ];

  const results = [];

  for (const config of configurations) {
    console.log(`Testing: ${config.name}...`);

    // Use baseline weights if not provided
    const groupWeights = Object.keys(config.groupWeights).length > 0
      ? config.groupWeights
      : (() => {
        const baseline = {};
        metricConfig.groups.forEach(g => {
          baseline[g.name] = g.weight;
        });
        return baseline;
      })();

    const metricWeights = Object.keys(config.metricWeights).length > 0
      ? config.metricWeights
      : (() => {
        const baseline = {};
        metricConfig.groups.forEach(group => {
          group.metrics.forEach(metric => {
            baseline[`${group.name}::${metric.name}`] = metric.weight;
          });
        });
        return baseline;
      })();

    const predictions = runModelWithWeights(
      aggregatedPlayers,
      groupWeights,
      metricWeights,
      metricConfig,
      invertedMetrics
    );

    const evaluation = evaluateRankings(predictions, actualResults);

    results.push({
      name: config.name,
      ...evaluation
    });

    console.log(`  ✓ Correlation: ${evaluation.correlation.toFixed(4)}`);
    console.log(`  ✓ Top-20 Accuracy: ${evaluation.top20Accuracy.toFixed(1)}%\n`);
  }

  // Rank results
  results.sort((a, b) => b.correlation - a.correlation);

  console.log('='.repeat(90));
  console.log('RESULTS (sorted by correlation)');
  console.log('='.repeat(90));
  console.log('\n' + 'Configuration'.padEnd(35) + 'Correlation'.padEnd(15) + 'RMSE'.padEnd(12) + 'Top-20');
  console.log('-'.repeat(90));

  results.forEach((r, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
    console.log(
      `${medal} ${r.name.substring(0, 32).padEnd(34)}${r.correlation.toFixed(4).padStart(14)} ${r.rmse.toFixed(2).padStart(11)} ${r.top20Accuracy.toFixed(1).padStart(8)}%`
    );
  });

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    inversionSource,
    invertedMetricsUsed: invertedMetrics.length,
    totalConfigurations: results.length,
    results,
    winner: results[0]
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'configuration_test_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Results saved to: output/configuration_test_results.json`);

  console.log('\n' + '='.repeat(90) + '\n');
}

// Run tester
testConfigurations().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
