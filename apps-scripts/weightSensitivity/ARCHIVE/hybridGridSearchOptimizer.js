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

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('../core/modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = ROOT_DIR;
const DEFAULT_DATA_DIR = path.resolve(ROOT_DIR, 'data');
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');

function resolveDataFile(fileName) {
  const primary = path.resolve(DATA_DIR, fileName);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.resolve(DEFAULT_DATA_DIR, fileName);
  if (fs.existsSync(fallback)) return fallback;
  return primary;
}

// CLI args
const args = process.argv.slice(2);
let EVENT_ID = '6';
let TOURNAMENT_NAME = null;
let OVERRIDE_EVENT_ID = null;
let OVERRIDE_SEASON = null;
let positionalEventSet = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if ((arg === '--event' || arg === '--eventId') && args[i + 1]) {
    OVERRIDE_EVENT_ID = String(args[i + 1]).trim();
    i++;
    continue;
  }
  if ((arg === '--season' || arg === '--year') && args[i + 1]) {
    const parsedSeason = parseInt(String(args[i + 1]).trim());
    OVERRIDE_SEASON = Number.isNaN(parsedSeason) ? null : parsedSeason;
    i++;
    continue;
  }
  if ((arg === '--tournament' || arg === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
    i++;
    continue;
  }
  if (!arg.startsWith('--')) {
    if (!positionalEventSet && !OVERRIDE_EVENT_ID) {
      EVENT_ID = String(arg).trim();
      positionalEventSet = true;
    } else if (!TOURNAMENT_NAME) {
      TOURNAMENT_NAME = String(arg).trim();
    }
  }
}

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

function parseFinishPosition(posStr) {
  if (!posStr) return null;
  const str = String(posStr).trim().toUpperCase();
  if (str.startsWith('T')) {
    const num = parseInt(str.substring(1));
    return Number.isNaN(num) ? null : num;
  }
  if (str === 'CUT' || str === 'WD' || str === 'DQ') return null;
  const num = parseInt(str);
  return Number.isNaN(num) ? null : num;
}

function shouldInvertMetric(metricLabel, correlation) {
  const lowerIsBetter = metricLabel.includes('Prox') ||
    metricLabel.includes('Scoring Average') ||
    metricLabel.includes('Score') ||
    metricLabel.includes('Poor Shots');

  return lowerIsBetter && correlation < 0;
}

function deriveResultsFromHistory(rawHistoryData, eventId, season) {
  const resultsByPlayer = {};
  const eventIdStr = String(eventId || '').trim();

  rawHistoryData.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const rowSeason = parseInt(String(row['season'] || row['year'] || '').trim());
    const rowYear = parseInt(String(row['year'] || '').trim());
    const rowEventId = String(row['event_id'] || '').trim();
    if (!dgId || !rowEventId) return;
    if (eventIdStr && rowEventId !== eventIdStr) return;
    if (season && !Number.isNaN(season)) {
      if (rowSeason !== season && rowYear !== season) return;
    }

    const finishPosition = parseFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;

    if (!resultsByPlayer[dgId] || finishPosition < resultsByPlayer[dgId]) {
      resultsByPlayer[dgId] = finishPosition;
    }
  });

  return Object.entries(resultsByPlayer).map(([dgId, finishPosition]) => ({ dgId, finishPosition }));
}

function findLatestSeasonWithResults(rawHistoryData, eventId) {
  const eventIdStr = String(eventId || '').trim();
  const seasons = new Set();

  rawHistoryData.forEach(row => {
    const rowEventId = String(row['event_id'] || '').trim();
    if (!rowEventId || (eventIdStr && rowEventId !== eventIdStr)) return;
    const finishPosition = parseFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    const season = parseInt(String(row['season'] || row['year'] || '').trim());
    if (!Number.isNaN(season)) seasons.add(season);
  });

  if (seasons.size === 0) return null;
  return Math.max(...Array.from(seasons));
}

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

function loadInvertedMetrics(outputDir) {
  const correlationPath = path.resolve(outputDir, 'correlation_analysis.json');
  if (!fs.existsSync(correlationPath)) return [];
  try {
    const correlationData = JSON.parse(fs.readFileSync(correlationPath, 'utf8'));
    if (Array.isArray(correlationData.top20SignalCorrelations) && correlationData.top20SignalCorrelations.length > 0) {
      const top20Inverted = correlationData.top20SignalCorrelations
        .filter(entry => shouldInvertMetric(entry.label, entry.correlation))
        .map(entry => entry.label);
      if (top20Inverted.length > 0) return top20Inverted;
    }
    return correlationData.invertedMetrics || [];
  } catch (error) {
    console.warn(`⚠️  Unable to read correlation_analysis.json: ${error.message}`);
    return [];
  }
}

function computeMetricCorrelations(rankedPlayers, actualResults, metricConfig) {
  const actualMap = new Map(actualResults.map(r => [String(r.dgId), r.finishPosition]));
  const correlations = [];
  let globalIdx = 0;

  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      const metricLabel = `${group.name}::${metric.name}`;
      const metricValues = [];
      const positions = [];

      rankedPlayers.forEach(player => {
        const actualPosition = actualMap.get(String(player.dgId));
        if (!actualPosition) return;
        const metricValue = player.metrics[globalIdx];
        if (typeof metricValue === 'number' && !isNaN(metricValue) && isFinite(metricValue)) {
          metricValues.push(metricValue);
          positions.push(actualPosition);
        }
      });

      const correlation = metricValues.length >= 3
        ? calculatePearsonCorrelation(metricValues, positions)
        : 0;

      correlations.push({
        group: group.name,
        metric: metric.name,
        label: metricLabel,
        correlation,
        absCorrelation: Math.abs(correlation),
        sampleSize: metricValues.length
      });

      globalIdx++;
    });
  });

  return correlations;
}

function buildMetricWeightOverridesFromCorrelations(metricConfig, correlations, baselineMetricWeights) {
  const correlationMap = new Map(correlations.map(c => [c.label, c.absCorrelation]));
  const overrides = {};

  metricConfig.groups.forEach(group => {
    const metricKeys = group.metrics.map(metric => `${group.name}::${metric.name}`);
    const total = metricKeys.reduce((sum, key) => sum + (correlationMap.get(key) || 0), 0);

    metricKeys.forEach(key => {
      const baseline = baselineMetricWeights[key];
      if (total > 0) {
        overrides[key] = { weight: (correlationMap.get(key) || 0) / total };
      } else if (typeof baseline === 'number') {
        overrides[key] = { weight: baseline };
      }
    });
  });

  return overrides;
}

function runModelWithWeights(players, groupWeights, metricOverrides, config, invertedMetrics = []) {
  const normalizedGroupWeights = normalizeWeights(groupWeights);
  const modifiedGroups = buildModifiedGroups(
    config.groups,
    normalizedGroupWeights,
    metricOverrides
  );

  let rankedPlayers = players;
  if (!Array.isArray(players)) {
    const initialResult = generatePlayerRankings(players, {
      groups: config.groups,
      pastPerformance: config.pastPerformance,
      config: config.config
    });
    rankedPlayers = initialResult.players;
  }

  const playersWithInversion = rankedPlayers.map(player => {
    const metrics = [...player.metrics];
    let globalIdx = 0;
    config.groups.forEach(group => {
      group.metrics.forEach(metric => {
        const key = `${group.name}::${metric.name}`;
        if (invertedMetrics.includes(key) && typeof metrics[globalIdx] === 'number') {
          metrics[globalIdx] = -metrics[globalIdx];
        }
        globalIdx++;
      });
    });

    return { ...player, metrics };
  });

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
  const CONFIG_PATH = resolveDataFile('Sony Open (2026) - Configuration Sheet.csv');
  const RESULTS_PATH = resolveDataFile('Sony Open (2026) - Tournament Results.csv');
  const FIELD_PATH = resolveDataFile('Sony Open (2026) - Tournament Field.csv');
  const HISTORY_PATH = resolveDataFile('Sony Open (2026) - Historical Data.csv');
  const APPROACH_PATH = resolveDataFile('Sony Open (2026) - Approach Skill.csv');

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const CURRENT_EVENT_ID = OVERRIDE_EVENT_ID || sharedConfig.currentEventId || EVENT_ID;
  const CURRENT_SEASON = OVERRIDE_SEASON ?? parseInt(sharedConfig.currentSeason || sharedConfig.currentYear || 2026);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: CURRENT_EVENT_ID
  });

  console.log('🔄 Loading data...');
  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });

  // Load actual results (if provided)
  function loadActualResults(resultsPath) {
    const rawData = loadCsv(resultsPath, { skipFirstColumn: true });
    const results = [];
    rawData.forEach(row => {
      const dgId = String(row['DG ID'] || '').trim();
      const posStr = String(row['Finish Position'] || '').trim().toUpperCase();
      if (!dgId) return;
      
      const finishPosition = parseFinishPosition(posStr);
      if (finishPosition && !Number.isNaN(finishPosition)) {
        results.push({ dgId, finishPosition });
      }
    });
    return results;
  }

  let actualResults = [];
  let resultsSource = 'results-file';
  let resultsSeason = CURRENT_SEASON;

  if (fs.existsSync(RESULTS_PATH)) {
    actualResults = loadActualResults(RESULTS_PATH);
  } else {
    resultsSource = 'historical-data';
    actualResults = deriveResultsFromHistory(historyData, CURRENT_EVENT_ID, CURRENT_SEASON);

    if (actualResults.length === 0) {
      resultsSeason = null;
      actualResults = deriveResultsFromHistory(historyData, CURRENT_EVENT_ID, null);
      console.log(`⚠️  No results for season ${CURRENT_SEASON}. Using all historical seasons for event ${CURRENT_EVENT_ID}.`);
    }
  }

  if (actualResults.length === 0) {
    console.error('\n❌ No results available to evaluate configurations.');
    console.error('   Ensure Historical Data contains fin_text for the selected event.');
    process.exit(1);
  }

  const resultsLabel = resultsSource === 'results-file'
    ? 'tournament results file'
    : (resultsSeason ? `historical data (season ${resultsSeason})` : 'historical data (all seasons)');

  console.log(`✓ Loaded ${actualResults.length} results from ${resultsLabel}`);

  // Build player data
  console.log('🔄 Building player data...');
  const { players, historicalData, approachData: approachDataObj } = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId: CURRENT_EVENT_ID
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

  // Inverted metrics (if available)
  const baselineRanking = generatePlayerRankings(aggregatedPlayers, {
    groups: metricConfig.groups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });

  let invertedMetrics = [];
  let metricWeightOverrides = baselineMetricWeights;
  let correlationSummary = null;

  if (resultsSource === 'historical-data') {
    const correlations = computeMetricCorrelations(baselineRanking.players, actualResults, metricConfig);
    invertedMetrics = correlations
      .filter(corr => shouldInvertMetric(corr.label, corr.correlation))
      .map(corr => corr.label);
    metricWeightOverrides = buildMetricWeightOverridesFromCorrelations(
      metricConfig,
      correlations,
      baselineMetricWeights
    );
    correlationSummary = correlations;
    console.log(`\n📊 Derived ${invertedMetrics.length} inverted metrics from historical correlations`);
  } else {
    invertedMetrics = loadInvertedMetrics(OUTPUT_DIR);
    if (invertedMetrics.length > 0) {
      console.log(`\n📊 Applying ${invertedMetrics.length} inverted metrics from correlation_analysis.json`);
    } else {
      console.log('\n⚠️  No inverted metrics found. Running without metric inversion.');
    }
  }

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
  optimizableGroupData.forEach(group => {
    const points = [];
    for (let w = group.minWeight; w <= group.maxWeight + 0.0001; w += GRID_STEP) {
      points.push(Math.min(w, group.maxWeight));
    }
    group.gridPoints = [...new Set(points)];
  });

  const totalCombinations = optimizableGroupData.reduce((prod, g) => prod * g.gridPoints.length, 1);
  console.log(`Total combinations to test: ${totalCombinations}`);
  console.log(`Sampling up to ${Math.min(totalCombinations, 500)} combinations for evaluation...`);

  const testResults = [];
  let tested = 0;
  const maxTests = Math.min(totalCombinations, 500);  // Test up to 500 combinations

  // Generate combinations strategically (not all)
  const step = Math.max(1, Math.floor(totalCombinations / maxTests));

  const radices = optimizableGroupData.map(group => group.gridPoints.length);

  for (let i = 0; i < totalCombinations; i += step) {
    let combination = i;
    const weights = { ...baselineGroupWeights };

    // Map index to combination (mixed radix)
    optimizableGroupData.forEach((group, idx) => {
      const radix = radices[idx];
      const pointIndex = combination % radix;
      weights[group.name] = group.gridPoints[pointIndex];
      combination = Math.floor(combination / radix);
    });

    // Normalize weights
    const normalizedWeights = normalizeWeights(weights);

    // Test this combination
    const predictions = runModelWithWeights(
      aggregatedPlayers,
      normalizedWeights,
      metricWeightOverrides,
      metricConfig,
      invertedMetrics
    );

    const evaluation = evaluateRankings(predictions, actualResults);

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

  // Compare best hybrid to baseline
  const bestHybrid = testResults[0];
  const baselinePredictions = runModelWithWeights(
    aggregatedPlayers,
    baselineGroupWeights,
    metricWeightOverrides,
    metricConfig,
    invertedMetrics
  );
  const baseline = evaluateRankings(baselinePredictions, actualResults);

  console.log('\n' + '='.repeat(90));
  console.log('COMPARISON: BASELINE vs BEST HYBRID');
  console.log('='.repeat(90));

  const comparison = [
    { label: 'BASELINE', ...baseline },
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
  const hybridVsBaseline = baseline.correlation === 0
    ? null
    : ((bestHybrid.correlation - baseline.correlation) / baseline.correlation) * 100;

  console.log('\n' + '='.repeat(90));
  if (hybridVsBaseline === null) {
    console.log('⚠️  Baseline correlation is 0. Unable to compute % improvement.');
  } else if (bestHybrid.correlation > baseline.correlation) {
    console.log(`✅ HYBRID WINS: ${hybridVsBaseline > 0 ? '+' : ''}${hybridVsBaseline.toFixed(2)}% improvement over baseline`);
  } else if (bestHybrid.correlation < baseline.correlation) {
    console.log(`⚠️  BASELINE BETTER: Hybrid is ${Math.abs(hybridVsBaseline).toFixed(2)}% below baseline`);
  } else {
    console.log('➖ TIE with baseline');
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: CURRENT_EVENT_ID,
    season: resultsSeason,
    tournament: TOURNAMENT_NAME || 'Sony Open',
    resultsSource,
    strategy: 'Hybrid Grid-Search (Lock Strong Approach, Optimize Weak Groups)',
    configuration: {
      lockedGroups: LOCKED_GROUPS,
      optimizableGroups: OPTIMIZABLE_GROUPS,
      invertedMetrics,
      gridStep: GRID_STEP,
      gridRange: GRID_RANGE,
      totalCombinations: totalCombinations,
      testedCombinations: tested
    },
    correlationSummary: correlationSummary ? correlationSummary.slice(0, 50) : null,
    bestResult: {
      correlation: bestHybrid.correlation,
      rmse: bestHybrid.rmse,
      top10Accuracy: bestHybrid.top10,
      top20Accuracy: bestHybrid.top20,
      weights: bestHybrid.weights
    },
    comparison: {
      baseline: baseline.correlation,
      bestHybrid: bestHybrid.correlation,
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
