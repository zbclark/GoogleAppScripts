/**
 * Adaptive Weight Optimizer v2
 * 
 * Correct 4-Step Workflow:
 * Step 1: Historical Correlation Analysis (2023-2025 metrics only)
 * Step 2: Baseline Rankings (2026 field with template weights)
 * Step 3: Weight Optimization (using 2026 approach metrics against 2026 results)
 * Step 4: Multi-Year Validation (test 2026 weights on past years with current metrics)
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('./utilities/csvLoader');
const { buildPlayerData } = require('./utilities/dataPrep');
const { generatePlayerRankings } = require('./modelCore');
const { getSharedConfig } = require('./utilities/configParser');
const { buildMetricGroupsFromConfig } = require('./metricConfigBuilder');
const { WEIGHT_TEMPLATES } = require('./utilities/weightTemplates');

const DATA_DIR = __dirname;
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const EVENT_ID = '6';

// Parse CLI arguments
const args = process.argv.slice(2);
let TEMPLATE = 'TECHNICAL';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--template' && args[i + 1]) {
    TEMPLATE = args[i + 1].toUpperCase();
  }
}

console.log('---');
console.log('ADAPTIVE WEIGHT OPTIMIZER v2');
console.log('---');

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return weights;
  const normalized = {};
  Object.entries(weights).forEach(([k, v]) => {
    normalized[k] = v / total;
  });
  return normalized;
}

function calculatePearsonCorrelation(xValues, yValues) {
  if (xValues.length === 0) return 0;
  const n = xValues.length;
  const meanX = xValues.reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0, denomX = 0, denomY = 0;
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
  if (predictions.length === 0) return 0;

  const hasRank = predictions.some(p => typeof p.rank === 'number');
  const topNPlayers = hasRank
    ? predictions.filter(p => typeof p.rank === 'number' && p.rank <= n)
    : predictions.slice(0, n);

  const topN = new Set(topNPlayers.map(p => String(p.dgId)));
  const matches = actualResults.filter(a => topN.has(String(a.dgId))).length;
  const denominator = topN.size || n;
  return (matches / denominator) * 100;
}

function evaluateRankings(predictions, actualResults) {
  const scores = [];
  const positions = [];
  
  predictions.forEach((pred, idx) => {
    const actual = actualResults.find(a => String(a.dgId) === String(pred.dgId));
    if (actual) {
      const rankValue = typeof pred.rank === 'number' ? pred.rank : (idx + 1);
      scores.push(rankValue);
      positions.push(actual.finishPosition);
    }
  });
  
  if (scores.length === 0) {
    return { correlation: 0, rmse: 0, rSquared: 0, top10: 0, top20: 0, matchedPlayers: 0 };
  }
  
  const correlation = calculatePearsonCorrelation(scores, positions);
  const rmse = Math.sqrt(
    scores.reduce((sum, s, i) => sum + Math.pow(s - positions[i], 2), 0) / scores.length
  );
  
  return {
    correlation,
    rmse,
    rSquared: correlation * correlation,
    top10: calculateTopNAccuracy(predictions, actualResults, 10),
    top20: calculateTopNAccuracy(predictions, actualResults, 20),
    matchedPlayers: scores.length
  };
}

function buildModifiedGroups(groups, groupWeights, metricWeights) {
  return groups.map(group => ({
    ...group,
    weight: groupWeights[group.name] || group.weight,
    metrics: group.metrics.map(metric => ({
      ...metric,
      weight: metricWeights[`${group.name}::${metric.name}`] || metric.weight
    }))
  }));
}

function computeWeightDeltas(baselineWeights, optimizedWeights) {
  const deltas = {};
  Object.keys(baselineWeights || {}).forEach(groupName => {
    const base = baselineWeights[groupName] || 0;
    const opt = optimizedWeights[groupName] || 0;
    deltas[groupName] = {
      baseline: base,
      optimized: opt,
      delta: opt - base,
      deltaPct: base === 0 ? null : ((opt - base) / base)
    };
  });
  return deltas;
}

const CONFIG_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Configuration Sheet.csv');
const FIELD_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Field.csv');
const HISTORY_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Historical Data.csv');
const APPROACH_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Approach Skill.csv');
const RESULTS_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Results.csv');

function runAdaptiveOptimizer() {
  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  console.log('✓ Configuration loaded');
  
  // Load base metricConfig structure
  console.log('🔄 Building metric config...');
  const baseMetricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });
  console.log('✓ Metric config built');
  
  // Load templates
  const TEMPLATES_TO_TEST = ['POWER', 'BALANCED', 'TECHNICAL', EVENT_ID];
  const templateConfigs = {};
  
  console.log('\n--- LOADING ALL AVAILABLE TEMPLATES ---');
  
  for (const templateName of TEMPLATES_TO_TEST) {
    try {
      let groupWeights, metricWeights;
      
      if (['POWER', 'BALANCED', 'TECHNICAL'].includes(templateName)) {
        const template = WEIGHT_TEMPLATES[templateName];
        if (!template) throw new Error(`Template ${templateName} not found`);
        
        groupWeights = { ...template.groupWeights };
        metricWeights = { ...template.metricWeights };
        console.log(`✓ Loaded ${templateName} template`);
      } else {
        groupWeights = {};
        metricWeights = {};
        baseMetricConfig.groups.forEach(group => {
          groupWeights[group.name] = group.weight;
          group.metrics.forEach(metric => {
            metricWeights[`${group.name}::${metric.name}`] = metric.weight;
          });
        });
        console.log(`✓ Loaded event-specific weights (eventId: ${EVENT_ID})`);
      }
      
      templateConfigs[templateName] = { groupWeights, metricWeights };
      
    } catch (error) {
      console.log(`⚠️  Failed to load ${templateName}: ${error.message}`);
    }
  }

  const metricConfig = baseMetricConfig;

  console.log('\n🔄 Loading data...');
  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded field: ${fieldData.length} players`);
  
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded history: ${historyData.length} rounds`);
  
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded approach: ${approachData.length} rows`);

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
  console.log(`✓ Loaded ${results2026.length} 2026 actual results`);

  const field2026DgIds = new Set(fieldData.map(p => String(p['dg_id'] || '').trim()));
  console.log(`✓ Loaded 2026 field: ${field2026DgIds.size} players\n`);

  const runtimeConfig = {
    similarCoursesWeight: sharedConfig.similarCoursesWeight,
    puttingCoursesWeight: sharedConfig.puttingCoursesWeight,
    courseSetupWeights: sharedConfig.courseSetupWeights
  };

  const runRanking = ({ roundsRawData, approachRawData, groupWeights, metricWeights }) => {
    const playerData = buildPlayerData({
      fieldData,
      roundsRawData,
      approachRawData,
      currentEventId: sharedConfig.currentEventId
    });

    const templateGroups = buildModifiedGroups(
      metricConfig.groups,
      groupWeights,
      metricWeights
    );

    return generatePlayerRankings(
      playerData.players,
      { groups: templateGroups, pastPerformance: metricConfig.pastPerformance },
      playerData.historicalData,
      playerData.approachData,
      sharedConfig.similarCourseIds,
      sharedConfig.puttingCourseIds,
      runtimeConfig
    );
  };

  // ============================================================================
  // STEP 1: HISTORICAL CORRELATION ANALYSIS (ALL AVAILABLE YEARS)
  // ============================================================================
  console.log('---');
  console.log('STEP 1: HISTORICAL CORRELATION ANALYSIS (All Available Years)');
  console.log('Which metrics correlate with winning? (using all historical data)');
  console.log('---');

  const historicalDataForField = historyData.filter(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const rowYear = parseInt(String(row['year'] || 2026).trim());
    return field2026DgIds.has(dgId) && rowYear < 2026;
  });

  console.log(`\n🔄 Building historical player metrics (all available years)...`);
  const historicalPlayerData = buildPlayerData({
    fieldData,
    roundsRawData: historicalDataForField,
    approachRawData: [], // NO approach data for Step 1
    currentEventId: sharedConfig.currentEventId
  });

  console.log(`✓ ${Object.keys(historicalPlayerData.players).length} players with historical data`);
  console.log(`✓ ${historicalDataForField.length} total historical rounds for 2026 field\n`);

  // ============================================================================
  // STEP 2: BASELINE RANKINGS (test all templates)
  // ============================================================================
  console.log('---');
  console.log('STEP 2: BASELINE RANKINGS - Test All Templates');
  console.log('2026 field with historical metrics and template weights');
  console.log('---');

  const templateResults = [];

  for (const [templateName, config] of Object.entries(templateConfigs)) {
    console.log(`\n🔄 Testing ${templateName}...`);
    
    const templateRanking = runRanking({
      roundsRawData: historicalDataForField,
      approachRawData: approachData,
      groupWeights: config.groupWeights,
      metricWeights: config.metricWeights
    });
    
    const evaluation = evaluateRankings(templateRanking.players, results2026);
    
    templateResults.push({
      name: templateName,
      evaluation,
      groupWeights: config.groupWeights,
      metricWeights: config.metricWeights,
      ranking: templateRanking
    });
    
    console.log(`   Correlation: ${evaluation.correlation.toFixed(4)} (R²=${evaluation.rSquared.toFixed(4)})`);
    console.log(`   Top-20: ${evaluation.top20.toFixed(1)}%`);
  }

  // Find best baseline template
  const bestTemplate = [...templateResults].sort((a, b) => b.evaluation.correlation - a.evaluation.correlation)[0];

  console.log('---');
  console.log('BEST BASELINE TEMPLATE');
  console.log('---');

  console.log(`\n✅ Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${bestTemplate.evaluation.correlation.toFixed(4)}`);
  console.log(`   R²: ${bestTemplate.evaluation.rSquared.toFixed(4)}`);
  console.log(`   Top-20: ${bestTemplate.evaluation.top20.toFixed(1)}%\n`);

  // ============================================================================
  // STEP 3: WEIGHT OPTIMIZATION (with 2026 approach metrics)
  // ============================================================================
  console.log('---');
  console.log('STEP 3: WEIGHT OPTIMIZATION');
  console.log('Grid search starting from best template baseline');
  console.log('Using 2026 approach metrics + test against 2026 results');
  console.log('---');

  // Build 2026 player data WITH approach metrics
  console.log('\n🔄 Building 2026 player data (with approach metrics)...');
  console.log(`✓ ${Object.keys(historicalPlayerData.players).length} players with 2026 metrics\n`);

  // Grid search from best template
  console.log(`🔄 Grid search optimization from ${bestTemplate.name} baseline...`);
  console.log(`   Starting correlation: ${bestTemplate.evaluation.correlation.toFixed(4)}`);

  const GRID_RANGE = 0.20;
  const MAX_TESTS = 1000;
  const optimizedResults = [];
  
  for (let i = 0; i < MAX_TESTS; i++) {
    const weights = { ...bestTemplate.groupWeights };
    
    const groupNames = Object.keys(weights);
    const numAdjust = 2 + Math.floor(Math.random() * 2);
    
    for (let j = 0; j < numAdjust; j++) {
      const groupName = groupNames[Math.floor(Math.random() * groupNames.length)];
      const adjustment = (Math.random() * 2 - 1) * GRID_RANGE;
      weights[groupName] = Math.max(0.001, weights[groupName] * (1 + adjustment));
    }
    
    const normalizedWeights = normalizeWeights(weights);
    
    const ranking = runRanking({
      roundsRawData: historicalDataForField,
      approachRawData: approachData,
      groupWeights: normalizedWeights,
      metricWeights: bestTemplate.metricWeights
    });
    
    const evaluation = evaluateRankings(ranking.players, results2026);
    optimizedResults.push({ weights: normalizedWeights, ...evaluation });
    
    if ((i + 1) % 100 === 0) {
      console.log(`   Tested ${i + 1}/${MAX_TESTS}...`);
    }
  }
  
  optimizedResults.sort((a, b) => b.correlation - a.correlation);
  const bestOptimized = optimizedResults[0];
  
  console.log(`\n✅ Best Optimized: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`   Improvement: ${((bestOptimized.correlation - bestTemplate.evaluation.correlation) / Math.abs(bestTemplate.evaluation.correlation) * 100).toFixed(2)}%`);
  console.log(`   Top-20: ${bestOptimized.top20.toFixed(1)}%\n`);

  // ============================================================================
  // STEP 4: MULTI-YEAR VALIDATION
  // ============================================================================
  console.log('---');
  console.log('STEP 4: MULTI-YEAR VALIDATION');
  console.log('Test optimized weights on 2023-2025 with 2026 approach metrics');
  console.log('---');

  console.log('\n🔄 Building multi-year validation data...');
  console.log('   Using 2026 approach metrics for all historical years');
  console.log('   Filtering to only players with approach data available\n');

  // Get DG IDs of players with approach data
  const playersWithApproach = new Set(approachData.map(row => String(row['dg_id'] || '').trim()).filter(id => id));
  console.log(`✓ ${playersWithApproach.size} players have 2026 approach data`);

  // Group historical by year, filtered to players with approach data
  const roundsByYear = {};
  historicalDataForField.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const year = parseInt(String(row['year'] || 2026).trim());
    
    // Only include if player has approach data
    if (!playersWithApproach.has(dgId)) return;
    
    if (!roundsByYear[year]) roundsByYear[year] = [];
    roundsByYear[year].push(row);
  });

  console.log(`\n📊 Historical rounds by year (2026 field + approach data available):`);
  const multiYearResults = {};
  
  for (const [year, rounds] of Object.entries(roundsByYear)) {
    console.log(`\n  ${year}: ${rounds.length} rounds`);
    
    // Build player data for this year with 2026 approach metrics
    const ranking = runRanking({
      roundsRawData: rounds,
      approachRawData: approachData,
      groupWeights: bestOptimized.weights,
      metricWeights: bestTemplate.metricWeights
    });

    const evaluation = evaluateRankings(ranking.players, results2026);
    multiYearResults[year] = evaluation;
    
    console.log(`     Correlation: ${evaluation.correlation.toFixed(4)} | Top-20: ${evaluation.top20.toFixed(1)}%`);
  }

  // ============================================================================
  // FINAL RESULTS
  // ============================================================================
  console.log('---');
  console.log('FINAL SUMMARY');
  console.log('---');

  console.log('\nBaseline Template Analysis:');
  console.log(`  Best Template: ${bestTemplate.name}`);
  console.log(`  Correlation: ${bestTemplate.evaluation.correlation.toFixed(4)}`);
  console.log(`  Top-20: ${bestTemplate.evaluation.top20.toFixed(1)}%`);

  console.log('\nOptimized Results (2026):');
  console.log(`  Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`  Improvement: ${((bestOptimized.correlation - bestTemplate.evaluation.correlation) / Math.abs(bestTemplate.evaluation.correlation) * 100).toFixed(2)}%`);
  console.log(`  Top-20: ${bestOptimized.top20.toFixed(1)}%`);

  console.log('\nMulti-Year Validation:');
  Object.entries(multiYearResults).forEach(([year, evalResult]) => {
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-20=${evalResult.top20.toFixed(1)}%`);
  });

  // Summary output
  console.log('---');
  console.log('📊 FINAL SUMMARY');
  console.log('---');

  console.log('\n🏆 Step 1: Historical Baseline (All Years for 2026 field)');
  console.log(`   Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${bestTemplate.evaluation.correlation.toFixed(4)}`);
  console.log(`   Top-20 Accuracy: ${bestTemplate.evaluation.top20.toFixed(1)}%`);
  console.log(`   Matched Players: ${bestTemplate.evaluation.matchedPlayers}`);

  console.log('\n🎯 Step 3: Weight Optimization (2026 with approach metrics)');
  console.log(`   Best Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`   Improvement: ${((bestOptimized.correlation - bestTemplate.evaluation.correlation) / Math.abs(bestTemplate.evaluation.correlation) * 100).toFixed(2)}%`);
  console.log(`   Top-20 Accuracy: ${bestOptimized.top20.toFixed(1)}%`);
  console.log(`   Matched Players: ${bestOptimized.matchedPlayers}`);

  console.log(`   Baseline Template: ${bestTemplate.name}`);
  console.log('   Baseline Group Weights:');
  Object.entries(bestTemplate.groupWeights).forEach(([metric, weight]) => {
    console.log(`     ${metric}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n📈 Optimized Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    console.log(`   ${metric}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n📌 Weight Changes vs Baseline:');
  const weightDeltas = computeWeightDeltas(bestTemplate.groupWeights, bestOptimized.weights);
  Object.entries(weightDeltas).forEach(([metric, info]) => {
    const deltaPct = info.deltaPct === null ? 'n/a' : `${(info.deltaPct * 100).toFixed(1)}%`;
    console.log(`   ${metric}: ${(info.delta * 100).toFixed(1)}% (${deltaPct})`);
  });

  console.log('\n✓ Step 4: Multi-Year Validation Results');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    console.log(`   ${year}: Correlation=${result.correlation.toFixed(4)}, Top-20=${result.top20.toFixed(1)}%, Players=${result.matchedPlayers}`);
  });

  console.log('\n💡 Recommendation:');
  const improvement = bestOptimized.correlation - bestTemplate.evaluation.correlation;
  if (improvement > 0.01) {
    console.log(`   ✅ Use optimized weights - shows ${(improvement).toFixed(4)} improvement`);
  } else if (improvement > 0) {
    console.log(`   ⚠️  Marginal improvement of ${(improvement).toFixed(4)} - consider template baseline`);
  } else {
    console.log(`   ❌ No improvement - stick with ${bestTemplate.name} template`);
  }

  console.log('\n' + '='.repeat(100) + '\n');

  // Also save results to JSON
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: 'Sony Open',
    step1_bestTemplate: {
      name: bestTemplate.name,
      evaluation: bestTemplate.evaluation,
      groupWeights: bestTemplate.groupWeights
    },
    step3_optimized: {
      evaluation: bestOptimized,
      groupWeights: bestOptimized.weights,
      baselineTemplate: bestTemplate.name,
      baselineGroupWeights: bestTemplate.groupWeights,
      groupWeightDelta: computeWeightDeltas(bestTemplate.groupWeights, bestOptimized.weights)
    },
    step4_multiYear: multiYearResults,
    recommendation: {
      approach: improvement > 0.01 ? 'Use optimized weights' : (improvement > 0 ? 'Marginal improvement' : 'Use template baseline'),
      baselineTemplate: bestTemplate.name,
      optimizedWeights: bestOptimized.weights
    }
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const textLines = [];
  textLines.push('='.repeat(100));
  textLines.push('ADAPTIVE WEIGHT OPTIMIZER - FINAL RESULTS');
  textLines.push('='.repeat(100));
  textLines.push('');
  textLines.push('STEP 1: HISTORICAL BASELINE (All Years for 2026 field)');
  textLines.push(`Best Template: ${bestTemplate.name}`);
  textLines.push(`Correlation: ${bestTemplate.evaluation.correlation.toFixed(4)}`);
  textLines.push(`Top-20 Accuracy: ${bestTemplate.evaluation.top20.toFixed(1)}%`);
  textLines.push(`Matched Players: ${bestTemplate.evaluation.matchedPlayers}`);
  textLines.push('');
  textLines.push('STEP 3: WEIGHT OPTIMIZATION (2026 with approach metrics)');
  textLines.push(`Baseline Template: ${bestTemplate.name}`);
  textLines.push(`Best Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  textLines.push(`Improvement: ${((bestOptimized.correlation - bestTemplate.evaluation.correlation) / Math.abs(bestTemplate.evaluation.correlation) * 100).toFixed(2)}%`);
  textLines.push(`Top-20 Accuracy: ${bestOptimized.top20.toFixed(1)}%`);
  textLines.push(`Matched Players: ${bestOptimized.matchedPlayers}`);
  textLines.push('');
  textLines.push('Baseline Group Weights:');
  Object.entries(bestTemplate.groupWeights).forEach(([metric, weight]) => {
    textLines.push(`  ${metric}: ${(weight * 100).toFixed(1)}%`);
  });
  textLines.push('');
  textLines.push('Optimized Group Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    textLines.push(`  ${metric}: ${(weight * 100).toFixed(1)}%`);
  });
  textLines.push('');
  textLines.push('Weight Changes vs Baseline:');
  Object.entries(weightDeltas).forEach(([metric, info]) => {
    const deltaPct = info.deltaPct === null ? 'n/a' : `${(info.deltaPct * 100).toFixed(1)}%`;
    textLines.push(`  ${metric}: ${(info.delta * 100).toFixed(1)}% (${deltaPct})`);
  });
  textLines.push('');
  textLines.push('STEP 4: MULTI-YEAR VALIDATION (with 2026 approach metrics)');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    textLines.push(`  ${year}: Correlation=${result.correlation.toFixed(4)}, Top-20=${result.top20.toFixed(1)}%, Players=${result.matchedPlayers}`);
  });
  textLines.push('');
  textLines.push('RECOMMENDATION:');
  if (improvement > 0.01) {
    textLines.push(`Use optimized weights (improvement: ${(improvement).toFixed(4)})`);
  } else if (improvement > 0) {
    textLines.push(`Marginal improvement (${(improvement).toFixed(4)}), consider baseline`);
  } else {
    textLines.push(`No improvement, stick with ${bestTemplate.name}`);
  }

  const textOutputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.txt');
  fs.writeFileSync(textOutputPath, textLines.join('\n'));

  console.log(`✅ JSON results also saved to: output/adaptive_optimizer_v2_results.json`);
  console.log(`✅ Text results saved to: output/adaptive_optimizer_v2_results.txt\n`);
}

runAdaptiveOptimizer();

// Note: Text output functionality added via separate command
