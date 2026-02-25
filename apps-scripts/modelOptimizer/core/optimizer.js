

/**
 * Adaptive Weight Optimizer v2
 * 
 * Correct 4-Step Workflow:
 * Step 1: Historical Correlation Analysis (past years' metrics only)
 * Step 2: Baseline Rankings (2026 field with template weights)
 * Step 3: Weight Optimization (using 2026 approach metrics against 2026 results)
 * Step 4: Multi-Year Validation (test 2026 weights on past years with current metrics)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const { setupLogging } = require('../utilities/logging');
const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { generatePlayerRankings, cleanMetricValue } = require('./modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../utilities/metricConfigBuilder');
const { WEIGHT_TEMPLATES } = require('../utilities/weightTemplates');
const { getDeltaPlayerScoresForEvent } = require('../utilities/deltaPlayerScores');
const { loadApproachCsv, computeApproachDeltas, extractApproachRowsFromJson } = require('../utilities/approachDelta');
const {
  getDataGolfRankings,
  getDataGolfApproachSkill,
  getDataGolfFieldUpdates,
  getDataGolfPlayerDecompositions,
  getDataGolfSkillRatings,
  getDataGolfHistoricalRounds
} = require('../utilities/dataGolfClient');
const buildRecentYears = require('../utilities/buildRecentYears');
const collectRecords = require('../utilities/collectRecords');
const { extractHistoricalRowsFromSnapshotPayload } = require('../utilities/extractHistoricalRows');

function extractApproachRowsFromSnapshotPayload(payload) {
  if (typeof extractApproachRowsFromJson === 'function') {
    return extractApproachRowsFromJson(payload);
  }
  return [];
}

const ROOT_DIR = path.resolve(__dirname, '..');
let DATA_ROOT_DIR = path.resolve(ROOT_DIR, 'data');
let DATA_DIR = DATA_ROOT_DIR;
let DEFAULT_DATA_DIR = DATA_ROOT_DIR;
// Legacy note: this repo historically used a sibling `output/` folder. The Node-only
// workflow now writes artifacts under `data/<season>/<tournament-slug>/...`.
// Keep OUTPUT_DIR defined for internal helpers/overrides, but default it to `data/`
// so we don't implicitly create/use a generic `output/` directory.
let OUTPUT_DIR = path.resolve(ROOT_DIR, 'data');
let TOURNAMENT_INPUT_DIRS = [];
let VALIDATION_OUTPUT_DIRS = [];
const APPROACH_DELTA_DIR = path.resolve(ROOT_DIR, 'data', 'approach_deltas');
const APPROACH_SNAPSHOT_DIR = path.resolve(ROOT_DIR, 'data', 'approach_snapshot');
const APPROACH_SNAPSHOT_L24_PATH = path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_l24.json');
const APPROACH_SNAPSHOT_L12_PATH = path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_l12.json');
const APPROACH_SNAPSHOT_YTD_LATEST_PATH = path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_ytd_latest.json');
const APPROACH_L12_REFRESH_MONTH = (() => {
  const raw = parseInt(String(process.env.APPROACH_L12_REFRESH_MONTH || '').trim(), 10);
  if (Number.isNaN(raw)) return 12;
  return Math.min(12, Math.max(1, raw));
})();
const APPROACH_L12_FORCE_REFRESH = String(process.env.APPROACH_L12_FORCE_REFRESH || '').trim().toLowerCase();
const APPROACH_L12_REFRESH_SEASON = String(process.env.APPROACH_L12_REFRESH_SEASON || '').trim();
const APPROACH_L12_REFRESH_EVENT_ID = String(process.env.APPROACH_L12_REFRESH_EVENT_ID || '60').trim();
const APPROACH_SNAPSHOT_RETENTION_COUNTS = {
  ytd: (() => {
    const raw = parseInt(String(process.env.APPROACH_SNAPSHOT_RETENTION_YTD || '').trim(), 10);
    if (Number.isNaN(raw)) return 4;
    return Math.max(2, raw);
  })(),
  l24: null,
  l12: null
};
const COURSE_CONTEXT_PATH = path.resolve(ROOT_DIR, 'utilities', 'course_context.json');
const DATAGOLF_CACHE_DIR = path.resolve(ROOT_DIR, 'data', 'cache');
const TRACE_PLAYER = String(process.env.TRACE_PLAYER || '').trim();
let LOGGING_ENABLED = false;
let LOGGING_INITIALIZED = false;
let LOGGING_HANDLE = null;
const OPT_SEED_RAW = String(process.env.OPT_SEED || '').trim();
const OPT_TESTS_RAW = String(process.env.OPT_TESTS || '').trim();
const DATAGOLF_API_KEY = String(process.env.DATAGOLF_API_KEY || '').trim();
const DATAGOLF_RANKINGS_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_RANKINGS_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 24 : Math.max(1, raw);
})();
const DATAGOLF_APPROACH_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_APPROACH_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 24 : Math.max(1, raw);
})();
const DATAGOLF_APPROACH_PERIOD = String(process.env.DATAGOLF_APPROACH_PERIOD || 'l24')
  .trim()
  .toLowerCase();
const DATAGOLF_FIELD_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_FIELD_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 6 : Math.max(1, raw);
})();
const DATAGOLF_FIELD_TOUR = String(process.env.DATAGOLF_FIELD_TOUR || 'pga')
  .trim()
  .toLowerCase();
const DATAGOLF_SKILL_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_SKILL_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 24 : Math.max(1, raw);
})();
const DATAGOLF_SKILL_DISPLAY_VALUE = 'value';
const DATAGOLF_SKILL_DISPLAY_RANK = 'rank';
const DATAGOLF_DECOMP_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_DECOMP_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 24 : Math.max(1, raw);
})();
const DATAGOLF_DECOMP_TOUR = String(process.env.DATAGOLF_DECOMP_TOUR || 'pga')
  .trim()
  .toLowerCase();
const DATAGOLF_HISTORICAL_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_HISTORICAL_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 72 : Math.max(1, raw);
})();
const DATAGOLF_HISTORICAL_TOUR = String(process.env.DATAGOLF_HISTORICAL_TOUR || 'pga')
  .trim()
  .toLowerCase();
const DATAGOLF_HISTORICAL_EVENT_ID = String(process.env.DATAGOLF_HISTORICAL_EVENT_ID || 'all')
  .trim()
  .toLowerCase();
const DATAGOLF_HISTORICAL_YEAR_RAW = String(process.env.DATAGOLF_HISTORICAL_YEAR || '')
  .trim();
const VALIDATION_APPROACH_MODE = String(process.env.VALIDATION_APPROACH_MODE || 'current_only')
  .trim()
  .toLowerCase();
const PAST_PERF_RAMP_WEIGHT = (() => {
  const raw = parseFloat(String(process.env.PAST_PERF_RAMP_WEIGHT || '').trim());
  if (Number.isNaN(raw)) return 0.4;
  return Math.max(0, Math.min(1, raw));
})();
const VALIDATION_YEAR_WINDOW = 5;
const MIN_METRIC_COVERAGE = 0.70;
const VALIDATION_RANGE_PCT = 0.20;
const VALIDATION_PRIOR_WEIGHT = 0.25;
const DELTA_TREND_PRIOR_WEIGHT = 0.15;
const APPROACH_DELTA_PRIOR_WEIGHT = 0.15;
const APPROACH_DELTA_PRIOR_LABEL = 'approachDeltaPrior';
const APPROACH_DELTA_ROLLING_DEFAULT = 4;
const APPROACH_DELTA_MIN_DAYS = (() => {
  const raw = parseInt(String(process.env.APPROACH_DELTA_MIN_DAYS || '').trim(), 10);
  if (Number.isNaN(raw)) return 5;
  return Math.max(1, raw);
})();
let APPROACH_DELTA_ROLLING_EVENTS = (() => {
  const parsed = parseInt(String(process.env.APPROACH_DELTA_ROLLING_EVENTS || '').trim(), 10);
  if (Number.isNaN(parsed)) return APPROACH_DELTA_ROLLING_DEFAULT;
  if (parsed < 0) return APPROACH_DELTA_ROLLING_DEFAULT;
  return parsed;
})();
const DELTA_TREND_RANGE = {
  STABLE: 0.10,
  WATCH: 0.20,
  CHRONIC: 0.35
};

const hashSeed = value => {
  if (!value) return null;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRng = seedValue => {
  if (seedValue === null || seedValue === undefined) return null;
  let seed = Number(seedValue);
  if (Number.isNaN(seed)) seed = hashSeed(String(seedValue));
  if (seed === null) return null;
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const SEEDED_RANDOM = OPT_SEED_RAW ? createSeededRng(OPT_SEED_RAW) : null;
const rand = SEEDED_RANDOM || Math.random;

const buildFeatureVector = (player, metricSpecs) => {
  if (!player || !Array.isArray(player.metrics)) return null;
  const specs = normalizeMetricSpecs(metricSpecs);
  if (specs.length === 0) return null;

  let validCount = 0;
  const features = specs.map(({ label, index }) => {
    const rawValue = player.metrics[index];
    if (typeof rawValue === 'number' && !Number.isNaN(rawValue)) {
      validCount += 1;
      return LOWER_BETTER_GENERATED_METRICS.has(label) ? -rawValue : rawValue;
    }
    return 0;
  });

  const coverage = validCount / specs.length;
  if (coverage < MIN_METRIC_COVERAGE) return null;
  return { features, coverage };
};


// Parse CLI arguments
const args = process.argv.slice(2);
let TEMPLATE = null;
let OVERRIDE_EVENT_ID = null;
let OVERRIDE_SEASON = null;
let TOURNAMENT_NAME = null;
let DRY_RUN = true;
let INCLUDE_CURRENT_EVENT_ROUNDS = null;
let MAX_TESTS_OVERRIDE = null;
let WRITE_VALIDATION_TEMPLATES = false;
let WRITE_TEMPLATES = false;
let OVERRIDE_DIR = null;
let OVERRIDE_DATA_DIR = null;
let OVERRIDE_OUTPUT_DIR = null;
let OVERRIDE_ROLLING_DELTAS = null;
let OVERRIDE_APPROACH_DELTA_CURRENT = null;
let OVERRIDE_APPROACH_DELTA_PREVIOUS = null;
let OVERRIDE_APPROACH_DELTA_IGNORE_LAG = false;
let FORCE_RUN_MODE = null;
let FORCE_PRE_FLAG = false;
let FORCE_POST_FLAG = false;
let RUN_VALIDATION_ONLY = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--template' && args[i + 1]) {
    TEMPLATE = args[i + 1].toUpperCase();
  }
  if ((args[i] === '--event' || args[i] === '--eventId') && args[i + 1]) {
    OVERRIDE_EVENT_ID = String(args[i + 1]).trim();
  }
  if ((args[i] === '--season' || args[i] === '--year') && args[i + 1]) {
    const parsedSeason = parseInt(String(args[i + 1]).trim());
    OVERRIDE_SEASON = Number.isNaN(parsedSeason) ? null : parsedSeason;
  }
  if ((args[i] === '--tournament' || args[i] === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
  }
  if (args[i] === '--tests' && args[i + 1]) {
    const parsedTests = parseInt(String(args[i + 1]).trim(), 10);
    MAX_TESTS_OVERRIDE = Number.isNaN(parsedTests) ? null : parsedTests;
  }
  if (args[i] === '--log' || args[i] === '--verbose') {
    LOGGING_ENABLED = true;
  }
  if ((args[i] === '--dir' || args[i] === '--folder') && args[i + 1]) {
    OVERRIDE_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--dataDir' || args[i] === '--data-dir') && args[i + 1]) {
    OVERRIDE_DATA_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--outputDir' || args[i] === '--output-dir') && args[i + 1]) {
    OVERRIDE_OUTPUT_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--rollingDeltas' || args[i] === '--rolling-deltas') && args[i + 1]) {
    const parsedRolling = parseInt(String(args[i + 1]).trim(), 10);
    OVERRIDE_ROLLING_DELTAS = Number.isNaN(parsedRolling) ? null : parsedRolling;
  }
  if ((args[i] === '--approachDeltaCurrent' || args[i] === '--approach-delta-current') && args[i + 1]) {
    OVERRIDE_APPROACH_DELTA_CURRENT = String(args[i + 1]).trim();
  }
  if ((args[i] === '--approachDeltaPrevious' || args[i] === '--approach-delta-previous') && args[i + 1]) {
    OVERRIDE_APPROACH_DELTA_PREVIOUS = String(args[i + 1]).trim();
  }
  if (args[i] === '--approachDeltaIgnoreLag' || args[i] === '--approach-delta-ignore-lag') {
    OVERRIDE_APPROACH_DELTA_IGNORE_LAG = true;
  }
  if (args[i] === '--writeTemplates') {
    DRY_RUN = false;
    WRITE_TEMPLATES = true;
  }
  if (args[i] === '--writeValidationTemplates') {
    WRITE_VALIDATION_TEMPLATES = true;
  }
  if (
    args[i] === '--validation' ||
    args[i] === '--validationOnly' ||
    args[i] === '--validation-only' ||
    args[i] === '--runValidation' ||
    args[i] === '--run-validation'
  ) {
    RUN_VALIDATION_ONLY = true;
  }
  if (args[i] === '--pre' || args[i] === '--preTournament' || args[i] === '--pre-tournament') {
    FORCE_RUN_MODE = 'pre';
    FORCE_PRE_FLAG = true;
  }
  if (args[i] === '--post' || args[i] === '--postTournament' || args[i] === '--post-tournament') {
    FORCE_RUN_MODE = 'post';
    FORCE_POST_FLAG = true;
  }
  if (args[i] === '--dryRun' || args[i] === '--dry-run') {
    DRY_RUN = true;
  }
  if (args[i] === '--includeCurrentEventRounds' || args[i] === '--include-current-event-rounds') {
    INCLUDE_CURRENT_EVENT_ROUNDS = true;
  }
  if (args[i] === '--excludeCurrentEventRounds' || args[i] === '--exclude-current-event-rounds') {
    INCLUDE_CURRENT_EVENT_ROUNDS = false;
  }
}

const loggingEnv = String(process.env.LOGGING_ENABLED || '').trim().toLowerCase();
if (loggingEnv === '1' || loggingEnv === 'true' || loggingEnv === 'yes') {
  LOGGING_ENABLED = true;
}

const writeValidationEnv = String(process.env.WRITE_VALIDATION_TEMPLATES || '').trim().toLowerCase();
if (writeValidationEnv === '1' || writeValidationEnv === 'true' || writeValidationEnv === 'yes') {
  WRITE_VALIDATION_TEMPLATES = true;
}

const writeTemplatesEnv = String(process.env.WRITE_TEMPLATES || '').trim().toLowerCase();
if (writeTemplatesEnv === '1' || writeTemplatesEnv === 'true' || writeTemplatesEnv === 'yes') {
  WRITE_TEMPLATES = true;
  DRY_RUN = false;
}

if (OVERRIDE_DIR) {
  const normalizedDir = OVERRIDE_DIR.replace(/^[\/]+|[\/]+$/g, '');
  const dataFolder = path.resolve(ROOT_DIR, 'data', normalizedDir);
  if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
  }
  DATA_ROOT_DIR = dataFolder;
  DATA_DIR = dataFolder;
  DEFAULT_DATA_DIR = dataFolder;
  // Treat `--dir <name>` as a data-root override only.
  // Artifact writes should remain under `data/...` rather than `output/...`.
  OUTPUT_DIR = dataFolder;
}

if (OVERRIDE_DATA_DIR) {
  const resolvedDataDir = path.resolve(OVERRIDE_DATA_DIR);
  DATA_ROOT_DIR = resolvedDataDir;
  DATA_DIR = resolvedDataDir;
  DEFAULT_DATA_DIR = resolvedDataDir;
}

if (OVERRIDE_OUTPUT_DIR) {
  OUTPUT_DIR = path.resolve(OVERRIDE_OUTPUT_DIR);
}


if (typeof OVERRIDE_ROLLING_DELTAS === 'number' && OVERRIDE_ROLLING_DELTAS >= 0) {
  APPROACH_DELTA_ROLLING_EVENTS = OVERRIDE_ROLLING_DELTAS;
}

// --- Determine context for logging (pre/post/other) ---
let runContext = 'run';
if (FORCE_PRE_FLAG) runContext = 'pre_event';
else if (FORCE_POST_FLAG) runContext = 'post_event';

if (!LOGGING_ENABLED) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

console.log('---');
console.log('MODEL OPTIMIZER');
console.log('---');
if (OPT_SEED_RAW) {
  console.log(`OPT_SEED: ${OPT_SEED_RAW}`);
}

const normalizedTournamentName = String(TOURNAMENT_NAME || '').trim().toLowerCase();
const RUN_SEASON_VALIDATION = RUN_VALIDATION_ONLY && (
  !normalizedTournamentName
  || ['all', 'season', 'all-tournaments', '*'].includes(normalizedTournamentName)
);

if (!OVERRIDE_EVENT_ID && !RUN_SEASON_VALIDATION) {
  console.error('\n❌ Missing required argument: --event <eventId>');
  console.error('   Example: node optimizer.js --event 6 --season 2026 --tournament "Sony Open"');
  process.exit(1);
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return weights;
  const normalized = {};
  Object.entries(weights).forEach(([k, v]) => {
    normalized[k] = v / total;
  });
  return normalized;
}

function listCsvFilesInDirs(dirs) {
  const files = [];
  dirs.forEach(dir => {
    if (!dir || !fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      if (!file.toLowerCase().endsWith('.csv')) return;
      files.push({
        name: file,
        path: path.resolve(dir, file)
      });
    });
  });
  return files;
}

function findPlayerRankingModelCsv(outputDir, tournamentName) {
  if (!outputDir || !fs.existsSync(outputDir)) return null;
  const exactName = tournamentName ? `${tournamentName} - Player Ranking Model.csv` : null;
  if (exactName) {
    const exactPath = path.resolve(outputDir, exactName);
    if (fs.existsSync(exactPath)) return exactPath;
  }
  const candidates = fs.readdirSync(outputDir)
    .filter(name => name.toLowerCase().includes('player ranking model.csv'))
    .map(name => path.resolve(outputDir, name));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.localeCompare(b));
  return candidates[0];
}

function findValidationFileByKeywords(dirs, keywords = []) {
  const normalizedKeywords = keywords.map(keyword => String(keyword || '').toLowerCase());
  const candidates = listCsvFilesInDirs(dirs);
  const matches = candidates.filter(file => {
    const lower = file.name.toLowerCase();
    return normalizedKeywords.every(keyword => lower.includes(keyword));
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches[0].path;
}

function parseCsvRows(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, {
    relax_column_count: true,
    skip_empty_lines: false
  });
}

function normalizeValidationMetricName(metricName) {
  const aliases = {
    'Poor Shot Avoidance': 'Poor Shots'
  };
  return aliases[metricName] || metricName;
}

function buildMetricNameToGroupMap(metricConfig) {
  const map = new Map();
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return map;
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      map.set(metric.name, group.name);
    });
  });
  return map;
}

function resolveValidationMetricToConfig(metricName, metricConfig) {
  if (!metricName) return null;
  const normalized = normalizeValidationMetricName(metricName);
  const labelMap = buildMetricNameToGroupMap(metricConfig);
  if (labelMap.has(normalized)) return normalized;

  const stripped = normalizeGeneratedMetricLabel(normalized);
  if (!stripped) return null;
  const matches = [];
  labelMap.forEach((groupName, name) => {
    if (normalizeGeneratedMetricLabel(name) === stripped) {
      matches.push(name);
    }
  });
  if (matches.length === 1) return matches[0];
  return null;
}

function parseValidationTypeSummary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const rows = parseCsvRows(filePath);
  if (!rows.length) return null;

  let headerIndex = -1;
  let metricIdx = -1;
  let corrIdx = -1;

  rows.forEach((row, idx) => {
    if (headerIndex !== -1) return;
    const cells = row.map(cell => String(cell || '').trim());
    const metricCol = cells.findIndex(cell => cell.toLowerCase() === 'metric');
    const corrCol = cells.findIndex(cell => cell.toLowerCase().includes('avg correlation'));
    if (metricCol !== -1 && corrCol !== -1) {
      headerIndex = idx;
      metricIdx = metricCol;
      corrIdx = corrCol;
    }
  });

  if (headerIndex === -1) return null;
  const dataRows = rows.slice(headerIndex + 1);
  const metrics = [];
  dataRows.forEach(row => {
    const metric = String(row[metricIdx] || '').trim();
    if (!metric) return;
    const corrValue = parseFloat(String(row[corrIdx] || '').replace('%', '').trim());
    if (Number.isNaN(corrValue)) return;
    metrics.push({ metric, avgCorrelation: corrValue });
  });

  return metrics.length ? metrics : null;
}

function parseValidationWeightTemplates(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const rows = parseCsvRows(filePath);
  const results = { POWER: [], TECHNICAL: [], BALANCED: [] };
  let currentType = null;
  let columnIndex = null;

  rows.forEach(rawRow => {
    const row = rawRow.map(cell => String(cell || '').trim());
    const firstCell = row[0] || '';
    const upperCell = firstCell.toUpperCase();

    if (upperCell.includes('POWER COURSES')) {
      currentType = 'POWER';
      columnIndex = null;
      return;
    }
    if (upperCell.includes('TECHNICAL COURSES')) {
      currentType = 'TECHNICAL';
      columnIndex = null;
      return;
    }
    if (upperCell.includes('BALANCED COURSES')) {
      currentType = 'BALANCED';
      columnIndex = null;
      return;
    }

    if (!currentType) return;
    if (firstCell.toLowerCase() === 'metric') {
      columnIndex = {
        metric: row.findIndex(cell => cell.toLowerCase() === 'metric'),
        config: row.findIndex(cell => cell.toLowerCase().includes('config weight')),
        template: row.findIndex(cell => cell.toLowerCase().includes('template weight')),
        recommended: row.findIndex(cell => cell.toLowerCase().includes('recommended'))
      };
      return;
    }

    if (!columnIndex || columnIndex.metric === -1) return;
    const metric = row[columnIndex.metric];
    if (!metric) return;
    const configWeight = parseFloat(row[columnIndex.config]);
    const templateWeight = parseFloat(row[columnIndex.template]);
    const recommendedWeight = parseFloat(row[columnIndex.recommended]);
    results[currentType].push({
      metric,
      configWeight: Number.isNaN(configWeight) ? null : configWeight,
      templateWeight: Number.isNaN(templateWeight) ? null : templateWeight,
      recommendedWeight: Number.isNaN(recommendedWeight) ? null : recommendedWeight
    });
  });

  return results;
}

function parseValidationDeltaTrends(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const rows = parseCsvRows(filePath);
  if (!rows.length) return null;

  let headerIndex = -1;
  let metricIdx = -1;
  let biasIdx = -1;
  let statusIdx = -1;

  rows.forEach((row, idx) => {
    if (headerIndex !== -1) return;
    const cells = row.map(cell => String(cell || '').trim());
    const metricCol = cells.findIndex(cell => cell.toLowerCase() === 'metric');
    const biasCol = cells.findIndex(cell => cell.toLowerCase().includes('bias z'));
    const statusCol = cells.findIndex(cell => cell.toLowerCase() === 'status');
    if (metricCol !== -1) {
      headerIndex = idx;
      metricIdx = metricCol;
      biasIdx = biasCol;
      statusIdx = statusCol;
    }
  });

  if (headerIndex === -1) return null;
  const dataRows = rows.slice(headerIndex + 1);
  const results = [];
  dataRows.forEach(row => {
    const metric = String(row[metricIdx] || '').trim();
    if (!metric) return;
    const biasZ = biasIdx !== -1 ? parseFloat(String(row[biasIdx] || '').trim()) : null;
    const status = statusIdx !== -1 ? String(row[statusIdx] || '').trim().toUpperCase() : null;
    results.push({ metric, biasZ: Number.isNaN(biasZ) ? null : biasZ, status });
  });

  return results.length ? results : null;
}

function determineValidationCourseType(typeSummaries) {
  const scores = Object.entries(typeSummaries || {}).map(([type, metrics]) => {
    if (!metrics || metrics.length === 0) return { type, score: -Infinity };
    const total = metrics.reduce((sum, entry) => sum + Math.abs(entry.avgCorrelation || 0), 0);
    return { type, score: total / metrics.length };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score > -Infinity ? scores[0].type : null;
}

function buildTop20SignalMap(top20Correlations = [], top20Logistic = null, metricLabels = []) {
  const signalMap = new Map();
  const corrEntries = Array.isArray(top20Correlations)
    ? top20Correlations.filter(entry => typeof entry?.correlation === 'number' && Number.isFinite(entry.correlation))
    : [];
  if (corrEntries.length > 0) {
    const corrSum = corrEntries.reduce((sum, entry) => sum + Math.abs(entry.correlation), 0) || 0;
    corrEntries.forEach(entry => {
      const label = normalizeGeneratedMetricLabel(entry.label);
      if (!label) return;
      const value = Math.abs(entry.correlation);
      signalMap.set(label, corrSum > 0 ? value / corrSum : value);
    });
  }

  if (top20Logistic && top20Logistic.success && Array.isArray(top20Logistic.weights) && metricLabels.length > 0) {
    const weights = top20Logistic.weights.map(value => Math.abs(value || 0));
    const total = weights.reduce((sum, value) => sum + value, 0) || 0;
    weights.forEach((value, idx) => {
      const label = normalizeGeneratedMetricLabel(metricLabels[idx]);
      if (!label) return;
      const normalized = total > 0 ? value / total : value;
      const existing = signalMap.get(label) || 0;
      const blended = corrEntries.length > 0 ? (existing * 0.5 + normalized * 0.5) : normalized;
      signalMap.set(label, blended);
    });
  }

  return signalMap;
}

function computeTemplateAlignmentScores(metricConfig, templateConfigs = {}, signalMap = new Map()) {
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return {};
  if (!signalMap || signalMap.size === 0) return {};

  const scores = {};
  ['POWER', 'TECHNICAL', 'BALANCED'].forEach(type => {
    const template = templateConfigs[type];
    if (!template) return;
    const flatWeights = flattenMetricWeights(metricConfig, template.metricWeights || {});
    let total = 0;
    const weightMap = new Map();
    Object.entries(flatWeights).forEach(([key, value]) => {
      const [, metricNameRaw] = key.split('::');
      const label = normalizeGeneratedMetricLabel(metricNameRaw);
      if (!label) return;
      const weight = Math.abs(typeof value === 'number' ? value : 0);
      if (weight <= 0) return;
      weightMap.set(label, weight);
      total += weight;
    });
    if (total <= 0) return;

    let dot = 0;
    signalMap.forEach((signal, label) => {
      const templateWeight = weightMap.get(label) || 0;
      if (!templateWeight) return;
      dot += signal * (templateWeight / total);
    });
    scores[type] = dot;
  });

  return scores;
}

function buildValidationAlignmentMap(metricConfig, summaryMetrics = []) {
  const map = new Map();
  (summaryMetrics || []).forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    if (typeof entry.avgCorrelation !== 'number' || Number.isNaN(entry.avgCorrelation)) return;
    map.set(normalizeGeneratedMetricLabel(resolved), entry.avgCorrelation);
  });
  return map;
}

function buildDeltaTrendMap(metricConfig, deltaTrends = []) {
  const map = new Map();
  (deltaTrends || []).forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    const biasZ = typeof entry.biasZ === 'number' ? entry.biasZ : null;
    const score = biasZ !== null ? (1 - biasZ) : 0;
    map.set(normalizeGeneratedMetricLabel(resolved), score);
  });
  return map;
}

function buildValidationMetricWeights(metricConfig, validationWeights = [], fallbackMetricWeights = {}) {
  const metricWeights = { ...(fallbackMetricWeights || {}) };
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return metricWeights;

  const validationMap = new Map();
  validationWeights.forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    const weight = typeof entry.recommendedWeight === 'number'
      ? entry.recommendedWeight
      : (typeof entry.templateWeight === 'number' ? entry.templateWeight : null);
    if (weight === null || Number.isNaN(weight)) return;
    validationMap.set(resolved, weight);
  });

  metricConfig.groups.forEach(group => {
    const keys = group.metrics.map(metric => metric.name);
    const weights = keys.map(metricName => validationMap.has(metricName) ? validationMap.get(metricName) : null);
    const hasValidation = weights.some(weight => typeof weight === 'number');
    if (!hasValidation) return;
    const normalized = weights.map(weight => (typeof weight === 'number' ? weight : 0));
    const total = normalized.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return;
    group.metrics.forEach((metric, idx) => {
      const key = `${group.name}::${metric.name}`;
      metricWeights[key] = normalized[idx] / total;
    });
  });

  return metricWeights;
}

function buildValidationGroupWeights(metricConfig, summaryMetrics = [], fallbackGroupWeights = {}) {
  const groupWeights = { ...(fallbackGroupWeights || {}) };
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return groupWeights;
  const groupMap = buildMetricNameToGroupMap(metricConfig);
  const totals = {};

  summaryMetrics.forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    const groupName = groupMap.get(resolved);
    if (!groupName) return;
    const corr = Math.abs(entry.avgCorrelation || 0);
    totals[groupName] = (totals[groupName] || 0) + corr;
  });

  const totalWeight = Object.values(totals).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return groupWeights;

  Object.entries(totals).forEach(([groupName, value]) => {
    groupWeights[groupName] = value / totalWeight;
  });

  return normalizeWeights(groupWeights);
}

function buildValidationTemplateForType({
  type,
  metricConfig,
  validationData,
  templateConfigs,
  eventId,
  sourceLabel
}) {
  if (!type) return null;
  const weightsForType = validationData?.weightTemplates?.[type] || [];
  const summaryForType = validationData?.typeSummaries?.[type] || [];
  if (!weightsForType.length && !summaryForType.length) return null;

  const fallbackTemplate = templateConfigs?.[type]
    || templateConfigs?.[String(eventId)]
    || Object.values(templateConfigs || {})[0];

  const groupWeights = buildValidationGroupWeights(
    metricConfig,
    summaryForType,
    fallbackTemplate?.groupWeights || {}
  );
  const metricWeights = buildValidationMetricWeights(
    metricConfig,
    weightsForType,
    fallbackTemplate?.metricWeights || {}
  );

  const descriptionSuffix = sourceLabel ? ` (${sourceLabel})` : '';
  return {
    name: type,
    description: `Validation CSV ${type} template${descriptionSuffix}`,
    groupWeights,
    metricWeights: nestMetricWeights(metricWeights)
  };
}

function buildValidationMetricConstraints(metricConfig, validationWeights = [], rangePct = VALIDATION_RANGE_PCT) {
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return {};
  const constraints = {};
  const validationMap = new Map();
  validationWeights.forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    const weight = typeof entry.recommendedWeight === 'number'
      ? entry.recommendedWeight
      : (typeof entry.templateWeight === 'number' ? entry.templateWeight : null);
    if (weight === null || Number.isNaN(weight)) return;
    validationMap.set(resolved, weight);
  });

  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      const validated = validationMap.get(metric.name);
      if (validated === undefined) return;
      const key = `${group.name}::${metric.name}`;
      constraints[key] = {
        min: Math.max(0, validated * (1 - rangePct)),
        max: validated * (1 + rangePct)
      };
    });
  });

  return constraints;
}

function flattenMetricWeights(metricConfig, metricWeights) {
  const flattened = {};
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return flattened;
  if (!metricWeights) return flattened;

  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      const flatKey = `${group.name}::${metric.name}`;
      if (Object.prototype.hasOwnProperty.call(metricWeights, flatKey)) {
        const value = metricWeights[flatKey];
        flattened[flatKey] = typeof value === 'number' ? value : (value?.weight ?? null);
        return;
      }
      const groupBlock = metricWeights[group.name];
      if (groupBlock && Object.prototype.hasOwnProperty.call(groupBlock, metric.name)) {
        const entry = groupBlock[metric.name];
        flattened[flatKey] = typeof entry === 'number' ? entry : (entry?.weight ?? null);
      }
    });
  });

  return flattened;
}

function templatesAreDifferent(templateA, templateB, metricConfig, tolerance = 1e-4) {
  if (!templateA || !templateB) return true;
  const groupWeightsA = templateA.groupWeights || {};
  const groupWeightsB = templateB.groupWeights || {};
  const groupKeys = new Set([...Object.keys(groupWeightsA), ...Object.keys(groupWeightsB)]);
  for (const key of groupKeys) {
    const a = groupWeightsA[key] ?? null;
    const b = groupWeightsB[key] ?? null;
    if (a === null || b === null) return true;
    if (Math.abs(a - b) > tolerance) return true;
  }

  const flatA = flattenMetricWeights(metricConfig, templateA.metricWeights || {});
  const flatB = flattenMetricWeights(metricConfig, templateB.metricWeights || {});
  const metricKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);
  for (const key of metricKeys) {
    const a = flatA[key];
    const b = flatB[key];
    if (a === null || b === null || a === undefined || b === undefined) return true;
    if (Math.abs(a - b) > tolerance) return true;
  }

  return false;
}

function adjustConstraintsByDeltaTrends(metricConfig, constraints = {}, deltaTrends = []) {
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return constraints;
  if (!deltaTrends || deltaTrends.length === 0) return constraints;
  const statusMap = new Map();
  deltaTrends.forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    const status = String(entry.status || '').toUpperCase();
    statusMap.set(resolved, status);
  });

  const updated = { ...constraints };
  Object.entries(updated).forEach(([key, constraint]) => {
    const [, metricNameRaw] = key.split('::');
    const metricName = metricNameRaw ? metricNameRaw.trim() : null;
    if (!metricName || !constraint) return;
    const status = statusMap.get(metricName) || 'WATCH';
    const rangePct = DELTA_TREND_RANGE[status] ?? VALIDATION_RANGE_PCT;
    const center = (constraint.min + constraint.max) / 2;
    updated[key] = {
      min: Math.max(0, center * (1 - rangePct)),
      max: center * (1 + rangePct)
    };
  });

  return updated;
}

function summarizeDeltaTrendGuardrails(metricConfig, constraints = {}, deltaTrends = []) {
  const summary = {
    totalConstrained: 0,
    statusCounts: { STABLE: 0, WATCH: 0, CHRONIC: 0 },
    ranges: { ...DELTA_TREND_RANGE }
  };
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return summary;

  const statusMap = new Map();
  (deltaTrends || []).forEach(entry => {
    const resolved = resolveValidationMetricToConfig(entry.metric, metricConfig);
    if (!resolved) return;
    const status = String(entry.status || '').toUpperCase();
    statusMap.set(resolved, status);
  });

  Object.keys(constraints || {}).forEach(key => {
    const [, metricNameRaw] = key.split('::');
    const metricName = metricNameRaw ? metricNameRaw.trim() : null;
    if (!metricName) return;
    const status = statusMap.get(metricName) || 'WATCH';
    if (!summary.statusCounts[status]) summary.statusCounts[status] = 0;
    summary.statusCounts[status] += 1;
    summary.totalConstrained += 1;
  });

  return summary;
}

function applyMetricWeightConstraints(metricConfig, metricWeights, constraints = {}) {
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return metricWeights;
  const updated = { ...metricWeights };
  metricConfig.groups.forEach(group => {
    const keys = group.metrics.map(metric => `${group.name}::${metric.name}`);
    const clamped = keys.map(key => {
      const value = typeof updated[key] === 'number' ? updated[key] : 0;
      const constraint = constraints[key];
      if (!constraint) return value;
      return Math.min(constraint.max, Math.max(constraint.min, value));
    });
    const total = clamped.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return;
    keys.forEach((key, idx) => {
      updated[key] = clamped[idx] / total;
    });
  });
  return updated;
}

function loadValidationOutputs(metricConfig, dirs) {
  const dataDirs = dirs || [DATA_DIR, DEFAULT_DATA_DIR];
  const correlationDirs = [];
  dataDirs.forEach(dir => {
    if (!dir) return;
    const analysisDir = path.resolve(dir, 'template_correlation_analysis');
    const summariesDir = path.resolve(dir, 'template_correlation_summaries');
    if (fs.existsSync(analysisDir)) correlationDirs.push(analysisDir);
    if (fs.existsSync(summariesDir)) correlationDirs.push(summariesDir);
  });
  const searchDirs = [...dataDirs, ...correlationDirs];
  const findTypeSummaryFile = (typeLabel) => (
    findValidationFileByKeywords(searchDirs, ['03', typeLabel, 'summary']) ||
    findValidationFileByKeywords(searchDirs, [typeLabel, 'correlation', 'summary']) ||
    findValidationFileByKeywords(searchDirs, [typeLabel, 'correlation']) ||
    findValidationFileByKeywords(searchDirs, [typeLabel, 'summary']) ||
    null
  );
  const typeSummaries = {
    POWER: parseValidationTypeSummary(findTypeSummaryFile('power')) || [],
    TECHNICAL: parseValidationTypeSummary(findTypeSummaryFile('technical')) || [],
    BALANCED: parseValidationTypeSummary(findTypeSummaryFile('balanced')) || []
  };
  const weightTemplatesPath =
    findValidationFileByKeywords(searchDirs, ['weight', 'templates']) ||
    findValidationFileByKeywords(searchDirs, ['weight', 'template']) ||
    findValidationFileByKeywords(searchDirs, ['weight_templates']) ||
    null;
  const weightTemplates = parseValidationWeightTemplates(weightTemplatesPath) || { POWER: [], TECHNICAL: [], BALANCED: [] };
  const deltaTrendsPath =
    findValidationFileByKeywords(searchDirs, ['05', 'delta', 'trends']) ||
    findValidationFileByKeywords(searchDirs, ['model', 'delta', 'trends']) ||
    findValidationFileByKeywords(searchDirs, ['delta', 'trends']) ||
    null;
  const deltaTrends = parseValidationDeltaTrends(deltaTrendsPath) || [];

  const courseType = determineValidationCourseType(typeSummaries);
  if (courseType) {
    console.log(`✓ Validation course type selected from summaries: ${courseType}`);
  } else {
    console.log('ℹ️  Validation course type selection unavailable (missing summary CSVs).');
  }

  if (!weightTemplatesPath) {
    console.log('ℹ️  Validation weight templates CSV not found; skipping validation weight constraints.');
  }

  return {
    courseType,
    typeSummaries,
    weightTemplates,
    weightTemplatesPath,
    deltaTrends,
    deltaTrendsPath
  };
}

function findApproachDeltaFile(dirs, tournamentName, fallbackName) {
  const normalized = normalizeTemplateKey(tournamentName || fallbackName);
  const normalizedSlug = normalizeTournamentSlug(tournamentName || fallbackName);
  const candidates = [];

  (dirs || []).forEach(dir => {
    if (!dir || !fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      if (!file.toLowerCase().endsWith('.json')) return;
      const lower = file.toLowerCase();
      if (!lower.includes('approach_deltas')) return;
      candidates.push({ file, path: path.resolve(dir, file) });
    });
  });

  if (candidates.length === 0) return null;

  if (normalized) {
    const matches = candidates.filter(candidate => {
      const baseName = candidate.file.replace(/\.json$/i, '').replace(/^approach_deltas?_?/i, '');
      const normalizedFile = normalizeTemplateKey(baseName);
      return normalizedFile.includes(normalized);
    });
    if (matches.length > 0) {
      matches.sort((a, b) => a.file.localeCompare(b.file));
      return matches[0].path;
    }
  }

  if (normalizedSlug) {
    const slugMatches = candidates.filter(candidate => {
      const baseName = candidate.file.replace(/\.json$/i, '').replace(/^approach_deltas?_?/i, '');
      const normalizedFileSlug = normalizeTournamentSlug(baseName);
      if (!normalizedFileSlug) return false;
      return normalizedFileSlug === normalizedSlug || normalizedFileSlug.startsWith(`${normalizedSlug}-`) || normalizedFileSlug.startsWith(`${normalizedSlug}_`);
    });
    if (slugMatches.length > 0) {
      slugMatches.sort((a, b) => resolveApproachDeltaTimestamp(b.path) - resolveApproachDeltaTimestamp(a.path));
      return slugMatches[0].path;
    }
  }

  const hasQuery = Boolean(normalized || normalizedSlug);
  if (hasQuery) return null;
  if (candidates.length === 1) return candidates[0].path;
  candidates.sort((a, b) => a.file.localeCompare(b.file));
  return candidates[0].path;
}

function loadApproachDeltaRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { meta: null, rows: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(raw)) return { meta: null, rows: raw };
    if (raw && typeof raw === 'object') {
      return { meta: raw.meta || null, rows: Array.isArray(raw.rows) ? raw.rows : [] };
    }
  } catch (error) {
    console.warn(`⚠️  Failed to parse approach delta JSON: ${error.message}`);
  }
  return { meta: null, rows: [] };
}

function listApproachDeltaFiles(dirs) {
  const files = new Set();
  (dirs || []).forEach(dir => {
    if (!dir || !fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      const lower = file.toLowerCase();
      if (!lower.endsWith('.json')) return;
      if (!lower.includes('approach_deltas')) return;
      files.add(path.resolve(dir, file));
    });
  });
  return Array.from(files);
}

function parseApproachDeltaDateFromFilename(filePath) {
  const baseName = path.basename(filePath || '');
  const match = baseName.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (!match) return NaN;
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}T00:00:00Z`;
  return Date.parse(iso);
}

function resolveApproachDeltaTimestamp(filePath, meta) {
  const metaTime = meta?.generatedAt ? Date.parse(meta.generatedAt) : NaN;
  if (!Number.isNaN(metaTime)) return metaTime;
  const filenameTime = parseApproachDeltaDateFromFilename(filePath);
  if (!Number.isNaN(filenameTime)) return filenameTime;
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (error) {
    return 0;
  }
}

function resolveApproachSnapshotSourcePath(source) {
  if (!source) return null;
  if (typeof source !== 'string') return null;
  if (source.startsWith('snapshot:')) {
    const selector = source.slice('snapshot:'.length).trim().toLowerCase();
    const archives = listApproachSnapshotArchives();
    if (selector === 'previous') {
      if (archives.length > 1) return archives[archives.length - 2].path;
      if (archives.length === 1) return archives[0].path;
      return APPROACH_SNAPSHOT_YTD_LATEST_PATH;
    }
    if (selector === 'current') {
      if (archives.length > 0) return archives[archives.length - 1].path;
      return APPROACH_SNAPSHOT_YTD_LATEST_PATH;
    }
    return APPROACH_SNAPSHOT_YTD_LATEST_PATH;
  }
  if (fs.existsSync(source)) return source;
  return null;
}

function resolveApproachSnapshotTimestamp(source) {
  const resolvedPath = resolveApproachSnapshotSourcePath(source);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return null;
  if (!resolvedPath.toLowerCase().endsWith('.json')) {
    try {
      return fs.statSync(resolvedPath).mtimeMs;
    } catch (error) {
      return null;
    }
  }
  const payload = readJsonFile(resolvedPath);
  if (payload) {
    const lastUpdated = payload.last_updated || payload.lastUpdated || payload?.meta?.generatedAt || payload?.generatedAt || null;
    const parsed = lastUpdated ? Date.parse(String(lastUpdated)) : NaN;
    if (!Number.isNaN(parsed)) return parsed;
  }
  try {
    return fs.statSync(resolvedPath).mtimeMs;
  } catch (error) {
    return null;
  }
}

function buildRollingApproachDeltaRows(entries, metricSpecs, fieldIdSet, maxFiles = APPROACH_DELTA_ROLLING_EVENTS) {
  const filesToUse = entries.slice(0, Math.max(0, maxFiles));
  const accum = new Map();

  filesToUse.forEach(entry => {
    const rows = Array.isArray(entry?.rows) ? entry.rows : [];
    rows.forEach(row => {
      const dgId = String(row?.dg_id || row?.dgId || '').trim();
      if (!dgId) return;
      if (fieldIdSet && !fieldIdSet.has(dgId)) return;
      let target = accum.get(dgId);
      if (!target) {
        target = {
          dg_id: dgId,
          player_name: row?.player_name || row?.playerName || null,
          sums: {},
          counts: {}
        };
        accum.set(dgId, target);
      }
      if (!target.player_name && (row?.player_name || row?.playerName)) {
        target.player_name = row?.player_name || row?.playerName;
      }

      metricSpecs.forEach(spec => {
        const value = row?.[spec.key];
        if (typeof value !== 'number' || Number.isNaN(value)) return;
        target.sums[spec.key] = (target.sums[spec.key] || 0) + value;
        target.counts[spec.key] = (target.counts[spec.key] || 0) + 1;
      });
    });
  });

  const rows = [];
  accum.forEach(entry => {
    const outputRow = {
      dg_id: entry.dg_id,
      player_name: entry.player_name,
      tournament_field: fieldIdSet ? true : null
    };
    metricSpecs.forEach(spec => {
      const count = entry.counts[spec.key] || 0;
      outputRow[spec.key] = count > 0 ? entry.sums[spec.key] / count : null;
    });
    rows.push(outputRow);
  });

  return {
    rows,
    meta: {
      method: 'rolling_average',
      filesUsed: filesToUse.map(entry => entry.path),
      fileCount: filesToUse.length,
      maxFiles
    }
  };
}

function buildApproachDeltaAlignmentFromRollingRows(metricSpecs, rows) {
  const aggregates = new Map();
  (rows || []).forEach(row => {
    metricSpecs.forEach(spec => {
      if (!spec.alignmentLabel) return;
      const rawValue = row?.[spec.key];
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
      const adjustedValue = spec.lowerBetter ? -rawValue : rawValue;
      const label = normalizeGeneratedMetricLabel(spec.alignmentLabel);
      const entry = aggregates.get(label) || { sum: 0, count: 0 };
      entry.sum += adjustedValue;
      entry.count += 1;
      aggregates.set(label, entry);
    });
  });

  let maxAbs = 0;
  const map = new Map();
  aggregates.forEach((entry, label) => {
    const mean = entry.count > 0 ? entry.sum / entry.count : 0;
    map.set(label, mean);
    maxAbs = Math.max(maxAbs, Math.abs(mean));
  });

  if (maxAbs > 0) {
    map.forEach((value, label) => {
      map.set(label, value / maxAbs);
    });
  }

  return map;
}

function buildApproachAlignmentMapFromMetricWeights(metricConfig, metricWeights, metricSpecs) {
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return new Map();
  if (!metricWeights) return new Map();
  const targetLabels = new Set(
    (metricSpecs || [])
      .filter(spec => spec?.alignmentLabel)
      .map(spec => normalizeGeneratedMetricLabel(spec.alignmentLabel))
      .filter(Boolean)
  );
  if (targetLabels.size === 0) return new Map();

  const map = new Map();
  metricConfig.groups.forEach(group => {
    (group.metrics || []).forEach(metric => {
      const label = normalizeGeneratedMetricLabel(metric.name);
      if (!targetLabels.has(label)) return;
      const key = `${group.name}::${metric.name}`;
      const weight = metricWeights[key];
      if (typeof weight !== 'number' || Number.isNaN(weight)) return;
      map.set(label, Math.abs(weight));
    });
  });

  return map;
}

function buildApproachDeltaPlayerScores(metricSpecs, deltaRows, alignmentMap) {
  if (!alignmentMap || alignmentMap.size === 0) return [];
  const weightByLabel = new Map();
  alignmentMap.forEach((value, label) => {
    const weight = Math.abs(value || 0);
    if (weight > 0) weightByLabel.set(label, weight);
  });
  if (weightByLabel.size === 0) return [];

  const specs = (metricSpecs || []).filter(spec => spec.alignmentLabel);
  if (specs.length === 0) return [];

  const results = [];
  (deltaRows || []).forEach(row => {
    const dgId = String(row?.dg_id || row?.dgId || '').trim();
    if (!dgId) return;
    let weightedSum = 0;
    let totalWeight = 0;
    let usedMetrics = 0;
    const bucketTotals = {};
    const bucketWeights = {};
    const bucketUsed = {};

    specs.forEach(spec => {
      const label = normalizeGeneratedMetricLabel(spec.alignmentLabel);
      const weight = weightByLabel.get(label) || 0;
      if (!weight) return;
      const rawValue = row?.[spec.key];
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
      const adjustedValue = spec.lowerBetter ? -rawValue : rawValue;
      weightedSum += adjustedValue * weight;
      totalWeight += weight;
      usedMetrics += 1;

      if (spec.bucketKey) {
        const key = spec.bucketKey;
        bucketTotals[key] = (bucketTotals[key] || 0) + (adjustedValue * weight);
        bucketWeights[key] = (bucketWeights[key] || 0) + weight;
        bucketUsed[key] = (bucketUsed[key] || 0) + 1;
      }
    });

    if (totalWeight === 0) return;
    const bucketScores = {};
    Object.keys(bucketTotals).forEach(key => {
      const bucketWeight = bucketWeights[key] || 0;
      if (bucketWeight > 0) {
        bucketScores[key] = bucketTotals[key] / bucketWeight;
      }
    });
    results.push({
      dgId,
      playerName: row?.player_name || row?.playerName || null,
      score: weightedSum / totalWeight,
      usedMetrics,
      bucketScores,
      bucketUsedMetrics: bucketUsed
    });
  });

  return results.sort((a, b) => (b.score || 0) - (a.score || 0));
}

function getApproachDeltaFileEntries(dirs, excludePath = null) {
  const normalizedExclude = excludePath ? path.resolve(excludePath) : null;
  const entries = listApproachDeltaFiles(dirs)
    .filter(file => !normalizedExclude || path.resolve(file) !== normalizedExclude)
    .map(file => {
      const data = loadApproachDeltaRows(file);
      return {
        path: file,
        meta: data.meta || null,
        rows: Array.isArray(data.rows) ? data.rows : [],
        time: resolveApproachDeltaTimestamp(file, data.meta)
      };
    })
    .filter(entry => entry.rows.length > 0);

  entries.sort((a, b) => (b.time || 0) - (a.time || 0));
  return entries;
}

function buildApproachDeltaMetricSpecs() {
  const bucketDefs = [
    { bucket: '50_100_fw', labelBase: 'Approach <100', bucketKey: 'short' },
    { bucket: '100_150_fw', labelBase: 'Approach <150 FW', bucketKey: 'mid' },
    { bucket: '150_200_fw', labelBase: 'Approach <200 FW', bucketKey: 'long' },
    { bucket: 'under_150_rgh', labelBase: 'Approach <150 Rough', bucketKey: 'mid' },
    { bucket: 'over_150_rgh', labelBase: 'Approach >150 Rough', bucketKey: 'long' },
    { bucket: 'over_200_fw', labelBase: 'Approach >200 FW', bucketKey: 'veryLong' }
  ];

  const specs = [];
  const addSpec = (key, label, lowerBetter, alignmentLabel = null, bucketKey = null) => {
    specs.push({ key, label, lowerBetter, alignmentLabel, bucketKey });
  };

  bucketDefs.forEach(({ bucket, labelBase, bucketKey }) => {
    addSpec(`delta_${bucket}_gir_rate`, `${labelBase} GIR`, false, `${labelBase} GIR`, bucketKey);
    addSpec(`delta_${bucket}_sg_per_shot`, `${labelBase} SG`, false, `${labelBase} SG`, bucketKey);
    addSpec(`delta_${bucket}_proximity_per_shot`, `${labelBase} Prox`, true, `${labelBase} Prox`, bucketKey);
    addSpec(`delta_${bucket}_good_shot_rate`, `${labelBase} Good Shot Rate`, false, null, bucketKey);
    addSpec(`delta_${bucket}_poor_shot_avoid_rate`, `${labelBase} Poor Shot Avoid Rate`, false, null, bucketKey);
    addSpec(`delta_${bucket}_good_shot_count`, `${labelBase} Good Shot Count`, false, null, bucketKey);
    addSpec(`delta_${bucket}_poor_shot_count`, `${labelBase} Poor Shot Count`, true, null, bucketKey);
    addSpec(`weighted_delta_${bucket}_good_shot_rate`, `${labelBase} Weighted Δ Good Shot Rate`, false, null, bucketKey);
    addSpec(`weighted_delta_${bucket}_poor_shot_avoid_rate`, `${labelBase} Weighted Δ Poor Shot Avoid Rate`, false, null, bucketKey);
  });

  return specs;
}

function computeApproachDeltaCorrelations(deltaRows, results, metricSpecs) {
  const { map: resultsById } = buildFinishPositionMap(results);

  return metricSpecs.map(spec => {
    const xValues = [];
    const yValues = [];
    (deltaRows || []).forEach(row => {
      const dgId = String(row.dg_id || row.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return;
      const rawValue = row[spec.key];
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
      const adjustedValue = spec.lowerBetter ? -rawValue : rawValue;
      xValues.push(adjustedValue);
      yValues.push(-finishPosition);
    });

    if (xValues.length < 5) {
      return { label: spec.label, key: spec.key, correlation: 0, samples: xValues.length, alignmentLabel: spec.alignmentLabel, lowerBetter: spec.lowerBetter };
    }

    return {
      label: spec.label,
      key: spec.key,
      correlation: calculateSpearmanCorrelation(xValues, yValues),
      samples: xValues.length,
      alignmentLabel: spec.alignmentLabel,
      lowerBetter: spec.lowerBetter
    };
  });
}

function buildApproachDeltaAlignmentMap(metricConfig, deltaCorrelations = []) {
  const map = new Map();
  (deltaCorrelations || []).forEach(entry => {
    if (!entry?.alignmentLabel) return;
    if (typeof entry.correlation !== 'number' || Number.isNaN(entry.correlation)) return;
    map.set(normalizeGeneratedMetricLabel(entry.alignmentLabel), entry.correlation);
  });
  return map;
}

function normalizeTemplateKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const APPROACH_GROUPS = new Set([
  'Approach - Short (<100)',
  'Approach - Mid (100-150)',
  'Approach - Long (150-200)',
  'Approach - Very Long (>200)'
]);

function removeApproachGroupWeights(groupWeights) {
  const adjusted = { ...groupWeights };
  Object.keys(adjusted).forEach(groupName => {
    if (APPROACH_GROUPS.has(groupName)) {
      adjusted[groupName] = 0;
    }
  });
  return normalizeWeights(adjusted);
}

const HISTORICAL_METRICS = [
  { key: 'scoringAverage', label: 'Scoring Average', lowerBetter: true },
  { key: 'eagles', label: 'Eagles or Better', lowerBetter: false },
  { key: 'birdies', label: 'Birdies', lowerBetter: false },
  { key: 'birdiesOrBetter', label: 'Birdies or Better', lowerBetter: false },
  { key: 'strokesGainedTotal', label: 'SG Total', lowerBetter: false },
  { key: 'drivingDistance', label: 'Driving Distance', lowerBetter: false },
  { key: 'drivingAccuracy', label: 'Driving Accuracy', lowerBetter: false, percentage: true },
  { key: 'strokesGainedT2G', label: 'SG T2G', lowerBetter: false },
  { key: 'strokesGainedApp', label: 'SG Approach', lowerBetter: false },
  { key: 'strokesGainedArg', label: 'SG Around Green', lowerBetter: false },
  { key: 'strokesGainedOTT', label: 'SG OTT', lowerBetter: false },
  { key: 'strokesGainedPutt', label: 'SG Putting', lowerBetter: false },
  { key: 'greensInReg', label: 'GIR', lowerBetter: false, percentage: true },
  { key: 'scrambling', label: 'Scrambling', lowerBetter: false, percentage: true },
  { key: 'greatShots', label: 'Great Shots', lowerBetter: false },
  { key: 'poorShots', label: 'Poor Shots', lowerBetter: true },
  { key: 'fairwayProx', label: 'Fairway Proximity', lowerBetter: true },
  { key: 'roughProx', label: 'Rough Proximity', lowerBetter: true }
];

const GENERATED_METRIC_LABELS = [
  'SG Total',
  'Driving Distance',
  'Driving Accuracy',
  'SG T2G',
  'SG Approach',
  'SG Around Green',
  'SG OTT',
  'SG Putting',
  'Greens in Regulation',
  'Scrambling',
  'Great Shots',
  'Poor Shots',
  'Scoring Average',
  'Birdies or Better',
  'Birdie Chances Created',
  'Fairway Proximity',
  'Rough Proximity',
  'Approach <100 GIR',
  'Approach <100 SG',
  'Approach <100 Prox',
  'Approach <150 FW GIR',
  'Approach <150 FW SG',
  'Approach <150 FW Prox',
  'Approach <150 Rough GIR',
  'Approach <150 Rough SG',
  'Approach <150 Rough Prox',
  'Approach >150 Rough GIR',
  'Approach >150 Rough SG',
  'Approach >150 Rough Prox',
  'Approach <200 FW GIR',
  'Approach <200 FW SG',
  'Approach <200 FW Prox',
  'Approach >200 FW GIR',
  'Approach >200 FW SG',
  'Approach >200 FW Prox'
];

const SHEET_LIKE_METRIC_LABELS = GENERATED_METRIC_LABELS;
const SHEET_LIKE_PERCENTAGE_INDICES = new Set([
  2,  // Driving Accuracy
  8,  // Greens in Regulation
  9,  // Scrambling
  17, // Approach <100 GIR
  20, // Approach <150 FW GIR
  23, // Approach <150 Rough GIR
  26, // Approach >150 Rough GIR
  29, // Approach <200 FW GIR
  32  // Approach >200 FW GIR
]);

function formatSheetMetricValue(value, index) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0.000';
  if (SHEET_LIKE_PERCENTAGE_INDICES.has(index)) {
    const pctValue = value <= 1.5 ? value * 100 : value;
    return `${pctValue.toFixed(2)}%`;
  }
  return Number(value.toFixed(3)).toFixed(3);
}

function generateSheetLikePlayerNotes(player, groups, groupStats) {
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
    if (!player.metrics || !player.metrics[metric.index] ||
        !groupStats || !groupStats[metric.group] ||
        !groupStats[metric.group][metric.name]) {
      return;
    }

    const playerValue = player.metrics[metric.index];
    const mean = groupStats[metric.group][metric.name].mean;
    const stdDev = groupStats[metric.group][metric.name].stdDev;
    const zScore = (playerValue - mean) / (stdDev || 0.001);

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
      strengths.push({
        name: displayName,
        score: adjustedZScore,
        weight: metric.weight
      });
    } else if (adjustedZScore <= -0.75) {
      weaknesses.push({
        name: displayName,
        score: adjustedZScore,
        weight: metric.weight
      });
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

  let hasStrongFitNote = false;
  let hasPoorFitNote = false;
  if (fitPercentage >= 50) {
    notes.push('✅ Strong course fit');
    hasStrongFitNote = true;
  } else if (fitPercentage >= 25) {
    notes.push('👍 Good course fit');
  } else if (weaknesses.length > 0 && weaknesses.some(w => w.weight > 0.1)) {
    notes.push('⚠️ Poor course fit');
    hasPoorFitNote = true;
  }

  const bucketSigMatch = player.deltaNote ? player.deltaNote.match(/BucketSig\s+([↑↓])\s+z=([\-\d.]+)/) : null;
  if (bucketSigMatch) {
    const bucketArrow = bucketSigMatch[1];
    const bucketZ = parseFloat(bucketSigMatch[2]);
    if (hasPoorFitNote && (bucketArrow === '↑' || bucketZ >= 0.75)) {
      notes.push('ℹ️ Recent bucket trend strong (short-term) despite baseline fit');
    } else if (hasStrongFitNote && (bucketArrow === '↓' || bucketZ <= -0.75)) {
      notes.push('ℹ️ Recent bucket trend weak (short-term) despite baseline fit');
    }
  }

  const trendMetricNames = [
    'Total game', 'Driving', 'Accuracy', 'Tee-to-green',
    'Approach', 'Around green', 'Off tee', 'Putting',
    'GIR', 'Scrambling', 'Great shots', 'Poor shots',
    'Scoring', 'Birdies'
  ];

  let strongestTrend = null;
  let strongestValue = 0;

  player.trends?.forEach((trend, i) => {
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

  if (player.deltaNote) {
    notes.push(player.deltaNote);
  }

  return notes.join(' | ');
}

function buildSheetLikeRankingCsv(ranking, groups) {
  const players = Array.isArray(ranking?.players) ? ranking.players : [];
  const groupStats = ranking?.groupStats || {};
  const metricLabels = SHEET_LIKE_METRIC_LABELS;

  const computeMedian = (values) => {
    const filtered = values.filter(value => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
    if (!filtered.length) return null;
    const mid = Math.floor(filtered.length / 2);
    if (filtered.length % 2 === 0) {
      return (filtered[mid - 1] + filtered[mid]) / 2;
    }
    return filtered[mid];
  };

  const deltaTrendMedian = computeMedian(players.map(player => player.deltaTrendScore));
  const deltaPredictiveMedian = computeMedian(players.map(player => player.deltaPredictiveScore));
  const deltaTrendHeader = `Delta Trend Score (median=${deltaTrendMedian === null ? 'n/a' : deltaTrendMedian.toFixed(3)})`;
  const deltaPredictiveHeader = `Delta Predictive Score (median=${deltaPredictiveMedian === null ? 'n/a' : deltaPredictiveMedian.toFixed(3)})`;

  if (metricLabels.length !== 35) {
    throw new Error('Invalid metric labels for sheet-like CSV');
  }

  const headers = [
    'Expected Peformance Notes',
    'Rank', 'DG ID', 'Player Name', 'Top 5', 'Top 10', 'Weighted Score', 'Past Perf. Mult.',
    ...metricLabels.slice(0, 17).flatMap(m => [m, `${m} Trend`]),
    ...metricLabels.slice(17),
    'Refined Weighted Score',
    'WAR',
    deltaTrendHeader,
    deltaPredictiveHeader
  ];

  const rows = [];
  const blankRow = Array(headers.length).fill('');
  rows.push(blankRow, blankRow, blankRow, blankRow);
  rows.push(headers);

  // Add a dedicated median row for quick filtering/benchmarking in Sheets.
  // NOTE: Leave DG ID blank so downstream parsers (validationRunner) skip this row.
  const medianHistoricalMetrics = metricLabels.slice(0, 17).map((_, idx) => {
    const median = computeMedian(players.map(player => player.metrics?.[idx]));
    return median === null ? '' : formatSheetMetricValue(median, idx);
  });

  // Historical trends align with the same mapping used in the player rows.
  // idx === 14 is a reserved/blank trend slot in the existing export logic.
  const medianHistoricalTrends = metricLabels.slice(0, 17).map((_, idx) => {
    if (idx === 14) return '0.000';
    const trendIdx = idx < 14 ? idx : idx - 1;
    const median = computeMedian(players.map(player => player.trends?.[trendIdx]));
    return median === null ? '' : Number(median.toFixed(3)).toFixed(3);
  });

  const medianApproach = metricLabels.slice(17).map((_, idx) => {
    const metricIdx = idx + 17;
    const median = computeMedian(players.map(player => player.metrics?.[metricIdx]));
    return median === null ? '' : formatSheetMetricValue(median, metricIdx);
  });

  const refinedWeightedScoreMedian = computeMedian(players.map(player => player.refinedWeightedScore));
  const warMedian = computeMedian(players.map(player => player.war));
  const deltaTrendMedianValue = computeMedian(players.map(player => player.deltaTrendScore));
  const deltaPredMedianValue = computeMedian(players.map(player => player.deltaPredictiveScore));

  const medianTrailingValues = [
    refinedWeightedScoreMedian === null ? '' : Number(refinedWeightedScoreMedian.toFixed(2)).toFixed(2),
    warMedian === null ? '' : Number(warMedian.toFixed(2)).toFixed(2),
    deltaTrendMedianValue === null ? '' : Number(deltaTrendMedianValue.toFixed(3)).toFixed(3),
    deltaPredMedianValue === null ? '' : Number(deltaPredMedianValue.toFixed(3)).toFixed(3)
  ];

  const medianRow = [
    'MEDIAN',
    '', // Rank
    '', // DG ID (blank so parsers skip)
    '', // Player Name
    '', // Top 5
    '', // Top 10
    '', // Weighted Score
    '', // Past Perf. Mult.
    ...medianHistoricalMetrics.flatMap((metricVal, idx) => [metricVal, medianHistoricalTrends[idx]]),
    ...medianApproach,
    ...medianTrailingValues
  ];

  rows.push(medianRow);

  players.forEach(player => {
    if (!player.metrics) player.metrics = Array(35).fill(0);
    if (!player.trends) player.trends = Array(17).fill(0);

    const notes = generateSheetLikePlayerNotes(player, groups, groupStats);
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
        return [formatSheetMetricValue(val, idx), '0.000'];
      }
      const trendIdx = idx < 14 ? idx : idx - 1;
      const trendValue = (player.trends && player.trends[trendIdx] !== undefined)
        ? Number(player.trends[trendIdx]).toFixed(3)
        : '0.000';
      return [formatSheetMetricValue(val, idx), trendValue];
    });

    const approach = player.metrics.slice(17).map((val, idx) => formatSheetMetricValue(val, idx + 17));

    const refinedWeightedScoreValue = (typeof player.refinedWeightedScore === 'number' && !Number.isNaN(player.refinedWeightedScore))
      ? player.refinedWeightedScore.toFixed(2)
      : '0.00';
    const deltaTrendValue = typeof player.deltaTrendScore === 'number' && !Number.isNaN(player.deltaTrendScore)
      ? player.deltaTrendScore.toFixed(3)
      : '';
    const deltaPredValue = typeof player.deltaPredictiveScore === 'number' && !Number.isNaN(player.deltaPredictiveScore)
      ? player.deltaPredictiveScore.toFixed(3)
      : '';
    const warValue = typeof player.war === 'number' && !Number.isNaN(player.war)
      ? player.war.toFixed(2)
      : '0.00';
    const trailingValues = [refinedWeightedScoreValue, warValue, deltaTrendValue, deltaPredValue];

    rows.push([...base, ...historical, ...approach, ...trailingValues]);
  });

  return rows.map(row => row.map(value => JSON.stringify(value ?? '')).join(',')).join('\n');
}

const SKILL_RATING_METRICS = [
  { label: 'SG Total', skillKey: 'sg_total' },
  { label: 'SG OTT', skillKey: 'sg_ott' },
  { label: 'SG Approach', skillKey: 'sg_app' },
  { label: 'SG Around Green', skillKey: 'sg_arg' },
  { label: 'SG Putting', skillKey: 'sg_putt' },
  { label: 'Driving Distance', skillKey: 'driving_dist' },
  { label: 'Driving Accuracy', skillKey: 'driving_acc' }
];

const LOWER_BETTER_GENERATED_METRICS = new Set([
  'Poor Shots',
  'Scoring Average',
  'Fairway Proximity',
  'Rough Proximity',
  'Approach <100 Prox',
  'Approach <150 FW Prox',
  'Approach <150 Rough Prox',
  'Approach >150 Rough Prox',
  'Approach <200 FW Prox',
  'Approach >200 FW Prox'
]);

function deriveBirdiesOrBetterFromRow(row) {
  if (!row) return null;
  const hasBirdies = row.birdies !== undefined && row.birdies !== null;
  const hasEagles = row.eagles_or_better !== undefined && row.eagles_or_better !== null;
  if (hasBirdies || hasEagles) {
    const birdies = hasBirdies ? cleanMetricValue(row.birdies) : 0;
    const eagles = hasEagles ? cleanMetricValue(row.eagles_or_better) : 0;
    return birdies + eagles;
  }
  if (row.birdies_or_better !== undefined && row.birdies_or_better !== null) {
    return cleanMetricValue(row.birdies_or_better);
  }
  return null;
}

function buildHistoricalMetricSamples(rawHistoryData, eventId) {
  const samples = [];
  const eventIdStr = String(eventId || '').trim();

  rawHistoryData.forEach(row => {
    const rowEventId = String(row['event_id'] || '').trim();
    if (eventIdStr && rowEventId !== eventIdStr) return;

    const year = parseInt(String(row['year'] || row['season'] || '').trim());
    if (Number.isNaN(year)) return;

    const finishPosition = parseFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;

    const derivedBirdiesOrBetter = deriveBirdiesOrBetterFromRow(row);

    const metrics = {
      scoringAverage: row.score ? cleanMetricValue(row.score) : null,
      eagles: row.eagles_or_better ? cleanMetricValue(row.eagles_or_better) : null,
      birdies: row.birdies ? cleanMetricValue(row.birdies) : null,
      birdiesOrBetter: typeof derivedBirdiesOrBetter === 'number' ? derivedBirdiesOrBetter : null,
      strokesGainedTotal: row.sg_total ? cleanMetricValue(row.sg_total) : null,
      drivingDistance: row.driving_dist ? cleanMetricValue(row.driving_dist) : null,
      drivingAccuracy: row.driving_acc ? cleanMetricValue(row.driving_acc, true) : null,
      strokesGainedT2G: row.sg_t2g ? cleanMetricValue(row.sg_t2g) : null,
      strokesGainedApp: row.sg_app ? cleanMetricValue(row.sg_app) : null,
      strokesGainedArg: row.sg_arg ? cleanMetricValue(row.sg_arg) : null,
      strokesGainedOTT: row.sg_ott ? cleanMetricValue(row.sg_ott) : null,
      strokesGainedPutt: row.sg_putt ? cleanMetricValue(row.sg_putt) : null,
      greensInReg: row.gir ? cleanMetricValue(row.gir, true) : null,
      scrambling: row.scrambling ? cleanMetricValue(row.scrambling, true) : null,
      greatShots: row.great_shots !== undefined && row.great_shots !== null
        ? cleanMetricValue(row.great_shots)
        : null,
      poorShots: row.poor_shots !== undefined && row.poor_shots !== null
        ? cleanMetricValue(row.poor_shots)
        : null,
      fairwayProx: row.prox_fw ? cleanMetricValue(row.prox_fw) : null,
      roughProx: row.prox_rgh ? cleanMetricValue(row.prox_rgh) : null
    };

    samples.push({ year, finishPosition, metrics });
  });

  return samples;
}

function computeHistoricalMetricCorrelations(samples) {
  const perYear = {};
  const aggregate = {};

  const grouped = samples.reduce((acc, sample) => {
    if (!acc[sample.year]) acc[sample.year] = [];
    acc[sample.year].push(sample);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([year, yearSamples]) => {
    const metricsForYear = {};
    HISTORICAL_METRICS.forEach(metric => {
      const xValues = [];
      const yValues = [];

      yearSamples.forEach(sample => {
        const rawValue = sample.metrics[metric.key];
        if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
        const adjustedValue = metric.lowerBetter ? -rawValue : rawValue;
        const successScore = -sample.finishPosition;
        xValues.push(adjustedValue);
        yValues.push(successScore);
      });

      if (xValues.length < 5) {
        metricsForYear[metric.key] = { correlation: 0, samples: xValues.length };
        return;
      }

      const correlation = calculateSpearmanCorrelation(xValues, yValues);
      metricsForYear[metric.key] = { correlation, samples: xValues.length };
    });

    perYear[year] = metricsForYear;
  });

  HISTORICAL_METRICS.forEach(metric => {
    let totalSamples = 0;
    let weightedCorrelation = 0;

    Object.values(perYear).forEach(yearMetrics => {
      const entry = yearMetrics[metric.key];
      if (!entry) return;
      weightedCorrelation += entry.correlation * entry.samples;
      totalSamples += entry.samples;
    });

    aggregate[metric.key] = {
      correlation: totalSamples > 0 ? weightedCorrelation / totalSamples : 0,
      samples: totalSamples
    };
  });

  return { perYear, average: aggregate };
}

function computeGeneratedMetricCorrelations(players, results) {
  const { map: resultsById } = buildFinishPositionMap(results);

  return GENERATED_METRIC_LABELS.map((label, index) => {
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return;
      if (!Array.isArray(player.metrics) || typeof player.metrics[index] !== 'number') return;
      const rawValue = player.metrics[index];
      if (Number.isNaN(rawValue)) return;
      const adjustedValue = LOWER_BETTER_GENERATED_METRICS.has(label) ? -rawValue : rawValue;
      xValues.push(adjustedValue);
      yValues.push(-finishPosition);
    });

    if (xValues.length < 5) {
      return { index, label, correlation: 0, samples: xValues.length };
    }

    return {
      index,
      label,
      correlation: calculateSpearmanCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function computeGeneratedMetricTopNCorrelations(players, results, topN = 20) {
  const { map: resultsById } = buildFinishPositionMap(results);

  return GENERATED_METRIC_LABELS.map((label, index) => {
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return;
      if (!Array.isArray(player.metrics) || typeof player.metrics[index] !== 'number') return;
      const rawValue = player.metrics[index];
      if (Number.isNaN(rawValue)) return;
      const adjustedValue = LOWER_BETTER_GENERATED_METRICS.has(label) ? -rawValue : rawValue;
      const isTopN = finishPosition <= topN ? 1 : 0;
      xValues.push(adjustedValue);
      yValues.push(isTopN);
    });

    if (xValues.length < 5) {
      return { index, label, correlation: 0, samples: xValues.length };
    }

    return {
      index,
      label,
      correlation: calculateSpearmanCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function sigmoid(value) {
  if (value < -50) return 0;
  if (value > 50) return 1;
  return 1 / (1 + Math.exp(-value));
}

function trainTopNLogisticModel(players, results, metricLabels, options = {}) {
  const {
    topN = 20,
    iterations = 400,
    learningRate = 0.15,
    l2 = 0.01
  } = options;

  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  const featureCount = metricLabels.length;
  const rows = [];
  const labels = [];

  players.forEach(player => {
    const dgId = String(player.dgId || '').trim();
    if (!dgId) return;
    const finishPosition = resultsById.get(dgId);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    if (!Array.isArray(player.metrics) || player.metrics.length < featureCount) return;
    const metricRow = [];
    for (let i = 0; i < featureCount; i++) {
      const rawValue = player.metrics[i];
      if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
      const adjustedValue = LOWER_BETTER_GENERATED_METRICS.has(metricLabels[i]) ? -rawValue : rawValue;
      metricRow.push(adjustedValue);
    }
    rows.push(metricRow);
    labels.push(finishPosition <= topN ? 1 : 0);
  });

  if (rows.length < 10) {
    return {
      success: false,
      message: 'Not enough samples for logistic model',
      samples: rows.length
    };
  }

  const means = Array(featureCount).fill(0);
  const stds = Array(featureCount).fill(0);

  rows.forEach(row => {
    row.forEach((value, idx) => {
      means[idx] += value;
    });
  });
  for (let i = 0; i < featureCount; i++) {
    means[i] /= rows.length;
  }
  rows.forEach(row => {
    row.forEach((value, idx) => {
      const diff = value - means[idx];
      stds[idx] += diff * diff;
    });
  });
  for (let i = 0; i < featureCount; i++) {
    stds[i] = Math.sqrt(stds[i] / rows.length) || 1;
  }

  const normalizedRows = rows.map(row => row.map((value, idx) => (value - means[idx]) / stds[idx]));

  let weights = Array(featureCount).fill(0);
  let bias = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const grad = Array(featureCount).fill(0);
    let gradBias = 0;
    let loss = 0;

    for (let i = 0; i < normalizedRows.length; i++) {
      const row = normalizedRows[i];
      const linear = row.reduce((sum, value, idx) => sum + value * weights[idx], bias);
      const pred = sigmoid(linear);
      const error = pred - labels[i];
      loss += -labels[i] * Math.log(pred + 1e-9) - (1 - labels[i]) * Math.log(1 - pred + 1e-9);

      for (let j = 0; j < featureCount; j++) {
        grad[j] += error * row[j];
      }
      gradBias += error;
    }

    const n = normalizedRows.length;
    for (let j = 0; j < featureCount; j++) {
      grad[j] = grad[j] / n + l2 * weights[j];
      weights[j] -= learningRate * grad[j];
    }
    bias -= learningRate * (gradBias / n);
  }

  const predictions = normalizedRows.map(row => sigmoid(row.reduce((sum, value, idx) => sum + value * weights[idx], bias)));
  const predictedClass = predictions.map(p => (p >= 0.5 ? 1 : 0));
  const accuracy = predictedClass.filter((pred, idx) => pred === labels[idx]).length / labels.length;
  const logLoss = predictions.reduce((sum, p, idx) => {
    const y = labels[idx];
    return sum - (y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
  }, 0) / labels.length;

  const weightRanking = weights
    .map((weight, idx) => ({
      label: metricLabels[idx],
      weight,
      absWeight: Math.abs(weight)
    }))
    .sort((a, b) => b.absWeight - a.absWeight);

  return {
    success: true,
    samples: rows.length,
    accuracy,
    logLoss,
    bias,
    weights,
    weightRanking: weightRanking.slice(0, 10)
  };
}

function buildSuggestedMetricWeights(metricLabels, top20Signal, top20Logistic) {
  const signalMap = new Map((top20Signal || []).map(entry => [entry.label, entry.correlation]));

  if (top20Logistic && top20Logistic.success && Array.isArray(top20Logistic.weights)) {
    const weights = top20Logistic.weights.map((weight, idx) => {
      const label = metricLabels[idx] || `Metric ${idx}`;
      const corr = signalMap.get(label);
      return {
        label,
        weight,
        absWeight: Math.abs(weight),
        logisticWeight: weight,
        top20Correlation: typeof corr === 'number' ? corr : null
      };
    });
    const total = weights.reduce((sum, entry) => sum + entry.absWeight, 0);
    const normalized = weights.map(entry => ({
      ...entry,
      weight: total > 0 ? entry.weight / total : 0,
      absWeight: total > 0 ? entry.absWeight / total : 0
    }));
    return {
      source: 'top20-logistic',
      weights: normalized.sort((a, b) => b.absWeight - a.absWeight)
    };
  }

  if (Array.isArray(top20Signal) && top20Signal.length > 0) {
    const weights = top20Signal.map(entry => ({
      label: entry.label,
      weight: entry.correlation,
      absWeight: Math.abs(entry.correlation),
      logisticWeight: null,
      top20Correlation: entry.correlation
    }));
    const total = weights.reduce((sum, entry) => sum + entry.absWeight, 0);
    const normalized = weights.map(entry => ({
      ...entry,
      weight: total > 0 ? entry.weight / total : 0,
      absWeight: total > 0 ? entry.absWeight / total : 0
    }));
    return {
      source: 'top20-signal',
      weights: normalized.sort((a, b) => b.absWeight - a.absWeight)
    };
  }

  return { source: 'none', weights: [] };
}

function buildMetricLabelToGroupMap(metricConfig) {
  const map = new Map();
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return map;
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      const label = normalizeGeneratedMetricLabel(metric.name);
      if (label) {
        map.set(label, group.name);
      }
    });
  });
  return map;
}

function buildSuggestedGroupWeights(metricConfig, suggestedMetricWeights) {
  if (!suggestedMetricWeights || !Array.isArray(suggestedMetricWeights.weights)) {
    return { source: suggestedMetricWeights?.source || 'none', weights: [] };
  }

  const labelToGroup = buildMetricLabelToGroupMap(metricConfig);
  const groupTotals = {};

  suggestedMetricWeights.weights.forEach(entry => {
    const label = normalizeGeneratedMetricLabel(entry.label);
    const groupName = labelToGroup.get(label);
    if (!groupName) return;
    const contribution = typeof entry.absWeight === 'number'
      ? entry.absWeight
      : Math.abs(entry.weight || 0);
    groupTotals[groupName] = (groupTotals[groupName] || 0) + contribution;
  });

  const total = Object.values(groupTotals).reduce((sum, value) => sum + value, 0);
  const normalized = Object.entries(groupTotals).map(([groupName, value]) => ({
    groupName,
    weight: total > 0 ? value / total : 0
  })).sort((a, b) => b.weight - a.weight);

  return {
    source: suggestedMetricWeights.source || 'none',
    weights: normalized
  };
}

function buildMetricLabelToNameMap(metricConfig) {
  const map = new Map();
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return map;
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      const label = normalizeGeneratedMetricLabel(metric.name);
      if (!label) return;
      map.set(label, { groupName: group.name, metricName: metric.name });
    });
  });
  return map;
}

function buildSkillRatingsValidation(ranking, skillSnapshot, metricConfig, options = {}) {
  const { mode = 'value', fallbackSnapshot = null } = options;
  const resolveSkillPlayers = snapshot => {
    const payload = snapshot?.payload;
    if (Array.isArray(payload?.players)) return payload.players;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    return [];
  };

  const payload = skillSnapshot?.payload;
  let skillPlayers = resolveSkillPlayers(skillSnapshot);
  const fallbackPlayers = resolveSkillPlayers(fallbackSnapshot);

  const buildRankMap = (players, skillKey) => {
    const values = players
      .map(player => {
        const dgId = String(player?.dg_id || '').trim();
        const value = Number(player?.[skillKey]);
        if (!dgId || !Number.isFinite(value)) return null;
        return { dgId, value };
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value);

    const rankMap = new Map();
    values.forEach((entry, index) => {
      rankMap.set(entry.dgId, index + 1);
    });
    return rankMap;
  };

  const derivedRankMaps = mode === 'rank' && fallbackPlayers.length > 0
    ? new Map(SKILL_RATING_METRICS.map(entry => [entry.skillKey, buildRankMap(fallbackPlayers, entry.skillKey)]))
    : null;

  if (skillPlayers.length === 0 && mode === 'rank' && fallbackPlayers.length > 0) {
    skillPlayers = fallbackPlayers;
  }
  if (!ranking || !Array.isArray(ranking.players)) {
    return { status: 'unavailable', reason: 'ranking_unavailable' };
  }
  if (skillPlayers.length === 0) {
    return { status: 'unavailable', reason: 'skill_ratings_unavailable' };
  }

  const skillById = new Map();
  skillPlayers.forEach(player => {
    const dgId = String(player?.dg_id || '').trim();
    if (!dgId) return;
    skillById.set(dgId, player);
  });

  const labelToMetric = buildMetricLabelToNameMap(metricConfig);
  const labelIndex = new Map(GENERATED_METRIC_LABELS.map((label, index) => [label, index]));

  let derivedFromValue = false;
  const metrics = SKILL_RATING_METRICS.map(entry => {
    const index = labelIndex.get(entry.label);
    const metricRef = labelToMetric.get(normalizeGeneratedMetricLabel(entry.label));
    if (typeof index !== 'number' || !metricRef) {
      return { ...entry, correlation: 0, samples: 0 };
    }

    const stats = ranking.groupStats?.[metricRef.groupName]?.[metricRef.metricName];
    const stdDev = stats?.stdDev || 0.001;
    const mean = typeof stats?.mean === 'number' ? stats.mean : 0;

    const modelValues = [];
    const skillValues = [];
    ranking.players.forEach(player => {
      const dgId = String(player?.dgId || '').trim();
      if (!dgId) return;
      const skill = skillById.get(dgId);
      if (!skill) return;
      let skillValueRaw = Number(skill?.[entry.skillKey]);
      if (mode === 'rank' && !Number.isFinite(skillValueRaw) && derivedRankMaps?.has(entry.skillKey)) {
        const derivedRank = derivedRankMaps.get(entry.skillKey).get(dgId);
        if (Number.isFinite(derivedRank)) {
          skillValueRaw = derivedRank;
          derivedFromValue = true;
        }
      }
      const modelRaw = player?.metrics?.[index];
      if (!Number.isFinite(skillValueRaw) || !Number.isFinite(modelRaw)) return;

      if (mode === 'rank') {
        const zScore = (modelRaw - mean) / stdDev;
        modelValues.push(zScore);
        skillValues.push(-skillValueRaw);
      } else {
        modelValues.push(modelRaw);
        skillValues.push(skillValueRaw);
      }
    });

    const samples = modelValues.length;
    const correlation = samples >= 5
      ? calculateSpearmanCorrelation(modelValues, skillValues)
      : 0;

    return { ...entry, correlation, samples };
  });

  const validMetrics = metrics.filter(metric => metric.samples > 0);
  const avgAbsCorrelation = validMetrics.length
    ? validMetrics.reduce((sum, metric) => sum + Math.abs(metric.correlation || 0), 0) / validMetrics.length
    : 0;

  const matchedPlayers = ranking.players.filter(player => {
    const dgId = String(player?.dgId || '').trim();
    return dgId && skillById.has(dgId);
  }).length;

  return {
    status: 'ok',
    source: skillSnapshot?.source || 'unknown',
    path: skillSnapshot?.path || null,
    lastUpdated: payload?.last_updated || null,
    display: mode,
    derivedFromValue,
    matchedPlayers,
    metrics,
    avgAbsCorrelation
  };
}

function buildPlayerDecompositionValidation(ranking, decompSnapshot) {
  const payload = decompSnapshot?.payload;
  const decompPlayers = Array.isArray(payload?.players)
    ? payload.players
    : (Array.isArray(payload?.data) ? payload.data : []);
  if (!ranking || !Array.isArray(ranking.players)) {
    return { status: 'unavailable', reason: 'ranking_unavailable' };
  }
  if (decompPlayers.length === 0) {
    return { status: 'unavailable', reason: 'player_decompositions_unavailable' };
  }

  const decompById = new Map();
  decompPlayers.forEach(player => {
    const dgId = String(player?.dg_id || '').trim();
    if (!dgId) return;
    decompById.set(dgId, player);
  });

  const modelValues = [];
  const decompValues = [];

  ranking.players.forEach(player => {
    const dgId = String(player?.dgId || '').trim();
    if (!dgId) return;
    const decomp = decompById.get(dgId);
    if (!decomp) return;
    const modelScore = Number.isFinite(player?.refinedWeightedScore)
      ? player.refinedWeightedScore
      : (Number.isFinite(player?.weightedScore)
        ? player.weightedScore
        : (Number.isFinite(player?.compositeScore)
          ? player.compositeScore
          : (Number.isFinite(player?.war) ? player.war : null)));
    const decompScore = Number(decomp?.final_pred ?? decomp?.baseline_pred);
    if (!Number.isFinite(modelScore) || !Number.isFinite(decompScore)) return;
    modelValues.push(modelScore);
    decompValues.push(decompScore);
  });

  const samples = modelValues.length;
  if (samples < 5) {
    return { status: 'unavailable', reason: 'insufficient_samples', samples };
  }

  const correlation = calculateSpearmanCorrelation(modelValues, decompValues);
  return {
    status: 'ok',
    source: decompSnapshot?.source || 'unknown',
    path: decompSnapshot?.path || null,
    lastUpdated: payload?.last_updated || null,
    eventName: payload?.event_name || null,
    courseName: payload?.course_name || null,
    samples,
    matchedPlayers: samples,
    correlation
  };
}

function buildFilledGroupWeights(suggestedGroupWeights, fallbackGroupWeights) {
  const merged = { ...(fallbackGroupWeights || {}) };
  (suggestedGroupWeights?.weights || []).forEach(entry => {
    if (entry?.groupName && typeof entry.weight === 'number') {
      merged[entry.groupName] = entry.weight;
    }
  });
  return normalizeWeights(merged);
}

function buildMetricWeightsFromSuggested(metricConfig, suggestedMetricWeights, fallbackMetricWeights) {
  const result = { ...(fallbackMetricWeights || {}) };
  if (!suggestedMetricWeights || !Array.isArray(suggestedMetricWeights.weights) || suggestedMetricWeights.weights.length === 0) {
    return result;
  }

  const labelToMetric = buildMetricLabelToNameMap(metricConfig);
  const grouped = new Map();

  suggestedMetricWeights.weights.forEach(entry => {
    const label = normalizeGeneratedMetricLabel(entry.label);
    const mapping = labelToMetric.get(label);
    if (!mapping) return;
    if (!grouped.has(mapping.groupName)) grouped.set(mapping.groupName, new Map());
    grouped.get(mapping.groupName).set(mapping.metricName, entry.weight || 0);
  });

  metricConfig.groups.forEach(group => {
    if (!grouped.has(group.name)) return;
    const groupWeights = grouped.get(group.name);
    const total = Array.from(groupWeights.values()).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return;
    group.metrics.forEach(metric => {
      const key = `${group.name}::${metric.name}`;
      if (groupWeights.has(metric.name)) {
        result[key] = groupWeights.get(metric.name) / total;
      } else {
        result[key] = 0;
      }
    });
  });
  return result;
}

function blendGroupWeights(priorWeights = {}, modelWeights = {}, priorShare = 0.6, modelShare = 0.4) {
  const blended = {};
  const keys = new Set([...Object.keys(priorWeights || {}), ...Object.keys(modelWeights || {})]);
  keys.forEach(key => {
    const prior = typeof priorWeights[key] === 'number' ? priorWeights[key] : 0;
    const model = typeof modelWeights[key] === 'number' ? modelWeights[key] : 0;
    blended[key] = prior * priorShare + model * modelShare;
  });
  return normalizeWeights(blended);
}

function blendMetricWeights(metricConfig, priorMetricWeights = {}, modelMetricWeights = {}, priorShare = 0.6, modelShare = 0.4) {
  const blended = {};
  if (!metricConfig || !Array.isArray(metricConfig.groups)) return blended;

  metricConfig.groups.forEach(group => {
    const metrics = group.metrics || [];
    const keys = metrics.map(metric => `${group.name}::${metric.name}`);
    const groupValues = keys.map(key => {
      const prior = typeof priorMetricWeights[key] === 'number' ? priorMetricWeights[key] : 0;
      const model = typeof modelMetricWeights[key] === 'number' ? modelMetricWeights[key] : 0;
      return prior * priorShare + model * modelShare;
    });
    const totalAbs = groupValues.reduce((sum, value) => sum + Math.abs(value), 0);
    keys.forEach((key, idx) => {
      if (totalAbs > 0) {
        blended[key] = groupValues[idx] / totalAbs;
      } else if (typeof priorMetricWeights[key] === 'number') {
        blended[key] = priorMetricWeights[key];
      } else {
        blended[key] = 0;
      }
    });
  });

  return blended;
}

function normalizeMetricSpecs(metricSpecs) {
  if (!Array.isArray(metricSpecs)) return [];
  if (metricSpecs.length === 0) return [];
  if (typeof metricSpecs[0] === 'string') {
    return metricSpecs.map((label, index) => ({ label, index }));
  }
  return metricSpecs.map((spec, index) => ({
    label: spec.label,
    index: typeof spec.index === 'number' ? spec.index : index
  }));
}

function computeGeneratedMetricCorrelationsForLabels(players, results, metricSpecs) {
  const { map: resultsById } = buildFinishPositionMap(results);

  const specs = normalizeMetricSpecs(metricSpecs);
  return specs.map(spec => {
    const { label, index } = spec;
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return;
      if (!Array.isArray(player.metrics) || typeof player.metrics[index] !== 'number') return;
      const rawValue = player.metrics[index];
      if (Number.isNaN(rawValue)) return;
      const adjustedValue = LOWER_BETTER_GENERATED_METRICS.has(label) ? -rawValue : rawValue;
      xValues.push(adjustedValue);
      yValues.push(-finishPosition);
    });

    if (xValues.length < 5) {
      return { index, label, correlation: 0, samples: xValues.length };
    }

    return {
      index,
      label,
      correlation: calculateSpearmanCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function computeGeneratedMetricTopNCorrelationsForLabels(players, results, metricSpecs, topN = 20) {
  const { map: resultsById } = buildFinishPositionMap(results);

  const specs = normalizeMetricSpecs(metricSpecs);
  return specs.map(spec => {
    const { label, index } = spec;
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return;
      if (!Array.isArray(player.metrics) || typeof player.metrics[index] !== 'number') return;
      const rawValue = player.metrics[index];
      if (Number.isNaN(rawValue)) return;
      const adjustedValue = LOWER_BETTER_GENERATED_METRICS.has(label) ? -rawValue : rawValue;
      const isTopN = finishPosition <= topN ? 1 : 0;
      xValues.push(adjustedValue);
      yValues.push(isTopN);
    });

    if (xValues.length < 5) {
      return { index, label, correlation: 0, samples: xValues.length };
    }

    return {
      index,
      label,
      correlation: calculateSpearmanCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function buildTopNSamplesFromPlayers(players, results, metricSpecs, topN = 20) {
  const { map: resultsById } = buildFinishPositionMap(results);

  return players.reduce((acc, player) => {
    const dgId = String(player.dgId || '').trim();
    if (!dgId) return acc;
    const finishPosition = resultsById.get(dgId);
    if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return acc;
    const featurePack = buildFeatureVector(player, metricSpecs);
    if (!featurePack) return acc;
    acc.push({ features: featurePack.features, label: finishPosition <= 20 ? 1 : 0 });
    return acc;
  }, []);
}

function trainLogisticFromSamples(samples, options = {}) {
  const { iterations = 300, learningRate = 0.12, l2 = 0.01 } = options;
  if (!Array.isArray(samples) || samples.length < 10) {
    return { success: false, message: 'Not enough samples', samples: samples ? samples.length : 0 };
  }

  const featureCount = samples[0].features.length;
  const means = Array(featureCount).fill(0);
  const stds = Array(featureCount).fill(0);

  samples.forEach(sample => {
    sample.features.forEach((value, idx) => {
      means[idx] += value;
    });
  });
  for (let i = 0; i < featureCount; i++) {
    means[i] /= samples.length;
  }
  samples.forEach(sample => {
    sample.features.forEach((value, idx) => {
      const diff = value - means[idx];
      stds[idx] += diff * diff;
    });
  });
  for (let i = 0; i < featureCount; i++) {
    stds[i] = Math.sqrt(stds[i] / samples.length) || 1;
  }

  const normalized = samples.map(sample => ({
    features: sample.features.map((value, idx) => (value - means[idx]) / stds[idx]),
    label: sample.label
  }));

  let weights = Array(featureCount).fill(0);
  let bias = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const grad = Array(featureCount).fill(0);
    let gradBias = 0;

    normalized.forEach(sample => {
      const linear = sample.features.reduce((sum, value, idx) => sum + value * weights[idx], bias);
      const pred = sigmoid(linear);
      const error = pred - sample.label;
      for (let j = 0; j < featureCount; j++) {
        grad[j] += error * sample.features[j];
      }
      gradBias += error;
    });

    const n = normalized.length;
    for (let j = 0; j < featureCount; j++) {
      grad[j] = grad[j] / n + l2 * weights[j];
      weights[j] -= learningRate * grad[j];
    }
    bias -= learningRate * (gradBias / n);
  }

  return {
    success: true,
    samples: samples.length,
    weights,
    bias,
    means,
    stds,
    l2
  };
}

function evaluateLogisticModel(model, samples) {
  if (!model || !model.success || !Array.isArray(samples) || samples.length === 0) {
    return { accuracy: 0, logLoss: 0, samples: samples ? samples.length : 0 };
  }

  let correct = 0;
  let logLoss = 0;

  samples.forEach(sample => {
    const normalized = sample.features.map((value, idx) => (value - model.means[idx]) / model.stds[idx]);
    const linear = normalized.reduce((sum, value, idx) => sum + value * model.weights[idx], model.bias);
    const pred = sigmoid(linear);
    const predictedClass = pred >= 0.5 ? 1 : 0;
    if (predictedClass === sample.label) correct += 1;
    logLoss += -sample.label * Math.log(pred + 1e-9) - (1 - sample.label) * Math.log(1 - pred + 1e-9);
  });

  return {
    accuracy: correct / samples.length,
    logLoss: logLoss / samples.length,
    samples: samples.length
  };
}

function summarizeLogisticModel(model, samples, metricLabels) {
  if (!model || !model.success) {
    return { success: false, message: model?.message || 'Model unavailable', samples: model?.samples || 0 };
  }

  const evaluation = evaluateLogisticModel(model, samples);
  const weightRanking = model.weights
    .map((weight, idx) => ({
      label: metricLabels[idx],
      weight,
      absWeight: Math.abs(weight)
    }))
    .sort((a, b) => b.absWeight - a.absWeight)
    .slice(0, 10);

  return {
    success: true,
    samples: evaluation.samples,
    accuracy: evaluation.accuracy,
    logLoss: evaluation.logLoss,
    bias: model.bias,
    weights: model.weights,
    l2: model.l2,
    weightRanking
  };
}

function computeSingleMetricCorrelation(players, results, options = {}) {
  const { label = 'Metric', valueGetter = null } = options;
  const { map: resultsById } = buildFinishPositionMap(results);

  const xValues = [];
  const yValues = [];

  players.forEach(player => {
    const dgId = String(player.dgId || '').trim();
    if (!dgId) return;
    const finishPosition = resultsById.get(dgId);
    if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return;
    const rawValue = valueGetter ? valueGetter(player) : null;
    if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return;
    xValues.push(rawValue);
    yValues.push(finishPosition);
  });

  if (xValues.length < 5) {
    return { label, correlation: 0, samples: xValues.length };
  }

  return {
    label,
    correlation: calculateSpearmanCorrelation(xValues, yValues),
    samples: xValues.length
  };
}

function normalizeGeneratedMetricLabel(metricLabel) {
  return String(metricLabel || '')
    .replace(/^(Scoring|Course Management):\s*/i, '')
    .trim();
}

function shouldInvertGeneratedMetric(label, correlation) {
  return LOWER_BETTER_GENERATED_METRICS.has(label) && correlation < 0;
}

function buildInvertedLabelSet(top20Signal = []) {
  const inverted = new Set();
  (top20Signal || []).forEach(entry => {
    if (!entry) return;
    const label = String(entry.label || '').trim();
    if (!label) return;
    if (shouldInvertGeneratedMetric(label, entry.correlation || 0)) {
      inverted.add(normalizeGeneratedMetricLabel(label));
    }
  });
  return inverted;
}

function applyInversionsToMetricWeights(metricConfig, metricWeights = {}, invertedLabelSet = new Set()) {
  if (!metricConfig || !Array.isArray(metricConfig.groups) || invertedLabelSet.size === 0) {
    return { ...metricWeights };
  }

  const updated = { ...metricWeights };
  metricConfig.groups.forEach(group => {
    group.metrics.forEach(metric => {
      const normalizedName = normalizeGeneratedMetricLabel(metric.name);
      if (!invertedLabelSet.has(normalizedName)) return;
      const key = `${group.name}::${metric.name}`;
      const weight = updated[key];
      if (typeof weight === 'number') {
        updated[key] = -Math.abs(weight);
      }
    });
  });

  return updated;
}

function normalizeIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(id => String(id || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,|]/)
    .map(id => String(id || '').trim())
    .filter(Boolean);
}

function clamp01(value, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function scoreLowerBetter(value, good, bad) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value <= good) return 1;
  if (value >= bad) return 0;
  return (bad - value) / (bad - good);
}

function scoreHigherBetter(value, good, bad) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value >= good) return 1;
  if (value <= bad) return 0;
  return (value - bad) / (good - bad);
}

function computeCvReliability(cvSummary, options = {}) {
  if (!cvSummary || !cvSummary.success) return 0;
  const {
    logLossGood = 0.25,
    logLossBad = 0.45,
    accuracyGood = 0.65,
    accuracyBad = 0.52,
    minEvents = 3,
    maxEvents = 8,
    minSamples = 120,
    maxSamples = 350
  } = options;

  const logLossScore = scoreLowerBetter(cvSummary.avgLogLoss, logLossGood, logLossBad);
  const accuracyScore = scoreHigherBetter(cvSummary.avgAccuracy, accuracyGood, accuracyBad);
  const eventCount = typeof cvSummary.eventCount === 'number' ? cvSummary.eventCount : 0;
  const sampleCount = typeof cvSummary.totalSamples === 'number' ? cvSummary.totalSamples : 0;
  const eventScore = clamp01((eventCount - (minEvents - 1)) / Math.max(1, maxEvents - (minEvents - 1)));
  const sampleScore = clamp01((sampleCount - minSamples) / Math.max(1, maxSamples - minSamples));
  const baseScore = (logLossScore + accuracyScore) / 2;
  return clamp01(baseScore * eventScore * sampleScore);
}

function groupWeightsMapToArray(groupWeights) {
  return Object.entries(groupWeights || {})
    .map(([groupName, weight]) => ({ groupName, weight }))
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

function blendSuggestedGroupWeightsWithCv(suggestedGroupWeights, fallbackGroupWeights, cvReliability, options = {}) {
  const maxModelShare = typeof options.maxModelShare === 'number' ? options.maxModelShare : 0.35;
  if (!suggestedGroupWeights || !Array.isArray(suggestedGroupWeights.weights) || suggestedGroupWeights.weights.length === 0) {
    return {
      source: suggestedGroupWeights?.source || 'none',
      weights: [],
      cvReliability,
      modelShare: 0,
      priorShare: 1
    };
  }

  const modelShare = clamp01(maxModelShare * clamp01(cvReliability));
  const priorShare = 1 - modelShare;
  const filledGroupWeights = buildFilledGroupWeights(suggestedGroupWeights, fallbackGroupWeights);
  const blended = blendGroupWeights(fallbackGroupWeights, filledGroupWeights, priorShare, modelShare);

  return {
    source: suggestedGroupWeights.source || 'none',
    weights: groupWeightsMapToArray(blended),
    cvReliability,
    modelShare,
    priorShare
  };
}

const CURRENT_EVENT_ROUNDS_DEFAULTS = {
  currentSeasonMetrics: true,
  currentSeasonBaseline: false,
  currentSeasonOptimization: false,
  historicalEvaluation: false
};

function resolveIncludeCurrentEventRounds(fallback) {
  if (INCLUDE_CURRENT_EVENT_ROUNDS === true) return true;
  if (INCLUDE_CURRENT_EVENT_ROUNDS === false) return false;
  return fallback;
}

function buildResultsFromRows(rows) {
  const resultsByPlayer = new Map();
  rows.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();
    if (!dgId) return;
    const finishPosition = parseFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    const existing = resultsByPlayer.get(dgId);
    if (!existing || finishPosition < existing) {
      resultsByPlayer.set(dgId, finishPosition);
    }
  });
  return Array.from(resultsByPlayer.entries()).map(([dgId, finishPosition]) => ({ dgId, finishPosition }));
}

function pickFirstValue(row, keys) {
  for (const key of keys) {
    if (!row) continue;
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return null;
}

function buildResultsFromResultRows(rows) {
  const resultsByPlayer = new Map();
  rows.forEach(row => {
    const dgId = pickFirstValue(row, ['DG ID', 'dgId', 'dg_id', 'dg id', 'Player ID', 'player_id']);
    if (!dgId) return;
    const finishRaw = pickFirstValue(row, ['Finish Position', 'finishPosition', 'finish', 'fin_text', 'fin', 'Finish']);
    const finishPosition = parseFinishPosition(finishRaw);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    const existing = resultsByPlayer.get(String(dgId).trim());
    if (!existing || finishPosition < existing) {
      resultsByPlayer.set(String(dgId).trim(), finishPosition);
    }
  });
  return Array.from(resultsByPlayer.entries()).map(([dgId, finishPosition]) => ({ dgId, finishPosition }));
}

function loadResultsFromJsonFile(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) return { results: [], meta: null };
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const eventId = payload?.eventId ? String(payload.eventId).trim() : null;
    const season = payload?.season ? String(payload.season).trim() : null;
    const expectedEventId = options.eventId ? String(options.eventId).trim() : null;
    const expectedSeason = options.season ? String(options.season).trim() : null;
    if (expectedEventId && eventId && eventId !== expectedEventId) {
      return { results: [], meta: { reason: 'eventId_mismatch', eventId, season } };
    }
    if (expectedSeason && season && season !== expectedSeason) {
      return { results: [], meta: { reason: 'season_mismatch', eventId, season } };
    }
    const rows = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.results) ? payload.results : []);
    const results = buildResultsFromResultRows(rows);
    return { results, meta: { eventId, season } };
  } catch (error) {
    return { results: [], meta: { reason: 'parse_error', error: error.message } };
  }
}

function findPostEventResultsFile(postEventDir, slug, ext, exclude = []) {
  if (!postEventDir || !fs.existsSync(postEventDir)) return null;
  const desired = slug ? path.resolve(postEventDir, `${slug}_results.${ext}`) : null;
  if (desired && fs.existsSync(desired)) return desired;
  const entries = fs.readdirSync(postEventDir)
    .filter(name => name.toLowerCase().endsWith(`_results.${ext}`));
  const filtered = entries.filter(name => !exclude.some(token => name.toLowerCase().includes(token)));
  if (filtered.length === 0) return null;
  filtered.sort();
  return path.resolve(postEventDir, filtered[0]);
}

function blendCorrelationLists(baseList, blendList, blendWeight) {
  if (!Array.isArray(baseList) || baseList.length === 0) return baseList || [];
  if (!Array.isArray(blendList) || blendList.length === 0 || blendWeight <= 0) return baseList;
  const blendMap = new Map(blendList.map(entry => [entry.label, entry]));
  return baseList.map(entry => {
    const blendEntry = blendMap.get(entry.label);
    if (!blendEntry || typeof blendEntry.correlation !== 'number') return entry;
    const baseCorr = typeof entry.correlation === 'number' ? entry.correlation : 0;
    return {
      ...entry,
      correlation: baseCorr * (1 - blendWeight) + blendEntry.correlation * blendWeight
    };
  });
}

function blendSingleMetricCorrelation(baseList, blendList, targetLabel, blendWeight) {
  if (!Array.isArray(baseList) || baseList.length === 0) return baseList || [];
  if (!Array.isArray(blendList) || blendList.length === 0 || blendWeight <= 0) return baseList;
  const blendEntry = blendList.find(entry => entry.label === targetLabel);
  if (!blendEntry || typeof blendEntry.correlation !== 'number') return baseList;
  return baseList.map(entry => {
    if (entry.label !== targetLabel) return entry;
    const baseCorr = typeof entry.correlation === 'number' ? entry.correlation : 0;
    return {
      ...entry,
      correlation: baseCorr * (1 - blendWeight) + blendEntry.correlation * blendWeight
    };
  });
}

function computeMetricAlignmentScore(metricWeights, groupWeights, correlationMap) {
  if (!metricWeights || !correlationMap || correlationMap.size === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  Object.entries(metricWeights).forEach(([metricKey, weight]) => {
    if (typeof weight !== 'number') return;
    const [groupName, metricNameRaw] = metricKey.split('::');
    if (!groupName || !metricNameRaw) return;
    const metricName = normalizeGeneratedMetricLabel(metricNameRaw);
    const correlation = correlationMap.get(metricName);
    if (typeof correlation !== 'number') return;
    const groupWeight = typeof groupWeights?.[groupName] === 'number' ? groupWeights[groupName] : 1;
    const effectiveWeight = groupWeight * weight;
    weightedSum += effectiveWeight * correlation;
    totalWeight += Math.abs(effectiveWeight);
  });

  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

function buildAlignmentMapFromTop20Signal(top20Signal) {
  if (!Array.isArray(top20Signal)) return new Map();
  return new Map(top20Signal.map(entry => [normalizeGeneratedMetricLabel(entry.label), entry.correlation]));
}

function buildAlignmentMapFromTop20Logistic(metricLabels, top20Logistic) {
  if (!top20Logistic || !top20Logistic.success || !Array.isArray(top20Logistic.weights)) return new Map();
  const map = new Map();
  top20Logistic.weights.forEach((weight, idx) => {
    const label = metricLabels[idx] || `Metric ${idx}`;
    map.set(normalizeGeneratedMetricLabel(label), Math.abs(weight));
  });
  return map;
}

function blendAlignmentMaps(maps, weights) {
  const combined = new Map();
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  maps.forEach((map, idx) => {
    const weight = weights[idx] || 0;
    if (!map || weight === 0) return;
    map.forEach((value, key) => {
      const normalized = value * (weight / totalWeight);
      combined.set(key, (combined.get(key) || 0) + normalized);
    });
  });
  return combined;
}

function applyShotDistributionToMetricWeights(metricWeights = {}, courseSetupWeights = {}) {
  const normalized = { ...metricWeights };
  const under100 = typeof courseSetupWeights.under100 === 'number' ? courseSetupWeights.under100 : 0;
  const from100to150 = typeof courseSetupWeights.from100to150 === 'number' ? courseSetupWeights.from100to150 : 0;
  const from150to200 = typeof courseSetupWeights.from150to200 === 'number' ? courseSetupWeights.from150to200 : 0;
  const over200 = typeof courseSetupWeights.over200 === 'number' ? courseSetupWeights.over200 : 0;
  const total = under100 + from100to150 + from150to200 + over200;
  if (total <= 0) return normalized;

  const distribution = [under100, from100to150, from150to200, over200].map(value => value / total);

  const applyToGroup = (groupName, metricNames) => {
    const weights = metricNames.map(name => {
      const key = `${groupName}::${name}`;
      const value = normalized[key];
      return typeof value === 'number' ? value : 0;
    });
    const signs = weights.map(value => (Math.sign(value) || 1));
    const totalAbs = weights.reduce((sum, value) => sum + Math.abs(value), 0);
    if (totalAbs <= 0) return;

    const [distUnder100, dist100to150, dist150to200, distOver200] = distribution;

    const adjusted = [
      distUnder100 * totalAbs * signs[0],
      (dist100to150 * totalAbs / 2) * signs[1],
      (dist100to150 * totalAbs / 2) * signs[2],
      dist150to200 * totalAbs * signs[3],
      (distOver200 * totalAbs / 2) * signs[4],
      (distOver200 * totalAbs / 2) * signs[5]
    ];

    metricNames.forEach((name, index) => {
      const key = `${groupName}::${name}`;
      normalized[key] = adjusted[index];
    });
  };

  applyToGroup('Scoring', [
    'Scoring: Approach <100 SG',
    'Scoring: Approach <150 FW SG',
    'Scoring: Approach <150 Rough SG',
    'Scoring: Approach <200 FW SG',
    'Scoring: Approach >200 FW SG',
    'Scoring: Approach >150 Rough SG'
  ]);

  applyToGroup('Course Management', [
    'Course Management: Approach <100 Prox',
    'Course Management: Approach <150 FW Prox',
    'Course Management: Approach <150 Rough Prox',
    'Course Management: Approach <200 FW Prox',
    'Course Management: Approach >200 FW Prox',
    'Course Management: Approach >150 Rough Prox'
  ]);

  return normalized;
}

function buildTop20CompositeScore(evaluation) {
  if (!evaluation) return 0;
  const acc = typeof evaluation.top20 === 'number' ? evaluation.top20 / 100 : null;
  const weighted = typeof evaluation.top20WeightedScore === 'number' ? evaluation.top20WeightedScore / 100 : null;
  if (acc !== null && weighted !== null) return (acc + weighted) / 2;
  if (acc !== null) return acc;
  if (weighted !== null) return weighted;
  return 0;
}

function compareEvaluations(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const aWeighted = typeof a.top20WeightedScore === 'number' ? a.top20WeightedScore : -Infinity;
  const bWeighted = typeof b.top20WeightedScore === 'number' ? b.top20WeightedScore : -Infinity;
  if (aWeighted !== bWeighted) return aWeighted > bWeighted ? 1 : -1;

  const aCorr = typeof a.correlation === 'number' ? a.correlation : -Infinity;
  const bCorr = typeof b.correlation === 'number' ? b.correlation : -Infinity;
  if (aCorr !== bCorr) return aCorr > bCorr ? 1 : -1;

  const aTop20 = typeof a.top20 === 'number' ? a.top20 : -Infinity;
  const bTop20 = typeof b.top20 === 'number' ? b.top20 : -Infinity;
  if (aTop20 !== bTop20) return aTop20 > bTop20 ? 1 : -1;

  return 0;
}

function evaluateStressTest(evaluation, options = {}) {
  if (!evaluation) {
    return { status: 'n/a', reason: 'no evaluation' };
  }
  const {
    minPlayers = 20,
    minCorr = 0.1,
    minTop20Weighted = 60
  } = options;

  const matchedPlayers = typeof evaluation.matchedPlayers === 'number'
    ? evaluation.matchedPlayers
    : null;
  if (matchedPlayers !== null && matchedPlayers < minPlayers) {
    return {
      status: 'insufficient',
      reason: `players<${minPlayers}`,
      matchedPlayers
    };
  }

  const subsetEval = evaluation.adjusted?.subset || null;
  const correlation = typeof subsetEval?.correlation === 'number'
    ? subsetEval.correlation
    : evaluation.correlation;
  const top20Weighted = typeof subsetEval?.top20WeightedScore === 'number'
    ? subsetEval.top20WeightedScore
    : evaluation.top20WeightedScore;

  const reasons = [];
  if (typeof correlation === 'number' && correlation < minCorr) {
    reasons.push(`corr<${minCorr}`);
  }
  if (typeof top20Weighted === 'number' && top20Weighted < minTop20Weighted) {
    reasons.push(`top20W<${minTop20Weighted}%`);
  }

  return {
    status: reasons.length ? 'fail' : 'pass',
    reason: reasons.join(', '),
    matchedPlayers
  };
}

const TEMPLATE_METRIC_MAP = {
  'Driving Distance': 'drivingDistance',
  'Driving Accuracy': 'drivingAccuracy',
  'SG OTT': 'strokesGainedOTT',
  'SG Putting': 'strokesGainedPutt',
  'SG Around Green': 'strokesGainedArg',
  'SG T2G': 'strokesGainedT2G',
  'Scoring Average': 'scoringAverage',
  'Scrambling': 'scrambling',
  'Great Shots': 'greatShots',
  'Poor Shots': 'poorShots'
};

function computeTemplateCorrelationAlignment(metricWeights, historicalCorrelations) {
  let weightedCorrelation = 0;
  let matchedWeight = 0;
  let matchedMetrics = 0;

  Object.entries(metricWeights || {}).forEach(([metricKey, weight]) => {
    if (typeof weight !== 'number') return;
    const baseMetricName = metricKey.includes('::')
      ? metricKey.split('::')[1].trim()
      : metricKey;
    const historicalKey = TEMPLATE_METRIC_MAP[baseMetricName];
    if (!historicalKey) return;
    const correlationEntry = historicalCorrelations[historicalKey];
    if (!correlationEntry) return;
    weightedCorrelation += weight * correlationEntry.correlation;
    matchedWeight += weight;
    matchedMetrics += 1;
  });

  return {
    weightedCorrelation,
    matchedWeight,
    matchedMetrics,
    coveragePct: matchedWeight > 0 ? (matchedWeight / Object.values(metricWeights || {}).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)) * 100 : 0
  };
}

function calculatePearsonCorrelation(xValues, yValues) {
  if (xValues.length === 0) return 0;
  const n = xValues.length;
  const meanX = xValues.reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

function rankValues(values) {
  const entries = values.map((value, index) => ({ value, index }));
  entries.sort((a, b) => a.value - b.value);

  const ranks = Array(values.length);
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1].value === entries[i].value) {
      j += 1;
    }
    const avgRank = (i + j + 2) / 2; // 1-based rank average for ties
    for (let k = i; k <= j; k += 1) {
      ranks[entries[k].index] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function calculateSpearmanCorrelation(xValues, yValues) {
  if (!Array.isArray(xValues) || !Array.isArray(yValues)) return 0;
  if (xValues.length === 0 || xValues.length !== yValues.length) return 0;
  const rankedX = rankValues(xValues);
  const rankedY = rankValues(yValues);
  return calculatePearsonCorrelation(rankedX, rankedY);
}

function calculateTopNAccuracy(predictions, actualResults, n) {
  if (predictions.length === 0) return 0;

  const hasRank = predictions.some(p => typeof p.rank === 'number');
  const topNPlayers = hasRank
    ? predictions.filter(p => typeof p.rank === 'number' && p.rank <= n)
    : predictions.slice(0, n);

  const topN = new Set(topNPlayers.map(p => String(p.dgId)));
  const matches = actualResults.filter(a => {
    if (!a || !topN.has(String(a.dgId))) return false;
    const finishPosition = a.finishPosition;
    return typeof finishPosition === 'number' && !Number.isNaN(finishPosition) && finishPosition <= n;
  }).length;
  const denominator = topN.size || n;
  return (matches / denominator) * 100;
}

function calculateTopNWeightedScore(predictions, actualResults, n) {
  if (predictions.length === 0 || actualResults.length === 0) return 0;

  const actualById = new Map();
  actualResults.forEach(result => {
    const dgId = String(result.dgId);
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      actualById.set(dgId, result.finishPosition);
    }
  });

  const hasRank = predictions.some(p => typeof p.rank === 'number');
  const sortedPredictions = hasRank
    ? [...predictions].sort((a, b) => (a.rank || 0) - (b.rank || 0))
    : [...predictions];

  const gain = finishPosition => {
    if (!finishPosition || Number.isNaN(finishPosition) || finishPosition > n) return 0;
    return (n - finishPosition + 1);
  };

  const topPredictions = sortedPredictions.filter(p => actualById.has(String(p.dgId))).slice(0, n);
  const dcg = topPredictions.reduce((sum, player, index) => {
    const finishPosition = actualById.get(String(player.dgId));
    const rel = gain(finishPosition);
    return sum + (rel / Math.log2(index + 2));
  }, 0);

  const idealResults = actualResults
    .filter(result => result.finishPosition && !Number.isNaN(result.finishPosition) && result.finishPosition <= n)
    .sort((a, b) => a.finishPosition - b.finishPosition)
    .slice(0, n);

  const idcg = idealResults.reduce((sum, result, index) => {
    const rel = gain(result.finishPosition);
    return sum + (rel / Math.log2(index + 2));
  }, 0);

  if (idcg === 0) return 0;
  return (dcg / idcg) * 100;
}

function calculateTopNAccuracyFromActualRanks(predictions, actualRankMap, n) {
  if (!predictions.length || !actualRankMap || actualRankMap.size === 0) return 0;
  const hasRank = predictions.some(p => typeof p.rank === 'number');
  const sortedPredictions = hasRank
    ? [...predictions].filter(p => typeof p.rank === 'number').sort((a, b) => (a.rank || 0) - (b.rank || 0))
    : [...predictions];
  const topPredicted = sortedPredictions.slice(0, n).map(p => String(p.dgId));
  const topActual = Array.from(actualRankMap.entries())
    .filter(([, rank]) => typeof rank === 'number' && rank <= n)
    .map(([dgId]) => String(dgId));
  const topActualSet = new Set(topActual);
  const overlap = topPredicted.filter(id => topActualSet.has(id));
  const denominator = topPredicted.length || n;
  return denominator === 0 ? 0 : (overlap.length / denominator) * 100;
}

function calculateTopNWeightedScoreFromActualRanks(predictions, actualRankMap, n) {
  if (!predictions.length || !actualRankMap || actualRankMap.size === 0) return 0;
  const hasRank = predictions.some(p => typeof p.rank === 'number');
  const sortedPredictions = hasRank
    ? [...predictions].filter(p => typeof p.rank === 'number').sort((a, b) => (a.rank || 0) - (b.rank || 0))
    : [...predictions];

  const gain = finishRank => {
    if (!finishRank || Number.isNaN(finishRank) || finishRank > n) return 0;
    return (n - finishRank + 1);
  };

  const topPredictions = sortedPredictions.filter(p => actualRankMap.has(String(p.dgId))).slice(0, n);
  const dcg = topPredictions.reduce((sum, player, index) => {
    const finishRank = actualRankMap.get(String(player.dgId));
    const rel = gain(finishRank);
    return sum + (rel / Math.log2(index + 2));
  }, 0);

  const ideal = Array.from(actualRankMap.entries())
    .filter(([, rank]) => typeof rank === 'number' && rank <= n)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n);

  const idcg = ideal.reduce((sum, [, rank], index) => {
    const rel = gain(rank);
    return sum + (rel / Math.log2(index + 2));
  }, 0);

  if (idcg === 0) return 0;
  return (dcg / idcg) * 100;
}

function parseFinishPosition(posValue) {
  const posStr = String(posValue || '').trim().toUpperCase();
  if (!posStr) return null;
  if (posStr.startsWith('T')) return parseInt(posStr.substring(1));
  if (posStr === 'CUT' || posStr === 'WD' || posStr === 'DQ') return null;
  return parseInt(posStr);
}

function buildFinishPositionMap(results) {
  const positions = (results || [])
    .map(result => result?.finishPosition)
    .filter(value => typeof value === 'number' && !Number.isNaN(value));
  const fallback = positions.length ? Math.max(...positions) + 1 : null;
  const map = new Map();

  (results || []).forEach(result => {
    const dgId = String(result?.dgId || '').trim();
    if (!dgId) return;
    const rawValue = result?.finishPosition;
    const finishPosition = typeof rawValue === 'number' && !Number.isNaN(rawValue)
      ? rawValue
      : fallback;
    if (typeof finishPosition === 'number' && !Number.isNaN(finishPosition)) {
      map.set(dgId, finishPosition);
    }
  });

  return { map, fallback };
}

function evaluateRankings(predictions, actualResults, options = {}) {
  const { includeTopN = true, includeTopNDetails = false, includeAdjusted = true } = options;
  const { map: resultsById } = buildFinishPositionMap(actualResults);
  const scores = [];
  const positions = [];
  const errors = [];
  const matched = [];
  
  predictions.forEach((pred, idx) => {
    const actualFinish = resultsById.get(String(pred.dgId));
    if (typeof actualFinish === 'number' && !Number.isNaN(actualFinish)) {
      const rankValue = typeof pred.rank === 'number' ? pred.rank : (idx + 1);
      scores.push(rankValue);
      positions.push(actualFinish);
      errors.push(rankValue - actualFinish);
      matched.push({ dgId: String(pred.dgId), predRank: rankValue, actualFinish: actualFinish });
    }
  });
  
  if (scores.length === 0) {
    return {
      correlation: 0,
      rmse: 0,
      rSquared: 0,
      meanError: 0,
      stdDevError: 0,
      mae: 0,
      top10: includeTopN ? 0 : null,
      top20: includeTopN ? 0 : null,
      top20WeightedScore: includeTopN ? 0 : null,
      matchedPlayers: 0
    };
  }
  
  const correlation = calculateSpearmanCorrelation(scores, positions);
  const rmse = Math.sqrt(
    scores.reduce((sum, s, i) => sum + Math.pow(s - positions[i], 2), 0) / scores.length
  );
  
  const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const stdDevError = Math.sqrt(
    errors.reduce((sum, value) => sum + Math.pow(value - meanError, 2), 0) / errors.length
  );
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;

  const evaluation = {
    correlation,
    rmse,
    rSquared: correlation * correlation,
    meanError,
    stdDevError,
    mae,
    top10: includeTopN ? calculateTopNAccuracy(predictions, actualResults, 10) : null,
    top20: includeTopN ? calculateTopNAccuracy(predictions, actualResults, 20) : null,
    top20WeightedScore: includeTopN ? calculateTopNWeightedScore(predictions, actualResults, 20) : null,
    matchedPlayers: scores.length
  };

  if (includeAdjusted && matched.length > 0) {
    const sortedByFinish = [...matched].sort((a, b) => a.actualFinish - b.actualFinish);
    const actualSubsetRankMap = new Map();
    sortedByFinish.forEach((entry, index) => {
      actualSubsetRankMap.set(entry.dgId, index + 1);
    });

    const subsetScores = [];
    const subsetPositions = [];
    const subsetErrors = [];
    matched.forEach(entry => {
      const actualRank = actualSubsetRankMap.get(entry.dgId);
      if (!actualRank) return;
      subsetScores.push(entry.predRank);
      subsetPositions.push(actualRank);
      subsetErrors.push(entry.predRank - actualRank);
    });

    const subsetCorrelation = calculateSpearmanCorrelation(subsetScores, subsetPositions);
    const subsetRmse = Math.sqrt(
      subsetScores.reduce((sum, s, i) => sum + Math.pow(s - subsetPositions[i], 2), 0) / subsetScores.length
    );
    const subsetMeanError = subsetErrors.reduce((sum, value) => sum + value, 0) / subsetErrors.length;
    const subsetStdDev = Math.sqrt(
      subsetErrors.reduce((sum, value) => sum + Math.pow(value - subsetMeanError, 2), 0) / subsetErrors.length
    );
    const subsetMae = subsetErrors.reduce((sum, value) => sum + Math.abs(value), 0) / subsetErrors.length;
    const subsetTop10 = includeTopN ? calculateTopNAccuracyFromActualRanks(predictions, actualSubsetRankMap, 10) : null;
    const subsetTop20 = includeTopN ? calculateTopNAccuracyFromActualRanks(predictions, actualSubsetRankMap, 20) : null;
    const subsetTop20Weighted = includeTopN ? calculateTopNWeightedScoreFromActualRanks(predictions, actualSubsetRankMap, 20) : null;

    const denom = subsetScores.length > 1 ? (subsetScores.length - 1) : 1;
    const predPercentiles = subsetScores.map(rank => (rank - 1) / denom);
    const actualPercentiles = subsetPositions.map(rank => (rank - 1) / denom);
    const pctErrors = predPercentiles.map((value, idx) => value - actualPercentiles[idx]);
    const pctCorrelation = calculateSpearmanCorrelation(predPercentiles, actualPercentiles);
    const pctRmse = Math.sqrt(
      predPercentiles.reduce((sum, value, idx) => sum + Math.pow(value - actualPercentiles[idx], 2), 0) / predPercentiles.length
    );
    const pctMeanError = pctErrors.reduce((sum, value) => sum + value, 0) / pctErrors.length;
    const pctStdDev = Math.sqrt(
      pctErrors.reduce((sum, value) => sum + Math.pow(value - pctMeanError, 2), 0) / pctErrors.length
    );
    const pctMae = pctErrors.reduce((sum, value) => sum + Math.abs(value), 0) / pctErrors.length;

    evaluation.adjusted = {
      subset: {
        correlation: subsetCorrelation,
        rmse: subsetRmse,
        rSquared: subsetCorrelation * subsetCorrelation,
        meanError: subsetMeanError,
        stdDevError: subsetStdDev,
        mae: subsetMae,
        top10: subsetTop10,
        top20: subsetTop20,
        top20WeightedScore: subsetTop20Weighted
      },
      percentile: {
        correlation: pctCorrelation,
        rmse: pctRmse,
        rSquared: pctCorrelation * pctCorrelation,
        meanError: pctMeanError,
        stdDevError: pctStdDev,
        mae: pctMae
      }
    };
  }

  if (includeTopN && includeTopNDetails) {
    const hasRank = predictions.some(p => typeof p.rank === 'number');
    const sortedPredictions = hasRank
      ? [...predictions].filter(p => typeof p.rank === 'number').sort((a, b) => (a.rank || 0) - (b.rank || 0))
      : [...predictions];
    const buildTopNDetails = n => {
      const predictedTopN = sortedPredictions.slice(0, n).map(p => String(p.dgId));
      const actualTopN = actualResults
        .filter(result => result.finishPosition && !Number.isNaN(result.finishPosition) && result.finishPosition <= n)
        .sort((a, b) => a.finishPosition - b.finishPosition)
        .map(result => String(result.dgId));
      const actualTopNSet = new Set(actualTopN);
      const overlap = predictedTopN.filter(id => actualTopNSet.has(id));
      return {
        predicted: predictedTopN,
        actual: actualTopN,
        overlap,
        overlapCount: overlap.length
      };
    };
    evaluation.top10Details = buildTopNDetails(10);
    evaluation.top20Details = buildTopNDetails(20);
  }

  return evaluation;
}

function hashFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildRunFingerprint({
  eventId,
  season,
  tournament,
  optSeed,
  tests,
  dryRun,
  includeCurrentEventRounds,
  templateOverride,
  filePaths,
  validationPaths
}) {
  const fileHashes = {};
  (filePaths || []).forEach(entry => {
    if (!entry || !entry.label) return;
    fileHashes[entry.label] = {
      path: entry.path ? path.basename(entry.path) : null,
      sha256: hashFile(entry.path)
    };
  });
  (validationPaths || []).forEach(entry => {
    if (!entry || !entry.label) return;
    fileHashes[entry.label] = {
      path: entry.path ? path.basename(entry.path) : null,
      sha256: hashFile(entry.path)
    };
  });

  return {
    algorithm: 'sha256',
    createdAt: new Date().toISOString(),
    eventId,
    season,
    tournament: tournament || null,
    optSeed: optSeed || null,
    tests: tests || null,
    dryRun: !!dryRun,
    includeCurrentEventRounds,
    templateOverride: templateOverride || null,
    files: fileHashes
  };
}

function ensureDirectory(dirPath) {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeJsonFile(filePath, payload) {
  if (!filePath) return;
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function loadCourseHistoryRegressionMap(options = {}) {
  const { outputDir = null } = options;
  const candidates = [];
  const addCandidate = value => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };

  addCandidate(outputDir ? path.resolve(outputDir, 'course_history_regression.json') : null);
  addCandidate(OUTPUT_DIR ? path.resolve(OUTPUT_DIR, 'course_history_regression.json') : null);
  addCandidate(path.resolve(ROOT_DIR, 'output', 'course_history_regression.json'));

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const payload = readJsonFile(filePath);
    if (payload && typeof payload === 'object') {
      return { map: payload, source: 'json', path: filePath };
    }
  }

  try {
    const regressionUtil = require('../utilities/courseHistoryRegression');
    const fallbackMap = typeof regressionUtil.getCourseHistoryRegressionMap === 'function'
      ? regressionUtil.getCourseHistoryRegressionMap()
      : regressionUtil.COURSE_HISTORY_REGRESSION;
    if (fallbackMap && typeof fallbackMap === 'object') {
      return {
        map: fallbackMap,
        source: 'utility',
        path: path.resolve(ROOT_DIR, 'utilities', 'courseHistoryRegression.js')
      };
    }
  } catch (error) {
    return null;
  }

  return null;
}

function loadRampSummary(options = {}) {
  const { outputDir = null, metric = 'sg_total' } = options;
  const normalizedMetric = String(metric || 'sg_total').trim().toLowerCase() || 'sg_total';
  const fileName = `early_season_ramp_${normalizedMetric}.json`;
  const candidates = [];
  const addCandidate = value => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };

  addCandidate(outputDir ? path.resolve(outputDir, fileName) : null);
  addCandidate(OUTPUT_DIR ? path.resolve(OUTPUT_DIR, fileName) : null);
  addCandidate(path.resolve(ROOT_DIR, 'output', fileName));

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const payload = readJsonFile(filePath);
    if (payload && typeof payload === 'object') {
      return { payload, path: filePath };
    }
  }

  return null;
}

function ensureEarlySeasonRampSummary(options = {}) {
  const { outputDir = null, metric = 'sg_total', dataDir = null } = options;
  if (!outputDir) return loadRampSummary({ outputDir, metric });
  const existing = loadRampSummary({ outputDir, metric });
  if (existing) return existing;

  console.log(`ℹ️  Early-season ramp summary missing; generating (${metric}).`);
  const originalArgv = process.argv.slice();
  try {
    const scriptPath = path.resolve(__dirname, '..', 'scripts', 'analyze_early_season_ramp.js');
    const scriptArgs = [
      scriptPath,
      '--outputDir',
      outputDir,
      '--metric',
      String(metric || 'sg_total').trim().toLowerCase()
    ];
    if (dataDir) {
      scriptArgs.push('--dataDir', dataDir);
    }
    process.argv = ['node', ...scriptArgs];
    delete require.cache[require.resolve('../scripts/analyze_early_season_ramp')];
    require('../scripts/analyze_early_season_ramp');
  } catch (error) {
    console.warn(`ℹ️  Early-season ramp generation failed: ${error.message}`);
  } finally {
    process.argv = originalArgv;
  }

  return loadRampSummary({ outputDir, metric });
}

function computePastPerformanceWeightFromRegression(entry) {
  if (!entry) return null;
  const slope = Number(entry.slope);
  const pValue = Number(entry.pValue);
  if (!Number.isFinite(slope) || !Number.isFinite(pValue)) return null;
  if (slope >= 0 || pValue >= 0.2) return 0.10;
  if (pValue <= 0.01) {
    if (slope <= -3.0) return 0.40;
    if (slope <= -1.5) return 0.30;
    return 0.25;
  }
  if (pValue <= 0.05) {
    if (slope <= -2.0) return 0.30;
    if (slope <= -1.0) return 0.25;
    return 0.20;
  }
  if (pValue <= 0.10) {
    if (slope <= -1.0) return 0.20;
    return 0.15;
  }
  return 0.10;
}

function loadCourseContext(filePath) {
  const payload = readJsonFile(filePath);
  if (!payload || typeof payload !== 'object') return null;
  return payload;
}

function resolveCourseNumFromContextEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.courseNum !== undefined && entry.courseNum !== null) {
    return String(entry.courseNum).trim();
  }
  if (Array.isArray(entry.courseNums) && entry.courseNums.length > 0) {
    return String(entry.courseNums[0]).trim();
  }
  return null;
}

function upsertCourseContextPastPerformanceWeights(courseContext, regressionMap) {
  if (!courseContext || typeof courseContext !== 'object') {
    return { updated: false, updates: [], context: courseContext };
  }
  if (!regressionMap || typeof regressionMap !== 'object') {
    return { updated: false, updates: [], context: courseContext };
  }

  const updates = [];
  let updated = false;

  const applyWeight = (entry, location, courseNumOverride = null) => {
    if (!entry || typeof entry !== 'object') return;
    if (entry.pastPerformance === false) return;
    const courseNum = courseNumOverride || resolveCourseNumFromContextEntry(entry);
    if (!courseNum) return;
    const regressionEntry = regressionMap[courseNum];
    if (!regressionEntry) return;
    const weight = computePastPerformanceWeightFromRegression(regressionEntry);
    if (weight === null) return;
    const existingWeight = typeof entry.pastPerformanceWeight === 'number' ? entry.pastPerformanceWeight : null;
    if (existingWeight !== null && Math.abs(existingWeight - weight) < 1e-6) return;
    entry.pastPerformanceWeight = weight;
    updates.push({
      location,
      courseNum,
      weight,
      slope: regressionEntry.slope,
      pValue: regressionEntry.pValue
    });
    updated = true;
  };

  if (courseContext.byEventId && typeof courseContext.byEventId === 'object') {
    Object.entries(courseContext.byEventId).forEach(([eventId, entry]) => {
      applyWeight(entry, `event:${eventId}`);
    });
  }

  if (courseContext.byCourseNum && typeof courseContext.byCourseNum === 'object') {
    Object.entries(courseContext.byCourseNum).forEach(([courseNum, entry]) => {
      applyWeight(entry, `course:${courseNum}`, String(courseNum).trim());
    });
  }

  if (updated) {
    courseContext.updatedAt = new Date().toISOString();
  }

  return { updated, updates, context: courseContext };
}

function resolveCourseContextEntry(context, options = {}) {
  if (!context || typeof context !== 'object') return null;
  const eventId = options.eventId ? String(options.eventId).trim() : null;
  const courseNum = options.courseNum ? String(options.courseNum).trim() : null;

  if (eventId && context.byEventId && context.byEventId[eventId]) {
    return { ...context.byEventId[eventId], source: 'eventId' };
  }
  if (courseNum && context.byCourseNum && context.byCourseNum[courseNum]) {
    return { ...context.byCourseNum[courseNum], source: 'courseNum' };
  }
  return null;
}

function applyCourseContextOverrides(sharedConfig, overrides) {
  if (!sharedConfig || !overrides) return false;
  let applied = false;

  if (Array.isArray(overrides.similarCourseIds) && overrides.similarCourseIds.length > 0) {
    sharedConfig.similarCourseIds = overrides.similarCourseIds;
    applied = true;
  }
  if (Array.isArray(overrides.puttingCourseIds) && overrides.puttingCourseIds.length > 0) {
    sharedConfig.puttingCourseIds = overrides.puttingCourseIds;
    applied = true;
  }
  if (typeof overrides.similarCoursesWeight === 'number' && Number.isFinite(overrides.similarCoursesWeight)) {
    sharedConfig.similarCoursesWeight = overrides.similarCoursesWeight;
    applied = true;
  }
  if (typeof overrides.puttingCoursesWeight === 'number' && Number.isFinite(overrides.puttingCoursesWeight)) {
    sharedConfig.puttingCoursesWeight = overrides.puttingCoursesWeight;
    applied = true;
  }

  if (overrides.shotDistribution && typeof overrides.shotDistribution === 'object') {
    sharedConfig.courseSetupWeights = {
      ...sharedConfig.courseSetupWeights,
      ...overrides.shotDistribution
    };
    applied = true;
  }

  return applied;
}

function buildSharedConfigFromCourseContext(entry, fallbackEventId) {
  if (!entry) return null;
  const defaultWeights = {
    under100: 0,
    from100to150: 0,
    from150to200: 0,
    over200: 0
  };
  const safeShotDistribution = entry.shotDistribution && typeof entry.shotDistribution === 'object'
    ? entry.shotDistribution
    : defaultWeights;

  return {
    cells: [],
    getCell: () => null,
    currentEventId: String(entry.eventId || fallbackEventId || ''),
    similarCourseIds: Array.isArray(entry.similarCourseIds) ? entry.similarCourseIds : [],
    puttingCourseIds: Array.isArray(entry.puttingCourseIds) ? entry.puttingCourseIds : [],
    similarCoursesWeight: typeof entry.similarCoursesWeight === 'number' ? entry.similarCoursesWeight : 0.7,
    puttingCoursesWeight: typeof entry.puttingCoursesWeight === 'number' ? entry.puttingCoursesWeight : 0.75,
    courseSetupWeights: safeShotDistribution,
    pastPerformanceEnabled: !!entry.pastPerformance,
    pastPerformanceWeight: typeof entry.pastPerformanceWeight === 'number' ? entry.pastPerformanceWeight : 0,
    courseNameRaw: entry.courseNameKey || null,
    courseNameKey: entry.courseNameKey || null,
    courseType: entry.courseType || null,
    courseNum: entry.courseNum || null
  };
}

function extractFieldRowsFromSnapshotPayload(payload) {
  if (!payload) return [];
  const candidates = Array.isArray(payload.field)
    ? payload.field
    : (Array.isArray(payload.players)
      ? payload.players
      : (Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : [])));
  return candidates;
}

function normalizeFieldRow(row) {
  if (!row || typeof row !== 'object') return null;
  const dgId = row.dg_id || row.dgId || row.player_id || row.playerId || row.id;
  if (!dgId) return null;
  return {
    ...row,
    dg_id: String(dgId).trim(),
    player_name: row.player_name || row.playerName || row.name || null
  };
}

function normalizeHistoricalRoundRow(row) {
  if (!row || typeof row !== 'object') return null;
  const dgId = row.dg_id || row.dgId || row.player_id || row.playerId || row.id;
  const eventId = row.event_id || row.eventId || row.tournament_id || row.tournamentId;
  if (!dgId || !eventId) return null;
  const yearValue = row.year ?? row.season ?? row.season_year ?? row.seasonYear;
  const roundNum = row.round_num ?? row.roundNum ?? row.round;
  const finText = row.fin_text ?? row.finish ?? row.finishPosition ?? row.fin;
  const eventCompleted = row.event_completed ?? row.eventCompleted ?? row.end_date ?? row.completed;
  return {
    ...row,
    dg_id: String(dgId).trim(),
    player_name: row.player_name || row.playerName || row.name || null,
    event_id: String(eventId).trim(),
    year: yearValue ?? row.year,
    season: row.season ?? row.year ?? yearValue,
    round_num: roundNum ?? row.round_num,
    fin_text: finText ?? row.fin_text,
    event_completed: eventCompleted ?? row.event_completed
  };
}

function listApproachSnapshotArchives() {
  if (!APPROACH_SNAPSHOT_DIR || !fs.existsSync(APPROACH_SNAPSHOT_DIR)) return [];
  const entries = [];
  const files = fs.readdirSync(APPROACH_SNAPSHOT_DIR);
  files.forEach(name => {
    if (!name.toLowerCase().endsWith('.json')) return;
    const lower = name.toLowerCase();
    if (lower === 'approach_l24.json' || lower === 'approach_l12.json' || lower === 'approach_ytd_latest.json') return;
    const match = name.match(/^approach_([a-z0-9]+)_(\d{4}-\d{2}-\d{2})\.json$/i);
    if (!match) return;
    const period = String(match[1] || '').toLowerCase();
    const dateStamp = match[2];
    const time = Date.parse(`${dateStamp}T00:00:00Z`);
    entries.push({
      period,
      name,
      path: path.resolve(APPROACH_SNAPSHOT_DIR, name),
      time: Number.isNaN(time) ? 0 : time
    });
  });
  entries.sort((a, b) => (b.time || 0) - (a.time || 0));
  return entries;
}

function resolveLatestApproachArchiveYear(period) {
  const normalized = String(period || '').trim().toLowerCase();
  if (!normalized) return null;
  const entries = listApproachSnapshotArchives().filter(entry => entry.period === normalized);
  if (entries.length === 0) return null;
  const latest = entries[0];
  if (!latest?.time) return null;
  const year = new Date(latest.time).getUTCFullYear();
  return Number.isNaN(year) ? null : year;
}

function pruneApproachSnapshotArchives() {
  const archives = listApproachSnapshotArchives();
  if (archives.length === 0) return { removed: 0, kept: 0 };

  const byPeriod = archives.reduce((acc, entry) => {
    if (!acc[entry.period]) acc[entry.period] = [];
    acc[entry.period].push(entry);
    return acc;
  }, {});

  let removed = 0;
  Object.entries(byPeriod).forEach(([period, entries]) => {
    const retentionCount = APPROACH_SNAPSHOT_RETENTION_COUNTS[period];
    if (!retentionCount) return;
    const sorted = entries.sort((a, b) => b.time - a.time);
    const keepSet = new Set(sorted.slice(0, retentionCount).map(entry => entry.path));
    sorted.forEach((entry, index) => {
      if (index < retentionCount || keepSet.has(entry.path)) return;
      try {
        fs.unlinkSync(entry.path);
        removed += 1;
      } catch (error) {
        console.warn(`⚠️  Unable to remove approach snapshot archive ${entry.name}: ${error.message}`);
      }
    });
  });

  const kept = Math.max(0, archives.length - removed);
  return { removed, kept };
}

function loadApproachSnapshotFromDisk(snapshotPath) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return { source: 'missing', path: snapshotPath, payload: null };
  const payload = readJsonFile(snapshotPath);
  if (!payload) return { source: 'invalid-json', path: snapshotPath, payload: null };
  return { source: 'snapshot', path: snapshotPath, payload };
}

async function getOrCreateApproachSnapshot({ period, snapshotPath, apiKey, cacheDir, ttlMs, season, eventId, isPostTournament }) {
  const loadSnapshot = (pathValue) => {
    if (typeof loadApproachSnapshotFromDisk === 'function') {
      return loadApproachSnapshotFromDisk(pathValue);
    }
    if (!pathValue || !fs.existsSync(pathValue)) return { source: 'missing', path: pathValue, payload: null };
    const payload = readJsonFile(pathValue);
    if (!payload) return { source: 'invalid-json', path: pathValue, payload: null };
    return { source: 'snapshot', path: pathValue, payload };
  };
  const normalizedPeriod = String(period || '').trim().toLowerCase();
  const useArchiveAsCurrent = normalizedPeriod === 'l12' || normalizedPeriod === 'l24';
  const latestArchive = useArchiveAsCurrent
    ? listApproachSnapshotArchives().find(entry => entry.period === normalizedPeriod)
    : null;

  if (!useArchiveAsCurrent && snapshotPath && fs.existsSync(snapshotPath)) {
    if (normalizedPeriod !== 'l12') {
      return loadSnapshot(snapshotPath);
    }

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const seasonValue = season ? parseInt(String(season).trim(), 10) : null;
    const eventIdValue = eventId ? String(eventId).trim() : null;
    const latestYear = resolveLatestApproachArchiveYear('l12');
    const forceRefresh = APPROACH_L12_FORCE_REFRESH === '1'
      || APPROACH_L12_FORCE_REFRESH === 'true'
      || (APPROACH_L12_REFRESH_SEASON && seasonValue && String(seasonValue) === APPROACH_L12_REFRESH_SEASON);
    const isTourChampEvent = eventIdValue && APPROACH_L12_REFRESH_EVENT_ID
      ? eventIdValue === APPROACH_L12_REFRESH_EVENT_ID
      : false;
    const allowRefresh = !!isPostTournament;
    const shouldRefresh = (forceRefresh && allowRefresh)
      || (allowRefresh && isTourChampEvent)
      || (allowRefresh && seasonValue && latestYear && seasonValue > latestYear && month >= APPROACH_L12_REFRESH_MONTH);

    if (!shouldRefresh) {
      return loadSnapshot(snapshotPath);
    }
    console.log('ℹ️  Refreshing L12 snapshot for end-of-season update.');
  }

  if (useArchiveAsCurrent && latestArchive?.path && fs.existsSync(latestArchive.path)) {
    return loadSnapshot(latestArchive.path);
  }

  const fetched = await getDataGolfApproachSkill({
    apiKey,
    cacheDir,
    ttlMs,
    allowStale: true,
    period,
    fileFormat: 'json'
  });

  if (fetched?.payload) {
    const archiveStamp = new Date().toISOString().slice(0, 10);
    if (normalizedPeriod === 'ytd') {
      if (snapshotPath) {
        writeJsonFile(snapshotPath, fetched.payload);
      }
      const archivePath = path.resolve(APPROACH_SNAPSHOT_DIR, `approach_${normalizedPeriod}_${archiveStamp}.json`);
      if (!fs.existsSync(archivePath)) {
        writeJsonFile(archivePath, fetched.payload);
      }
      pruneApproachSnapshotArchives();
      return { ...fetched, path: snapshotPath };
    }

    const archivePath = path.resolve(APPROACH_SNAPSHOT_DIR, `approach_${normalizedPeriod || 'snapshot'}_${archiveStamp}.json`);
    if (!fs.existsSync(archivePath)) {
      writeJsonFile(archivePath, fetched.payload);
    }
    return { ...fetched, path: archivePath };
  }

  if (!useArchiveAsCurrent && snapshotPath && fs.existsSync(snapshotPath)) {
    pruneApproachSnapshotArchives();
    return { source: 'snapshot-stale', path: snapshotPath, payload: readJsonFile(snapshotPath) };
  }

  if (useArchiveAsCurrent && latestArchive?.path && fs.existsSync(latestArchive.path)) {
    pruneApproachSnapshotArchives();
    return { source: 'snapshot-archive', path: latestArchive.path, payload: readJsonFile(latestArchive.path) };
  }

  return fetched;
}

async function refreshYtdApproachSnapshot({ apiKey, cacheDir, ttlMs }) {
  const fetched = await getDataGolfApproachSkill({
    apiKey,
    cacheDir,
    ttlMs,
    allowStale: true,
    period: 'ytd',
    fileFormat: 'json'
  });

  if (fetched?.payload) {
    writeJsonFile(APPROACH_SNAPSHOT_YTD_LATEST_PATH, fetched.payload);
    const archiveStamp = new Date().toISOString().slice(0, 10);
    const archivePath = path.resolve(APPROACH_SNAPSHOT_DIR, `approach_ytd_${archiveStamp}.json`);
    if (!fs.existsSync(archivePath)) {
      writeJsonFile(archivePath, fetched.payload);
    }
    pruneApproachSnapshotArchives();
    return { ...fetched, path: APPROACH_SNAPSHOT_YTD_LATEST_PATH, archivePath };
  }

  if (fs.existsSync(APPROACH_SNAPSHOT_YTD_LATEST_PATH)) {
    pruneApproachSnapshotArchives();
    return {
      source: 'snapshot',
      path: APPROACH_SNAPSHOT_YTD_LATEST_PATH,
      payload: readJsonFile(APPROACH_SNAPSHOT_YTD_LATEST_PATH)
    };
  }

  return fetched;
}

function deleteArchiveBackups(outputDir) {
  if (!outputDir) return 0;
  const archiveDir = path.resolve(outputDir, 'archive');
  if (!fs.existsSync(archiveDir)) return 0;
  const files = fs.readdirSync(archiveDir)
    .filter(name => name.toLowerCase().endsWith('.bak'))
    .map(name => path.resolve(archiveDir, name));
  let removed = 0;
  files.forEach(filePath => {
    try {
      fs.unlinkSync(filePath);
      removed += 1;
    } catch (error) {
      console.warn(`⚠️  Unable to delete backup file ${filePath}: ${error.message}`);
    }
  });
  return removed;
}

function buildBackupPath(filePath) {
  const archiveDir = path.resolve(OUTPUT_DIR, 'archive');
  ensureDirectory(archiveDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(filePath);
  return path.resolve(archiveDir, `${baseName}.${timestamp}.bak`);
}

function backupIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const backupPath = buildBackupPath(filePath);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function buildModifiedGroups(groups, groupWeights, metricWeights) {
  return groups.map(group => ({
    ...group,
    weight: groupWeights[group.name] || group.weight,
    metrics: group.metrics.map(metric => ({
      ...metric,
      weight: metricWeights[`${group.name}::${metric.name}`] || metric.weight
    }))
  }));
}

function flattenMetricWeights(metricWeights) {
  if (!metricWeights || typeof metricWeights !== 'object') return {};

  const flatWeights = {};
  const keys = Object.keys(metricWeights);
  const hasFlat = keys.some(key => key.includes('::') && typeof metricWeights[key] === 'number');

  if (hasFlat) {
    keys.forEach(key => {
      if (typeof metricWeights[key] === 'number') {
        flatWeights[key] = metricWeights[key];
      }
    });
    return flatWeights;
  }

  keys.forEach(groupName => {
    const groupMetrics = metricWeights[groupName];
    if (!groupMetrics || typeof groupMetrics !== 'object') return;
    Object.entries(groupMetrics).forEach(([metricName, metricConfig]) => {
      if (metricConfig && typeof metricConfig.weight === 'number') {
        flatWeights[`${groupName}::${metricName}`] = metricConfig.weight;
      }
    });
  });

  return flatWeights;
}

function nestMetricWeights(metricWeights) {
  if (!metricWeights || typeof metricWeights !== 'object') return {};

  const keys = Object.keys(metricWeights);
  const hasFlat = keys.some(key => key.includes('::'));

  const normalizeMetricNameForTemplate = (groupName, metricName) => {
    if (groupName === 'Course Management' && metricName === 'Poor Shots') {
      return 'Poor Shot Avoidance';
    }
    return metricName;
  };

  if (hasFlat) {
    const nested = {};
    keys.forEach(key => {
      if (typeof metricWeights[key] !== 'number') return;
      const [groupName, metricName] = key.split('::');
      if (!groupName || !metricName) return;
      const normalizedMetricName = normalizeMetricNameForTemplate(groupName, metricName);
      if (!nested[groupName]) nested[groupName] = {};
      if (!nested[groupName][normalizedMetricName]) {
        nested[groupName][normalizedMetricName] = { weight: 0 };
      }
      nested[groupName][normalizedMetricName].weight += metricWeights[key];
    });
    return nested;
  }

  const nested = {};
  keys.forEach(groupName => {
    const groupMetrics = metricWeights[groupName];
    if (!groupMetrics || typeof groupMetrics !== 'object') return;
    nested[groupName] = {};
    Object.entries(groupMetrics).forEach(([metricName, metricConfig]) => {
      if (metricConfig && typeof metricConfig.weight === 'number') {
        const normalizedMetricName = normalizeMetricNameForTemplate(groupName, metricName);
        if (!nested[groupName][normalizedMetricName]) {
          nested[groupName][normalizedMetricName] = { weight: 0 };
        }
        nested[groupName][normalizedMetricName].weight += metricConfig.weight;
      }
    });
  });

  return nested;
}

function normalizeTemplateWeights(template, baseMetricConfig) {
  const groupWeights = { ...(template.groupWeights || {}) };
  const metricWeights = flattenMetricWeights(template.metricWeights);

  baseMetricConfig.groups.forEach(group => {
    if (typeof groupWeights[group.name] !== 'number') {
      groupWeights[group.name] = group.weight;
    }
    group.metrics.forEach(metric => {
      const key = `${group.name}::${metric.name}`;
      if (typeof metricWeights[key] !== 'number') {
        metricWeights[key] = metric.weight;
      }
    });
  });

  return { groupWeights, metricWeights };
}

function buildGroupWeightsMap(groupWeightsArray) {
  const map = {};
  (groupWeightsArray || []).forEach(entry => {
    if (!entry || !entry.groupName) return;
    map[entry.groupName] = entry.weight;
  });
  return map;
}

function formatRankingPlayers(players, groups = null, groupStats = null) {
  if (!Array.isArray(players)) return [];
  return players.map(player => {
    const notes = (groups && groupStats)
      ? generateSheetLikePlayerNotes(player, groups, groupStats)
      : null;
    return {
      rank: typeof player.rank === 'number' ? player.rank : null,
      dgId: String(player.dgId || '').trim(),
      name: String(player.name || player.playerName || '').trim(),
      refinedWeightedScore: typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore : null,
      weightedScore: typeof player.weightedScore === 'number' ? player.weightedScore : null,
      compositeScore: typeof player.compositeScore === 'number' ? player.compositeScore : null,
      war: typeof player.war === 'number' ? player.war : null,
      notes
    };
  });
}

function buildMetricStatsDiagnostics(groupStats, options = {}) {
  const {
    stdDevThreshold = 0.05,
    minCount = 10
  } = options;

  if (!groupStats || typeof groupStats !== 'object') {
    return {
      thresholds: { stdDevThreshold, minCount },
      flagged: [],
      groupStats: {}
    };
  }

  const flagged = [];
  Object.entries(groupStats).forEach(([groupName, metrics]) => {
    if (!metrics || typeof metrics !== 'object') return;
    Object.entries(metrics).forEach(([metricName, stats]) => {
      if (!stats || typeof stats !== 'object') return;
      const stdDev = typeof stats.stdDev === 'number' ? stats.stdDev : null;
      const count = typeof stats.count === 'number' ? stats.count : null;
      const reasons = [];
      if (stdDev !== null && stdDev <= stdDevThreshold) reasons.push(`stdDev<=${stdDevThreshold}`);
      if (count !== null && count < minCount) reasons.push(`count<${minCount}`);
      if (reasons.length === 0) return;
      flagged.push({
        group: groupName,
        metric: metricName,
        mean: typeof stats.mean === 'number' ? stats.mean : null,
        stdDev,
        count,
        min: typeof stats.min === 'number' ? stats.min : null,
        max: typeof stats.max === 'number' ? stats.max : null,
        reasons
      });
    });
  });

  return {
    thresholds: { stdDevThreshold, minCount },
    flagged: flagged.sort((a, b) => (a.stdDev ?? 0) - (b.stdDev ?? 0)),
    groupStats
  };
}

function selectOptimizableGroups(groupWeightsArray, minFixedCount = 3) {
  const sorted = [...(groupWeightsArray || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const fixed = new Set(sorted.slice(0, minFixedCount).map(entry => entry.groupName));
  return sorted.filter(entry => !fixed.has(entry.groupName)).map(entry => entry.groupName);
}

function deriveResultsFromHistory(rawHistoryData, eventId, season = null, nameLookup = {}) {
  const resultsByPlayer = {};
  const eventIdStr = String(eventId || '').trim();

  rawHistoryData.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const rowSeason = parseInt(String(row['season'] || row['year'] || '').trim());
    const rowYear = parseInt(String(row['year'] || '').trim());
    const rowEventId = String(row['event_id'] || '').trim();
    if (!dgId || !rowEventId) return;
    if (eventIdStr && rowEventId !== eventIdStr) return;
    if (season && !Number.isNaN(season)) {
      if (rowSeason !== season && rowYear !== season) return;
    }

    const finishPosition = parseFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;

    const playerName = String(row['player_name'] || '').trim() || nameLookup[dgId] || 'Unknown';

    if (!resultsByPlayer[dgId] || finishPosition < resultsByPlayer[dgId].finishPosition) {
      resultsByPlayer[dgId] = { finishPosition, playerName };
    }
  });

  return Object.entries(resultsByPlayer).map(([dgId, entry]) => ({
    dgId,
    finishPosition: entry.finishPosition,
    playerName: entry.playerName
  }));
}

function buildResultsByYear(rawHistoryData, eventId) {
  const resultsByYear = {};
  rawHistoryData.forEach(row => {
    const year = parseInt(String(row['year'] || row['season'] || '').trim());
    if (Number.isNaN(year)) return;
    const eventIdStr = String(eventId || '').trim();
    const rowEventId = String(row['event_id'] || '').trim();
    if (eventIdStr && rowEventId !== eventIdStr) return;
    const finishPosition = parseFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    const dgId = String(row['dg_id'] || '').trim();
    if (!dgId) return;
    if (!resultsByYear[year]) resultsByYear[year] = [];
    resultsByYear[year].push({ dgId, finishPosition });
  });

  Object.keys(resultsByYear).forEach(year => {
    const deduped = new Map();
    resultsByYear[year].forEach(result => {
      const existing = deduped.get(result.dgId);
      if (!existing || result.finishPosition < existing.finishPosition) {
        deduped.set(result.dgId, result);
      }
    });
    resultsByYear[year] = Array.from(deduped.values());
  });

  return resultsByYear;
}

function aggregateYearlyEvaluations(resultsByYear) {
  const years = Object.keys(resultsByYear);
  const totals = years.reduce(
    (acc, year) => {
      const evalResult = resultsByYear[year];
      acc.matchedPlayers += evalResult.matchedPlayers || 0;
      acc.correlation += (evalResult.correlation || 0) * (evalResult.matchedPlayers || 0);
      acc.rmse += (evalResult.rmse || 0) * (evalResult.matchedPlayers || 0);
      acc.rSquared += (evalResult.rSquared || 0) * (evalResult.matchedPlayers || 0);
      acc.meanError += (evalResult.meanError || 0) * (evalResult.matchedPlayers || 0);
      acc.stdDevError += (evalResult.stdDevError || 0) * (evalResult.matchedPlayers || 0);
      acc.mae += (evalResult.mae || 0) * (evalResult.matchedPlayers || 0);
      if (typeof evalResult.top10 === 'number') {
        acc.top10 += evalResult.top10 * (evalResult.matchedPlayers || 0);
      }
      if (typeof evalResult.top20 === 'number') {
        acc.top20 += evalResult.top20 * (evalResult.matchedPlayers || 0);
        acc.top20WeightedScore += (evalResult.top20WeightedScore || 0) * (evalResult.matchedPlayers || 0);
      }
      return acc;
    },
    {
      correlation: 0,
      rmse: 0,
      rSquared: 0,
      meanError: 0,
      stdDevError: 0,
      mae: 0,
      top10: 0,
      top20: 0,
      top20WeightedScore: 0,
      matchedPlayers: 0
    }
  );

  if (totals.matchedPlayers === 0) {
    return {
      correlation: 0,
      rmse: 0,
      rSquared: 0,
      meanError: 0,
      stdDevError: 0,
      mae: 0,
      top10: null,
      top20: null,
      top20WeightedScore: null,
      matchedPlayers: 0
    };
  }

  return {
    correlation: totals.correlation / totals.matchedPlayers,
    rmse: totals.rmse / totals.matchedPlayers,
    rSquared: totals.rSquared / totals.matchedPlayers,
    meanError: totals.meanError / totals.matchedPlayers,
    stdDevError: totals.stdDevError / totals.matchedPlayers,
    mae: totals.mae / totals.matchedPlayers,
    top10: totals.top10 > 0 ? totals.top10 / totals.matchedPlayers : null,
    top20: totals.top20 > 0 ? totals.top20 / totals.matchedPlayers : null,
    top20WeightedScore: totals.top20WeightedScore > 0 ? totals.top20WeightedScore / totals.matchedPlayers : null,
    matchedPlayers: totals.matchedPlayers
  };
}

function adjustMetricWeights(metricWeights, metricConfig, maxAdjustment) {
  const adjusted = { ...metricWeights };
  metricConfig.groups.forEach(group => {
    const keys = group.metrics.map(metric => `${group.name}::${metric.name}`);
    const groupWeights = keys.map(key => ({
      key,
      weight: adjusted[key] || 0
    }));

    const updated = groupWeights.map(({ key, weight }) => {
      const adjustment = (rand() * 2 - 1) * maxAdjustment;
      return { key, weight: Math.max(0.0001, weight * (1 + adjustment)) };
    });

    const total = updated.reduce((sum, metric) => sum + metric.weight, 0);
    updated.forEach(metric => {
      adjusted[metric.key] = total > 0 ? metric.weight / total : metric.weight;
    });
  });

  return adjusted;
}

function computeWeightDeltas(baselineWeights, optimizedWeights) {
  const deltas = {};
  Object.keys(baselineWeights || {}).forEach(groupName => {
    const base = baselineWeights[groupName] || 0;
    const opt = optimizedWeights[groupName] || 0;
    deltas[groupName] = {
      baseline: base,
      optimized: opt,
      delta: opt - base,
      deltaPct: base === 0 ? null : ((opt - base) / base)
    };
  });
  return deltas;
}

function resolveDataFile(fileName) {
  const primary = path.resolve(DATA_DIR, fileName);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.resolve(DEFAULT_DATA_DIR, fileName);
  if (fs.existsSync(fallback)) return fallback;
  return primary;
}

function normalizeTournamentSlug(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Defensive cleanup: some historical runs accidentally carried an `optimizer_` prefix.
  // We never want that to leak into folder names or artifact names.
  return normalized.replace(/^optimizer-+/, '');
}

function listSeasonInputDirs(season) {
  const dirs = [];
  if (!season) return dirs;
  const seasonDir = path.resolve(DATA_ROOT_DIR, String(season));
  if (!fs.existsSync(seasonDir)) return dirs;
  const entries = fs.readdirSync(seasonDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'validation_outputs')
    .map(entry => entry.name);
  entries.forEach(name => {
    const inputDir = path.resolve(seasonDir, name, 'inputs');
    if (fs.existsSync(inputDir)) dirs.push(inputDir);
  });
  return dirs;
}

function resolveTournamentDir(season, tournamentName, fallbackName) {
  const seasonDir = path.resolve(DATA_ROOT_DIR, String(season));
  const normalized = normalizeTournamentSlug(tournamentName || fallbackName);
  if (!fs.existsSync(seasonDir)) {
    return path.resolve(seasonDir, normalized || `event-${OVERRIDE_EVENT_ID || 'unknown'}`);
  }

  const entries = fs.readdirSync(seasonDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'validation_outputs')
    .map(entry => entry.name);

  if (normalized && entries.includes(normalized)) {
    return path.resolve(seasonDir, normalized);
  }

  if (normalized) {
    const tokens = normalized.split('-').filter(Boolean);
    if (tokens.length > 0) {
      let best = null;
      entries.forEach(name => {
        const dirTokens = name.split('-').filter(Boolean);
        const overlap = tokens.filter(token => dirTokens.includes(token)).length;
        if (!best || overlap > best.overlap) {
          best = { name, overlap };
        }
      });
      if (best && best.overlap > 0) {
        return path.resolve(seasonDir, best.name);
      }
    }
  }

  return path.resolve(seasonDir, normalized || `event-${OVERRIDE_EVENT_ID || 'unknown'}`);
}

function resolveTournamentFile(suffix, tournamentName, season, fallbackName) {
  const baseName = String(tournamentName || fallbackName || '').trim();
  const seasonTag = season ? `(${season})` : '';
  const exactName = baseName ? `${baseName} ${seasonTag} - ${suffix}.csv`.replace(/\s+/g, ' ').trim() : '';
  const altName = baseName ? `${baseName} - ${suffix}.csv` : '';

  const seasonInputDirs = listSeasonInputDirs(season);
  const dirs = [
    ...(TOURNAMENT_INPUT_DIRS || []),
    ...seasonInputDirs,
    DATA_DIR,
    DEFAULT_DATA_DIR
  ].filter(Boolean);
  const candidates = [];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      if (!file.toLowerCase().endsWith('.csv')) return;
      const lower = file.toLowerCase();
      if (!lower.includes(suffix.toLowerCase())) return;
      candidates.push({
        file,
        path: path.resolve(dir, file)
      });
    });
  });

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

  if (candidates.length > 0 && !baseName) {
    const sorted = candidates.sort((a, b) => a.file.localeCompare(b.file));
    return sorted[0].path;
  }

  if (exactName) return resolveDataFile(exactName);
  if (altName) return resolveDataFile(altName);
  return resolveDataFile(`${suffix}.csv`);
}

function ensureTournamentScaffolding(tournamentDir) {
  if (!tournamentDir) return;
  ensureDirectory(tournamentDir);
  ensureDirectory(path.resolve(tournamentDir, 'inputs'));
  const preEventDir = path.resolve(tournamentDir, 'pre_event');
  const postEventDir = path.resolve(tournamentDir, 'post_event');
  ensureDirectory(preEventDir);
  ensureDirectory(postEventDir);
  ensureDirectory(path.resolve(preEventDir, 'analysis'));
  ensureDirectory(path.resolve(preEventDir, 'course_history_regression'));
  ensureDirectory(path.resolve(preEventDir, 'dryrun'));
  ensureDirectory(path.resolve(postEventDir, 'seed_runs'));
}

function listApproachCsvCandidates(season, excludePath = null) {
  const seasonInputDirs = listSeasonInputDirs(season);
  const dirs = [
    ...(TOURNAMENT_INPUT_DIRS || []),
    ...seasonInputDirs,
    DATA_DIR,
    DEFAULT_DATA_DIR
  ].filter(Boolean);
  const normalizedExclude = excludePath ? path.resolve(excludePath) : null;
  const candidates = [];

  dirs.forEach(dir => {
    if (!dir || !fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      if (!file.toLowerCase().endsWith('.csv')) return;
      if (!file.toLowerCase().includes('approach skill')) return;
      const filePath = path.resolve(dir, file);
      if (normalizedExclude && path.resolve(filePath) === normalizedExclude) return;
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs || 0;
      } catch (error) {
        mtimeMs = 0;
      }
      candidates.push({ file: file, path: filePath, mtimeMs });
    });
  });

  return candidates;
}

function resolvePreviousApproachCsv(season, currentPath) {
  const candidates = listApproachCsvCandidates(season, currentPath);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  return candidates[0].path;
}

function detectPostTournamentFromHistory(historyPath, eventId, season) {
  if (!historyPath || !fs.existsSync(historyPath)) return false;
  try {
    const rows = loadCsv(historyPath, { skipFirstColumn: true });
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const eventIdStr = String(eventId || '').trim();
    const seasonStr = String(season || '').trim();
    return rows.some(row => {
      const rowEvent = String(row?.event_id || '').trim();
      if (eventIdStr && rowEvent !== eventIdStr) return false;
      const rowSeason = String(row?.season || row?.year || '').trim();
      if (seasonStr && rowSeason !== seasonStr) return false;
      return !!String(row?.fin_text || row?.finish || row?.finishPosition || '').trim();
    });
  } catch (error) {
    return false;
  }
}

function upsertTemplateInFile(filePath, template, options = {}) {
  const { replaceByEventId = false, dryRun = false } = options;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const marker = 'const WEIGHT_TEMPLATES = {';
    const markerIndex = fileContent.indexOf(marker);
    if (markerIndex === -1) return { updated: false, content: null };

    const findTemplateBlocks = (content) => {
      const blocks = [];
      let i = markerIndex + marker.length;
      let depth = 1;
      let inString = false;
      let stringChar = '';
      let keyStart = null;
      let keyEnd = null;
      let key = null;
      let entryStart = null;

      while (i < fileContent.length) {
        const char = fileContent[i];

        if (inString) {
          if (char === stringChar && fileContent[i - 1] !== '\\') {
            inString = false;
          }
          i += 1;
          continue;
        }

        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          i += 1;
          continue;
        }

        if (char === '{') {
          depth += 1;
          if (depth === 2 && entryStart === null && key) {
            entryStart = i;
          }
        } else if (char === '}') {
          if (depth === 2 && entryStart !== null) {
            const entryEnd = i + 1;
            blocks.push({ key, keyStart, keyEnd, start: entryStart, end: entryEnd });
            key = null;
            entryStart = null;
            keyStart = null;
            keyEnd = null;
          }
          depth -= 1;
          if (depth === 0) break;
        } else if (depth === 1 && key === null) {
          if (char === '\n' || char === ' ') {
            i += 1;
            continue;
          }
          if (/[A-Za-z0-9_]/.test(char)) {
            keyStart = i;
            let j = i;
            while (j < content.length && /[A-Za-z0-9_]/.test(content[j])) j += 1;
            const possibleKey = content.slice(keyStart, j);
            const afterKey = content.slice(j).trimStart();
            if (afterKey.startsWith(':')) {
              key = possibleKey;
              keyEnd = j;
            }
          }
        }

        i += 1;
      }

      return blocks;
    };

    const blocks = findTemplateBlocks(fileContent);
    let targetKey = template.name;
    let targetBlock = null;
    let eventMatches = [];

    if (replaceByEventId) {
      const eventIdValue = String(template.eventId);
      const eventIdRegex = new RegExp(`eventId\\s*:\\s*['\"]?${eventIdValue}['\"]?`);
      eventMatches = blocks.filter(block => eventIdRegex.test(fileContent.slice(block.start, block.end)));
      if (eventMatches.length > 0) {
        targetKey = eventMatches[0].key;
        targetBlock = eventMatches[0];
      }
    } else {
      targetBlock = blocks.find(block => block.key === targetKey) || null;
    }

    const templateForWrite = { ...template, name: template.name || targetKey };
    const templateString = JSON.stringify({ __KEY__: templateForWrite }, null, 2)
      .replace(/^\{\n|\n\}$/g, '')
      .replace(/\n  /g, '\n  ')
      .replace(/"name":/g, 'name:')
      .replace(/"eventId":/g, 'eventId:')
      .replace(/"description":/g, 'description:')
      .replace(/"groupWeights":/g, 'groupWeights:')
      .replace(/"metricWeights":/g, 'metricWeights:')
      .replace(/"weight":/g, 'weight:')
      .replace(/\{\s*weight:\s*([0-9.\-eE]+)\s*\}/g, '{ weight: $1 }');

    const isIdentifierKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(templateForWrite.name);
    const keyToken = isIdentifierKey
      ? `${templateForWrite.name}:`
      : `"${templateForWrite.name}":`;
    const templateWithKey = templateString.replace(/"__KEY__":/, keyToken).trim();
    let updatedContent;

    if (targetBlock) {
      const wantsKeyUpdate = templateForWrite.name && templateForWrite.name !== targetBlock.key && targetBlock.keyStart !== null;
      if (wantsKeyUpdate) {
        updatedContent = fileContent.slice(0, targetBlock.keyStart) + templateWithKey + fileContent.slice(targetBlock.end);
      } else {
        const objectOnly = templateWithKey.slice(templateWithKey.indexOf('{'));
        updatedContent = fileContent.slice(0, targetBlock.start) + objectOnly + fileContent.slice(targetBlock.end);
      }
    } else {
      const insertAt = fileContent.indexOf('};', markerIndex);
      if (insertAt === -1) return { updated: false, content: null };
      updatedContent = fileContent.slice(0, insertAt) + `,\n  ${templateWithKey}` + fileContent.slice(insertAt);
    }

    if (replaceByEventId && eventMatches.length > 1) {
      const eventIdValue = String(template.eventId);
      const eventIdRegex = new RegExp(`eventId\\s*:\\s*['\"]?${eventIdValue}['\"]?`);
      const refreshedBlocks = findTemplateBlocks(updatedContent)
        .filter(block => eventIdRegex.test(updatedContent.slice(block.start, block.end)));

      if (refreshedBlocks.length > 1) {
        const blocksToRemove = refreshedBlocks.slice(1).sort((a, b) => b.start - a.start);
        blocksToRemove.forEach(block => {
          updatedContent = updatedContent.slice(0, block.keyStart) + updatedContent.slice(block.end);
        });
      }
    }

    if (!dryRun) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
    }

    return { updated: true, content: updatedContent };
  } catch (error) {
    console.error(`Failed to update template file: ${filePath}`, error.message);
    return { updated: false, content: null };
  }
}

function buildDeltaPlayerScoresEntry(eventId, season, playerSummary) {
  if (!playerSummary) return null;
  const trendScores = Array.isArray(playerSummary.trendWeightedAll) ? playerSummary.trendWeightedAll : [];
  const predictiveScores = Array.isArray(playerSummary.predictiveWeightedAll) ? playerSummary.predictiveWeightedAll : [];
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

  const seasonValue = typeof season === 'number' && !Number.isNaN(season)
    ? season
    : parseInt(String(season || '').trim(), 10);

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
    [String(eventId)]: {
      season: Number.isNaN(seasonValue) ? null : seasonValue,
      players: playersObject
    }
  };
}

function buildDeltaScoresByIdFromScores(trendScores = [], predictiveScores = []) {
  const players = new Map();
  const upsert = (entry, scoreKey, bucketKey) => {
    const dgId = String(entry?.dgId || entry?.dg_id || '').trim();
    if (!dgId) return;
    const score = typeof entry?.score === 'number' && !Number.isNaN(entry.score) ? entry.score : null;
    if (score === null) return;
    const current = players.get(dgId) || {};
    current[scoreKey] = score;
    if (entry?.bucketScores && typeof entry.bucketScores === 'object') {
      current[bucketKey] = entry.bucketScores;
    }
    players.set(dgId, current);
  };

  trendScores.forEach(entry => upsert(entry, 'deltaTrendScore', 'deltaTrendBuckets'));
  predictiveScores.forEach(entry => upsert(entry, 'deltaPredictiveScore', 'deltaPredictiveBuckets'));

  const output = {};
  players.forEach((entry, dgId) => {
    output[dgId] = {
      deltaTrendScore: typeof entry?.deltaTrendScore === 'number' ? entry.deltaTrendScore : null,
      deltaPredictiveScore: typeof entry?.deltaPredictiveScore === 'number' ? entry.deltaPredictiveScore : null,
      deltaTrendBuckets: entry?.deltaTrendBuckets || null,
      deltaPredictiveBuckets: entry?.deltaPredictiveBuckets || null
    };
  });

  return output;
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

function writeDeltaPlayerScoresFiles(targets, deltaScoresByEvent, options = {}) {
  const { dryRun = false, outputDir = null } = options;
  if (!deltaScoresByEvent || Object.keys(deltaScoresByEvent).length === 0) return [];
  const outputs = [];
  const nodeTarget = path.resolve(ROOT_DIR, 'utilities', 'deltaPlayerScores.js');

  (targets || []).forEach(filePath => {
    if (!filePath) return;
    const includeModuleExports = path.resolve(filePath) === nodeTarget;
    const content = buildDeltaPlayerScoresFileContent(deltaScoresByEvent, { includeModuleExports });
    if (dryRun) {
      const suffix = includeModuleExports ? 'node' : 'gas';
      const baseName = path.basename(filePath, path.extname(filePath));
      const dryRunName = `dryrun_${baseName}.${suffix}${path.extname(filePath) || '.js'}`;
      const dryRunPath = outputDir
        ? path.resolve(outputDir, dryRunName)
        : `${filePath}.dryrun`;
      fs.writeFileSync(dryRunPath, content, 'utf8');
      outputs.push({ action: 'dryRun', target: dryRunPath });
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
      outputs.push({ action: 'write', target: filePath });
    }
  });

  return outputs;
}

async function runAdaptiveOptimizer() {
  const requiredFiles = [
    { name: 'Configuration Sheet', path: null },
    { name: 'Tournament Field', path: null },
    { name: 'Historical Data', path: null },
    { name: 'Approach Skill', path: null }
  ];

  const CURRENT_EVENT_ID = OVERRIDE_EVENT_ID;
  const CURRENT_SEASON = OVERRIDE_SEASON ?? 2026;
  const tournamentNameFallback = TOURNAMENT_NAME || 'Sony Open';
  const seasonDir = path.resolve(DATA_ROOT_DIR, String(CURRENT_SEASON));
  const tournamentDir = RUN_SEASON_VALIDATION
    ? null
    : resolveTournamentDir(CURRENT_SEASON, TOURNAMENT_NAME, tournamentNameFallback);
  if (tournamentDir) {
    ensureTournamentScaffolding(tournamentDir);
  }
  const tournamentInputsDir = tournamentDir ? path.resolve(tournamentDir, 'inputs') : null;
  const preEventOutputDir = RUN_SEASON_VALIDATION
    ? null
    : (OVERRIDE_OUTPUT_DIR
      ? path.resolve(OVERRIDE_OUTPUT_DIR)
      : path.resolve(tournamentDir, 'pre_event'));
  const postEventOutputDir = RUN_SEASON_VALIDATION
    ? null
    : (OVERRIDE_OUTPUT_DIR
      ? path.resolve(OVERRIDE_OUTPUT_DIR)
      : path.resolve(tournamentDir, 'post_event'));
  const validationOutputsDir = path.resolve(seasonDir, 'validation_outputs');

  TOURNAMENT_INPUT_DIRS = tournamentInputsDir ? [tournamentInputsDir] : [];
  VALIDATION_OUTPUT_DIRS = [validationOutputsDir];
  if (tournamentInputsDir) {
    DATA_DIR = tournamentInputsDir;
    DEFAULT_DATA_DIR = tournamentInputsDir;
  }
  if (preEventOutputDir) {
    OUTPUT_DIR = preEventOutputDir;
  }

  if (preEventOutputDir) ensureDirectory(preEventOutputDir);
  if (postEventOutputDir) ensureDirectory(postEventOutputDir);
  ensureDirectory(validationOutputsDir);

  if (RUN_VALIDATION_ONLY) {
    try {
      const { runValidation, runSeasonValidation } = require('./validationRunner');
      if (RUN_SEASON_VALIDATION && typeof runSeasonValidation === 'function') {
        console.log('🧪 Running validation runner for all season tournaments...');
        const validationResult = await runSeasonValidation({
          season: CURRENT_SEASON,
          dataRootDir: DATA_ROOT_DIR,
          logger: console
        });
        console.log(`✅ Validation outputs written to: ${validationResult.outputDir}`);
        return;
      }
      if (typeof runValidation !== 'function') {
        throw new Error('validationRunner is unavailable');
      }
      console.log('🧪 Running validation runner (standalone mode)...');
      const validationResult = await runValidation({
        season: CURRENT_SEASON,
        dataRootDir: DATA_ROOT_DIR,
        tournamentName: TOURNAMENT_NAME || tournamentNameFallback,
        tournamentSlug: null,
        tournamentDir,
        eventId: CURRENT_EVENT_ID
      });
      console.log(`✅ Validation outputs written to: ${validationResult.outputDir}`);
      return;
    } catch (error) {
      console.error(`\n❌ Validation runner failed: ${error.message}`);
      process.exit(1);
    }
  }

  let APPROACH_DELTA_PATH = findApproachDeltaFile([
    APPROACH_DELTA_DIR,
    OUTPUT_DIR,
    DATA_DIR,
    DEFAULT_DATA_DIR
  ], TOURNAMENT_NAME, tournamentNameFallback);
  if (OVERRIDE_APPROACH_DELTA_CURRENT || OVERRIDE_APPROACH_DELTA_PREVIOUS) {
    APPROACH_DELTA_PATH = null;
    console.log('ℹ️  Approach delta overrides provided; will auto-generate delta JSON.');
  }
  let CONFIG_PATH = resolveTournamentFile('Configuration Sheet', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const FIELD_PATH = resolveTournamentFile('Tournament Field', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const HISTORY_PATH = resolveTournamentFile('Historical Data', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const APPROACH_PATH = resolveTournamentFile('Approach Skill', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const POST_TOURNAMENT_HINT = FORCE_RUN_MODE === 'post'
    ? true
    : (FORCE_RUN_MODE === 'pre'
      ? false
      : detectPostTournamentFromHistory(
          HISTORY_PATH,
          CURRENT_EVENT_ID,
          CURRENT_SEASON
        ));
  const currentEventRoundsDefaults = { ...CURRENT_EVENT_ROUNDS_DEFAULTS };
  if (POST_TOURNAMENT_HINT) {
    currentEventRoundsDefaults.currentSeasonBaseline = true;
    currentEventRoundsDefaults.currentSeasonOptimization = true;
  }
  if (FORCE_RUN_MODE === 'pre') {
    console.log('ℹ️  Forced pre-tournament mode (--pre).');
  } else if (FORCE_RUN_MODE === 'post') {
    console.log('ℹ️  Forced post-tournament mode (--post).');
  }

  requiredFiles[0].path = CONFIG_PATH;
  requiredFiles[1].path = FIELD_PATH;
  requiredFiles[2].path = HISTORY_PATH;
  requiredFiles[3].path = APPROACH_PATH;

  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file.path));
  const missingCoreCsv = missingFiles.filter(file => ['Tournament Field', 'Historical Data', 'Approach Skill'].includes(file.name));
  const missingConfigCsv = missingFiles.filter(file => file.name === 'Configuration Sheet');
  if (missingFiles.length > 0) {
    console.log('\n⚠️  Missing input CSVs (these were migration-only; API/cache is primary):');
    missingFiles.forEach(file => {
      console.log(`   - ${file.name}: ${path.basename(file.path)}`);
    });
    console.warn('\nExpected locations:');
    console.warn(`   - ${tournamentInputsDir}`);
    console.warn(`   - ${seasonDir}`);
    console.warn(`   - ${DATA_DIR}`);
    console.warn(`   - ${DEFAULT_DATA_DIR}`);
  }

  const shouldFetchApi = missingCoreCsv.length > 0;
  const optionalApiFlag = String(process.env.DATAGOLF_FETCH_OPTIONAL || '').trim().toLowerCase();
  const shouldFetchOptionalApi = optionalApiFlag
    ? !['false', '0', 'no', 'off'].includes(optionalApiFlag)
    : true;
  if (!shouldFetchApi) {
    console.log('ℹ️  CSV inputs present: ; skipping DataGolf core fetches (API fallback mode).');
  }
  if (!shouldFetchOptionalApi) {
    console.log('ℹ️  Optional DataGolf snapshots disabled (skill ratings / decompositions).');
  }

  const fallbackDirName = CONFIG_PATH ? path.basename(path.dirname(CONFIG_PATH)) : null;
  const outputDir = OUTPUT_DIR
    || preEventOutputDir
    || (fallbackDirName ? path.resolve(ROOT_DIR, 'data', fallbackDirName) : null);
  if (LOGGING_ENABLED && !LOGGING_INITIALIZED) {
    const loggingDir = typeof OVERRIDE_OUTPUT_DIR === 'string' && OVERRIDE_OUTPUT_DIR.length > 0
      ? OVERRIDE_OUTPUT_DIR
      : outputDir;
    if (loggingDir) {
      LOGGING_HANDLE = setupLogging(
        loggingDir,
        TOURNAMENT_NAME || OVERRIDE_EVENT_ID || 'event',
        runContext
      );
      LOGGING_INITIALIZED = true;

      // Ensure we always restore stdio overrides even if the script exits early.
      if (LOGGING_HANDLE && typeof LOGGING_HANDLE.teardown === 'function') {
        process.once('exit', () => {
          try {
            LOGGING_HANDLE.teardown();
          } catch (error) {
            // Ignore
          }
        });
      }
    }
  }
  const isSeedRunDir = outputDir && path.basename(outputDir) === 'seed_runs';
  const seedRunsParentDir = isSeedRunDir ? path.dirname(outputDir) : null;
  const parentAnalysisDir = seedRunsParentDir ? path.resolve(seedRunsParentDir, 'analysis') : null;
  const parentRegressionDir = seedRunsParentDir ? path.resolve(seedRunsParentDir, 'course_history_regression') : null;
  const parentHasRamp = parentAnalysisDir && fs.existsSync(path.resolve(parentAnalysisDir, 'early_season_ramp_sg_total.json'));
  const parentHasRegression = parentRegressionDir && fs.existsSync(path.resolve(parentRegressionDir, 'course_history_regression.json'));
  const analysisOutputDir = outputDir
    ? path.resolve((isSeedRunDir && parentHasRamp) ? seedRunsParentDir : outputDir, 'analysis')
    : null;
  const regressionOutputDir = outputDir
    ? path.resolve((isSeedRunDir && parentHasRegression) ? seedRunsParentDir : outputDir, 'course_history_regression')
    : null;
  const dryRunOutputDir = outputDir
    ? path.resolve((isSeedRunDir ? seedRunsParentDir : outputDir), 'dryrun')
    : null;
  if (analysisOutputDir) ensureDirectory(analysisOutputDir);
  if (regressionOutputDir) ensureDirectory(regressionOutputDir);
  if (dryRunOutputDir) ensureDirectory(dryRunOutputDir);
  if (regressionOutputDir) {
    process.env.PRE_TOURNAMENT_OUTPUT_DIR = regressionOutputDir;
  } else if (outputDir) {
    process.env.PRE_TOURNAMENT_OUTPUT_DIR = outputDir;
  }
  if (WRITE_TEMPLATES) {
    process.env.WRITE_TEMPLATES = 'true';
  }
  process.env.PRE_TOURNAMENT_EVENT_ID = String(CURRENT_EVENT_ID || '');
  process.env.PRE_TOURNAMENT_SEASON = String(CURRENT_SEASON || '');

  const SHOULD_RUN_PRE_EVENT_ARTIFACTS = FORCE_RUN_MODE === 'pre'
    || (!FORCE_RUN_MODE && !POST_TOURNAMENT_HINT);
  const rampSummary = SHOULD_RUN_PRE_EVENT_ARTIFACTS
    ? ensureEarlySeasonRampSummary({
        outputDir: analysisOutputDir || outputDir,
        metric: 'sg_total',
        dataDir: DATA_DIR || DATA_ROOT_DIR
      })
    : null;
  const rampPlayers = Array.isArray(rampSummary?.payload?.players)
    ? rampSummary.payload.players
    : [];
  const rampById = rampPlayers.reduce((acc, entry) => {
    const dgId = String(entry?.dgId || '').trim();
    if (!dgId) return acc;
    acc[dgId] = entry;
    return acc;
  }, {});
  const rampWindow = rampSummary?.payload?.meta?.window || {};
  const rampMaxEvents = Number.isFinite(rampWindow.maxEvents) ? rampWindow.maxEvents : 6;
  const rampBaselineSeasons = Number.isFinite(rampWindow.baselineSeasons) ? rampWindow.baselineSeasons : null;
  if (rampPlayers.length > 0) {
    console.log(`✓ Loaded player ramp summary (${rampPlayers.length} players, maxEvents=${rampMaxEvents})`);
  } else if (SHOULD_RUN_PRE_EVENT_ARTIFACTS) {
    console.log('ℹ️  Player ramp summary unavailable (no ramp file found).');
  } else {
    console.log('ℹ️  Skipping early-season ramp summary (post-tournament mode).');
  }
  if (SHOULD_RUN_PRE_EVENT_ARTIFACTS) {
    if (isSeedRunDir && parentHasRegression) {
      console.log('ℹ️  Using existing course history regression outputs from parent post_event directory.');
    } else {
      console.log('🔄 Generating course history regression inputs...');
      try {
        require('../scripts/analyze_course_history_impact');
        console.log('✓ Course history regression inputs generated.');
      } catch (error) {
        console.warn(`ℹ️  Course history regression generation skipped: ${error.message}`);
      }
    }
  } else {
    console.log('ℹ️  Skipping course history regression (post-tournament mode).');
  }

  const regressionSnapshot = SHOULD_RUN_PRE_EVENT_ARTIFACTS
    ? loadCourseHistoryRegressionMap({
        outputDir: regressionOutputDir || outputDir
      })
    : null;
  let courseContext = loadCourseContext(COURSE_CONTEXT_PATH);
  let courseContextUpdateSummary = null;
  if (courseContext && regressionSnapshot?.map) {
    const upsertResult = upsertCourseContextPastPerformanceWeights(courseContext, regressionSnapshot.map);
    courseContextUpdateSummary = {
      source: regressionSnapshot.source || null,
      path: regressionSnapshot.path || null,
      updated: upsertResult.updated,
      updatedCount: upsertResult.updates.length,
      updates: upsertResult.updates
    };
    if (upsertResult.updated) {
      writeJsonFile(COURSE_CONTEXT_PATH, courseContext);
      console.log(`✓ Updated course_context past performance weights (${upsertResult.updates.length} entries, source=${regressionSnapshot.source}).`);
    } else {
      console.log('ℹ️  Course history regression loaded; no course_context updates needed.');
    }
  } else if (!courseContext) {
    courseContextUpdateSummary = {
      source: regressionSnapshot?.source || null,
      path: regressionSnapshot?.path || null,
      updated: false,
      updatedCount: 0,
      updates: [],
      reason: 'course_context_missing'
    };
    console.warn('ℹ️  Course context not available for regression upsert.');
  } else if (!regressionSnapshot?.map) {
    courseContextUpdateSummary = {
      source: regressionSnapshot?.source || null,
      path: regressionSnapshot?.path || null,
      updated: false,
      updatedCount: 0,
      updates: [],
      reason: 'regression_unavailable'
    };
    if (SHOULD_RUN_PRE_EVENT_ARTIFACTS) {
      console.warn('ℹ️  Course history regression unavailable; skipping course_context upsert.');
    }
  }

  console.log('\n🔄 Loading configuration...');
  if (!courseContext) {
    courseContext = loadCourseContext(COURSE_CONTEXT_PATH);
  }
  const courseContextEntry = resolveCourseContextEntry(courseContext, {
    eventId: CURRENT_EVENT_ID
  });
  // NOTE: We do not rely on configuration-sheet CSVs going forward.
  // `course_context.json.sourcePath` is treated as metadata only unless explicitly enabled.
  const allowCourseContextSourcePath = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ALLOW_COURSE_CONTEXT_SOURCEPATH || '').trim().toLowerCase()
  );
  if (
    allowCourseContextSourcePath
    && courseContextEntry?.sourcePath
    && fs.existsSync(courseContextEntry.sourcePath)
  ) {
    CONFIG_PATH = courseContextEntry.sourcePath;
    requiredFiles[0].path = CONFIG_PATH;
    console.log(`ℹ️  Using course-context configuration sheet (ALLOW_COURSE_CONTEXT_SOURCEPATH): ${path.basename(CONFIG_PATH)}`);
  }

  let sharedConfig = null;
  if (CONFIG_PATH && fs.existsSync(CONFIG_PATH)) {
    sharedConfig = getSharedConfig(CONFIG_PATH);
  } else if (courseContextEntry) {
    sharedConfig = buildSharedConfigFromCourseContext(courseContextEntry, CURRENT_EVENT_ID);
    console.log('ℹ️  Configuration sheet missing; using course_context.json defaults.');
  }
  if (!sharedConfig) {
    console.error('\n❌ Configuration unavailable (missing Configuration Sheet and course_context entry).');
    process.exit(1);
  }
  console.log('✓ Configuration loaded');
  const courseContextEntryWithCourse = courseContextEntry || resolveCourseContextEntry(courseContext, {
    eventId: CURRENT_EVENT_ID,
    courseNum: sharedConfig.courseNum
  });
  const courseContextEntryFinal = courseContextEntryWithCourse;
  if (courseContextEntry && applyCourseContextOverrides(sharedConfig, courseContextEntry)) {
    console.log(`✓ Applied course context overrides (${courseContextEntry.source})`);
  } else if (courseContextEntryWithCourse && applyCourseContextOverrides(sharedConfig, courseContextEntryWithCourse)) {
    console.log(`✓ Applied course context overrides (${courseContextEntryWithCourse.source})`);
  }
  const pastPerformanceCourseNum = courseContextEntryFinal?.courseNum
    || sharedConfig.courseNum
    || null;
  const pastPerformanceRegressionEntry = regressionSnapshot?.map && pastPerformanceCourseNum
    ? regressionSnapshot.map[String(pastPerformanceCourseNum).trim()]
    : null;
  const pastPerformanceComputedWeight = computePastPerformanceWeightFromRegression(pastPerformanceRegressionEntry);
  const pastPerformanceWeightSummary = {
    enabled: !!sharedConfig.pastPerformanceEnabled,
    courseNum: pastPerformanceCourseNum,
    computedWeight: pastPerformanceComputedWeight,
    usedWeight: typeof sharedConfig.pastPerformanceWeight === 'number' ? sharedConfig.pastPerformanceWeight : null,
    regression: pastPerformanceRegressionEntry
      ? {
          slope: pastPerformanceRegressionEntry.slope,
          pValue: pastPerformanceRegressionEntry.pValue
        }
      : null,
    source: regressionSnapshot?.source || null,
    path: regressionSnapshot?.path || null,
    courseContextUpdated: courseContextUpdateSummary?.updated || false,
    playerRamp: {
      weight: PAST_PERF_RAMP_WEIGHT,
      sourcePath: rampSummary?.path || null,
      players: rampPlayers.length,
      maxEvents: rampMaxEvents,
      baselineSeasons: rampBaselineSeasons
    }
  };
  const resolvedSeason = parseInt(sharedConfig.currentSeason || sharedConfig.currentYear || CURRENT_SEASON);
  const effectiveSeason = Number.isNaN(resolvedSeason) ? CURRENT_SEASON : resolvedSeason;

  const historicalYear = (() => {
    const parsed = parseInt(DATAGOLF_HISTORICAL_YEAR_RAW, 10);
    return Number.isNaN(parsed) ? effectiveSeason : parsed;
  })();
  let courseTemplateKey = null;

  const currentEventRoundsPolicy = INCLUDE_CURRENT_EVENT_ROUNDS === null
    ? 'default'
    : (INCLUDE_CURRENT_EVENT_ROUNDS ? 'include' : 'exclude');
  console.log(`ℹ️  Current-event rounds policy: ${currentEventRoundsPolicy}`);
  console.log(`   Defaults: metrics=${currentEventRoundsDefaults.currentSeasonMetrics ? 'include' : 'exclude'}, baseline=${currentEventRoundsDefaults.currentSeasonBaseline ? 'include' : 'exclude'}, optimization=${currentEventRoundsDefaults.currentSeasonOptimization ? 'include' : 'exclude'}, historical=${currentEventRoundsDefaults.historicalEvaluation ? 'include' : 'exclude'}`);
  
  // Load base metricConfig structure
  console.log('🔄 Building metric config...');
  const baseMetricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: CURRENT_EVENT_ID
  });
  console.log('✓ Metric config built');
  
  // Load templates
  const templateConfigs = {};
  
  console.log('\n--- LOADING ALL AVAILABLE TEMPLATES ---');
  Object.entries(WEIGHT_TEMPLATES).forEach(([templateName, template]) => {
    if (!template) return;
    const normalized = normalizeTemplateWeights(template, baseMetricConfig);
    templateConfigs[templateName] = normalized;
    console.log(`✓ Loaded ${templateName} template`);
  });

  if (TEMPLATE) {
    if (!templateConfigs[TEMPLATE]) {
      console.error(`\n❌ Template not found or not available for event ${CURRENT_EVENT_ID}: ${TEMPLATE}`);
      console.error(`   Available: ${Object.keys(templateConfigs).join(', ') || 'none'}`);
      process.exit(1);
    }
    Object.keys(templateConfigs).forEach(name => {
      if (name !== TEMPLATE) delete templateConfigs[name];
    });
    console.log(`✓ Using template override: ${TEMPLATE}`);
  }

  if (!templateConfigs[CURRENT_EVENT_ID]) {
    // Prefer course_context-derived defaults rather than zeroed baseMetricConfig weights.
    const templateKeyRaw = courseContextEntry?.templateKey || courseContextEntry?.courseType || null;
    const templateKey = templateKeyRaw ? String(templateKeyRaw).trim() : null;
    const fallbackTemplateKey = templateKey && templateConfigs[templateKey]
      ? templateKey
      : (templateConfigs.BALANCED ? 'BALANCED' : (templateConfigs.POWER ? 'POWER' : (templateConfigs.TECHNICAL ? 'TECHNICAL' : null)));

    if (fallbackTemplateKey) {
      templateConfigs[CURRENT_EVENT_ID] = {
        groupWeights: { ...templateConfigs[fallbackTemplateKey].groupWeights },
        metricWeights: { ...templateConfigs[fallbackTemplateKey].metricWeights }
      };
      console.log(`✓ Loaded event-specific weights (eventId: ${CURRENT_EVENT_ID}) from template: ${fallbackTemplateKey}`);
    } else {
      const groupWeights = {};
      const metricWeights = {};
      baseMetricConfig.groups.forEach(group => {
        groupWeights[group.name] = group.weight;
        group.metrics.forEach(metric => {
          metricWeights[`${group.name}::${metric.name}`] = metric.weight;
        });
      });
      templateConfigs[CURRENT_EVENT_ID] = { groupWeights, metricWeights };
      console.warn(`⚠️  Loaded event-specific weights (eventId: ${CURRENT_EVENT_ID}) from base metric config (no templateKey/courseType found in course_context).`);
    }
  }

  const metricConfig = baseMetricConfig;

  let validationData = loadValidationOutputs(metricConfig, [
    validationOutputsDir,
    path.resolve(DATA_ROOT_DIR, 'validation_outputs'),
    ...VALIDATION_OUTPUT_DIRS,
    DATA_DIR,
    DEFAULT_DATA_DIR
  ]);
  const skipValidationOutputs = ['1', 'true', 'yes'].includes(String(process.env.SKIP_VALIDATION_OUTPUTS || '').trim().toLowerCase());
  if (!validationData?.weightTemplatesPath || !validationData?.deltaTrendsPath) {
    const missing = [];
    if (!validationData?.weightTemplatesPath) missing.push('validation weight templates CSV');
    if (!validationData?.deltaTrendsPath) missing.push('validation delta trends CSV');
    if (!skipValidationOutputs) {
      console.error('\n❌ Validation outputs missing:');
      missing.forEach(item => console.error(`   - ${item}`));
      console.error('\nThis optimizer run requires the Algo Validation outputs (weight templates + delta trends).');
      console.error('Run the GAS validation workflow first, then place the resulting CSVs in:');
      console.error(`   - ${validationOutputsDir}`);
      console.error(`   - ${path.resolve(DATA_ROOT_DIR, 'validation_outputs')}`);
      console.error(`   - ${DATA_DIR}`);
      console.error(`   - ${DEFAULT_DATA_DIR}`);
      console.error('\nFix: re-run validation and copy the CSVs into one of those folders, or update filenames in optimizer.js.');
      process.exit(1);
    }
    console.warn('\n⚠️  Validation outputs missing, but SKIP_VALIDATION_OUTPUTS is enabled. Proceeding without validation priors.');
  }

  const validationDataSafe = validationData || {
    courseType: null,
    weightTemplates: { POWER: [], TECHNICAL: [], BALANCED: [] },
    typeSummaries: { POWER: [], TECHNICAL: [], BALANCED: [] },
    deltaTrends: [],
    deltaTrendsPath: null,
    weightTemplatesPath: null
  };
  validationData = validationDataSafe;

  let rankingsSnapshot = { source: 'csv_primary', path: null, payload: null };
  const SHOULD_REFRESH_YTD = FORCE_RUN_MODE === 'pre' || (!FORCE_RUN_MODE && !POST_TOURNAMENT_HINT);
  if (shouldFetchApi) {
    rankingsSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      rankingsSnapshot = await getDataGolfRankings({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: DATAGOLF_CACHE_DIR,
        ttlMs: DATAGOLF_RANKINGS_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true
      });

      if (rankingsSnapshot?.payload?.last_updated) {
        console.log(`✓ DataGolf rankings loaded (${rankingsSnapshot.source}, updated ${rankingsSnapshot.payload.last_updated})`);
      } else if (rankingsSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf rankings skipped (DATAGOLF_API_KEY not set).');
      } else if (rankingsSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf rankings using stale cache (API unavailable).');
      } else if (!rankingsSnapshot.payload) {
        console.warn('ℹ️  DataGolf rankings unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf rankings fetch failed: ${error.message}`);
    }
  }

  let approachSkillSnapshot = { source: 'csv_primary', path: null, payload: null };
  if (shouldFetchApi) {
    approachSkillSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      approachSkillSnapshot = await getDataGolfApproachSkill({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: null,
        ttlMs: DATAGOLF_APPROACH_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true,
        period: DATAGOLF_APPROACH_PERIOD,
        fileFormat: 'json'
      });

      if (approachSkillSnapshot?.payload?.last_updated) {
        const timePeriod = approachSkillSnapshot.payload.time_period || DATAGOLF_APPROACH_PERIOD;
        console.log(`✓ DataGolf approach skill loaded (${approachSkillSnapshot.source}, ${timePeriod}, updated ${approachSkillSnapshot.payload.last_updated})`);
      } else if (approachSkillSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf approach skill skipped (DATAGOLF_API_KEY not set).');
      } else if (approachSkillSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf approach skill using stale cache (API unavailable).');
      } else if (!approachSkillSnapshot.payload) {
        console.warn('ℹ️  DataGolf approach skill unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf approach skill fetch failed: ${error.message}`);
    }
  }

  ensureDirectory(APPROACH_SNAPSHOT_DIR);
  let approachSnapshotL24 = { source: 'csv_primary', path: APPROACH_SNAPSHOT_L24_PATH, payload: null };
  let approachSnapshotL12 = { source: 'csv_primary', path: APPROACH_SNAPSHOT_L12_PATH, payload: null };
  let approachSnapshotYtd = { source: 'csv_primary', path: APPROACH_SNAPSHOT_YTD_LATEST_PATH, payload: null };

  if (shouldFetchApi) {
    approachSnapshotL24 = { source: 'unavailable', path: APPROACH_SNAPSHOT_L24_PATH, payload: null };
    approachSnapshotL12 = { source: 'unavailable', path: APPROACH_SNAPSHOT_L12_PATH, payload: null };
    approachSnapshotYtd = { source: 'unavailable', path: APPROACH_SNAPSHOT_YTD_LATEST_PATH, payload: null };

    try {
      approachSnapshotL24 = await getOrCreateApproachSnapshot({
        period: 'l24',
        snapshotPath: APPROACH_SNAPSHOT_L24_PATH,
        apiKey: DATAGOLF_API_KEY,
        cacheDir: null,
        ttlMs: DATAGOLF_APPROACH_TTL_HOURS * 60 * 60 * 1000,
        isPostTournament: POST_TOURNAMENT_HINT
      });
      if (approachSnapshotL24?.payload?.last_updated) {
        console.log(`✓ Approach snapshot l24 ready (${approachSnapshotL24.source}, updated ${approachSnapshotL24.payload.last_updated})`);
      }
    } catch (error) {
      console.warn(`ℹ️  Approach snapshot l24 fetch failed: ${error.message}`);
    }

    try {
      approachSnapshotL12 = await getOrCreateApproachSnapshot({
        period: 'l12',
        snapshotPath: APPROACH_SNAPSHOT_L12_PATH,
        apiKey: DATAGOLF_API_KEY,
        cacheDir: null,
        ttlMs: DATAGOLF_APPROACH_TTL_HOURS * 60 * 60 * 1000,
        season: CURRENT_SEASON,
        eventId: CURRENT_EVENT_ID,
        isPostTournament: POST_TOURNAMENT_HINT
      });
      if (approachSnapshotL12?.payload?.last_updated) {
        console.log(`✓ Approach snapshot l12 ready (${approachSnapshotL12.source}, updated ${approachSnapshotL12.payload.last_updated})`);
      }
    } catch (error) {
      console.warn(`ℹ️  Approach snapshot l12 fetch failed: ${error.message}`);
    }

    if (SHOULD_REFRESH_YTD) {
      try {
        approachSnapshotYtd = await refreshYtdApproachSnapshot({
          apiKey: DATAGOLF_API_KEY,
          cacheDir: null,
          ttlMs: DATAGOLF_APPROACH_TTL_HOURS * 60 * 60 * 1000
        });
        if (approachSnapshotYtd?.payload?.last_updated) {
          console.log(`✓ Approach snapshot ytd ready (${approachSnapshotYtd.source}, updated ${approachSnapshotYtd.payload.last_updated})`);
        }
      } catch (error) {
        console.warn(`ℹ️  Approach snapshot ytd fetch failed: ${error.message}`);
      }
    } else {
      console.log('ℹ️  Skipping YTD approach snapshot refresh (post-tournament run).');
    }
  }
  let fieldUpdatesSnapshot = { source: 'csv_primary', path: null, payload: null };
  if (shouldFetchApi) {
    fieldUpdatesSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      fieldUpdatesSnapshot = await getDataGolfFieldUpdates({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: DATAGOLF_CACHE_DIR,
        ttlMs: DATAGOLF_FIELD_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true,
        tour: DATAGOLF_FIELD_TOUR,
        fileFormat: 'json'
      });

      if (fieldUpdatesSnapshot?.payload?.event_name) {
        console.log(`✓ DataGolf field updates loaded (${fieldUpdatesSnapshot.source}, ${fieldUpdatesSnapshot.payload.event_name})`);
      } else if (fieldUpdatesSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf field updates skipped (DATAGOLF_API_KEY not set).');
      } else if (fieldUpdatesSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf field updates using stale cache (API unavailable).');
      } else if (!fieldUpdatesSnapshot.payload) {
        console.warn('ℹ️  DataGolf field updates unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf field updates fetch failed: ${error.message}`);
    }
  }

  let playerDecompositionsSnapshot = { source: 'csv_primary', path: null, payload: null };
  if (shouldFetchOptionalApi) {
    playerDecompositionsSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      playerDecompositionsSnapshot = await getDataGolfPlayerDecompositions({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: DATAGOLF_CACHE_DIR,
        ttlMs: DATAGOLF_DECOMP_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true,
        tour: DATAGOLF_DECOMP_TOUR,
        fileFormat: 'json'
      });

      if (playerDecompositionsSnapshot?.payload?.last_updated) {
        console.log(`✓ DataGolf player decompositions loaded (${playerDecompositionsSnapshot.source}, updated ${playerDecompositionsSnapshot.payload.last_updated})`);
      } else if (playerDecompositionsSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf player decompositions skipped (DATAGOLF_API_KEY not set).');
      } else if (playerDecompositionsSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf player decompositions using stale cache (API unavailable).');
      } else if (!playerDecompositionsSnapshot.payload) {
        console.warn('ℹ️  DataGolf player decompositions unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf player decompositions fetch failed: ${error.message}`);
    }
  }

  let skillRatingsValueSnapshot = { source: 'csv_primary', path: null, payload: null };
  if (shouldFetchOptionalApi) {
    skillRatingsValueSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      skillRatingsValueSnapshot = await getDataGolfSkillRatings({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: DATAGOLF_CACHE_DIR,
        ttlMs: DATAGOLF_SKILL_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true,
        display: DATAGOLF_SKILL_DISPLAY_VALUE,
        fileFormat: 'json'
      });

      if (skillRatingsValueSnapshot?.payload?.last_updated) {
        console.log(`✓ DataGolf skill ratings loaded (${skillRatingsValueSnapshot.source}, display ${DATAGOLF_SKILL_DISPLAY_VALUE}, updated ${skillRatingsValueSnapshot.payload.last_updated})`);
      } else if (skillRatingsValueSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf skill ratings skipped (DATAGOLF_API_KEY not set).');
      } else if (skillRatingsValueSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf skill ratings using stale cache (API unavailable).');
      } else if (!skillRatingsValueSnapshot.payload) {
        console.warn('ℹ️  DataGolf skill ratings unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf skill ratings fetch failed: ${error.message}`);
    }
  }

  let skillRatingsRankSnapshot = { source: 'csv_primary', path: null, payload: null };
  if (shouldFetchOptionalApi) {
    skillRatingsRankSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      skillRatingsRankSnapshot = await getDataGolfSkillRatings({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: DATAGOLF_CACHE_DIR,
        ttlMs: DATAGOLF_SKILL_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true,
        display: DATAGOLF_SKILL_DISPLAY_RANK,
        fileFormat: 'json'
      });

      if (skillRatingsRankSnapshot?.payload?.last_updated) {
        console.log(`✓ DataGolf skill ratings loaded (${skillRatingsRankSnapshot.source}, display ${DATAGOLF_SKILL_DISPLAY_RANK}, updated ${skillRatingsRankSnapshot.payload.last_updated})`);
      } else if (skillRatingsRankSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf skill ratings skipped (DATAGOLF_API_KEY not set).');
      } else if (skillRatingsRankSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf skill ratings using stale cache (API unavailable).');
      } else if (!skillRatingsRankSnapshot.payload) {
        console.warn('ℹ️  DataGolf skill ratings unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf skill ratings (rank) fetch failed: ${error.message}`);
    }
  }

  let historicalRoundsSnapshot = { source: 'csv_primary', path: null, payload: null };
  if (shouldFetchApi) {
    historicalRoundsSnapshot = { source: 'unavailable', path: null, payload: null };
    try {
      historicalRoundsSnapshot = await getDataGolfHistoricalRounds({
        apiKey: DATAGOLF_API_KEY,
        cacheDir: DATAGOLF_CACHE_DIR,
        ttlMs: DATAGOLF_HISTORICAL_TTL_HOURS * 60 * 60 * 1000,
        allowStale: true,
        tour: DATAGOLF_HISTORICAL_TOUR,
        eventId: DATAGOLF_HISTORICAL_EVENT_ID,
        year: historicalYear,
        fileFormat: 'json'
      });

      if (historicalRoundsSnapshot?.payload) {
        console.log(`✓ DataGolf historical rounds loaded (${historicalRoundsSnapshot.source}, ${DATAGOLF_HISTORICAL_TOUR} ${historicalYear})`);
      } else if (historicalRoundsSnapshot.source === 'missing-key') {
        console.warn('ℹ️  DataGolf historical rounds skipped (DATAGOLF_API_KEY not set).');
      } else if (historicalRoundsSnapshot.source === 'missing-year') {
        console.warn('ℹ️  DataGolf historical rounds skipped (year not set).');
      } else if (historicalRoundsSnapshot.source === 'cache-stale') {
        console.warn('ℹ️  DataGolf historical rounds using stale cache (API unavailable).');
      } else if (!historicalRoundsSnapshot.payload) {
        console.warn('ℹ️  DataGolf historical rounds unavailable (no cache + API failed).');
      }
    } catch (error) {
      console.warn(`ℹ️  DataGolf historical rounds fetch failed: ${error.message}`);
    }
  }
  const applyValidationOutputs = ['1', 'true', 'yes'].includes(
    String(process.env.APPLY_VALIDATION_OUTPUTS || '').trim().toLowerCase()
  );
  let validationCourseType = validationData.courseType;
  let validationTemplateConfig = null;
  let validationMetricConstraints = null;
  let validationAlignmentMap = new Map();
  let deltaTrendAlignmentMap = new Map();
  let deltaTrends = [];
  let deltaTrendSummary = null;
  let validationGroupWeights = null;
  let validationMetricWeights = null;
  let validationTemplateName = null;

  if (validationCourseType) {
    if (!applyValidationOutputs) {
      console.log('ℹ️  Validation outputs loaded for reporting only (no template/constraint influence).');
    } else {
      const validationWeightsForType = validationData.weightTemplates[validationCourseType] || [];
      const validationSummaryForType = validationData.typeSummaries[validationCourseType] || [];
      const fallbackValidationTemplate = templateConfigs[validationCourseType]
        || templateConfigs[CURRENT_EVENT_ID]
        || Object.values(templateConfigs)[0];
      validationGroupWeights = buildValidationGroupWeights(metricConfig, validationSummaryForType, fallbackValidationTemplate?.groupWeights || {});
      validationMetricWeights = buildValidationMetricWeights(metricConfig, validationWeightsForType, fallbackValidationTemplate?.metricWeights || {});
      validationMetricConstraints = buildValidationMetricConstraints(metricConfig, validationWeightsForType, VALIDATION_RANGE_PCT);
      validationAlignmentMap = buildValidationAlignmentMap(metricConfig, validationSummaryForType);
      deltaTrends = validationData.deltaTrends || [];
      deltaTrendAlignmentMap = buildDeltaTrendMap(metricConfig, deltaTrends);
      if (deltaTrends.length > 0) {
        validationMetricConstraints = adjustConstraintsByDeltaTrends(metricConfig, validationMetricConstraints, deltaTrends);
        deltaTrendSummary = summarizeDeltaTrendGuardrails(metricConfig, validationMetricConstraints, deltaTrends);
        console.log(`✓ Applied delta trend guardrails (${deltaTrends.length} metrics)`);
      }
      validationTemplateConfig = {
        groupWeights: validationGroupWeights || fallbackValidationTemplate?.groupWeights || {},
        metricWeights: validationMetricWeights || fallbackValidationTemplate?.metricWeights || {}
      };
      validationTemplateName = `VALIDATION_${validationCourseType}`;
      templateConfigs[validationTemplateName] = validationTemplateConfig;
      console.log(`✓ Loaded validation template: ${validationTemplateName}`);
    }
  }

  const resolvedTestsForFingerprint = (() => {
    const parsedTests = parseInt(OPT_TESTS_RAW, 10);
    if (!Number.isNaN(parsedTests)) return parsedTests;
    return typeof MAX_TESTS_OVERRIDE === 'number' ? MAX_TESTS_OVERRIDE : null;
  })();
  const runFingerprint = buildRunFingerprint({
    eventId: CURRENT_EVENT_ID,
    season: effectiveSeason,
    tournament: TOURNAMENT_NAME || tournamentNameFallback,
    optSeed: OPT_SEED_RAW,
    tests: resolvedTestsForFingerprint,
    dryRun: DRY_RUN,
    includeCurrentEventRounds: INCLUDE_CURRENT_EVENT_ROUNDS,
    templateOverride: TEMPLATE,
    filePaths: [
      { label: 'configurationSheet', path: CONFIG_PATH },
      { label: 'tournamentField', path: FIELD_PATH },
      { label: 'historicalData', path: HISTORY_PATH },
      { label: 'approachSkill', path: APPROACH_PATH },
      { label: APPROACH_DELTA_PRIOR_LABEL, path: APPROACH_DELTA_PATH },
      { label: 'weightTemplatesJs', path: path.resolve(ROOT_DIR, 'utilities', 'weightTemplates.js') }
    ],
    validationPaths: [
      { label: 'validationWeightTemplates', path: validationData?.weightTemplatesPath || null },
      { label: 'validationDeltaTrends', path: validationData?.deltaTrendsPath || null }
    ]
  });

  console.log('\n🔄 Loading data...');
  const fieldCsvRows = fs.existsSync(FIELD_PATH)
    ? loadCsv(FIELD_PATH, { skipFirstColumn: true })
    : [];
  const fieldApiRows = fieldCsvRows.length === 0
    ? extractFieldRowsFromSnapshotPayload(fieldUpdatesSnapshot?.payload)
        .map(normalizeFieldRow)
        .filter(Boolean)
    : [];
  const fieldDataRaw = fieldCsvRows.length > 0 ? fieldCsvRows : fieldApiRows;
  const fieldData = fieldDataRaw.filter(row => {
    const dgId = row && (row['dg_id'] || row.dg_id || row.dgId || row['DG ID']);
    return String(dgId || '').trim().length > 0;
  });
  if (fieldCsvRows.length > 0) {
    console.log(`✓ Loaded field (CSV): ${fieldData.length} players`);
  } else if (fieldApiRows.length > 0) {
    console.log(`✓ Loaded field (API fallback): ${fieldData.length} players`);
  } else {
    console.error('❌ Unable to load tournament field (CSV missing and API fallback empty).');
    process.exit(1);
  }
  const fieldIdSetForDelta = new Set(
    fieldData
      .map(row => String(row?.['dg_id'] || '').trim())
      .filter(Boolean)
  );
  const countApproachRowsInField = rows => (rows || []).reduce((count, row) => {
    const dgId = String(row?.dg_id || row?.['dg_id'] || '').trim();
    if (!dgId) return count;
    return fieldIdSetForDelta.has(dgId) ? count + 1 : count;
  }, 0);
  

  // Use robust, merged-source loader for historical rounds
  const lastFiveYears = buildRecentYears(effectiveSeason, 5);
  // Dynamically determine tours from course context (event-specific or default)
  const context = loadCourseContext(COURSE_CONTEXT_PATH);
  const contextEntry = resolveCourseContextEntry(context, CURRENT_EVENT_ID);
  // Robustly determine tours: check event, then course, then default
  let tours = [];
  if (contextEntry && Array.isArray(contextEntry.tours) && contextEntry.tours.length > 0) {
    tours = contextEntry.tours.map(t => t.toLowerCase());
  } else if (contextEntry && contextEntry.courseNum && context.byCourseNum && context.byCourseNum[contextEntry.courseNum] && Array.isArray(context.byCourseNum[contextEntry.courseNum].tours) && context.byCourseNum[contextEntry.courseNum].tours.length > 0) {
    tours = context.byCourseNum[contextEntry.courseNum].tours.map(t => t.toLowerCase());
  } else if (Array.isArray(context.defaultTours) && context.defaultTours.length > 0) {
    tours = context.defaultTours.map(t => t.toLowerCase());
  } else {
    tours = ['pga'];
  }
  let historyData = await collectRecords({
    years: lastFiveYears,
    tours,
    dataDir: DATA_DIR || DATA_ROOT_DIR,
    datagolfApiKey: DATAGOLF_API_KEY,
    datagolfCacheDir: DATAGOLF_CACHE_DIR,
    datagolfHistoricalTtlMs: DATAGOLF_HISTORICAL_TTL_HOURS * 60 * 60 * 1000,
    getDataGolfHistoricalRounds
  });
  historyData = extractHistoricalRowsFromSnapshotPayload(historyData);
  if (!historyData || historyData.length === 0) {
    console.error('❌ Unable to load historical rounds (no data found in JSON, CSV, or API).');
    process.exit(1);
  }
  console.log(`✓ Loaded history (robust merged-source): ${historyData.length} rounds`);

  const eventIdStr = String(CURRENT_EVENT_ID);
  const seasonStr = String(effectiveSeason);
  let historyEventCount = historyData.filter(row => String(row['event_id'] || '').trim() === eventIdStr).length;
  let historyEventSeasonCount = historyData.filter(row => {
    const eventMatch = String(row['event_id'] || '').trim() === eventIdStr;
    if (!eventMatch) return false;
    const seasonValue = String(row['season'] || row['year'] || '').trim();
    return seasonValue === seasonStr;
  }).length;

  if (POST_TOURNAMENT_HINT && historyEventSeasonCount === 0) {
    try {
      const fetchCachedRows = async eventIdValue => {
        const cachedSnapshot = await getDataGolfHistoricalRounds({
          apiKey: DATAGOLF_API_KEY,
          cacheDir: DATAGOLF_CACHE_DIR,
          ttlMs: DATAGOLF_HISTORICAL_TTL_HOURS * 60 * 60 * 1000,
          allowStale: true,
          tour: DATAGOLF_HISTORICAL_TOUR,
          eventId: eventIdValue,
          year: effectiveSeason,
          fileFormat: 'json'
        });

        return extractHistoricalRowsFromSnapshotPayload(cachedSnapshot?.payload)
          .map(normalizeHistoricalRoundRow)
          .filter(Boolean)
          .filter(row => String(row['event_id'] || '').trim() === eventIdStr);
      };

      let cachedRows = await fetchCachedRows(CURRENT_EVENT_ID);
      if (cachedRows.length === 0) {
        cachedRows = await fetchCachedRows('all');
      }

      if (cachedRows.length > 0) {
        const existingKeys = new Set(
          historyData.map(row => [
            String(row['dg_id'] || '').trim(),
            String(row['event_id'] || '').trim(),
            String(row['year'] || row['season'] || '').trim(),
            String(row['round_num'] || row['round'] || '').trim()
          ].join('|'))
        );

        cachedRows.forEach(row => {
          const key = [
            String(row['dg_id'] || '').trim(),
            String(row['event_id'] || '').trim(),
            String(row['year'] || row['season'] || '').trim(),
            String(row['round_num'] || row['round'] || '').trim()
          ].join('|');
          if (!existingKeys.has(key)) {
            historyData.push(row);
            existingKeys.add(key);
          }
        });

        historyEventCount = historyData.filter(row => String(row['event_id'] || '').trim() === eventIdStr).length;
        historyEventSeasonCount = historyData.filter(row => {
          const eventMatch = String(row['event_id'] || '').trim() === eventIdStr;
          if (!eventMatch) return false;
          const seasonValue = String(row['season'] || row['year'] || '').trim();
          return seasonValue === seasonStr;
        }).length;
        console.log(`✓ Loaded ${cachedRows.length} cached rounds for event ${eventIdStr} (${seasonStr}).`);
      } else {
        console.warn(`ℹ️  Cached historical rounds missing for event ${eventIdStr} (${seasonStr}).`);
      }
    } catch (error) {
      console.warn(`ℹ️  Cached historical rounds lookup failed: ${error.message}`);
    }
  }

  console.log(`ℹ️  History rows for event ${eventIdStr}: ${historyEventCount} (season ${seasonStr}: ${historyEventSeasonCount})`);
  
  const approachCsvRows = fs.existsSync(APPROACH_PATH)
    ? loadCsv(APPROACH_PATH, { skipFirstColumn: true })
    : [];
  const approachSkillRows = approachCsvRows.length === 0
    ? extractApproachRowsFromJson(approachSkillSnapshot?.payload)
    : [];
  const approachData = approachCsvRows.length > 0 ? approachCsvRows : approachSkillRows;
  const approachSourceLabel = approachCsvRows.length > 0
    ? `CSV ${path.basename(APPROACH_PATH || 'approach.csv')}`
    : (() => {
        const period = String(approachSkillSnapshot?.payload?.time_period || DATAGOLF_APPROACH_PERIOD || '').trim().toLowerCase();
        const periodLabel = period ? `${period}` : 'unknown';
        return `DataGolf approach skill (${approachSkillSnapshot?.source || 'unknown'}, ${periodLabel})`;
      })();
  console.log(`✓ Loaded approach: ${approachData.length} rows (source: ${approachSourceLabel})`);

  const hasApproachCsv = approachCsvRows.length > 0;
  const approachSnapshotRows = hasApproachCsv
    ? { l24: [], l12: [], ytd: [] }
    : {
        l24: extractApproachRowsFromJson(approachSnapshotL24?.payload),
        l12: extractApproachRowsFromJson(approachSnapshotL12?.payload),
        ytd: extractApproachRowsFromJson(approachSnapshotYtd?.payload)
      };

  if (!hasApproachCsv && approachSkillRows.length > 0) {
    const skillPeriod = String(approachSkillSnapshot?.payload?.time_period || '').trim().toLowerCase();
    if (skillPeriod === 'l12' && approachSnapshotRows.l12.length === 0) {
      approachSnapshotRows.l12 = approachSkillRows;
    } else if (skillPeriod === 'l24' && approachSnapshotRows.l24.length === 0) {
      approachSnapshotRows.l24 = approachSkillRows;
    } else if (skillPeriod === 'ytd' && approachSnapshotRows.ytd.length === 0) {
      approachSnapshotRows.ytd = approachSkillRows;
    }
  }

  const approachDataCurrent = hasApproachCsv
    ? approachData
    : (approachSnapshotRows.ytd.length > 0 ? approachSnapshotRows.ytd : approachData);
  let approachDataCurrentSource = hasApproachCsv
    ? 'csv_primary'
    : (approachSnapshotRows.ytd.length > 0 ? 'snapshot_ytd' : 'csv_fallback');
  if (!hasApproachCsv && approachSnapshotRows.ytd.length === 0 && approachSkillRows.length > 0) {
    approachDataCurrentSource = 'api_fallback';
  }

  if (hasApproachCsv) {
    const fieldCount = countApproachRowsInField(approachData);
    console.log(`✓ Using approach CSV as primary for current season (${approachData.length} rows, field overlap ${fieldCount}/${fieldIdSetForDelta.size || 'n/a'})`);
  } else if (approachSnapshotRows.ytd.length > 0) {
    const fieldCount = countApproachRowsInField(approachSnapshotRows.ytd);
    const ytdLabel = approachSnapshotYtd?.path ? path.basename(approachSnapshotYtd.path) : 'approach_ytd_latest.json';
    console.log(`✓ Using YTD approach snapshot for current season (${approachSnapshotRows.ytd.length} rows, file: ${ytdLabel}, field overlap ${fieldCount}/${fieldIdSetForDelta.size || 'n/a'})`);
  } else if (approachSkillRows.length > 0) {
    const fieldCount = countApproachRowsInField(approachSkillRows);
    const skillPeriod = String(approachSkillSnapshot?.payload?.time_period || DATAGOLF_APPROACH_PERIOD || '').trim().toLowerCase() || 'unknown';
    console.log(`✓ Using approach skill snapshot as fallback for current season (${approachSkillRows.length} rows, period: ${skillPeriod}, field overlap ${fieldCount}/${fieldIdSetForDelta.size || 'n/a'})`);
  } else {
    console.log('ℹ️  Approach data unavailable (no CSV or snapshots).');
  }

  const resolveApproachUsageForYear = year => {
    const meta = {
      year: year,
      mode: VALIDATION_APPROACH_MODE,
      period: 'none',
      source: 'none',
      leakageFlag: 'none'
    };

    if (VALIDATION_APPROACH_MODE === 'none') {
      return { rows: [], meta };
    }

    const yearValue = parseInt(String(year || '').trim(), 10);
    if (Number.isNaN(yearValue)) {
      return { rows: [], meta };
    }

    const diff = effectiveSeason - yearValue;
    if (diff === 0) {
      if (approachDataCurrent.length > 0) {
        meta.period = 'ytd';
        meta.source = approachDataCurrentSource;
        meta.leakageFlag = approachDataCurrentSource === 'snapshot_ytd' ? 'as_of_date' : 'approximation';
        return { rows: approachDataCurrent, meta };
      }
      return { rows: [], meta };
    }

    if (diff === 1) {
      if (approachSnapshotRows.l12.length > 0) {
        meta.period = 'l12';
        meta.source = 'snapshot_l12';
        meta.leakageFlag = 'approximation';
        return { rows: approachSnapshotRows.l12, meta };
      }
      if (approachSnapshotRows.l24.length > 0) {
        meta.period = 'l24';
        meta.source = 'snapshot_l24';
        meta.leakageFlag = 'approximation';
        return { rows: approachSnapshotRows.l24, meta };
      }
      return { rows: [], meta };
    }

    if (diff >= 2 && diff <= 4) {
      if (approachSnapshotRows.l24.length > 0) {
        meta.period = 'l24';
        meta.source = 'snapshot_l24';
        meta.leakageFlag = 'approximation';
        return { rows: approachSnapshotRows.l24, meta };
      }
      return { rows: [], meta };
    }

    return { rows: [], meta };
  };

  const fallbackTemplateKey = normalizeTemplateKey(TOURNAMENT_NAME) || `EVENT_${CURRENT_EVENT_ID}`;
  const fieldCourseName = fieldData.find(row => row && (row.course_name || row.course))?.course_name
    || fieldData.find(row => row && (row.course_name || row.course))?.course
    || null;
  const historyCourseName = historyData.find(row => {
    const eventId = String(row['event_id'] || '').trim();
    if (eventId !== String(CURRENT_EVENT_ID)) return false;
    const season = parseInt(String(row['season'] || row['year'] || '').trim());
    if (Number.isNaN(season)) return false;
    return String(season) === String(effectiveSeason) && row['course_name'];
  })?.course_name || null;

  courseTemplateKey = sharedConfig.courseNameKey
    || normalizeTemplateKey(fieldCourseName)
    || normalizeTemplateKey(historyCourseName)
    || fallbackTemplateKey;

  const fieldNameLookup = fieldData.reduce((acc, row) => {
    const dgId = String(row['dg_id'] || '').trim();
    if (!dgId) return acc;
    const playerName = String(row['player_name'] || '').trim();
    if (playerName) acc[dgId] = playerName;
    return acc;
  }, {});
  let resultsCurrent = deriveResultsFromHistory(historyData, CURRENT_EVENT_ID, effectiveSeason, fieldNameLookup);
  console.log(`ℹ️  Derived ${resultsCurrent.length} results from historical data.`);

  if (resultsCurrent.length === 0) {
    const postEventResultsDir = postEventOutputDir || (tournamentDir ? path.resolve(tournamentDir, 'post_event') : null);
    const fallbackResultsDir = postEventResultsDir && path.basename(postEventResultsDir) === 'seed_runs'
      ? path.dirname(postEventResultsDir)
      : null;
    const resultsSlug = normalizeTournamentSlug(TOURNAMENT_NAME || tournamentNameFallback);
    const resultsJsonPath =
      findPostEventResultsFile(postEventResultsDir, resultsSlug, 'json', ['_zscores', '_formatting'])
      || findPostEventResultsFile(fallbackResultsDir, resultsSlug, 'json', ['_zscores', '_formatting']);
    if (resultsJsonPath) {
      const jsonLoad = loadResultsFromJsonFile(resultsJsonPath, {
        eventId: CURRENT_EVENT_ID,
        season: effectiveSeason
      });
      if (jsonLoad.results.length > 0) {
        resultsCurrent = jsonLoad.results;
        console.log(`✓ Loaded ${resultsCurrent.length} results from JSON: ${path.basename(resultsJsonPath)}`);
      }
    }

    if (resultsCurrent.length === 0) {
      const resultsCsvPath =
        findPostEventResultsFile(postEventResultsDir, resultsSlug, 'csv', ['_zscores', '_formatting'])
        || findPostEventResultsFile(fallbackResultsDir, resultsSlug, 'csv', ['_zscores', '_formatting']);
      if (resultsCsvPath && fs.existsSync(resultsCsvPath)) {
        const resultsRows = loadCsv(resultsCsvPath, { skipFirstColumn: true });
        const resultsFromCsv = buildResultsFromResultRows(resultsRows);
        if (resultsFromCsv.length > 0) {
          resultsCurrent = resultsFromCsv;
          console.log(`✓ Loaded ${resultsCurrent.length} results from CSV: ${path.basename(resultsCsvPath)}`);
        }
      }
    }
  }

  if (FORCE_RUN_MODE === 'pre') {
    resultsCurrent = [];
    console.log('ℹ️  Pre-tournament override active: ignoring results for mode selection.');
  }

  const HAS_CURRENT_RESULTS = resultsCurrent.length > 0;
  if (FORCE_RUN_MODE === 'post' && !HAS_CURRENT_RESULTS) {
    console.error('\n❌ Forced post-tournament mode but no results were found for the current season/event.');
    process.exit(1);
  }
  if (!HAS_CURRENT_RESULTS) {
    console.warn('\n⚠️  No results found for the current season/event.');
    console.warn('   Falling back to historical + similar-course outcomes for supervised metric training.');
  } else {
    OUTPUT_DIR = postEventOutputDir;
    ensureDirectory(OUTPUT_DIR);
  }

  if (!HAS_CURRENT_RESULTS && !APPROACH_DELTA_PATH) {
    console.log('ℹ️  No approach delta JSON found; attempting auto-generation (pre-tournament).');
    if (DATAGOLF_API_KEY && SHOULD_REFRESH_YTD) {
      try {
        const refreshed = await refreshYtdApproachSnapshot({
          apiKey: DATAGOLF_API_KEY,
          cacheDir: null,
          ttlMs: DATAGOLF_APPROACH_TTL_HOURS * 60 * 60 * 1000
        });
        if (refreshed?.payload) {
          approachSnapshotYtd = refreshed;
          approachSnapshotRows.ytd = extractApproachRowsFromJson(refreshed.payload);
          console.log('✓ Refreshed YTD approach snapshot for delta generation.');
        }
      } catch (error) {
        console.warn(`ℹ️  Unable to refresh YTD snapshot for delta generation: ${error.message}`);
      }
    } else if (!SHOULD_REFRESH_YTD) {
      console.log('ℹ️  Skipping YTD snapshot refresh for delta generation (post-tournament run).');
    }

    const resolveApproachOverrideSource = source => {
      if (!source) return source;
      if (typeof source !== 'string') return source;
      if (source.startsWith('snapshot:')) return source;
      if (path.isAbsolute(source)) return source;
      const snapshotCandidate = path.resolve(APPROACH_SNAPSHOT_DIR, source);
      if (fs.existsSync(snapshotCandidate)) return snapshotCandidate;
      const hasWildcard = /[\*\?]/.test(source);
      if (hasWildcard) return path.resolve(DATA_ROOT_DIR, source);
      const cwdResolved = path.resolve(source);
      if (fs.existsSync(cwdResolved)) return cwdResolved;
      const dataResolved = path.resolve(DATA_ROOT_DIR, source);
      if (fs.existsSync(dataResolved)) return dataResolved;
      return cwdResolved;
    };
    let previousSource = resolveApproachOverrideSource(OVERRIDE_APPROACH_DELTA_PREVIOUS || 'snapshot:previous');
    let currentSource = resolveApproachOverrideSource(OVERRIDE_APPROACH_DELTA_CURRENT || 'snapshot:current');
    let previousRows = loadApproachCsv(previousSource);
    let currentRows = loadApproachCsv(currentSource);
    console.log(`ℹ️  Approach delta sources resolved: current=${currentSource} (${currentRows.length} rows), previous=${previousSource} (${previousRows.length} rows)`);

    if (previousRows.length === 0 || currentRows.length === 0) {
      const currentApproachPath = APPROACH_PATH && fs.existsSync(APPROACH_PATH)
        ? APPROACH_PATH
        : null;
      const previousApproachPath = resolvePreviousApproachCsv(CURRENT_SEASON, currentApproachPath);
      const csvCurrentRows = currentApproachPath ? loadApproachCsv(currentApproachPath) : [];
      const csvPreviousRows = previousApproachPath ? loadApproachCsv(previousApproachPath) : [];
      if (csvCurrentRows.length > 0 && csvPreviousRows.length > 0) {
        currentRows = csvCurrentRows;
        previousRows = csvPreviousRows;
        currentSource = currentApproachPath;
        previousSource = previousApproachPath;
        console.log('✓ Approach delta auto-generation using approach CSVs (current + previous tournaments).');
      }
    }

    if (!OVERRIDE_APPROACH_DELTA_IGNORE_LAG) {
      const currentStamp = resolveApproachSnapshotTimestamp(currentSource);
      const previousStamp = resolveApproachSnapshotTimestamp(previousSource);
      if (currentStamp && previousStamp) {
        const diffDays = Math.abs(currentStamp - previousStamp) / (1000 * 60 * 60 * 24);
        if (diffDays < APPROACH_DELTA_MIN_DAYS) {
          console.warn(`ℹ️  Approach delta auto-generation skipped (snapshots only ${diffDays.toFixed(2)} days apart; min=${APPROACH_DELTA_MIN_DAYS}).`);
          previousRows = [];
          currentRows = [];
        }
      }
    }

    if (previousRows.length === 0 || currentRows.length === 0) {
      console.warn('ℹ️  Approach delta auto-generation skipped (missing current/previous snapshots or approach CSVs).');
    } else {
      const deltaRows = computeApproachDeltas({ previousRows, currentRows });
      const fieldIdSet = new Set(
        fieldData
          .map(row => String(row?.dg_id || '').trim())
          .filter(Boolean)
      );
      const filteredRows = deltaRows
        .filter(row => fieldIdSet.size === 0 || fieldIdSet.has(String(row?.dg_id || '').trim()))
        .map(row => ({
          ...row,
          tournament_field: fieldIdSet.size > 0 ? fieldIdSet.has(String(row?.dg_id || '').trim()) : null
        }));
      if (filteredRows.length === 0) {
        console.warn('ℹ️  Approach delta auto-generation skipped (no overlapping players).');
      } else {
        const deltaSlug = normalizeTournamentSlug(TOURNAMENT_NAME || tournamentNameFallback) || `event-${CURRENT_EVENT_ID || 'unknown'}`;
        const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
        const outputName = `approach_deltas_${deltaSlug}_${dateStamp}.json`;
        const outputPath = path.resolve(APPROACH_DELTA_DIR, outputName);
        const meta = {
          generatedAt: new Date().toISOString(),
          previousPath: previousSource,
          currentPath: currentSource,
          fieldCount: fieldIdSet.size,
          beforeCount: deltaRows.length,
          afterCount: filteredRows.length,
          note: 'Auto-generated in pre-tournament mode from snapshots or approach CSVs.'
        };
        writeJsonFile(outputPath, { meta, rows: filteredRows });
        APPROACH_DELTA_PATH = outputPath;
        console.log(`✓ Approach delta JSON generated: ${outputPath}`);
      }
    }
  }

  if (WRITE_TEMPLATES && OUTPUT_DIR) {
    if (HAS_CURRENT_RESULTS) {
      const removedBackups = deleteArchiveBackups(OUTPUT_DIR);
      if (removedBackups > 0) {
        console.log(`🧹 Removed ${removedBackups} .bak file(s) from ${path.resolve(OUTPUT_DIR, 'archive')}.`);
      }
    } else {
      console.log('ℹ️  Skipping archive cleanup (pre-tournament mode: no results derived).');
    }
  }

  const approachDeltaData = loadApproachDeltaRows(APPROACH_DELTA_PATH);
  let approachDeltaRowsAll = Array.isArray(approachDeltaData.rows) ? approachDeltaData.rows : [];
  let approachDeltaRows = approachDeltaRowsAll.filter(row => {
    if (!row) return false;
    if (row.tournament_field === false) return false;
    return true;
  });
  const approachDeltaMetricSpecs = buildApproachDeltaMetricSpecs();
  let approachDeltaCorrelations = [];
  let approachDeltaAlignmentMap = new Map();
  let approachDeltaPriorMode = null;
  let approachDeltaPriorMeta = approachDeltaData.meta || null;
  let approachDeltaPriorFiles = APPROACH_DELTA_PATH ? [APPROACH_DELTA_PATH] : [];
  let approachDeltaPlayerSummary = null;

  if (HAS_CURRENT_RESULTS && approachDeltaRows.length > 0) {
    approachDeltaCorrelations = computeApproachDeltaCorrelations(approachDeltaRows, resultsCurrent, approachDeltaMetricSpecs);
    approachDeltaAlignmentMap = buildApproachDeltaAlignmentMap(metricConfig, approachDeltaCorrelations);
    approachDeltaPriorMode = 'current_event';
    console.log(`✓ Computed approach delta correlations (${approachDeltaCorrelations.length})`);
  } else if (!HAS_CURRENT_RESULTS) {
    const rollingEntries = getApproachDeltaFileEntries(
      [APPROACH_DELTA_DIR, OUTPUT_DIR, DATA_DIR, DEFAULT_DATA_DIR]
    );
    const rollingResult = buildRollingApproachDeltaRows(
      rollingEntries,
      approachDeltaMetricSpecs,
      fieldIdSetForDelta,
      APPROACH_DELTA_ROLLING_EVENTS
    );

    if (rollingResult.rows.length > 0) {
      approachDeltaRowsAll = rollingResult.rows;
      approachDeltaRows = rollingResult.rows;
      approachDeltaAlignmentMap = buildApproachDeltaAlignmentFromRollingRows(
        approachDeltaMetricSpecs,
        approachDeltaRows
      );
      approachDeltaPriorMode = 'rolling_average';
      approachDeltaPriorMeta = rollingResult.meta || null;
      approachDeltaPriorFiles = rollingResult.meta?.filesUsed || [];
      console.log(`✓ Built rolling approach delta baseline (${rollingResult.meta?.fileCount || 0} files).`);
    } else if (!APPROACH_DELTA_PATH) {
      approachDeltaPriorFiles = [];
      console.log('ℹ️  Approach delta prior unavailable (no delta JSON found).');
    } else {
      approachDeltaPriorFiles = [];
      console.log('ℹ️  Approach delta prior skipped (missing current results and no rolling baseline).');
    }
  } else if (!APPROACH_DELTA_PATH) {
    approachDeltaPriorFiles = [];
    console.log('ℹ️  Approach delta prior unavailable (no delta JSON found).');
  } else {
    approachDeltaPriorFiles = [];
    console.log('ℹ️  Approach delta prior skipped (no usable rows after filtering).');
  }

  if (!approachDeltaPriorMode && approachDeltaRows.length > 0) {
    const fallbackAlignmentMap = buildApproachDeltaAlignmentFromRollingRows(
      approachDeltaMetricSpecs,
      approachDeltaRows
    );
    if (fallbackAlignmentMap.size > 0) {
      approachDeltaAlignmentMap = fallbackAlignmentMap;
      approachDeltaPriorMode = 'fallback_average';
    }
  }

  if (approachDeltaAlignmentMap.size > 0 && approachDeltaRows.length > 0) {
    approachDeltaPlayerSummary = { totalPlayers: approachDeltaRows.length };
  }

  const field2026DgIds = fieldIdSetForDelta;
  console.log(`✓ Loaded 2026 field: ${field2026DgIds.size} players\n`);

  const deltaScoresById = typeof getDeltaPlayerScoresForEvent === 'function'
    ? getDeltaPlayerScoresForEvent(CURRENT_EVENT_ID, CURRENT_SEASON)
    : {};

  const runtimeConfig = {
    similarCoursesWeight: sharedConfig.similarCoursesWeight,
    puttingCoursesWeight: sharedConfig.puttingCoursesWeight,
    courseSetupWeights: sharedConfig.courseSetupWeights,
    currentSeason: CURRENT_SEASON,
    deltaScoresById,
    playerRampById: rampById,
    playerRampWeight: PAST_PERF_RAMP_WEIGHT,
    playerRampMaxEvents: rampMaxEvents
  };

  const runRanking = ({ roundsRawData, approachRawData, groupWeights, metricWeights, includeCurrentEventRounds = false, fieldDataOverride = null }) => {
    const adjustedMetricWeights = applyShotDistributionToMetricWeights(
      metricWeights,
      sharedConfig.courseSetupWeights
    );
    let deltaScoresByIdForRun = runtimeConfig.deltaScoresById;
    if (approachDeltaAlignmentMap.size > 0 && approachDeltaRows.length > 0) {
      const trendScores = buildApproachDeltaPlayerScores(
        approachDeltaMetricSpecs,
        approachDeltaRows,
        approachDeltaAlignmentMap
      );
      const predictiveAlignmentMap = buildApproachAlignmentMapFromMetricWeights(
        metricConfig,
        adjustedMetricWeights,
        approachDeltaMetricSpecs
      );
      const predictiveScores = buildApproachDeltaPlayerScores(
        approachDeltaMetricSpecs,
        approachDeltaRows,
        predictiveAlignmentMap
      );
      const derivedDeltaScores = buildDeltaScoresByIdFromScores(trendScores, predictiveScores);
      if (Object.keys(derivedDeltaScores).length > 0) {
        deltaScoresByIdForRun = derivedDeltaScores;
      }
    }
    const rankingRuntimeConfig = {
      ...runtimeConfig,
      deltaScoresById: deltaScoresByIdForRun
    };
    const playerData = buildPlayerData({
      fieldData: fieldDataOverride || fieldData,
      roundsRawData,
      approachRawData,
      currentEventId: CURRENT_EVENT_ID,
      currentSeason: CURRENT_SEASON,
      includeCurrentEventRounds
    });

    const templateGroups = buildModifiedGroups(
      metricConfig.groups,
      groupWeights,
      adjustedMetricWeights
    );

    return generatePlayerRankings(
      playerData.players,
      { groups: templateGroups, pastPerformance: metricConfig.pastPerformance },
      playerData.historicalData,
      playerData.approachData,
      sharedConfig.similarCourseIds,
      sharedConfig.puttingCourseIds,
      rankingRuntimeConfig
    );
  };

  const filterOutCurrentSeasonEvent = rows => (rows || []).filter(row => {
    const seasonValue = parseInt(String(row?.year || row?.season || '').trim());
    if (Number.isNaN(seasonValue)) return true;
    const eventIdValue = String(row?.event_id || '').trim();
    return !(String(seasonValue) === String(CURRENT_SEASON) && eventIdValue === String(CURRENT_EVENT_ID));
  });

  const getCurrentSeasonRoundsForRanking = includeCurrentEventRounds => {
    if (includeCurrentEventRounds) {
      return roundsByYear[CURRENT_SEASON] || historicalDataForField;
    }
    // Parity mode: exclude only the current season's target event from ranking inputs.
    return filterOutCurrentSeasonEvent(historyData);
  };

  const buildEventResultsFromRows = eventRows => {
    const resultsByPlayer = new Map();
    eventRows.forEach(row => {
      const dgId = String(row['dg_id'] || '').trim();
      if (!dgId) return;
      const finishPosition = parseFinishPosition(row['fin_text']);
      if (!finishPosition || Number.isNaN(finishPosition)) return;
      const existing = resultsByPlayer.get(dgId);
      if (!existing || finishPosition < existing) {
        resultsByPlayer.set(dgId, finishPosition);
      }
    });
    return resultsByPlayer;
  };

  const buildEventSamples = eventRows => {
    const resultsByPlayer = buildEventResultsFromRows(eventRows);
    if (resultsByPlayer.size === 0) return [];
    const currentTemplate = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    if (!currentTemplate) return [];

    const ranking = runRanking({
      roundsRawData: eventRows,
      approachRawData: approachDataCurrent,
      groupWeights: currentTemplate.groupWeights,
      metricWeights: currentTemplate.metricWeights,
      includeCurrentEventRounds: true
    });

    return ranking.players.reduce((acc, player) => {
      const finishPosition = resultsByPlayer.get(String(player.dgId));
      if (!finishPosition) return acc;
      const metricSpecs = GENERATED_METRIC_LABELS.map((label, index) => ({ label, index }));
      const featurePack = buildFeatureVector(player, metricSpecs);
      if (!featurePack) return acc;
      acc.push({ features: featurePack.features, label: finishPosition <= 20 ? 1 : 0 });
      return acc;
    }, []);
  };

  const buildEventSamplesBySeason = season => {
    const eventMap = new Map();
    historyData.forEach(row => {
      const eventId = String(row['event_id'] || '').trim();
      if (!eventId) return;
      const rowSeason = parseInt(String(row['year'] || row['season'] || '').trim());
      if (season && rowSeason !== season) return;
      if (!eventMap.has(eventId)) eventMap.set(eventId, []);
      eventMap.get(eventId).push(row);
    });

    const samplesByEvent = [];
    eventMap.forEach((rows, eventId) => {
      const samples = buildEventSamples(rows);
      if (samples.length >= 10) {
        samplesByEvent.push({ eventId, samples });
      }
    });
    return samplesByEvent;
  };

  const buildHistoricalEventSamples = (metricSpecs, groupWeights, metricWeights, eventIdSet = null) => {
    const eventMap = new Map();
    historyData.forEach(row => {
      const eventId = String(row['event_id'] || '').trim();
      if (!eventId) return;
      if (eventIdSet && !eventIdSet.has(eventId)) return;
      if (!eventMap.has(eventId)) eventMap.set(eventId, []);
      eventMap.get(eventId).push(row);
    });

    const samplesByEvent = [];
    eventMap.forEach((rows, eventId) => {
      const resultsByPlayer = buildEventResultsFromRows(rows);
      if (resultsByPlayer.size === 0) return;
      const trainingFieldData = buildFieldDataFromHistory(rows, eventIdSet);
      const ranking = runRanking({
        roundsRawData: rows,
        approachRawData: [],
        groupWeights,
        metricWeights,
        includeCurrentEventRounds: false,
        fieldDataOverride: trainingFieldData
      });

      const samples = ranking.players.reduce((acc, player) => {
        const finishPosition = resultsByPlayer.get(String(player.dgId));
        if (!finishPosition) return acc;
        const featurePack = buildFeatureVector(player, metricSpecs);
        if (!featurePack) return acc;
        acc.push({ features: featurePack.features, label: finishPosition <= 20 ? 1 : 0 });
        return acc;
      }, []);

      if (samples.length >= 10) {
        samplesByEvent.push({ eventId, samples });
      }
    });

    return samplesByEvent;
  };

  const buildFieldDataFromHistory = (rows, eventIdSet = null) => {
    const players = new Map();
    (rows || []).forEach(row => {
      const eventId = String(row['event_id'] || '').trim();
      if (eventIdSet && !eventIdSet.has(eventId)) return;
      const dgId = String(row['dg_id'] || '').trim();
      if (!dgId) return;
      if (!players.has(dgId)) {
        const playerName = String(row['player_name'] || '').trim();
        players.set(dgId, { dg_id: dgId, player_name: playerName });
      }
    });
    return Array.from(players.values());
  };

  const crossValidateTopNLogisticByEvent = (eventSamples, lambdaCandidates) => {
    if (!Array.isArray(eventSamples) || eventSamples.length < 3) {
      return { success: false, message: 'Not enough events for CV', eventCount: eventSamples ? eventSamples.length : 0 };
    }

    const allSamples = eventSamples.flatMap(entry => entry.samples);
    if (allSamples.length < 30) {
      return { success: false, message: 'Not enough samples for CV', eventCount: eventSamples.length, totalSamples: allSamples.length };
    }

    const lambdas = lambdaCandidates && lambdaCandidates.length > 0
      ? lambdaCandidates
      : [0, 0.001, 0.005, 0.01, 0.05, 0.1];

    const results = [];

    lambdas.forEach(l2 => {
      let totalLogLoss = 0;
      let totalAccuracy = 0;
      let foldsUsed = 0;

      eventSamples.forEach((fold, idx) => {
        const trainingSamples = eventSamples
          .filter((_, i) => i !== idx)
          .flatMap(entry => entry.samples);
        if (trainingSamples.length < 20 || fold.samples.length < 10) return;
        const model = trainLogisticFromSamples(trainingSamples, { l2 });
        if (!model.success) return;
        const evaluation = evaluateLogisticModel(model, fold.samples);
        totalLogLoss += evaluation.logLoss;
        totalAccuracy += evaluation.accuracy;
        foldsUsed += 1;
      });

      if (foldsUsed > 0) {
        results.push({
          l2,
          avgLogLoss: totalLogLoss / foldsUsed,
          avgAccuracy: totalAccuracy / foldsUsed,
          foldsUsed
        });
      }
    });

    if (results.length === 0) {
      return { success: false, message: 'No valid CV folds', eventCount: eventSamples.length };
    }

    results.sort((a, b) => a.avgLogLoss - b.avgLogLoss);
    const best = results[0];
    const finalModel = trainLogisticFromSamples(allSamples, { l2: best.l2 });

    return {
      success: true,
      eventCount: eventSamples.length,
      totalSamples: allSamples.length,
      bestL2: best.l2,
      avgLogLoss: best.avgLogLoss,
      avgAccuracy: best.avgAccuracy,
      foldsUsed: best.foldsUsed,
      allSamples,
      finalModel
    };
  };

  // =========================================================================
  // STEP 1: HISTORICAL METRIC CORRELATIONS + CURRENT-YEAR TEMPLATE BASELINE
  // =========================================================================
  console.log('---');
  console.log('STEP 1: HISTORICAL METRIC CORRELATIONS');
  console.log('Analyze past-year metrics vs finish position');
  console.log('---');

  const allEventRounds = historyData.filter(row => {
    const eventId = String(row['event_id'] || '').trim();
    return eventId === String(CURRENT_EVENT_ID);
  });

  const historicalDataForField = historyData.filter(row => {
    const dgId = String(row['dg_id'] || '').trim();
    const eventId = String(row['event_id'] || '').trim();
    return field2026DgIds.has(dgId) && eventId === String(CURRENT_EVENT_ID);
  });

  const roundsByYear = {};
  historicalDataForField.forEach(row => {
    const year = parseInt(String(row['year'] || '').trim());
    if (Number.isNaN(year)) return;
    if (!roundsByYear[year]) roundsByYear[year] = [];
    roundsByYear[year].push(row);
  });

  const resultsByYearSourceRows = !HAS_CURRENT_RESULTS ? allEventRounds : historicalDataForField;
  const resultsByYear = buildResultsByYear(resultsByYearSourceRows, CURRENT_EVENT_ID);
  const availableYears = Object.keys(resultsByYear).sort();
  const availableYearNumbers = availableYears
    .map(year => parseInt(String(year), 10))
    .filter(year => !Number.isNaN(year));
  const latestAvailableYear = availableYearNumbers.length > 0
    ? Math.max(...availableYearNumbers)
    : null;
  const validationAnchorYear = !HAS_CURRENT_RESULTS && latestAvailableYear
    ? latestAvailableYear
    : effectiveSeason;
  const validationYears = availableYearNumbers
    .filter(year => year >= (validationAnchorYear - (VALIDATION_YEAR_WINDOW - 1)) && year <= validationAnchorYear)
    .sort((a, b) => a - b);

  const resultsByYearSourceLabel = !HAS_CURRENT_RESULTS ? 'event_history' : 'current_field';
  console.log(`\n✓ Years available for evaluation: ${availableYears.join(', ') || 'none'} (${resultsByYearSourceLabel})`);
  const validationAnchorLabel = (!HAS_CURRENT_RESULTS && latestAvailableYear)
    ? `last ${VALIDATION_YEAR_WINDOW} from latest available (${validationAnchorYear})`
    : `last ${VALIDATION_YEAR_WINDOW} incl current`;
  console.log(`✓ Validation years (${validationAnchorLabel}): ${validationYears.join(', ') || 'none'}`);
  console.log(`✓ Total historical rounds for event ${CURRENT_EVENT_ID} (all players): ${allEventRounds.length}`);
  console.log(`✓ Total historical rounds for event ${CURRENT_EVENT_ID} (current field only): ${historicalDataForField.length}\n`);

  const historicalMetricSamples = buildHistoricalMetricSamples(allEventRounds, CURRENT_EVENT_ID);
  const historicalMetricCorrelations = computeHistoricalMetricCorrelations(historicalMetricSamples);

  console.log('---');
  console.log('STEP 1b: CURRENT-SEASON (EVENT + SIMILAR + PUTTING) METRIC CORRELATIONS');
  console.log('Correlate generatePlayerRankings metrics for current season using event + similar/putting courses');
  console.log('---');

  const currentSeasonRounds = roundsByYear[effectiveSeason] || [];
  const currentSeasonRoundsAllEvents = historyData.filter(row => {
    const dgId = String(row['dg_id'] || '').trim();
    if (!field2026DgIds.has(dgId)) return false;
    const year = parseInt(String(row['year'] || row['season'] || '').trim());
    if (Number.isNaN(year)) return false;
    return String(year) === String(effectiveSeason);
  });
  let currentGeneratedMetricCorrelations = [];
  let currentGeneratedTop20Correlations = [];
  let currentGeneratedTop20Logistic = null;
  let currentGeneratedTop20CvSummary = null;
  let historicalCoreTop20Correlations = [];
  let suggestedTop20MetricWeights = { source: 'none', weights: [] };
  let suggestedTop20GroupWeights = { source: 'none', weights: [] };
  let conservativeSuggestedTop20GroupWeights = { source: 'none', weights: [], cvReliability: 0, modelShare: 0, priorShare: 1 };
  let cvReliability = 0;
  let tunedTop20GroupWeights = null;
  let currentGeneratedCorrelationMap = new Map();
  let currentGeneratedTop20AlignmentMap = new Map();
  const HISTORICAL_METRIC_LABELS = GENERATED_METRIC_LABELS.slice(0, 17);
  const HISTORICAL_CORE_TOP20_BLEND = 0.65;
  const HISTORICAL_CORE_METRIC_LABELS = [
    'SG Total',
    'Scoring Average',
    'Birdies or Better',
    'Driving Distance',
    'Driving Accuracy',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'Poor Shots'
  ];
  let trainingMetricNotes = {
    included: [],
    excluded: ['Birdie Chances Created', 'SG Total'],
    derived: ['Birdies or Better = birdies + eagles (from historical rounds when available)']
  };

  const coreMetricSpecs = HISTORICAL_CORE_METRIC_LABELS
    .map(label => ({ label, index: GENERATED_METRIC_LABELS.indexOf(label) }))
    .filter(spec => spec.index >= 0);
  if (coreMetricSpecs.length > 0 && allEventRounds.length > 0) {
    const baseTemplateForCore = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    if (baseTemplateForCore) {
      const coreResults = buildResultsFromRows(allEventRounds);
      const coreFieldData = buildFieldDataFromHistory(allEventRounds, new Set([String(CURRENT_EVENT_ID)]));
      const coreGroupWeights = removeApproachGroupWeights(baseTemplateForCore.groupWeights || {});
      const coreRanking = runRanking({
        roundsRawData: allEventRounds,
        approachRawData: [],
        groupWeights: coreGroupWeights,
        metricWeights: baseTemplateForCore.metricWeights || {},
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.historicalEvaluation),
        fieldDataOverride: coreFieldData
      });
      historicalCoreTop20Correlations = computeGeneratedMetricTopNCorrelationsForLabels(
        coreRanking.players,
        coreResults,
        coreMetricSpecs,
        20
      );
    }
  }

  if (!HAS_CURRENT_RESULTS) {
    const currentTemplate = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    if (!currentTemplate) {
      console.warn('⚠️  No template available for historical metric correlations.');
    } else {
      const similarCourseIds = normalizeIdList(sharedConfig.similarCourseIds);
      const puttingCourseIds = normalizeIdList(sharedConfig.puttingCourseIds);
      const similarCourseBlend = clamp01(sharedConfig.similarCoursesWeight, 0.3);
      const puttingCourseBlend = clamp01(sharedConfig.puttingCoursesWeight, 0.35);
      const eventIdSet = new Set([String(CURRENT_EVENT_ID), ...similarCourseIds]);
      const metricSpecsForTraining = HISTORICAL_METRIC_LABELS
        .map((label, index) => ({ label, index }))
        .filter(spec => spec.label !== 'Birdie Chances Created' && spec.label !== 'SG Total');
      const metricLabelsForTraining = metricSpecsForTraining.map(spec => spec.label);
      trainingMetricNotes = {
        included: metricLabelsForTraining,
        excluded: ['Birdie Chances Created', 'SG Total'],
        derived: ['Birdies or Better = birdies + eagles (from historical rounds when available)']
      };
      console.log(`Training metrics included (${trainingMetricNotes.included.length}): ${trainingMetricNotes.included.join(', ')}`);
      console.log(`Training metrics excluded: ${trainingMetricNotes.excluded.join(', ')}`);
      console.log(`Derived metrics: ${trainingMetricNotes.derived.join('; ')}`);
      const historicalEventRounds = historyData.filter(row => String(row['event_id'] || '').trim() === String(CURRENT_EVENT_ID));
      const similarCourseRoundsAll = historyData.filter(row => eventIdSet.has(String(row['event_id'] || '').trim()));
      const combinedRounds = [...historicalEventRounds, ...similarCourseRoundsAll];
      const trainingRounds = Array.from(new Map(
        combinedRounds.map(row => {
          const key = [row.dg_id || row['dg_id'], row.year || row['year'] || row.season || row['season'], row.round_num || row.round || row.round_num, row.event_id || row['event_id']]
            .map(value => String(value || '').trim())
            .join('|');
          return [key, row];
        })
      ).values());
      const trainingResults = buildResultsFromRows(trainingRounds);
      const historicalGroupWeights = removeApproachGroupWeights(currentTemplate.groupWeights);

      if (trainingRounds.length > 0 && trainingResults.length > 0) {
        const trainingFieldData = buildFieldDataFromHistory(trainingRounds, eventIdSet);
        const historicalRanking = runRanking({
          roundsRawData: trainingRounds,
          approachRawData: [],
          groupWeights: historicalGroupWeights,
          metricWeights: currentTemplate.metricWeights,
          includeCurrentEventRounds: false,
          fieldDataOverride: trainingFieldData
        });

        currentGeneratedMetricCorrelations = computeGeneratedMetricCorrelationsForLabels(
          historicalRanking.players,
          trainingResults,
          metricSpecsForTraining
        );
        currentGeneratedTop20Correlations = computeGeneratedMetricTopNCorrelationsForLabels(
          historicalRanking.players,
          trainingResults,
          metricSpecsForTraining,
          20
        );
        const trainingSamples = buildTopNSamplesFromPlayers(
          historicalRanking.players,
          trainingResults,
          metricSpecsForTraining,
          20
        );
        const logisticModel = trainLogisticFromSamples(trainingSamples);
        currentGeneratedTop20Logistic = summarizeLogisticModel(
          logisticModel,
          trainingSamples,
          metricLabelsForTraining
        );

        const eventSamples = buildHistoricalEventSamples(
          metricSpecsForTraining,
          historicalGroupWeights,
          currentTemplate.metricWeights,
          eventIdSet
        );
        if (eventSamples.length >= 3) {
          currentGeneratedTop20CvSummary = crossValidateTopNLogisticByEvent(eventSamples);
          if (currentGeneratedTop20CvSummary.success && currentGeneratedTop20CvSummary.finalModel) {
            currentGeneratedTop20Logistic = summarizeLogisticModel(
              currentGeneratedTop20CvSummary.finalModel,
              currentGeneratedTop20CvSummary.allSamples,
              metricLabelsForTraining
            );
          }
        } else {
          currentGeneratedTop20CvSummary = {
            success: false,
            message: 'Not enough events for CV',
            eventCount: eventSamples.length
          };
        }
      }

      if (similarCourseIds.length > 0 && similarCourseBlend > 0) {
        const similarCourseSet = new Set(similarCourseIds);
        const similarCourseRounds = historyData.filter(row => {
          const eventId = String(row['event_id'] || '').trim();
          return similarCourseSet.has(eventId);
        });
        const similarCourseResults = buildResultsFromRows(similarCourseRounds);

        if (similarCourseRounds.length > 0 && similarCourseResults.length > 0) {
          const similarFieldData = buildFieldDataFromHistory(similarCourseRounds, eventIdSet);
          const similarRanking = runRanking({
            roundsRawData: similarCourseRounds,
            approachRawData: [],
            groupWeights: historicalGroupWeights,
            metricWeights: currentTemplate.metricWeights,
            includeCurrentEventRounds: false,
            fieldDataOverride: similarFieldData
          });
          const similarMetricCorrelations = computeGeneratedMetricCorrelationsForLabels(
            similarRanking.players,
            similarCourseResults,
            metricSpecsForTraining
          );
          const similarTop20Correlations = computeGeneratedMetricTopNCorrelationsForLabels(
            similarRanking.players,
            similarCourseResults,
            metricSpecsForTraining,
            20
          );
          currentGeneratedMetricCorrelations = blendCorrelationLists(currentGeneratedMetricCorrelations, similarMetricCorrelations, similarCourseBlend);
          currentGeneratedTop20Correlations = blendCorrelationLists(currentGeneratedTop20Correlations, similarTop20Correlations, similarCourseBlend);
        }
      }

      if (puttingCourseIds.length > 0 && puttingCourseBlend > 0) {
        const puttingCourseSet = new Set(puttingCourseIds);
        const puttingCourseRounds = historyData.filter(row => {
          const eventId = String(row['event_id'] || '').trim();
          return puttingCourseSet.has(eventId);
        });
        const puttingCourseResults = buildResultsFromRows(puttingCourseRounds);
        if (puttingCourseRounds.length > 0 && puttingCourseResults.length > 0) {
          const puttingFieldData = buildFieldDataFromHistory(puttingCourseRounds, eventIdSet);
          const puttingRanking = runRanking({
            roundsRawData: puttingCourseRounds,
            approachRawData: [],
            groupWeights: historicalGroupWeights,
            metricWeights: currentTemplate.metricWeights,
            includeCurrentEventRounds: false,
            fieldDataOverride: puttingFieldData
          });
          const puttingMetricCorrelations = computeGeneratedMetricCorrelationsForLabels(
            puttingRanking.players,
            puttingCourseResults,
            metricSpecsForTraining
          );
          const puttingTop20Correlations = computeGeneratedMetricTopNCorrelationsForLabels(
            puttingRanking.players,
            puttingCourseResults,
            metricSpecsForTraining,
            20
          );
          currentGeneratedMetricCorrelations = blendSingleMetricCorrelation(currentGeneratedMetricCorrelations, puttingMetricCorrelations, 'SG Putting', puttingCourseBlend);
          currentGeneratedTop20Correlations = blendSingleMetricCorrelation(currentGeneratedTop20Correlations, puttingTop20Correlations, 'SG Putting', puttingCourseBlend);
        }
      }

      if (historicalCoreTop20Correlations.length > 0) {
        currentGeneratedTop20Correlations = blendCorrelationLists(
          currentGeneratedTop20Correlations,
          historicalCoreTop20Correlations,
          HISTORICAL_CORE_TOP20_BLEND
        );
      }

      suggestedTop20MetricWeights = buildSuggestedMetricWeights(
        metricLabelsForTraining,
        currentGeneratedTop20Correlations,
        currentGeneratedTop20Logistic
      );
      suggestedTop20GroupWeights = buildSuggestedGroupWeights(
        metricConfig,
        suggestedTop20MetricWeights
      );
      currentGeneratedCorrelationMap = new Map(
        currentGeneratedMetricCorrelations.map(entry => [normalizeGeneratedMetricLabel(entry.label), entry.correlation])
      );
      const signalMap = buildAlignmentMapFromTop20Signal(currentGeneratedTop20Correlations);
      const logisticMap = buildAlignmentMapFromTop20Logistic(metricLabelsForTraining, currentGeneratedTop20Logistic);
      currentGeneratedTop20AlignmentMap = blendAlignmentMaps([signalMap, logisticMap], [0.5, 0.5]);
      console.log(`✓ Computed ${currentGeneratedMetricCorrelations.length} historical metric correlations (no current results).`);
    }
  } else if (currentSeasonRounds.length > 0 || currentSeasonRoundsAllEvents.length > 0) {
    const currentTemplate = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    if (!currentTemplate) {
      console.warn('⚠️  No template available for current-season (event + similar + putting) metric correlations.');
    } else {
      const similarCourseIds = normalizeIdList(sharedConfig.similarCourseIds);
      const puttingCourseIds = normalizeIdList(sharedConfig.puttingCourseIds);
      const similarCourseBlend = clamp01(sharedConfig.similarCoursesWeight, 0.3);
      const puttingCourseBlend = clamp01(sharedConfig.puttingCoursesWeight, 0.35);
      const fieldIdSet = field2026DgIds;
      const eventIdSetForMetrics = new Set([
        String(CURRENT_EVENT_ID),
        ...similarCourseIds.map(String),
        ...puttingCourseIds.map(String)
      ]);
      const eventIdListForMetrics = Array.from(eventIdSetForMetrics.values());
      console.log(`ℹ️  Current-season metric scope: season=${effectiveSeason}, events=[${eventIdListForMetrics.join(', ')}] (event + similar + putting).`);
      console.log(`   Similar events: ${similarCourseIds.length ? similarCourseIds.join(', ') : 'none'}`);
      console.log(`   Putting events: ${puttingCourseIds.length ? puttingCourseIds.join(', ') : 'none'}`);

      const roundsForMetrics = historyData.filter(row => {
        const dgId = String(row['dg_id'] || '').trim();
        if (!fieldIdSet.has(dgId)) return false;
        const year = parseInt(String(row['year'] || row['season'] || '').trim());
        if (Number.isNaN(year)) return false;
        if (String(year) !== String(effectiveSeason)) return false;
        const eventId = String(row['event_id'] || '').trim();
        return eventIdSetForMetrics.has(eventId);
      });

      if (roundsForMetrics.length > 0) {
        console.log(`ℹ️  Using ${roundsForMetrics.length} current-season rounds (season=${effectiveSeason}, event + similar + putting) for metric correlations.`);
      } else {
        console.warn('⚠️  No current-season rounds found for event + similar + putting courses; skipping Step 1b correlations.');
      }
      if (roundsForMetrics.length > 0) {
        const currentRankingForMetrics = runRanking({
          roundsRawData: roundsForMetrics,
          approachRawData: approachDataCurrent,
          groupWeights: currentTemplate.groupWeights,
          metricWeights: currentTemplate.metricWeights,
          includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonMetrics)
        });
        const firstMetricLength = currentRankingForMetrics.players.find(p => Array.isArray(p.metrics))?.metrics?.length || 0;
        if (firstMetricLength <= 1) {
          const metricLabel = firstMetricLength === 1 ? (GENERATED_METRIC_LABELS[0] || 'Metric 0') : 'Weighted Score';
          const singleMetric = computeSingleMetricCorrelation(currentRankingForMetrics.players, resultsCurrent, {
            label: metricLabel,
            valueGetter: player => {
              if (Array.isArray(player.metrics) && typeof player.metrics[0] === 'number') {
                return player.metrics[0];
              }
              if (typeof player.weightedScore === 'number') return player.weightedScore;
              if (typeof player.finalScore === 'number') return player.finalScore;
              return null;
            }
          });
          currentGeneratedMetricCorrelations = [{ index: 0, label: singleMetric.label, correlation: singleMetric.correlation, samples: singleMetric.samples }];
          currentGeneratedTop20Correlations = [{ index: 0, label: singleMetric.label, correlation: singleMetric.correlation, samples: singleMetric.samples }];
        } else {
          currentGeneratedMetricCorrelations = computeGeneratedMetricCorrelations(currentRankingForMetrics.players, resultsCurrent);
          currentGeneratedTop20Correlations = computeGeneratedMetricTopNCorrelations(currentRankingForMetrics.players, resultsCurrent, 20);
          currentGeneratedTop20Logistic = trainTopNLogisticModel(
            currentRankingForMetrics.players,
            resultsCurrent,
            GENERATED_METRIC_LABELS,
            { topN: 20 }
          );
        }

        const seasonEventSamples = buildEventSamplesBySeason(CURRENT_SEASON);
        let eventSamples = seasonEventSamples;
        let cvNote = null;
        if (seasonEventSamples.length < 3) {
          eventSamples = buildEventSamplesBySeason(null);
          if (eventSamples.length >= 3) {
            cvNote = `Insufficient events for season ${CURRENT_SEASON}; used all seasons.`;
          }
        }

        if (eventSamples.length >= 3) {
          currentGeneratedTop20CvSummary = crossValidateTopNLogisticByEvent(eventSamples);
          if (cvNote) currentGeneratedTop20CvSummary.note = cvNote;
          if (currentGeneratedTop20CvSummary.success && currentGeneratedTop20CvSummary.finalModel) {
            currentGeneratedTop20Logistic = summarizeLogisticModel(
              currentGeneratedTop20CvSummary.finalModel,
              currentGeneratedTop20CvSummary.allSamples,
              GENERATED_METRIC_LABELS
            );
          }
        } else {
          currentGeneratedTop20CvSummary = {
            success: false,
            message: 'Not enough events for CV',
            eventCount: eventSamples.length
          };
        }
      }

      if (similarCourseIds.length > 0 && similarCourseBlend > 0) {
        const similarCourseSet = new Set(similarCourseIds);
        const similarCourseRounds = historyData.filter(row => {
          const dgId = String(row['dg_id'] || '').trim();
          if (!fieldIdSet.has(dgId)) return false;
          const eventId = String(row['event_id'] || '').trim();
          return similarCourseSet.has(eventId);
        });
        const similarCourseResults = buildResultsFromRows(similarCourseRounds);

        if (similarCourseRounds.length > 0 && similarCourseResults.length > 0) {
          const similarRanking = runRanking({
            roundsRawData: similarCourseRounds,
            approachRawData: approachDataCurrent,
            groupWeights: currentTemplate.groupWeights,
            metricWeights: currentTemplate.metricWeights,
            includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonMetrics)
          });
          const similarMetricCorrelations = computeGeneratedMetricCorrelations(similarRanking.players, similarCourseResults);
          const similarTop20Correlations = computeGeneratedMetricTopNCorrelations(similarRanking.players, similarCourseResults, 20);
          currentGeneratedMetricCorrelations = blendCorrelationLists(currentGeneratedMetricCorrelations, similarMetricCorrelations, similarCourseBlend);
          currentGeneratedTop20Correlations = blendCorrelationLists(currentGeneratedTop20Correlations, similarTop20Correlations, similarCourseBlend);
        }
      }

      if (puttingCourseIds.length > 0 && puttingCourseBlend > 0) {
        const puttingCourseSet = new Set(puttingCourseIds);
        const puttingCourseRounds = historyData.filter(row => {
          const dgId = String(row['dg_id'] || '').trim();
          if (!fieldIdSet.has(dgId)) return false;
          const eventId = String(row['event_id'] || '').trim();
          return puttingCourseSet.has(eventId);
        });
        const puttingCourseResults = buildResultsFromRows(puttingCourseRounds);
        if (puttingCourseRounds.length > 0 && puttingCourseResults.length > 0) {
          const puttingRanking = runRanking({
            roundsRawData: puttingCourseRounds,
            approachRawData: approachDataCurrent,
            groupWeights: currentTemplate.groupWeights,
            metricWeights: currentTemplate.metricWeights,
            includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonMetrics)
          });
          const puttingMetricCorrelations = computeGeneratedMetricCorrelations(puttingRanking.players, puttingCourseResults);
          const puttingTop20Correlations = computeGeneratedMetricTopNCorrelations(puttingRanking.players, puttingCourseResults, 20);
          currentGeneratedMetricCorrelations = blendSingleMetricCorrelation(currentGeneratedMetricCorrelations, puttingMetricCorrelations, 'SG Putting', puttingCourseBlend);
          currentGeneratedTop20Correlations = blendSingleMetricCorrelation(currentGeneratedTop20Correlations, puttingTop20Correlations, 'SG Putting', puttingCourseBlend);
        }
      }

      if (historicalCoreTop20Correlations.length > 0) {
        currentGeneratedTop20Correlations = blendCorrelationLists(
          currentGeneratedTop20Correlations,
          historicalCoreTop20Correlations,
          HISTORICAL_CORE_TOP20_BLEND
        );
      }
      suggestedTop20MetricWeights = buildSuggestedMetricWeights(
        GENERATED_METRIC_LABELS,
        currentGeneratedTop20Correlations,
        currentGeneratedTop20Logistic
      );
      suggestedTop20GroupWeights = buildSuggestedGroupWeights(
        metricConfig,
        suggestedTop20MetricWeights
      );
      currentGeneratedCorrelationMap = new Map(
        currentGeneratedMetricCorrelations.map(entry => [normalizeGeneratedMetricLabel(entry.label), entry.correlation])
      );
      const signalMap = buildAlignmentMapFromTop20Signal(currentGeneratedTop20Correlations);
      const logisticMap = buildAlignmentMapFromTop20Logistic(GENERATED_METRIC_LABELS, currentGeneratedTop20Logistic);
      currentGeneratedTop20AlignmentMap = blendAlignmentMaps([signalMap, logisticMap], [0.5, 0.5]);
      console.log(`✓ Computed ${currentGeneratedMetricCorrelations.length} metric correlations for ${CURRENT_SEASON} (event + similar + putting)`);
    }
  } else {
    console.warn(`⚠️  No ${CURRENT_SEASON} rounds found (event + similar + putting); skipping Step 1b correlations.`);
  }

  if (currentGeneratedTop20Correlations.length > 0 || (currentGeneratedTop20Logistic && currentGeneratedTop20Logistic.success)) {
    const top20SignalMap = buildTop20SignalMap(
      currentGeneratedTop20Correlations,
      currentGeneratedTop20Logistic,
      GENERATED_METRIC_LABELS
    );
    const alignmentScores = computeTemplateAlignmentScores(metricConfig, templateConfigs, top20SignalMap);
    const recommended = Object.entries(alignmentScores)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
    if (recommended) {
      const scoreDetails = Object.entries(alignmentScores)
        .map(([type, score]) => `${type}=${score.toFixed(4)}`)
        .join(', ');
      console.log(`ℹ️  Course type alignment recommendation (informational only): ${recommended[0]} (${scoreDetails})`);
    }
  }

  const fallbackTemplateForCv = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
  cvReliability = computeCvReliability(currentGeneratedTop20CvSummary);
  conservativeSuggestedTop20GroupWeights = blendSuggestedGroupWeightsWithCv(
    suggestedTop20GroupWeights,
    fallbackTemplateForCv?.groupWeights || {},
    cvReliability,
    { maxModelShare: 0.35 }
  );

  if (!HAS_CURRENT_RESULTS) {
    const fallbackTemplate = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    const priorTemplate = templateConfigs.TECHNICAL || fallbackTemplate;
    const fallbackGroupWeights = fallbackTemplate?.groupWeights || {};
    const fallbackMetricWeights = fallbackTemplate?.metricWeights || {};
    const priorGroupWeights = priorTemplate?.groupWeights || fallbackGroupWeights;
    const priorMetricWeights = priorTemplate?.metricWeights || fallbackMetricWeights;
    const priorShare = 0.6;
    const modelShare = 0.4;

    const filledGroupWeights = buildFilledGroupWeights(suggestedTop20GroupWeights, fallbackGroupWeights);
    const filledMetricWeights = buildMetricWeightsFromSuggested(
      metricConfig,
      suggestedTop20MetricWeights,
      fallbackMetricWeights
    );
    const blendedGroupWeights = blendGroupWeights(priorGroupWeights, filledGroupWeights, priorShare, modelShare);
    const blendedMetricWeights = blendMetricWeights(metricConfig, priorMetricWeights, filledMetricWeights, priorShare, modelShare);
    const invertedLabelSet = buildInvertedLabelSet(currentGeneratedTop20Correlations);
    const filledMetricWeightsWithInversions = applyInversionsToMetricWeights(
      metricConfig,
      filledMetricWeights,
      invertedLabelSet
    );
    const blendedMetricWeightsWithInversions = applyInversionsToMetricWeights(
      metricConfig,
      blendedMetricWeights,
      invertedLabelSet
    );
    const adjustedMetricWeights = applyShotDistributionToMetricWeights(
      blendedMetricWeightsWithInversions,
      sharedConfig.courseSetupWeights
    );

    const preEventMetricWeightsForGroups = applyShotDistributionToMetricWeights(
      adjustedMetricWeights,
      sharedConfig.courseSetupWeights
    );
    const preEventGroups = buildModifiedGroups(
      metricConfig.groups,
      blendedGroupWeights,
      preEventMetricWeightsForGroups
    );
    const preEventRanking = runRanking({
      roundsRawData: historyData,
      approachRawData: approachDataCurrent,
      groupWeights: blendedGroupWeights,
      metricWeights: adjustedMetricWeights,
      includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonBaseline)
    });
    const preEventRankingPlayers = formatRankingPlayers(
      preEventRanking.players,
      preEventGroups,
      preEventRanking.groupStats
    );

    if (approachDeltaAlignmentMap.size > 0 && approachDeltaRows.length > 0) {
      const trendScores = buildApproachDeltaPlayerScores(
        approachDeltaMetricSpecs,
        approachDeltaRows,
        approachDeltaAlignmentMap
      );
      const predictiveAlignmentMap = buildApproachAlignmentMapFromMetricWeights(
        metricConfig,
        adjustedMetricWeights,
        approachDeltaMetricSpecs
      );
      const predictiveScores = buildApproachDeltaPlayerScores(
        approachDeltaMetricSpecs,
        approachDeltaRows,
        predictiveAlignmentMap
      );

      approachDeltaPlayerSummary = {
        totalPlayers: approachDeltaRows.length,
        trendWeightedAll: trendScores,
        trendWeighted: {
          topMovers: trendScores.slice(0, 10),
          bottomMovers: trendScores.slice(-10).reverse()
        },
        predictiveWeightedAll: predictiveScores,
        predictiveWeighted: {
          topMovers: predictiveScores.slice(0, 10),
          bottomMovers: predictiveScores.slice(-10).reverse()
        }
      };
    }

    const fallbackOutputBaseName = (`event_${CURRENT_EVENT_ID}`)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_\-]/g, '');

    let outputBaseName = (TOURNAMENT_NAME || `event_${CURRENT_EVENT_ID}`)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_\-]/g, '')
      .replace(/^optimizer[_-]+/, '');

    if (!outputBaseName) outputBaseName = fallbackOutputBaseName;

    const preEventRankingPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_pre_event_rankings.json`);
    const preEventRankingCsvPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_pre_event_rankings.csv`);
    fs.writeFileSync(preEventRankingPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      eventId: CURRENT_EVENT_ID,
      season: CURRENT_SEASON,
      tournament: TOURNAMENT_NAME || 'Event',
      weights: {
        groupWeights: blendedGroupWeights,
        metricWeights: adjustedMetricWeights
      },
      players: preEventRankingPlayers
    }, null, 2));

    const rankingCsvContent = buildSheetLikeRankingCsv(preEventRanking, preEventGroups);
    fs.writeFileSync(preEventRankingCsvPath, rankingCsvContent);

    const output = {
      timestamp: new Date().toISOString(),
      mode: 'pre_event_training',
      eventId: CURRENT_EVENT_ID,
      season: CURRENT_SEASON,
      tournament: TOURNAMENT_NAME || 'Event',
      dryRun: DRY_RUN,
      preEventRanking: {
        path: preEventRankingPath,
        csvPath: preEventRankingCsvPath,
        totalPlayers: preEventRankingPlayers.length,
        top25: preEventRankingPlayers.slice(0, 25),
        players: preEventRankingPlayers
      },
      pastPerformanceWeighting: pastPerformanceWeightSummary,
      courseContextUpdates: courseContextUpdateSummary,
      apiSnapshots: {
        dataGolfRankings: {
          source: rankingsSnapshot?.source || 'unknown',
          path: rankingsSnapshot?.path || null,
          lastUpdated: rankingsSnapshot?.payload?.last_updated || null,
          count: Array.isArray(rankingsSnapshot?.payload?.rankings)
            ? rankingsSnapshot.payload.rankings.length
            : null
        },
        dataGolfApproachSkill: {
          source: approachSkillSnapshot?.source || 'unknown',
          path: approachSkillSnapshot?.path || null,
          lastUpdated: approachSkillSnapshot?.payload?.last_updated || null,
          timePeriod: approachSkillSnapshot?.payload?.time_period || DATAGOLF_APPROACH_PERIOD || null,
          count: Array.isArray(approachSkillSnapshot?.payload?.data)
            ? approachSkillSnapshot.payload.data.length
            : null
        },
        dataGolfApproachSnapshotL24: {
          source: approachSnapshotL24?.source || 'unknown',
          path: approachSnapshotL24?.path || null,
          lastUpdated: approachSnapshotL24?.payload?.last_updated || null,
          timePeriod: approachSnapshotL24?.payload?.time_period || 'l24',
          count: Array.isArray(approachSnapshotL24?.payload?.data)
            ? approachSnapshotL24.payload.data.length
            : null
        },
        dataGolfApproachSnapshotL12: {
          source: approachSnapshotL12?.source || 'unknown',
          path: approachSnapshotL12?.path || null,
          lastUpdated: approachSnapshotL12?.payload?.last_updated || null,
          timePeriod: approachSnapshotL12?.payload?.time_period || 'l12',
          count: Array.isArray(approachSnapshotL12?.payload?.data)
            ? approachSnapshotL12.payload.data.length
            : null
        },
        dataGolfApproachSnapshotYtd: {
          source: approachSnapshotYtd?.source || 'unknown',
          path: approachSnapshotYtd?.path || null,
          archivePath: approachSnapshotYtd?.archivePath || null,
          lastUpdated: approachSnapshotYtd?.payload?.last_updated || null,
          timePeriod: approachSnapshotYtd?.payload?.time_period || 'ytd',
          count: Array.isArray(approachSnapshotYtd?.payload?.data)
            ? approachSnapshotYtd.payload.data.length
            : null
        },
        dataGolfFieldUpdates: {
          source: fieldUpdatesSnapshot?.source || 'unknown',
          path: fieldUpdatesSnapshot?.path || null,
          eventName: fieldUpdatesSnapshot?.payload?.event_name || null,
          eventId: fieldUpdatesSnapshot?.payload?.event_id || null,
          tour: fieldUpdatesSnapshot?.payload?.tour || DATAGOLF_FIELD_TOUR || null,
          fieldCount: Array.isArray(fieldUpdatesSnapshot?.payload?.field)
            ? fieldUpdatesSnapshot.payload.field.length
            : null
        },
        dataGolfPlayerDecompositions: {
          source: playerDecompositionsSnapshot?.source || 'unknown',
          path: playerDecompositionsSnapshot?.path || null,
          lastUpdated: playerDecompositionsSnapshot?.payload?.last_updated || null,
          eventName: playerDecompositionsSnapshot?.payload?.event_name || null,
          tour: DATAGOLF_DECOMP_TOUR || null,
          count: Array.isArray(playerDecompositionsSnapshot?.payload?.players)
            ? playerDecompositionsSnapshot.payload.players.length
            : null
        },
        dataGolfSkillRatingsValue: {
          source: skillRatingsValueSnapshot?.source || 'unknown',
          path: skillRatingsValueSnapshot?.path || null,
          lastUpdated: skillRatingsValueSnapshot?.payload?.last_updated || null,
          display: DATAGOLF_SKILL_DISPLAY_VALUE || null,
          count: Array.isArray(skillRatingsValueSnapshot?.payload?.players)
            ? skillRatingsValueSnapshot.payload.players.length
            : null
        },
        dataGolfSkillRatingsRank: {
          source: skillRatingsRankSnapshot?.source || 'unknown',
          path: skillRatingsRankSnapshot?.path || null,
          lastUpdated: skillRatingsRankSnapshot?.payload?.last_updated || null,
          display: DATAGOLF_SKILL_DISPLAY_RANK || null,
          count: Array.isArray(skillRatingsRankSnapshot?.payload?.players)
            ? skillRatingsRankSnapshot.payload.players.length
            : null
        },
        dataGolfHistoricalRounds: {
          source: historicalRoundsSnapshot?.source || 'unknown',
          path: historicalRoundsSnapshot?.path || null,
          tour: DATAGOLF_HISTORICAL_TOUR || null,
          eventId: DATAGOLF_HISTORICAL_EVENT_ID || null,
          year: historicalYear || null,
          count: historicalRoundsSnapshot?.payload && typeof historicalRoundsSnapshot.payload === 'object'
            ? Object.keys(historicalRoundsSnapshot.payload).length
            : null
        }
      },
      trainingSource: 'historical+similar-course',
      trainingMetrics: trainingMetricNotes,
      historicalMetricCorrelations,
      currentGeneratedMetricCorrelations,
      currentGeneratedTop20Correlations,
      currentGeneratedTop20Logistic,
      currentGeneratedTop20CvSummary,
      cvReliability,
      approachDeltaPrior: {
        label: APPROACH_DELTA_PRIOR_LABEL,
        weight: APPROACH_DELTA_PRIOR_WEIGHT,
        mode: approachDeltaPriorMode || 'unavailable',
        sourcePath: approachDeltaPriorMode === 'current_event' ? (APPROACH_DELTA_PATH || null) : null,
        filesUsed: approachDeltaPriorFiles,
        meta: approachDeltaPriorMeta || null,
        rowsTotal: approachDeltaRowsAll.length,
        rowsUsed: approachDeltaRows.length,
        correlations: approachDeltaCorrelations,
        alignmentMap: Array.from(approachDeltaAlignmentMap.entries()).map(([label, correlation]) => ({ label, correlation })),
        playerSummary: approachDeltaPlayerSummary
      },
      blendSettings: {
        similarCourseIds: normalizeIdList(sharedConfig.similarCourseIds),
        puttingCourseIds: normalizeIdList(sharedConfig.puttingCourseIds),
        similarCoursesWeight: clamp01(sharedConfig.similarCoursesWeight, 0.3),
        puttingCoursesWeight: clamp01(sharedConfig.puttingCoursesWeight, 0.35)
      },
      suggestedTop20MetricWeights,
      suggestedTop20GroupWeights,
      conservativeSuggestedTop20GroupWeights,
      filledGroupWeights,
      filledMetricWeights: filledMetricWeightsWithInversions,
      blendedGroupWeights,
      blendedMetricWeights: blendedMetricWeightsWithInversions,
      blendedMetricWeightsAdjusted: adjustedMetricWeights,
      blendSettings: {
        priorTemplate: priorTemplate === templateConfigs.TECHNICAL ? 'TECHNICAL' : (priorTemplate === fallbackTemplate ? 'FALLBACK' : 'CUSTOM'),
        priorShare,
        modelShare
      }
    };

    const outputPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_pre_event_results.json`);
    const backupJsonPath = backupIfExists(outputPath);
    if (backupJsonPath) {
      console.log(`🗄️  Backed up previous JSON results to: ${backupJsonPath}`);
    }
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    const textLines = [];
    textLines.push('='.repeat(100));
    textLines.push('MODEL OPTIMIZER - PRE-EVENT TRAINING');
    textLines.push('='.repeat(100));
    textLines.push(`DRY RUN: ${DRY_RUN ? 'ON (template files not modified)' : 'OFF (templates written)'}`);
    textLines.push('');
    textLines.push('MODE: Historical + Similar-Course Training (no current-year results)');
    textLines.push(`Event: ${CURRENT_EVENT_ID} | Tournament: ${TOURNAMENT_NAME || 'Event'}`);
    textLines.push('');
    textLines.push('PAST PERFORMANCE WEIGHTING (course history regression):');
    textLines.push(`  Enabled: ${pastPerformanceWeightSummary.enabled ? 'yes' : 'no'}`);
    textLines.push(`  Course Num: ${pastPerformanceWeightSummary.courseNum || 'n/a'}`);
    if (pastPerformanceWeightSummary.regression) {
      const slope = Number(pastPerformanceWeightSummary.regression.slope);
      const pValue = Number(pastPerformanceWeightSummary.regression.pValue);
      textLines.push(`  Regression: slope=${Number.isFinite(slope) ? slope.toFixed(4) : 'n/a'}, p=${Number.isFinite(pValue) ? pValue.toFixed(6) : 'n/a'}`);
    } else {
      textLines.push('  Regression: n/a');
    }
    const computedWeightText = typeof pastPerformanceWeightSummary.computedWeight === 'number'
      ? pastPerformanceWeightSummary.computedWeight.toFixed(2)
      : 'n/a';
    const usedWeightText = typeof pastPerformanceWeightSummary.usedWeight === 'number'
      ? pastPerformanceWeightSummary.usedWeight.toFixed(2)
      : 'n/a';
    textLines.push(`  Computed Weight: ${computedWeightText}`);
    textLines.push(`  Used Weight (config): ${usedWeightText}`);
    const regressionSourceLabel = pastPerformanceWeightSummary.source || 'n/a';
    const regressionPathLabel = pastPerformanceWeightSummary.path ? path.basename(pastPerformanceWeightSummary.path) : null;
    textLines.push(`  Regression Source: ${regressionSourceLabel}${regressionPathLabel ? ` (${regressionPathLabel})` : ''}`);
    if (courseContextUpdateSummary) {
      const updateStatus = courseContextUpdateSummary.updated ? 'yes' : 'no';
      textLines.push(`  Course Context Updates: ${updateStatus} (${courseContextUpdateSummary.updatedCount || 0} entries)`);
      if (courseContextUpdateSummary.reason) {
        textLines.push(`  Update Note: ${courseContextUpdateSummary.reason}`);
      }
    }
    textLines.push('');
    textLines.push('STEP 1: HISTORICAL METRIC CORRELATIONS');
    HISTORICAL_METRICS.forEach(metric => {
      const avg = historicalMetricCorrelations.average[metric.key];
      const corrValue = avg ? avg.correlation : 0;
      const samples = avg ? avg.samples : 0;
      textLines.push(`  ${metric.label}: Corr=${corrValue.toFixed(4)}, Samples=${samples}`);
    });
    textLines.push('');
    textLines.push('TRAINING METRIC CORRELATIONS (historical outcomes):');
    if (!currentGeneratedMetricCorrelations.length) {
      textLines.push('  No metric correlations computed.');
    } else {
      currentGeneratedMetricCorrelations.forEach(entry => {
        textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
      });
    }
    textLines.push('');
    textLines.push('TRAINING METRICS USED:');
    textLines.push(`  Included: ${trainingMetricNotes.included.join(', ')}`);
    textLines.push(`  Excluded: ${trainingMetricNotes.excluded.join(', ')}`);
    textLines.push(`  Derived: ${trainingMetricNotes.derived.join('; ')}`);
    textLines.push('');
    textLines.push(`APPROACH DELTA PRIOR (${APPROACH_DELTA_PRIOR_LABEL}):`);
    if (approachDeltaPriorMode === 'rolling_average' || approachDeltaPriorMode === 'fallback_average') {
      const modeLabel = approachDeltaPriorMode === 'rolling_average' ? 'rolling_average' : 'fallback_average';
      const maxLabel = approachDeltaPriorMode === 'rolling_average' ? `, max=${APPROACH_DELTA_ROLLING_EVENTS}` : '';
      textLines.push(`  Mode: ${modeLabel} (files=${approachDeltaPriorFiles.length}${maxLabel})`);
      textLines.push(`  Rows used: ${approachDeltaRows.length}/${approachDeltaRowsAll.length}`);
      const rollingEntries = Array.from(approachDeltaAlignmentMap.entries())
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 10);
      if (rollingEntries.length === 0) {
        textLines.push('  No rolling alignment map computed.');
      } else {
        rollingEntries.forEach(([label, value]) => {
          textLines.push(`  ${label}: Score=${value.toFixed(4)}`);
        });
      }
      if (approachDeltaPlayerSummary?.trendWeighted?.topMovers?.length) {
        textLines.push('  Player delta movers (trend-weighted, top 10):');
        approachDeltaPlayerSummary.trendWeighted.topMovers.forEach((entry, idx) => {
          const name = entry.playerName || entry.dgId || 'Unknown';
          textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
        });
        textLines.push('  Player delta movers (trend-weighted, bottom 10):');
        approachDeltaPlayerSummary.trendWeighted.bottomMovers.forEach((entry, idx) => {
          const name = entry.playerName || entry.dgId || 'Unknown';
          textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
        });
      }
      if (approachDeltaPlayerSummary?.predictiveWeighted?.topMovers?.length) {
        textLines.push('  Player delta movers (predictive-weighted, top 10):');
        approachDeltaPlayerSummary.predictiveWeighted.topMovers.forEach((entry, idx) => {
          const name = entry.playerName || entry.dgId || 'Unknown';
          textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
        });
        textLines.push('  Player delta movers (predictive-weighted, bottom 10):');
        approachDeltaPlayerSummary.predictiveWeighted.bottomMovers.forEach((entry, idx) => {
          const name = entry.playerName || entry.dgId || 'Unknown';
          textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
        });
      }
    } else if (!approachDeltaCorrelations.length) {
      textLines.push('  No approach delta correlations computed (missing results or delta file).');
    } else {
      textLines.push(`  Weight: ${APPROACH_DELTA_PRIOR_WEIGHT.toFixed(2)}`);
      textLines.push(`  Source: ${APPROACH_DELTA_PATH || 'n/a'}`);
      textLines.push(`  Rows used: ${approachDeltaRows.length}/${approachDeltaRowsAll.length}`);
      approachDeltaCorrelations.slice(0, 10).forEach(entry => {
        textLines.push(`  ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
      });
    }
    textLines.push('');
    textLines.push('TRAINING TOP-20 SIGNAL (historical outcomes):');
    if (!currentGeneratedTop20Correlations.length) {
      textLines.push('  No top-20 correlations computed.');
    } else {
      currentGeneratedTop20Correlations.forEach(entry => {
        textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
      });
    }
    textLines.push('');
    textLines.push(`SUGGESTED METRIC WEIGHTS (TOP-20) - SOURCE: ${suggestedTop20MetricWeights.source}`);
    if (!suggestedTop20MetricWeights.weights.length) {
      textLines.push('  No suggested metric weights available.');
    } else {
      suggestedTop20MetricWeights.weights.slice(0, 15).forEach((entry, idx) => {
        const corrText = typeof entry.top20Correlation === 'number' ? entry.top20Correlation.toFixed(4) : 'n/a';
        const logisticText = typeof entry.logisticWeight === 'number' ? entry.logisticWeight.toFixed(4) : 'n/a';
        textLines.push(`  ${idx + 1}. ${entry.label}: weight=${entry.weight.toFixed(4)}, top20Corr=${corrText}, logisticWeight=${logisticText}`);
      });
    }
    textLines.push('');
    textLines.push(`SUGGESTED GROUP WEIGHTS (TOP-20) - SOURCE: ${suggestedTop20GroupWeights.source}`);
    if (!suggestedTop20GroupWeights.weights.length) {
      textLines.push('  No suggested group weights available.');
    } else {
      suggestedTop20GroupWeights.weights.forEach((entry, idx) => {
        textLines.push(`  ${idx + 1}. ${entry.groupName}: weight=${entry.weight.toFixed(4)}`);
      });
    }
    textLines.push('');
    textLines.push(`CV RELIABILITY (event-based): ${(cvReliability * 100).toFixed(1)}%`);
    textLines.push(`CONSERVATIVE GROUP WEIGHTS (CV-adjusted, model share ${(conservativeSuggestedTop20GroupWeights.modelShare * 100).toFixed(1)}%):`);
    if (!conservativeSuggestedTop20GroupWeights.weights.length) {
      textLines.push('  No CV-adjusted group weights available.');
    } else {
      conservativeSuggestedTop20GroupWeights.weights.forEach((entry, idx) => {
        textLines.push(`  ${idx + 1}. ${entry.groupName}: weight=${entry.weight.toFixed(4)}`);
      });
    }
    textLines.push('');
    textLines.push('FILLED GROUP WEIGHTS (normalized with fallback template):');
    Object.entries(filledGroupWeights).forEach(([groupName, weight]) => {
      textLines.push(`  ${groupName}: ${weight.toFixed(4)}`);
    });
    textLines.push('');
    textLines.push('FILLED METRIC WEIGHTS (group-level normalization applied):');
    Object.entries(filledMetricWeightsWithInversions).forEach(([metricKey, weight]) => {
      textLines.push(`  ${metricKey}: ${weight.toFixed(4)}`);
    });
    textLines.push('');
    textLines.push(`BLENDED GROUP WEIGHTS (prior ${Math.round(priorShare * 100)}% / model ${Math.round(modelShare * 100)}%):`);
    Object.entries(blendedGroupWeights).forEach(([groupName, weight]) => {
      textLines.push(`  ${groupName}: ${weight.toFixed(4)}`);
    });
    textLines.push('');
    textLines.push('BLENDED METRIC WEIGHTS (prior/model blend, normalized per group):');
    Object.entries(blendedMetricWeightsWithInversions).forEach(([metricKey, weight]) => {
      textLines.push(`  ${metricKey}: ${weight.toFixed(4)}`);
    });
    textLines.push('');
    textLines.push('ADJUSTED METRIC WEIGHTS (course setup applied):');
    Object.entries(adjustedMetricWeights).forEach(([metricKey, weight]) => {
      textLines.push(`  ${metricKey}: ${weight.toFixed(4)}`);
    });
    textLines.push('');
    textLines.push(`PRE-EVENT RANKINGS: ${path.basename(preEventRankingPath)}`);
    textLines.push(`  CSV: ${path.basename(preEventRankingCsvPath)}`);
    textLines.push(`  Players ranked: ${preEventRankingPlayers.length}`);
    textLines.push('');
    textLines.push('PRE-EVENT RANKINGS LIST (rank | player | WAR | notes):');
    preEventRankingPlayers.forEach(player => {
      const rankValue = player.rank ?? '';
      const warValue = typeof player.war === 'number' ? player.war.toFixed(2) : 'n/a';
      const notesValue = player.notes ? player.notes : '';
      textLines.push(`${rankValue} | ${player.name || 'Unknown'} | WAR: ${warValue} | ${notesValue}`.trim());
    });
    textLines.push('');

    const textOutputPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_pre_event_results.txt`);
    const backupTextPath = backupIfExists(textOutputPath);
    if (backupTextPath) {
      console.log(`🗄️  Backed up previous text results to: ${backupTextPath}`);
    }

    fs.writeFileSync(textOutputPath, textLines.join('\n'));

    console.log('✅ Pre-event training output saved (rankings generated).');
    console.log(`✅ JSON results saved to: ${path.resolve(OUTPUT_DIR, `${outputBaseName}_pre_event_results.json`)}`);
    console.log(`✅ Text results saved to: ${path.resolve(OUTPUT_DIR, `${outputBaseName}_pre_event_results.txt`)}\n`);

    if (WRITE_TEMPLATES || DRY_RUN) {
      if (DRY_RUN && !WRITE_TEMPLATES) {
        console.log('🧪 Dry-run enabled: generating preview outputs without writing templates.');
      }
      const preEventTemplateName = courseTemplateKey || String(CURRENT_EVENT_ID);
      const preEventTemplate = {
        name: preEventTemplateName,
        eventId: String(CURRENT_EVENT_ID),
        description: `${TOURNAMENT_NAME || 'Event'} ${CURRENT_SEASON || ''} Pre-Event Blended`,
        groupWeights: blendedGroupWeights,
        metricWeights: nestMetricWeights(adjustedMetricWeights)
      };

      const preEventTemplateTargets = [
        path.resolve(ROOT_DIR, 'utilities', 'weightTemplates.js')
      ];

      preEventTemplateTargets.forEach(filePath => {
        const result = upsertTemplateInFile(filePath, preEventTemplate, { replaceByEventId: true, dryRun: DRY_RUN });
        if (result.updated) {
          if (DRY_RUN && result.content) {
            const dryRunPath = path.resolve(dryRunOutputDir || OUTPUT_DIR, `dryrun_${path.basename(filePath)}`);
            fs.writeFileSync(dryRunPath, result.content, 'utf8');
            console.log(`🧪 Dry-run template output saved to: ${dryRunPath}`);
          } else {
            console.log(`✅ Pre-event template written to: ${filePath}`);
          }
        } else {
          console.warn(`⚠️  Pre-event template not written (unable to update): ${filePath}`);
        }
      });

      const deltaScoresByEvent = buildDeltaPlayerScoresEntry(
        CURRENT_EVENT_ID,
        CURRENT_SEASON,
        approachDeltaPlayerSummary
      );

      if (deltaScoresByEvent) {
        const deltaScoreTargets = [
          path.resolve(ROOT_DIR, 'utilities', 'deltaPlayerScores.js')
        ];
        const outputs = writeDeltaPlayerScoresFiles(deltaScoreTargets, deltaScoresByEvent, {
          dryRun: DRY_RUN,
          outputDir: dryRunOutputDir || OUTPUT_DIR
        });
        outputs.forEach(entry => {
          const label = entry.action === 'dryRun' ? '🧪 Dry-run delta scores saved to' : '✅ Delta scores written to';
          console.log(`${label}: ${entry.target}`);
        });
      } else {
        console.warn('⚠️  Delta player scores not written (missing player summary data).');
      }
    }
    return;
  }

  let alignmentMapForOptimization = currentGeneratedTop20AlignmentMap;
  const alignmentMaps = [];
  const alignmentWeights = [];

  if (currentGeneratedTop20AlignmentMap.size > 0) {
    alignmentMaps.push(currentGeneratedTop20AlignmentMap);
  }

  if (validationAlignmentMap.size > 0) {
    alignmentMaps.push(validationAlignmentMap);
    alignmentWeights.push(VALIDATION_PRIOR_WEIGHT);
  }

  if (deltaTrendAlignmentMap.size > 0) {
    alignmentMaps.push(deltaTrendAlignmentMap);
    alignmentWeights.push(DELTA_TREND_PRIOR_WEIGHT);
    console.log(`ℹ️  Blended delta trend prior (${Math.round(DELTA_TREND_PRIOR_WEIGHT * 100)}%) into alignment map.`);
  }

  if (approachDeltaAlignmentMap.size > 0) {
    alignmentMaps.push(approachDeltaAlignmentMap);
    alignmentWeights.push(APPROACH_DELTA_PRIOR_WEIGHT);
    console.log(`ℹ️  Blended ${APPROACH_DELTA_PRIOR_LABEL} (${Math.round(APPROACH_DELTA_PRIOR_WEIGHT * 100)}%) into alignment map.`);
  }

  if (currentGeneratedTop20AlignmentMap.size > 0) {
    const totalPriors = alignmentWeights.reduce((sum, value) => sum + value, 0);
    alignmentWeights.unshift(Math.max(0, 1 - totalPriors));
  }

  if (alignmentMaps.length > 0) {
    alignmentMapForOptimization = blendAlignmentMaps(alignmentMaps, alignmentWeights);
  }

  console.log('---');
  console.log('STEP 1c: CURRENT-SEASON TEMPLATE BASELINE');
  console.log(`Compare baseline templates for ${CURRENT_SEASON} only`);
  console.log('---');

  const templateResults = [];

  for (const [templateName, config] of Object.entries(templateConfigs)) {
    console.log(`\n🔄 Testing ${templateName} for ${CURRENT_SEASON}...`);

    const perYear = {};
    availableYears.forEach(year => {
      const rounds = roundsByYear[year] || [];
      const results = resultsByYear[year] || [];
      if (rounds.length === 0 || results.length === 0) return;

      const useApproach = String(year) === String(CURRENT_SEASON);
      const adjustedGroupWeights = useApproach ? config.groupWeights : removeApproachGroupWeights(config.groupWeights);
      const ranking = runRanking({
        roundsRawData: rounds,
        approachRawData: useApproach ? approachDataCurrent : [],
        groupWeights: adjustedGroupWeights,
        metricWeights: config.metricWeights,
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(useApproach ? currentEventRoundsDefaults.currentSeasonBaseline : currentEventRoundsDefaults.historicalEvaluation)
      });

      perYear[year] = evaluateRankings(ranking.players, results, {
        includeTopN: useApproach,
        includeTopNDetails: useApproach
      });
    });

    const aggregate = aggregateYearlyEvaluations(perYear);
    const currentEvaluation = perYear[CURRENT_SEASON] || null;

    const correlationAlignment = computeTemplateCorrelationAlignment(config.metricWeights, historicalMetricCorrelations.average);

    templateResults.push({
      name: templateName,
      evaluation: aggregate,
      evaluationCurrent: currentEvaluation,
      yearly: perYear,
      groupWeights: config.groupWeights,
      metricWeights: config.metricWeights,
      correlationAlignment
    });

    if (currentEvaluation) {
      const top10Text = typeof currentEvaluation.top10 === 'number' ? `${currentEvaluation.top10.toFixed(1)}%` : 'n/a';
      const top20Text = typeof currentEvaluation.top20 === 'number' ? `${currentEvaluation.top20.toFixed(1)}%` : 'n/a';
      const top20WeightedText = typeof currentEvaluation.top20WeightedScore === 'number' ? `${currentEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
      console.log(`   Correlation: ${currentEvaluation.correlation.toFixed(4)}`);
      console.log(`   Top-10: ${top10Text}`);
      console.log(`   Top-20: ${top20Text}`);
      console.log(`   Top-20 Weighted Score: ${top20WeightedText}`);
    } else {
      console.log(`   No evaluation data for ${CURRENT_SEASON}`);
    }
  }

  const bestTemplateByEval = [...templateResults].sort((a, b) => {
    const evalA = a.evaluationCurrent;
    const evalB = b.evaluationCurrent;

    if (!evalA && !evalB) {
      const aWeighted = typeof a.evaluation?.top20WeightedScore === 'number' ? a.evaluation.top20WeightedScore : -Infinity;
      const bWeighted = typeof b.evaluation?.top20WeightedScore === 'number' ? b.evaluation.top20WeightedScore : -Infinity;
      if (bWeighted !== aWeighted) return bWeighted - aWeighted;
      const aCorr = typeof a.evaluation?.correlation === 'number' ? a.evaluation.correlation : -Infinity;
      const bCorr = typeof b.evaluation?.correlation === 'number' ? b.evaluation.correlation : -Infinity;
      if (bCorr !== aCorr) return bCorr - aCorr;
      const aTop20 = typeof a.evaluation?.top20 === 'number' ? a.evaluation.top20 : -Infinity;
      const bTop20 = typeof b.evaluation?.top20 === 'number' ? b.evaluation.top20 : -Infinity;
      return bTop20 - aTop20;
    }
    if (!evalA) return 1;
    if (!evalB) return -1;

    const aWeighted = typeof evalA.top20WeightedScore === 'number' ? evalA.top20WeightedScore : -Infinity;
    const bWeighted = typeof evalB.top20WeightedScore === 'number' ? evalB.top20WeightedScore : -Infinity;
    if (bWeighted !== aWeighted) return bWeighted - aWeighted;

    if (evalB.correlation !== evalA.correlation) {
      return evalB.correlation - evalA.correlation;
    }

    const aTop20 = typeof evalA.top20 === 'number' ? evalA.top20 : -Infinity;
    const bTop20 = typeof evalB.top20 === 'number' ? evalB.top20 : -Infinity;
    return bTop20 - aTop20;
  })[0];

  let baselineTemplate = bestTemplateByEval;
  let optimizationTemplate = bestTemplateByEval;

  const preferredTemplateName = courseContextEntryFinal?.templateKey
    ? String(courseContextEntryFinal.templateKey).trim()
    : null;

  if (!TEMPLATE && preferredTemplateName) {
    const preferredResult = templateResults.find(result => result.name === preferredTemplateName);
    if (preferredResult) {
      baselineTemplate = preferredResult;
      console.log(`ℹ️  Using course-context template: ${preferredTemplateName}`);
    } else {
      console.warn(`ℹ️  Course-context template not found in weightTemplates: ${preferredTemplateName}`);
    }
  }

  const bestTemplate = baselineTemplate || bestTemplateByEval;
  if (!bestTemplate) {
    throw new Error('No baseline template resolved for post-event optimizer run.');
  }

  const baselineEvaluation = baselineTemplate.evaluationCurrent || baselineTemplate.evaluation;
  const configTemplateResult = templateResults.find(result => result.name === String(CURRENT_EVENT_ID));
  const configBaselineEvaluation = configTemplateResult ? (configTemplateResult.evaluationCurrent || configTemplateResult.evaluation) : null;

  console.log('---');
  console.log('STEP 2: TOP-20 GROUP WEIGHT TUNING');
  console.log(`Tune lower-importance groups for Top-20 outcomes (event ${CURRENT_EVENT_ID}, all years)`);
  console.log('---');

  const step2BaseTemplate = optimizationTemplate;
  const step2BaseTemplateName = step2BaseTemplate?.name || 'UNKNOWN';
  const step2MetricWeights = step2BaseTemplate?.metricWeights || {};

  const groupWeightsSeed = conservativeSuggestedTop20GroupWeights.weights.length > 0
    ? buildGroupWeightsMap(conservativeSuggestedTop20GroupWeights.weights)
    : step2BaseTemplate.groupWeights;
  const groupWeightsSeedNormalized = normalizeWeights(groupWeightsSeed);
  const optimizableGroups = selectOptimizableGroups(conservativeSuggestedTop20GroupWeights.weights.length > 0
    ? conservativeSuggestedTop20GroupWeights.weights
    : Object.entries(groupWeightsSeedNormalized).map(([groupName, weight]) => ({ groupName, weight })), 3);

  const GROUP_TUNE_RANGE = 0.25; // ±25% adjustments
  const GROUP_TUNE_TESTS = 400;

  const tunedResults = [];
  for (let i = 0; i < GROUP_TUNE_TESTS; i++) {
    const candidate = { ...groupWeightsSeedNormalized };
    optimizableGroups.forEach(groupName => {
      const base = candidate[groupName] || 0.0001;
      const adjustment = (rand() * 2 - 1) * GROUP_TUNE_RANGE;
      candidate[groupName] = Math.max(0.0001, base * (1 + adjustment));
    });
    const normalizedCandidate = normalizeWeights(candidate);

    const perYear = {};
    availableYears.forEach(year => {
      const rounds = roundsByYear[year] || [];
      const results = resultsByYear[year] || [];
      if (rounds.length === 0 || results.length === 0) return;
      const useApproach = String(year) === String(CURRENT_SEASON);
      const adjustedGroupWeights = useApproach
        ? normalizedCandidate
        : removeApproachGroupWeights(normalizedCandidate);
      const ranking = runRanking({
        roundsRawData: rounds,
        approachRawData: useApproach ? approachDataCurrent : [],
        groupWeights: adjustedGroupWeights,
        metricWeights: step2MetricWeights,
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(
          useApproach ? currentEventRoundsDefaults.currentSeasonOptimization : currentEventRoundsDefaults.historicalEvaluation
        )
      });
      perYear[year] = evaluateRankings(ranking.players, results, { includeTopN: true });
    });
    const evaluation = aggregateYearlyEvaluations(perYear);
    tunedResults.push({
      groupWeights: normalizedCandidate,
      evaluation
    });
  }

  tunedResults.sort((a, b) => {
    const top20A = typeof a.evaluation.top20 === 'number' ? a.evaluation.top20 : -Infinity;
    const top20B = typeof b.evaluation.top20 === 'number' ? b.evaluation.top20 : -Infinity;
    if (top20B !== top20A) return top20B - top20A;
    if (a.evaluation.rmse !== b.evaluation.rmse) return a.evaluation.rmse - b.evaluation.rmse;
    return b.evaluation.correlation - a.evaluation.correlation;
  });

  tunedTop20GroupWeights = tunedResults[0] || null;

  if (tunedTop20GroupWeights) {
    const bestEval = tunedTop20GroupWeights.evaluation;
    const top10Text = typeof bestEval.top10 === 'number' ? `${bestEval.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof bestEval.top20 === 'number' ? `${bestEval.top20.toFixed(1)}%` : 'n/a';
    const rmseText = typeof bestEval.rmse === 'number' ? bestEval.rmse.toFixed(2) : 'n/a';
    console.log(`✓ Top-20 tuning best: Top-10=${top10Text}, Top-20=${top20Text}, RMSE=${rmseText}, Corr=${bestEval.correlation.toFixed(4)}`);
  }

  console.log('---');
  console.log('BEST BASELINE TEMPLATE (CURRENT YEAR)');
  console.log('---');

  const baselineTop10Current = typeof baselineEvaluation.top10 === 'number' ? `${baselineEvaluation.top10.toFixed(1)}%` : 'n/a';
  const baselineTop20 = typeof baselineEvaluation.top20 === 'number' ? `${baselineEvaluation.top20.toFixed(1)}%` : 'n/a';
  const baselineTop20Weighted = typeof baselineEvaluation.top20WeightedScore === 'number' ? `${baselineEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';

  console.log(`\n✅ Baseline Template (rankings): ${baselineTemplate.name}`);
  console.log(`   Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  console.log(`   Top-10: ${baselineTop10Current}`);
  console.log(`   Top-20: ${baselineTop20}`);
  console.log(`   Top-20 Weighted Score: ${baselineTop20Weighted}\n`);
  if (optimizationTemplate?.name && optimizationTemplate.name !== baselineTemplate.name) {
    console.log(`✅ Optimization seed template: ${optimizationTemplate.name}`);
  }

  // ============================================================================
  // STEP 3: WEIGHT OPTIMIZATION (with 2026 approach metrics)
  // ============================================================================
  console.log('---');
  console.log('STEP 3: WEIGHT OPTIMIZATION');
  console.log('Randomized search starting from best template baseline');
  console.log('Using current season results for optimization (current-year field only)');
  console.log('---');

  // Random search from best template
  console.log(`🔄 Grid search optimization from ${optimizationTemplate.name} baseline...`);
  console.log(`   Starting correlation: ${baselineEvaluation.correlation.toFixed(4)}`);

  const GROUP_GRID_RANGE = 0.20;
  const METRIC_GRID_RANGE = 0.15;
  const parsedEnvTests = parseInt(OPT_TESTS_RAW, 10);
  const MAX_TESTS = MAX_TESTS_OVERRIDE
    ?? (Number.isNaN(parsedEnvTests) ? 1500 : parsedEnvTests);
  const optimizedResults = [];
  const WEIGHT_OBJECTIVE = {
    correlation: 0.3,
    top20: 0.5,
    alignment: 0.2
  };
  
  for (let i = 0; i < MAX_TESTS; i++) {
    const weights = { ...optimizationTemplate.groupWeights };
    const groupNames = Object.keys(weights);
    const numAdjust = 2 + Math.floor(rand() * 2);
    for (let j = 0; j < numAdjust; j++) {
      const groupName = groupNames[Math.floor(rand() * groupNames.length)];
      const adjustment = (rand() * 2 - 1) * GROUP_GRID_RANGE;
      weights[groupName] = Math.max(0.001, weights[groupName] * (1 + adjustment));
    }

    const normalizedWeights = normalizeWeights(weights);
    let adjustedMetricWeights = adjustMetricWeights(optimizationTemplate.metricWeights, metricConfig, METRIC_GRID_RANGE);
    if (validationMetricConstraints && Object.keys(validationMetricConstraints).length > 0) {
      adjustedMetricWeights = applyMetricWeightConstraints(metricConfig, adjustedMetricWeights, validationMetricConstraints);
    }

    let evaluation;
    const ranking = runRanking({
      roundsRawData: getCurrentSeasonRoundsForRanking(
        resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonOptimization)
      ),
      approachRawData: approachDataCurrent,
      groupWeights: normalizedWeights,
      metricWeights: adjustedMetricWeights,
      includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonOptimization)
    });
    evaluation = evaluateRankings(ranking.players, resultsCurrent, { includeTopN: true });

    const alignmentScore = alignmentMapForOptimization.size > 0
      ? computeMetricAlignmentScore(adjustedMetricWeights, normalizedWeights, alignmentMapForOptimization)
      : 0;
    const correlationScore = (evaluation.correlation + 1) / 2;
    const top20Score = buildTop20CompositeScore(evaluation);
    const alignmentNormalized = (alignmentScore + 1) / 2;
    const combinedScore = (
      WEIGHT_OBJECTIVE.correlation * correlationScore +
      WEIGHT_OBJECTIVE.top20 * top20Score +
      WEIGHT_OBJECTIVE.alignment * alignmentNormalized
    );

    optimizedResults.push({
      weights: normalizedWeights,
      metricWeights: adjustedMetricWeights,
      alignmentScore,
      top20Score,
      combinedScore,
      ...evaluation
    });
    
    if ((i + 1) % 100 === 0) {
      console.log(`   Tested ${i + 1}/${MAX_TESTS}...`);
    }
  }
  
  optimizedResults.sort((a, b) => {
    const scoreDiff = (b.combinedScore || 0) - (a.combinedScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return b.correlation - a.correlation;
  });
  const bestOptimized = optimizedResults[0];
  
  console.log(`\n✅ Best Optimized: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`   Metric Alignment Score (Top-20 KPI blend): ${bestOptimized.alignmentScore.toFixed(4)}`);
  console.log(`   Top-20 Composite Score: ${(bestOptimized.top20Score * 100).toFixed(1)}%`);
  console.log(`   Combined Objective Score: ${bestOptimized.combinedScore.toFixed(4)}`);
  const improvement = bestOptimized.correlation - baselineEvaluation.correlation;
  console.log(`   Improvement: ${((improvement) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  const bestOptimizedTop10 = typeof bestOptimized.top10 === 'number' ? `${bestOptimized.top10.toFixed(1)}%` : 'n/a';
  const optimizedTop20Text = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const optimizedTop20WeightedText = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';
  console.log(`   Top-10: ${bestOptimizedTop10}`);
  console.log(`   Top-20: ${optimizedTop20Text}`);
  console.log(`   Top-20 Weighted Score: ${optimizedTop20WeightedText}\n`);

  const optimizedRankingCurrent = runRanking({
    roundsRawData: getCurrentSeasonRoundsForRanking(
      resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonOptimization)
    ),
    approachRawData: approachDataCurrent,
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || optimizationTemplate.metricWeights,
    includeCurrentEventRounds: resolveIncludeCurrentEventRounds(currentEventRoundsDefaults.currentSeasonOptimization)
  });

  const optimizedEvaluationCurrent = resultsCurrent.length > 0
    ? evaluateRankings(optimizedRankingCurrent.players, resultsCurrent, { includeTopN: true })
    : null;

  // ============================================================================
  // STEP 4a/4b: MULTI-YEAR VALIDATION (BASELINE + OPTIMIZED)
  // ============================================================================
  console.log('---');
  console.log('STEP 4a/4b: MULTI-YEAR VALIDATION');
  console.log('Test baseline vs optimized weights across all available years');
  console.log('---');

  const skillRatingsValidationValue = buildSkillRatingsValidation(
    optimizedRankingCurrent,
    skillRatingsValueSnapshot,
    metricConfig,
    { mode: DATAGOLF_SKILL_DISPLAY_VALUE }
  );
  const skillRatingsValidationRank = buildSkillRatingsValidation(
    optimizedRankingCurrent,
    skillRatingsRankSnapshot,
    metricConfig,
    { mode: DATAGOLF_SKILL_DISPLAY_RANK, fallbackSnapshot: skillRatingsValueSnapshot }
  );
  const playerDecompositionValidation = buildPlayerDecompositionValidation(
    optimizedRankingCurrent,
    playerDecompositionsSnapshot
  );

  if (skillRatingsValidationValue.status === 'ok') {
    console.log(`✓ Skill ratings (value) validation: avg |ρ|=${skillRatingsValidationValue.avgAbsCorrelation.toFixed(3)} across ${skillRatingsValidationValue.metrics.length} metrics (matched players: ${skillRatingsValidationValue.matchedPlayers})`);
  } else {
    console.log(`ℹ️  Skill ratings (value) validation skipped (${skillRatingsValidationValue.reason || 'unavailable'})`);
  }

  if (skillRatingsValidationRank.status === 'ok') {
    const rankNote = skillRatingsValidationRank.derivedFromValue ? ' (derived from value)' : '';
    console.log(`✓ Skill ratings (rank) validation${rankNote}: avg |ρ|=${skillRatingsValidationRank.avgAbsCorrelation.toFixed(3)} across ${skillRatingsValidationRank.metrics.length} metrics (matched players: ${skillRatingsValidationRank.matchedPlayers})`);
  } else {
    console.log(`ℹ️  Skill ratings (rank) validation skipped (${skillRatingsValidationRank.reason || 'unavailable'})`);
  }

  if (playerDecompositionValidation.status === 'ok') {
    console.log(`✓ Player decompositions validation: ρ=${playerDecompositionValidation.correlation.toFixed(3)} (matched players: ${playerDecompositionValidation.matchedPlayers})`);
  } else {
    console.log(`ℹ️  Player decompositions validation skipped (${playerDecompositionValidation.reason || 'unavailable'})`);
  }

  const runMultiYearValidation = ({ label, groupWeights, metricWeights, approachOverride = null }) => {
    console.log(`\n🔄 ${label}: building multi-year validation data...`);
    console.log(`   Approach mode: ${VALIDATION_APPROACH_MODE}`);

    const results = {};
    console.log(`\n📊 Historical rounds by year (${label}):`);

    for (const year of validationYears) {
      const rounds = roundsByYear[year] || [];
      console.log(`\n  ${year}: ${rounds.length} rounds`);

      const approachUsage = approachOverride === 'none'
        ? {
            rows: [],
            meta: {
              year,
              mode: VALIDATION_APPROACH_MODE,
              period: 'none',
              source: 'none',
              leakageFlag: 'none'
            }
          }
        : resolveApproachUsageForYear(year);
      const approachRows = approachUsage.rows;
      const useApproach = approachRows.length > 0 && approachOverride !== 'none';
      const adjustedGroupWeights = useApproach
        ? groupWeights
        : removeApproachGroupWeights(groupWeights);
      const ranking = runRanking({
        roundsRawData: rounds,
        approachRawData: useApproach ? approachRows : [],
        groupWeights: adjustedGroupWeights,
        metricWeights,
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(
          useApproach ? currentEventRoundsDefaults.currentSeasonOptimization : currentEventRoundsDefaults.historicalEvaluation
        )
      });

      const evaluationResults = resultsByYear[year] && resultsByYear[year].length > 0
        ? resultsByYear[year]
        : resultsCurrent;
      const evaluation = evaluateRankings(ranking.players, evaluationResults, {
        includeTopN: true,
        includeTopNDetails: true,
        includeAdjusted: true
      });
      results[year] = {
        ...evaluation,
        approachUsage: approachUsage.meta
      };

      const top10Text = typeof evaluation.top10 === 'number' ? `${evaluation.top10.toFixed(1)}%` : 'n/a';
      const top20Text = typeof evaluation.top20 === 'number' ? `${evaluation.top20.toFixed(1)}%` : 'n/a';
      const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `${evaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
      const top10OverlapText = evaluation.top10Details ? `${evaluation.top10Details.overlapCount}/10` : 'n/a';
      const top20OverlapText = evaluation.top20Details ? `${evaluation.top20Details.overlapCount}/20` : 'n/a';
      const stress = evaluateStressTest(evaluation, {
        minPlayers: 20,
        minCorr: 0.1,
        minTop20Weighted: 60
      });
      const stressText = stress.status
        ? `${stress.status.toUpperCase()}${stress.reason ? ` (${stress.reason})` : ''}`
        : 'n/a';
      const subsetEval = evaluation.adjusted?.subset || null;
      const percentileEval = evaluation.adjusted?.percentile || null;
      const subsetTop10Text = subsetEval && typeof subsetEval.top10 === 'number' ? `${subsetEval.top10.toFixed(1)}%` : 'n/a';
      const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `${subsetEval.top20.toFixed(1)}%` : 'n/a';
      const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? subsetEval.rmse.toFixed(2) : 'n/a';
      const pctTop10Text = percentileEval && typeof percentileEval.top10 === 'number' ? `${percentileEval.top10.toFixed(1)}%` : 'n/a';
      const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `${percentileEval.top20.toFixed(1)}%` : 'n/a';
      const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? percentileEval.rmse.toFixed(2) : 'n/a';
      console.log(`     Correlation: ${evaluation.correlation.toFixed(4)} | Top-10: ${top10Text} | Top-20: ${top20Text} | Top-20 Weighted: ${top20WeightedText} | Subset RMSE: ${subsetRmseText} | Subset Top-10: ${subsetTop10Text} | Subset Top-20: ${subsetTop20Text} | Pct RMSE: ${pctRmseText} | Pct Top-10: ${pctTop10Text} | Pct Top-20: ${pctTop20Text} | Stress: ${stressText} | Top-10 Overlap: ${top10OverlapText} | Top-20 Overlap: ${top20OverlapText}`);
    }

    return results;
  };

  const aggregateFoldEvaluations = folds => {
    if (!Array.isArray(folds) || folds.length === 0) return null;
    const totals = folds.reduce((acc, evaluation) => {
      const weight = evaluation?.matchedPlayers || 0;
      acc.matchedPlayers += weight;
      acc.correlation += (evaluation?.correlation || 0) * weight;
      acc.rmse += (evaluation?.rmse || 0) * weight;
      acc.rSquared += (evaluation?.rSquared || 0) * weight;
      acc.meanError += (evaluation?.meanError || 0) * weight;
      acc.stdDevError += (evaluation?.stdDevError || 0) * weight;
      acc.mae += (evaluation?.mae || 0) * weight;
      if (typeof evaluation?.top10 === 'number') {
        acc.top10 += evaluation.top10 * weight;
      }
      if (typeof evaluation?.top20 === 'number') {
        acc.top20 += evaluation.top20 * weight;
        acc.top20WeightedScore += (evaluation?.top20WeightedScore || 0) * weight;
      }
      return acc;
    }, {
      correlation: 0,
      rmse: 0,
      rSquared: 0,
      meanError: 0,
      stdDevError: 0,
      mae: 0,
      top10: 0,
      top20: 0,
      top20WeightedScore: 0,
      matchedPlayers: 0
    });

    if (totals.matchedPlayers === 0) return null;
    return {
      correlation: totals.correlation / totals.matchedPlayers,
      rmse: totals.rmse / totals.matchedPlayers,
      rSquared: totals.rSquared / totals.matchedPlayers,
      meanError: totals.meanError / totals.matchedPlayers,
      stdDevError: totals.stdDevError / totals.matchedPlayers,
      mae: totals.mae / totals.matchedPlayers,
      top10: totals.top10 > 0 ? totals.top10 / totals.matchedPlayers : null,
      top20: totals.top20 > 0 ? totals.top20 / totals.matchedPlayers : null,
      top20WeightedScore: totals.top20WeightedScore > 0 ? totals.top20WeightedScore / totals.matchedPlayers : null,
      matchedPlayers: totals.matchedPlayers
    };
  };

  const runEventKFoldValidation = ({ label, groupWeights, metricWeights }) => {
    console.log(`\n🔄 ${label}: event-based K-fold validation...`);
    const results = {};

    const rawK = parseInt(String(process.env.EVENT_KFOLD_K || '').trim(), 10);
    const kOverride = Number.isNaN(rawK) ? null : rawK;
    const defaultSeed = OPT_SEED_RAW || `${CURRENT_EVENT_ID}-${CURRENT_SEASON}`;
    const seedOverride = String(process.env.EVENT_KFOLD_SEED || defaultSeed).trim();

    validationYears.forEach(year => {
      const yearRows = historyData.filter(row => {
        const rowYear = parseInt(String(row?.year || row?.season || '').trim(), 10);
        return !Number.isNaN(rowYear) && rowYear === year;
      });

      const events = new Map();
      yearRows.forEach(row => {
        const eventId = String(row?.event_id || '').trim();
        if (!eventId) return;
        if (!events.has(eventId)) events.set(eventId, []);
        events.get(eventId).push(row);
      });

      const eventEntries = Array.from(events.entries());
      if (eventEntries.length < 3) {
        results[year] = {
          status: 'unavailable',
          reason: 'not_enough_events',
          eventCount: eventEntries.length
        };
        return;
      }

      const useLeaveOneOut = !kOverride || kOverride <= 1 || kOverride >= eventEntries.length;
      const foldMode = useLeaveOneOut ? 'leave_one_event_out' : 'k_fold';
      const foldCount = useLeaveOneOut ? eventEntries.length : kOverride;
      const rng = createSeededRng(seedOverride || `${CURRENT_EVENT_ID}-${year}`) || Math.random;
      const shuffleEntries = (entries, rngFn) => {
        const output = [...entries];
        for (let i = output.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rngFn() * (i + 1));
          [output[i], output[j]] = [output[j], output[i]];
        }
        return output;
      };

      const shuffledEntries = useLeaveOneOut
        ? eventEntries
        : shuffleEntries(eventEntries, rng);

      const folds = Array.from({ length: foldCount }, () => []);
      shuffledEntries.forEach((entry, idx) => {
        folds[idx % foldCount].push(entry);
      });

      const fieldDataOverride = buildFieldDataFromHistory(yearRows, null);
      const approachUsage = resolveApproachUsageForYear(year);
      const approachRows = approachUsage.rows;
      const useApproach = approachRows.length > 0;
      const adjustedGroupWeights = useApproach
        ? groupWeights
        : removeApproachGroupWeights(groupWeights);

      const foldEvaluations = [];
      const foldSummaries = [];
      folds.forEach((fold, foldIndex) => {
        if (!fold.length) return;
        const foldEventIds = new Set(fold.map(([eventId]) => String(eventId).trim()));
        const testRows = yearRows.filter(row => foldEventIds.has(String(row?.event_id || '').trim()));
        const trainingRows = yearRows.filter(row => !foldEventIds.has(String(row?.event_id || '').trim()));
        if (trainingRows.length < 30 || testRows.length < 10) return;

        const ranking = runRanking({
          roundsRawData: trainingRows,
          approachRawData: useApproach ? approachRows : [],
          groupWeights: adjustedGroupWeights,
          metricWeights,
          includeCurrentEventRounds: false,
          fieldDataOverride
        });

        const testResults = buildResultsFromRows(testRows);
        if (!testResults.length) return;
        const evaluation = evaluateRankings(ranking.players, testResults, {
          includeTopN: true,
          includeTopNDetails: false,
          includeAdjusted: true
        });
        foldEvaluations.push(evaluation);
        foldSummaries.push({
          fold: foldIndex + 1,
          eventCount: fold.length,
          testRows: testRows.length,
          trainingRows: trainingRows.length,
          matchedPlayers: evaluation.matchedPlayers,
          correlation: evaluation.correlation,
          rmse: evaluation.rmse,
          top10: evaluation.top10,
          top20: evaluation.top20,
          top20WeightedScore: evaluation.top20WeightedScore
        });
      });

      const aggregate = aggregateFoldEvaluations(foldEvaluations);
      results[year] = aggregate
        ? {
            status: 'ok',
            mode: foldMode,
            foldCount,
            eventCount: eventEntries.length,
            foldsUsed: foldEvaluations.length,
            evaluation: aggregate,
            folds: foldSummaries,
            approachUsage: approachUsage.meta
          }
        : {
            status: 'unavailable',
            reason: 'no_valid_folds',
            eventCount: eventEntries.length,
            approachUsage: approachUsage.meta
          };
    });

    return results;
  };

  const baselineMultiYearResults = runMultiYearValidation({
    label: 'STEP 4a BASELINE',
    groupWeights: bestTemplate.groupWeights,
    metricWeights: bestTemplate.metricWeights
  });

  const noApproachMultiYearResults = runMultiYearValidation({
    label: 'STEP 4a NO-APPROACH BASELINE',
    groupWeights: bestTemplate.groupWeights,
    metricWeights: bestTemplate.metricWeights,
    approachOverride: 'none'
  });

  const optimizedMultiYearResults = runMultiYearValidation({
    label: 'STEP 4b OPTIMIZED',
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights
  });

  const baselineEventKFold = runEventKFoldValidation({
    label: 'STEP 4a BASELINE',
    groupWeights: bestTemplate.groupWeights,
    metricWeights: bestTemplate.metricWeights
  });

  const optimizedEventKFold = runEventKFoldValidation({
    label: 'STEP 4b OPTIMIZED',
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights
  });

  // ============================================================================
  // FINAL RESULTS
  // ============================================================================
  console.log('---');
  console.log('FINAL SUMMARY');
  console.log('---');

  console.log('\nBaseline Template Analysis (Current Year):');
  console.log(`  Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  console.log(`   Top-10: ${baselineTop10Current}`);
  console.log(`   Top-20: ${baselineTop20}`);
  console.log(`   Top-20 Weighted Score: ${baselineTop20Weighted}\n`);

  console.log('\nOptimized Results (2026):');
  console.log(`  Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`  Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  console.log(`  Top-10: ${bestOptimizedTop10}`);
  const bestOptimizedTop20 = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const bestOptimizedTop20Weighted = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';
  console.log(`  Top-20: ${bestOptimizedTop20}`);
  console.log(`  Top-20 Weighted Score: ${bestOptimizedTop20Weighted}`);

  console.log('\nMulti-Year Validation (Baseline):');
  Object.entries(baselineMultiYearResults).forEach(([year, evalResult]) => {
    const top10Text = typeof evalResult.top10 === 'number' ? `${evalResult.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evalResult.top20 === 'number' ? `${evalResult.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evalResult.top20WeightedScore === 'number' ? `${evalResult.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = evalResult.top10Details ? `${evalResult.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = evalResult.top20Details ? `${evalResult.top20Details.overlapCount}/20` : 'n/a';
    const subsetEval = evalResult.adjusted?.subset || null;
    const percentileEval = evalResult.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? subsetEval.rmse.toFixed(2) : 'n/a';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `${subsetEval.top20.toFixed(1)}%` : 'n/a';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? percentileEval.rmse.toFixed(2) : 'n/a';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `${percentileEval.top20.toFixed(1)}%` : 'n/a';
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-10=${top10Text} | Top-20=${top20Text} | Top-20 Weighted=${top20WeightedText} | Subset RMSE=${subsetRmseText} | Subset Top-20=${subsetTop20Text} | Pct RMSE=${pctRmseText} | Pct Top-20=${pctTop20Text} | Top-10 Overlap=${top10OverlapText} | Top-20 Overlap=${top20OverlapText}`);
  });

  console.log('\nMulti-Year Validation (No-Approach Baseline):');
  Object.entries(noApproachMultiYearResults).forEach(([year, evalResult]) => {
    const top10Text = typeof evalResult.top10 === 'number' ? `${evalResult.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evalResult.top20 === 'number' ? `${evalResult.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evalResult.top20WeightedScore === 'number' ? `${evalResult.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = evalResult.top10Details ? `${evalResult.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = evalResult.top20Details ? `${evalResult.top20Details.overlapCount}/20` : 'n/a';
    const subsetEval = evalResult.adjusted?.subset || null;
    const percentileEval = evalResult.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? subsetEval.rmse.toFixed(2) : 'n/a';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `${subsetEval.top20.toFixed(1)}%` : 'n/a';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? percentileEval.rmse.toFixed(2) : 'n/a';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `${percentileEval.top20.toFixed(1)}%` : 'n/a';
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-10=${top10Text} | Top-20=${top20Text} | Top-20 Weighted=${top20WeightedText} | Subset RMSE=${subsetRmseText} | Subset Top-20=${subsetTop20Text} | Pct RMSE=${pctRmseText} | Pct Top-20=${pctTop20Text} | Top-10 Overlap=${top10OverlapText} | Top-20 Overlap=${top20OverlapText}`);
  });

  console.log('\nMulti-Year Validation (Optimized):');
  Object.entries(optimizedMultiYearResults).forEach(([year, evalResult]) => {
    const top10Text = typeof evalResult.top10 === 'number' ? `${evalResult.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evalResult.top20 === 'number' ? `${evalResult.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evalResult.top20WeightedScore === 'number' ? `${evalResult.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = evalResult.top10Details ? `${evalResult.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = evalResult.top20Details ? `${evalResult.top20Details.overlapCount}/20` : 'n/a';
    const subsetEval = evalResult.adjusted?.subset || null;
    const percentileEval = evalResult.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? subsetEval.rmse.toFixed(2) : 'n/a';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `${subsetEval.top20.toFixed(1)}%` : 'n/a';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? percentileEval.rmse.toFixed(2) : 'n/a';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `${percentileEval.top20.toFixed(1)}%` : 'n/a';
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-10=${top10Text} | Top-20=${top20Text} | Top-20 Weighted=${top20WeightedText} | Subset RMSE=${subsetRmseText} | Subset Top-20=${subsetTop20Text} | Pct RMSE=${pctRmseText} | Pct Top-20=${pctTop20Text} | Top-10 Overlap=${top10OverlapText} | Top-20 Overlap=${top20OverlapText}`);
  });

  console.log('\nEvent K-Fold Validation (Baseline):');
  Object.entries(baselineEventKFold).forEach(([year, result]) => {
    if (!result || result.status !== 'ok') {
      console.log(`  ${year}: unavailable (${result?.reason || 'n/a'})`);
      return;
    }
    const evaluation = result.evaluation || {};
    const top10Text = typeof evaluation.top10 === 'number' ? `${evaluation.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evaluation.top20 === 'number' ? `${evaluation.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `${evaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`  ${year}: mode=${result.mode || 'n/a'}, folds=${result.foldsUsed}/${result.foldCount || 'n/a'}, Corr=${evaluation.correlation?.toFixed(4) || 'n/a'}, Top-10=${top10Text}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}`);
  });

  console.log('\nEvent K-Fold Validation (Optimized):');
  Object.entries(optimizedEventKFold).forEach(([year, result]) => {
    if (!result || result.status !== 'ok') {
      console.log(`  ${year}: unavailable (${result?.reason || 'n/a'})`);
      return;
    }
    const evaluation = result.evaluation || {};
    const top10Text = typeof evaluation.top10 === 'number' ? `${evaluation.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evaluation.top20 === 'number' ? `${evaluation.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `${evaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`  ${year}: mode=${result.mode || 'n/a'}, folds=${result.foldsUsed}/${result.foldCount || 'n/a'}, Corr=${evaluation.correlation?.toFixed(4) || 'n/a'}, Top-10=${top10Text}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}`);
  });

  // Summary output
  console.log('---');
  console.log('📊 FINAL SUMMARY');
  console.log('---');

  console.log(`\n🏆 Step 1: Current-Year Baseline (${CURRENT_SEASON})`);
  console.log(`   Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  console.log(`   Top-10 Accuracy: ${baselineTop10Current}`);
  console.log(`   Top-20 Accuracy: ${baselineTop20}`);
  console.log(`   Top-20 Weighted Score: ${baselineTop20Weighted}`);
  console.log(`   Matched Players: ${baselineEvaluation.matchedPlayers}`);

  console.log('\n🎯 Step 3: Weight Optimization (2026 with approach metrics)');
  console.log(`   Best Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`   Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  console.log(`   Top-10 Accuracy: ${bestOptimizedTop10}`);
  console.log(`   Top-20 Accuracy: ${bestOptimizedTop20}`);
  console.log(`   Top-20 Weighted Score: ${bestOptimizedTop20Weighted}`);
  console.log(`   Matched Players (current year): ${bestOptimized.matchedPlayers}`);

  console.log('\n📈 Optimized Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    console.log(`   ${metric}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n✓ Step 4a: Multi-Year Validation (Baseline)');
  Object.entries(baselineMultiYearResults).sort().forEach(([year, result]) => {
    const top10Text = typeof result.top10 === 'number' ? `${result.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof result.top20 === 'number' ? `${result.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `${result.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = result.top10Details ? `${result.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = result.top20Details ? `${result.top20Details.overlapCount}/20` : 'n/a';
    const subsetEval = result.adjusted?.subset || null;
    const percentileEval = result.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? subsetEval.rmse.toFixed(2) : 'n/a';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `${subsetEval.top20.toFixed(1)}%` : 'n/a';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? percentileEval.rmse.toFixed(2) : 'n/a';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `${percentileEval.top20.toFixed(1)}%` : 'n/a';
    console.log(`   ${year}: Correlation=${result.correlation.toFixed(4)}, Top-10=${top10Text}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}, Subset RMSE=${subsetRmseText}, Subset Top-20=${subsetTop20Text}, Pct RMSE=${pctRmseText}, Pct Top-20=${pctTop20Text}, Top-10 Overlap=${top10OverlapText}, Top-20 Overlap=${top20OverlapText}, Players=${result.matchedPlayers}`);
  });

  console.log('\n✓ Step 4b: Multi-Year Validation (Optimized)');
  Object.entries(optimizedMultiYearResults).sort().forEach(([year, result]) => {
    const top10Text = typeof result.top10 === 'number' ? `${result.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof result.top20 === 'number' ? `${result.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `${result.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = result.top10Details ? `${result.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = result.top20Details ? `${result.top20Details.overlapCount}/20` : 'n/a';
    const subsetEval = result.adjusted?.subset || null;
    const percentileEval = result.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? subsetEval.rmse.toFixed(2) : 'n/a';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `${subsetEval.top20.toFixed(1)}%` : 'n/a';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? percentileEval.rmse.toFixed(2) : 'n/a';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `${percentileEval.top20.toFixed(1)}%` : 'n/a';
    console.log(`   ${year}: Correlation=${result.correlation.toFixed(4)}, Top-10=${top10Text}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}, Subset RMSE=${subsetRmseText}, Subset Top-20=${subsetTop20Text}, Pct RMSE=${pctRmseText}, Pct Top-20=${pctTop20Text}, Top-10 Overlap=${top10OverlapText}, Top-20 Overlap=${top20OverlapText}, Players=${result.matchedPlayers}`);
  });

  console.log('\n💡 Recommendation:');
  if (improvement > 0.01) {
    console.log(`   ✅ Use optimized weights - shows ${(improvement).toFixed(4)} improvement`);
  } else if (improvement > 0) {
    console.log(`   ⚠️  Marginal improvement of ${(improvement).toFixed(4)} - consider template baseline`);
  } else {
    console.log(`   ❌ No improvement - stick with ${bestTemplate.name} template`);
  }

  console.log('\n' + '='.repeat(100) + '\n');

  // Also save results to JSON
  const metricStatsDiagnostics = buildMetricStatsDiagnostics(optimizedRankingCurrent.groupStats, {
    stdDevThreshold: 0.05,
    minCount: 10
  });

  let eventTemplateAction = null;
  let eventTemplateTargets = [];
  const validationTemplateActions = [];

  const aggregateEventKFoldSummary = kfoldResults => {
    const totals = {
      correlation: 0,
      rmse: 0,
      top10: 0,
      top20: 0,
      top20WeightedScore: 0,
      matchedPlayers: 0,
      years: 0
    };
    const foldMetrics = {
      correlation: [],
      rmse: [],
      top10: [],
      top20: [],
      top20WeightedScore: []
    };

    Object.values(kfoldResults || {}).forEach(result => {
      if (!result || result.status !== 'ok' || !result.evaluation) return;
      const evalResult = result.evaluation;
      const weight = typeof evalResult.matchedPlayers === 'number' ? evalResult.matchedPlayers : 0;
      if (!weight) return;
      totals.matchedPlayers += weight;
      totals.correlation += (evalResult.correlation || 0) * weight;
      totals.rmse += (evalResult.rmse || 0) * weight;
      if (typeof evalResult.top10 === 'number') totals.top10 += evalResult.top10 * weight;
      if (typeof evalResult.top20 === 'number') totals.top20 += evalResult.top20 * weight;
      if (typeof evalResult.top20WeightedScore === 'number') {
        totals.top20WeightedScore += evalResult.top20WeightedScore * weight;
      }
      totals.years += 1;

      if (Array.isArray(result.folds)) {
        result.folds.forEach(fold => {
          if (typeof fold.correlation === 'number') foldMetrics.correlation.push(fold.correlation);
          if (typeof fold.rmse === 'number') foldMetrics.rmse.push(fold.rmse);
          if (typeof fold.top10 === 'number') foldMetrics.top10.push(fold.top10);
          if (typeof fold.top20 === 'number') foldMetrics.top20.push(fold.top20);
          if (typeof fold.top20WeightedScore === 'number') {
            foldMetrics.top20WeightedScore.push(fold.top20WeightedScore);
          }
        });
      }
    });

    const computeStats = values => {
      if (!values.length) {
        return { count: 0, mean: 0, stdDev: 0, min: 0, max: 0, median: 0, p25: 0, p75: 0, iqr: 0 };
      }
      const count = values.length;
      const mean = values.reduce((sum, value) => sum + value, 0) / count;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / count;
      const sorted = [...values].sort((a, b) => a - b);
      const quantile = q => {
        const position = (sorted.length - 1) * q;
        const base = Math.floor(position);
        const rest = position - base;
        if (sorted[base + 1] !== undefined) {
          return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
      };
      const p25 = quantile(0.25);
      const p75 = quantile(0.75);
      const median = quantile(0.5);
      return {
        count,
        mean,
        stdDev: Math.sqrt(variance),
        min: Math.min(...values),
        max: Math.max(...values),
        median,
        p25,
        p75,
        iqr: p75 - p25
      };
    };

    const buildConfidence = stats => {
      const countScore = clamp01((stats?.count || 0) / 8);
      const variabilityScore = clamp01(1 - ((stats?.stdDev || 0) / 0.15));
      const score = clamp01((countScore * 0.6) + (variabilityScore * 0.4));
      const note = score >= 0.75
        ? 'High confidence: many folds with stable correlation distribution.'
        : (score >= 0.5
          ? 'Moderate confidence: some fold variability or limited fold count.'
          : 'Low confidence: high variability or few folds—treat results cautiously.');
      return { score, note, components: { countScore, variabilityScore } };
    };

    const foldStats = {
      correlation: computeStats(foldMetrics.correlation),
      rmse: computeStats(foldMetrics.rmse),
      top10: computeStats(foldMetrics.top10),
      top20: computeStats(foldMetrics.top20),
      top20WeightedScore: computeStats(foldMetrics.top20WeightedScore)
    };

    if (totals.matchedPlayers === 0) {
      const confidence = buildConfidence(foldStats.correlation);
      return {
        correlation: 0,
        rmse: 0,
        top10: 0,
        top20: 0,
        top20WeightedScore: 0,
        matchedPlayers: 0,
        years: totals.years,
        foldStats,
        confidence
      };
    }

    const confidence = buildConfidence(foldStats.correlation);
    return {
      correlation: totals.correlation / totals.matchedPlayers,
      rmse: totals.rmse / totals.matchedPlayers,
      top10: totals.top10 / totals.matchedPlayers,
      top20: totals.top20 / totals.matchedPlayers,
      top20WeightedScore: totals.top20WeightedScore / totals.matchedPlayers,
      matchedPlayers: totals.matchedPlayers,
      years: totals.years,
      foldStats,
      confidence
    };
  };

  const baselineEventKFoldSummary = aggregateEventKFoldSummary(baselineEventKFold);
  const optimizedEventKFoldSummary = aggregateEventKFoldSummary(optimizedEventKFold);
  const formatApproachUsageTable = results => {
    if (!results || typeof results !== 'object') return [];
    const rows = Object.entries(results)
      .map(([year, result]) => {
        const usage = result?.approachUsage || {};
        return {
          year,
          period: usage.period || 'none',
          source: usage.source || 'none',
          leakage: usage.leakageFlag || 'none'
        };
      })
      .sort((a, b) => String(a.year).localeCompare(String(b.year)));

    if (rows.length === 0) return [];
    const header = ['Year', 'Period', 'Source', 'Leakage'];
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`
    ];
    rows.forEach(row => {
      lines.push(`| ${row.year} | ${row.period} | ${row.source} | ${row.leakage} |`);
    });
    return lines;
  };
  const eventKFoldInterpretation = (() => {
    if (!baselineEventKFoldSummary || !optimizedEventKFoldSummary) {
      return { verdict: 'unavailable', note: 'Missing event K-fold summaries.' };
    }
    if (!baselineEventKFoldSummary.matchedPlayers || !optimizedEventKFoldSummary.matchedPlayers) {
      return { verdict: 'unavailable', note: 'Insufficient matched players across folds.' };
    }
    const corrDelta = optimizedEventKFoldSummary.correlation - baselineEventKFoldSummary.correlation;
    const rmseDelta = optimizedEventKFoldSummary.rmse - baselineEventKFoldSummary.rmse;
    const top20WDelta = optimizedEventKFoldSummary.top20WeightedScore - baselineEventKFoldSummary.top20WeightedScore;
    let verdict = 'no_material_change';
    let interpretation = 'No material change vs baseline across event folds.';
    if (corrDelta > 0.02 && rmseDelta < 0 && top20WDelta > 0) {
      verdict = 'strong_improvement';
      interpretation = 'Strong improvement: higher rank agreement, lower error, better Top-20 weighted score.';
    } else if (corrDelta > 0.01 && rmseDelta <= 0) {
      verdict = 'improvement';
      interpretation = 'Improvement: better correlation with equal or lower error.';
    } else if (corrDelta > 0.01 && rmseDelta > 0) {
      verdict = 'mixed';
      interpretation = 'Mixed: correlation improved but errors increased.';
    } else if (corrDelta < -0.01) {
      verdict = 'regression';
      interpretation = 'Regression: optimized weights underperform baseline across folds.';
    }
    const baselineConfidence = baselineEventKFoldSummary.confidence?.score ?? 0;
    const optimizedConfidence = optimizedEventKFoldSummary.confidence?.score ?? 0;
    const confidenceNote = optimizedConfidence >= baselineConfidence
      ? 'Optimized fold distribution is at least as stable as baseline.'
      : 'Optimized fold distribution is less stable than baseline.';
    return {
      verdict,
      interpretation,
      confidence: {
        baselineScore: baselineConfidence,
        optimizedScore: optimizedConfidence,
        note: confidenceNote
      },
      deltas: {
        correlation: corrDelta,
        rmse: rmseDelta,
        top20WeightedScore: top20WDelta
      }
    };
  })();

  const optimizedTemplateName = courseTemplateKey || String(CURRENT_EVENT_ID);

  const output = {
    timestamp: new Date().toISOString(),
    eventId: CURRENT_EVENT_ID,
    tournament: TOURNAMENT_NAME || 'Sony Open',
    dryRun: DRY_RUN,
    optSeed: OPT_SEED_RAW || null,
    runFingerprint,
    pastPerformanceWeighting: pastPerformanceWeightSummary,
    courseContextUpdates: courseContextUpdateSummary,
    apiSnapshots: {
      dataGolfRankings: {
        source: rankingsSnapshot?.source || 'unknown',
        path: rankingsSnapshot?.path || null,
        lastUpdated: rankingsSnapshot?.payload?.last_updated || null,
        count: Array.isArray(rankingsSnapshot?.payload?.rankings)
          ? rankingsSnapshot.payload.rankings.length
          : null
      },
      dataGolfApproachSkill: {
        source: approachSkillSnapshot?.source || 'unknown',
        path: approachSkillSnapshot?.path || null,
        lastUpdated: approachSkillSnapshot?.payload?.last_updated || null,
        timePeriod: approachSkillSnapshot?.payload?.time_period || DATAGOLF_APPROACH_PERIOD || null,
        count: Array.isArray(approachSkillSnapshot?.payload?.data)
          ? approachSkillSnapshot.payload.data.length
          : null
      },
      dataGolfApproachSnapshotL24: {
        source: approachSnapshotL24?.source || 'unknown',
        path: approachSnapshotL24?.path || null,
        lastUpdated: approachSnapshotL24?.payload?.last_updated || null,
        timePeriod: approachSnapshotL24?.payload?.time_period || 'l24',
        count: Array.isArray(approachSnapshotL24?.payload?.data)
          ? approachSnapshotL24.payload.data.length
          : null
      },
      dataGolfApproachSnapshotL12: {
        source: approachSnapshotL12?.source || 'unknown',
        path: approachSnapshotL12?.path || null,
        lastUpdated: approachSnapshotL12?.payload?.last_updated || null,
        timePeriod: approachSnapshotL12?.payload?.time_period || 'l12',
        count: Array.isArray(approachSnapshotL12?.payload?.data)
          ? approachSnapshotL12.payload.data.length
          : null
      },
      dataGolfApproachSnapshotYtd: {
        source: approachSnapshotYtd?.source || 'unknown',
        path: approachSnapshotYtd?.path || null,
        archivePath: approachSnapshotYtd?.archivePath || null,
        lastUpdated: approachSnapshotYtd?.payload?.last_updated || null,
        timePeriod: approachSnapshotYtd?.payload?.time_period || 'ytd',
        count: Array.isArray(approachSnapshotYtd?.payload?.data)
          ? approachSnapshotYtd.payload.data.length
          : null
      },
      dataGolfFieldUpdates: {
        source: fieldUpdatesSnapshot?.source || 'unknown',
        path: fieldUpdatesSnapshot?.path || null,
        eventName: fieldUpdatesSnapshot?.payload?.event_name || null,
        eventId: fieldUpdatesSnapshot?.payload?.event_id || null,
        tour: fieldUpdatesSnapshot?.payload?.tour || DATAGOLF_FIELD_TOUR || null,
        fieldCount: Array.isArray(fieldUpdatesSnapshot?.payload?.field)
          ? fieldUpdatesSnapshot.payload.field.length
          : null
      },
      dataGolfPlayerDecompositions: {
        source: playerDecompositionsSnapshot?.source || 'unknown',
        path: playerDecompositionsSnapshot?.path || null,
        lastUpdated: playerDecompositionsSnapshot?.payload?.last_updated || null,
        eventName: playerDecompositionsSnapshot?.payload?.event_name || null,
        tour: DATAGOLF_DECOMP_TOUR || null,
        count: Array.isArray(playerDecompositionsSnapshot?.payload?.players)
          ? playerDecompositionsSnapshot.payload.players.length
          : null
      },
      dataGolfSkillRatingsValue: {
        source: skillRatingsValueSnapshot?.source || 'unknown',
        path: skillRatingsValueSnapshot?.path || null,
        lastUpdated: skillRatingsValueSnapshot?.payload?.last_updated || null,
        display: DATAGOLF_SKILL_DISPLAY_VALUE || null,
        count: Array.isArray(skillRatingsValueSnapshot?.payload?.players)
          ? skillRatingsValueSnapshot.payload.players.length
          : null
      },
      dataGolfSkillRatingsRank: {
        source: skillRatingsRankSnapshot?.source || 'unknown',
        path: skillRatingsRankSnapshot?.path || null,
        lastUpdated: skillRatingsRankSnapshot?.payload?.last_updated || null,
        display: DATAGOLF_SKILL_DISPLAY_RANK || null,
        count: Array.isArray(skillRatingsRankSnapshot?.payload?.players)
          ? skillRatingsRankSnapshot.payload.players.length
          : null
      },
      dataGolfHistoricalRounds: {
        source: historicalRoundsSnapshot?.source || 'unknown',
        path: historicalRoundsSnapshot?.path || null,
        tour: DATAGOLF_HISTORICAL_TOUR || null,
        eventId: DATAGOLF_HISTORICAL_EVENT_ID || null,
        year: historicalYear || null,
        count: historicalRoundsSnapshot?.payload && typeof historicalRoundsSnapshot.payload === 'object'
          ? Object.keys(historicalRoundsSnapshot.payload).length
          : null
      }
    },
    historicalMetricCorrelations,
    currentGeneratedMetricCorrelations,
    currentGeneratedTop20Correlations,
    historicalCoreTop20Correlations,
    historicalCoreTop20Blend: HISTORICAL_CORE_TOP20_BLEND,
    currentGeneratedTop20Logistic,
    currentGeneratedTop20CvSummary,
    cvReliability,
    blendSettings: {
      similarCourseIds: normalizeIdList(sharedConfig.similarCourseIds),
      puttingCourseIds: normalizeIdList(sharedConfig.puttingCourseIds),
      similarCoursesWeight: clamp01(sharedConfig.similarCoursesWeight, 0.3),
      puttingCoursesWeight: clamp01(sharedConfig.puttingCoursesWeight, 0.35)
    },
    suggestedTop20MetricWeights,
    suggestedTop20GroupWeights,
    conservativeSuggestedTop20GroupWeights,
    tunedTop20GroupWeights,
    availableYears,
    roundsByYearSummary: Object.fromEntries(Object.entries(roundsByYear).map(([year, rounds]) => [year, rounds.length])),
    resultsByYearSummary: Object.fromEntries(Object.entries(resultsByYear).map(([year, results]) => [year, results.length])),
    resultsCurrent,
    rawTemplateResults: templateResults,
    rawTemplateResultsCurrentYear: templateResults.map(result => ({
      name: result.name === String(CURRENT_EVENT_ID) ? 'CONFIGURATION_SHEET' : result.name,
      evaluation: result.yearly[CURRENT_SEASON] || null
    })),
    validationIntegration: {
      validationCourseType,
      validationTemplateName,
      validationPriorWeight: VALIDATION_PRIOR_WEIGHT,
      deltaTrendPriorWeight: DELTA_TREND_PRIOR_WEIGHT,
      approachDeltaPriorWeight: APPROACH_DELTA_PRIOR_WEIGHT,
      approachMode: VALIDATION_APPROACH_MODE,
      approachUsagePolicy: {
        currentSeason: 'ytd',
        lastSeason: 'l12',
        olderSeasons: 'l24',
        currentSeasonSource: approachDataCurrentSource,
        leakageFlagRules: {
          asOfDate: 'current season YTD snapshot',
          approximation: 'historical snapshot or CSV fallback',
          none: 'approach metrics excluded'
        }
      },
      deltaTrendsPath: validationData.deltaTrendsPath || null,
      deltaTrendSummary,
      skillRatingsValidation: {
        value: skillRatingsValidationValue,
        rank: skillRatingsValidationRank
      },
      playerDecompositionValidation
    },
    approachDeltaPrior: {
      label: APPROACH_DELTA_PRIOR_LABEL,
      weight: APPROACH_DELTA_PRIOR_WEIGHT,
      mode: approachDeltaPriorMode || 'unavailable',
      sourcePath: approachDeltaPriorMode === 'current_event' ? (APPROACH_DELTA_PATH || null) : null,
      filesUsed: approachDeltaPriorFiles,
      meta: approachDeltaPriorMeta || null,
      rowsTotal: approachDeltaRowsAll.length,
      rowsUsed: approachDeltaRows.length,
      correlations: approachDeltaCorrelations,
      alignmentMap: Array.from(approachDeltaAlignmentMap.entries()).map(([label, correlation]) => ({ label, correlation })),
      playerSummary: approachDeltaPlayerSummary
    },
    multiYearTemplateComparison: templateResults.map(result => ({
      name: result.name,
      evaluation: result.evaluation,
      yearly: result.yearly
    })),
    step1_bestTemplate: {
      name: bestTemplate.name,
      evaluation: baselineEvaluation,
      evaluationCurrentYear: bestTemplate.evaluationCurrent || null,
      evaluationAllYears: bestTemplate.evaluation,
      groupWeights: bestTemplate.groupWeights
    },
    step3_optimized: {
      evaluation: bestOptimized,
      evaluationCurrentYear: optimizedEvaluationCurrent,
      groupWeights: bestOptimized.weights,
      metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights,
      alignmentScore: bestOptimized.alignmentScore,
      top20CompositeScore: bestOptimized.top20Score,
      combinedObjectiveScore: bestOptimized.combinedScore,
      objectiveWeights: WEIGHT_OBJECTIVE,
      rankingsCurrentYear: formatRankingPlayers(optimizedRankingCurrent.players),
      metricStatsDiagnostics,
      baselineTemplate: bestTemplate.name,
      baselineGroupWeights: bestTemplate.groupWeights,
      groupWeightDelta: computeWeightDeltas(bestTemplate.groupWeights, bestOptimized.weights)
    },
    step4a_multiYearBaseline: baselineMultiYearResults,
    step4a_noApproachBaseline: noApproachMultiYearResults,
    step4b_multiYearOptimized: optimizedMultiYearResults,
    step4a_eventKFold: baselineEventKFold,
    step4b_eventKFold: optimizedEventKFold,
    eventKFoldSummary: {
      baseline: baselineEventKFoldSummary,
      optimized: optimizedEventKFoldSummary,
      interpretation: eventKFoldInterpretation
    },
    recommendation: {
      approach: improvement > 0.01 ? 'Use optimized weights' : (improvement > 0 ? 'Marginal improvement' : 'Use template baseline'),
      baselineTemplate: bestTemplate.name,
      optimizedWeights: bestOptimized.weights
    }
  };

  const fallbackBaseName = (`event_${CURRENT_EVENT_ID}`)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '');

  let baseName = (TOURNAMENT_NAME || `event_${CURRENT_EVENT_ID}`)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
    .replace(/^optimizer[_-]+/, '');

  if (!baseName) baseName = fallbackBaseName;

  const seedSuffix = OPT_SEED_RAW
    ? `_seed-${String(OPT_SEED_RAW).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, '')}`
    : '';

  const outputTagRaw = String(process.env.OUTPUT_TAG || '').trim();
  const outputTagSuffix = outputTagRaw
    ? `_${outputTagRaw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, '')}`
    : '';

  const outputBaseName = `${baseName}${seedSuffix}${outputTagSuffix}`;

  const outputPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_post_event_results.json`);
  const backupJsonPath = backupIfExists(outputPath);
  if (backupJsonPath) {
    console.log(`🗄️  Backed up previous JSON results to: ${backupJsonPath}`);
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const STANDARD_TEMPLATES = new Set(['POWER', 'BALANCED', 'TECHNICAL']);

  const validationTemplateSourceLabel = validationData?.weightTemplatesPath
    ? path.basename(validationData.weightTemplatesPath)
    : null;
  const validationTypeToUpdate = validationCourseType && STANDARD_TEMPLATES.has(validationCourseType)
    ? validationCourseType
    : null;
  const validationTemplateResult = validationTemplateName
    ? templateResults.find(result => result.name === validationTemplateName)
    : null;
  const standardTemplateResult = validationTypeToUpdate
    ? templateResults.find(result => result.name === validationTypeToUpdate)
    : null;
  const validationEval = validationTemplateResult?.evaluationCurrent || validationTemplateResult?.evaluation || null;
  const standardEval = standardTemplateResult?.evaluationCurrent || standardTemplateResult?.evaluation || null;
  const validationImprovementPct = (validationEval && standardEval && Math.abs(standardEval.correlation) > 0)
    ? (validationEval.correlation - standardEval.correlation) / Math.abs(standardEval.correlation)
    : null;
  const validationIsRecommendation = validationTemplateName && bestTemplate.name === validationTemplateName;
  const shouldUpdateStandardTemplate = typeof validationImprovementPct === 'number'
    ? validationImprovementPct >= 0.01
    : false;

  const textLines = [];
  textLines.push('='.repeat(100));
  textLines.push('ADAPTIVE WEIGHT OPTIMIZER - FINAL RESULTS');
  textLines.push('='.repeat(100));
  textLines.push(`DRY RUN: ${DRY_RUN ? 'ON (template files not modified)' : 'OFF (templates written)'}`);
  textLines.push('RUN FINGERPRINT: see JSON output (runFingerprint)');
  if (OPT_SEED_RAW) {
    textLines.push(`OPT_SEED: ${OPT_SEED_RAW}`);
  }
  textLines.push('');
  textLines.push('STEP 1: HISTORICAL METRIC CORRELATIONS');
  textLines.push('Functions: buildHistoricalMetricSamples, computeHistoricalMetricCorrelations (optimizer.js)');
  textLines.push('HISTORICAL METRIC CORRELATIONS (avg across years):');
  HISTORICAL_METRICS.forEach(metric => {
    const avg = historicalMetricCorrelations.average[metric.key];
    const corrValue = avg ? avg.correlation : 0;
    const samples = avg ? avg.samples : 0;
    textLines.push(`  ${metric.label}: Corr=${corrValue.toFixed(4)}, Samples=${samples}`);
  });
  textLines.push('');
  textLines.push('HISTORICAL METRIC CORRELATIONS (per year):');
  Object.entries(historicalMetricCorrelations.perYear).sort().forEach(([year, metrics]) => {
    textLines.push(`  ${year}:`);
    HISTORICAL_METRICS.forEach(metric => {
      const entry = metrics[metric.key];
      if (!entry) return;
      textLines.push(`    ${metric.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  });
  textLines.push('');
  textLines.push(`STEP 1b: CURRENT-SEASON GENERATED METRICS (${CURRENT_SEASON}, event + similar + putting)`);
  textLines.push('Functions: runRanking (optimizer.js) -> buildPlayerData (utilities/dataPrep.js) -> generatePlayerRankings (modelCore.js)');
  textLines.push('Additional: computeGeneratedMetricCorrelations, computeGeneratedMetricTopNCorrelations, trainTopNLogisticModel, crossValidateTopNLogisticByEvent, buildSuggestedMetricWeights, buildSuggestedGroupWeights (optimizer.js)');
  textLines.push(`APPROACH DELTA PRIOR (${APPROACH_DELTA_PRIOR_LABEL}):`);
  if (approachDeltaPriorMode === 'rolling_average') {
    textLines.push(`  Mode: rolling_average (files=${approachDeltaPriorFiles.length}, max=${APPROACH_DELTA_ROLLING_EVENTS})`);
    textLines.push(`  Rows used: ${approachDeltaRows.length}/${approachDeltaRowsAll.length}`);
    const rollingEntries = Array.from(approachDeltaAlignmentMap.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);
    if (rollingEntries.length === 0) {
      textLines.push('  No rolling alignment map computed.');
    } else {
      rollingEntries.forEach(([label, value]) => {
        textLines.push(`  ${label}: Score=${value.toFixed(4)}`);
      });
    }
    if (approachDeltaPlayerSummary?.trendWeighted?.topMovers?.length) {
      textLines.push('  Player delta movers (trend-weighted, top 10):');
      approachDeltaPlayerSummary.trendWeighted.topMovers.forEach((entry, idx) => {
        const name = entry.playerName || entry.dgId || 'Unknown';
        textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
      });
      textLines.push('  Player delta movers (trend-weighted, bottom 10):');
      approachDeltaPlayerSummary.trendWeighted.bottomMovers.forEach((entry, idx) => {
        const name = entry.playerName || entry.dgId || 'Unknown';
        textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
      });
    }
    if (approachDeltaPlayerSummary?.predictiveWeighted?.topMovers?.length) {
      textLines.push('  Player delta movers (predictive-weighted, top 10):');
      approachDeltaPlayerSummary.predictiveWeighted.topMovers.forEach((entry, idx) => {
        const name = entry.playerName || entry.dgId || 'Unknown';
        textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
      });
      textLines.push('  Player delta movers (predictive-weighted, bottom 10):');
      approachDeltaPlayerSummary.predictiveWeighted.bottomMovers.forEach((entry, idx) => {
        const name = entry.playerName || entry.dgId || 'Unknown';
        textLines.push(`    ${idx + 1}. ${name}: Score=${entry.score.toFixed(4)}`);
      });
    }
  } else if (!approachDeltaCorrelations.length) {
    textLines.push('  No approach delta correlations computed (missing results or delta file).');
  } else {
    textLines.push(`  Weight: ${APPROACH_DELTA_PRIOR_WEIGHT.toFixed(2)}`);
    textLines.push(`  Source: ${APPROACH_DELTA_PATH || 'n/a'}`);
    textLines.push(`  Rows used: ${approachDeltaRows.length}/${approachDeltaRowsAll.length}`);
    approachDeltaCorrelations.slice(0, 10).forEach(entry => {
      textLines.push(`  ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push(`CURRENT-SEASON means season ${CURRENT_SEASON} only (event + similar + putting events).`);
  const reportSimilarCourseIds = normalizeIdList(sharedConfig.similarCourseIds);
  const reportPuttingCourseIds = normalizeIdList(sharedConfig.puttingCourseIds);
  const reportSimilarBlend = clamp01(sharedConfig.similarCoursesWeight, 0.3);
  const reportPuttingBlend = clamp01(sharedConfig.puttingCoursesWeight, 0.35);
  const reportEventIds = [String(CURRENT_EVENT_ID), ...reportSimilarCourseIds.map(String), ...reportPuttingCourseIds.map(String)];
  const reportEventIdList = Array.from(new Set(reportEventIds)).join(', ');
  textLines.push(`Metric events (current season): [${reportEventIdList}]`);
  textLines.push(`Blend settings: similarCourseEvents=${reportSimilarCourseIds.length}, similarBlend=${reportSimilarBlend.toFixed(2)}, puttingCourseEvents=${reportPuttingCourseIds.length}, puttingBlend=${reportPuttingBlend.toFixed(2)} (SG Putting only)`);
  textLines.push(`CURRENT-SEASON GENERATED METRIC CORRELATIONS (${CURRENT_SEASON}, event + similar + putting):`);
  if (currentGeneratedMetricCorrelations.length === 0) {
    textLines.push(`  No ${CURRENT_SEASON} metric correlations computed.`);
  } else {
    currentGeneratedMetricCorrelations.forEach(entry => {
      textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push(`CURRENT-SEASON GENERATED METRIC TOP-20 SIGNAL (${CURRENT_SEASON}, event + similar + putting):`);
  if (currentGeneratedTop20Correlations.length === 0) {
    textLines.push(`  No ${CURRENT_SEASON} top-20 correlations computed.`);
  } else {
    currentGeneratedTop20Correlations.forEach(entry => {
      textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push('HISTORICAL CORE METRIC TOP-20 SIGNAL (all years, event only):');
  textLines.push(`Blend weight into top-20 signal: ${(HISTORICAL_CORE_TOP20_BLEND * 100).toFixed(0)}%`);
  if (historicalCoreTop20Correlations.length === 0) {
    textLines.push('  No historical core top-20 correlations computed.');
  } else {
    historicalCoreTop20Correlations.forEach(entry => {
      textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push(`CURRENT-SEASON TOP-20 LOGISTIC MODEL (${CURRENT_SEASON}, event + similar + putting):`);
  if (!currentGeneratedTop20Logistic || !currentGeneratedTop20Logistic.success) {
    const reason = currentGeneratedTop20Logistic?.message || 'Not enough data';
    textLines.push(`  Logistic model unavailable: ${reason}`);
  } else {
    textLines.push(`  Samples: ${currentGeneratedTop20Logistic.samples}`);
    textLines.push(`  Accuracy: ${(currentGeneratedTop20Logistic.accuracy * 100).toFixed(1)}%`);
    textLines.push(`  LogLoss: ${currentGeneratedTop20Logistic.logLoss.toFixed(4)}`);
    textLines.push('  Top 10 Weighted Metrics:');
    currentGeneratedTop20Logistic.weightRanking.forEach((entry, idx) => {
      textLines.push(`    ${idx + 1}. ${entry.label}: weight=${entry.weight.toFixed(4)}`);
    });
  }
  textLines.push('');
  textLines.push(`EVENT-BASED TOP-20 CV SUMMARY (${CURRENT_SEASON}):`);
  if (!currentGeneratedTop20CvSummary || !currentGeneratedTop20CvSummary.success) {
    const reason = currentGeneratedTop20CvSummary?.message || 'Not enough events';
    const eventCount = currentGeneratedTop20CvSummary?.eventCount;
    textLines.push(`  CV unavailable: ${reason}${typeof eventCount === 'number' ? ` (events=${eventCount})` : ''}`);
  } else {
    textLines.push(`  Events: ${currentGeneratedTop20CvSummary.eventCount}`);
    textLines.push(`  Samples: ${currentGeneratedTop20CvSummary.totalSamples}`);
    if (currentGeneratedTop20CvSummary.note) {
      textLines.push(`  Note: ${currentGeneratedTop20CvSummary.note}`);
    }
    textLines.push(`  Best L2: ${currentGeneratedTop20CvSummary.bestL2}`);
    textLines.push(`  Avg LogLoss: ${currentGeneratedTop20CvSummary.avgLogLoss.toFixed(4)}`);
    textLines.push(`  Avg Accuracy: ${(currentGeneratedTop20CvSummary.avgAccuracy * 100).toFixed(1)}%`);
    textLines.push(`  Folds Used: ${currentGeneratedTop20CvSummary.foldsUsed}`);
  }
  textLines.push('');
  textLines.push(`SUGGESTED METRIC WEIGHTS (TOP-20) - SOURCE: ${suggestedTop20MetricWeights.source}`);
  if (!suggestedTop20MetricWeights.weights.length) {
    textLines.push('  No suggested metric weights available.');
  } else {
    suggestedTop20MetricWeights.weights.slice(0, 15).forEach((entry, idx) => {
      const corrText = typeof entry.top20Correlation === 'number' ? entry.top20Correlation.toFixed(4) : 'n/a';
      const logisticText = typeof entry.logisticWeight === 'number' ? entry.logisticWeight.toFixed(4) : 'n/a';
      textLines.push(`  ${idx + 1}. ${entry.label}: weight=${entry.weight.toFixed(4)}, top20Corr=${corrText}, logisticWeight=${logisticText}`);
    });
  }
  textLines.push('');
  textLines.push(`SUGGESTED GROUP WEIGHTS (TOP-20) - SOURCE: ${suggestedTop20GroupWeights.source}`);
  if (!suggestedTop20GroupWeights.weights.length) {
    textLines.push('  No suggested group weights available.');
  } else {
    suggestedTop20GroupWeights.weights.forEach((entry, idx) => {
      textLines.push(`  ${idx + 1}. ${entry.groupName}: weight=${entry.weight.toFixed(4)}`);
    });
  }
  textLines.push('');
  textLines.push(`CV RELIABILITY (event-based): ${(cvReliability * 100).toFixed(1)}%`);
  textLines.push(`CONSERVATIVE GROUP WEIGHTS (CV-adjusted, model share ${(conservativeSuggestedTop20GroupWeights.modelShare * 100).toFixed(1)}%):`);
  if (!conservativeSuggestedTop20GroupWeights.weights.length) {
    textLines.push('  No CV-adjusted group weights available.');
  } else {
    conservativeSuggestedTop20GroupWeights.weights.forEach((entry, idx) => {
      textLines.push(`  ${idx + 1}. ${entry.groupName}: weight=${entry.weight.toFixed(4)}`);
    });
  }
  textLines.push('');
  textLines.push(`STEP 1c: CURRENT-YEAR TEMPLATE BASELINE (${CURRENT_SEASON})`);
  textLines.push('Functions: runRanking, evaluateRankings, computeTemplateCorrelationAlignment (optimizer.js)');
  textLines.push('PAST PERFORMANCE WEIGHTING (course history regression):');
  textLines.push(`  Enabled: ${pastPerformanceWeightSummary.enabled ? 'yes' : 'no'}`);
  textLines.push(`  Course Num: ${pastPerformanceWeightSummary.courseNum || 'n/a'}`);
  if (pastPerformanceWeightSummary.regression) {
    const slope = Number(pastPerformanceWeightSummary.regression.slope);
    const pValue = Number(pastPerformanceWeightSummary.regression.pValue);
    textLines.push(`  Regression: slope=${Number.isFinite(slope) ? slope.toFixed(4) : 'n/a'}, p=${Number.isFinite(pValue) ? pValue.toFixed(6) : 'n/a'}`);
  } else {
    textLines.push('  Regression: n/a');
  }
  const computedWeightText = typeof pastPerformanceWeightSummary.computedWeight === 'number'
    ? pastPerformanceWeightSummary.computedWeight.toFixed(2)
    : 'n/a';
  const usedWeightText = typeof pastPerformanceWeightSummary.usedWeight === 'number'
    ? pastPerformanceWeightSummary.usedWeight.toFixed(2)
    : 'n/a';
  textLines.push(`  Computed Weight: ${computedWeightText}`);
  textLines.push(`  Used Weight (config): ${usedWeightText}`);
  const regressionSourceLabel = pastPerformanceWeightSummary.source || 'n/a';
  const regressionPathLabel = pastPerformanceWeightSummary.path ? path.basename(pastPerformanceWeightSummary.path) : null;
  textLines.push(`  Regression Source: ${regressionSourceLabel}${regressionPathLabel ? ` (${regressionPathLabel})` : ''}`);
  if (courseContextUpdateSummary) {
    const updateStatus = courseContextUpdateSummary.updated ? 'yes' : 'no';
    textLines.push(`  Course Context Updates: ${updateStatus} (${courseContextUpdateSummary.updatedCount || 0} entries)`);
    if (courseContextUpdateSummary.reason) {
      textLines.push(`  Update Note: ${courseContextUpdateSummary.reason}`);
    }
  }
  textLines.push('');
  textLines.push('VALIDATION / DELTA TREND INTEGRATION SUMMARY:');
  textLines.push(`  Validation Course Type: ${validationCourseType || 'n/a'}`);
  textLines.push(`  Validation Template: ${validationTemplateName || 'n/a'}`);
  textLines.push(`  Validation Prior Weight: ${VALIDATION_PRIOR_WEIGHT}`);
  textLines.push(`  Delta Trend Prior Weight: ${DELTA_TREND_PRIOR_WEIGHT}`);
  textLines.push(`  Delta Trends Source: ${validationData.deltaTrendsPath || 'n/a'}`);
  if (deltaTrendSummary) {
    textLines.push(`  Guardrail Totals: ${deltaTrendSummary.totalConstrained}`);
    textLines.push(`  Guardrails by Status: STABLE=${deltaTrendSummary.statusCounts.STABLE || 0}, WATCH=${deltaTrendSummary.statusCounts.WATCH || 0}, CHRONIC=${deltaTrendSummary.statusCounts.CHRONIC || 0}`);
    textLines.push(`  Guardrail Ranges: STABLE=±${(DELTA_TREND_RANGE.STABLE * 100).toFixed(0)}%, WATCH=±${(DELTA_TREND_RANGE.WATCH * 100).toFixed(0)}%, CHRONIC=±${(DELTA_TREND_RANGE.CHRONIC * 100).toFixed(0)}%`);
  } else {
    textLines.push('  Guardrail Totals: n/a');
  }
  textLines.push('');
  if (configBaselineEvaluation) {
    textLines.push('CONFIGURATION_SHEET BASELINE (event-specific config weights):');
    textLines.push(`Template: CONFIGURATION_SHEET`);
    textLines.push(`Correlation: ${configBaselineEvaluation.correlation.toFixed(4)}`);
    textLines.push(`R²: ${configBaselineEvaluation.rSquared.toFixed(4)}`);
    textLines.push(`RMSE: ${configBaselineEvaluation.rmse.toFixed(2)}`);
    textLines.push(`MAE: ${configBaselineEvaluation.mae.toFixed(2)}`);
    textLines.push(`Mean Error: ${configBaselineEvaluation.meanError.toFixed(2)}`);
    textLines.push(`Std Dev Error: ${configBaselineEvaluation.stdDevError.toFixed(2)}`);
    textLines.push(`Top-10 Accuracy: ${typeof configBaselineEvaluation.top10 === 'number' ? `${configBaselineEvaluation.top10.toFixed(1)}%` : 'n/a'}`);
    textLines.push(`Top-20 Accuracy: ${typeof configBaselineEvaluation.top20 === 'number' ? `${configBaselineEvaluation.top20.toFixed(1)}%` : 'n/a'}`);
    textLines.push(`Top-20 Weighted Score: ${typeof configBaselineEvaluation.top20WeightedScore === 'number' ? `${configBaselineEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a'}`);
    textLines.push(`Matched Players: ${configBaselineEvaluation.matchedPlayers}`);
    if (configBaselineEvaluation.top20Details) {
      textLines.push(`Top-20 Overlap: ${configBaselineEvaluation.top20Details.overlapCount}/20`);
      textLines.push('  Predicted Top-20 source: generatePlayerRankings (config weights)');
      textLines.push(`  Predicted Top-20: ${configBaselineEvaluation.top20Details.predicted.join(', ')}`);
      textLines.push(`  Actual Top-20: ${configBaselineEvaluation.top20Details.actual.join(', ')}`);
      textLines.push(`  Overlap: ${configBaselineEvaluation.top20Details.overlap.join(', ')}`);
    }
    textLines.push('');
  }
  textLines.push('TEMPLATES TESTED (Step 1c):');
  Object.keys(templateConfigs).sort().forEach(name => {
    textLines.push(`  - ${name}`);
  });
  textLines.push('');
  textLines.push(`RAW TEMPLATE RESULTS (${CURRENT_SEASON}, per template):`);
  templateResults.forEach(result => {
    const displayName = result.name === String(CURRENT_EVENT_ID) ? 'CONFIGURATION_SHEET' : result.name;
    const yearlyEval = result.yearly[CURRENT_SEASON];
    if (!yearlyEval) {
      textLines.push(`  ${displayName}: no evaluation data for ${CURRENT_SEASON}`);
      return;
    }
    const top10Text = typeof yearlyEval.top10 === 'number' ? `, Top-10=${yearlyEval.top10.toFixed(1)}%` : '';
    const top20Text = typeof yearlyEval.top20 === 'number' ? `, Top-20=${yearlyEval.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof yearlyEval.top20WeightedScore === 'number' ? `, Top-20 Weighted=${yearlyEval.top20WeightedScore.toFixed(1)}%` : '';
    textLines.push(
      `  ${displayName}: Corr=${yearlyEval.correlation.toFixed(4)}, R²=${yearlyEval.rSquared.toFixed(4)}, RMSE=${yearlyEval.rmse.toFixed(2)}, MAE=${yearlyEval.mae.toFixed(2)}, Mean Err=${yearlyEval.meanError.toFixed(2)}, Std Err=${yearlyEval.stdDevError.toFixed(2)}${top10Text}${top20Text}${top20WeightedText}, Players=${yearlyEval.matchedPlayers}`
    );
  });
  textLines.push('');
  textLines.push('BEST TEMPLATE (for comparison):');
  textLines.push(`Template: ${bestTemplate.name}`);
  textLines.push(`Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  textLines.push(`R²: ${baselineEvaluation.rSquared.toFixed(4)}`);
  textLines.push(`RMSE: ${baselineEvaluation.rmse.toFixed(2)}`);
  textLines.push(`MAE: ${baselineEvaluation.mae.toFixed(2)}`);
  textLines.push(`Mean Error: ${baselineEvaluation.meanError.toFixed(2)}`);
  textLines.push(`Std Dev Error: ${baselineEvaluation.stdDevError.toFixed(2)}`);
  textLines.push(`Top-10 Accuracy: ${typeof baselineEvaluation.top10 === 'number' ? `${baselineEvaluation.top10.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Top-20 Accuracy: ${typeof baselineEvaluation.top20 === 'number' ? `${baselineEvaluation.top20.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Top-20 Weighted Score: ${typeof baselineEvaluation.top20WeightedScore === 'number' ? `${baselineEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Matched Players: ${baselineEvaluation.matchedPlayers}`);
  if (baselineEvaluation.top20Details) {
    textLines.push(`Top-20 Overlap: ${baselineEvaluation.top20Details.overlapCount}/20`);
    textLines.push('  Predicted Top-20 source: generatePlayerRankings (best template weights)');
    textLines.push(`  Predicted Top-20: ${baselineEvaluation.top20Details.predicted.join(', ')}`);
    textLines.push(`  Actual Top-20: ${baselineEvaluation.top20Details.actual.join(', ')}`);
    textLines.push(`  Overlap: ${baselineEvaluation.top20Details.overlap.join(', ')}`);
  }
  textLines.push('');
  textLines.push('RESULTS CURRENT (derived/loaded):');
  textLines.push('  Source: Historical Data fin_text (event + season)');
  [...resultsCurrent]
    .sort((a, b) => {
      if (a.finishPosition !== b.finishPosition) return a.finishPosition - b.finishPosition;
      return String(a.dgId).localeCompare(String(b.dgId));
    })
    .forEach(result => {
    const name = result.playerName ? ` - ${result.playerName}` : '';
    textLines.push(`  ${result.dgId}: ${result.finishPosition}${name}`);
  });
  textLines.push('');
  textLines.push('STEP 2: TOP-20 GROUP WEIGHT TUNING');
  textLines.push('Functions: selectOptimizableGroups, runRanking, evaluateRankings (optimizer.js)');
  textLines.push(`Scope: event ${CURRENT_EVENT_ID} across all years (current-field only)`);
  textLines.push('TUNED TOP-20 GROUP WEIGHTS (BEST CANDIDATE):');
  if (!tunedTop20GroupWeights) {
    textLines.push('  No tuned group weights available.');
  } else {
    const bestEval = tunedTop20GroupWeights.evaluation;
    textLines.push(`  Top-10: ${typeof bestEval.top10 === 'number' ? `${bestEval.top10.toFixed(1)}%` : 'n/a'}`);
    textLines.push(`  Top-20: ${typeof bestEval.top20 === 'number' ? `${bestEval.top20.toFixed(1)}%` : 'n/a'}`);
    textLines.push(`  RMSE: ${bestEval.rmse.toFixed(2)} | Corr: ${bestEval.correlation.toFixed(4)} | Players: ${bestEval.matchedPlayers}`);
    Object.entries(tunedTop20GroupWeights.groupWeights).forEach(([groupName, weight]) => {
      textLines.push(`  ${groupName}: ${weight.toFixed(4)}`);
    });
    textLines.push(`  Metric Weights (used unchanged from ${step2BaseTemplateName}):`);
    Object.entries(step2MetricWeights).forEach(([metricKey, weight]) => {
      textLines.push(`  ${metricKey}: ${weight.toFixed(4)}`);
    });
  }
  textLines.push('');
  textLines.push('STEP 3: WEIGHT OPTIMIZATION (2026 with approach metrics)');
  textLines.push('Functions: adjustMetricWeights, computeMetricAlignmentScore, runRanking, evaluateRankings (optimizer.js)');
  textLines.push('Objective: current-year results only (current-year field)');
  textLines.push(`Baseline Template: ${bestTemplate.name}`);
  textLines.push(`Best Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  textLines.push(`Metric Alignment Score (Top-20 KPI blend): ${bestOptimized.alignmentScore.toFixed(4)}`);
  textLines.push(`Top-20 Composite Score: ${(bestOptimized.top20Score * 100).toFixed(1)}%`);
  textLines.push(`Combined Objective Score: ${bestOptimized.combinedScore.toFixed(4)} (corr ${WEIGHT_OBJECTIVE.correlation}, top20 ${WEIGHT_OBJECTIVE.top20}, alignment ${WEIGHT_OBJECTIVE.alignment})`);
  textLines.push(`Best R²: ${bestOptimized.rSquared.toFixed(4)}`);
  textLines.push(`Best RMSE: ${bestOptimized.rmse.toFixed(2)}`);
  textLines.push(`Best MAE: ${bestOptimized.mae.toFixed(2)}`);
  textLines.push(`Best Mean Error: ${bestOptimized.meanError.toFixed(2)}`);
  textLines.push(`Best Std Dev Error: ${bestOptimized.stdDevError.toFixed(2)}`);
  textLines.push(`Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  textLines.push(`Top-10 Accuracy: ${typeof bestOptimized.top10 === 'number' ? `${bestOptimized.top10.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Top-20 Accuracy: ${typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Top-20 Weighted Score: ${typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Matched Players (current year): ${bestOptimized.matchedPlayers}`);
  textLines.push('');
  textLines.push('Optimized Group Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    textLines.push(`  ${metric}: ${(weight * 100).toFixed(1)}%`);
  });
  textLines.push('');
  textLines.push('Optimized Metric Weights:');
  Object.entries(bestOptimized.metricWeights || bestTemplate.metricWeights).forEach(([metric, weight]) => {
    textLines.push(`  ${metric}: ${weight.toFixed(4)}`);
  });
  textLines.push('');
  textLines.push('Metric Stats Diagnostics (current-year ranking):');
  textLines.push(`  Thresholds: stdDev<=${metricStatsDiagnostics.thresholds.stdDevThreshold}, count<${metricStatsDiagnostics.thresholds.minCount}`);
  if (!metricStatsDiagnostics.flagged.length) {
    textLines.push('  No metrics flagged under the thresholds.');
  } else {
    metricStatsDiagnostics.flagged.forEach(entry => {
      const mean = typeof entry.mean === 'number' ? entry.mean.toFixed(4) : 'n/a';
      const stdDev = typeof entry.stdDev === 'number' ? entry.stdDev.toFixed(4) : 'n/a';
      const min = typeof entry.min === 'number' ? entry.min.toFixed(4) : 'n/a';
      const max = typeof entry.max === 'number' ? entry.max.toFixed(4) : 'n/a';
      const count = typeof entry.count === 'number' ? entry.count : 'n/a';
      textLines.push(`  ${entry.group} :: ${entry.metric} | mean=${mean}, stdDev=${stdDev}, min=${min}, max=${max}, count=${count} [${entry.reasons.join(', ')}]`);
    });
  }
  textLines.push('');
  textLines.push(`Optimized Rankings (Current Year ${CURRENT_SEASON}):`);
  formatRankingPlayers(optimizedRankingCurrent.players).forEach(player => {
    const name = player.name ? ` - ${player.name}` : '';
    const refined = typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore.toFixed(4) : 'n/a';
    const weighted = typeof player.weightedScore === 'number' ? player.weightedScore.toFixed(4) : 'n/a';
    textLines.push(`  ${player.rank ?? 'n/a'}: ${player.dgId}${name} | refined=${refined}, weighted=${weighted}`);
  });
  textLines.push('');
  textLines.push('STEP 4a: MULTI-YEAR VALIDATION (Baseline)');
  textLines.push(`Approach mode: ${VALIDATION_APPROACH_MODE}`);
  textLines.push('Functions: runRanking, aggregateYearlyEvaluations (optimizer.js)');
  Object.entries(baselineMultiYearResults).sort().forEach(([year, result]) => {
    const approachUsage = result.approachUsage || {};
    const approachText = approachUsage.period
      ? `, Approach=${approachUsage.period}/${approachUsage.source || 'n/a'}, Leakage=${approachUsage.leakageFlag || 'n/a'}`
      : '';
    const top10Text = typeof result.top10 === 'number' ? `, Top-10=${result.top10.toFixed(1)}%` : '';
    const top20Text = typeof result.top20 === 'number' ? `, Top-20=${result.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `, Top-20 Weighted=${result.top20WeightedScore.toFixed(1)}%` : '';
    const top10OverlapText = result.top10Details ? `, Top-10 Overlap=${result.top10Details.overlapCount}/10` : '';
    const top20OverlapText = result.top20Details ? `, Top-20 Overlap=${result.top20Details.overlapCount}/20` : '';
    const subsetEval = result.adjusted?.subset || null;
    const percentileEval = result.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? `, Subset RMSE=${subsetEval.rmse.toFixed(2)}` : '';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `, Subset Top-20=${subsetEval.top20.toFixed(1)}%` : '';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? `, Pct RMSE=${percentileEval.rmse.toFixed(2)}` : '';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `, Pct Top-20=${percentileEval.top20.toFixed(1)}%` : '';
    const stress = evaluateStressTest(result, {
      minPlayers: 20,
      minCorr: 0.1,
      minTop20Weighted: 60
    });
    const stressText = stress.status
      ? `, Stress=${stress.status.toUpperCase()}${stress.reason ? ` (${stress.reason})` : ''}`
      : '';
    textLines.push(
      `  ${year}: Corr=${result.correlation.toFixed(4)}, R²=${result.rSquared.toFixed(4)}, RMSE=${result.rmse.toFixed(2)}, MAE=${result.mae.toFixed(2)}, Mean Err=${result.meanError.toFixed(2)}, Std Err=${result.stdDevError.toFixed(2)}${top10Text}${top20Text}${top20WeightedText}${subsetRmseText}${subsetTop20Text}${pctRmseText}${pctTop20Text}${stressText}${top10OverlapText}${top20OverlapText}, Players=${result.matchedPlayers}${approachText}`
    );
  });
  textLines.push('');
  textLines.push('STEP 4a: MULTI-YEAR VALIDATION (No-Approach Baseline)');
  textLines.push('Approach mode: none (forced)');
  textLines.push('Functions: runRanking, aggregateYearlyEvaluations (optimizer.js)');
  Object.entries(noApproachMultiYearResults).sort().forEach(([year, result]) => {
    const approachUsage = result.approachUsage || {};
    const approachText = approachUsage.period
      ? `, Approach=${approachUsage.period}/${approachUsage.source || 'n/a'}, Leakage=${approachUsage.leakageFlag || 'n/a'}`
      : '';
    const top10Text = typeof result.top10 === 'number' ? `, Top-10=${result.top10.toFixed(1)}%` : '';
    const top20Text = typeof result.top20 === 'number' ? `, Top-20=${result.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `, Top-20 Weighted=${result.top20WeightedScore.toFixed(1)}%` : '';
    const top10OverlapText = result.top10Details ? `, Top-10 Overlap=${result.top10Details.overlapCount}/10` : '';
    const top20OverlapText = result.top20Details ? `, Top-20 Overlap=${result.top20Details.overlapCount}/20` : '';
    const subsetEval = result.adjusted?.subset || null;
    const percentileEval = result.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? `, Subset RMSE=${subsetEval.rmse.toFixed(2)}` : '';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `, Subset Top-20=${subsetEval.top20.toFixed(1)}%` : '';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? `, Pct RMSE=${percentileEval.rmse.toFixed(2)}` : '';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `, Pct Top-20=${percentileEval.top20.toFixed(1)}%` : '';
    const stress = evaluateStressTest(result, {
      minPlayers: 20,
      minCorr: 0.1,
      minTop20Weighted: 60
    });
    const stressText = stress.status
      ? `, Stress=${stress.status.toUpperCase()}${stress.reason ? ` (${stress.reason})` : ''}`
      : '';
    textLines.push(
      `  ${year}: Corr=${result.correlation.toFixed(4)}, R²=${result.rSquared.toFixed(4)}, RMSE=${result.rmse.toFixed(2)}, MAE=${result.mae.toFixed(2)}, Mean Err=${result.meanError.toFixed(2)}, Std Err=${result.stdDevError.toFixed(2)}${top10Text}${top20Text}${top20WeightedText}${subsetRmseText}${subsetTop20Text}${pctRmseText}${pctTop20Text}${stressText}${top10OverlapText}${top20OverlapText}, Players=${result.matchedPlayers}${approachText}`
    );
  });
  textLines.push('');
  textLines.push('STEP 4b: MULTI-YEAR VALIDATION (Optimized)');
  textLines.push(`Approach mode: ${VALIDATION_APPROACH_MODE}`);
  textLines.push('Functions: runRanking, aggregateYearlyEvaluations (optimizer.js)');
  Object.entries(optimizedMultiYearResults).sort().forEach(([year, result]) => {
    const approachUsage = result.approachUsage || {};
    const approachText = approachUsage.period
      ? `, Approach=${approachUsage.period}/${approachUsage.source || 'n/a'}, Leakage=${approachUsage.leakageFlag || 'n/a'}`
      : '';
    const top10Text = typeof result.top10 === 'number' ? `, Top-10=${result.top10.toFixed(1)}%` : '';
    const top20Text = typeof result.top20 === 'number' ? `, Top-20=${result.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `, Top-20 Weighted=${result.top20WeightedScore.toFixed(1)}%` : '';
    const top10OverlapText = result.top10Details ? `, Top-10 Overlap=${result.top10Details.overlapCount}/10` : '';
    const top20OverlapText = result.top20Details ? `, Top-20 Overlap=${result.top20Details.overlapCount}/20` : '';
    const subsetEval = result.adjusted?.subset || null;
    const percentileEval = result.adjusted?.percentile || null;
    const subsetRmseText = subsetEval && typeof subsetEval.rmse === 'number' ? `, Subset RMSE=${subsetEval.rmse.toFixed(2)}` : '';
    const subsetTop20Text = subsetEval && typeof subsetEval.top20 === 'number' ? `, Subset Top-20=${subsetEval.top20.toFixed(1)}%` : '';
    const pctRmseText = percentileEval && typeof percentileEval.rmse === 'number' ? `, Pct RMSE=${percentileEval.rmse.toFixed(2)}` : '';
    const pctTop20Text = percentileEval && typeof percentileEval.top20 === 'number' ? `, Pct Top-20=${percentileEval.top20.toFixed(1)}%` : '';
    const stress = evaluateStressTest(result, {
      minPlayers: 20,
      minCorr: 0.1,
      minTop20Weighted: 60
    });
    const stressText = stress.status
      ? `, Stress=${stress.status.toUpperCase()}${stress.reason ? ` (${stress.reason})` : ''}`
      : '';
    textLines.push(
      `  ${year}: Corr=${result.correlation.toFixed(4)}, R²=${result.rSquared.toFixed(4)}, RMSE=${result.rmse.toFixed(2)}, MAE=${result.mae.toFixed(2)}, Mean Err=${result.meanError.toFixed(2)}, Std Err=${result.stdDevError.toFixed(2)}${top10Text}${top20Text}${top20WeightedText}${subsetRmseText}${subsetTop20Text}${pctRmseText}${pctTop20Text}${stressText}${top10OverlapText}${top20OverlapText}, Players=${result.matchedPlayers}${approachText}`
    );
  });
  textLines.push('');
  textLines.push('APPROACH USAGE SUMMARY (Multi-Year Validation)');
  const approachTableLines = formatApproachUsageTable(baselineMultiYearResults);
  if (approachTableLines.length === 0) {
    textLines.push('  No approach usage data available.');
  } else {
    approachTableLines.forEach(line => textLines.push(line));
  }
  textLines.push('');
    textLines.push('EVENT K-FOLD SETTINGS');
    textLines.push(`  EVENT_KFOLD_K: ${process.env.EVENT_KFOLD_K || 'LOEO (default)'}`);
    textLines.push(`  EVENT_KFOLD_SEED: ${process.env.EVENT_KFOLD_SEED || (OPT_SEED_RAW || `${CURRENT_EVENT_ID}-${CURRENT_SEASON}`)}`);
    textLines.push(`  OPT_SEED: ${OPT_SEED_RAW || 'n/a'}`);
    textLines.push('');
  textLines.push('STEP 4a: EVENT K-FOLD VALIDATION (Baseline)');
  Object.entries(baselineEventKFold).sort().forEach(([year, result]) => {
    if (!result || result.status !== 'ok') {
      textLines.push(`  ${year}: unavailable (${result?.reason || 'n/a'})`);
      return;
    }
    const approachUsage = result.approachUsage || {};
    const approachText = approachUsage.period
      ? `, Approach=${approachUsage.period}/${approachUsage.source || 'n/a'}, Leakage=${approachUsage.leakageFlag || 'n/a'}`
      : '';
    const evaluation = result.evaluation || {};
    const top10Text = typeof evaluation.top10 === 'number' ? `, Top-10=${evaluation.top10.toFixed(1)}%` : '';
    const top20Text = typeof evaluation.top20 === 'number' ? `, Top-20=${evaluation.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `, Top-20 Weighted=${evaluation.top20WeightedScore.toFixed(1)}%` : '';
    textLines.push(
      `  ${year}: mode=${result.mode || 'n/a'}, folds=${result.foldsUsed}/${result.foldCount || 'n/a'}, Corr=${evaluation.correlation?.toFixed(4) || 'n/a'}, RMSE=${evaluation.rmse?.toFixed(2) || 'n/a'}${top10Text}${top20Text}${top20WeightedText}, Players=${evaluation.matchedPlayers || 'n/a'}${approachText}`
    );
    if (Array.isArray(result.folds) && result.folds.length > 0) {
      result.folds.forEach(fold => {
        const foldCorr = typeof fold.correlation === 'number' ? fold.correlation.toFixed(4) : 'n/a';
        const foldRmse = typeof fold.rmse === 'number' ? fold.rmse.toFixed(2) : 'n/a';
        const foldTop10 = typeof fold.top10 === 'number' ? `${fold.top10.toFixed(1)}%` : 'n/a';
        const foldTop20 = typeof fold.top20 === 'number' ? `${fold.top20.toFixed(1)}%` : 'n/a';
        const foldTop20W = typeof fold.top20WeightedScore === 'number' ? `${fold.top20WeightedScore.toFixed(1)}%` : 'n/a';
        textLines.push(
          `    Fold ${fold.fold}: events=${fold.eventCount}, trainRows=${fold.trainingRows}, testRows=${fold.testRows}, players=${fold.matchedPlayers}, Corr=${foldCorr}, RMSE=${foldRmse}, Top-10=${foldTop10}, Top-20=${foldTop20}, Top-20W=${foldTop20W}`
        );
      });
    }
  });
  textLines.push('');
  textLines.push('STEP 4b: EVENT K-FOLD VALIDATION (Optimized)');
  Object.entries(optimizedEventKFold).sort().forEach(([year, result]) => {
    if (!result || result.status !== 'ok') {
      textLines.push(`  ${year}: unavailable (${result?.reason || 'n/a'})`);
      return;
    }
    const approachUsage = result.approachUsage || {};
    const approachText = approachUsage.period
      ? `, Approach=${approachUsage.period}/${approachUsage.source || 'n/a'}, Leakage=${approachUsage.leakageFlag || 'n/a'}`
      : '';
    const evaluation = result.evaluation || {};
    const top10Text = typeof evaluation.top10 === 'number' ? `, Top-10=${evaluation.top10.toFixed(1)}%` : '';
    const top20Text = typeof evaluation.top20 === 'number' ? `, Top-20=${evaluation.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `, Top-20 Weighted=${evaluation.top20WeightedScore.toFixed(1)}%` : '';
    textLines.push(
      `  ${year}: mode=${result.mode || 'n/a'}, folds=${result.foldsUsed}/${result.foldCount || 'n/a'}, Corr=${evaluation.correlation?.toFixed(4) || 'n/a'}, RMSE=${evaluation.rmse?.toFixed(2) || 'n/a'}${top10Text}${top20Text}${top20WeightedText}, Players=${evaluation.matchedPlayers || 'n/a'}${approachText}`
    );
    if (Array.isArray(result.folds) && result.folds.length > 0) {
      result.folds.forEach(fold => {
        const foldCorr = typeof fold.correlation === 'number' ? fold.correlation.toFixed(4) : 'n/a';
        const foldRmse = typeof fold.rmse === 'number' ? fold.rmse.toFixed(2) : 'n/a';
        const foldTop10 = typeof fold.top10 === 'number' ? `${fold.top10.toFixed(1)}%` : 'n/a';
        const foldTop20 = typeof fold.top20 === 'number' ? `${fold.top20.toFixed(1)}%` : 'n/a';
        const foldTop20W = typeof fold.top20WeightedScore === 'number' ? `${fold.top20WeightedScore.toFixed(1)}%` : 'n/a';
        textLines.push(
          `    Fold ${fold.fold}: events=${fold.eventCount}, trainRows=${fold.trainingRows}, testRows=${fold.testRows}, players=${fold.matchedPlayers}, Corr=${foldCorr}, RMSE=${foldRmse}, Top-10=${foldTop10}, Top-20=${foldTop20}, Top-20W=${foldTop20W}`
        );
      });
    }
  });
  textLines.push('');
  textLines.push('EVENT K-FOLD INTERPRETATION');
  if (!baselineEventKFoldSummary || !optimizedEventKFoldSummary || baselineEventKFoldSummary.matchedPlayers === 0 || optimizedEventKFoldSummary.matchedPlayers === 0) {
    textLines.push('  Insufficient event K-fold data to interpret (check folds used / matched players).');
  } else {
    const formatDist = (stats, decimals = 4) => {
      if (!stats || !stats.count) return 'n/a';
      const median = stats.median?.toFixed(decimals) ?? 'n/a';
      const p25 = stats.p25?.toFixed(decimals) ?? 'n/a';
      const p75 = stats.p75?.toFixed(decimals) ?? 'n/a';
      const iqr = stats.iqr?.toFixed(decimals) ?? 'n/a';
      return `median=${median}, IQR=${iqr} (p25=${p25}, p75=${p75})`;
    };
    const corrDelta = optimizedEventKFoldSummary.correlation - baselineEventKFoldSummary.correlation;
    const rmseDelta = optimizedEventKFoldSummary.rmse - baselineEventKFoldSummary.rmse;
    const top20WDelta = optimizedEventKFoldSummary.top20WeightedScore - baselineEventKFoldSummary.top20WeightedScore;
    let verdict = 'No material change vs baseline.';
    if (corrDelta > 0.02 && rmseDelta < 0 && top20WDelta > 0) {
      verdict = 'Strong improvement: higher rank agreement, lower error, better Top-20 weighted score.';
    } else if (corrDelta > 0.01 && rmseDelta <= 0) {
      verdict = 'Improvement: better correlation with equal or lower error.';
    } else if (corrDelta > 0.01 && rmseDelta > 0) {
      verdict = 'Mixed: correlation improved but errors increased.';
    } else if (corrDelta < -0.01) {
      verdict = 'Regression: optimized weights underperform baseline across folds.';
    }
    textLines.push(`  ${verdict}`);
    textLines.push(`  Δ Corr: ${corrDelta.toFixed(4)} | Δ RMSE: ${rmseDelta.toFixed(2)} | Δ Top-20W: ${top20WDelta.toFixed(1)}%`);
    textLines.push(`  Baseline: Corr=${baselineEventKFoldSummary.correlation.toFixed(4)}, RMSE=${baselineEventKFoldSummary.rmse.toFixed(2)}, Top-20W=${baselineEventKFoldSummary.top20WeightedScore.toFixed(1)}%`);
    textLines.push(`  Optimized: Corr=${optimizedEventKFoldSummary.correlation.toFixed(4)}, RMSE=${optimizedEventKFoldSummary.rmse.toFixed(2)}, Top-20W=${optimizedEventKFoldSummary.top20WeightedScore.toFixed(1)}%`);
    textLines.push(`  Baseline fold dist (Corr): ${formatDist(baselineEventKFoldSummary.foldStats?.correlation, 4)}`);
    textLines.push(`  Optimized fold dist (Corr): ${formatDist(optimizedEventKFoldSummary.foldStats?.correlation, 4)}`);
    textLines.push(`  Baseline fold dist (RMSE): ${formatDist(baselineEventKFoldSummary.foldStats?.rmse, 2)}`);
    textLines.push(`  Optimized fold dist (RMSE): ${formatDist(optimizedEventKFoldSummary.foldStats?.rmse, 2)}`);
    if (baselineEventKFoldSummary.confidence) {
      textLines.push(`  Baseline confidence: ${(baselineEventKFoldSummary.confidence.score * 100).toFixed(0)}% - ${baselineEventKFoldSummary.confidence.note}`);
    }
    if (optimizedEventKFoldSummary.confidence) {
      textLines.push(`  Optimized confidence: ${(optimizedEventKFoldSummary.confidence.score * 100).toFixed(0)}% - ${optimizedEventKFoldSummary.confidence.note}`);
    }
    textLines.push('  Interpretation: Higher confidence means fold results are more stable and reliable.');
  }
  textLines.push('');
  textLines.push('RECOMMENDATION:');
  if (improvement > 0.01) {
    textLines.push(`Use optimized weights (improvement: ${(improvement).toFixed(4)})`);
  } else if (improvement > 0) {
    textLines.push(`Marginal improvement (${(improvement).toFixed(4)}), consider baseline`);
  } else {
    textLines.push(`No improvement, stick with ${bestTemplate.name}`);
  }
  textLines.push('');
  textLines.push('TEMPLATE WRITE SUMMARY:');
  if (eventTemplateAction) {
    const actionLabel = eventTemplateAction === 'dryRun' ? 'dry-run output' : 'write';
    textLines.push(`Event template (${optimizedTemplateName}): ${actionLabel}`);
    eventTemplateTargets.forEach(target => textLines.push(`  - ${target}`));
  } else {
    textLines.push(`Event template (${optimizedTemplateName}): not written`);
  }
  if (validationTemplateActions.length > 0) {
    validationTemplateActions.forEach(entry => {
      const actionLabel = entry.action === 'dryRun' ? 'dry-run output' : 'write';
      textLines.push(`Standard template (${entry.name}): ${actionLabel}`);
      textLines.push(`  - ${entry.target}`);
    });
  } else {
    if (validationIsRecommendation && typeof validationImprovementPct === 'number' && validationImprovementPct < 0.01) {
      textLines.push('Standard templates: no updates (validation improvement < 1%)');
    } else {
      textLines.push('Standard templates: no updates');
    }
  }
  textLines.push('');
  textLines.push('---');
  const textOutputPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_post_event_results.txt`);
  const backupTextPath = backupIfExists(textOutputPath);
  if (backupTextPath) {
    console.log(`🗄️  Backed up previous text results to: ${backupTextPath}`);
  }
  fs.writeFileSync(textOutputPath, textLines.join('\n'));

  const optimizedTop20Desc = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const optimizedTop20WeightedDesc = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';

  const invertedLabelSet = buildInvertedLabelSet(currentGeneratedTop20Correlations);
  const metricWeightsWithInversions = applyInversionsToMetricWeights(
    metricConfig,
    bestOptimized.metricWeights || bestTemplate.metricWeights,
    invertedLabelSet
  );

  const optimizedTemplate = {
    name: courseTemplateKey,
    eventId: String(CURRENT_EVENT_ID),
    description: `${TOURNAMENT_NAME || 'Event'} ${CURRENT_SEASON || ''} Optimized: ${bestOptimized.correlation.toFixed(4)} corr, ${optimizedTop20Desc} Top-20, ${optimizedTop20WeightedDesc} Top-20 Weighted`,
    groupWeights: bestOptimized.weights,
    metricWeights: nestMetricWeights(metricWeightsWithInversions)
  };

  const baselineTemplateForCompare = {
    groupWeights: baselineTemplate.groupWeights,
    metricWeights: baselineTemplate.metricWeights
  };
  const optimizedTemplateForCompare = {
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights
  };
  const optimizedBeatsBaseline = compareEvaluations(bestOptimized, baselineEvaluation) > 0;
  const shouldWriteEventTemplate = optimizedBeatsBaseline && templatesAreDifferent(
    optimizedTemplateForCompare,
    baselineTemplateForCompare,
    metricConfig,
    1e-4
  );
  const allowDryRunTemplateOutputs = DRY_RUN;
  const shouldAttemptEventWrite = shouldWriteEventTemplate && (WRITE_TEMPLATES || allowDryRunTemplateOutputs);
  if (!shouldWriteEventTemplate) {
    console.log('ℹ️  Event template not written (optimized weights match baseline).');
  }

  const validationTemplatesToWrite = ((WRITE_VALIDATION_TEMPLATES || WRITE_TEMPLATES || allowDryRunTemplateOutputs) && validationTypeToUpdate && shouldUpdateStandardTemplate)
    ? [buildValidationTemplateForType({
        type: validationTypeToUpdate,
        metricConfig,
        validationData,
        templateConfigs,
        eventId: CURRENT_EVENT_ID,
        sourceLabel: validationTemplateSourceLabel
      })]
      .filter(Boolean)
    : [];

  const writeBackTargets = [
    path.resolve(ROOT_DIR, 'utilities', 'weightTemplates.js')
  ];

  writeBackTargets.forEach(filePath => {
    if (shouldAttemptEventWrite) {
      const result = upsertTemplateInFile(filePath, optimizedTemplate, { replaceByEventId: true, dryRun: DRY_RUN });
      if (result.updated) {
        if (DRY_RUN && result.content) {
          const dryRunPath = path.resolve(dryRunOutputDir || OUTPUT_DIR, `dryrun_${path.basename(filePath)}`);
          fs.writeFileSync(dryRunPath, result.content, 'utf8');
          console.log(`🧪 Dry-run template output saved to: ${dryRunPath}`);
          eventTemplateAction = 'dryRun';
          eventTemplateTargets.push(dryRunPath);
        } else {
          console.log(`✅ Template written to: ${filePath}`);
          eventTemplateAction = 'write';
          eventTemplateTargets.push(filePath);
        }
      } else {
        console.warn(`⚠️  Template not written (unable to update): ${filePath}`);
      }
    }

    if (validationTemplatesToWrite.length > 0) {
      validationTemplatesToWrite.forEach(validationTemplate => {
        const existingTemplate = templateConfigs?.[validationTemplate.name] || null;
        const differs = templatesAreDifferent(validationTemplate, existingTemplate, metricConfig, 1e-4);
        if (!differs) {
          console.log(`ℹ️  Validation template matches existing ${validationTemplate.name}; skipping update.`);
          return;
        }
        const validationResult = upsertTemplateInFile(filePath, validationTemplate, { replaceByEventId: false, dryRun: DRY_RUN });
        if (validationResult.updated) {
          if (DRY_RUN && validationResult.content) {
            const dryRunPath = path.resolve(dryRunOutputDir || OUTPUT_DIR, `dryrun_${validationTemplate.name}_${path.basename(filePath)}`);
            fs.writeFileSync(dryRunPath, validationResult.content, 'utf8');
            console.log(`🧪 Dry-run validation template saved to: ${dryRunPath}`);
            validationTemplateActions.push({
              name: validationTemplate.name,
              action: 'dryRun',
              target: dryRunPath
            });
          } else {
            console.log(`✅ Validation template written to: ${filePath} (${validationTemplate.name})`);
            validationTemplateActions.push({
              name: validationTemplate.name,
              action: 'write',
              target: filePath
            });
          }
        } else {
          console.warn(`⚠️  Validation template not written (unable to update): ${filePath} (${validationTemplate.name})`);
        }
      });
    }
  });

  console.log('\n🧾 Template write summary:');
  if (eventTemplateAction) {
    const actionLabel = eventTemplateAction === 'dryRun' ? 'dry-run output' : 'write';
    console.log(`   Event template (${optimizedTemplate.name}): ${actionLabel}`);
    eventTemplateTargets.forEach(target => console.log(`     - ${target}`));
  } else {
    console.log(`   Event template (${optimizedTemplate.name}): not written`);
  }

  if (validationTemplateActions.length > 0) {
    validationTemplateActions.forEach(entry => {
      const actionLabel = entry.action === 'dryRun' ? 'dry-run output' : 'write';
      console.log(`   Standard template (${entry.name}): ${actionLabel}`);
      console.log(`     - ${entry.target}`);
    });
  } else {
    console.log('   Standard templates: no updates');
  }

  console.log(`✅ JSON results also saved to: ${path.resolve(OUTPUT_DIR, `${outputBaseName}_post_event_results.json`)}`);
  console.log(`✅ Text results saved to: ${path.resolve(OUTPUT_DIR, `${outputBaseName}_post_event_results.txt`)}\n`);

  try {
    const { runValidation } = require('./validationRunner');
    if (typeof runValidation === 'function') {
      console.log('🔄 Running validation runner (post-tournament)...');
      const validationResult = await runValidation({
        season: CURRENT_SEASON,
        dataRootDir: DATA_ROOT_DIR,
        tournamentName: TOURNAMENT_NAME,
        tournamentSlug: outputBaseName,
        tournamentDir,
        eventId: CURRENT_EVENT_ID
      });
      console.log(`✅ Validation outputs written to: ${validationResult.outputDir}`);
    }
  } catch (error) {
    console.warn(`⚠️  Validation runner failed: ${error.message}`);
  }
}

runAdaptiveOptimizer().catch(error => {
  console.error(`\n❌ Optimizer failed: ${error.message}`);
  process.exit(1);
});