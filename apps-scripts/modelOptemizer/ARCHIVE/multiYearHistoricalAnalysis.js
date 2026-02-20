/**
 * Multi-Year Historical Analysis
 * 
 * Uses Historical Data CSV (containing past years' rounds) to:
 * 1. Build year-specific metrics (2023, 2024, 2025, etc.)
 * 2. Calculate which metrics predicted 2026 winners
 * 3. Identify stable/predictive metrics across years
 * 4. Build multi-year trained weights
 * 5. Compare multi-year vs single-year (2026 only) approach
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

function analyzeHistoricalMetrics() {
  console.log('\n' + '='.repeat(100));
  console.log('MULTI-YEAR HISTORICAL ANALYSIS');
  console.log('Evaluates past years\' data to predict 2026 winners');
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

  // Extract years from Historical Data CSV
  console.log('\n🔄 Analyzing Historical Data CSV...');
  const yearsByPlayer = {};
  const yearsAvailable = new Set();

  historyData.forEach(row => {
    const year = parseInt(String(row['Year'] || 2026).trim());
    const dgId = String(row['DG ID'] || '').trim();
    
    if (year && dgId && year < 2026) {
      yearsAvailable.add(year);
      if (!yearsByPlayer[dgId]) {
        yearsByPlayer[dgId] = new Set();
      }
      yearsByPlayer[dgId].add(year);
    }
  });

  const sortedYears = Array.from(yearsAvailable).sort();
  console.log(`✓ Found ${sortedYears.length} historical years: ${sortedYears.join(', ')}`);
  console.log(`✓ Historical data covers ${Object.keys(yearsByPlayer).length} players`);

  if (sortedYears.length === 0) {
    console.log('\n❌ No historical years found in Historical Data CSV.');
    console.log('Expected "Year" column with values < 2026');
    return;
  }

  // Build player data for 2026 field
  console.log('🔄 Building 2026 player data...');
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

  // Analyze which metrics predict tournament success
  console.log('\n' + '='.repeat(100));
  console.log('METRIC PREDICTIVENESS ANALYSIS');
  console.log('='.repeat(100));

  const metricCorrelations = {};
  const totalCorrelations = {};

  // For each year with results, analyze metric correlation
  for (const [year, results] of Object.entries(historicalResults)) {
    console.log(`\n📊 Analyzing ${year} tournament results (${results.length} finishers)...`);
    
    // Build year-specific metric values
    const playerMetrics = {};
    players.forEach(player => {
      playerMetrics[String(player.dgId)] = {};
    });

    // Calculate metrics using baseline weights
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

    const rankingResult = generatePlayerRankings(aggregatedPlayers, {
      groups: modifiedGroups,
      pastPerformance: metricConfig.pastPerformance,
      config: metricConfig.config
    });

    // Map players to their rankings
    const playerRankMap = {};
    rankingResult.players.forEach((player, idx) => {
      playerRankMap[String(player.dgId)] = idx + 1;
    });

    // For each group, calculate correlation
    metricConfig.groups.forEach(group => {
      const groupName = group.name;
      const groupScores = [];
      const finishPositions = [];

      results.forEach(result => {
        const player = rankingResult.players.find(p => String(p.dgId) === String(result.dgId));
        if (player) {
          const groupScore = player.scoresByGroup[groupName] || 0;
          groupScores.push(groupScore);
          finishPositions.push(result.finishPosition);
        }
      });

      if (groupScores.length >= 3) {
        const correlation = calculatePearsonCorrelation(groupScores, finishPositions);
        
        if (!metricCorrelations[groupName]) {
          metricCorrelations[groupName] = [];
        }
        metricCorrelations[groupName].push({ year, correlation });
        
        console.log(`  ${groupName.padEnd(35)} correlation: ${correlation.toFixed(4)}`);
      }
    });
  }

  // Calculate stability (consistency across years)
  console.log('\n' + '='.repeat(100));
  console.log('METRIC STABILITY ANALYSIS (Consistency Across Years)');
  console.log('='.repeat(100));

  const stabilityReport = [];
  for (const [groupName, yearData] of Object.entries(metricCorrelations)) {
    const correlations = yearData.map(d => d.correlation);
    const avgCorrelation = correlations.reduce((a, b) => a + b, 0) / correlations.length;
    const stdDev = Math.sqrt(
      correlations.reduce((sum, c) => sum + Math.pow(c - avgCorrelation, 2), 0) / correlations.length
    );

    // Stability = low std dev, high avg correlation
    const stability = avgCorrelation - stdDev; // Penalize variance

    stabilityReport.push({
      group: groupName,
      avgCorrelation,
      stdDev,
      stability,
      yearData
    });
  }

  // Sort by stability
  stabilityReport.sort((a, b) => b.stability - a.stability);

  console.log('\nGroup'.padEnd(35) + 'Avg Corr'.padEnd(12) + 'Std Dev'.padEnd(10) + 'Stability'.padEnd(12) + 'Consistency');
  console.log('-'.repeat(100));
  stabilityReport.forEach(report => {
    const consistency = report.yearData.map(d => `${d.year}:${d.correlation.toFixed(3)}`).join(' | ');
    console.log(
      report.group.padEnd(35) +
      `${report.avgCorrelation.toFixed(4)}`.padEnd(12) +
      `${report.stdDev.toFixed(4)}`.padEnd(10) +
      `${report.stability.toFixed(4)}`.padEnd(12) +
      consistency
    );
  });

  // Classification
  console.log('\n' + '='.repeat(100));
  console.log('METRIC CLASSIFICATION');
  console.log('='.repeat(100));

  const STRONG_THRESHOLD = 0.05;
  const STABLE_THRESHOLD = 0.02;

  const strongMetrics = stabilityReport.filter(r => r.avgCorrelation > STRONG_THRESHOLD);
  const stableMetrics = stabilityReport.filter(r => r.stdDev < STABLE_THRESHOLD);
  const weakMetrics = stabilityReport.filter(r => r.avgCorrelation <= STRONG_THRESHOLD);

  console.log('\n🔒 STRONG PREDICTORS (avg correlation > 0.05):');
  strongMetrics.forEach(m => {
    console.log(`   ${m.group.padEnd(35)} avg=${m.avgCorrelation.toFixed(4)} (std=${m.stdDev.toFixed(4)})`);
  });

  console.log('\n🎯 STABLE ACROSS YEARS (low variance < 0.02):');
  stableMetrics.forEach(m => {
    console.log(`   ${m.group.padEnd(35)} avg=${m.avgCorrelation.toFixed(4)} (std=${m.stdDev.toFixed(4)})`);
  });

  console.log('\n⚠️  WEAK PREDICTORS (avg correlation <= 0.05):');
  weakMetrics.forEach(m => {
    console.log(`   ${m.group.padEnd(35)} avg=${m.avgCorrelation.toFixed(4)} (std=${m.stdDev.toFixed(4)})`);
  });

  // Build multi-year optimized weights
  console.log('\n' + '='.repeat(100));
  console.log('MULTI-YEAR WEIGHT OPTIMIZATION');
  console.log('='.repeat(100));

  const multiYearWeights = {};
  let totalWeight = 0;

  metricConfig.groups.forEach(group => {
    const stability = stabilityReport.find(r => r.group === group.name);
    if (stability) {
      // Weight by avg correlation (higher correlation = higher weight)
      // But also account for stability (more stable = more reliable)
      const weightValue = Math.max(0, stability.avgCorrelation) * (1 - stability.stdDev);
      multiYearWeights[group.name] = Math.max(0.001, weightValue);
      totalWeight += multiYearWeights[group.name];
    } else {
      multiYearWeights[group.name] = 0.001;
    }
  });

  // Normalize
  const normalizedMultiYear = normalizeWeights(multiYearWeights);

  console.log('\nBaseline vs Multi-Year Weights:');
  console.log('Group'.padEnd(35) + 'Baseline'.padEnd(12) + 'Multi-Year'.padEnd(12) + 'Change');
  console.log('-'.repeat(100));

  const baselineWeights = {};
  metricConfig.groups.forEach(group => {
    baselineWeights[group.name] = group.weight;
  });

  Object.entries(normalizedMultiYear).forEach(([groupName, weight]) => {
    const baseline = baselineWeights[groupName] || 0;
    const change = ((weight - baseline) / baseline) * 100;
    console.log(
      groupName.padEnd(35) +
      `${(baseline * 100).toFixed(1)}%`.padEnd(12) +
      `${(weight * 100).toFixed(1)}%`.padEnd(12) +
      `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
    );
  });

  // Test multi-year weights on 2026 field
  console.log('\n' + '='.repeat(100));
  console.log('TESTING MULTI-YEAR WEIGHTS ON 2026 FIELD');
  console.log('='.repeat(100));

  // Load 2026 results
  const results2026 = [];
  const rawResults = loadCsv(RESULTS_PATH, { skipFirstColumn: true });
  rawResults.forEach(row => {
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
      results2026.push({ dgId, finishPosition });
    }
  });

  console.log(`Testing on 2026 field (${results2026.length} finishers)...`);

  // Test baseline
  const baselineGroups = buildModifiedGroups(
    metricConfig.groups,
    baselineWeights,
    baselineMetricWeights
  );
  const baselineRanking = generatePlayerRankings(aggregatedPlayers, {
    groups: baselineGroups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });
  const baselineEval = evaluateRankings(baselineRanking.players, results2026);

  // Test multi-year
  const multiYearGroups = buildModifiedGroups(
    metricConfig.groups,
    normalizedMultiYear,
    baselineMetricWeights
  );
  const multiYearRanking = generatePlayerRankings(aggregatedPlayers, {
    groups: multiYearGroups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });
  const multiYearEval = evaluateRankings(multiYearRanking.players, results2026);

  console.log('\n2026 Tournament Results:');
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
    'Top-10 Accuracy'.padEnd(20) +
    `${baselineEval.top10.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top10.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top10 - baselineEval.top10 > 0 ? '+' : ''}${(multiYearEval.top10 - baselineEval.top10).toFixed(1)}%`
  );
  console.log(
    'Top-20 Accuracy'.padEnd(20) +
    `${baselineEval.top20.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top20.toFixed(1)}%`.padEnd(15) +
    `${multiYearEval.top20 - baselineEval.top20 > 0 ? '+' : ''}${(multiYearEval.top20 - baselineEval.top20).toFixed(1)}%`
  );

  // Make recommendation
  console.log('\n' + '='.repeat(100));
  console.log('RECOMMENDATION');
  console.log('='.repeat(100));

  const singleYearCorr = 0.1066;
  const improvement = ((multiYearEval.correlation - singleYearCorr) / singleYearCorr) * 100;

  console.log(`\nMulti-Year Correlation: ${multiYearEval.correlation.toFixed(4)}`);
  console.log(`Single-Year Best:       ${singleYearCorr.toFixed(4)}`);
  console.log(`Difference:             ${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}%`);

  if (multiYearEval.correlation > singleYearCorr) {
    console.log('\n✅ RECOMMENDATION: USE MULTI-YEAR APPROACH');
    console.log(`   Multi-year metrics are more predictive (${multiYearEval.correlation.toFixed(4)} vs ${singleYearCorr.toFixed(4)})`);
  } else {
    console.log('\n✅ RECOMMENDATION: USE SINGLE-YEAR GRID SEARCH');
    console.log(`   Single-year optimization is superior (${singleYearCorr.toFixed(4)} vs ${multiYearEval.correlation.toFixed(4)})`);
  }

  // Save detailed results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    tournament: 'Sony Open',
    analysis: 'Multi-Year Historical (2023-2025)',
    metricStability: stabilityReport,
    classification: {
      strongPredictors: strongMetrics.map(m => m.group),
      stablePredictors: stableMetrics.map(m => m.group),
      weakPredictors: weakMetrics.map(m => m.group)
    },
    weights: {
      baseline: baselineWeights,
      multiYear: normalizedMultiYear
    },
    performance2026: {
      baseline: baselineEval,
      multiYear: multiYearEval,
      singleYearBest: {
        correlation: singleYearCorr,
        top20: 35.0
      },
      recommendation: multiYearEval.correlation > singleYearCorr ? 'MULTI-YEAR' : 'SINGLE-YEAR'
    }
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'multiyear_analysis_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Results saved to: output/multiyear_analysis_results.json`);
  console.log('='.repeat(100) + '\n');
}

function analyzeByHistoricalRounds(historyData, fieldData, approachData, sharedConfig, metricConfig) {
  console.log('\n📊 Analyzing metric correlations by historical rounds (no tournament results available)...');
  
  // Group history by year
  const byYear = { 2023: [], 2024: [], 2025: [] };
  historyData.forEach(row => {
    const year = parseInt(String(row['Year'] || 2026).trim());
    if (year >= 2023 && year <= 2025) {
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(row);
    }
  });

  console.log('\nRounds available by year:');
  Object.entries(byYear).forEach(([year, rounds]) => {
    console.log(`  ${year}: ${rounds.length} rounds`);
  });

  console.log('\n⚠️  Historical tournament results not found.');
  console.log('Recommendation: Use SINGLE-YEAR GRID SEARCH (proven approach with 0.1066 correlation)');
  console.log('\nTo enable multi-year analysis, add tournament results files:');
  console.log('  - Sony Open (2023) - Tournament Results.csv');
  console.log('  - Sony Open (2024) - Tournament Results.csv');
  console.log('  - Sony Open (2025) - Tournament Results.csv');
}

analyzeHistoricalMetrics();
