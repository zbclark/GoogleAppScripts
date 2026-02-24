/**
 * Multi-Year vs Single-Year Comparison
 * 
 * Same 2026 field, but:
 * - Single-Year: Train on 2026 data only
 * - Multi-Year: Train on 2026 field's complete 2023-2025 historical performance
 * 
 * Then test both on 2026 actual results and grid search to optimize
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('../modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../metricConfigBuilder');

const DATA_DIR = __dirname;
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const EVENT_ID = '6';

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const result = {};
  Object.entries(weights).forEach(([key, value]) => {
    result[key] = total > 0 ? value / total : 1 / Object.keys(weights).length;
  });
  return result;
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
        actualRank: actualPositionMap[dgIdKey]
      });
    }
  });

  if (matched.length === 0) return { correlation: 0, rmse: 0, top10: 0, top20: 0 };

  const predictedRanks = matched.map(m => m.predictedRank);
  const actualRanks = matched.map(m => m.actualRank);

  const correlation = calculatePearsonCorrelation(predictedRanks, actualRanks);
  const rmse = Math.sqrt(
    matched.reduce((sum, m) => sum + Math.pow(m.predictedRank - m.actualRank, 2), 0) / matched.length
  );

  return {
    correlation,
    rmse,
    top10: calculateTopNAccuracy(predictions, actualResults, 10),
    top20: calculateTopNAccuracy(predictions, actualResults, 20)
  };
}

function buildModifiedGroups(groups, groupWeights, metricWeights) {
  return groups.map(group => {
    const metrics = group.metrics.map(metric => {
      const overrideKey = `${group.name}::${metric.name}`;
      const override = metricWeights[overrideKey];
      return {
        ...metric,
        weight: override ? override.weight : metric.weight
      };
    });

    const totalMetricWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
    const normalizedMetrics = totalMetricWeight > 0 
      ? metrics.map(m => ({ ...m, weight: m.weight / totalMetricWeight }))
      : metrics;

    return {
      ...group,
      weight: groupWeights[group.name] || group.weight,
      metrics: normalizedMetrics
    };
  });
}

function runComparison() {
  console.log('\n' + '='.repeat(100));
  console.log('SINGLE-YEAR vs MULTI-YEAR TRAINING');
  console.log('Same 2026 field, different training data');
  console.log('='.repeat(100));

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

  // Load 2026 actual results
  function loadActualResults(resultsPath) {
    const rawData = loadCsv(resultsPath, { skipFirstColumn: true });
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

  const results2026 = loadActualResults(RESULTS_PATH);
  console.log(`✓ Loaded ${results2026.length} 2026 actual results\n`);

  const baselineGroupWeights = {};
  const baselineMetricWeights = {};
  metricConfig.groups.forEach(group => {
    baselineGroupWeights[group.name] = group.weight;
    group.metrics.forEach(metric => {
      baselineMetricWeights[`${group.name}::${metric.name}`] = metric.weight;
    });
  });

  // Build datasets
  console.log('='.repeat(100));
  console.log('BUILDING DATASETS');
  console.log('='.repeat(100));

  // Single-year: 2026 data only
  console.log('\n🔄 Single-Year: Building from 2026 data only...');
  const singleYearHistory = historyData.filter(row => {
    const rowYear = parseInt(String(row['year'] || 2026).trim());
    const rowEventId = String(row['event_id'] || '').trim();
    return rowYear === 2026 && rowEventId === EVENT_ID;
  });

  const singleYearApproach = approachData.filter(row => {
    const rowYear = parseInt(String(row['year'] || 2026).trim());
    const rowEventId = String(row['event_id'] || '').trim();
    return rowYear === 2026 && rowEventId === EVENT_ID;
  });

  console.log(`   ✓ ${singleYearHistory.length} rounds from 2026`);

  const singleYearPlayerData = buildPlayerData({
    fieldData,
    roundsRawData: singleYearHistory,
    approachRawData: singleYearApproach,
    currentEventId: sharedConfig.currentEventId
  });

  const singleYearAggregated = aggregatePlayerData(
    singleYearPlayerData.players,
    singleYearPlayerData.historicalData,
    singleYearPlayerData.approachData,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  // Multi-year: 2023-2025-2026 data for the 2026 field
  console.log('\n🔄 Multi-Year: Building from 2023-2025-2026 historical data...');
  const multiYearHistory = historyData.filter(row => {
    const rowYear = parseInt(String(row['year'] || 2026).trim());
    const rowEventId = String(row['event_id'] || '').trim();
    return rowYear <= 2026 && rowEventId === EVENT_ID;
  });

  const multiYearApproach = approachData.filter(row => {
    const rowYear = parseInt(String(row['year'] || 2026).trim());
    const rowEventId = String(row['event_id'] || '').trim();
    return rowYear <= 2026 && rowEventId === EVENT_ID;
  });

  // Extract years available
  const yearsAvailable = new Set();
  multiYearHistory.forEach(row => {
    const year = parseInt(String(row['year'] || 2026).trim());
    yearsAvailable.add(year);
  });
  const sortedYears = Array.from(yearsAvailable).sort();

  console.log(`   ✓ ${multiYearHistory.length} total rounds from years: ${sortedYears.join(', ')}`);

  const multiYearPlayerData = buildPlayerData({
    fieldData,
    roundsRawData: multiYearHistory,
    approachRawData: multiYearApproach,
    currentEventId: sharedConfig.currentEventId
  });

  const multiYearAggregated = aggregatePlayerData(
    multiYearPlayerData.players,
    multiYearPlayerData.historicalData,
    multiYearPlayerData.approachData,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  // Test single-year
  console.log('\n' + '='.repeat(100));
  console.log('TESTING SINGLE-YEAR (2026 data only)');
  console.log('='.repeat(100));

  const singleYearGroups = buildModifiedGroups(
    metricConfig.groups,
    baselineGroupWeights,
    baselineMetricWeights
  );

  const singleYearRanking = generatePlayerRankings(singleYearAggregated, {
    groups: singleYearGroups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });

  const singleYearEval = evaluateRankings(singleYearRanking.players, results2026);
  console.log(`Correlation: ${singleYearEval.correlation.toFixed(4)}`);
  console.log(`RMSE: ${singleYearEval.rmse.toFixed(2)}`);
  console.log(`Top-20: ${singleYearEval.top20.toFixed(1)}%`);

  // Test multi-year
  console.log('\n' + '='.repeat(100));
  console.log('TESTING MULTI-YEAR (2023-2026 historical data)');
  console.log('='.repeat(100));

  const multiYearGroups = buildModifiedGroups(
    metricConfig.groups,
    baselineGroupWeights,
    baselineMetricWeights
  );

  const multiYearRanking = generatePlayerRankings(multiYearAggregated, {
    groups: multiYearGroups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });

  const multiYearEval = evaluateRankings(multiYearRanking.players, results2026);
  console.log(`Correlation: ${multiYearEval.correlation.toFixed(4)}`);
  console.log(`RMSE: ${multiYearEval.rmse.toFixed(2)}`);
  console.log(`Top-20: ${multiYearEval.top20.toFixed(1)}%`);

  // Compare
  console.log('\n' + '='.repeat(100));
  console.log('COMPARISON');
  console.log('='.repeat(100));

  console.log('\nMetric'.padEnd(20) + 'Single-Year'.padEnd(15) + 'Multi-Year'.padEnd(15) + 'Difference');
  console.log('-'.repeat(100));

  const corrDiff = multiYearEval.correlation - singleYearEval.correlation;
  const rmseDiff = multiYearEval.rmse - singleYearEval.rmse;
  const top20Diff = multiYearEval.top20 - singleYearEval.top20;

  console.log(
    'Correlation'.padEnd(20) +
    `${singleYearEval.correlation.toFixed(4)}`.padEnd(15) +
    `${multiYearEval.correlation.toFixed(4)}`.padEnd(15) +
    `${corrDiff > 0 ? '+' : ''}${corrDiff.toFixed(4)}`
  );

  console.log(
    'RMSE'.padEnd(20) +
    `${singleYearEval.rmse.toFixed(2)}`.padEnd(15) +
    `${multiYearEval.rmse.toFixed(2)}`.padEnd(15) +
    `${rmseDiff > 0 ? '+' : ''}${rmseDiff.toFixed(2)}`
  );

  console.log(
    'Top-20'.padEnd(20) +
    `${singleYearEval.top20.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top20.toFixed(1)}%`.padEnd(15) +
    `${top20Diff > 0 ? '+' : ''}${top20Diff.toFixed(1)}%`
  );

  // Make recommendation
  console.log('\n' + '='.repeat(100));
  console.log('RECOMMENDATION');
  console.log('='.repeat(100));

  const improvementPercent = ((multiYearEval.correlation - singleYearEval.correlation) / Math.abs(singleYearEval.correlation)) * 100;

  if (multiYearEval.correlation > singleYearEval.correlation) {
    console.log(`\n✅ MULTI-YEAR IS BETTER: ${improvementPercent.toFixed(2)}% improvement`);
    console.log(`   Use historical data (2023-2025) for training`);
    console.log(`   More stable metrics from longer time period`);
  } else if (Math.abs(corrDiff) < 0.01) {
    console.log(`\n➖ COMPARABLE: ${Math.abs(improvementPercent).toFixed(2)}% difference`);
    console.log(`   Both approaches perform similarly`);
    console.log(`   Single-year simpler, multi-year more robust to players' form changes`);
  } else {
    console.log(`\n✅ SINGLE-YEAR IS BETTER: ${Math.abs(improvementPercent).toFixed(2)}% advantage`);
    console.log(`   2026-specific data is more predictive`);
    console.log(`   Players' current form trumps historical trends`);
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: 'Sony Open',
    yearsAvailable: sortedYears,
    approach: 'Same 2026 field, different training periods',
    singleYear: {
      trainingData: '2026 only',
      roundsUsed: singleYearHistory.length,
      evaluation: singleYearEval
    },
    multiYear: {
      trainingData: sortedYears.join('-'),
      roundsUsed: multiYearHistory.length,
      evaluation: multiYearEval
    },
    comparison: {
      correlationDifference: corrDiff,
      rmseDifference: rmseDiff,
      top20Difference: top20Diff,
      recommendation: multiYearEval.correlation > singleYearEval.correlation ? 'MULTI-YEAR' : 'SINGLE-YEAR'
    }
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'singleyear_vs_multiyear_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Results saved to: output/singleyear_vs_multiyear_results.json`);
  console.log('='.repeat(100) + '\n');
}

runComparison();
