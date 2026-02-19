const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../core/metricConfigBuilder');
const { generatePlayerRankings } = require('../core/modelCore');
const { getDeltaPlayerScoresForEvent } = require('../utilities/deltaPlayerScores');

const ROOT_DIR = path.resolve(__dirname, '..');
let DATA_DIR = path.resolve(ROOT_DIR, 'data');
let OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');

const args = process.argv.slice(2);
let OVERRIDE_DIR = null;
let TOURNAMENT_NAME = null;
let SEASON = null;
let INCLUDE_CURRENT_EVENT_ROUNDS = false;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--dir' || args[i] === '--folder') && args[i + 1]) {
    OVERRIDE_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--tournament' || args[i] === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
  }
  if ((args[i] === '--season' || args[i] === '--year') && args[i + 1]) {
    const parsedSeason = parseInt(String(args[i + 1]).trim(), 10);
    SEASON = Number.isNaN(parsedSeason) ? null : parsedSeason;
  }
  if (args[i] === '--includeCurrentEventRounds' || args[i] === '--include-current-event-rounds') {
    INCLUDE_CURRENT_EVENT_ROUNDS = true;
  }
}

if (OVERRIDE_DIR) {
  const normalizedDir = OVERRIDE_DIR.replace(/^[\/]+|[\/]+$/g, '');
  const dataFolder = path.resolve(ROOT_DIR, 'data', normalizedDir);
  const outputFolder = path.resolve(ROOT_DIR, 'output', normalizedDir);
  if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder, { recursive: true });
  if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });
  DATA_DIR = dataFolder;
  OUTPUT_DIR = outputFolder;
}

const resolveTournamentFile = (suffix, tournamentName, season, fallbackName) => {
  const baseName = String(tournamentName || fallbackName || '').trim();
  const seasonTag = season ? `(${season})` : '';
  const exactName = baseName ? `${baseName} ${seasonTag} - ${suffix}.csv`.replace(/\s+/g, ' ').trim() : '';
  const altName = baseName ? `${baseName} - ${suffix}.csv` : '';

  const candidates = [];
  if (fs.existsSync(DATA_DIR)) {
    fs.readdirSync(DATA_DIR).forEach(file => {
      if (!file.toLowerCase().endsWith('.csv')) return;
      if (!file.toLowerCase().includes(suffix.toLowerCase())) return;
      candidates.push({ file, path: path.resolve(DATA_DIR, file) });
    });
  }

  if (exactName) {
    const match = candidates.find(c => c.file.toLowerCase() === exactName.toLowerCase());
    if (match) return match.path;
  }

  if (altName) {
    const match = candidates.find(c => c.file.toLowerCase() === altName.toLowerCase());
    if (match) return match.path;
  }

  if (baseName) {
    const match = candidates.find(c => c.file.toLowerCase().includes(baseName.toLowerCase()) && c.file.toLowerCase().includes(suffix.toLowerCase()));
    if (match) return match.path;
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.file.localeCompare(b.file));
    return candidates[0].path;
  }

  const fallback = exactName || altName || `${suffix}.csv`;
  return path.resolve(DATA_DIR, fallback);
};

const runParity = () => {
  const seasonValue = SEASON ?? new Date().getFullYear();
  const fallbackTournament = TOURNAMENT_NAME || 'Event';

  const configPath = resolveTournamentFile('Configuration Sheet', TOURNAMENT_NAME, seasonValue, fallbackTournament);
  const fieldPath = resolveTournamentFile('Tournament Field', TOURNAMENT_NAME, seasonValue, fallbackTournament);
  const historyPath = resolveTournamentFile('Historical Data', TOURNAMENT_NAME, seasonValue, fallbackTournament);
  const approachPath = resolveTournamentFile('Approach Skill', TOURNAMENT_NAME, seasonValue, fallbackTournament);

  const required = [
    { name: 'Configuration Sheet', path: configPath },
    { name: 'Tournament Field', path: fieldPath },
    { name: 'Historical Data', path: historyPath },
    { name: 'Approach Skill', path: approachPath }
  ];

  const missing = required.filter(file => !fs.existsSync(file.path));
  if (missing.length) {
    console.error('Missing required input files:');
    missing.forEach(file => console.error(`- ${file.name}: ${file.path}`));
    process.exit(1);
  }

  const sharedConfig = getSharedConfig(configPath);
  const currentEventId = String(sharedConfig.currentEventId || '').trim();
  if (!currentEventId) {
    console.error('Missing current event ID in configuration sheet (G9).');
    process.exit(1);
  }

  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId
  });

  const fieldData = loadCsv(fieldPath, { skipFirstColumn: true });
  const historyData = loadCsv(historyPath, { skipFirstColumn: true });
  const approachData = loadCsv(approachPath, { skipFirstColumn: true });

  const playerData = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId,
    currentSeason: seasonValue,
    includeCurrentEventRounds: INCLUDE_CURRENT_EVENT_ROUNDS
  });

  const deltaScoresById = getDeltaPlayerScoresForEvent(currentEventId, seasonValue) || {};

  const runtimeConfig = {
    currentSeason: seasonValue,
    deltaScoresById
  };

  const rankingResult = generatePlayerRankings(
    playerData.players,
    { groups: metricConfig.groups, pastPerformance: metricConfig.pastPerformance },
    playerData.historicalData,
    playerData.approachData,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds,
    runtimeConfig
  );

  const pickFields = player => ({
    rank: player.rank,
    dgId: player.dgId,
    name: player.name,
    weightedScore: player.weightedScore,
    refinedWeightedScore: player.refinedWeightedScore,
    war: player.war,
    deltaTrendScore: player.deltaTrendScore,
    deltaPredictiveScore: player.deltaPredictiveScore,
    deltaNote: player.deltaNote
  });

  const output = {
    timestamp: new Date().toISOString(),
    eventId: currentEventId,
    season: seasonValue,
    tournament: TOURNAMENT_NAME || fallbackTournament,
    dataDir: DATA_DIR,
    outputDir: OUTPUT_DIR,
    files: {
      configurationSheet: configPath,
      tournamentField: fieldPath,
      historicalData: historyPath,
      approachSkill: approachPath
    },
    summary: {
      players: rankingResult.players?.length || 0,
      includeCurrentEventRounds: INCLUDE_CURRENT_EVENT_ROUNDS
    },
    top50: (rankingResult.players || []).slice(0, 50).map(pickFields),
    players: (rankingResult.players || []).map(pickFields)
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'parity_modelcore.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Parity output saved to ${outputPath}`);

  const textLines = [];
  textLines.push('='.repeat(100));
  textLines.push('MODELCORE PARITY OUTPUT');
  textLines.push('='.repeat(100));
  textLines.push(`Timestamp: ${output.timestamp}`);
  textLines.push(`Event: ${output.eventId} | Season: ${output.season} | Tournament: ${output.tournament}`);
  textLines.push(`Data Dir: ${output.dataDir}`);
  textLines.push(`Include Current Event Rounds: ${output.summary.includeCurrentEventRounds}`);
  textLines.push(`Players: ${output.summary.players}`);
  textLines.push('');
  textLines.push('Top 50 Rankings:');
  textLines.push('Rank | DG ID | Name | Weighted | Refined | WAR | ΔTrend | ΔPred | ΔNote');
  textLines.push('-'.repeat(100));

  output.top50.forEach(player => {
    const values = [
      player.rank,
      player.dgId,
      player.name,
      typeof player.weightedScore === 'number' ? player.weightedScore.toFixed(3) : 'n/a',
      typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore.toFixed(3) : 'n/a',
      typeof player.war === 'number' ? player.war.toFixed(3) : 'n/a',
      typeof player.deltaTrendScore === 'number' ? player.deltaTrendScore.toFixed(3) : 'n/a',
      typeof player.deltaPredictiveScore === 'number' ? player.deltaPredictiveScore.toFixed(3) : 'n/a',
      player.deltaNote || ''
    ];
    textLines.push(values.join(' | '));
  });

  const textPath = path.resolve(OUTPUT_DIR, 'parity_modelcore.txt');
  fs.writeFileSync(textPath, textLines.join('\n'));
  console.log(`✅ Parity text output saved to ${textPath}`);
};

runParity();
