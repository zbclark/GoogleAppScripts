const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.resolve(ROOT_DIR, 'output', 'adaptive_optimizer_v2_results.json');

const args = process.argv.slice(2);
let INPUT_PATH = null;
let OVERRIDE_EVENT_ID = null;
let OVERRIDE_SEASON = null;
let DRY_RUN = false;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--input' || args[i] === '--file') && args[i + 1]) {
    INPUT_PATH = String(args[i + 1]).trim();
  }
  if ((args[i] === '--event' || args[i] === '--eventId') && args[i + 1]) {
    OVERRIDE_EVENT_ID = String(args[i + 1]).trim();
  }
  if ((args[i] === '--season' || args[i] === '--year') && args[i + 1]) {
    const parsedSeason = parseInt(String(args[i + 1]).trim(), 10);
    OVERRIDE_SEASON = Number.isNaN(parsedSeason) ? null : parsedSeason;
  }
  if (args[i] === '--dryRun' || args[i] === '--dry-run') {
    DRY_RUN = true;
  }
}

const inputPath = INPUT_PATH ? path.resolve(INPUT_PATH) : DEFAULT_INPUT;
if (!fs.existsSync(inputPath)) {
  console.error(`❌ Input file not found: ${inputPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const eventId = OVERRIDE_EVENT_ID || raw.eventId || raw.currentEventId || raw.event_id;
const season = OVERRIDE_SEASON || raw.season || raw.currentSeason || raw.year || null;
const playerSummary = raw?.approachDeltaPrior?.playerSummary || null;

if (!eventId) {
  console.error('❌ Event ID missing. Provide --event or ensure input JSON has eventId.');
  process.exit(1);
}

function buildDeltaPlayerScoresEntry(eventIdValue, seasonValue, summary) {
  if (!summary) return null;
  const trendScores = Array.isArray(summary.trendWeightedAll) ? summary.trendWeightedAll : [];
  const predictiveScores = Array.isArray(summary.predictiveWeightedAll) ? summary.predictiveWeightedAll : [];
  if (!trendScores.length && !predictiveScores.length) return null;

  const players = new Map();
  const upsert = (entry, scoreKey) => {
    const dgId = String(entry?.dgId || entry?.dg_id || '').trim();
    if (!dgId) return;
    const name = entry?.playerName || entry?.player_name || null;
    const score = typeof entry?.score === 'number' && !Number.isNaN(entry.score) ? entry.score : null;
    if (score === null) return;
    const current = players.get(dgId) || {};
    if (name && !current.name) current.name = name;
    current[scoreKey] = score;
    players.set(dgId, current);
  };

  trendScores.forEach(entry => upsert(entry, 'deltaTrendScore'));
  predictiveScores.forEach(entry => upsert(entry, 'deltaPredictiveScore'));

  if (players.size === 0) return null;

  const seasonParsed = typeof seasonValue === 'number' && !Number.isNaN(seasonValue)
    ? seasonValue
    : parseInt(String(seasonValue || '').trim(), 10);

  const sortedIds = Array.from(players.keys()).sort((a, b) => Number(a) - Number(b));
  const playersObject = {};
  sortedIds.forEach(id => {
    const entry = players.get(id);
    playersObject[id] = {
      name: entry?.name || null,
      deltaTrendScore: typeof entry?.deltaTrendScore === 'number' ? entry.deltaTrendScore : null,
      deltaPredictiveScore: typeof entry?.deltaPredictiveScore === 'number' ? entry.deltaPredictiveScore : null
    };
  });

  return {
    [String(eventIdValue)]: {
      season: Number.isNaN(seasonParsed) ? null : seasonParsed,
      players: playersObject
    }
  };
}

function buildDeltaPlayerScoresFileContent(deltaScoresByEvent, options = {}) {
  const { includeModuleExports = false } = options;
  const content = `const DELTA_PLAYER_SCORES = ${JSON.stringify(deltaScoresByEvent, null, 2)};\n\n`;
  let output = `${content}` +
    `function getDeltaPlayerScoresForEvent(eventId, season) {\n` +
    `  const key = eventId !== null && eventId !== undefined ? String(eventId).trim() : '';\n` +
    `  const entry = DELTA_PLAYER_SCORES[key];\n` +
    `  if (!entry) return {};\n` +
    `  if (season !== null && season !== undefined) {\n` +
    `    const seasonValue = parseInt(String(season).trim(), 10);\n` +
    `    if (!Number.isNaN(seasonValue) && entry.season && entry.season !== seasonValue) {\n` +
    `      return {};\n` +
    `    }\n` +
    `  }\n` +
    `  return entry.players || {};\n` +
    `}\n\n` +
    `function getDeltaPlayerScores() {\n` +
    `  return DELTA_PLAYER_SCORES;\n` +
    `}\n`;

  if (includeModuleExports) {
    output += `\nmodule.exports = { DELTA_PLAYER_SCORES, getDeltaPlayerScoresForEvent, getDeltaPlayerScores };\n`;
  }
  return output;
}

const deltaScoresByEvent = buildDeltaPlayerScoresEntry(eventId, season, playerSummary);
if (!deltaScoresByEvent) {
  console.error('❌ Delta player summary missing or empty in input JSON.');
  process.exit(1);
}

const nodeTarget = path.resolve(ROOT_DIR, 'utilities', 'deltaPlayerScores.js');
const gasTarget = path.resolve(ROOT_DIR, '..', 'Golf_Algorithm_Library', 'utilities', 'deltaPlayerScores.js');
const targets = [nodeTarget, gasTarget];

const outputDir = path.resolve(ROOT_DIR, 'output');
const outputs = [];

targets.forEach(filePath => {
  const includeModuleExports = filePath === nodeTarget;
  const content = buildDeltaPlayerScoresFileContent(deltaScoresByEvent, { includeModuleExports });
  if (DRY_RUN) {
    const suffix = includeModuleExports ? 'node' : 'gas';
    const baseName = path.basename(filePath, path.extname(filePath));
    const dryRunName = `dryrun_${baseName}.${suffix}${path.extname(filePath) || '.js'}`;
    const dryRunPath = path.resolve(outputDir, dryRunName);
    fs.writeFileSync(dryRunPath, content, 'utf8');
    outputs.push({ action: 'dryRun', target: dryRunPath });
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
    outputs.push({ action: 'write', target: filePath });
  }
});

outputs.forEach(entry => {
  const label = entry.action === 'dryRun' ? '🧪 Dry-run delta scores saved to' : '✅ Delta scores written to';
  console.log(`${label}: ${entry.target}`);
});
