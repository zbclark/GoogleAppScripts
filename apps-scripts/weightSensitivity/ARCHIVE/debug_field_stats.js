// Debug script to show field statistics for each metric
const { loadCsv } = require('./csvLoader');
const modelCore = require('./modelCore');
const { aggregatePlayerData, calculatePlayerMetrics } = modelCore;
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const fieldCsvPath = path.resolve(__dirname, 'American Express (2026) - Tournament Field.csv');
const roundsCsvPath = path.resolve(__dirname, 'American Express (2026) - Historical Data (1).csv');
const approachCsvPath = path.resolve(__dirname, 'American Express (2026) - Approach Skill.csv');
const configCsvPath = path.resolve(__dirname, 'American Express (2026) - Configuration Sheet.csv');

const fieldData = loadCsv(fieldCsvPath, { headerRow: 4, skipFirstColumn: true });
const rounds = loadCsv(roundsCsvPath, { headerRow: 4, skipFirstColumn: true });
const approachData = loadCsv(approachCsvPath, { headerRow: 4, skipFirstColumn: true });

// Parse config
const raw = fs.readFileSync(configCsvPath, 'utf8');
const configRows = parse(raw, { relax_quotes: true, relax_column_count: true, skip_empty_lines: false });
const headerIndex = configRows.findIndex(row => row.some(cell => String(cell || '').trim() === 'Metrics Groups'));
const header = configRows[headerIndex].map(cell => String(cell || '').trim());
const colIndex = (label) => header.findIndex(cell => cell === label);
const groupWeightCol = colIndex('Group Weight');
const metricsGroupsCol = colIndex('Metrics Groups');

const parseNumber = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(/[%,]/g, ''));
  return Number.isFinite(num) ? num : null;
};

const metricGroups = [];
for (let i = headerIndex + 1; i < configRows.length; i++) {
  const row = configRows[i] || [];
  const groupNameRaw = row[metricsGroupsCol];
  if (!groupNameRaw) continue;
  
  const groupName = String(groupNameRaw).trim();
  // Skip if not in expected groups
  if (!['Driving Performance', 'Putting', 'Around the Green', 'Scoring', 'Course Management',
         'Approach - Short (<100)', 'Approach - Mid (100-150)', 'Approach - Long (150-200)', 'Approach - Very Long (>200)'].includes(groupName)) {
    continue;
  }
  
  const groupWeight = parseNumber(row[groupWeightCol]);
  metricGroups.push({
    name: groupName,
    weight: groupWeight || 0,
    metrics: []
  });
}

console.log('=== LOADING DATA ===');
console.log(`Field size: ${fieldData.length}`);
console.log(`Historic rounds: ${rounds.length}`);
console.log(`Approach records: ${approachData.length}`);

// Aggregate player data
const players = aggregatePlayerData(fieldData, rounds, approachData, metricGroups, [], []);
console.log(`\nPlayers with aggregated data: ${Object.keys(players).length}`);

// Count how many players have historical data
const playersWithHistorical = Object.values(players).filter(p => p.historicalRounds.length > 0).length;
console.log(`Players with historical rounds: ${playersWithHistorical}`);

const playersWithApproach = Object.values(players).filter(p => Object.keys(p.approachMetrics).length > 0).length;
console.log(`Players with approach metrics: ${playersWithApproach}`);

// Calculate metrics for all players
const results = calculatePlayerMetrics(players, {
  groups: metricGroups,
  pastPerformance: { enabled: false, weight: 0 }
}, 0.6, 0.7, { under100: 0.154, from100to150: 0.253, from150to200: 0.293, over200: 0.3 });

console.log('\n=== FIELD STATISTICS ===');
console.log(`Ranked ${results.players.length} players`);

// Find Scheffler
const scheffler = results.players.find(p => p.dgId === '18417');
if (scheffler) {
  console.log(`\nScheffler rankings:`);
  console.log(`  Rank: ${scheffler.rank}`);
  console.log(`  Group Scores:`);
  Object.entries(scheffler.groupScores).forEach(([groupName, score]) => {
    console.log(`    ${groupName}: ${score.toFixed(3)}`);
  });
  console.log(`  Weighted Score: ${scheffler.weightedScore.toFixed(3)}`);
  console.log(`  Refined Score: ${scheffler.refinedWeightedScore.toFixed(3)}`);
  console.log(`  WAR: ${scheffler.war.toFixed(3)}`);
}

console.log('\n=== EXPECTED FROM APPS SCRIPT ===');
console.log(`Scheffler:`);
console.log(`  Rank: 1`);
console.log(`  Weighted Score: 3.074`);
console.log(`  Refined Score: 2.98`);
console.log(`  WAR: 0.26`);
console.log(`  Driving Performance: 2.383`);
console.log(`  Scoring: -0.590`);
console.log(`  Approach - Long (150-200): 10.223`);
