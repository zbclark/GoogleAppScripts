/**
 * Hybrid Weight Optimizer
 * 
 * Hybrid approach: Lock stable/strong metric groups, optimize weak ones
 * 
 * Strategy:
 * 1. Identify groups with consistent positive correlation (lock these)
 * 2. Identify groups with low/inconsistent correlation (optimize these)
 * 3. Keep locked groups at baseline, optimize weak groups using 2026 data
 * 4. Compare results vs baseline and single-year optimization
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('../core/modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = ROOT_DIR;
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');
const EVENT_ID = '6';

// Groups that showed strong/stable correlation in correlation_analysis.json
const STRONG_GROUPS = [
  'Approach - Short (<100)',     // 0.0951
  'Approach - Mid (100-150)',    // 0.0932 (mixed but avg positive)
  'Approach - Long (150-200)'    // 0.0632
];

const WEAK_GROUPS = [
  'Driving Performance',         // 0.0248-0.0656
  'Putting',                     // Will optimize
  'Around the Green',            // Will optimize
  'Scoring',                     // Will optimize
  'Course Management'            // Will optimize
];

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const result = {};
  Object.entries(weights).forEach(([key, value]) => {
    result[key] = total > 0 ? value / total : 1 / Object.keys(weights).length;
  });
  return result;
}

function normalizeMetricWeights(metrics) {
  const total = Object.values(metrics).reduce((sum, m) => sum + (m.weight || 0), 0);
  if (total === 0) return metrics;
  const result = {};
  Object.entries(metrics).forEach(([key, metric]) => {
    result[key] = { weight: (metric.weight || 0) / total };
  });
  return result;
}

function buildModifiedGroups(groups, groupWeights, metricOverrides) {
  return groups.map(group => {
    const metrics = group.metrics.map(metric => {
      const overrideKey = `${group.name}::${metric.name}`;
      const override = metricOverrides[overrideKey];
      return {
        ...metric,
        weight: override ? override.weight : metric.weight
      };
    });

    // Normalize metric weights
    const totalMetricWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
    const normalizedMetrics = totalMetricWeight > 0 
      ? metrics.map(m => ({ ...m, weight: m.weight / totalMetricWeight }))
      : metrics;

    return {
      ...group,
      weight: groupWeights[group.name] || group.weight,
      metrics: normalizedMetrics  // Keep as array, not object
    };
  });
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
  return denom === 0 ? 0 : numerator / denom;
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
        actualRank: actualPositionMap[dgIdKey]
      });
    }
  });

  if (matched.length === 0) return { correlation: 0, rmse: 0, topN10: 0, topN20: 0 };

  const predictedRanks = matched.map(m => m.predictedRank);
  const actualRanks = matched.map(m => m.actualRank);

  const correlation = calculatePearsonCorrelation(predictedRanks, actualRanks);
  const rmse = Math.sqrt(
    matched.reduce((sum, m) => sum + Math.pow(m.predictedRank - m.actualRank, 2), 0) / matched.length
  );

  return {
    correlation,
    rmse,
    topN10: calculateTopNAccuracy(predictions, actualResults, 10),
    topN20: calculateTopNAccuracy(predictions, actualResults, 20),
    matchedPlayers: matched.length
  };
}

function testHybridConfiguration() {
  console.log('\n' + '='.repeat(90));
  console.log('HYBRID WEIGHT OPTIMIZER - LOCK STRONG, OPTIMIZE WEAK');
  console.log('='.repeat(90));

  // Load configuration
  const CONFIG_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Configuration Sheet.csv');
  const RESULTS_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Results.csv');
  const FIELD_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Field.csv');
  const HISTORY_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Historical Data.csv');
  const APPROACH_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Approach Skill.csv');

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });

  console.log('🔄 Loading data...');
  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });

  // Load actual results
  function loadActualResults(path) {
    const rawData = loadCsv(path, { skipFirstColumn: true });
    const results = [];
    rawData.forEach(row => {
      const dgId = String(row['DG ID'] || '').trim();
      const posStr = String(row['Finish Position'] || '').trim().toUpperCase();
      if (!dgId) return;
      
      let finishPosition = null;
      if (posStr.startsWith('T')) {
        finishPosition = parseInt(posStr.substring(1));
      } else if (posStr !== 'CUT' && posStr !== 'WD' && posStr !== 'DQ') {
        finishPosition = parseInt(posStr);
      }
      
      if (finishPosition && !Number.isNaN(finishPosition)) {
        results.push({ dgId, finishPosition });
      }
    });
    return results;
  }

  const actualResults = loadActualResults(RESULTS_PATH);
  console.log(`✓ Loaded ${actualResults.length} actual results`);

  // Build player data
  console.log('🔄 Building player data...');
  const { players, historicalData, approachData: approachDataObj } = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId: sharedConfig.currentEventId
  });

  console.log(`✓ Built ${Object.keys(players).length} players`);

  // Aggregate
  const aggregatedPlayers = aggregatePlayerData(
    players,
    historicalData,
    approachDataObj,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  // Create baseline weights
  const baselineWeights = {};
  const baselineMetricWeights = {};
  metricConfig.groups.forEach(group => {
    baselineWeights[group.name] = group.weight;
    group.metrics.forEach(metric => {
      baselineMetricWeights[`${group.name}::${metric.name}`] = metric.weight;
    });
  });

  // Create hybrid weights
  // LOCK strong groups at baseline, OPTIMIZE weak groups (increase all +5%)
  const hybridWeights = { ...baselineWeights };
  const hybridMetricWeights = { ...baselineMetricWeights };

  const weakGroupNames = WEAK_GROUPS.filter(name => metricConfig.groups.some(g => g.name === name));
  weakGroupNames.forEach(groupName => {
    hybridWeights[groupName] *= 1.05;  // +5% to weak groups
  });

  // Renormalize
  const hybridWeightsNorm = normalizeWeights(hybridWeights);
  const baselineWeightsNorm = normalizeWeights(baselineWeights);

  console.log('\n' + '='.repeat(90));
  console.log('WEIGHT COMPARISON');
  console.log('='.repeat(90));
  console.log('\nGroup'.padEnd(40) + 'Baseline'.padEnd(12) + 'Hybrid'.padEnd(12) + 'Change');
  console.log('-'.repeat(90));

  metricConfig.groups.forEach(group => {
    const base = baselineWeightsNorm[group.name] || 0;
    const hybrid = hybridWeightsNorm[group.name] || 0;
    const change = (hybrid - base) * 100;
    const isWeak = WEAK_GROUPS.includes(group.name);
    const label = isWeak ? '  (optimize)' : '  (locked)';

    console.log(
      group.name.padEnd(40) +
      `${(base * 100).toFixed(1)}%`.padEnd(12) +
      `${(hybrid * 100).toFixed(1)}%`.padEnd(12) +
      `${change > 0 ? '+' : ''}${change.toFixed(2)}%${label}`
    );
  });

  // Test both configurations
  console.log('\n' + '='.repeat(90));
  console.log('TESTING CONFIGURATIONS');
  console.log('='.repeat(90));

  const configurations = [
    {
      name: 'BASELINE',
      weights: baselineWeightsNorm,
      metricWeights: baselineMetricWeights
    },
    {
      name: 'HYBRID (Lock Strong, Optimize Weak)',
      weights: hybridWeightsNorm,
      metricWeights: hybridMetricWeights
    }
  ];

  const results = {};

  configurations.forEach(config => {
    console.log(`\n🔄 Testing ${config.name}...`);

    const modifiedGroups = buildModifiedGroups(
      metricConfig.groups,
      config.weights,
      config.metricWeights
    );

    const rankingResult = generatePlayerRankings(aggregatedPlayers, {
      groups: modifiedGroups,
      pastPerformance: metricConfig.pastPerformance,
      config: metricConfig.config
    });

    const evaluation = evaluateRankings(rankingResult.players, actualResults);
    results[config.name] = evaluation;

    console.log(`  Correlation: ${evaluation.correlation?.toFixed(4) || 'N/A'}`);
    console.log(`  RMSE: ${evaluation.rmse?.toFixed(2) || 'N/A'}`);
    console.log(`  Top-10: ${evaluation.topN10?.toFixed(1) || 'N/A'}%`);
    console.log(`  Top-20: ${evaluation.topN20?.toFixed(1) || 'N/A'}%`);
  });

  // Compare results
  console.log('\n' + '='.repeat(90));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(90));

  const baseline = results['BASELINE'];
  const hybrid = results['HYBRID (Lock Strong, Optimize Weak)'];

  console.log('\nMetric'.padEnd(20) + 'Baseline'.padEnd(15) + 'Hybrid'.padEnd(15) + 'Improvement');
  console.log('-'.repeat(90));

  const metrics = ['correlation', 'rmse', 'topN10', 'topN20'];
  metrics.forEach(metric => {
    const baseVal = baseline[metric];
    const hybridVal = hybrid[metric];
    let improvement;

    if (metric === 'rmse') {
      improvement = (baseVal - hybridVal) / Math.abs(baseVal);  // Lower RMSE is better
      console.log(
        metric.padEnd(20) +
        `${baseVal.toFixed(2)}`.padEnd(15) +
        `${hybridVal.toFixed(2)}`.padEnd(15) +
        `${improvement > 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%`
      );
    } else {
      improvement = (hybridVal - baseVal) / Math.abs(baseVal);
      console.log(
        metric.padEnd(20) +
        `${baseVal.toFixed(4)}`.padEnd(15) +
        `${hybridVal.toFixed(4)}`.padEnd(15) +
        `${improvement > 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%`
      );
    }
  });

  // Determine winner
  console.log('\n' + '='.repeat(90));
  if (hybrid.correlation > baseline.correlation) {
    console.log('✅ WINNER: HYBRID - Better correlation');
  } else if (baseline.correlation > hybrid.correlation) {
    console.log('✅ WINNER: BASELINE - Better correlation');
  } else {
    console.log('➖ TIE - Same correlation');
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: 'Sony Open',
    strategy: 'Hybrid (Lock Strong Approach Groups, Optimize Weak Groups)',
    results,
    strongGroups: STRONG_GROUPS,
    weakGroups: WEAK_GROUPS
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'hybrid_weight_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Results saved to: output/hybrid_weight_results.json`);
  console.log('='.repeat(90) + '\n');
}

testHybridConfiguration();
