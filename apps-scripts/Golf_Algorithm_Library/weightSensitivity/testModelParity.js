// testModelParity.js
// Test script for 1:1 model parity using config weights from Configuration Sheet

const { loadCsv } = require('./csvLoader');
const modelCore = require('./modelCore');
const { aggregatePlayerData, calculatePlayerMetrics, prepareRankingOutput } = modelCore;
const path = require('path');
const fs = require('fs');

// === 1. Load your historical data CSV ===
const csvPath = path.resolve(__dirname, 'American Express (2026) - Historical Data (1).csv');
const rounds = loadCsv(csvPath, { headerRow: 4, skipFirstColumn: true });

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

const players = aggregatePlayerData(metricGroups)


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


// Print detailed debug output for top 10 in requested format
// Extra: Print detailed group/metric debug for Scottie Scheffler
const scottie = rankedResults.find(r => r.name && r.name.includes('Scheffler'));
if (scottie) {
  const dbg = debugGroupScores.find(d => d.dgId === scottie.dgId);
  const player = players[scottie.dgId];
  const metrics = allMetricValues[scottie.dgId];
  console.log('\n--- Detailed Debug for Scottie Scheffler ---');
  for (const group of normGroups) {
    console.log(`\nGroup: ${group.name}`);
    for (const metric of group.metrics) {
      const stats = groupStats[group.name]?.[metric.name];
      const value = metrics[metric.index];
      const mean = stats?.mean;
      const stdDev = stats?.stdDev;
      const z = modelCore.zScore(value, mean, stdDev);
      const transformed = Math.sign(z) * Math.log(1 + Math.abs(z));
      console.log(`    Metric: ${metric.name}`);
      console.log(`    Value: ${value}`);
      console.log(`    Mean: ${mean}`);
      console.log(`    StdDev: ${stdDev}`);
      console.log(`    Z-Score: ${z}`);
      console.log(`    Transformed: ${transformed}`);
    }
  }
}
console.log('\nRank | Player Name | DG ID | Data Coverage % | Dampening Applied? | Group Scores (Before Dampening) | Group Scores (After Dampening if applicable) | Weighted Score | Confidence Factor | Past Perf Multiplier | Refined Weighted Score | Final WAR | Notes');
console.log('-'.repeat(220));
rankedResults.slice(0, 10).forEach((res, i) => {
  const dbg = debugGroupScores.find(d => d.dgId === res.dgId);
  const player = players[res.dgId];
  const dataCoverage = (res.dataCoverage * 100).toFixed(1);
  // Dampening is based on data coverage < 0.70 (Apps Script parity)
  const dampened = res.dataCoverage < 0.70 ? 'YES' : 'NO';
  // Group scores before dampening
  let groupScoresStr = '';
  if (dbg && dbg.groupScores) {
    groupScoresStr = Object.entries(dbg.groupScores)
      .map(([group, score]) => `${group}: ${score !== undefined ? score.toFixed(3) : 'n/a'}`)
      .join('; ');
  }
  // Group scores after dampening (if applicable)
  let groupScoresAfter = '';
  if (dampened === 'YES' && dbg && dbg.groupScores) {
    groupScoresAfter = Object.entries(dbg.groupScores)
      .map(([group, score]) => `${group}: ${(score * res.confidenceFactor).toFixed(3)}`)
      .join('; ');
  }
  // Weighted score before dampening
  const weightedScore = dbg?.warBeforeDampening?.toFixed(3) ?? '';
  // Confidence factor
  const conf = res.confidenceFactor?.toFixed(3) ?? '';
  // Past perf multiplier (if available)
  const pastPerf = '';
  // Refined weighted score (after dampening, before final WAR adjustments)
  const refinedWeighted = (dampened === 'YES' ? (dbg?.warBeforeDampening * res.confidenceFactor).toFixed(3) : weightedScore) ?? '';
  // Final WAR
  const finalWar = res.war?.toFixed(3) ?? '';
  // Notes (e.g. recent top 10, baseline, etc.)
  let notes = '';
  if (res.isLowConfidencePlayer) notes += 'Low confidence; ';
  if (player && player.events) {
    const currentYear = new Date().getFullYear();
    const sortedEvents = Object.values(player.events).sort((a, b) => (b.year || 0) - (a.year || 0));
    for (const event of sortedEvents) {
      if (!event.year || event.year >= currentYear) continue;
      if (event.position && !isNaN(event.position)) {
        const pos = Number(event.position);
        if (pos === 1 || pos <= 10) {
          notes += 'Has recent top 10; ';
          break;
        }
      }
    }
  }
  notes = notes.trim();
  console.log(`${i+1} | ${res.name} | ${res.dgId} | ${dataCoverage} | ${dampened} | ${groupScoresStr} | ${groupScoresAfter} | ${weightedScore} | ${conf} | ${pastPerf} | ${refinedWeighted} | ${finalWar} | ${notes}`);
});

// Optionally, write to file for diffing
fs.writeFileSync('model_parity_output.json', JSON.stringify(rankedResults, null, 2));

console.log('Model parity test complete. Output written to model_parity_output.json');
