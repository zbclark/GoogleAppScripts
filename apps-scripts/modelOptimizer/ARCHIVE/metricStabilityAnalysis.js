/**
 * Metric Stability Analysis - Historical Years (2023-2025)
 * 
 * Analyzes which metric groups consistently predict tournament winners
 * across historical years. Uses generatePlayerRankings FRESH for each year.
 * 
 * Output: metric_stability.json with stability scores per group
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
const EVENT_ID = '6';  // Sony Open

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

function analyzeHistoricalYears() {
  console.log('\n' + '='.repeat(90));
  console.log('METRIC STABILITY ANALYSIS - HISTORICAL YEARS (2023-2025)');
  console.log('='.repeat(90));

  // Load config once
  const CONFIG_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Configuration Sheet.csv');
  const HISTORY_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Historical Data.csv');
  const APPROACH_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Approach Skill.csv');

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: false,
    pastPerformanceWeight: 0,
    currentEventId: EVENT_ID
  });

  console.log('🔄 Loading historical data (all years)...');
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });

  // Analyze each year separately
  const years = [2023, 2024, 2025];
  const yearResults = {};
  const yearFinishers = {};

  years.forEach(year => {
    console.log(`\n📊 Analyzing ${year} Sony Open...`);

    // Filter data for this year and event
    const yearHistory = historyData.filter(row => {
      const rowYear = parseInt(row.tour_year || row.year || 0);
      const eventId = String(row.event_id).trim();
      return rowYear === year && eventId === EVENT_ID;
    });

    const yearApproach = approachData.filter(row => {
      const rowYear = parseInt(row.tour_year || row.year || 0);
      const eventId = String(row.event_id).trim();
      return rowYear === year && eventId === EVENT_ID;
    });

    if (yearHistory.length === 0) {
      console.log(`  ⚠️ No historical data for ${year}`);
      return;
    }

    // Get actual finish positions for this year
    const playerScores = {};
    yearHistory.forEach(row => {
      const dgId = String(row.dg_id || row.DG_ID || '').trim();
      const score = parseFloat(row.score_to_par || 0);
      
      if (dgId && !Number.isNaN(score)) {
        if (!playerScores[dgId]) {
          playerScores[dgId] = [];
        }
        playerScores[dgId].push(score);
      }
    });

    // Aggregate to get final position (lower score = better)
    const finalPositions = Object.entries(playerScores).map(([dgId, scores]) => {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { dgId, score: avgScore };
    }).sort((a, b) => a.score - b.score);

    console.log(`  ✓ ${finalPositions.length} finishers found`);
    yearFinishers[year] = finalPositions.length;

    // Create field data for this year
    const fieldData = finalPositions.map((player) => ({
      'DG ID': player.dgId,
      'Player Name': `Player ${player.dgId}`
    }));

    // Build player data for this year
    console.log(`  🔄 Building player data for ${year}...`);
    const { players, historicalData: histData, approachData: appData } = buildPlayerData({
      fieldData,
      roundsRawData: yearHistory,
      approachRawData: yearApproach,
      currentEventId: EVENT_ID
    });

    // Aggregate with similarCourseIds and puttingCourseIds
    const aggregatedPlayers = aggregatePlayerData(
      players,
      histData,
      appData,
      sharedConfig.similarCourseIds,
      sharedConfig.puttingCourseIds
    );

    // Call generatePlayerRankings FRESH for this year's data
    console.log(`  🔄 Ranking players for ${year}...`);
    const rankingResult = generatePlayerRankings(aggregatedPlayers, {
      groups: metricConfig.groups,
      pastPerformance: metricConfig.pastPerformance,
      config: metricConfig.config
    });

    console.log(`  📊 Result: ${rankingResult.players.length} players ranked`);
    if (rankingResult.players[0]) {
      console.log(`  📊 First player: ${Object.keys(rankingResult.players[0]).slice(0, 8).join(', ')}`);
    }

    // Extract group scores and correlate with actual finish positions
    const groupCorrelations = {};
    const rankedPlayers = rankingResult.players;

    metricConfig.groups.forEach((group) => {
      const groupScores = [];
      const finishPositions = [];

      rankedPlayers.forEach(player => {
        // Find this player's actual finish position
        const dgIdStr = String(player.dgId);
        const finisherIdx = finalPositions.findIndex(fp => String(fp.dgId) === dgIdStr);
        
        if (finisherIdx >= 0 && player.groupScores && player.groupScores[group.name] !== undefined) {
          groupScores.push(player.groupScores[group.name]);
          finishPositions.push(finisherIdx + 1);  // 1-based position
        }
      });

      if (groupScores.length >= 3) {
        const corr = calculatePearsonCorrelation(groupScores, finishPositions);
        groupCorrelations[group.name] = corr;
      }
    });

    yearResults[year] = groupCorrelations;
    console.log(`  ✓ Computed correlations for ${Object.keys(groupCorrelations).length} groups`);
  });

  // Compute stability scores
  console.log('\n' + '='.repeat(90));
  console.log('STABILITY ANALYSIS');
  console.log('='.repeat(90));

  const groupNames = [...new Set(Object.values(yearResults).flatMap(yr => Object.keys(yr)))];
  const stability = {};

  groupNames.forEach(group => {
    const correlations = years
      .filter(year => yearResults[year] && yearResults[year][group] !== undefined)
      .map(year => yearResults[year][group]);

    if (correlations.length < 2) {
      stability[group] = { correlations: [], stability: 0, count: correlations.length };
      return;
    }

    const mean = correlations.reduce((a, b) => a + b, 0) / correlations.length;
    const variance = correlations.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / correlations.length;
    const stdDev = Math.sqrt(variance);
    const cv = Math.abs(mean) > 0.001 ? stdDev / Math.abs(mean) : 0;
    const stabilityScore = Math.max(0, 1 - cv);

    stability[group] = {
      correlations: correlations.map(c => parseFloat(c.toFixed(4))),
      mean: parseFloat(mean.toFixed(4)),
      stdDev: parseFloat(stdDev.toFixed(4)),
      stability: parseFloat(stabilityScore.toFixed(4)),
      count: correlations.length
    };
  });

  // Sort by stability
  const sorted = Object.entries(stability)
    .sort((a, b) => b[1].stability - a[1].stability);

  console.log('\nGroup'.padEnd(40) + 'Stability'.padEnd(12) + 'Corr (2023-2025)');
  console.log('-'.repeat(90));
  sorted.forEach(([group, data]) => {
    const corrStr = data.correlations.map(c => `${c > 0 ? '+' : ''}${c}`).join(', ');
    console.log(
      group.padEnd(40) +
      `${data.stability.toFixed(3)}`.padEnd(12) +
      `[${corrStr}]`
    );
  });

  // Classify into HIGH/MEDIUM/LOW stability
  const stableThreshold = 0.70;
  const moderateThreshold = 0.40;

  const highStability = sorted.filter(([, data]) => data.stability >= stableThreshold);
  const mediumStability = sorted.filter(([, data]) => data.stability >= moderateThreshold && data.stability < stableThreshold);
  const lowStability = sorted.filter(([, data]) => data.stability < moderateThreshold);

  console.log('\n' + '='.repeat(90));
  console.log('STABILITY CLASSIFICATION');
  console.log('='.repeat(90));
  console.log(`\n🔒 HIGH STABILITY (≥0.70) - LOCK THESE:`);
  if (highStability.length === 0) {
    console.log('   (none)');
  } else {
    highStability.forEach(([group, data]) => {
      console.log(`   ${group}: ${data.stability.toFixed(3)}`);
    });
  }

  console.log(`\n⚙️  MEDIUM STABILITY (0.40-0.70) - BALANCE:`);
  if (mediumStability.length === 0) {
    console.log('   (none)');
  } else {
    mediumStability.forEach(([group, data]) => {
      console.log(`   ${group}: ${data.stability.toFixed(3)}`);
    });
  }

  console.log(`\n🔧 LOW STABILITY (<0.40) - OPTIMIZE AGGRESSIVELY:`);
  if (lowStability.length === 0) {
    console.log('   (none)');
  } else {
    lowStability.forEach(([group, data]) => {
      console.log(`   ${group}: ${data.stability.toFixed(3)}`);
    });
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: EVENT_ID,
    yearsAnalyzed: years,
    finishersByYear: yearFinishers,
    stability,
    classification: {
      highStability: highStability.map(([group]) => group),
      mediumStability: mediumStability.map(([group]) => group),
      lowStability: lowStability.map(([group]) => group)
    }
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'metric_stability.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Results saved to: output/metric_stability.json`);
  console.log('\n' + '='.repeat(90) + '\n');

  return output;
}

// Run analysis
analyzeHistoricalYears();
