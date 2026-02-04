const { loadCsv } = require('./csvLoader');
const modelCore = require('./modelCore');
const { aggregatePlayerData } = modelCore;
const path = require('path');

const fieldCsvPath = path.resolve(__dirname, 'American Express (2026) - Tournament Field.csv');
const roundsCsvPath = path.resolve(__dirname, 'American Express (2026) - Historical Data (1).csv');
const approachCsvPath = path.resolve(__dirname, 'American Express (2026) - Approach Skill.csv');

const fieldData = loadCsv(fieldCsvPath, { headerRow: 4, skipFirstColumn: true });
const rounds = loadCsv(roundsCsvPath, { headerRow: 4, skipFirstColumn: true });
const approachData = loadCsv(approachCsvPath, { headerRow: 4, skipFirstColumn: true });

const metricGroups = [];

// Check if field has player with dg_id '19846'
const testPlayerId = '19846';
const inField = fieldData.some(r => r.dg_id === testPlayerId);
console.log('Player 19846 in field:', inField);

// Count rounds for this player
const testRounds = rounds.filter(r => r.dg_id === testPlayerId);
console.log('Rounds for player 19846:', testRounds.length);

// Now run aggregatePlayerData
try {
  const result = aggregatePlayerData(fieldData, rounds, approachData, [], [], []);
  const testPlayer = result[testPlayerId];
  if (testPlayer) {
    console.log('After aggregatePlayerData:');
    console.log('  Test player:', testPlayer.name);
    console.log('  Historical rounds:', testPlayer.historicalRounds.length);
    console.log('  Events:', Object.keys(testPlayer.events || {}).length);
  } else {
    console.log('Player not found in result!');
    console.log('Players in result:', Object.keys(result).length);
  }
} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack.substring(0, 500));
}
