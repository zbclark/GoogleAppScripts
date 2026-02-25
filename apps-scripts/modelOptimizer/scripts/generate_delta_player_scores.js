const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
// NOTE: We intentionally do NOT default to ROOT_DIR/output anymore.
// If you don't pass --input, we try to use PRE_TOURNAMENT_OUTPUT_DIR set by core/optimizer.js.

function resolveDefaultInputPath() {
  const envDirRaw = String(process.env.PRE_TOURNAMENT_OUTPUT_DIR || '').trim();
  if (!envDirRaw) return null;
  const envDir = path.resolve(envDirRaw);

  const candidateDirs = [envDir];
  // Sometimes PRE_TOURNAMENT_OUTPUT_DIR points to a subfolder like course_history_regression/.
  try {
    const parent = path.dirname(envDir);
    if (parent && parent !== envDir) candidateDirs.push(parent);
  } catch (_) {
    // Ignore
  }

  // Real-world artifact names are typically slug-based, e.g.
  //   <tournamentSlug>_pre_event_results.json
  //   <tournamentSlug>_post_event_results.json
  // so we support suffix matching as a fallback.
  const candidateSuffixes = [
    // Prefer optimizer's post-event payload if available.
    '_post_event_results.json',
    // Back-compat: older runs used this suffix.
    '_post_tournament_results.json',
    // Pre-event payload.
    '_pre_event_results.json',
    // Post-event convention used elsewhere: <tournamentSlug>_results.json
    '_results.json'
  ];

  function resolveBySuffix(dir, suffixes) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const allFiles = entries
        .filter(e => e.isFile())
        .map(e => e.name);

      // Prefer earlier suffixes if multiple patterns exist in the same directory.
      for (const suffix of suffixes) {
        const matches = allFiles.filter(name => name.endsWith(suffix));
        if (!matches.length) continue;

        // Prefer non-legacy naming when both exist.
        const nonLegacy = matches.filter(name => !/^optimizer[_-]/.test(name));
        const candidates = nonLegacy.length > 0 ? nonLegacy : matches;

        const scored = candidates
          .map(name => {
            const fullPath = path.resolve(dir, name);
            let mtimeMs = 0;
            try {
              mtimeMs = fs.statSync(fullPath).mtimeMs || 0;
            } catch (_) {
              // Ignore
            }
            return { name, fullPath, mtimeMs };
          })
          .sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.name.localeCompare(b.name));

        return scored[0]?.fullPath || null;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  for (const dir of candidateDirs) {
    const bySuffix = resolveBySuffix(dir, candidateSuffixes);
    if (bySuffix && fs.existsSync(bySuffix)) return bySuffix;
  }

  return null;
}

const args = process.argv.slice(2);
let INPUT_PATH = null;
let OVERRIDE_EVENT_ID = null;
let OVERRIDE_SEASON = null;
let DRY_RUN = false;
let VERIFY = true;

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
  if (args[i] === '--no-verify') {
    VERIFY = false;
  }
}

const inputPath = INPUT_PATH ? path.resolve(INPUT_PATH) : resolveDefaultInputPath();
if (!inputPath || !fs.existsSync(inputPath)) {
  const fallbackText = inputPath ? `: ${inputPath}` : '.';
  console.error(`❌ Input file not found${fallbackText}`);
  console.error('Provide --input <path> or run from core/optimizer.js so PRE_TOURNAMENT_OUTPUT_DIR is set.');
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
  const upsert = (entry, scoreKey, bucketKey) => {
    const dgId = String(entry?.dgId || entry?.dg_id || '').trim();
    if (!dgId) return;
    const name = entry?.playerName || entry?.player_name || null;
    const score = typeof entry?.score === 'number' && !Number.isNaN(entry.score) ? entry.score : null;
    if (score === null) return;
    const current = players.get(dgId) || {};
    if (name && !current.name) current.name = name;
    current[scoreKey] = score;
    if (entry?.bucketScores && typeof entry.bucketScores === 'object') {
      current[bucketKey] = entry.bucketScores;
    }
    players.set(dgId, current);
  };

  trendScores.forEach(entry => upsert(entry, 'deltaTrendScore', 'deltaTrendBuckets'));
  predictiveScores.forEach(entry => upsert(entry, 'deltaPredictiveScore', 'deltaPredictiveBuckets'));

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
      deltaPredictiveScore: typeof entry?.deltaPredictiveScore === 'number' ? entry.deltaPredictiveScore : null,
      deltaTrendBuckets: entry?.deltaTrendBuckets || null,
      deltaPredictiveBuckets: entry?.deltaPredictiveBuckets || null
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
  const { includeModuleExports = true } = options;
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
const targets = [nodeTarget];
const outputs = [];

function ensureDir(dirPath) {
  if (!dirPath) return;
  if (fs.existsSync(dirPath)) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveDryRunOutputDir(resolvedInputPath) {
  const envDirRaw = String(process.env.PRE_TOURNAMENT_OUTPUT_DIR || '').trim();
  if (envDirRaw) {
    return path.resolve(envDirRaw, 'dryrun');
  }
  // Fall back to writing next to the input file (keeps artifacts co-located with the run).
  return path.resolve(path.dirname(resolvedInputPath), 'dryrun');
}

function verifyDeltaScoresModule(modulePath) {
  // Best-effort verification that the generated Node file is importable and exports the expected API.
  try {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
  } catch (_) {
    // Ignore
  }
  const loaded = require(modulePath);
  if (!loaded || typeof loaded !== 'object') {
    throw new Error('Generated module did not export an object');
  }
  if (typeof loaded.getDeltaPlayerScoresForEvent !== 'function') {
    throw new Error('Generated module missing getDeltaPlayerScoresForEvent export');
  }
  if (typeof loaded.getDeltaPlayerScores !== 'function') {
    throw new Error('Generated module missing getDeltaPlayerScores export');
  }
  if (!loaded.DELTA_PLAYER_SCORES || typeof loaded.DELTA_PLAYER_SCORES !== 'object') {
    throw new Error('Generated module missing DELTA_PLAYER_SCORES export');
  }
}

targets.forEach(filePath => {
  // Node-only workflow: always emit module.exports so downstream consumers can require this file.
  const includeModuleExports = true;
  const content = buildDeltaPlayerScoresFileContent(deltaScoresByEvent, { includeModuleExports });
  if (includeModuleExports && !content.includes('module.exports')) {
    console.error('❌ Internal error: expected generated output to include module.exports');
    process.exit(1);
  }
  if (DRY_RUN) {
    const suffix = includeModuleExports ? 'node' : 'js';
    const baseName = path.basename(filePath, path.extname(filePath));
    const dryRunName = `dryrun_${baseName}.${suffix}${path.extname(filePath) || '.js'}`;
    const dryRunDir = resolveDryRunOutputDir(inputPath);
    ensureDir(dryRunDir);
    const dryRunPath = path.resolve(dryRunDir, dryRunName);
    fs.writeFileSync(dryRunPath, content, 'utf8');
    if (VERIFY && includeModuleExports) {
      try {
        verifyDeltaScoresModule(dryRunPath);
      } catch (error) {
        console.error(`❌ Verification failed for ${dryRunPath}: ${error?.message || error}`);
        process.exit(1);
      }
    }
    outputs.push({ action: 'dryRun', target: dryRunPath });
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
    if (VERIFY && includeModuleExports) {
      try {
        verifyDeltaScoresModule(filePath);
      } catch (error) {
        console.error(`❌ Verification failed for ${filePath}: ${error?.message || error}`);
        process.exit(1);
      }
    }
    outputs.push({ action: 'write', target: filePath });
  }
});

outputs.forEach(entry => {
  const label = entry.action === 'dryRun' ? '🧪 Dry-run delta scores saved to' : '✅ Delta scores written to';
  console.log(`${label}: ${entry.target}`);
});
