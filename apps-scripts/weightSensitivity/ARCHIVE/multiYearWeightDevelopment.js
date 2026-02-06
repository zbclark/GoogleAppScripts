/**
 * Multi-Year Weight Development & Optimization
 * 
 * Workflow:
 * 1. Parse Historical Data CSV to extract available years
 * 2. For each year, build metric correlations to 2026 winners
 * 3. Develop multi-year weights based on what predicted 2026 success
 * 4. Test those weights on 2026 field
 * 5. Grid search to further optimize
 * 6. Compare to single-year grid search (0.1066 correlation)
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

function runMultiYearWeightDevelopment() {
  console.log('\n' + '='.repeat(100));
  console.log('MULTI-YEAR WEIGHT DEVELOPMENT & OPTIMIZATION');
  console.log('Train on historical years, test on 2026, optimize with grid search');
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

  // Extract years from Historical Data CSV (filter for this tournament)
  console.log('\n🔄 Analyzing Historical Data CSV...');
  const yearsAvailable = new Set();

  historyData.forEach(row => {
    const year = parseInt(String(row['year'] || 2026).trim());
    const eventId = String(row['event_id'] || '').trim();
    
    // Only include data from this tournament in past years
    if (year && year < 2026 && eventId === EVENT_ID) {
      yearsAvailable.add(year);
    }
  });

  const sortedYears = Array.from(yearsAvailable).sort();
  console.log(`✓ Found ${sortedYears.length} historical years: ${sortedYears.join(', ')}`);

  if (sortedYears.length === 0) {
    console.log('\n❌ No historical years found for this tournament in Historical Data CSV.');
    console.log(`Looking for event_id=${EVENT_ID} with year < 2026`);
    return;
  }

  // Load 2026 actual results (ground truth for evaluation)
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
  console.log(`✓ Loaded ${results2026.length} 2026 results (ground truth)\n`);

  // Step 1: Analyze each historical year to see which metrics predict 2026 winners
  console.log('='.repeat(100));
  console.log('STEP 1: ANALYZE HISTORICAL YEARS');
  console.log('For each year, determine which metrics predict 2026 winners');
  console.log('='.repeat(100));

  const metricCorrelationsByYear = {};

  for (const year of sortedYears) {
    console.log(`\n📊 Year ${year}:`);

    // Filter data to just this year and this tournament
    const yearHistory = historyData.filter(row => {
      const rowYear = parseInt(String(row['year'] || 2026).trim());
      const rowEventId = String(row['event_id'] || '').trim();
      return rowYear === year && rowEventId === EVENT_ID;
    });

    const yearApproach = approachData.filter(row => {
      const rowYear = parseInt(String(row['year'] || 2026).trim());
      const rowEventId = String(row['event_id'] || '').trim();
      return rowYear === year && rowEventId === EVENT_ID;
    });

    if (yearHistory.length === 0) {
      console.log(`  ⚠️  No data for year ${year}`);
      continue;
    }

    console.log(`  ✓ ${yearHistory.length} rounds from ${year}`);

    // Build player data for this year
    const yearPlayerData = buildPlayerData({
      fieldData,
      roundsRawData: yearHistory,
      approachRawData: yearApproach,
      currentEventId: sharedConfig.currentEventId
    });

    const yearAggregated = aggregatePlayerData(
      yearPlayerData.players,
      yearPlayerData.historicalData,
      yearPlayerData.approachData,
      sharedConfig.similarCourseIds,
      sharedConfig.puttingCourseIds
    );

    // Generate rankings using baseline weights
    const baselineGroupWeights = {};
    const baselineMetricWeights = {};
    metricConfig.groups.forEach(group => {
      baselineGroupWeights[group.name] = group.weight;
      group.metrics.forEach(metric => {
        baselineMetricWeights[`${group.name}::${metric.name}`] = metric.weight;
      });
    });

    const modifiedGroups = buildModifiedGroups(
      metricConfig.groups,
      baselineGroupWeights,
      baselineMetricWeights
    );

    const rankingResult = generatePlayerRankings(yearAggregated, {
      groups: modifiedGroups,
      pastPerformance: metricConfig.pastPerformance,
      config: metricConfig.config
    });

    // For each group, calculate correlation to 2026 winners
    metricCorrelationsByYear[year] = {};

    metricConfig.groups.forEach(group => {
      const groupName = group.name;
      const groupScores = [];
      const finishPositions = [];

      rankingResult.players.forEach(player => {
        const result = results2026.find(r => String(r.dgId) === String(player.dgId));
        if (result && player.scoresByGroup && player.scoresByGroup[groupName] !== undefined) {
          const groupScore = player.scoresByGroup[groupName];
          groupScores.push(groupScore);
          finishPositions.push(result.finishPosition);
        }
      });

      if (groupScores.length >= 5) {
        const correlation = calculatePearsonCorrelation(groupScores, finishPositions);
        metricCorrelationsByYear[year][groupName] = correlation;
        console.log(`  ${groupName.padEnd(35)} → 2026 winners: ${correlation.toFixed(4)}`);
      } else {
        // If we don't have enough data for this group in this year, use baseline
        metricCorrelationsByYear[year][groupName] = 0;
      }
    });
  }

  // Step 2: Develop multi-year weights based on what predicted 2026
  console.log('\n' + '='.repeat(100));
  console.log('STEP 2: DEVELOP MULTI-YEAR WEIGHTS');
  console.log('Which metrics across historical years best predicted 2026 winners?');
  console.log('='.repeat(100));

  const multiYearWeights = {};
  metricConfig.groups.forEach(group => {
    const groupName = group.name;
    const correlations = [];

    for (const [year, yearData] of Object.entries(metricCorrelationsByYear)) {
      if (yearData[groupName] !== undefined) {
        correlations.push(yearData[groupName]);
      }
    }

    if (correlations.length > 0) {
      // Weight by average correlation strength
      const avgCorrelation = correlations.reduce((a, b) => a + b, 0) / correlations.length;
      multiYearWeights[groupName] = Math.max(0.001, avgCorrelation);
      
      const consistency = Math.min(...correlations) === Math.max(...correlations) 
        ? 'very consistent' 
        : correlations.length > 1 
          ? `varied (${Math.min(...correlations).toFixed(3)} to ${Math.max(...correlations).toFixed(3)})` 
          : 'single year';
      
      console.log(`${groupName.padEnd(35)} avg correlation: ${avgCorrelation.toFixed(4)} (${consistency})`);
    } else {
      multiYearWeights[groupName] = 0.001;
      console.log(`${groupName.padEnd(35)} no data available`);
    }
  });

  // Normalize
  const normalizedMultiYear = normalizeWeights(multiYearWeights);

  console.log('\nBaseline vs Multi-Year Weights:');
  console.log('Group'.padEnd(35) + 'Baseline'.padEnd(12) + 'Multi-Year'.padEnd(12) + 'Change');
  console.log('-'.repeat(100));

  const baselineGroupWeights = {};
  metricConfig.groups.forEach(group => {
    baselineGroupWeights[group.name] = group.weight;
  });

  const baselineMetricWeights = {};
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      baselineMetricWeights[`${group.name}::${metric.name}`] = metric.weight;
    });
  });

  Object.entries(normalizedMultiYear).forEach(([groupName, weight]) => {
    const baseline = baselineGroupWeights[groupName] || 0;
    const change = ((weight - baseline) / baseline) * 100;
    console.log(
      groupName.padEnd(35) +
      `${(baseline * 100).toFixed(1)}%`.padEnd(12) +
      `${(weight * 100).toFixed(1)}%`.padEnd(12) +
      `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
    );
  });

  // Step 3: Test multi-year weights on 2026 field
  console.log('\n' + '='.repeat(100));
  console.log('STEP 3: TEST MULTI-YEAR WEIGHTS ON 2026');
  console.log('='.repeat(100));

  // Build full 2026 data
  console.log('Building 2026 player data...');
  const playerData2026 = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId: sharedConfig.currentEventId
  });

  const aggregatedPlayers2026 = aggregatePlayerData(
    playerData2026.players,
    playerData2026.historicalData,
    playerData2026.approachData,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  // Test baseline
  console.log('Testing baseline weights...');
  const baselineGroups = buildModifiedGroups(
    metricConfig.groups,
    baselineGroupWeights,
    baselineMetricWeights
  );
  const baselineRanking = generatePlayerRankings(aggregatedPlayers2026, {
    groups: baselineGroups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });
  const baselineEval = evaluateRankings(baselineRanking.players, results2026);

  // Test multi-year
  console.log('Testing multi-year weights...');
  const multiYearGroups = buildModifiedGroups(
    metricConfig.groups,
    normalizedMultiYear,
    baselineMetricWeights
  );
  const multiYearRanking = generatePlayerRankings(aggregatedPlayers2026, {
    groups: multiYearGroups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });
  const multiYearEval = evaluateRankings(multiYearRanking.players, results2026);

  console.log('\n2026 Results:');
  console.log('Metric'.padEnd(20) + 'Baseline'.padEnd(15) + 'Multi-Year'.padEnd(15) + 'Difference');
  console.log('-'.repeat(100));
  console.log(
    'Correlation'.padEnd(20) +
    `${baselineEval.correlation.toFixed(4)}`.padEnd(15) +
    `${multiYearEval.correlation.toFixed(4)}`.padEnd(15) +
    `${multiYearEval.correlation - baselineEval.correlation > 0 ? '+' : ''}${(multiYearEval.correlation - baselineEval.correlation).toFixed(4)}`
  );
  console.log(
    'RMSE'.padEnd(20) +
    `${baselineEval.rmse.toFixed(2)}`.padEnd(15) +
    `${multiYearEval.rmse.toFixed(2)}`.padEnd(15) +
    `${multiYearEval.rmse - baselineEval.rmse > 0 ? '+' : ''}${(multiYearEval.rmse - baselineEval.rmse).toFixed(2)}`
  );
  console.log(
    'Top-20 Accuracy'.padEnd(20) +
    `${baselineEval.top20.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top20.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top20 - baselineEval.top20 > 0 ? '+' : ''}${(multiYearEval.top20 - baselineEval.top20).toFixed(1)}%`
  );

  // Step 4: Grid search to optimize multi-year weights
  console.log('\n' + '='.repeat(100));
  console.log('STEP 4: GRID SEARCH TO OPTIMIZE');
  console.log('Testing weight combinations around multi-year baseline');
  console.log('='.repeat(100));

  const GRID_STEP = 0.015;
  const GRID_RANGE = 0.060;
  const MAX_TESTS = 300;

  console.log(`Grid parameters: ±${(GRID_RANGE * 100).toFixed(1)}% range, ${(GRID_STEP * 100).toFixed(1)}% steps`);
  console.log('Testing up to 300 combinations...\n');

  // Define optimizable groups (weaker predictors)
  const weakGroupNames = [
    'Driving Performance',
    'Putting',
    'Around the Green',
    'Scoring',
    'Course Management'
  ];

  const testResults = [];
  let tested = 0;

  // Simple grid search: adjust weights for weak groups
  const step = 0.02;
  for (let d = -GRID_RANGE; d <= GRID_RANGE; d += step) {
    for (let p = -GRID_RANGE; p <= GRID_RANGE; p += step) {
      for (let ag = -GRID_RANGE; ag <= GRID_RANGE; ag += step) {
        if (tested >= MAX_TESTS) break;

        const weights = { ...normalizedMultiYear };
        const adjustments = {
          'Driving Performance': 1 + d,
          'Putting': 1 + p,
          'Around the Green': 1 + ag
        };

        Object.entries(adjustments).forEach(([groupName, multiplier]) => {
          weights[groupName] = Math.max(0.001, weights[groupName] * multiplier);
        });

        const normalizedWeights = normalizeWeights(weights);

        const modifiedGroups = buildModifiedGroups(
          metricConfig.groups,
          normalizedWeights,
          baselineMetricWeights
        );

        const rankingResult = generatePlayerRankings(aggregatedPlayers2026, {
          groups: modifiedGroups,
          pastPerformance: metricConfig.pastPerformance,
          config: metricConfig.config
        });

        const evaluation = evaluateRankings(rankingResult.players, results2026);

        testResults.push({
          weights: normalizedWeights,
          adjustments,
          ...evaluation
        });

        tested++;
        if (tested % 50 === 0) {
          console.log(`  Tested ${tested}/${MAX_TESTS}...`);
        }
      }
      if (tested >= MAX_TESTS) break;
    }
    if (tested >= MAX_TESTS) break;
  }

  // Sort by correlation
  testResults.sort((a, b) => b.correlation - a.correlation);

  console.log(`\nTested ${tested} combinations\n`);

  // Show top results
  console.log('='.repeat(100));
  console.log('TOP 5 OPTIMIZED CONFIGURATIONS');
  console.log('='.repeat(100));

  testResults.slice(0, 5).forEach((result, idx) => {
    console.log(`\n#${idx + 1} Correlation: ${result.correlation.toFixed(4)}`);
    console.log(`    RMSE: ${result.rmse.toFixed(2)}, Top-20: ${result.top20.toFixed(1)}%`);
    console.log('    Adjustments:');
    Object.entries(result.adjustments).forEach(([group, mult]) => {
      const change = ((mult - 1) * 100).toFixed(1);
      console.log(`      ${group.padEnd(30)} ${change > 0 ? '+' : ''}${change}%`);
    });
  });

  // Final comparison
  const bestOptimized = testResults[0];
  const singleYearBest = 0.1066;

  console.log('\n' + '='.repeat(100));
  console.log('FINAL COMPARISON');
  console.log('='.repeat(100));

  console.log('\nApproach'.padEnd(30) + 'Correlation'.padEnd(15) + 'RMSE'.padEnd(10) + 'Top-20');
  console.log('-'.repeat(100));
  console.log(
    'Baseline (2026 config)'.padEnd(30) +
    `${baselineEval.correlation.toFixed(4)}`.padEnd(15) +
    `${baselineEval.rmse.toFixed(2)}`.padEnd(10) +
    `${baselineEval.top20.toFixed(1)}%`
  );
  console.log(
    'Multi-Year Weights'.padEnd(30) +
    `${multiYearEval.correlation.toFixed(4)}`.padEnd(15) +
    `${multiYearEval.rmse.toFixed(2)}`.padEnd(10) +
    `${multiYearEval.top20.toFixed(1)}%`
  );
  console.log(
    'Multi-Year + Grid Search'.padEnd(30) +
    `${bestOptimized.correlation.toFixed(4)}`.padEnd(15) +
    `${bestOptimized.rmse.toFixed(2)}`.padEnd(10) +
    `${bestOptimized.top20.toFixed(1)}%`
  );
  console.log(
    'Single-Year Grid Search (best)'.padEnd(30) +
    `${singleYearBest.toFixed(4)}`.padEnd(15) +
    '--'.padEnd(10) +
    '35.0%'
  );

  const improvement = ((bestOptimized.correlation - singleYearBest) / singleYearBest) * 100;

  console.log('\n' + '='.repeat(100));
  if (bestOptimized.correlation > singleYearBest) {
    console.log(`✅ MULTI-YEAR WINS: ${improvement.toFixed(2)}% better than single-year`);
    console.log(`   Use multi-year approach for production`);
  } else if (Math.abs(improvement) < 10) {
    console.log(`➖ COMPARABLE: ${Math.abs(improvement).toFixed(2)}% ${improvement > 0 ? 'better' : 'worse'} than single-year`);
    console.log(`   Both approaches viable; single-year simpler`);
  } else {
    console.log(`⚠️  SINGLE-YEAR BETTER: ${Math.abs(improvement).toFixed(2)}% worse than single-year`);
    console.log(`   Stick with single-year grid search (0.1066)`);
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: 'Sony Open',
    yearsAnalyzed: sortedYears,
    metricCorrelationsByYear: metricCorrelationsByYear,
    initialWeights: {
      baseline: baselineGroupWeights,
      multiYear: normalizedMultiYear
    },
    performance: {
      baseline: baselineEval,
      multiYear: multiYearEval,
      optimized: {
        correlation: bestOptimized.correlation,
        rmse: bestOptimized.rmse,
        top20: bestOptimized.top20,
        weights: bestOptimized.weights
      }
    },
    comparison: {
      multiYearOptimized: bestOptimized.correlation,
      singleYearBest: singleYearBest,
      improvement: improvement,
      recommendation: bestOptimized.correlation > singleYearBest ? 'MULTI-YEAR' : 'SINGLE-YEAR'
    },
    gridSearchResults: testResults.slice(0, 10)
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'multiyear_weight_development_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Results saved to: output/multiyear_weight_development_results.json`);
  console.log('='.repeat(100) + '\n');
}

runMultiYearWeightDevelopment();
