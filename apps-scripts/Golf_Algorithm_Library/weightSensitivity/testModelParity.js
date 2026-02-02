// testModelParity.js
// Test script for 1:1 model parity using config weights from Configuration Sheet

const { loadCsv } = require('./csvLoader');
const modelCore = require('./modelCore');
const { aggregatePlayerData, calculatePlayerMetrics, prepareRankingOutput, debugGroupScores } = modelCore;
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// === 1. Load your historical data CSVs ===
const fieldCsvPath = path.resolve(__dirname, 'American Express (2026) - Tournament Field.csv');
const roundsCsvPath = path.resolve(__dirname, 'American Express (2026) - Historical Data (1).csv');
const approachCsvPath = path.resolve(__dirname, 'American Express (2026) - Approach Skill.csv');
const configCsvPath = path.resolve(__dirname, 'American Express (2026) - Configuration Sheet.csv');

const fieldData = loadCsv(fieldCsvPath, { headerRow: 4, skipFirstColumn: true });
const rounds = loadCsv(roundsCsvPath, { headerRow: 4, skipFirstColumn: true });
const approachData = loadCsv(approachCsvPath, { headerRow: 4, skipFirstColumn: true });


const normalizeGroupName = (name) => String(name || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/\s*-\s*/g, ' - ')
  .replace(/\s*\(\s*/g, ' (')
  .replace(/\s*\)\s*/g, ')')
  .trim();

const METRIC_INDICES = {
  "SG Total": 0,
  "Driving Distance": 1,
  "Driving Accuracy": 2,
  "SG T2G": 3,
  "SG Approach": 4,
  "SG Around Green": 5,
  "SG OTT": 6,
  "SG Putting": 7,
  "Greens in Regulation": 8,
  "Scrambling": 9,
  "Great Shots": 10,
  "Poor Shots": 11,
  "Scoring Average": 12,
  "Birdies or Better": 13,
  "Birdie Chances Created": 14,
  "Fairway Proximity": 15,
  "Rough Proximity": 16,
  "Approach <100 GIR": 17,
  "Approach <100 SG": 18,
  "Approach <100 Prox": 19,
  "Approach <150 FW GIR": 20,
  "Approach <150 FW SG": 21,
  "Approach <150 FW Prox": 22,
  "Approach <150 Rough GIR": 23,
  "Approach <150 Rough SG": 24,
  "Approach <150 Rough Prox": 25,
  "Approach >150 Rough GIR": 26,
  "Approach >150 Rough SG": 27,
  "Approach >150 Rough Prox": 28,
  "Approach <200 FW GIR": 29,
  "Approach <200 FW SG": 30,
  "Approach <200 FW Prox": 31,
  "Approach >200 FW GIR": 32,
  "Approach >200 FW SG": 33,
  "Approach >200 FW Prox": 34
};

const GROUP_DEFINITIONS = {
  "Driving Performance": [
    "Driving Distance",
    "Driving Accuracy",
    "SG OTT"
  ],
  "Approach - Short (<100)": [
    "Approach <100 GIR",
    "Approach <100 SG",
    "Approach <100 Prox"
  ],
  "Approach - Mid (100-150)": [
    "Approach <150 FW GIR",
    "Approach <150 FW SG",
    "Approach <150 FW Prox",
    "Approach <150 Rough GIR",
    "Approach <150 Rough SG",
    "Approach <150 Rough Prox"
  ],
  "Approach - Long (150-200)": [
    "Approach <200 FW GIR",
    "Approach <200 FW SG",
    "Approach <200 FW Prox"
  ],
  "Approach - Very Long (>200)": [
    "Approach >200 FW GIR",
    "Approach >200 FW SG",
    "Approach >200 FW Prox"
  ],
  "Putting": [
    "SG Putting"
  ],
  "Around the Green": [
    "SG Around Green"
  ],
  "Scoring": [
    "SG Total",
    "Scoring Average",
    "Birdie Chances Created",
    "Approach <100 SG",
    "Approach <150 FW SG",
    "Approach <150 Rough SG",
    "Approach <200 FW SG",
    "Approach >200 FW SG",
    "Approach >150 Rough SG"
  ],
  "Course Management": [
    "Scrambling",
    "Great Shots",
    "Poor Shots",
    "Approach <100 Prox",
    "Approach <150 FW Prox",
    "Approach <150 Rough Prox",
    "Approach >150 Rough Prox",
    "Approach <200 FW Prox",
    "Approach >200 FW Prox"
  ]
};

const GROUP_ALIASES = {
  [normalizeGroupName("Approach - Mid (100 - 150)")]: "Approach - Mid (100-150)",
  [normalizeGroupName("Approach - Mid (100-150)")]: "Approach - Mid (100-150)",
  [normalizeGroupName("Approach -  Long (150 - 200)")]: "Approach - Long (150-200)",
  [normalizeGroupName("Approach - Long (150-200)")]: "Approach - Long (150-200)"
};

const scoringWeightKeys = [
  "SG Total",
  "Scoring Average",
  "Birdie Chances Created",
  "Approach <100 SG",
  "Approach <150 FW SG",
  "Approach <150 Rough SG",
  "Approach >150 Rough SG",
  "Approach <200 FW SG",
  "Approach >200 FW SG"
];

const groupWeightKeys = {
  "Driving Performance": [
    "Driving Distance",
    "Driving Accuracy",
    "SG OTT"
  ],
  "Approach - Short (<100)": [
    "Approach <100 GIR",
    "Approach <100 SG",
    "Approach <100 Prox"
  ],
  "Approach - Mid (100-150)": [
    "Approach <150 FW GIR",
    "Approach <150 FW SG",
    "Approach <150 FW Prox",
    "Approach <150 Rough GIR",
    "Approach <150 Rough SG",
    "Approach <150 Rough Prox"
  ],
  "Approach - Long (150-200)": [
    "Approach <200 FW GIR",
    "Approach <200 FW SG",
    "Approach <200 FW Prox"
  ],
  "Approach - Very Long (>200)": [
    "Approach >200 FW GIR",
    "Approach >200 FW SG",
    "Approach >200 FW Prox"
  ],
  "Putting": [
    "SG Putting"
  ],
  "Around the Green": [
    "SG Around Green"
  ],
  "Scoring": scoringWeightKeys,
  "Course Management": [
    "Scrambling",
    "Great Shots",
    "Poor Shots",
    "Approach <100 Prox",
    "Approach <150 FW Prox",
    "Approach <150 Rough Prox",
    "Approach >150 Rough Prox",
    "Approach <200 FW Prox",
    "Approach >200 FW Prox"
  ]
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[^0-9.+-]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
};

const parseConfigSheet = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parse(raw, { relax_quotes: true, relax_column_count: true, skip_empty_lines: false });
  const tournamentRow = rows.find(row => row.some(cell => String(cell || '').trim() === 'Tournament'));
  let currentEventId = null;
  if (tournamentRow) {
    const tournamentIndex = tournamentRow.findIndex(cell => String(cell || '').trim() === 'Tournament');
    const afterTournament = tournamentRow.slice(tournamentIndex + 1);
    const numericCell = afterTournament.find(cell => parseNumber(cell) !== null);
    currentEventId = numericCell ? String(parseNumber(numericCell)) : null;
  }
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell || '').trim() === 'Metrics Groups'));
  if (headerIndex === -1) {
    throw new Error('Configuration Sheet header row not found');
  }

  const header = rows[headerIndex].map(cell => String(cell || '').trim());
  const colIndex = (label) => header.findIndex(cell => cell === label);
  const groupCol = colIndex('Metrics Groups');
  const metricsCol = colIndex('Metrics');
  const weightCols = Array.from({ length: 9 }, (_, i) => colIndex(`Weight ${i + 1}`)).filter(idx => idx >= 0);
  const courseSetupCol = colIndex('Course Setup - Shot Distribution');
  const groupWeightCol = colIndex('Group Weight');

  const groupsByName = {};
  let pastPerformance = { enabled: false, weight: 0, currentEventId: null };
  let courseSetupWeights = {};
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const groupNameRaw = row[groupCol];
    if (!groupNameRaw) {
      continue;
    }
    const groupNameNormalized = normalizeGroupName(groupNameRaw);
    const groupName = GROUP_ALIASES[groupNameNormalized] || String(groupNameRaw).trim();

    if (groupName === 'Past Performance') {
      const enabledValue = String(row[metricsCol] || '').trim().toLowerCase();
      const weightValue = parseNumber(row[weightCols[0]]);
      pastPerformance = {
        enabled: enabledValue === 'yes',
        weight: weightValue ?? 0,
        currentEventId: null
      };
      continue;
    }

    if (!GROUP_DEFINITIONS[groupName]) {
      continue;
    }

    const weights = weightCols.map(idx => parseNumber(row[idx]) ?? 0);
    groupsByName[groupName] = {
      weights,
      groupWeightFromSheet: parseNumber(row[groupWeightCol])
    };

    if (courseSetupCol >= 0 && GROUP_DEFINITIONS[groupName].some(metric => metric.includes('Approach'))) {
      const setupWeight = parseNumber(row[courseSetupCol]);
      if (setupWeight !== null) {
        if (groupName.includes('<100')) courseSetupWeights.under100 = setupWeight;
        if (groupName.includes('100-150')) courseSetupWeights.from100to150 = setupWeight;
        if (groupName.includes('150-200')) courseSetupWeights.from150to200 = setupWeight;
        if (groupName.includes('>200')) courseSetupWeights.over200 = setupWeight;
      }
    }
  }

  const metricGroups = Object.keys(GROUP_DEFINITIONS).map(groupName => {
    const groupWeights = groupsByName[groupName]?.weights || [];
    const weightKeys = groupWeightKeys[groupName] || GROUP_DEFINITIONS[groupName];
    const weightsByName = {};

    weightKeys.forEach((key, idx) => {
      weightsByName[key] = groupWeights[idx] ?? 0;
    });

    const metrics = GROUP_DEFINITIONS[groupName].map(metricName => ({
      name: metricName,
      index: METRIC_INDICES[metricName],
      weight: weightsByName[metricName] || 0
    }));

    // Use the group weight from column Q, not the sum of metric weights
    const groupWeight = groupsByName[groupName]?.groupWeightFromSheet ?? 
      Object.values(weightsByName).reduce((sum, w) => sum + (Number.isFinite(w) ? w : 0), 0);

    return {
      name: groupName,
      metrics,
      weight: groupWeight
    };
  });

  if (pastPerformance.currentEventId == null) {
    pastPerformance.currentEventId = currentEventId ? String(currentEventId) : null;
  }

  return { metricGroups, pastPerformance, courseSetupWeights };
};

const config = parseConfigSheet(configCsvPath);
const metricGroups = config.metricGroups;
const pastPerformance = config.pastPerformance;

const metricLabels = [
  // Historical Metrics (17)
  "SG Total", "Driving Distance", "Driving Accuracy",
  "SG T2G", "SG Approach", "SG Around Green",
  "SG OTT", "SG Putting", "Greens in Regulation",
  "Scrambling", "Great Shots", "Poor Shots", 
  "Scoring Average", "Birdies or Better", "Birdie Chances Created",
  "Fairway Proximity", "Rough Proximity",
  
  // Approach Metrics (18)
  "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox",
  "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox",
  "Approach <150 Rough GIR", "Approach <150 Rough SG", "Approach <150 Rough Prox",
  "Approach >150 Rough GIR", "Approach >150 Rough SG", "Approach >150 Rough Prox",
  "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox",
  "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox"
  ];

const similarCourseIds = [2, 3, 47, 545];
const similarCourseWeight = 0.7;
const puttingCourseIds = [2, 4, 505, 7];
const similarPuttingCourseWeight = 0.75;

const courseSetupWeights = {
  under100: config.courseSetupWeights.under100 ?? 0.154,
  from100to150: config.courseSetupWeights.from100to150 ?? 0.253,
  from150to200: config.courseSetupWeights.from150to200 ?? 0.293,
  over200: config.courseSetupWeights.over200 ?? 0.300
};

// === Focused parity run: Scottie Scheffler only ===
const TARGET_PLAYER_NAME = 'Scottie Scheffler';
const normalizeName = (name) => String(name || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const targetNameNormalized = normalizeName(TARGET_PLAYER_NAME);
const tokensFor = (name) => normalizeName(name).split(' ').filter(Boolean).sort().join(' ');
const namesMatch = (a, b) => tokensFor(a) === tokensFor(b);

// Reduce noisy logs by focusing on target player
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const lower = msg.toLowerCase();
  if (
    lower.includes(targetNameNormalized) ||
    lower.includes('=== target player') ||
    lower.includes('=== raw metrics') ||
    lower.includes('=== group score breakdown') ||
    lower.includes('=== weighted score summary')
  ) {
    originalLog(...args);
  }
};

// === AGGREGATE PLAYER DATA FIRST (Apps Script parity) ===
const players = aggregatePlayerData(
  fieldData,
  rounds,
  approachData,
  metricGroups,
  similarCourseIds,
  puttingCourseIds
);


// === 8. Calculate Player Metrics
const rankedPlayers = calculatePlayerMetrics(players, {
    groups: metricGroups,
    pastPerformance: pastPerformance
  }, similarCourseWeight, similarPuttingCourseWeight, courseSetupWeights);

const processedData = rankedPlayers.players;
const groupStats = rankedPlayers.groupStats || {};

// === 9. Sort, rank, and print/save output ===

const rankedResults = prepareRankingOutput(processedData, metricLabels);

const targetResult = rankedResults.find(r => {
  const candidate = r.name || r['Player Name'] || '';
  return namesMatch(candidate, TARGET_PLAYER_NAME);
});
const targetPlayer = processedData.find(p => {
  const candidate = p.name || '';
  return namesMatch(candidate, TARGET_PLAYER_NAME);
});

if (!targetPlayer || !targetResult) {
  console.log(`Target player not found: ${TARGET_PLAYER_NAME}`);
  process.exit(1);
}

originalLog(`\n=== TARGET PLAYER: ${targetPlayer.name} (DG ID: ${targetPlayer.dgId}) ===`);
originalLog(`Rank: ${targetResult.rank}, Weighted: ${targetResult.weightedScore?.toFixed(3)}, Refined: ${targetResult.refinedWeightedScore?.toFixed(3)}, WAR: ${targetResult.war?.toFixed(3)}`);
originalLog(`Data Coverage: ${(targetResult.dataCoverage * 100).toFixed(1)}% | Confidence: ${targetResult.confidenceFactor?.toFixed(3)} | Past Perf Multiplier: ${targetResult.pastPerformanceMultiplier?.toFixed(3)}`);

// === Detailed metric breakdown to mirror Apps Script calculations ===
const METRIC_MAX_VALUES = {
  'Approach <100 Prox': 40,
  'Approach <150 FW Prox': 50,
  'Approach <150 Rough Prox': 60,
  'Approach >150 Rough Prox': 75,
  'Approach <200 FW Prox': 65,
  'Approach >200 FW Prox': 90,
  'Fairway Proximity': 60,
  'Rough Proximity': 80,
  'Poor Shots': 12,
  'Scoring Average': 74,
  'Birdie Chances Created': 10
};

const applyMetricTransforms = (metricName, rawValue) => {
  let value = rawValue;
  if (metricName === 'Poor Shots') {
    const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
    value = maxPoorShots - value;
  } else if (metricName.includes('Prox') || metricName === 'Fairway Proximity' || metricName === 'Rough Proximity') {
    const maxProxValue = METRIC_MAX_VALUES[metricName] || (metricName === 'Fairway Proximity' ? 60 : (metricName === 'Rough Proximity' ? 80 : 60));
    value = Math.max(0, maxProxValue - value);
  }
  // NOTE: Scoring Average NOT transformed - using raw values
  return value;
};

const metricArray = targetPlayer.metrics || [];
originalLog('\n=== RAW METRICS (WITH BCC INSERTED AT INDEX 14) ===');
metricArray.forEach((val, idx) => {
  const label = metricLabels[idx] || `Metric ${idx}`;
  const display = (typeof val === 'number' && !isNaN(val)) ? val.toFixed(3) : val;
  originalLog(`${idx.toString().padStart(2, '0')} | ${label}: ${display}`);
});

originalLog('\n=== GROUP SCORE BREAKDOWN (PRE-DAMPENING) ===');
const groupScoreDetails = [];

for (const group of metricGroups) {
  let groupScore = 0;
  let totalWeight = 0;
  const metricDetails = [];

  for (const metric of group.metrics) {
    const rawValue = metricArray[metric.index];
    const transformed = applyMetricTransforms(metric.name, rawValue);
    const stats = groupStats[group.name]?.[metric.name] || { mean: 0, stdDev: 0.001 };
    const stdDev = stats.stdDev || 0.001;
    const zScore = (transformed - stats.mean) / stdDev;
    const contribution = zScore * metric.weight;
    groupScore += contribution;
    totalWeight += metric.weight;

    metricDetails.push({
      metric: metric.name,
      index: metric.index,
      raw: rawValue,
      transformed,
      mean: stats.mean,
      stdDev: stdDev,
      zScore,
      metricWeight: metric.weight,
      contribution
    });
  }

  const normalizedGroupScore = totalWeight > 0 ? groupScore / totalWeight : 0;
  groupScoreDetails.push({
    group: group.name,
    groupWeight: group.weight,
    groupScore: normalizedGroupScore,
    metricDetails
  });
}

groupScoreDetails.forEach(group => {
  originalLog(`\n[${group.group}] Weight=${group.groupWeight.toFixed(3)} | GroupScore=${group.groupScore.toFixed(3)}`);
  group.metricDetails.forEach(m => {
    const rawVal = (typeof m.raw === 'number' && !isNaN(m.raw)) ? m.raw.toFixed(3) : m.raw;
    originalLog(
      `  - ${m.metric} (idx ${m.index}) raw=${rawVal} | transformed=${m.transformed.toFixed(3)} | mean=${m.mean.toFixed(3)} | std=${m.stdDev.toFixed(3)} | z=${m.zScore.toFixed(3)} | w=${m.metricWeight.toFixed(3)} | contrib=${m.contribution.toFixed(3)}`
    );
  });
});

// Calculate weighted score from group scores (pre-dampening)
const weightedScoreCalc = groupScoreDetails.reduce((sum, g) => sum + (g.groupScore * g.groupWeight), 0);
const totalGroupWeight = groupScoreDetails.reduce((sum, g) => sum + g.groupWeight, 0);
const normalizedWeightedScore = totalGroupWeight > 0 ? weightedScoreCalc / totalGroupWeight : 0;

originalLog('\n=== WEIGHTED SCORE SUMMARY ===');
originalLog(`WeightedScore (calc, pre-dampening): ${normalizedWeightedScore.toFixed(3)}`);
originalLog(`WeightedScore (model): ${targetPlayer.weightedScore?.toFixed(3)}`);
originalLog(`RefinedWeightedScore (model): ${targetPlayer.refinedWeightedScore?.toFixed(3)}`);
originalLog(`Final WAR (model): ${targetPlayer.war?.toFixed(3)}`);
originalLog(`Final Score (model): ${targetPlayer.finalScore?.toFixed(3)}`);



// ...existing code...
// ...existing code...

// Optionally, write to file for diffing
const output = {
  results: rankedResults,
  groupStats,
  debugRows: debugGroupScores(processedData, groupStats),
  diagnostics: {
    rawFieldDataSample: Array.isArray(fieldData) ? fieldData.slice(0, 5) : fieldData,
    rawRoundsSample: Array.isArray(rounds) ? rounds.slice(0, 5) : rounds,
    rawApproachDataSample: Array.isArray(approachData) ? approachData.slice(0, 5) : approachData,
    rawMetricGroups: metricGroups,
    rawSimilarCourseIds: similarCourseIds,
    rawPuttingCourseIds: puttingCourseIds,
    processedPlayersSample: Object.values(players).slice(0, 5),
    processedDataSample: Object.values(processedData).slice(0, 5),
    rawFieldCsvSample: Array.isArray(fieldData) ? fieldData.slice(0, 5) : fieldData,
    rawRoundsCsvSample: Array.isArray(rounds) ? rounds.slice(0, 5) : rounds,
    rawApproachCsvSample: Array.isArray(approachData) ? approachData.slice(0, 5) : approachData
  }
};

fs.writeFileSync('model_parity_output.json', JSON.stringify(output, null, 2));


