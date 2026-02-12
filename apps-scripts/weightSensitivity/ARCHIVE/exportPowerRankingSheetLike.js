#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { generatePlayerRankings } = require('../core/modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');
const { WEIGHT_TEMPLATES } = require('../utilities/weightTemplates');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = ROOT_DIR;
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');

const CONFIG_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Configuration Sheet.csv');
const FIELD_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Tournament Field.csv');
const HISTORY_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Historical Data.csv');
const APPROACH_PATH = path.resolve(DATA_DIR, 'Sony Open (2026) - Approach Skill.csv');

const metricLabels = [
  // Historical Metrics (17)
  'SG Total', 'Driving Distance', 'Driving Accuracy',
  'SG T2G', 'SG Approach', 'SG Around Green',
  'SG OTT', 'SG Putting', 'Greens in Regulation',
  'Scrambling', 'Great Shots', 'Poor Shots',
  'Scoring Average', 'Birdies or Better', 'Birdie Chances Created',
  'Fairway Proximity', 'Rough Proximity',

  // Approach Metrics (18)
  'Approach <100 GIR', 'Approach <100 SG', 'Approach <100 Prox',
  'Approach <150 FW GIR', 'Approach <150 FW SG', 'Approach <150 FW Prox',
  'Approach <150 Rough GIR', 'Approach <150 Rough SG', 'Approach <150 Rough Prox',
  'Approach >150 Rough GIR', 'Approach >150 Rough SG', 'Approach >150 Rough Prox',
  'Approach <200 FW GIR', 'Approach <200 FW SG', 'Approach <200 FW Prox',
  'Approach >200 FW GIR', 'Approach >200 FW SG', 'Approach >200 FW Prox'
];

const percentageIndices = new Set([
  2,  // Driving Accuracy
  8,  // Greens in Regulation
  9,  // Scrambling
  16, // Approach <100 GIR
  19, // Approach <150 FW GIR
  22, // Approach <150 Rough GIR
  25, // Approach >150 Rough GIR
  28, // Approach <200 FW GIR
  31  // Approach >200 FW GIR
]);

function formatMetricValue(value, index) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return percentageIndices.has(index) ? value : Number(value.toFixed(3));
}

function normalizeMetricName(name) {
  return String(name).toLowerCase()
    .replace(/\s+/g, '')
    .replace(/strokes(gained)?/g, 'sg')
    .replace(/proximity/g, 'prox')
    .replace(/greens(in)?reg(ulation)?/g, 'gir')
    .replace(/approach/g, 'app')
    .replace(/&/g, 'and')
    .replace(/[<>]/g, '');
}

function generatePlayerNotes(player, groups, groupStats) {
  const notes = [];

  if (player.war >= 1.0) {
    notes.push('⭐ Elite performer');
  } else if (player.war >= 0.5) {
    notes.push('↑ Above average');
  } else if (player.war <= -0.5) {
    notes.push('↓ Below field average');
  }

  const allMetrics = [];
  groups.forEach(group => {
    group.metrics.forEach(metric => {
      allMetrics.push({
        name: metric.name,
        index: metric.index,
        weight: metric.weight,
        group: group.name
      });
    });
  });

  const keyMetrics = allMetrics
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const strengths = [];
  const weaknesses = [];

  keyMetrics.forEach(metric => {
    if (!player.metrics || player.metrics[metric.index] === undefined ||
        !groupStats || !groupStats[metric.group] ||
        !groupStats[metric.group][metric.name]) {
      return;
    }

    const playerValue = player.metrics[metric.index];
    const mean = groupStats[metric.group][metric.name].mean;
    const stdDev = groupStats[metric.group][metric.name].stdDev || 0.001;
    const zScore = (playerValue - mean) / stdDev;

    const isNegativeMetric = metric.name.includes('Poor') ||
      metric.name.includes('Scoring Average') ||
      metric.name.includes('Prox');

    const adjustedZScore = isNegativeMetric ? -zScore : zScore;

    const displayName = metric.name
      .replace('strokesGained', 'SG')
      .replace('drivingDistance', 'Distance')
      .replace('drivingAccuracy', 'Accuracy')
      .replace('greensInReg', 'GIR')
      .replace('birdiesOrBetter', 'Birdies');

    if (adjustedZScore >= 0.75) {
      strengths.push({ name: displayName, score: adjustedZScore, weight: metric.weight });
    } else if (adjustedZScore <= -0.75) {
      weaknesses.push({ name: displayName, score: adjustedZScore, weight: metric.weight });
    }
  });

  strengths.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));

  if (strengths.length > 0) {
    const strengthsText = strengths.slice(0, 2).map(s => s.name).join(', ');
    notes.push(`💪 ${strengthsText}`);
  }

  const totalKeyWeight = keyMetrics.reduce((sum, m) => sum + m.weight, 0);
  const playerStrengthWeight = strengths.reduce((sum, s) => {
    const matchingKeyMetric = keyMetrics.find(km => km.name.includes(s.name) || s.name.includes(km.name));
    return sum + (matchingKeyMetric ? matchingKeyMetric.weight : 0);
  }, 0);

  const fitPercentage = totalKeyWeight > 0 ? (playerStrengthWeight / totalKeyWeight) * 100 : 0;

  if (fitPercentage >= 50) {
    notes.push('✅ Strong course fit');
  } else if (fitPercentage >= 25) {
    notes.push('👍 Good course fit');
  } else if (weaknesses.length > 0 && weaknesses.some(w => w.weight > 0.1)) {
    notes.push('⚠️ Poor course fit');
  }

  const trendMetricNames = [
    'Total game', 'Driving', 'Accuracy', 'Tee-to-green',
    'Approach', 'Around green', 'Off tee', 'Putting',
    'GIR', 'Scrambling', 'Great shots', 'Poor shots',
    'Scoring', 'Birdies'
  ];

  let strongestTrend = null;
  let strongestValue = 0;

  (player.trends || []).forEach((trend, i) => {
    if (Math.abs(trend) > Math.abs(strongestValue)) {
      strongestValue = trend;
      strongestTrend = { metric: i, value: trend };
    }
  });

  if (strongestTrend && Math.abs(strongestTrend.value) > 0.1) {
    const trendDirection = strongestTrend.value > 0 ? '↑' : '↓';
    const metricName = trendMetricNames[strongestTrend.metric] || 'Overall';
    notes.push(`${trendDirection} ${metricName}`);
  }

  if (player.dataCoverage < 0.75) {
    notes.push(`⚠️ Limited data (${Math.round(player.dataCoverage * 100)}%)`);
  }

  if (player.roundsCount && player.roundsCount < 10) {
    notes.push(`📊 Only ${player.roundsCount} rounds`);
  }

  return notes.join(' | ');
}

function buildSheetLikeCsv() {
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const baseMetricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });

  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });

  const field2026DgIds = new Set(fieldData.map(p => String(p['dg_id'] || '').trim()));
  const historicalDataForField = historyData.filter(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const rowYear = parseInt(String(row['year'] || 2026).trim());
    return field2026DgIds.has(dgId) && rowYear < 2026;
  });

  const playerData = buildPlayerData({
    fieldData,
    roundsRawData: historicalDataForField,
    approachRawData: approachData,
    currentEventId: sharedConfig.currentEventId
  });

  const template = WEIGHT_TEMPLATES.POWER;
  const templateGroups = baseMetricConfig.groups.map(group => ({
    ...group,
    weight: template.groupWeights[group.name],
    metrics: group.metrics.map(metric => ({
      ...metric,
      weight: template.metricWeights[`${group.name}::${metric.name}`] || metric.weight
    }))
  }));

  const runtimeConfig = {
    similarCoursesWeight: sharedConfig.similarCoursesWeight,
    puttingCoursesWeight: sharedConfig.puttingCoursesWeight,
    courseSetupWeights: sharedConfig.courseSetupWeights
  };

  const ranking = generatePlayerRankings(
    playerData.players,
    { groups: templateGroups, pastPerformance: baseMetricConfig.pastPerformance },
    playerData.historicalData,
    playerData.approachData,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds,
    runtimeConfig
  );

  const headers = [
    'Expected Performance Notes',
    'Rank', 'DG ID', 'Player Name', 'Top 5', 'Top 10', 'Weighted Score', 'Past Perf. Mult.',
    ...metricLabels.slice(0, 17).flatMap(m => [m, `${m} Trend`]),
    ...metricLabels.slice(17),
    'WAR'
  ];

  const rows = [headers];

  ranking.players.forEach(player => {
    if (!player.metrics) player.metrics = Array(35).fill(0);
    if (!player.trends) player.trends = Array(17).fill(0);

    const notes = generatePlayerNotes(player, templateGroups, ranking.groupStats || {});

    const weightedScoreValue = (typeof player.weightedScore === 'number' && !Number.isNaN(player.weightedScore))
      ? player.weightedScore.toFixed(2)
      : '0.00';

    const base = [
      notes,
      player.rank,
      player.dgId,
      player.name,
      Number(player.top5 || 0),
      Number(player.top10 || 0),
      weightedScoreValue,
      (player.pastPerformanceMultiplier || 1.0).toFixed(3)
    ];

    const historical = player.metrics.slice(0, 17).flatMap((val, idx) => {
      if (idx === 14) {
        return [formatMetricValue(val, idx), '0.000'];
      }
      const trendIdx = idx < 14 ? idx : idx - 1;
      const trendValue = (player.trends && player.trends[trendIdx] !== undefined)
        ? player.trends[trendIdx].toFixed(3)
        : '0.000';
      return [formatMetricValue(val, idx), trendValue];
    });

    const approach = player.metrics.slice(17).map((val, idx) => formatMetricValue(val, idx + 17));

    const war = [typeof player.war === 'number' ? player.war.toFixed(2) : '0.00'];

    rows.push([...base, ...historical, ...approach, ...war]);
  });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.resolve(OUTPUT_DIR, 'sony_open_2026_power_rankings_sheet_like.csv');
  fs.writeFileSync(outputPath, rows.map(r => r.map(v => JSON.stringify(v ?? '')).join(',')).join('\n'));

  console.log(`✅ Sheet-like rankings saved to: ${outputPath}`);
  console.log(`   Total players ranked: ${ranking.players.length}`);
}

buildSheetLikeCsv();
