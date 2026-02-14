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

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { generatePlayerRankings, cleanMetricValue } = require('./modelCore');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('./metricConfigBuilder');
const { WEIGHT_TEMPLATES } = require('../utilities/weightTemplates');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = ROOT_DIR;
const DEFAULT_DATA_DIR = path.resolve(ROOT_DIR, 'data');
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');
const TRACE_PLAYER = String(process.env.TRACE_PLAYER || '').trim();
let LOGGING_ENABLED = false;
const OPT_SEED_RAW = String(process.env.OPT_SEED || '').trim();
const OPT_TESTS_RAW = String(process.env.OPT_TESTS || '').trim();
const MIN_METRIC_COVERAGE = 0.70;
const VALIDATION_RANGE_PCT = 0.20;
const VALIDATION_PRIOR_WEIGHT = 0.25;
const DELTA_TREND_PRIOR_WEIGHT = 0.15;
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
  if (args[i] === '--writeTemplates') {
    DRY_RUN = false;
    WRITE_TEMPLATES = true;
  }
  if (args[i] === '--writeValidationTemplates') {
    WRITE_VALIDATION_TEMPLATES = true;
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

if (!LOGGING_ENABLED) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

console.log('---');
console.log('ADAPTIVE WEIGHT OPTIMIZER v2');
console.log('---');
if (OPT_SEED_RAW) {
  console.log(`OPT_SEED: ${OPT_SEED_RAW}`);
}

if (!OVERRIDE_EVENT_ID) {
  console.error('\n❌ Missing required argument: --event <eventId>');
  console.error('   Example: node adaptiveOptimizer_v2.js --event 6 --season 2026 --tournament "Sony Open"');
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
  const typeSummaries = {
    POWER: parseValidationTypeSummary(findValidationFileByKeywords(dataDirs, ['03', 'power', 'summary'])) || [],
    TECHNICAL: parseValidationTypeSummary(findValidationFileByKeywords(dataDirs, ['03', 'technical', 'summary'])) || [],
    BALANCED: parseValidationTypeSummary(findValidationFileByKeywords(dataDirs, ['03', 'balanced', 'summary'])) || []
  };
  const weightTemplatesPath =
    findValidationFileByKeywords(dataDirs, ['weight', 'templates']) ||
    findValidationFileByKeywords(dataDirs, ['weight', 'template']) ||
    findValidationFileByKeywords(dataDirs, ['weight_templates']) ||
    null;
  const weightTemplates = parseValidationWeightTemplates(weightTemplatesPath) || { POWER: [], TECHNICAL: [], BALANCED: [] };
  const deltaTrendsPath =
    findValidationFileByKeywords(dataDirs, ['05', 'delta', 'trends']) ||
    findValidationFileByKeywords(dataDirs, ['model', 'delta', 'trends']) ||
    findValidationFileByKeywords(dataDirs, ['delta', 'trends']) ||
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

      const correlation = calculatePearsonCorrelation(xValues, yValues);
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
  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  return GENERATED_METRIC_LABELS.map((label, index) => {
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (!finishPosition || Number.isNaN(finishPosition)) return;
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
      correlation: calculatePearsonCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function computeGeneratedMetricTopNCorrelations(players, results, topN = 20) {
  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  return GENERATED_METRIC_LABELS.map((label, index) => {
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (!finishPosition || Number.isNaN(finishPosition)) return;
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
      correlation: calculatePearsonCorrelation(xValues, yValues),
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
  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  const specs = normalizeMetricSpecs(metricSpecs);
  return specs.map(spec => {
    const { label, index } = spec;
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (!finishPosition || Number.isNaN(finishPosition)) return;
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
      correlation: calculatePearsonCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function computeGeneratedMetricTopNCorrelationsForLabels(players, results, metricSpecs, topN = 20) {
  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  const specs = normalizeMetricSpecs(metricSpecs);
  return specs.map(spec => {
    const { label, index } = spec;
    const xValues = [];
    const yValues = [];

    players.forEach(player => {
      const dgId = String(player.dgId || '').trim();
      if (!dgId) return;
      const finishPosition = resultsById.get(dgId);
      if (!finishPosition || Number.isNaN(finishPosition)) return;
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
      correlation: calculatePearsonCorrelation(xValues, yValues),
      samples: xValues.length
    };
  });
}

function buildTopNSamplesFromPlayers(players, results, metricSpecs, topN = 20) {
  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  return players.reduce((acc, player) => {
    const dgId = String(player.dgId || '').trim();
    if (!dgId) return acc;
    const finishPosition = resultsById.get(dgId);
    if (!finishPosition || Number.isNaN(finishPosition)) return acc;
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
  const resultsById = new Map();
  results.forEach(result => {
    const dgId = String(result.dgId || '').trim();
    if (!dgId) return;
    if (result.finishPosition && !Number.isNaN(result.finishPosition)) {
      resultsById.set(dgId, result.finishPosition);
    }
  });

  const xValues = [];
  const yValues = [];

  players.forEach(player => {
    const dgId = String(player.dgId || '').trim();
    if (!dgId) return;
    const finishPosition = resultsById.get(dgId);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
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
    correlation: calculatePearsonCorrelation(xValues, yValues),
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

function parseFinishPosition(posValue) {
  const posStr = String(posValue || '').trim().toUpperCase();
  if (!posStr) return null;
  if (posStr.startsWith('T')) return parseInt(posStr.substring(1));
  if (posStr === 'CUT' || posStr === 'WD' || posStr === 'DQ') return null;
  return parseInt(posStr);
}

function evaluateRankings(predictions, actualResults, options = {}) {
  const { includeTopN = true, includeTopNDetails = false } = options;
  const scores = [];
  const positions = [];
  const errors = [];
  
  predictions.forEach((pred, idx) => {
    const actual = actualResults.find(a => String(a.dgId) === String(pred.dgId));
    if (actual) {
      const rankValue = typeof pred.rank === 'number' ? pred.rank : (idx + 1);
      scores.push(rankValue);
      positions.push(actual.finishPosition);
      errors.push(rankValue - actual.finishPosition);
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
  
  const correlation = calculatePearsonCorrelation(scores, positions);
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

function formatRankingPlayers(players) {
  if (!Array.isArray(players)) return [];
  return players.map(player => ({
    rank: typeof player.rank === 'number' ? player.rank : null,
    dgId: String(player.dgId || '').trim(),
    name: String(player.name || player.playerName || '').trim(),
    refinedWeightedScore: typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore : null,
    weightedScore: typeof player.weightedScore === 'number' ? player.weightedScore : null,
    compositeScore: typeof player.compositeScore === 'number' ? player.compositeScore : null,
    war: typeof player.war === 'number' ? player.war : null
  }));
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

function resolveTournamentFile(suffix, tournamentName, season, fallbackName) {
  const baseName = String(tournamentName || fallbackName || '').trim();
  const seasonTag = season ? `(${season})` : '';
  const exactName = baseName ? `${baseName} ${seasonTag} - ${suffix}.csv`.replace(/\s+/g, ' ').trim() : '';
  const altName = baseName ? `${baseName} - ${suffix}.csv` : '';

  const dirs = [DATA_DIR, DEFAULT_DATA_DIR];
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

  if (candidates.length > 0) {
    const sorted = candidates.sort((a, b) => a.file.localeCompare(b.file));
    return sorted[0].path;
  }

  if (exactName) return resolveDataFile(exactName);
  if (altName) return resolveDataFile(altName);
  return resolveDataFile(`${suffix}.csv`);
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

function runAdaptiveOptimizer() {
  const requiredFiles = [
    { name: 'Configuration Sheet', path: null },
    { name: 'Tournament Field', path: null },
    { name: 'Historical Data', path: null },
    { name: 'Approach Skill', path: null }
  ];

  const CURRENT_EVENT_ID = OVERRIDE_EVENT_ID;
  const CURRENT_SEASON = OVERRIDE_SEASON ?? 2026;
  const tournamentNameFallback = TOURNAMENT_NAME || 'Sony Open';
  const CONFIG_PATH = resolveTournamentFile('Configuration Sheet', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const FIELD_PATH = resolveTournamentFile('Tournament Field', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const HISTORY_PATH = resolveTournamentFile('Historical Data', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const APPROACH_PATH = resolveTournamentFile('Approach Skill', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);
  const RESULTS_PATH = resolveTournamentFile('Tournament Results', TOURNAMENT_NAME, CURRENT_SEASON, tournamentNameFallback);

  requiredFiles[0].path = CONFIG_PATH;
  requiredFiles[1].path = FIELD_PATH;
  requiredFiles[2].path = HISTORY_PATH;
  requiredFiles[3].path = APPROACH_PATH;

  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file.path));
  if (missingFiles.length > 0) {
    console.error('\n❌ Missing required input files:');
    missingFiles.forEach(file => {
      console.error(`   - ${file.name}: ${path.basename(file.path)}`);
    });
    console.error('\nExpected locations:');
    console.error(`   - ${DATA_DIR}`);
    console.error(`   - ${DEFAULT_DATA_DIR}`);
    console.error('\nFix: place the missing CSVs in one of those folders or update the filenames in adaptiveOptimizer_v2.js.');
    process.exit(1);
  }

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  console.log('✓ Configuration loaded');
  const resolvedSeason = parseInt(sharedConfig.currentSeason || sharedConfig.currentYear || CURRENT_SEASON);
  const effectiveSeason = Number.isNaN(resolvedSeason) ? CURRENT_SEASON : resolvedSeason;
  let courseTemplateKey = null;

  const currentEventRoundsPolicy = INCLUDE_CURRENT_EVENT_ROUNDS === null
    ? 'default'
    : (INCLUDE_CURRENT_EVENT_ROUNDS ? 'include' : 'exclude');
  console.log(`ℹ️  Current-event rounds policy: ${currentEventRoundsPolicy}`);
  console.log(`   Defaults: metrics=${CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonMetrics ? 'include' : 'exclude'}, baseline=${CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonBaseline ? 'include' : 'exclude'}, optimization=${CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization ? 'include' : 'exclude'}, historical=${CURRENT_EVENT_ROUNDS_DEFAULTS.historicalEvaluation ? 'include' : 'exclude'}`);
  
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
    const groupWeights = {};
    const metricWeights = {};
    baseMetricConfig.groups.forEach(group => {
      groupWeights[group.name] = group.weight;
      group.metrics.forEach(metric => {
        metricWeights[`${group.name}::${metric.name}`] = metric.weight;
      });
    });
    templateConfigs[CURRENT_EVENT_ID] = { groupWeights, metricWeights };
    console.log(`✓ Loaded event-specific weights (eventId: ${CURRENT_EVENT_ID}) from Configuration Sheet (${path.basename(CONFIG_PATH)})`);
  }

  const metricConfig = baseMetricConfig;

  const validationData = loadValidationOutputs(metricConfig, [DATA_DIR, DEFAULT_DATA_DIR]);
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
      { label: 'tournamentResults', path: RESULTS_PATH },
      { label: 'weightTemplatesJs', path: path.resolve(ROOT_DIR, 'utilities', 'weightTemplates.js') }
    ],
    validationPaths: [
      { label: 'validationWeightTemplates', path: validationData?.weightTemplatesPath || null },
      { label: 'validationDeltaTrends', path: validationData?.deltaTrendsPath || null }
    ]
  });

  console.log('\n🔄 Loading data...');
  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded field: ${fieldData.length} players`);
  
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded history: ${historyData.length} rounds`);
  
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded approach: ${approachData.length} rows`);

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

  // Load actual results from a dedicated results file
  function loadActualResults(resultsPath, nameLookup) {
    const rawData = loadCsv(resultsPath, { skipFirstColumn: true });
    const results = [];
    rawData.forEach(row => {
      const dgId = String(row['DG ID'] || '').trim();
      if (!dgId) return;
      const finishPosition = parseFinishPosition(row['Finish Position']);
      if (finishPosition && !Number.isNaN(finishPosition)) {
        const playerName = String(row['Player Name'] || row['Name'] || '').trim() || nameLookup[dgId] || 'Unknown';
        results.push({ dgId, finishPosition, playerName });
      }
    });
    return results;
  }

  const resultsFileExists = fs.existsSync(RESULTS_PATH);
  const fieldNameLookup = fieldData.reduce((acc, row) => {
    const dgId = String(row['dg_id'] || '').trim();
    if (!dgId) return acc;
    const playerName = String(row['player_name'] || '').trim();
    if (playerName) acc[dgId] = playerName;
    return acc;
  }, {});
  const resultsCurrent = resultsFileExists
    ? loadActualResults(RESULTS_PATH, fieldNameLookup)
    : deriveResultsFromHistory(historyData, CURRENT_EVENT_ID, effectiveSeason, fieldNameLookup);

  if (resultsFileExists) {
    console.log(`✓ Loaded ${resultsCurrent.length} current season results`);
  } else {
    console.log(`⚠️  Results file not found. Derived ${resultsCurrent.length} results from historical data.`);
  }

  const HAS_CURRENT_RESULTS = resultsCurrent.length > 0;
  if (!HAS_CURRENT_RESULTS) {
    console.warn('\n⚠️  No results found for the current season/event.');
    console.warn('   Falling back to historical + similar-course outcomes for supervised metric training.');
  }

  const field2026DgIds = new Set(fieldData.map(p => String(p['dg_id'] || '').trim()));
  console.log(`✓ Loaded 2026 field: ${field2026DgIds.size} players\n`);

  const runtimeConfig = {
    similarCoursesWeight: sharedConfig.similarCoursesWeight,
    puttingCoursesWeight: sharedConfig.puttingCoursesWeight,
    courseSetupWeights: sharedConfig.courseSetupWeights
  };

  const runRanking = ({ roundsRawData, approachRawData, groupWeights, metricWeights, includeCurrentEventRounds = false, fieldDataOverride = null }) => {
    const adjustedMetricWeights = applyShotDistributionToMetricWeights(
      metricWeights,
      sharedConfig.courseSetupWeights
    );
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
      runtimeConfig
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
      approachRawData: approachData,
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

  const resultsByYear = buildResultsByYear(historicalDataForField, CURRENT_EVENT_ID);
  const availableYears = Object.keys(resultsByYear).sort();

  console.log(`\n✓ Years available for evaluation: ${availableYears.join(', ') || 'none'}`);
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
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.historicalEvaluation),
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
          approachRawData: approachData,
          groupWeights: currentTemplate.groupWeights,
          metricWeights: currentTemplate.metricWeights,
          includeCurrentEventRounds: resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonMetrics)
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
            approachRawData: approachData,
            groupWeights: currentTemplate.groupWeights,
            metricWeights: currentTemplate.metricWeights,
            includeCurrentEventRounds: resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonMetrics)
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
            approachRawData: approachData,
            groupWeights: currentTemplate.groupWeights,
            metricWeights: currentTemplate.metricWeights,
            includeCurrentEventRounds: resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonMetrics)
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

    const output = {
      timestamp: new Date().toISOString(),
      mode: 'pre_event_training',
      eventId: CURRENT_EVENT_ID,
      tournament: TOURNAMENT_NAME || 'Event',
      dryRun: DRY_RUN,
      trainingSource: 'historical+similar-course',
      trainingMetrics: trainingMetricNotes,
      historicalMetricCorrelations,
      currentGeneratedMetricCorrelations,
      currentGeneratedTop20Correlations,
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

    const outputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.json');
    const backupJsonPath = backupIfExists(outputPath);
    if (backupJsonPath) {
      console.log(`🗄️  Backed up previous JSON results to: ${backupJsonPath}`);
    }
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    const textLines = [];
    textLines.push('='.repeat(100));
    textLines.push('ADAPTIVE WEIGHT OPTIMIZER - PRE-EVENT TRAINING');
    textLines.push('='.repeat(100));
    textLines.push(`DRY RUN: ${DRY_RUN ? 'ON (template files not modified)' : 'OFF (templates written)'}`);
    textLines.push('');
    textLines.push('MODE: Historical + Similar-Course Training (no current-year results)');
    textLines.push(`Event: ${CURRENT_EVENT_ID} | Tournament: ${TOURNAMENT_NAME || 'Event'}`);
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

    const textOutputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.txt');
    const backupTextPath = backupIfExists(textOutputPath);
    if (backupTextPath) {
      console.log(`🗄️  Backed up previous text results to: ${backupTextPath}`);
    }
    fs.writeFileSync(textOutputPath, textLines.join('\n'));

    console.log('✅ Pre-event training output saved (no rankings).');
    console.log(`✅ JSON results saved to: output/adaptive_optimizer_v2_results.json`);
    console.log(`✅ Text results saved to: output/adaptive_optimizer_v2_results.txt\n`);
    return;
  }

  let alignmentMapForOptimization = currentGeneratedTop20AlignmentMap;
  const alignmentMaps = [];
  const alignmentWeights = [];

  if (currentGeneratedTop20AlignmentMap.size > 0) {
    alignmentMaps.push(currentGeneratedTop20AlignmentMap);
    alignmentWeights.push(1 - VALIDATION_PRIOR_WEIGHT - DELTA_TREND_PRIOR_WEIGHT);
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
        approachRawData: useApproach ? approachData : [],
        groupWeights: adjustedGroupWeights,
        metricWeights: config.metricWeights,
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(useApproach ? CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonBaseline : CURRENT_EVENT_ROUNDS_DEFAULTS.historicalEvaluation)
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

  let bestTemplate = [...templateResults].sort((a, b) => {
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

  if (validationTemplateName && validationTemplateConfig) {
    const validationResult = templateResults.find(result => result.name === validationTemplateName);
    if (validationResult) {
      bestTemplate = validationResult;
      console.log(`ℹ️  Using validation-selected baseline template: ${validationTemplateName}`);
    }
  }

  const baselineEvaluation = bestTemplate.evaluationCurrent || bestTemplate.evaluation;
  const configTemplateResult = templateResults.find(result => result.name === String(CURRENT_EVENT_ID));
  const configBaselineEvaluation = configTemplateResult ? (configTemplateResult.evaluationCurrent || configTemplateResult.evaluation) : null;

  console.log('---');
  console.log('STEP 2: TOP-20 GROUP WEIGHT TUNING');
  console.log(`Tune lower-importance groups for Top-20 outcomes (event ${CURRENT_EVENT_ID}, all years)`);
  console.log('---');

  const step2BaseTemplate = configTemplateResult || bestTemplate;
  const step2BaseTemplateName = step2BaseTemplate === configTemplateResult ? 'CONFIGURATION_SHEET' : bestTemplate.name;
  const step2MetricWeights = step2BaseTemplate.metricWeights || bestTemplate.metricWeights;

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
        approachRawData: useApproach ? approachData : [],
        groupWeights: adjustedGroupWeights,
        metricWeights: step2MetricWeights,
        includeCurrentEventRounds: resolveIncludeCurrentEventRounds(
          useApproach ? CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization : CURRENT_EVENT_ROUNDS_DEFAULTS.historicalEvaluation
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

  console.log(`\n✅ Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  console.log(`   Top-10: ${baselineTop10Current}`);
  console.log(`   Top-20: ${baselineTop20}`);
  console.log(`   Top-20 Weighted Score: ${baselineTop20Weighted}\n`);

  // ============================================================================
  // STEP 3: WEIGHT OPTIMIZATION (with 2026 approach metrics)
  // ============================================================================
  console.log('---');
  console.log('STEP 3: WEIGHT OPTIMIZATION');
  console.log('Randomized search starting from best template baseline');
  console.log('Using current season results for optimization (current-year field only)');
  console.log('---');

  // Random search from best template
  console.log(`🔄 Grid search optimization from ${bestTemplate.name} baseline...`);
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
    const weights = { ...bestTemplate.groupWeights };
    const groupNames = Object.keys(weights);
    const numAdjust = 2 + Math.floor(rand() * 2);
    for (let j = 0; j < numAdjust; j++) {
      const groupName = groupNames[Math.floor(rand() * groupNames.length)];
      const adjustment = (rand() * 2 - 1) * GROUP_GRID_RANGE;
      weights[groupName] = Math.max(0.001, weights[groupName] * (1 + adjustment));
    }

    const normalizedWeights = normalizeWeights(weights);
    let adjustedMetricWeights = adjustMetricWeights(bestTemplate.metricWeights, metricConfig, METRIC_GRID_RANGE);
    if (validationMetricConstraints && Object.keys(validationMetricConstraints).length > 0) {
      adjustedMetricWeights = applyMetricWeightConstraints(metricConfig, adjustedMetricWeights, validationMetricConstraints);
    }

    let evaluation;
    const ranking = runRanking({
      roundsRawData: getCurrentSeasonRoundsForRanking(
        resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization)
      ),
      approachRawData: approachData,
      groupWeights: normalizedWeights,
      metricWeights: adjustedMetricWeights,
      includeCurrentEventRounds: resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization)
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
      resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization)
    ),
    approachRawData: approachData,
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights,
    includeCurrentEventRounds: resolveIncludeCurrentEventRounds(CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization)
  });

  const optimizedEvaluationCurrent = resultsCurrent.length > 0
    ? evaluateRankings(optimizedRankingCurrent.players, resultsCurrent, { includeTopN: true })
    : null;

  // ============================================================================
  // STEP 4: MULTI-YEAR VALIDATION
  // ============================================================================
  console.log('---');
  console.log('STEP 4: MULTI-YEAR VALIDATION');
  console.log('Test optimized weights across all available years');
  console.log('---');

  console.log('\n🔄 Building multi-year validation data...');
  console.log('   Using 2026 approach metrics for all historical years');
  console.log('   Filtering to only players with approach data available\n');

  // Get DG IDs of players with approach data
  const playersWithApproach = new Set(approachData.map(row => String(row['dg_id'] || '').trim()).filter(id => id));
  console.log(`✓ ${playersWithApproach.size} players have 2026 approach data`);

  // Group historical by year, filtered to players with approach data
  console.log(`\n📊 Historical rounds by year (2026 field + approach data available):`);
  const multiYearResults = {};
  
  for (const [year, rounds] of Object.entries(roundsByYear)) {
    console.log(`\n  ${year}: ${rounds.length} rounds`);
    
    // Build player data for this year with 2026 approach metrics
    const useApproach = String(year) === String(CURRENT_SEASON);
    const adjustedGroupWeights = useApproach ? bestOptimized.weights : removeApproachGroupWeights(bestOptimized.weights);
    const ranking = runRanking({
      roundsRawData: rounds,
      approachRawData: useApproach ? approachData : [],
      groupWeights: adjustedGroupWeights,
      metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights,
      includeCurrentEventRounds: resolveIncludeCurrentEventRounds(useApproach ? CURRENT_EVENT_ROUNDS_DEFAULTS.currentSeasonOptimization : CURRENT_EVENT_ROUNDS_DEFAULTS.historicalEvaluation)
    });

    const evaluationResults = resultsByYear[year] && resultsByYear[year].length > 0
      ? resultsByYear[year]
      : resultsCurrent;
    const evaluation = evaluateRankings(ranking.players, evaluationResults, {
      includeTopN: true,
      includeTopNDetails: true
    });
    multiYearResults[year] = evaluation;
    
    const top10Text = typeof evaluation.top10 === 'number' ? `${evaluation.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evaluation.top20 === 'number' ? `${evaluation.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `${evaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = evaluation.top10Details ? `${evaluation.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = evaluation.top20Details ? `${evaluation.top20Details.overlapCount}/20` : 'n/a';
    console.log(`     Correlation: ${evaluation.correlation.toFixed(4)} | Top-10: ${top10Text} | Top-20: ${top20Text} | Top-20 Weighted: ${top20WeightedText} | Top-10 Overlap: ${top10OverlapText} | Top-20 Overlap: ${top20OverlapText}`);
  }

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

  console.log('\nMulti-Year Validation:');
  Object.entries(multiYearResults).forEach(([year, evalResult]) => {
    const top10Text = typeof evalResult.top10 === 'number' ? `${evalResult.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evalResult.top20 === 'number' ? `${evalResult.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evalResult.top20WeightedScore === 'number' ? `${evalResult.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = evalResult.top10Details ? `${evalResult.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = evalResult.top20Details ? `${evalResult.top20Details.overlapCount}/20` : 'n/a';
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-10=${top10Text} | Top-20=${top20Text} | Top-20 Weighted=${top20WeightedText} | Top-10 Overlap=${top10OverlapText} | Top-20 Overlap=${top20OverlapText}`);
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

  console.log('\n✓ Step 4: Multi-Year Validation Results');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    const top10Text = typeof result.top10 === 'number' ? `${result.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof result.top20 === 'number' ? `${result.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `${result.top20WeightedScore.toFixed(1)}%` : 'n/a';
    const top10OverlapText = result.top10Details ? `${result.top10Details.overlapCount}/10` : 'n/a';
    const top20OverlapText = result.top20Details ? `${result.top20Details.overlapCount}/20` : 'n/a';
    console.log(`   ${year}: Correlation=${result.correlation.toFixed(4)}, Top-10=${top10Text}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}, Top-10 Overlap=${top10OverlapText}, Top-20 Overlap=${top20OverlapText}, Players=${result.matchedPlayers}`);
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

  const output = {
    timestamp: new Date().toISOString(),
    eventId: CURRENT_EVENT_ID,
    tournament: TOURNAMENT_NAME || 'Sony Open',
    dryRun: DRY_RUN,
    optSeed: OPT_SEED_RAW || null,
    runFingerprint,
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
      deltaTrendsPath: validationData.deltaTrendsPath || null,
      deltaTrendSummary
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
    step4_multiYear: multiYearResults,
    recommendation: {
      approach: improvement > 0.01 ? 'Use optimized weights' : (improvement > 0 ? 'Marginal improvement' : 'Use template baseline'),
      baselineTemplate: bestTemplate.name,
      optimizedWeights: bestOptimized.weights
    }
  };

  const baseName = (TOURNAMENT_NAME || `event_${CURRENT_EVENT_ID}`)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '');

  const seedSuffix = OPT_SEED_RAW
    ? `_seed-${String(OPT_SEED_RAW).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, '')}`
    : '';

  const outputBaseName = `${baseName}${seedSuffix}`;

  const outputPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_results.json`);
  const backupJsonPath = backupIfExists(outputPath);
  if (backupJsonPath) {
    console.log(`🗄️  Backed up previous JSON results to: ${backupJsonPath}`);
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

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
  textLines.push('Functions: buildHistoricalMetricSamples, computeHistoricalMetricCorrelations (adaptiveOptimizer_v2.js)');
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
  textLines.push('Functions: runRanking (adaptiveOptimizer_v2.js) -> buildPlayerData (utilities/dataPrep.js) -> generatePlayerRankings (modelCore.js)');
  textLines.push('Additional: computeGeneratedMetricCorrelations, computeGeneratedMetricTopNCorrelations, trainTopNLogisticModel, crossValidateTopNLogisticByEvent, buildSuggestedMetricWeights, buildSuggestedGroupWeights (adaptiveOptimizer_v2.js)');
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
  textLines.push('Functions: runRanking, evaluateRankings, computeTemplateCorrelationAlignment (adaptiveOptimizer_v2.js)');
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
  textLines.push('Functions: selectOptimizableGroups, runRanking, evaluateRankings (adaptiveOptimizer_v2.js)');
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
  textLines.push('Functions: adjustMetricWeights, computeMetricAlignmentScore, runRanking, evaluateRankings (adaptiveOptimizer_v2.js)');
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
  textLines.push('STEP 4: MULTI-YEAR VALIDATION (with 2026 approach metrics)');
  textLines.push('Functions: runRanking, aggregateYearlyEvaluations (adaptiveOptimizer_v2.js)');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    const top10Text = typeof result.top10 === 'number' ? `, Top-10=${result.top10.toFixed(1)}%` : '';
    const top20Text = typeof result.top20 === 'number' ? `, Top-20=${result.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `, Top-20 Weighted=${result.top20WeightedScore.toFixed(1)}%` : '';
    const top10OverlapText = result.top10Details ? `, Top-10 Overlap=${result.top10Details.overlapCount}/10` : '';
    const top20OverlapText = result.top20Details ? `, Top-20 Overlap=${result.top20Details.overlapCount}/20` : '';
    textLines.push(
      `  ${year}: Corr=${result.correlation.toFixed(4)}, R²=${result.rSquared.toFixed(4)}, RMSE=${result.rmse.toFixed(2)}, MAE=${result.mae.toFixed(2)}, Mean Err=${result.meanError.toFixed(2)}, Std Err=${result.stdDevError.toFixed(2)}${top10Text}${top20Text}${top20WeightedText}${top10OverlapText}${top20OverlapText}, Players=${result.matchedPlayers}`
    );
  });
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
    textLines.push(`Event template (${optimizedTemplate.name}): ${actionLabel}`);
    eventTemplateTargets.forEach(target => textLines.push(`  - ${target}`));
  } else {
    textLines.push(`Event template (${optimizedTemplate.name}): not written`);
  }
  if (validationTemplateActions.length > 0) {
    validationTemplateActions.forEach(entry => {
      const actionLabel = entry.action === 'dryRun' ? 'dry-run output' : 'write';
      textLines.push(`Standard template (${entry.name}): ${actionLabel}`);
      textLines.push(`  - ${entry.target}`);
    });
  } else {
    textLines.push('Standard templates: no updates');
  }
  textLines.push('');
  textLines.push('---');
  const textOutputPath = path.resolve(OUTPUT_DIR, `${outputBaseName}_results.txt`);
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

  const STANDARD_TEMPLATES = new Set(['POWER', 'BALANCED', 'TECHNICAL']);
  const baselineTemplateForCompare = {
    groupWeights: bestTemplate.groupWeights,
    metricWeights: bestTemplate.metricWeights
  };
  const optimizedTemplateForCompare = {
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights
  };
  const shouldWriteEventTemplate = templatesAreDifferent(
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
  const shouldUpdateStandardTemplate = typeof validationImprovementPct === 'number'
    ? validationImprovementPct >= 0.01
    : false;

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
    path.resolve(ROOT_DIR, 'utilities', 'weightTemplates.js'),
    path.resolve(ROOT_DIR, '..', 'Golf_Algorithm_Library', 'utilities', 'templateLoader.js')
  ];

  writeBackTargets.forEach(filePath => {
    if (shouldAttemptEventWrite) {
      const result = upsertTemplateInFile(filePath, optimizedTemplate, { replaceByEventId: true, dryRun: DRY_RUN });
      if (result.updated) {
        if (DRY_RUN && result.content) {
          const dryRunPath = path.resolve(OUTPUT_DIR, `dryrun_${path.basename(filePath)}`);
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
            const dryRunPath = path.resolve(OUTPUT_DIR, `dryrun_${validationTemplate.name}_${path.basename(filePath)}`);
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

  console.log(`✅ JSON results also saved to: output/${outputBaseName}_results.json`);
  console.log(`✅ Text results saved to: output/${outputBaseName}_results.txt\n`);
}

runAdaptiveOptimizer();

// Note: Text output functionality added via separate command
