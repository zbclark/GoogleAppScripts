/**
 * Hybrid Grid-Search Weight Optimizer
 * 
 * Combines hybrid locking strategy with systematic grid search:
 * 1. LOCK strong approach groups at baseline (proven predictors)
 * 2. GRID SEARCH weak groups (Putting, Driving, Scoring, etc.)
 * 3. Compare results vs baseline (0.0186) and single-year (0.1066)
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('./utilities/csvLoader');
const { buildPlayerData } = require('./utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('./modelCore');
const { getSharedConfig } = require('./utilities/configParser');
const { buildMetricGroupsFromConfig } = require('./metricConfigBuilder');

const DATA_DIR = __dirname;
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const EVENT_ID = '6';

// Groups that are strong predictors - LOCK these at baseline
const LOCKED_GROUPS = [
  'Approach - Short (<100)',
  'Approach - Mid (100-150)',
  'Approach - Long (150-200)',
  'Approach - Very Long (>200)'
];

// Weak groups to optimize - these get grid-searched
const OPTIMIZABLE_GROUPS = [
  'Driving Performance',
  'Putting',
  'Around the Green',
  'Scoring',
  'Course Management'
];

// Grid search parameters: for each weak group, test weights at ±step increments
const GRID_STEP = 0.015;  // ±1.5% increments
const GRID_RANGE = 0.060; // Test within ±6% of baseline

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const result = {};
  Object.entries(weights).forEach(([key, value]) => {
    result[key] = total > 0 ? value / total : 1 / Object.keys(weights).length;
  });
  return result;
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

    // Normalize metric weights
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

function runHybridGridSearch() {
  console.log('\n' + '='.repeat(90));
  console.log('HYBRID GRID-SEARCH OPTIMIZER');
  console.log('Lock strong Approach groups, grid-search weak groups');
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

  // Aggregate
  const aggregatedPlayers = aggregatePlayerData(
    players,
    historicalData,
    approachDataObj,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  // Create baseline weights
  const baselineGroupWeights = {};
  const baselineMetricWeights = {};
  metricConfig.groups.forEach(group => {
    baselineGroupWeights[group.name] = group.weight;
    group.metrics.forEach(metric => {
      baselineMetricWeights[`${group.name}::${metric.name}`] = metric.weight;
    });
  });

  console.log('\n' + '='.repeat(90));
  console.log('LOCKING STRATEGY');
  console.log('='.repeat(90));
  console.log('\n🔒 LOCKED GROUPS (at baseline):');
  LOCKED_GROUPS.forEach(name => {
    const group = metricConfig.groups.find(g => g.name === name);
    if (group) {
      console.log(`   ${name}: ${(group.weight * 100).toFixed(1)}%`);
    }
  });

  console.log('\n🔧 OPTIMIZABLE GROUPS (grid search):');
  OPTIMIZABLE_GROUPS.forEach(name => {
    const group = metricConfig.groups.find(g => g.name === name);
    if (group) {
      console.log(`   ${name}: ${(group.weight * 100).toFixed(1)}% (test ±${(GRID_RANGE * 100).toFixed(1)}%)`);
    }
  });

  // Generate grid search combinations for weak groups only
  console.log('\n🔄 Generating grid search combinations...');
  
  const optimizableGroupData = OPTIMIZABLE_GROUPS
    .map(name => {
      const group = metricConfig.groups.find(g => g.name === name);
      if (!group) return null;
      return {
        name,
        baselineWeight: group.weight,
        minWeight: Math.max(0.001, group.weight - GRID_RANGE),
        maxWeight: group.weight + GRID_RANGE
      };
    })
    .filter(g => g !== null);

  // Generate grid points for each optimizable group
  const gridPoints = [];
  optimizableGroupData.forEach(group => {
    const points = [];
    for (let w = group.minWeight; w <= group.maxWeight + 0.0001; w += GRID_STEP) {
      points.push(Math.min(w, group.maxWeight));
    }
    group.gridPoints = [...new Set(points)];
  });

  const totalCombinations = optimizableGroupData.reduce((prod, g) => prod * g.gridPoints.length, 1);
  console.log(`Total combinations to test: ${totalCombinations}`);
  console.log(`Limiting to top 50 combinations by correlation...`);

  const testResults = [];
  let tested = 0;
  const maxTests = Math.min(totalCombinations, 500);  // Test up to 500 combinations

  // Generate combinations strategically (not all)
  const step = Math.max(1, Math.floor(totalCombinations / maxTests));

  for (let i = 0; i < totalCombinations; i += step) {
    let combination = i;
    const weights = { ...baselineGroupWeights };

    // Map index to combination
    optimizableGroupData.forEach(group => {
      const pointsPerCombo = optimizableGroupData.reduce((prod, g) => prod * (g === group ? 1 : g.gridPoints.length), 1);
      const idx = Math.floor(combination / pointsPerCombo) % group.gridPoints.length;
      weights[group.name] = group.gridPoints[idx];
      combination %= pointsPerCombo;
    });

    // Normalize weights
    const normalizedWeights = normalizeWeights(weights);

    // Test this combination
    const modifiedGroups = buildModifiedGroups(
      metricConfig.groups,
      normalizedWeights,
      baselineMetricWeights
    );

    const rankingResult = generatePlayerRankings(aggregatedPlayers, {
      groups: modifiedGroups,
      pastPerformance: metricConfig.pastPerformance,
      config: metricConfig.config
    });

    const evaluation = evaluateRankings(rankingResult.players, actualResults);

    testResults.push({
      weights: normalizedWeights,
      ...evaluation
    });

    tested++;
    if (tested % 50 === 0) {
      console.log(`  Tested ${tested}/${maxTests}...`);
    }
  }

  // Sort by correlation (best first)
  testResults.sort((a, b) => b.correlation - a.correlation);

  console.log('\n' + '='.repeat(90));
  console.log('TOP 5 HYBRID CONFIGURATIONS');
  console.log('='.repeat(90));

  testResults.slice(0, 5).forEach((result, idx) => {
    console.log(`\n#${idx + 1} Correlation: ${result.correlation.toFixed(4)}`);
    console.log(`    RMSE: ${result.rmse.toFixed(2)}, Top-10: ${result.top10.toFixed(1)}%, Top-20: ${result.top20.toFixed(1)}%`);
    console.log('    Weights:');
    OPTIMIZABLE_GROUPS.forEach(groupName => {
      const baseline = baselineGroupWeights[groupName];
      const optimized = result.weights[groupName];
      const change = ((optimized - baseline) / baseline) * 100;
      console.log(`      ${groupName.padEnd(30)} ${(optimized * 100).toFixed(1)}% (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`);
    });
  });

  // Compare best hybrid to baseline and single-year
  const bestHybrid = testResults[0];
  const baseline = {
    correlation: 0.0186,
    rmse: 47.85,
    top10: 0.0,
    top20: 5.0,
    label: 'BASELINE'
  };
  const singleYear = {
    correlation: 0.1066,
    rmse: 41.47,
    top10: 20.0,
    top20: 35.0,
    label: 'SINGLE-YEAR OPTIMIZED'
  };

  console.log('\n' + '='.repeat(90));
  console.log('COMPARISON: BASELINE vs SINGLE-YEAR vs BEST HYBRID');
  console.log('='.repeat(90));

  const comparison = [
    { label: 'BASELINE', ...baseline },
    { label: 'SINGLE-YEAR OPTIMIZED (current best)', ...singleYear },
    { label: 'BEST HYBRID (grid search)', correlation: bestHybrid.correlation, rmse: bestHybrid.rmse, top10: bestHybrid.top10, top20: bestHybrid.top20 }
  ];

  console.log('\nConfiguration'.padEnd(35) + 'Correlation'.padEnd(13) + 'RMSE'.padEnd(10) + 'Top-10'.padEnd(10) + 'Top-20');
  console.log('-'.repeat(90));
  comparison.forEach(c => {
    console.log(
      c.label.padEnd(35) +
      `${c.correlation.toFixed(4)}`.padEnd(13) +
      `${c.rmse.toFixed(2)}`.padEnd(10) +
      `${c.top10.toFixed(1)}%`.padEnd(10) +
      `${c.top20.toFixed(1)}%`
    );
  });

  // Determine improvement
  const hybridVsSingle = ((bestHybrid.correlation - singleYear.correlation) / singleYear.correlation) * 100;
  const hybridVsBaseline = ((bestHybrid.correlation - baseline.correlation) / baseline.correlation) * 100;

  console.log('\n' + '='.repeat(90));
  if (bestHybrid.correlation > singleYear.correlation) {
    console.log(`✅ HYBRID WINS: ${hybridVsSingle > 0 ? '+' : ''}${hybridVsSingle.toFixed(2)}% improvement over single-year`);
  } else if (bestHybrid.correlation < singleYear.correlation) {
    console.log(`⚠️  SINGLE-YEAR BETTER: Hybrid is ${Math.abs(hybridVsSingle).toFixed(2)}% below single-year`);
  } else {
    console.log(`➖ TIE with single-year optimization`);
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: 'Sony Open',
    strategy: 'Hybrid Grid-Search (Lock Strong Approach, Optimize Weak Groups)',
    configuration: {
      lockedGroups: LOCKED_GROUPS,
      optimizableGroups: OPTIMIZABLE_GROUPS,
      gridStep: GRID_STEP,
      gridRange: GRID_RANGE,
      totalCombinations: totalCombinations,
      testedCombinations: tested
    },
    bestResult: {
      correlation: bestHybrid.correlation,
      rmse: bestHybrid.rmse,
      top10Accuracy: bestHybrid.top10,
      top20Accuracy: bestHybrid.top20,
      weights: bestHybrid.weights
    },
    comparison: {
      baseline: baseline.correlation,
      singleYearOptimized: singleYear.correlation,
      bestHybrid: bestHybrid.correlation,
      improvementVsSingleYear: hybridVsSingle,
      improvementVsBaseline: hybridVsBaseline
    },
    topConfigurations: testResults.slice(0, 10)
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'hybrid_gridsearch_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Results saved to: output/hybrid_gridsearch_results.json`);
  console.log('='.repeat(90) + '\n');
}

runHybridGridSearch();
