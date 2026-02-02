// testModelParity.js
// Test script for 1:1 model parity using config weights from Configuration Sheet

const { loadCsv } = require('./csvLoader');
const modelCore = require('./modelCore');
const { aggregatePlayerData, calculatePlayerMetrics, prepareRankingOutput, debugGroupScores } = modelCore;
const path = require('path');
const fs = require('fs');

// === 1. Load your historical data CSVs ===
const fieldCsvPath = path.resolve(__dirname, 'American Express (2026) - Tournament Field.csv');
const roundsCsvPath = path.resolve(__dirname, 'American Express (2026) - Historical Data (1).csv');
const approachCsvPath = path.resolve(__dirname, 'American Express (2026) - Approach Skill.csv');

const fieldData = loadCsv(fieldCsvPath, { headerRow: 4, skipFirstColumn: true });
const rounds = loadCsv(roundsCsvPath, { headerRow: 4, skipFirstColumn: true });
const approachData = loadCsv(approachCsvPath, { headerRow: 4, skipFirstColumn: true });


// === 2. Paste your metric group config from Configuration Sheet here ===
// Example structure (replace with your actual config):
const metricGroups = [
  {
    name: "Driving Performance",
    weight: 0.075,
    metrics: [
      { name: "Driving Distance", index: 1, weight: 0.05 },
      { name: "Driving Accuracy", index: 2, weight: 0.4 },
      { name: "SG OTT", index: 6, weight: 0.55 }
    ]
  },
  {
    name: "Approach - Short (<100)",
    weight: 0.083,
    metrics: [
      { name: "Approach <100 GIR", index: 17, weight: 0.1 },
      { name: "Approach <100 SG", index: 18, weight: 0.4 },
      { name: "Approach <100 Prox", index: 19, weight: 0.5 }
    ]
  },
  {
    name: "Approach - Mid (100 - 150)",
    weight: 0.137,
    metrics: [
      { name: "Approach <150 FW GIR", index: 20, weight: 0.1 },
      { name: "Approach <150 FW SG", index: 21, weight: 0.42 },
      { name: "Approach <150 FW Prox", index: 22, weight: 0.48 }
    ]
  },
  {
    name: "Approach -  Long (150 - 200)",
    weight: 0.158,
    metrics: [
      { name: "Approach <200 FW GIR", index: 29, weight: 0.1 },
      { name: "Approach <200 FW SG", index: 30, weight: 0.35 },
      { name: "Approach <200 FW Prox", index: 31, weight: 0.55 }
    ]
  },
  {
    name: "Approach - Very Long (>200)",
    weight: 0.162,
    metrics: [
      { name: "Approach >200 FW GIR", index: 32, weight: 0.09 },
      { name: "Approach >200 FW SG", index: 33, weight: 0.28 },
      { name: "Approach >200 FW Prox", index: 34, weight: 0.63 }
    ]
  },
  {
    name: "Putting",
    weight: 0.155,
    metrics: [
      { name: "SG Putting", index: 7, weight: 1 }
    ]
  },
  {
    name: "Around the Green",
    weight: 0.055,
    metrics: [
      { name: "SG Around Green", index: 5, weight: 1 }
    ]
  },
  {
    name: "Scoring",
    weight: 0.12,
    metrics: [
      { name: "SG T2G", index: 3, weight: 0.22 },
      { name: "Scoring Average", index: 12, weight: 0.13 },
      { name: "Birdie Chances Created", index: 14, weight: 0.12 },
      { name: "Approach <100 SG", index: 18, weight: 0.082 },
      { name: "Approach <150 FW SG", index: 21, weight: 0.067 },
      { name: "Approach <150 Rough SG", index: 24, weight: 0.067 },
      { name: "Approach >150 Rough SG", index: 27, weight: 0.155 },
      { name: "Approach <200 FW SG", index: 30, weight: 0.080},
      { name: "Approach >200 FW SG", index: 33, weight: 0.080 }
    ]
  },
  {
    name: "Course Management",
    weight: 0.055,
    metrics: [
      { name: "Scrambling", index: 9, weight: 0.1 },
      { name: "Great Shots", index: 10, weight: 0.08 },
      { name: "Poor Shot Avoidance", index: 11, weight: 0.08 },
      { name: "Approach <100 Prox", index: 19, weight: 0.21 },
      { name: "Approach <150 FW Prox", index: 22, weight: 0.21 },
      { name: "Approach <150 Rough Prox", index: 25, weight: 0.21 },
      { name: "Approach >150 Rough Prox", index: 28, weight: 0.21 },
      { name: "Approach <200 FW Prox", index: 31, weight: 0.21 },
      { name: "Approach >200 FW Prox", index: 34, weight: 0.21 }
    ]
  }
];

const pastPerformance = {
  enabled: true, // from F27
  weight: 0.3,   // from G27
  currentEventId: "2" // or whatever is current
};

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
const similarCourseWeight = 0.7; // from H33
const puttingCourseIds = [2, 4, 505, 7];
const similarPuttingCourseWeight = 0.75; // from H40

const courseSetupWeights = {
    under100: .154,
    from100to150: .253,
    from150to200: .293,
    over200: .300
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
  }, similarCourseWeight, similarPuttingCourseWeight, courseSetupWeights) ;

  const processedData = rankedPlayers.players;
  const groupStats = rankedPlayers.groupStats || {};

// === 9. Sort, rank, and print/save output ===

const rankedResults = prepareRankingOutput(processedData, metricLabels);
console.table(rankedResults.slice(0, 20)); // Print top 20


// ...existing code...
rankedResults.slice(0, 10).forEach((res, i) => {
  const debugRows = debugGroupScores(processedData, groupStats);
  const dbg = debugRows.find(d => d['DG ID'] === res.dgId);
  const player = players[res.dgId];
  const dataCoverage = (res.dataCoverage * 100).toFixed(1);
  const dampened = res.dataCoverage < 0.70 ? 'YES' : 'NO';
  let groupScoresStr = '';
  if (dbg && dbg.groupScores) {
    groupScoresStr = Object.entries(dbg.groupScores)
      .map(([group, score]) => `${group}: ${score !== undefined ? score.toFixed(3) : 'n/a'}`)
      .join('; ');
  }
  let groupScoresAfter = '';
  if (dampened === 'YES' && dbg && dbg.groupScoresAfterDampening) {
    groupScoresAfter = Object.entries(dbg.groupScoresAfterDampening)
      .map(([group, score]) => `${group}: ${score !== undefined ? score.toFixed(3) : 'n/a'}`)
      .join('; ');
  }
  const weightedScore = res.weightedScore?.toFixed(3) ?? '';
  const conf = res.confidenceFactor?.toFixed(3) ?? '';
  const pastPerf = res.pastPerformanceMultiplier?.toFixed(3) ?? '';
  const refinedWeighted = res.refinedWeightedScore?.toFixed(3) ?? '';
  const finalWar = res.war?.toFixed(3) ?? '';
  let notesArr = [];
  if (dampened === 'YES') {
    notesArr.push(`Dampened by √${res.dataCoverage.toFixed(2)} = ${Math.sqrt(res.dataCoverage).toFixed(3)}`);
  }
  if (res.isLowConfidencePlayer && res.baselineScore !== undefined) {
    notesArr.push(`Low confidence baseline: ${res.baselineScore.toFixed(2)}`);
  }
  if (res.hasRecentTop10) {
    notesArr.push('Has recent top 10');
  }
  const notes = notesArr.join(' | ');
  // ...existing code...
});

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


