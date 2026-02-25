const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const { loadCsv } = require('../utilities/csvLoader');
const { getSharedConfig, loadConfigCells, getCell } = require('../utilities/configParser');
const { WEIGHT_TEMPLATES } = require('../utilities/weightTemplates');
const {
  getDataGolfHistoricalRounds,
  getDataGolfLiveTournamentStats
} = require('../utilities/dataGolfClient');

const DEFAULT_OUTPUT_DIR_NAME = 'validation_outputs';
const METRIC_ANALYSIS_DIR_NAME = 'metric_analysis';
const TEMPLATE_CORRELATION_DIR_NAME = 'template_correlation_summaries';
const ROOT_DIR = path.resolve(__dirname, '..');
const DATAGOLF_CACHE_DIR = path.resolve(ROOT_DIR, 'data', 'cache');
const METRIC_ANALYSIS_VERSION = 3;
const DATAGOLF_API_KEY = String(process.env.DATAGOLF_API_KEY || '').trim();
const DATAGOLF_HISTORICAL_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_HISTORICAL_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 72 : Math.max(1, raw);
})();
const DATAGOLF_HISTORICAL_TOUR = String(process.env.DATAGOLF_HISTORICAL_TOUR || 'pga')
  .trim()
  .toLowerCase();
const DATAGOLF_LIVE_STATS_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_LIVE_STATS_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 1 : Math.max(0.25, raw);
})();
const DATAGOLF_LIVE_STATS_TOUR = String(process.env.DATAGOLF_LIVE_STATS_TOUR || 'pga')
  .trim()
  .toLowerCase();

const OUTPUT_NAMES = {
  calibrationReport: 'Calibration_Report',
  weightTemplates: 'Weight_Templates',
  courseTypeClassification: 'Course_Type_Classification',
  processingLog: 'Processing_Log',
  modelDeltaTrends: 'Model_Delta_Trends',
  powerCorrelationSummary: 'POWER_Correlation_Summary',
  technicalCorrelationSummary: 'TECHNICAL_Correlation_Summary',
  balancedCorrelationSummary: 'BALANCED_Correlation_Summary',
  weightCalibrationGuide: 'Weight_Calibration_Guide'
};

const METRIC_ORDER = [
  'Driving Distance',
  'Driving Accuracy',
  'SG OTT',
  'Approach <100 GIR',
  'Approach <100 SG',
  'Approach <100 Prox',
  'Approach <150 FW GIR',
  'Approach <150 FW SG',
  'Approach <150 FW Prox',
  'Approach <150 Rough GIR',
  'Approach <150 Rough SG',
  'Approach <150 Rough Prox',
  'Approach <200 FW GIR',
  'Approach <200 FW SG',
  'Approach <200 FW Prox',
  'Approach >150 Rough GIR',
  'Approach >150 Rough SG',
  'Approach >150 Rough Prox',
  'Approach >200 FW GIR',
  'Approach >200 FW SG',
  'Approach >200 FW Prox',
  'SG Putting',
  'SG Around Green',
  'SG T2G',
  'Scoring Average',
  'Birdie Chances Created',
  'Birdies or Better',
  'Greens in Regulation',
  'Scoring: Approach <100 SG',
  'Scoring: Approach <150 FW SG',
  'Scoring: Approach <150 Rough SG',
  'Scoring: Approach >150 Rough SG',
  'Scoring: Approach <200 FW SG',
  'Scoring: Approach >200 FW SG',
  'Scrambling',
  'Great Shots',
  'Poor Shot Avoidance',
  'Course Management: Approach <100 Prox',
  'Course Management: Approach <150 FW Prox',
  'Course Management: Approach <150 Rough Prox',
  'Course Management: Approach >150 Rough Prox',
  'Course Management: Approach <200 FW Prox',
  'Course Management: Approach >200 FW Prox'
];

const METRIC_ALIASES = {
  'Poor Shots': 'Poor Shot Avoidance',
  'Scoring - Approach <100 SG': 'Scoring: Approach <100 SG',
  'Scoring - Approach <150 FW SG': 'Scoring: Approach <150 FW SG',
  'Scoring - Approach <150 Rough SG': 'Scoring: Approach <150 Rough SG',
  'Scoring - Approach >150 Rough SG': 'Scoring: Approach >150 Rough SG',
  'Scoring - Approach <200 FW SG': 'Scoring: Approach <200 FW SG',
  'Scoring - Approach >200 FW SG': 'Scoring: Approach >200 FW SG',
  'Course Management - Approach <100 Prox': 'Course Management: Approach <100 Prox',
  'Course Management - Approach <150 FW Prox': 'Course Management: Approach <150 FW Prox',
  'Course Management - Approach <150 Rough Prox': 'Course Management: Approach <150 Rough Prox',
  'Course Management - Approach >150 Rough Prox': 'Course Management: Approach >150 Rough Prox',
  'Course Management - Approach <200 FW Prox': 'Course Management: Approach <200 FW Prox',
  'Course Management - Approach >200 FW Prox': 'Course Management: Approach >200 FW Prox'
};

const RESULTS_HEADERS = [
  'Performance Analysis',
  'DG ID',
  'Player Name',
  'Model Rank',
  'Finish Position',
  'Score',
  'SG Total',
  'SG Total - Model',
  'Driving Distance',
  'Driving Distance - Model',
  'Driving Accuracy',
  'Driving Accuracy - Model',
  'SG T2G',
  'SG T2G - Model',
  'SG Approach',
  'SG Approach - Model',
  'SG Around Green',
  'SG Around Green - Model',
  'SG OTT',
  'SG OTT - Model',
  'SG Putting',
  'SG Putting - Model',
  'Greens in Regulation',
  'Greens in Regulation - Model',
  'Fairway Proximity',
  'Fairway Proximity - Model',
  'Rough Proximity',
  'Rough Proximity - Model',
  'SG BS',
  'Scoring Average',
  'Birdies or Better',
  'Scrambling',
  'Great Shots',
  'Poor Shot Avoidance'
];

const RESULTS_METRIC_TYPES = {
  LOWER_BETTER: new Set([
    'Fairway Proximity',
    'Rough Proximity',
    'Fairway Proximity - Model',
    'Rough Proximity - Model'
  ]),
  HIGHER_BETTER: new Set([
    'SG Total',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'SG BS',
    'SG Total - Model',
    'SG T2G - Model',
    'SG Approach - Model',
    'SG Around Green - Model',
    'SG OTT - Model',
    'SG Putting - Model',
    'Driving Distance',
    'Driving Distance - Model',
    'Driving Accuracy',
    'Driving Accuracy - Model',
    'Greens in Regulation',
    'Greens in Regulation - Model'
  ]),
  PERCENTAGE: new Set([
    'Driving Accuracy',
    'Driving Accuracy - Model',
    'Greens in Regulation',
    'Greens in Regulation - Model'
  ]),
  HAS_MODEL: new Set([
    'SG Total',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'Driving Distance',
    'Driving Accuracy',
    'Greens in Regulation',
    'Fairway Proximity',
    'Rough Proximity',
    'WAR'
  ]),
  DECIMAL_3: new Set([
    'SG Total',
    'SG T2G',
    'SG Approach',
    'SG Around Green',
    'SG OTT',
    'SG Putting',
    'SG BS',
    'SG Total - Model',
    'SG T2G - Model',
    'SG Approach - Model',
    'SG Around Green - Model',
    'SG OTT - Model',
    'SG Putting - Model'
  ]),
  DECIMAL_2: new Set([
    'Driving Distance',
    'Driving Distance - Model',
    'Fairway Proximity',
    'Fairway Proximity - Model',
    'Rough Proximity',
    'Rough Proximity - Model'
  ]),
  RANK: new Set(['Model Rank', 'Finish Position'])
};

const RESULT_METRIC_FIELDS = [
  { label: 'SG Total', key: 'sg_total' },
  { label: 'Driving Distance', key: 'driving_dist' },
  { label: 'Driving Accuracy', key: 'driving_acc' },
  { label: 'SG T2G', key: 'sg_t2g' },
  { label: 'SG Approach', key: 'sg_app' },
  { label: 'SG Around Green', key: 'sg_arg' },
  { label: 'SG OTT', key: 'sg_ott' },
  { label: 'SG Putting', key: 'sg_putt' },
  { label: 'Greens in Regulation', key: 'gir' },
  { label: 'Fairway Proximity', key: 'prox_fw' },
  { label: 'Rough Proximity', key: 'prox_rgh' },
  { label: 'SG BS', key: 'sg_bs', hasModel: false },
  { label: 'Scoring Average', key: 'scoring_avg', hasModel: false },
  { label: 'Birdies or Better', key: 'birdies_or_better', hasModel: false },
  { label: 'Scrambling', key: 'scrambling', hasModel: false },
  { label: 'Great Shots', key: 'great_shots', hasModel: false },
  { label: 'Poor Shot Avoidance', key: 'poor_shot_avoid', hasModel: false }
];

const RESULTS_REQUIRED_FIELDS = [
  'Scoring Average',
  'Birdies or Better',
  'Scrambling',
  'Great Shots',
  'Poor Shot Avoidance'
];

const getValidationOutputDir = (dataRootDir, season) => {
  return path.resolve(dataRootDir, String(season), DEFAULT_OUTPUT_DIR_NAME);
};

const getMetricAnalysisDir = outputDir => {
  if (!outputDir) return null;
  return path.resolve(outputDir, METRIC_ANALYSIS_DIR_NAME);
};

const getTemplateCorrelationDir = outputDir => {
  if (!outputDir) return null;
  return path.resolve(outputDir, TEMPLATE_CORRELATION_DIR_NAME);
};

const isMetricAnalysisPopulated = analysis => {
  if (!analysis || !Array.isArray(analysis.metrics)) return false;
  if (analysis.metrics.length === 0) return false;
  if (!analysis.courseType || String(analysis.courseType || '').trim() === '') return false;
  return analysis.metrics.some(entry => {
    const fieldCount = entry?.fieldCount ?? entry?.field_count ?? entry?.fieldCount;
    const top10Count = entry?.top10Count ?? entry?.top10_count;
    if (typeof fieldCount === 'number') return fieldCount > 0;
    if (typeof top10Count === 'number') return top10Count > 0;
    return false;
  });
};

const shouldSkipMetricAnalysis = (outputDir, tournamentSlug, resultsJsonPath) => {
  if (!outputDir || !tournamentSlug) return false;
  const metricDir = getMetricAnalysisDir(outputDir);
  const fileName = `${tournamentSlug}_metric_analysis.json`;
  const filePath = metricDir ? path.resolve(metricDir, fileName) : path.resolve(outputDir, fileName);
  if (!fs.existsSync(filePath)) return false;
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isMetricAnalysisPopulated(payload)) return false;
    if (payload?.version !== METRIC_ANALYSIS_VERSION) return false;

    if (resultsJsonPath && fs.existsSync(resultsJsonPath)) {
      const stats = fs.statSync(resultsJsonPath);
      const resultsTime = stats?.mtime ? stats.mtime.getTime() : stats?.mtimeMs || 0;
      const analysisTime = payload?.generatedAt ? Date.parse(payload.generatedAt) : NaN;
      if (!Number.isNaN(analysisTime) && resultsTime > analysisTime) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
};

const ensureDirectory = dirPath => {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const captureOutputState = (label, filePath) => {
  if (!filePath) return null;
  return {
    label,
    path: filePath,
    existedBefore: fs.existsSync(filePath)
  };
};

const recordOutputWrite = (outputs, entry, written = true) => {
  if (!entry) return;
  outputs.push({
    ...entry,
    written
  });
};

const listSeasonTournamentDirs = (dataRootDir, season) => {
  if (!dataRootDir || !season) return [];
  const seasonDir = path.resolve(dataRootDir, String(season));
  if (!fs.existsSync(seasonDir)) return [];
  return fs
    .readdirSync(seasonDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name !== DEFAULT_OUTPUT_DIR_NAME)
    .filter(entry => entry.name.toLowerCase() !== 'all')
    .map(entry => path.resolve(seasonDir, entry.name));
};

const slugifyTournament = value => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const formatTournamentDisplayName = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
};

const normalizeTournamentNameForSeason = (value, season) => {
  const raw = String(value || '').trim();
  if (!raw || !season) return raw;
  const seasonTag = `(${season})`;
  if (raw.endsWith(seasonTag)) {
    return raw.slice(0, raw.length - seasonTag.length).trim();
  }
  return raw;
};

const buildSlugCandidates = ({ tournamentSlug, tournamentName, tournamentDir }) => {
  const baseSlug = tournamentSlug || slugifyTournament(tournamentName);
  const fromDir = tournamentDir ? path.basename(tournamentDir) : null;
  const normalizedBase = baseSlug ? baseSlug.replace(/_/g, '-') : null;
  const withoutThe = normalizedBase ? normalizedBase.replace(/^the-/, '') : null;
  const candidates = [fromDir, baseSlug, normalizedBase, withoutThe].filter(Boolean);
  const expanded = new Set();
  candidates.forEach(candidate => {
    expanded.add(candidate);
    expanded.add(candidate.replace(/-/g, '_'));
    expanded.add(candidate.replace(/_/g, '-'));
    if (!candidate.startsWith('the-')) {
      expanded.add(`the-${candidate}`);
      expanded.add(`the-${candidate}`.replace(/-/g, '_'));
    }
  });
  return Array.from(expanded).filter(Boolean);
};

const inferTournamentNameFromInputs = (inputsDir, season, fallbackName) => {
  if (!inputsDir || !fs.existsSync(inputsDir)) return fallbackName || null;
  const files = fs.readdirSync(inputsDir);
  const patterns = [
    season ? new RegExp(`^(.*) \(${season}\) - Configuration Sheet\.csv$`, 'i') : null,
    season ? new RegExp(`^(.*) \(${season}\) - Historical Data\.csv$`, 'i') : null,
    new RegExp('^(.*) - Configuration Sheet\\.csv$', 'i'),
    new RegExp('^(.*) - Historical Data\\.csv$', 'i')
  ].filter(Boolean);

  for (const file of files) {
    for (const pattern of patterns) {
      const match = file.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  return fallbackName || null;
};

const resolveExistingPath = (dir, candidates = [], suffix) => {
  if (!dir || !suffix) return null;
  for (const candidate of candidates) {
    const filePath = path.resolve(dir, `${candidate}${suffix}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
};

const resolveInputCsvPath = ({ inputsDir, season, suffix }) => {
  if (!inputsDir || !suffix || !fs.existsSync(inputsDir)) return null;
  const files = fs.readdirSync(inputsDir).filter(file => file.toLowerCase().includes(suffix.toLowerCase()));
  if (files.length === 0) return null;
  if (season) {
    const seasonTag = `(${season})`;
    const seasonMatch = files.find(file => file.includes(seasonTag));
    if (seasonMatch) return path.resolve(inputsDir, seasonMatch);
  }
  return path.resolve(inputsDir, files[0]);
};

const resolveRankingPath = (dir, candidates, suffix) => {
  const direct = resolveExistingPath(dir, candidates, suffix);
  if (direct) return direct;
  return null;
};

const readJsonFile = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
};

const parseCsvRows = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, {
    relax_column_count: true,
    skip_empty_lines: false
  });
};

const RESULTS_LIVE_STATS = 'sg_ott,sg_app,sg_arg,sg_putt,sg_t2g,sg_bs,sg_total,distance,accuracy,gir,prox_fw,prox_rgh,scrambling,great_shots,poor_shots';

const normalizeHeader = value => String(value || '').trim().toLowerCase();

const normalizeMetricLabel = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return METRIC_ALIASES[raw] || raw;
};

const findHeaderRowIndex = (rows, requiredHeaders = []) => {
  const normalizedRequired = requiredHeaders.map(header => normalizeHeader(header));
  let bestIndex = -1;
  let bestScore = 0;

  rows.forEach((row, idx) => {
    const cells = row.map(cell => normalizeHeader(cell));
    const matches = normalizedRequired.filter(header => cells.includes(header)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestIndex = idx;
    }
  });

  if (bestScore === 0) return -1;
  return bestIndex;
};

const buildHeaderIndexMap = headers => {
  const map = new Map();
  headers.forEach((header, idx) => {
    const normalized = normalizeHeader(header);
    if (!map.has(normalized)) map.set(normalized, idx);
  });
  return map;
};

const parseFinishPosition = value => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'CUT' || raw === 'WD' || raw === 'DQ') return null;
  if (raw.startsWith('T')) {
    const parsed = parseInt(raw.substring(1), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (/^\d+T$/.test(raw)) {
    const parsed = parseInt(raw.replace('T', ''), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const rankValues = values => {
  const entries = values.map((value, index) => ({ value, index }));
  entries.sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  let currentRank = 1;
  for (let i = 0; i < entries.length; i += 1) {
    if (i > 0 && entries[i].value !== entries[i - 1].value) {
      currentRank = i + 1;
    }
    ranks[entries[i].index] = currentRank;
  }
  return ranks;
};

const calculatePearsonCorrelation = (xValues, yValues) => {
  if (!xValues.length) return 0;
  const n = xValues.length;
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / n;
  const meanY = yValues.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
};

const calculateSpearmanCorrelation = (xValues, yValues) => {
  if (!Array.isArray(xValues) || !Array.isArray(yValues)) return 0;
  if (xValues.length === 0 || xValues.length !== yValues.length) return 0;
  const rankedX = rankValues(xValues);
  const rankedY = rankValues(yValues);
  return calculatePearsonCorrelation(rankedX, rankedY);
};

const computeMetricCorrelation = (metricName, positions, values) => {
  if (!Array.isArray(positions) || !Array.isArray(values)) return 0;
  if (positions.length === 0 || positions.length !== values.length) return 0;
  const adjustedValues = isLowerBetterMetric(metricName)
    ? values.map(value => -value)
    : values;
  const invertedPositions = positions.map(position => -position);
  return calculateSpearmanCorrelation(invertedPositions, adjustedValues);
};

const calculateRmse = (predicted, actual) => {
  if (!predicted.length || predicted.length !== actual.length) return 0;
  const sumSq = predicted.reduce((sum, value, idx) => sum + Math.pow(value - actual[idx], 2), 0);
  return Math.sqrt(sumSq / predicted.length);
};

const buildFinishPositionMap = results => {
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
};

const normalizeFinishPosition = value => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'CUT' || raw === 'WD' || raw === 'DQ') return null;
  if (raw.startsWith('T')) {
    const parsed = parseInt(raw.substring(1), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (/^\d+T$/.test(raw)) {
    const parsed = parseInt(raw.replace('T', ''), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const applyFinishFallback = entries => {
  const numericPositions = entries
    .map(entry => entry.finishPosition)
    .filter(value => typeof value === 'number' && !Number.isNaN(value));
  const fallback = numericPositions.length ? Math.max(...numericPositions) + 1 : null;

  return entries
    .map(entry => {
      const finishPosition = (typeof entry.finishPosition === 'number' && !Number.isNaN(entry.finishPosition))
        ? entry.finishPosition
        : fallback;
      return { ...entry, finishPosition };
    })
    .filter(entry => entry.dgId && typeof entry.finishPosition === 'number' && !Number.isNaN(entry.finishPosition));
};

const calculateTopNHitRate = (predictions, resultsById, n) => {
  if (!predictions || !predictions.length || !resultsById || resultsById.size === 0) return 0;
  const sorted = [...predictions].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const topPredicted = sorted.slice(0, n);
  const matches = topPredicted.filter(pred => {
    const finish = resultsById.get(String(pred.dgId));
    return typeof finish === 'number' && !Number.isNaN(finish) && finish <= n;
  }).length;
  return topPredicted.length ? (matches / topPredicted.length) * 100 : 0;
};

const evaluateTournamentPredictions = (predictions, results) => {
  const { map: resultsById } = buildFinishPositionMap(results);
  const matchedPlayers = [];
  const predictedRanks = [];
  const actualFinishes = [];

  (predictions || []).forEach((pred, idx) => {
    const finish = resultsById.get(String(pred.dgId));
    if (typeof finish !== 'number' || Number.isNaN(finish)) return;
    const rankValue = typeof pred.rank === 'number' ? pred.rank : (idx + 1);
    predictedRanks.push(rankValue);
    actualFinishes.push(finish);
    matchedPlayers.push({
      name: pred.name,
      dgId: pred.dgId,
      predictedRank: rankValue,
      actualFinish: finish,
      error: Math.abs(rankValue - finish)
    });
  });

  if (predictedRanks.length === 0) {
    return {
      matchedPlayers: [],
      metrics: {
        spearman: 0,
        rmse: 0,
        top5: 0,
        top10: 0,
        top20: 0,
        top50: 0
      }
    };
  }

  return {
    matchedPlayers,
    metrics: {
      spearman: calculateSpearmanCorrelation(predictedRanks, actualFinishes),
      rmse: calculateRmse(predictedRanks, actualFinishes),
      top5: calculateTopNHitRate(predictions, resultsById, 5),
      top10: calculateTopNHitRate(predictions, resultsById, 10),
      top20: calculateTopNHitRate(predictions, resultsById, 20),
      top50: calculateTopNHitRate(predictions, resultsById, 50)
    }
  };
};

const parseNumericValue = value => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').replace(/%/g, '');
  const parsed = parseFloat(cleaned);
  if (Number.isNaN(parsed)) return null;
  if (raw.includes('%') && parsed > 1.5) {
    return parsed / 100;
  }
  return parsed;
};

const roundMetricValueForAnalysis = value => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Number(value.toFixed(3));
};

const formatPositionText = value => {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  return raw;
};

const parseModelRankingData = rankingsCsvPath => {
  if (!rankingsCsvPath || !fs.existsSync(rankingsCsvPath)) {
    return { playersById: new Map(), metricStats: {} };
  }

  const rows = parseCsvRows(rankingsCsvPath);
  const headerIndex = findHeaderRowIndex(rows, ['dg id', 'player name', 'rank']);
  if (headerIndex === -1) return { playersById: new Map(), metricStats: {} };
  const headers = rows[headerIndex];
  const headerMap = buildHeaderIndexMap(headers);

  const dgIdIdx = headerMap.get('dg id');
  const nameIdx = headerMap.get('player name');
  const rankIdx = headerMap.get('rank') ?? headerMap.get('model rank');
  const warIdx = headerMap.get('war');

  const metricIndices = new Map();
  RESULT_METRIC_FIELDS.forEach(field => {
    if (!field.label || field.hasModel === false) return;
    const idx = headerMap.get(normalizeHeader(field.label));
    if (idx !== undefined) metricIndices.set(field.label, idx);
  });

  const trendIndices = new Map();
  headers.forEach((header, idx) => {
    const headerText = String(header || '').trim();
    if (!headerText || !headerText.toLowerCase().includes('trend')) return;
    const baseMetric = headerText.replace(/\s*trend\s*$/i, '').trim();
    if (!RESULTS_METRIC_TYPES.HAS_MODEL.has(baseMetric)) return;
    trendIndices.set(baseMetric, idx);
  });

  const playersById = new Map();
  const metricBuckets = {};

  rows.slice(headerIndex + 1).forEach(row => {
    const dgId = dgIdIdx !== undefined ? String(row[dgIdIdx] || '').trim() : '';
    if (!dgId) return;
    const name = nameIdx !== undefined ? String(row[nameIdx] || '').trim() : '';
    const rankValue = rankIdx !== undefined ? parseInt(String(row[rankIdx] || '').trim(), 10) : NaN;
    const warValue = warIdx !== undefined ? parseNumericValue(row[warIdx]) : null;

    const metrics = {};
    metricIndices.forEach((idx, label) => {
      const value = parseNumericValue(row[idx]);
      if (typeof value === 'number' && !Number.isNaN(value)) {
        metrics[label] = value;
        if (!metricBuckets[label]) metricBuckets[label] = [];
        metricBuckets[label].push(value);
      }
    });

    const trends = {};
    trendIndices.forEach((idx, label) => {
      const value = parseNumericValue(row[idx]);
      if (typeof value === 'number' && !Number.isNaN(value)) {
        trends[label] = value;
      }
    });

    playersById.set(dgId, {
      dgId,
      name,
      rank: Number.isNaN(rankValue) ? null : rankValue,
      war: typeof warValue === 'number' ? warValue : null,
      metrics,
      trends
    });
  });

  const metricStats = {};
  Object.entries(metricBuckets).forEach(([label, values]) => {
    const count = values.length;
    if (!count) return;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / count;
    metricStats[label] = {
      mean,
      stdDev: Math.sqrt(variance)
    };
  });

  return { playersById, metricStats };
};

const getCategoryForMetric = metricName => {
  if (!metricName) return '';
  const metricLower = String(metricName || '').toLowerCase();
  if (metricLower.includes('ott') || metricLower.includes('driving')) {
    return 'Driving';
  }
  if (metricLower.includes('approach') || metricLower.includes('iron')) {
    return 'Approach';
  }
  if (metricLower.includes('around') || metricLower.includes('arg') || metricLower.includes('short game')) {
    return 'Short Game';
  }
  if (metricLower.includes('putting') || metricLower.includes('putt')) {
    return 'Putting';
  }
  if (metricLower.includes('total') || metricLower.includes('t2g')) {
    return 'Overall';
  }
  if (metricLower.includes('gir') || metricLower.includes('greens')) {
    return 'Approach';
  }
  if (metricLower.includes('proximity') || metricLower.includes('prox')) {
    return 'Approach';
  }
  return '';
};


const buildPerformanceNotes = ({
  dgId,
  playerName,
  modelRank,
  finishPosition,
  finishText,
  modelData,
  metricStats,
  actualMetrics
}) => {
  const notes = [];
  const safeFinish = typeof finishPosition === 'number' ? finishPosition : null;
  const safeModelRank = typeof modelRank === 'number' ? modelRank : null;

  if (safeFinish !== null && safeModelRank !== null) {
    if (safeModelRank <= 10 && safeFinish <= 10) {
      notes.push(`🎯 Model prediction on target: #${safeModelRank} → ${finishText || safeFinish}`);
    } else if (safeFinish <= 10 && safeModelRank > 50) {
      notes.push(`⚠️ Major model miss: #${safeModelRank} → ${finishText || safeFinish}`);
    } else if (safeModelRank <= 10 && safeFinish > 50) {
      notes.push('⚠️ Model overestimated performance');
    } else if (Math.abs(safeModelRank - safeFinish) > 30) {
      const direction = safeModelRank > safeFinish ? 'better' : 'worse';
      notes.push(`${direction === 'better' ? '↑' : '↓'} Finished ${direction} than predicted`);
    }
  }

  const trends = modelData?.trends || {};
  const trendAnalysis = [];
  Object.entries(trends).forEach(([metricName, trendValue]) => {
    if (!RESULTS_METRIC_TYPES.HAS_MODEL.has(metricName)) return;
    const currentValue = actualMetrics?.[metricName];
    if (typeof currentValue !== 'number' || Number.isNaN(currentValue)) return;

    const stats = metricStats?.[metricName] || null;
    let isTrendSignificant = false;
    let trendZScore = null;
    if (stats?.stdDev && stats.stdDev > 0) {
      const trendStdDev = stats.stdDev * 0.2;
      trendZScore = trendValue / trendStdDev;
      isTrendSignificant = Math.abs(trendZScore) > 1.96;
    } else {
      isTrendSignificant = Math.abs(trendValue) > 0.05;
    }

    if (!isTrendSignificant) return;

    const isHigherBetter = !RESULTS_METRIC_TYPES.LOWER_BETTER.has(metricName);
    let isGoodPerformance = false;
    if (metricName.includes('SG')) {
      isGoodPerformance = isHigherBetter ? currentValue > 0 : currentValue < 0;
    } else if (stats?.mean !== undefined && stats.mean !== null) {
      isGoodPerformance = isHigherBetter ? currentValue > stats.mean : currentValue < stats.mean;
    } else {
      isGoodPerformance = isHigherBetter ? currentValue > 0 : currentValue < 0;
    }

    const isPositiveTrend = trendValue > 0;
    const isCorrelationConfirmed = (isPositiveTrend && isGoodPerformance) || (!isPositiveTrend && !isGoodPerformance);
    const significanceScore = Math.abs(trendValue) * (isCorrelationConfirmed ? 2 : 1);

    trendAnalysis.push({
      metric: metricName,
      trendValue,
      correlation: isCorrelationConfirmed ? 'confirmed' : 'contradicted',
      direction: isPositiveTrend ? 'improving' : 'declining',
      significance: significanceScore
    });
  });

  trendAnalysis.sort((a, b) => b.significance - a.significance);
  if (trendAnalysis.length > 0) {
    const primary = trendAnalysis[0];
    const category = getCategoryForMetric(primary.metric);
    if (category) {
      const arrow = primary.direction === 'improving' ? '↑' : '↓';
      notes.push(`${arrow} ${category}`);
    }

    trendAnalysis.slice(0, 3).forEach(trend => {
      const emoji = trend.direction === 'improving' ? '📈' : '📉';
      const trendDisplay = Math.abs(trend.trendValue).toFixed(3);
      notes.push(`${emoji} ${trend.metric}: ${trend.correlation === 'confirmed' ? 'trend continuing' : 'trend reversing'} (${trendDisplay})`);
    });
  }

  if (typeof modelData?.war === 'number') {
    const war = modelData.war;
    if (war >= 1.0) {
      notes.push(`⭐ Elite performer (WAR: ${war.toFixed(1)})`);
    } else if (war >= 0.5) {
      notes.push('↑ Above average performer');
    } else if (war <= -0.5) {
      notes.push('↓ Below average performer');
    }
  }

  if (safeFinish !== null && safeModelRank !== null) {
    const performedWell = safeFinish <= 20;
    const predictedWell = safeModelRank <= 20;
    if (performedWell && predictedWell) {
      notes.push('✅ Success aligned with model');
    } else if (performedWell && !predictedWell) {
      notes.push('⚠️ Success despite model prediction');
    } else if (!performedWell && predictedWell) {
      notes.push('❌ Underperformed model prediction');
    }
  }

  if (!notes.length) {
    return '';
  }
  return notes.join(' | ');
};

const computeMetricStatsFromResults = results => {
  const buckets = {};
  (results || []).forEach(entry => {
    RESULT_METRIC_FIELDS.forEach(field => {
      if (!field.label || field.hasModel === false) return;
      const value = entry?.[field.label];
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      if (!buckets[field.label]) buckets[field.label] = [];
      buckets[field.label].push(value);
    });
  });

  const stats = {};
  Object.entries(buckets).forEach(([label, values]) => {
    const count = values.length;
    if (!count) return;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / count;
    stats[label] = { mean, stdDev: Math.sqrt(variance) };
  });

  return stats;
};

const buildResultsFromHistoricalRows = (rows, eventId, season) => {
  const eventIdStr = String(eventId || '').trim();
  const seasonStr = season ? String(season).trim() : null;
  const players = new Map();
  let eventName = null;
  let courseName = null;

  (rows || []).forEach(row => {
    const dgId = String(row?.dg_id || '').trim();
    if (!dgId) return;
    const rowEvent = String(row?.event_id || '').trim();
    if (eventIdStr && rowEvent !== eventIdStr) return;
    if (seasonStr) {
      const rowSeason = String(row?.season || row?.year || '').trim();
      if (rowSeason !== seasonStr) return;
    }

    if (!eventName && row?.event_name) eventName = row.event_name;
    if (!courseName && (row?.course_name || row?.course)) courseName = row.course_name || row.course;

    const finishText = row?.fin_text || row?.finish || row?.finishPosition || row?.fin;
    const finishPosition = normalizeFinishPosition(finishText);
    const player = players.get(dgId) || {
      dgId,
      playerName: row?.player_name || row?.playerName || row?.name || null,
      finishPosition: null,
      finishText: null,
      scoreSum: 0,
      parSum: 0,
      rounds: 0,
      metrics: {
        sg_total: 0,
        sg_t2g: 0,
        sg_app: 0,
        sg_arg: 0,
        sg_ott: 0,
        sg_putt: 0,
        sg_bs: 0,
        driving_dist: 0,
        driving_acc: 0,
        gir: 0,
        prox_fw: 0,
        prox_rgh: 0,
        scoring_avg: 0,
        birdies_or_better: 0,
        scrambling: 0,
        great_shots: 0,
        poor_shot_avoid: 0
      },
      metricCounts: {
        scoring_avg: 0,
        birdies_or_better: 0,
        scrambling: 0,
        great_shots: 0,
        poor_shot_avoid: 0
      }
    };

    if (typeof finishPosition === 'number' && !Number.isNaN(finishPosition)) {
      if (player.finishPosition === null || finishPosition < player.finishPosition) {
        player.finishPosition = finishPosition;
        player.finishText = finishText ? String(finishText).trim() : String(finishPosition);
      }
    }

    const scoreValue = parseNumericValue(row?.score);
    const parValue = parseNumericValue(row?.course_par || row?.par);
    if (typeof scoreValue === 'number') player.scoreSum += scoreValue;
    if (typeof parValue === 'number') player.parSum += parValue;

    if (typeof scoreValue === 'number') {
      player.metrics.scoring_avg += scoreValue;
      player.metricCounts.scoring_avg += 1;
    }

    const birdies = parseNumericValue(row?.birdies);
    const eagles = parseNumericValue(row?.eagles_or_better);
    const birdiesOrBetter = typeof birdies === 'number'
      ? birdies + (typeof eagles === 'number' ? eagles : 0)
      : parseNumericValue(row?.birdies_or_better);
    if (typeof birdiesOrBetter === 'number') {
      player.metrics.birdies_or_better += birdiesOrBetter;
      player.metricCounts.birdies_or_better += 1;
    }

    const scrambling = parseNumericValue(row?.scrambling);
    if (typeof scrambling === 'number') {
      player.metrics.scrambling += scrambling;
      player.metricCounts.scrambling += 1;
    }

    const greatShots = parseNumericValue(row?.great_shots);
    if (typeof greatShots === 'number') {
      player.metrics.great_shots += greatShots;
      player.metricCounts.great_shots += 1;
    }

    const poorShots = parseNumericValue(row?.poor_shots);
    if (typeof poorShots === 'number') {
      player.metrics.poor_shot_avoid += poorShots;
      player.metricCounts.poor_shot_avoid += 1;
    }

    player.metrics.sg_total += parseNumericValue(row?.sg_total) || 0;
    player.metrics.sg_t2g += parseNumericValue(row?.sg_t2g) || 0;
    player.metrics.sg_app += parseNumericValue(row?.sg_app) || 0;
    player.metrics.sg_arg += parseNumericValue(row?.sg_arg) || 0;
    player.metrics.sg_ott += parseNumericValue(row?.sg_ott) || 0;
    player.metrics.sg_putt += parseNumericValue(row?.sg_putt) || 0;
    player.metrics.sg_bs += parseNumericValue(row?.sg_bs) || 0;
    player.metrics.driving_dist += parseNumericValue(row?.driving_dist) || 0;
    player.metrics.driving_acc += parseNumericValue(row?.driving_acc) || 0;
    player.metrics.gir += parseNumericValue(row?.gir) || 0;
    player.metrics.prox_fw += parseNumericValue(row?.prox_fw) || 0;
    player.metrics.prox_rgh += parseNumericValue(row?.prox_rgh) || 0;
    player.rounds += 1;

    players.set(dgId, player);
  });

  const results = Array.from(players.values()).map(player => {
    const rounds = player.rounds || 1;
    const totalScore = player.scoreSum && player.parSum
      ? player.scoreSum - player.parSum
      : null;
    return {
      dgId: player.dgId,
      playerName: player.playerName || 'Unknown',
      finishPosition: player.finishPosition,
      finishText: player.finishText || (player.finishPosition !== null ? String(player.finishPosition) : ''),
      score: totalScore,
      metrics: {
        sg_total: player.metrics.sg_total / rounds,
        sg_t2g: player.metrics.sg_t2g / rounds,
        sg_app: player.metrics.sg_app / rounds,
        sg_arg: player.metrics.sg_arg / rounds,
        sg_ott: player.metrics.sg_ott / rounds,
        sg_putt: player.metrics.sg_putt / rounds,
        sg_bs: player.metrics.sg_bs / rounds,
        driving_dist: player.metrics.driving_dist / rounds,
        driving_acc: player.metrics.driving_acc / rounds,
        gir: player.metrics.gir / rounds,
        prox_fw: player.metrics.prox_fw / rounds,
        prox_rgh: player.metrics.prox_rgh / rounds,
        scoring_avg: player.metricCounts.scoring_avg > 0
          ? player.metrics.scoring_avg / player.metricCounts.scoring_avg
          : null,
        birdies_or_better: player.metricCounts.birdies_or_better > 0
          ? player.metrics.birdies_or_better / player.metricCounts.birdies_or_better
          : null,
        scrambling: player.metricCounts.scrambling > 0
          ? player.metrics.scrambling / player.metricCounts.scrambling
          : null,
        great_shots: player.metricCounts.great_shots > 0
          ? player.metrics.great_shots / player.metricCounts.great_shots
          : null,
        poor_shot_avoid: player.metricCounts.poor_shot_avoid > 0
          ? player.metrics.poor_shot_avoid / player.metricCounts.poor_shot_avoid
          : null
      }
    };
  });

  return {
    eventName,
    courseName,
    results: applyFinishFallback(results)
  };
};

const buildResultsFromLiveStatsPayload = payload => {
  const liveStats = Array.isArray(payload?.live_stats) ? payload.live_stats : [];
  const results = liveStats.map(entry => ({
    dgId: String(entry?.dg_id || '').trim(),
    playerName: String(entry?.player_name || '').trim(),
    finishPosition: normalizeFinishPosition(entry?.position),
    finishText: formatPositionText(entry?.position),
    score: typeof entry?.total === 'number' ? entry.total : parseNumericValue(entry?.total),
    metrics: {
      sg_total: parseNumericValue(entry?.sg_total) || 0,
      sg_t2g: parseNumericValue(entry?.sg_t2g) || 0,
      sg_app: parseNumericValue(entry?.sg_app) || 0,
      sg_arg: parseNumericValue(entry?.sg_arg) || 0,
      sg_ott: parseNumericValue(entry?.sg_ott) || 0,
      sg_putt: parseNumericValue(entry?.sg_putt) || 0,
      sg_bs: parseNumericValue(entry?.sg_bs) || 0,
      driving_dist: parseNumericValue(entry?.distance) || 0,
      driving_acc: parseNumericValue(entry?.accuracy) || 0,
      gir: parseNumericValue(entry?.gir) || 0,
      prox_fw: parseNumericValue(entry?.prox_fw) || 0,
      prox_rgh: parseNumericValue(entry?.prox_rgh ?? entry?.prox_rough) || 0,
      scoring_avg: null,
      birdies_or_better: null,
      scrambling: parseNumericValue(entry?.scrambling) || null,
      great_shots: parseNumericValue(entry?.great_shots) || null,
      poor_shot_avoid: parseNumericValue(entry?.poor_shots ?? entry?.poor_shot_avoidance) || null
    }
  }));

  return {
    eventName: payload?.event_name || null,
    courseName: payload?.course_name || null,
    results: applyFinishFallback(results)
  };
};

const buildTournamentResultsRows = ({
  results,
  modelData,
  metricStats
}) => {
  const rows = [];
  const normalizedStats = metricStats || {};

  (results || []).forEach(entry => {
    const dgId = String(entry?.dgId || '').trim();
    if (!dgId) return;
    const playerName = entry?.playerName || entry?.name || 'Unknown';
    const modelEntry = modelData?.playersById?.get(dgId) || null;
    const modelRank = modelEntry?.rank ?? null;
    const finishPosition = entry?.finishPosition ?? null;
    const finishText = entry?.finishText || (finishPosition !== null ? String(finishPosition) : '');
    const actualMetrics = {};

    const row = {
      'Performance Analysis': '',
      'DG ID': dgId,
      'Player Name': playerName,
      'Model Rank': modelRank ?? '',
      'Finish Position': finishText || (finishPosition !== null ? String(finishPosition) : ''),
      'Score': entry?.score ?? ''
    };

    RESULT_METRIC_FIELDS.forEach(field => {
      const value = entry?.metrics?.[field.key];
      if (field.hasModel === false) {
        row[field.label] = typeof value === 'number' ? value : '';
        return;
      }
      const modelValue = modelEntry?.metrics?.[field.label];
      row[field.label] = typeof value === 'number' ? value : '';
      row[`${field.label} - Model`] = typeof modelValue === 'number' ? modelValue : '';
      if (typeof value === 'number' && !Number.isNaN(value)) {
        actualMetrics[field.label] = value;
      }
    });

    row['Performance Analysis'] = buildPerformanceNotes({
      dgId,
      playerName,
      modelRank,
      finishPosition,
      finishText,
      modelData: modelEntry,
      metricStats: normalizedStats,
      actualMetrics
    });

    rows.push(row);
  });

  rows.sort((a, b) => {
    const posA = normalizeFinishPosition(a['Finish Position']) ?? 999;
    const posB = normalizeFinishPosition(b['Finish Position']) ?? 999;
    return posA - posB;
  });

  return rows;
};

const buildZScoresForRows = (rows, metricStats) => {
  return rows.map(row => {
    const zScores = {};
    Object.entries(metricStats || {}).forEach(([metric, stats]) => {
      const value = row[metric];
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      if (!stats || !stats.stdDev || stats.stdDev === 0) return;
      zScores[metric] = (value - stats.mean) / stats.stdDev;
    });
    return {
      dgId: row['DG ID'],
      zScores
    };
  });
};

const writeZScoresCsv = (csvPath, rows, metricStats, meta = {}) => {
  if (!csvPath) return null;
  ensureDirectory(path.dirname(csvPath));
  const metricLabels = RESULT_METRIC_FIELDS
    .map(field => field.label)
    .filter(label => metricStats && metricStats[label]);

  const headers = [
    'DG ID',
    'Player Name',
    'Finish Position',
    ...metricLabels.flatMap(label => [`${label} Z`, `${label} Z Adj`])
  ];

  const lines = [];
  lines.push('');
  lines.push([`Tournament: ${meta.tournament || ''}`, `Last updated: ${meta.lastUpdated || ''}`].join(','));
  lines.push([`Course: ${meta.courseName || ''}`, `Found ${rows.length} players from ${meta.source || ''}`].join(','));
  lines.push([`Data Date: ${meta.generatedAt || ''}`].join(','));
  lines.push(headers.join(','));

  rows.forEach(row => {
    const dgId = row['DG ID'] ?? '';
    const name = row['Player Name'] ?? '';
    const finish = row['Finish Position'] ?? '';

    const values = metricLabels.flatMap(label => {
      const stats = metricStats?.[label] || null;
      const rawValue = row[label];
      if (!stats || typeof rawValue !== 'number' || Number.isNaN(rawValue) || !stats.stdDev) {
        return ['', ''];
      }
      const z = (rawValue - stats.mean) / stats.stdDev;
      const adjusted = RESULTS_METRIC_TYPES.LOWER_BETTER.has(label) ? -z : z;
      return [Number(z.toFixed(6)), Number(adjusted.toFixed(6))];
    });

    const line = [dgId, name, finish, ...values]
      .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
      .join(',');
    lines.push(line);
  });

  fs.writeFileSync(csvPath, lines.join('\n'));
  return csvPath;
};

const getFinishHighlight = finishValue => {
  const finishText = formatPositionText(finishValue);
  const finishNum = normalizeFinishPosition(finishText);
  if (!finishNum || Number.isNaN(finishNum)) return null;
  if (finishNum === 1) {
    return { label: 'winner', bg: '#FFD700', font: '#000000', bold: true };
  }
  if (finishNum >= 2 && finishNum <= 5) {
    return { label: 'top5', bg: '#C0C0C0', font: '#000000', bold: true };
  }
  if (finishNum >= 6 && finishNum <= 10) {
    return { label: 'top10', bg: '#CD7F32', font: '#000000', bold: false };
  }
  return null;
};

const getModelRankHighlight = (modelRankValue, finishValue) => {
  const finishText = formatPositionText(finishValue);
  const finishNum = normalizeFinishPosition(finishText);
  const modelRank = typeof modelRankValue === 'number'
    ? modelRankValue
    : parseInt(String(modelRankValue || '').trim(), 10);

  if (!finishNum || Number.isNaN(finishNum) || Number.isNaN(modelRank)) return null;
  if (modelRank > 100 && finishNum <= 10) {
    return { label: 'major_miss', bg: '#FFC7CE', font: '#9C0006', bold: true };
  }
  if (modelRank <= 20 && finishNum <= 10) {
    return { label: 'good_prediction', bg: '#C6EFCE', font: '#006100', bold: true };
  }
  return null;
};

const writeResultsFormattingCsv = (csvPath, rows, meta = {}) => {
  if (!csvPath) return null;
  ensureDirectory(path.dirname(csvPath));

  const metricLabels = RESULT_METRIC_FIELDS
    .map(field => field.label)
    .filter(label => RESULTS_METRIC_TYPES.HAS_MODEL.has(label));

  const headers = [
    'DG ID',
    'Player Name',
    'Finish Position',
    'Model Rank',
    'Finish Highlight',
    'Finish Bg',
    'Finish Font',
    'Finish Bold',
    'Model Rank Highlight',
    'Model Rank Bg',
    'Model Rank Font',
    'Model Rank Bold',
    ...metricLabels.map(label => `${label} Color`)
  ];

  const lines = [];
  lines.push('');
  lines.push([`Tournament: ${meta.tournament || ''}`, `Last updated: ${meta.lastUpdated || ''}`].join(','));
  lines.push([`Course: ${meta.courseName || ''}`, `Found ${rows.length} players from ${meta.source || ''}`].join(','));
  lines.push([`Data Date: ${meta.generatedAt || ''}`].join(','));
  lines.push(headers.join(','));

  rows.forEach(row => {
    const dgId = row['DG ID'] ?? '';
    const name = row['Player Name'] ?? '';
    const finish = row['Finish Position'] ?? '';
    const modelRank = row['Model Rank'] ?? '';

    const finishHighlight = getFinishHighlight(finish);
    const modelRankHighlight = getModelRankHighlight(modelRank, finish);

    const metricColors = metricLabels.map(label => {
      const actualValue = row[label];
      const modelValue = row[`${label} - Model`];
      if (typeof actualValue !== 'number' || Number.isNaN(actualValue)) return '';
      if (typeof modelValue !== 'number' || Number.isNaN(modelValue)) return '';

      const isHigherBetter = RESULTS_METRIC_TYPES.HIGHER_BETTER.has(label);
      const isLowerBetter = RESULTS_METRIC_TYPES.LOWER_BETTER.has(label);
      if (isHigherBetter) {
        if (actualValue > modelValue) return '#DFF0D8';
        if (actualValue < modelValue) return '#F2DEDE';
        return '';
      }
      if (isLowerBetter) {
        if (actualValue < modelValue) return '#DFF0D8';
        if (actualValue > modelValue) return '#F2DEDE';
        return '';
      }
      return '';
    });

    const line = [
      dgId,
      name,
      finish,
      modelRank,
      finishHighlight?.label || '',
      finishHighlight?.bg || '',
      finishHighlight?.font || '',
      finishHighlight?.bold ? 'bold' : '',
      modelRankHighlight?.label || '',
      modelRankHighlight?.bg || '',
      modelRankHighlight?.font || '',
      modelRankHighlight?.bold ? 'bold' : '',
      ...metricColors
    ]
      .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
      .join(',');

    lines.push(line);
  });

  fs.writeFileSync(csvPath, lines.join('\n'));
  return csvPath;
};

const writeTournamentResultsCsv = (csvPath, rows, meta = {}) => {
  if (!csvPath) return null;
  ensureDirectory(path.dirname(csvPath));
  const lines = [];
  lines.push('');
  lines.push([`Tournament: ${meta.tournament || ''}`, `Last updated: ${meta.lastUpdated || ''}`].join(','));
  lines.push([`Course: ${meta.courseName || ''}`, `Found ${rows.length} players from ${meta.source || ''}`].join(','));
  lines.push([`Data Date: ${meta.generatedAt || ''}`].join(','));
  lines.push(RESULTS_HEADERS.join(','));
  rows.forEach(row => {
    const line = RESULTS_HEADERS.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      return JSON.stringify(value);
    }).join(',');
    lines.push(line);
  });
  fs.writeFileSync(csvPath, lines.join('\n'));
  return csvPath;
};

const isLowerBetterMetric = label => {
  const normalized = String(label || '').toLowerCase();
  if (!normalized) return false;
  return normalized.includes('proximity')
    || normalized.includes('scoring average')
    || normalized.includes('poor shot');
};

const resolveMetricFallbackLabel = metricName => {
  const raw = String(metricName || '').trim();
  if (!raw) return null;
  if (raw.startsWith('Scoring: ')) {
    return raw.replace(/^Scoring:\s*/i, '').trim();
  }
  if (raw.startsWith('Course Management: ')) {
    return raw.replace(/^Course Management:\s*/i, '').trim();
  }
  return raw;
};

const buildResultsMetricMap = resultsRows => {
  const map = new Map();
  (resultsRows || []).forEach(row => {
    const dgId = String(row?.['DG ID'] || row?.dgId || row?.dg_id || '').trim();
    if (!dgId) return;
    const metrics = {
      'Driving Distance': parseNumericValue(row?.['Driving Distance']),
      'Driving Accuracy': parseNumericValue(row?.['Driving Accuracy']),
      'SG OTT': parseNumericValue(row?.['SG OTT']),
      'SG Putting': parseNumericValue(row?.['SG Putting']),
      'SG Around Green': parseNumericValue(row?.['SG Around Green']),
      'SG T2G': parseNumericValue(row?.['SG T2G']),
      'SG Approach': parseNumericValue(row?.['SG Approach']),
      'SG Total': parseNumericValue(row?.['SG Total']),
      'Greens in Regulation': parseNumericValue(row?.['Greens in Regulation']),
      'Fairway Proximity': parseNumericValue(row?.['Fairway Proximity']),
      'Rough Proximity': parseNumericValue(row?.['Rough Proximity'])
    };
    map.set(dgId, metrics);
  });
  return map;
};

const buildHistoricalMetricMap = (historyCsvPath, eventId, season) => {
  if (!historyCsvPath || !fs.existsSync(historyCsvPath)) return new Map();
  const rows = loadCsv(historyCsvPath, { skipFirstColumn: true });
  const eventIdStr = String(eventId || '').trim();
  const seasonStr = season ? String(season).trim() : null;
  const buckets = new Map();

  rows.forEach(row => {
    const dgId = String(row?.dg_id || '').trim();
    if (!dgId) return;
    const rowEvent = String(row?.event_id || '').trim();
    if (eventIdStr && rowEvent !== eventIdStr) return;
    if (seasonStr) {
      const rowSeason = String(row?.season || row?.year || '').trim();
      if (rowSeason !== seasonStr) return;
    }

    const bucket = buckets.get(dgId) || {
      scoreSum: 0,
      birdiesSum: 0,
      scrambleSum: 0,
      greatShotsSum: 0,
      poorShotsSum: 0,
      counts: {
        score: 0,
        birdies: 0,
        scrambling: 0,
        greatShots: 0,
        poorShots: 0
      }
    };

    const scoreValue = parseNumericValue(row?.score);
    if (typeof scoreValue === 'number') {
      bucket.scoreSum += scoreValue;
      bucket.counts.score += 1;
    }

    const birdies = parseNumericValue(row?.birdies);
    const eagles = parseNumericValue(row?.eagles_or_better);
    const birdiesOrBetter = typeof birdies === 'number'
      ? birdies + (typeof eagles === 'number' ? eagles : 0)
      : parseNumericValue(row?.birdies_or_better);
    if (typeof birdiesOrBetter === 'number') {
      bucket.birdiesSum += birdiesOrBetter;
      bucket.counts.birdies += 1;
    }

    const scrambling = parseNumericValue(row?.scrambling);
    if (typeof scrambling === 'number') {
      bucket.scrambleSum += scrambling;
      bucket.counts.scrambling += 1;
    }

    const greatShots = parseNumericValue(row?.great_shots);
    if (typeof greatShots === 'number') {
      bucket.greatShotsSum += greatShots;
      bucket.counts.greatShots += 1;
    }

    const poorShots = parseNumericValue(row?.poor_shots);
    if (typeof poorShots === 'number') {
      bucket.poorShotsSum += poorShots;
      bucket.counts.poorShots += 1;
    }

    buckets.set(dgId, bucket);
  });

  const map = new Map();
  buckets.forEach((bucket, dgId) => {
    map.set(dgId, {
      'Scoring Average': bucket.counts.score > 0 ? bucket.scoreSum / bucket.counts.score : null,
      'Birdies or Better': bucket.counts.birdies > 0 ? bucket.birdiesSum / bucket.counts.birdies : null,
      'Scrambling': bucket.counts.scrambling > 0 ? bucket.scrambleSum / bucket.counts.scrambling : null,
      'Great Shots': bucket.counts.greatShots > 0 ? bucket.greatShotsSum / bucket.counts.greatShots : null,
      'Poor Shot Avoidance': bucket.counts.poorShots > 0 ? bucket.poorShotsSum / bucket.counts.poorShots : null
    });
  });

  return map;
};

const extractRankingMetrics = rankingsCsvPath => {
  if (!rankingsCsvPath || !fs.existsSync(rankingsCsvPath)) return { players: [], metricLabels: [] };
  const rows = parseCsvRows(rankingsCsvPath);
  const headerIndex = findHeaderRowIndex(rows, ['dg id', 'player name', 'rank']);
  if (headerIndex === -1) return { players: [], metricLabels: [] };
  const headers = rows[headerIndex];
  const headerMap = buildHeaderIndexMap(headers);
  const dgIdIdx = headerMap.get('dg id');
  const nameIdx = headerMap.get('player name');
  const rankIdx = headerMap.get('rank') ?? headerMap.get('model rank');

  const ignoreColumns = new Set([
    'expected peformance notes',
    'expected performance notes',
    'performance analysis',
    'rank',
    'dg id',
    'player name',
    'top 5',
    'top 10',
    'weighted score',
    'past perf. mult.',
    'past perf mult',
    'refined weighted score',
    'war',
    'delta trend score',
    'delta predictive score'
  ]);

  const allowedMetrics = new Set(METRIC_ORDER.map(metric => normalizeMetricLabel(metric)));
  const metricLabelMap = new Map();
  headers.forEach((header, idx) => {
    const normalized = normalizeHeader(header);
    if (!normalized || ignoreColumns.has(normalized) || normalized.endsWith('trend')) return;
    const canonical = normalizeMetricLabel(header);
    if (!allowedMetrics.has(canonical)) return;
    if (!metricLabelMap.has(canonical)) {
      metricLabelMap.set(canonical, { label: canonical, idx });
    }
  });

  const metricLabels = METRIC_ORDER
    .map(metricName => {
      const direct = metricLabelMap.get(metricName);
      if (direct) return direct;
      const fallback = resolveMetricFallbackLabel(metricName);
      if (fallback && metricLabelMap.has(fallback)) {
        return { label: metricName, idx: metricLabelMap.get(fallback).idx };
      }
      return null;
    })
    .filter(Boolean);

  const players = rows.slice(headerIndex + 1)
    .map((row, idx) => {
      const dgId = dgIdIdx !== undefined ? String(row[dgIdIdx] || '').trim() : '';
      const name = nameIdx !== undefined ? String(row[nameIdx] || '').trim() : '';
      const rankValue = rankIdx !== undefined ? parseInt(String(row[rankIdx] || '').trim(), 10) : NaN;
      if (!dgId || !name) return null;
      const metrics = {};
      metricLabels.forEach(metric => {
        metrics[metric.label] = parseNumericValue(row[metric.idx]);
      });
      return {
        dgId,
        name,
        rank: Number.isNaN(rankValue) ? (idx + 1) : rankValue,
        metrics
      };
    })
    .filter(Boolean);

  return {
    players,
    metricLabels: metricLabels.map(metric => metric.label)
  };
};

const buildMetricAnalysis = ({
  rankingsCsvPath,
  results,
  resultsRows,
  historyCsvPath,
  eventId,
  season,
  tournamentSlug,
  courseType
}) => {
  const extracted = extractRankingMetrics(rankingsCsvPath);
  const finishers = (resultsRows || [])
    .map(row => {
      const dgId = String(row?.['DG ID'] || row?.dgId || row?.dg_id || '').trim();
      if (!dgId) return null;
      const finishRaw = row?.['Finish Position'] ?? row?.finishPosition ?? row?.finish ?? row?.position;
      const finishPosition = normalizeFinishPosition(finishRaw);
      if (typeof finishPosition !== 'number' || Number.isNaN(finishPosition)) return null;
      return { dgId, finishPosition };
    })
    .filter(Boolean);
  const resultsById = new Map(finishers.map(entry => [String(entry.dgId), entry.finishPosition]));
  const resultsMetricMap = buildResultsMetricMap(resultsRows || []);
  const historyMetricMap = buildHistoricalMetricMap(historyCsvPath, eventId, season);
  const metrics = [];

  extracted.metricLabels.forEach(label => {
    const values = [];
    const positions = [];
    const top10Values = [];
    extracted.players.forEach(player => {
      const finish = resultsById.get(String(player.dgId));
      if (typeof finish !== 'number' || Number.isNaN(finish)) return;
      const dgId = String(player.dgId);
      const fromResults = resultsMetricMap.get(dgId)?.[label];
      const fromHistory = historyMetricMap.get(dgId)?.[label];
      const raw = typeof fromResults === 'number'
        ? fromResults
        : (typeof fromHistory === 'number' ? fromHistory : player.metrics?.[label]);
      const rounded = roundMetricValueForAnalysis(raw);
      if (typeof rounded !== 'number' || Number.isNaN(rounded)) return;
      values.push(rounded);
      positions.push(finish);
      if (finish <= 10) top10Values.push(rounded);
    });

    let correlation = 0;
    if (values.length >= 5) {
      correlation = computeMetricCorrelation(label, positions, values);
    }

    const fieldAvg = values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    const top10Avg = top10Values.length > 0
      ? top10Values.reduce((sum, value) => sum + value, 0) / top10Values.length
      : 0;
    const delta = top10Avg - fieldAvg;

    metrics.push({
      metric: label,
      top10Avg,
      fieldAvg,
      delta,
      correlation,
      top10Count: top10Values.length,
      fieldCount: values.length
    });
  });

  return {
    version: METRIC_ANALYSIS_VERSION,
    tournament: tournamentSlug || null,
    courseType: courseType || null,
    top10Finishers: finishers.filter(entry => entry.finishPosition <= 10).length,
    totalFinishers: finishers.length,
    generatedAt: new Date().toISOString(),
    metrics
  };
};

const getConfigTemplateName = configCsvPath => {
  if (!configCsvPath || !fs.existsSync(configCsvPath)) return null;
  try {
    const cells = loadConfigCells(configCsvPath);
    for (let row = 0; row < cells.length; row += 1) {
      const rowValues = cells[row] || [];
      for (let col = 0; col < rowValues.length; col += 1) {
        const value = String(rowValues[col] || '').trim();
        if (!value) continue;
        const match = value.match(/Template\s*:\s*(.+)$/i);
        if (match && match[1]) return match[1].trim();
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

const getConfigMetricWeights = configCsvPath => {
  if (!configCsvPath || !fs.existsSync(configCsvPath)) return {};
  try {
    const cells = loadConfigCells(configCsvPath);
    const readCell = (row, col) => getCell(cells, row, col);
    const metricWeights = {};

    metricWeights['Driving Distance'] = parseNumericValue(readCell(16, 7)) || 0;
    metricWeights['Driving Accuracy'] = parseNumericValue(readCell(16, 8)) || 0;
    metricWeights['SG OTT'] = parseNumericValue(readCell(16, 9)) || 0;

    metricWeights['Approach <100 GIR'] = parseNumericValue(readCell(17, 7)) || 0;
    metricWeights['Approach <100 SG'] = parseNumericValue(readCell(17, 8)) || 0;
    metricWeights['Approach <100 Prox'] = parseNumericValue(readCell(17, 9)) || 0;

    metricWeights['Approach <150 FW GIR'] = parseNumericValue(readCell(18, 7)) || 0;
    metricWeights['Approach <150 FW SG'] = parseNumericValue(readCell(18, 8)) || 0;
    metricWeights['Approach <150 FW Prox'] = parseNumericValue(readCell(18, 9)) || 0;
    metricWeights['Approach <150 Rough GIR'] = parseNumericValue(readCell(18, 10)) || 0;
    metricWeights['Approach <150 Rough SG'] = parseNumericValue(readCell(18, 11)) || 0;
    metricWeights['Approach <150 Rough Prox'] = parseNumericValue(readCell(18, 12)) || 0;

    metricWeights['Approach <200 FW GIR'] = parseNumericValue(readCell(19, 7)) || 0;
    metricWeights['Approach <200 FW SG'] = parseNumericValue(readCell(19, 8)) || 0;
    metricWeights['Approach <200 FW Prox'] = parseNumericValue(readCell(19, 9)) || 0;
    metricWeights['Approach >150 Rough GIR'] = parseNumericValue(readCell(19, 10)) || 0;
    metricWeights['Approach >150 Rough SG'] = parseNumericValue(readCell(19, 11)) || 0;
    metricWeights['Approach >150 Rough Prox'] = parseNumericValue(readCell(19, 12)) || 0;

    metricWeights['Approach >200 FW GIR'] = parseNumericValue(readCell(20, 7)) || 0;
    metricWeights['Approach >200 FW SG'] = parseNumericValue(readCell(20, 8)) || 0;
    metricWeights['Approach >200 FW Prox'] = parseNumericValue(readCell(20, 9)) || 0;

    metricWeights['SG Putting'] = parseNumericValue(readCell(21, 7)) || 0;
    metricWeights['SG Around Green'] = parseNumericValue(readCell(22, 7)) || 0;

    metricWeights['SG T2G'] = parseNumericValue(readCell(23, 7)) || 0;
    metricWeights['Scoring Average'] = parseNumericValue(readCell(23, 8)) || 0;
    metricWeights['Birdie Chances Created'] = parseNumericValue(readCell(23, 9)) || 0;
    metricWeights['Scoring: Approach <100 SG'] = parseNumericValue(readCell(23, 10)) || 0;
    metricWeights['Scoring: Approach <150 FW SG'] = parseNumericValue(readCell(23, 11)) || 0;
    metricWeights['Scoring: Approach <150 Rough SG'] = parseNumericValue(readCell(23, 12)) || 0;
    metricWeights['Scoring: Approach >150 Rough SG'] = parseNumericValue(readCell(23, 13)) || 0;
    metricWeights['Scoring: Approach <200 FW SG'] = parseNumericValue(readCell(23, 14)) || 0;
    metricWeights['Scoring: Approach >200 FW SG'] = parseNumericValue(readCell(23, 15)) || 0;

    metricWeights['Scrambling'] = parseNumericValue(readCell(24, 7)) || 0;
    metricWeights['Great Shots'] = parseNumericValue(readCell(24, 8)) || 0;
    metricWeights['Poor Shot Avoidance'] = parseNumericValue(readCell(24, 9)) || 0;
    metricWeights['Course Management: Approach <100 Prox'] = parseNumericValue(readCell(24, 10)) || 0;
    metricWeights['Course Management: Approach <150 FW Prox'] = parseNumericValue(readCell(24, 11)) || 0;
    metricWeights['Course Management: Approach <150 Rough Prox'] = parseNumericValue(readCell(24, 12)) || 0;
    metricWeights['Course Management: Approach >150 Rough Prox'] = parseNumericValue(readCell(24, 13)) || 0;
    metricWeights['Course Management: Approach <200 FW Prox'] = parseNumericValue(readCell(24, 14)) || 0;
    metricWeights['Course Management: Approach >200 FW Prox'] = parseNumericValue(readCell(24, 15)) || 0;

    return metricWeights;
  } catch (error) {
    return {};
  }
};

const getTemplateWeightForMetric = (courseType, metricName) => {
  if (!courseType || !metricName) return 0;
  const template = WEIGHT_TEMPLATES?.[courseType] || null;
  if (!template) return 0;
  const group = getMetricGroup(metricName);
  const metricWeight = template?.metricWeights?.[group]?.[metricName]?.weight;
  return Number.isFinite(metricWeight) ? metricWeight : 0;
};

const determineDetectedCourseType = metrics => {
  const entries = Array.isArray(metrics) ? metrics : [];
  if (!entries.length) return 'BALANCED';

  const sorted = entries
    .slice()
    .sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0))
    .slice(0, 15);

  const baselineWeights = WEIGHT_TEMPLATES?.BALANCED?.groupWeights || {};
  let powerScore = 0;
  let technicalScore = 0;
  let balancedScore = 0;

  sorted.forEach(entry => {
    const group = getMetricGroup(entry.metric);
    if (!group) return;
    const weight = baselineWeights[group] || 0;
    const strength = Math.abs(entry.delta || 0);
    if (strength === 0) return;
    if (group === 'Driving Performance') {
      powerScore += weight * strength;
    } else if (group.startsWith('Approach') || group === 'Course Management') {
      technicalScore += weight * strength;
    } else if (group === 'Putting' || group === 'Around the Green' || group === 'Scoring') {
      balancedScore += weight * strength;
    }
  });

  if (powerScore === 0 && technicalScore === 0 && balancedScore === 0) return 'BALANCED';

  const scores = [
    { type: 'POWER', score: powerScore },
    { type: 'TECHNICAL', score: technicalScore },
    { type: 'BALANCED', score: balancedScore }
  ].sort((a, b) => b.score - a.score);

  if (scores[0].score >= (scores[1].score || 0) * 1.25) {
    return scores[0].type;
  }
  return 'BALANCED';
};

const formatWeightValue = value => {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(4)).toString();
};

const formatDeltaValue = (metricKey, deltaValue) => {
  if (deltaValue === undefined || deltaValue === null || Number.isNaN(deltaValue)) return '';
  if (metricKey.includes('Distance') || metricKey === 'Scoring Average') {
    return Number(deltaValue.toFixed(0));
  }
  if (metricKey.includes('Accuracy') || metricKey.includes('Proximity') || metricKey.includes('GIR')) {
    return Number(deltaValue.toFixed(1));
  }
  return Number(deltaValue.toFixed(2));
};

const writeMetricAnalysis = (outputDir, metricAnalysis, options = {}) => {
  if (!metricAnalysis?.tournament) return null;
  const metricDir = getMetricAnalysisDir(outputDir) || outputDir;
  ensureDirectory(metricDir);
  const baseName = `${metricAnalysis.tournament}_metric_analysis`;
  const jsonPath = path.resolve(metricDir, `${baseName}.json`);
  const csvPath = path.resolve(metricDir, `${baseName}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(metricAnalysis, null, 2));

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const season = options.season ? String(options.season) : '';
  const safeTournamentName = normalizeTournamentNameForSeason(
    options.tournamentName || metricAnalysis.tournament,
    season
  );
  const displayTournament = formatTournamentDisplayName(safeTournamentName);
  const tournamentLabel = displayTournament && season
    ? `${displayTournament} (${season})`
    : displayTournament || metricAnalysis.tournament;

  const configType = String(options.courseType || metricAnalysis.courseType || 'UNKNOWN').toUpperCase();
  const templateName = options.templateName || getConfigTemplateName(options.configCsvPath) || configType;
  const detectedType = determineDetectedCourseType(metricAnalysis.metrics);

  let validationLine = '';
  if (configType !== 'UNKNOWN' && detectedType !== 'UNKNOWN') {
    if (configType === detectedType) {
      validationLine = `✔️ Template matches data-driven type (${configType})`;
    } else {
      validationLine = `⚠️ Template (${configType}) does NOT match data-driven type (${detectedType}) - REVIEW`;
    }
  } else {
    validationLine = `⚠️ Unable to validate template type (Config: ${configType}, Data: ${detectedType})`;
  }

  const totalFinishers = metricAnalysis.totalFinishers ?? 0;
  const top10Finishers = metricAnalysis.top10Finishers ?? 0;

  const configWeights = getConfigMetricWeights(options.configCsvPath);
  const templateType = configType !== 'UNKNOWN' ? configType : (metricAnalysis.courseType || 'BALANCED');

  const groupMaxCorrelations = {};
  const metricGroups = getMetricGroupings();
  Object.entries(metricGroups).forEach(([groupName, metrics]) => {
    let maxCorrelation = 0;
    metrics.forEach(metricName => {
      const metricEntry = metricAnalysis.metrics.find(entry => entry.metric === metricName);
      const corr = Math.abs(metricEntry?.correlation || 0);
      if (corr > maxCorrelation) maxCorrelation = corr;
    });
    groupMaxCorrelations[groupName] = maxCorrelation;
  });

  const recommendedWeightsByMetric = {};
  const recommendedGroupTotals = {};
  METRIC_ORDER.forEach(metricName => {
    const metricEntry = metricAnalysis.metrics.find(entry => entry.metric === metricName);
    const correlation = metricEntry?.correlation || 0;
    const templateWeight = getTemplateWeightForMetric(templateType, metricName);
    const recommended = calculateRecommendedWeight(metricName, correlation, {
      templateWeight,
      groupMaxCorrelations
    });
    const groupName = getMetricGroup(metricName) || '__UNGROUPED__';
    const base = Math.abs(Number(recommended) || 0);
    recommendedWeightsByMetric[metricName] = { base, groupName };
    recommendedGroupTotals[groupName] = (recommendedGroupTotals[groupName] || 0) + base;
  });

  const lines = [];
  lines.push(toCsvRow([`${tournamentLabel} - Metric Analysis (${templateName})`]));
  lines.push(toCsvRow([validationLine]));
  lines.push(toCsvRow([`Top 10: ${top10Finishers} | Total Finishers: ${totalFinishers}`]));
  lines.push('');
  lines.push(toCsvRow([
    'Metric',
    'Top 10 Avg',
    'Field Avg',
    'Delta',
    '% Above Field',
    'Correlation',
    'Config Weight',
    'Template Weight',
    'Recommended Weight'
  ]));

  const metricMap = new Map(metricAnalysis.metrics.map(entry => [entry.metric, entry]));
  METRIC_ORDER.forEach(metricName => {
    const metricEntry = metricMap.get(metricName) || {
      top10Avg: 0,
      fieldAvg: 0,
      delta: 0,
      correlation: 0
    };
    let pct = 'N/A';
    if (metricEntry.fieldAvg !== 0) {
      if (isLowerBetterMetric(metricName)) {
        let adjustedDelta = metricEntry.delta;
        if (metricEntry.top10Avg < metricEntry.fieldAvg) {
          adjustedDelta = Math.abs(metricEntry.delta);
        } else if (metricEntry.top10Avg > metricEntry.fieldAvg) {
          adjustedDelta = -Math.abs(metricEntry.delta);
        }
        pct = `${((adjustedDelta / Math.abs(metricEntry.fieldAvg)) * 100).toFixed(1)}%`;
      } else {
        pct = `${((metricEntry.delta / metricEntry.fieldAvg) * 100).toFixed(1)}%`;
      }
    }

    const configWeight = configWeights[metricName];
    const templateWeight = getTemplateWeightForMetric(templateType, metricName);
    const recommendedInfo = recommendedWeightsByMetric[metricName] || { base: 0, groupName: '__UNGROUPED__' };
    const groupTotal = recommendedGroupTotals[recommendedInfo.groupName] || 0;
    const recommendedWeight = groupTotal > 0 ? recommendedInfo.base / groupTotal : 0;

    lines.push(toCsvRow([
      metricName,
      metricEntry.top10Avg.toFixed(3),
      metricEntry.fieldAvg.toFixed(3),
      metricEntry.delta.toFixed(3),
      pct,
      metricEntry.correlation.toFixed(4),
      formatWeightValue(configWeight ?? ''),
      formatWeightValue(templateWeight),
      formatWeightValue(recommendedWeight)
    ]));
  });

  const resultsPayload = readJsonFile(options.resultsJsonPath);
  const resultsRows = Array.isArray(resultsPayload?.results)
    ? resultsPayload.results
    : (Array.isArray(resultsPayload) ? resultsPayload : []);
  const predictions = loadTournamentPredictions({
    rankingsJsonPath: options.rankingsJsonPath,
    rankingsCsvPath: options.rankingsCsvPath
  }).predictions;
  const predictionMap = new Map(predictions.map(entry => [entry.dgId, entry.rank]));

  const deltaMetrics = [
    'Driving Distance',
    'Driving Accuracy',
    'SG OTT',
    'SG Putting',
    'SG Around Green',
    'SG T2G',
    'Greens in Regulation',
    'Fairway Proximity',
    'Rough Proximity',
    'SG Approach',
    'SG Total'
  ];

  const players = resultsRows
    .map(row => {
      const dgId = String(row?.['DG ID'] || '').trim();
      if (!dgId) return null;
      const playerName = String(row?.['Player Name'] || '').trim();
      const finishText = String(row?.['Finish Position'] || '').trim();
      const finishPos = normalizeFinishPosition(finishText);
      if (finishPos === null || Number.isNaN(finishPos)) return null;
      const modelRankRaw = row?.['Model Rank'];
      const modelRank = Number.isFinite(modelRankRaw)
        ? modelRankRaw
        : parseInt(String(modelRankRaw || '').trim(), 10);
      const rankValue = Number.isFinite(modelRank) ? modelRank : (predictionMap.get(dgId) || null);

      if (!rankValue) return null;
      const missScore = rankValue - finishPos;
      let gapAnalysis = '';
      if (missScore === 0) {
        gapAnalysis = 'Perfect';
      } else if (missScore > 0) {
        gapAnalysis = `Predicted ${missScore} spots too high`;
      } else {
        gapAnalysis = `Predicted ${Math.abs(missScore)} spots too low`;
      }

      const deltas = deltaMetrics.map(metricName => {
        const actualValueRaw = row?.[metricName];
        const modelValueRaw = row?.[`${metricName} - Model`];
        const actualValue = typeof actualValueRaw === 'number' ? actualValueRaw : parseNumericValue(actualValueRaw);
        const modelValue = typeof modelValueRaw === 'number' ? modelValueRaw : parseNumericValue(modelValueRaw);
        if (!Number.isFinite(actualValue) && !Number.isFinite(modelValue)) return '';
        const safeActual = Number.isFinite(actualValue) ? actualValue : 0;
        const safeModel = Number.isFinite(modelValue) ? modelValue : 0;
        return formatDeltaValue(metricName, safeModel - safeActual);
      });

      return {
        playerName: playerName || 'Unknown',
        modelRank: rankValue,
        finishText,
        missScore,
        gapAnalysis,
        deltas
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.modelRank - b.modelRank);

  if (players.length > 0) {
    lines.push('');
    lines.push(toCsvRow(['PLAYER-LEVEL ACCURACY ANALYSIS']));
    lines.push(toCsvRow([
      'Player',
      'Model Rank',
      'Finish Pos',
      'Miss Score',
      'Gap Analysis',
      ...deltaMetrics.map(metric => `${metric} Δ`)
    ]));

    players.forEach(player => {
      lines.push(toCsvRow([
        player.playerName,
        player.modelRank,
        player.finishText,
        player.missScore,
        player.gapAnalysis,
        ...player.deltas
      ]));
    });
  }

  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const writeCourseTypeClassification = (outputDir, classification) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.courseTypeClassification}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.courseTypeClassification}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(classification, null, 2));

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const entries = Array.isArray(classification?.entries) ? classification.entries : [];
  const grouped = {
    POWER: [],
    TECHNICAL: [],
    BALANCED: []
  };

  entries.forEach(entry => {
    const courseType = String(entry.courseType || '').trim().toUpperCase();
    if (!grouped[courseType]) return;
    grouped[courseType].push(entry);
  });

  const descriptions = {
    POWER: 'Driving Distance & Power Metrics Dominant',
    TECHNICAL: 'Short Game & Approach Metrics Dominant',
    BALANCED: 'Multiple Metric Types Equally Important'
  };

  const lines = [];
  lines.push(toCsvRow(['COURSE TYPE CLASSIFICATION (Based on Correlation Patterns)']));
  lines.push('');

  ['POWER', 'TECHNICAL', 'BALANCED'].forEach(type => {
    const items = grouped[type] || [];
    if (items.length === 0) return;
    lines.push(toCsvRow([
      `${type} - ${descriptions[type]} (${items.length} courses)`
    ]));
    lines.push(toCsvRow(['Tournaments:']));
    items
      .map(entry => entry.displayName || formatTournamentDisplayName(entry.tournament))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .forEach(name => {
        lines.push(toCsvRow([`  • ${name}`]));
      });
    lines.push('');
  });

  const totalTournaments = entries.length;
  lines.push(toCsvRow(['SUMMARY']));
  lines.push(toCsvRow([`POWER Courses: ${grouped.POWER.length}`]));
  lines.push(toCsvRow([`TECHNICAL Courses: ${grouped.TECHNICAL.length}`]));
  lines.push(toCsvRow([`BALANCED Courses: ${grouped.BALANCED.length}`]));
  lines.push(toCsvRow([`Total Tournaments: ${totalTournaments}`]));

  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const buildCorrelationSummary = metricAnalyses => {
  const aggregates = new Map();
  metricAnalyses.forEach(analysis => {
    analysis.metrics.forEach(entry => {
      const key = entry.metric;
      const record = aggregates.get(key) || { metric: key, sumCorrelation: 0, sumDelta: 0, count: 0 };
      record.sumCorrelation += entry.correlation;
      record.sumDelta += typeof entry.delta === 'number' ? entry.delta : 0;
      record.count += 1;
      aggregates.set(key, record);
    });
  });

  const sortIndex = new Map(METRIC_ORDER.map((metric, index) => [metric, index]));
  const metrics = Array.from(aggregates.values())
    .map(entry => ({
      metric: entry.metric,
      avgDelta: entry.count > 0 ? entry.sumDelta / entry.count : 0,
      avgCorrelation: entry.count > 0 ? entry.sumCorrelation / entry.count : 0,
      samples: entry.count
    }))
    .sort((a, b) => {
      const indexA = sortIndex.has(a.metric) ? sortIndex.get(a.metric) : Number.MAX_SAFE_INTEGER;
      const indexB = sortIndex.has(b.metric) ? sortIndex.get(b.metric) : Number.MAX_SAFE_INTEGER;
      if (indexA !== indexB) return indexA - indexB;
      return a.metric.localeCompare(b.metric);
    });

  return metrics;
};

const buildCourseTypeClassificationEntries = ({ metricAnalyses, season }) => {
  const entries = [];
  (metricAnalyses || []).forEach(analysis => {
    if (!analysis?.tournament || !analysis?.courseType) return;
    const baseName = formatTournamentDisplayName(analysis.tournament);
    const displayName = baseName && season ? `${baseName} (${season})` : baseName || analysis.tournament;
    entries.push({
      tournament: analysis.tournament,
      displayName,
      eventId: analysis.eventId || null,
      courseType: analysis.courseType,
      source: analysis.courseTypeSource || analysis.source || 'metric_analysis'
    });
  });
  return entries;
};

const collectTournamentConfigInfo = ({ dataRootDir, season }) => {
  const configInfo = new Map();
  const tournamentDirs = listSeasonTournamentDirs(dataRootDir, season);
  tournamentDirs.forEach(tournamentDir => {
    const slug = path.basename(tournamentDir);
    const inputsDir = path.resolve(tournamentDir, 'inputs');
    if (!fs.existsSync(inputsDir)) return;
    const files = fs.readdirSync(inputsDir).filter(file => file.toLowerCase().includes('configuration sheet'));
    if (files.length === 0) return;

    const seasonTag = season ? `(${season})` : null;
    const preferred = seasonTag
      ? files.find(file => file.includes(seasonTag))
      : null;
    const configFile = preferred || files[0];
    if (!configFile) return;

    const configCsvPath = path.resolve(inputsDir, configFile);
    const displayName = inferTournamentNameFromInputs(inputsDir, season, formatTournamentDisplayName(slug));
    configInfo.set(slug, {
      slug,
      displayName: displayName && season ? `${displayName} (${season})` : displayName,
      configCsvPath,
      templateName: getConfigTemplateName(configCsvPath) || null,
      configWeights: getConfigMetricWeights(configCsvPath)
    });
  });

  return configInfo;
};

const writeCorrelationSummary = (outputDir, name, metrics, options = {}) => {
  const summaryDir = getTemplateCorrelationDir(outputDir) || outputDir;
  ensureDirectory(summaryDir);
  const jsonPath = path.resolve(summaryDir, `${name}.json`);
  const csvPath = path.resolve(summaryDir, `${name}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify({ metrics, generatedAt: new Date().toISOString() }, null, 2));

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const displayType = options.type ? String(options.type).toUpperCase() : null;
  const tournamentNames = Array.isArray(options.tournaments) ? options.tournaments : [];
  const season = options.season ? String(options.season) : '';
  const formattedTournaments = tournamentNames
    .map(name => formatTournamentDisplayName(name))
    .filter(Boolean)
    .map(name => (season ? `${name} (${season})` : name));

  const lines = [];
  if (displayType) {
    lines.push(toCsvRow([`${displayType} - Aggregated Metric Analysis`]));
    lines.push(toCsvRow([
      `Tournaments: ${formattedTournaments.join(', ')}`
    ]));
    lines.push('');
  }

  lines.push(toCsvRow(['Metric', 'Avg Delta (Top 10 vs Field)', 'Avg Correlation', 'Tournament Count']));
  metrics.forEach(entry => {
    lines.push(toCsvRow([
      entry.metric,
      entry.avgDelta.toFixed(3),
      entry.avgCorrelation.toFixed(4),
      entry.samples
    ]));
  });

  lines.push('');
  lines.push(toCsvRow(['Note: Metrics show average delta and correlation across all tournaments of this type']));

  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const normalizeMetricAlias = metricName => normalizeMetricLabel(metricName);

const getMetricGroupings = () => ({
  'Driving Performance': [
    'Driving Distance', 'Driving Accuracy', 'SG OTT'
  ],
  'Approach - Short (<100)': [
    'Approach <100 GIR', 'Approach <100 SG', 'Approach <100 Prox'
  ],
  'Approach - Mid (100-150)': [
    'Approach <150 FW GIR', 'Approach <150 FW SG', 'Approach <150 FW Prox',
    'Approach <150 Rough GIR', 'Approach <150 Rough SG', 'Approach <150 Rough Prox'
  ],
  'Approach - Long (150-200)': [
    'Approach <200 FW GIR', 'Approach <200 FW SG', 'Approach <200 FW Prox',
    'Approach >150 Rough GIR', 'Approach >150 Rough SG', 'Approach >150 Rough Prox'
  ],
  'Approach - Very Long (>200)': [
    'Approach >200 FW GIR', 'Approach >200 FW SG', 'Approach >200 FW Prox'
  ],
  'Putting': [
    'SG Putting'
  ],
  'Around the Green': [
    'SG Around Green'
  ],
  'Scoring': [
    'SG T2G', 'Scoring Average', 'Birdie Chances Created',
    'Birdies or Better', 'Greens in Regulation',
    'Scoring: Approach <100 SG', 'Scoring: Approach <150 FW SG',
    'Scoring: Approach <150 Rough SG', 'Scoring: Approach >150 Rough SG',
    'Scoring: Approach <200 FW SG', 'Scoring: Approach >200 FW SG'
  ],
  'Course Management': [
    'Scrambling', 'Great Shots', 'Poor Shot Avoidance',
    'Course Management: Approach <100 Prox', 'Course Management: Approach <150 FW Prox',
    'Course Management: Approach <150 Rough Prox', 'Course Management: Approach >150 Rough Prox',
    'Course Management: Approach <200 FW Prox', 'Course Management: Approach >200 FW Prox'
  ]
});

const getMetricGroup = metricName => {
  const groupings = getMetricGroupings();
  const normalized = normalizeMetricLabel(metricName);
  for (const [groupName, metrics] of Object.entries(groupings)) {
    if (metrics.includes(normalized)) {
      return groupName;
    }
  }
  return null;
};

const calculateRecommendedWeight = (metricName, correlation, options = {}) => {
  const templateWeight = options.templateWeight || 0;
  const groupMaxCorrelations = options.groupMaxCorrelations || {};

  const safeCorrelation = Number.isFinite(correlation) ? correlation : 0;
  const metricGroup = getMetricGroup(metricName);
  const maxAbsCorr = metricGroup && groupMaxCorrelations[metricGroup] > 0
    ? groupMaxCorrelations[metricGroup]
    : 0;
  const ratio = maxAbsCorr > 0 ? safeCorrelation / maxAbsCorr : 0;

  let baseWeight = 0;
  if (templateWeight && templateWeight > 0) {
    baseWeight = templateWeight;
  }

  let recommendedWeight = baseWeight > 0 ? baseWeight * ratio : safeCorrelation;
  if ((metricName === 'SG Around Green' || metricName === 'SG Putting') && recommendedWeight < 0) {
    recommendedWeight = Math.abs(recommendedWeight);
  }

  return recommendedWeight;
};

const flattenTemplateMetricWeights = template => {
  const metricWeights = template?.metricWeights || {};
  const flattened = [];
  Object.entries(metricWeights).forEach(([groupName, groupMetrics]) => {
    if (!groupMetrics || typeof groupMetrics !== 'object') return;
    Object.entries(groupMetrics).forEach(([metricName, metricConfig]) => {
      const weight = typeof metricConfig === 'number'
        ? metricConfig
        : (typeof metricConfig?.weight === 'number' ? metricConfig.weight : 0);
      flattened.push({
        groupName,
        metric: metricName,
        weight
      });
    });
  });
  return flattened;
};

const buildRecommendedWeights = (summaryMetrics, template) => {
  const templateMetrics = flattenTemplateMetricWeights(template);
  const correlationMap = new Map(
    (summaryMetrics || []).map(entry => [normalizeMetricAlias(entry.metric), entry.avgCorrelation || 0])
  );

  const metricsByGroup = new Map();
  templateMetrics.forEach(entry => {
    const metricName = normalizeMetricAlias(entry.metric);
    if (!metricsByGroup.has(entry.groupName)) metricsByGroup.set(entry.groupName, []);
    metricsByGroup.get(entry.groupName).push({
      metric: metricName,
      templateMetric: entry.metric,
      templateWeight: entry.weight,
      correlation: correlationMap.get(metricName) || 0
    });
  });

  const recommended = [];
  metricsByGroup.forEach((entries, groupName) => {
    const maxAbs = Math.max(...entries.map(entry => Math.abs(entry.correlation || 0)), 0);
    const withBases = entries.map(entry => ({
      ...entry,
      base: maxAbs > 0 ? Math.abs(entry.correlation || 0) / maxAbs : 0,
      group: groupName
    }));
    const sumBase = withBases.reduce((sum, entry) => sum + entry.base, 0);
    withBases.forEach(entry => {
      const recommendedWeight = sumBase > 0 ? entry.base / sumBase : 0;
      recommended.push({
        metric: entry.metric,
        templateMetric: entry.templateMetric,
        group: groupName,
        templateWeight: entry.templateWeight,
        correlation: entry.correlation,
        recommendedWeight
      });
    });
  });

  return recommended;
};

const writeWeightCalibrationGuide = (outputDir, summariesByType, templatesByType, typeCounts = {}) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightCalibrationGuide}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightCalibrationGuide}.csv`);

  const guide = {
    generatedAt: new Date().toISOString(),
    types: {}
  };

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const lines = [];
  lines.push(toCsvRow(['WEIGHT CALIBRATION - Template vs Recommended by Course Type']));
  lines.push('');

  ['POWER', 'TECHNICAL', 'BALANCED'].forEach(type => {
    const summary = summariesByType[type] || [];
    const template = templatesByType[type] || null;
    const recommended = buildRecommendedWeights(summary, template);
    guide.types[type] = recommended;

    const tournamentCount = typeCounts[type] || 0;
    lines.push(toCsvRow([`${type} COURSES (${tournamentCount} tournaments)`]));
    lines.push(toCsvRow(['Metric', 'Template Weight', 'Recommended*', 'Gap', '% Change']));

    recommended.forEach(entry => {
      const templateWeight = Number(entry.templateWeight) || 0;
      const recommendedWeight = Number(entry.recommendedWeight) || 0;
      const gap = recommendedWeight - templateWeight;
      const pctChange = templateWeight === 0 ? 'N/A%' : `${((gap / templateWeight) * 100).toFixed(2)}%`;

      lines.push(toCsvRow([
        entry.metric,
        templateWeight.toFixed(4),
        recommendedWeight.toFixed(4),
        gap.toFixed(4),
        pctChange
      ]));
    });

    lines.push(toCsvRow(['Note: Metrics show average delta and correlation across all tournaments of this type']));
    lines.push('');
  });

  lines.push('');
  lines.push(toCsvRow(['*Recommended weights are normalized from tournament correlation values (absolute)']));
  lines.push(toCsvRow(['Gap = Recommended - Template (positive = increase weight, negative = decrease)']));
  lines.push(toCsvRow(['% Change = (Gap / Template Weight) × 100']));

  fs.writeFileSync(jsonPath, JSON.stringify(guide, null, 2));
  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const writeWeightTemplatesOutput = (outputDir, summariesByType, templatesByType, options = {}) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightTemplates}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightTemplates}.csv`);

  const output = {
    generatedAt: new Date().toISOString(),
    templates: {}
  };

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const lines = [];
  const typeOrder = ['POWER', 'TECHNICAL', 'BALANCED'];
  const configInfo = options.configInfo || new Map();
  const typeTournaments = options.typeTournaments || {};

  typeOrder.forEach(type => {
    const summary = summariesByType[type] || [];
    const template = templatesByType[type] || null;
    const recommended = buildRecommendedWeights(summary, template);
    output.templates[type] = recommended.reduce((acc, entry) => {
      acc[entry.metric] = {
        templateWeight: entry.templateWeight,
        recommendedWeight: entry.recommendedWeight,
        correlation: entry.correlation
      };
      return acc;
    }, {});

    const tournaments = Array.isArray(typeTournaments[type]) ? typeTournaments[type] : [];
    lines.push(toCsvRow([`${type} COURSES (${tournaments.length} tournaments)`]));
    lines.push(toCsvRow(['Tournament', 'Config Template (Q27)']));
    tournaments.forEach(slug => {
      const info = configInfo.get(slug);
      lines.push(toCsvRow([
        info?.displayName || formatTournamentDisplayName(slug),
        info?.templateName || ''
      ]));
    });
    lines.push('');

    lines.push(toCsvRow([
      'Metric',
      'Config Weight',
      'Template Weight',
      'Recommended Weight',
      'Config vs Template',
      'Config vs Recommended'
    ]));

    const configBuckets = {};
    tournaments.forEach(slug => {
      const info = configInfo.get(slug);
      const weights = info?.configWeights || {};
      Object.entries(weights).forEach(([metric, weight]) => {
        if (!configBuckets[metric]) configBuckets[metric] = [];
        if (Number.isFinite(weight)) configBuckets[metric].push(weight);
      });
    });

    recommended.forEach(entry => {
      const templateWeight = Number(entry.templateWeight) || 0;
      const recommendedWeight = Number(entry.recommendedWeight) || 0;
      const configValues = configBuckets[entry.metric] || [];
      const configWeight = configValues.length > 0
        ? configValues.reduce((sum, value) => sum + value, 0) / configValues.length
        : null;

      const configVsTemplate = (configWeight === null || templateWeight === 0)
        ? 'N/A'
        : `${(((configWeight - templateWeight) / templateWeight) * 100).toFixed(1)}%`;
      const configVsRecommended = (configWeight === null || recommendedWeight === 0)
        ? 'N/A'
        : `${(((configWeight - recommendedWeight) / recommendedWeight) * 100).toFixed(1)}%`;

      lines.push(toCsvRow([
        entry.metric,
        configWeight === null ? '' : formatWeightValue(configWeight),
        formatWeightValue(templateWeight),
        formatWeightValue(recommendedWeight),
        configVsTemplate,
        configVsRecommended
      ]));
    });

    lines.push('');
  });

  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const extractModelDeltasFromResults = resultsPayload => {
  if (!Array.isArray(resultsPayload) || resultsPayload.length === 0) return {};
  const sample = resultsPayload.find(entry => entry && typeof entry === 'object');
  if (!sample) return {};

  const keys = Object.keys(sample);
  const pairs = [];
  keys.forEach(key => {
    const label = String(key || '').trim();
    if (!label.toLowerCase().endsWith(' - model')) return;
    const baseKey = label.substring(0, label.length - ' - model'.length).trim();
    if (keys.includes(baseKey)) {
      pairs.push({ base: baseKey, model: label });
    }
  });

  if (pairs.length === 0) return {};

  const deltas = {};
  resultsPayload.forEach(row => {
    const finishRaw = row?.['Finish Position'] ?? row?.finishPosition ?? row?.finish ?? row?.position;
    const finishPos = normalizeFinishPosition(finishRaw);
    if (typeof finishPos !== 'number' || Number.isNaN(finishPos)) return;

    pairs.forEach(pair => {
      const modelValue = parseNumericValue(row[pair.model]);
      const actualValue = parseNumericValue(row[pair.base]);
      if (modelValue === null && actualValue === null) return;
      const safeModel = modelValue === null ? 0 : modelValue;
      const safeActual = actualValue === null ? 0 : actualValue;
      if (!deltas[pair.base]) deltas[pair.base] = [];
      deltas[pair.base].push(safeModel - safeActual);
    });
  });

  return deltas;
};

const buildModelDeltaTrends = ({ resultsJsonPath, season, dataRootDir }) => {
  const buckets = {};
  let tournamentCount = 0;
  let source = null;

  const mergeDeltas = deltas => {
    Object.entries(deltas || {}).forEach(([metric, values]) => {
      if (!buckets[metric]) buckets[metric] = [];
      buckets[metric].push(...values);
    });
  };

  const appendFromPayload = payload => {
    const rows = Array.isArray(payload) ? payload : payload?.results || payload?.resultsCurrent;
    if (!Array.isArray(rows) || rows.length === 0) return;
    mergeDeltas(extractModelDeltasFromResults(rows));
  };

  if (season && dataRootDir) {
    source = 'season_aggregate';
    const tournamentDirs = listSeasonTournamentDirs(dataRootDir, season);
    tournamentDirs.forEach(tournamentDir => {
      const tournamentSlug = path.basename(tournamentDir);
      const inputsDir = path.resolve(tournamentDir, 'inputs');
      const fallbackName = formatTournamentDisplayName(tournamentSlug);
      const tournamentName = inferTournamentNameFromInputs(inputsDir, season, fallbackName) || fallbackName;
      const slugCandidates = buildSlugCandidates({
        tournamentSlug,
        tournamentName,
        tournamentDir
      });
      const primarySlug = slugCandidates[0] || tournamentSlug || slugifyTournament(tournamentName) || 'tournament';
      const postEventDir = path.resolve(tournamentDir, 'post_event');
      const resolvedResultsJsonPath = resolveExistingPath(postEventDir, slugCandidates, '_results.json')
        || path.resolve(postEventDir, `${primarySlug}_results.json`);
      const legacyResultsJsonPath = path.resolve(postEventDir, 'tournament_results.json');
      const payload = readJsonFile(resolvedResultsJsonPath) || readJsonFile(legacyResultsJsonPath);
      if (!payload) return;
      tournamentCount += 1;
      appendFromPayload(payload);
    });
  } else if (resultsJsonPath) {
    source = 'single_tournament';
    const payload = readJsonFile(resultsJsonPath);
    if (payload) appendFromPayload(payload);
  }

  const metrics = [];

  Object.entries(buckets).forEach(([metric, values]) => {
    const filtered = values.filter(value => typeof value === 'number' && !Number.isNaN(value));
    const count = filtered.length;
    if (!count) return;
    const mean = filtered.reduce((sum, value) => sum + value, 0) / count;
    const meanAbs = filtered.reduce((sum, value) => sum + Math.abs(value), 0) / count;
    const variance = filtered.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);
    const overCount = filtered.filter(value => value > 0).length;
    const underCount = filtered.filter(value => value < 0).length;
    const biasZ = stdDev > 0 ? Math.abs(mean) / stdDev : (Math.abs(mean) > 0 ? 1 : 0);

    let status = 'WATCH';
    if (count >= 20 && biasZ <= 0.2) status = 'STABLE';
    if (count >= 20 && biasZ >= 0.75) status = 'CHRONIC';

    metrics.push({
      metric,
      count,
      meanDelta: mean,
      meanAbsDelta: meanAbs,
      stdDev,
      biasZ,
      overPct: count > 0 ? (overCount / count) * 100 : 0,
      underPct: count > 0 ? (underCount / count) * 100 : 0,
      status
    });
  });

  metrics.sort((a, b) => (b.biasZ || 0) - (a.biasZ || 0));
  const totalSamples = Object.values(buckets).reduce((sum, values) => sum + (values?.length || 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    metrics,
    meta: {
      source,
      tournamentCount: source === 'season_aggregate' ? tournamentCount : null,
      totalSamples
    }
  };
};

const writeModelDeltaTrends = (outputDir, modelDeltaTrends) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.modelDeltaTrends}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.modelDeltaTrends}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(modelDeltaTrends, null, 2));

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const lines = [];
  lines.push(toCsvRow(['MODEL DELTA TRENDS - All Metrics (Model - Actual)']));
  lines.push(toCsvRow(['Green = stable (low bias), Yellow = watch, Red = chronic bias']));
  lines.push('');
  lines.push(toCsvRow([
    'Metric',
    'Count',
    'Mean Δ',
    'Mean |Δ|',
    'Std Dev',
    'Bias Z',
    'Over %',
    'Under %',
    'Status'
  ]));

  modelDeltaTrends.metrics.forEach(entry => {
    lines.push(toCsvRow([
      entry.metric,
      entry.count,
      entry.meanDelta.toFixed(3),
      entry.meanAbsDelta.toFixed(3),
      entry.stdDev.toFixed(3),
      entry.biasZ.toFixed(2),
      `${entry.overPct.toFixed(2)}%`,
      `${entry.underPct.toFixed(2)}%`,
      entry.status
    ]));
  });

  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const writeProcessingLog = (outputDir, details) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.processingLog}.json`);
  const outputs = Array.isArray(details?.outputs)
    ? details.outputs.map(entry => ({
        ...entry,
        overwritten: !!entry?.existedBefore && entry?.written !== false
      }))
    : [];
  const payload = {
    generatedAt: new Date().toISOString(),
    ...details,
    outputs
  };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  return { jsonPath };
};

const buildCalibrationData = ({ tournamentName, predictions = [], results = [] }) => {
  const predictionMap = new Map();
  (predictions || []).forEach((pred, idx) => {
    const dgId = String(pred?.dgId || '').trim();
    if (!dgId) return;
    const rankValue = typeof pred.rank === 'number' ? pred.rank : (idx + 1);
    predictionMap.set(dgId, rankValue);
  });

  const actualResults = (results || [])
    .filter(entry => typeof entry?.finishPosition === 'number' && !Number.isNaN(entry.finishPosition))
    .map(entry => ({
      dgId: String(entry.dgId || '').trim(),
      name: entry.playerName || entry.name || '',
      finishPos: entry.finishPosition
    }))
    .filter(entry => entry.dgId && entry.finishPos !== null);

  const topFinishers = actualResults
    .filter(entry => entry.finishPos <= 10)
    .sort((a, b) => a.finishPos - b.finishPos);

  const tournamentAnalysis = {
    name: tournamentName || 'Tournament',
    topFinishers: [],
    accuracyMetrics: {
      top5Predicted: 0,
      top10Predicted: 0,
      top20Predicted: 0,
      avgMissTop5: 0,
      avgMissTop10: 0
    }
  };

  let totalTop5 = 0;
  let predictedTop5InTop20 = 0;
  let totalTop10 = 0;
  let predictedTop10InTop30 = 0;

  topFinishers.forEach(actual => {
    const predictedRank = predictionMap.has(actual.dgId) ? predictionMap.get(actual.dgId) : 999;
    const miss = Math.abs(predictedRank - actual.finishPos);
    const inTopXPredicted = predictedRank <= 20
      ? 'Top 20'
      : (predictedRank <= 50 ? 'Top 50' : 'Outside Top 50');

    tournamentAnalysis.topFinishers.push({
      name: actual.name,
      dgId: actual.dgId,
      actualFinish: actual.finishPos,
      predictedRank,
      missScore: miss,
      inTopXPredicted
    });

    if (predictedRank <= 20) tournamentAnalysis.accuracyMetrics.top5Predicted += 1;
    if (predictedRank <= 30) tournamentAnalysis.accuracyMetrics.top10Predicted += 1;
    if (predictedRank <= 50) tournamentAnalysis.accuracyMetrics.top20Predicted += 1;

    if (actual.finishPos <= 5) {
      totalTop5 += 1;
      if (predictedRank <= 20) predictedTop5InTop20 += 1;
    }
    if (actual.finishPos <= 10) {
      totalTop10 += 1;
      if (predictedRank <= 30) predictedTop10InTop30 += 1;
    }
  });

  const avgMissTop5 = (() => {
    const top5 = tournamentAnalysis.topFinishers.filter(entry => entry.actualFinish <= 5);
    if (!top5.length) return 0;
    const total = top5.reduce((sum, entry) => sum + entry.missScore, 0);
    return total / top5.length;
  })();

  const avgMissTop10 = (() => {
    const top10 = tournamentAnalysis.topFinishers.filter(entry => entry.actualFinish <= 10);
    if (!top10.length) return 0;
    const total = top10.reduce((sum, entry) => sum + entry.missScore, 0);
    return total / top10.length;
  })();

  tournamentAnalysis.accuracyMetrics.avgMissTop5 = avgMissTop5;
  tournamentAnalysis.accuracyMetrics.avgMissTop10 = avgMissTop10;

  return {
    tournaments: [tournamentAnalysis],
    totalTop5,
    predictedTop5InTop20,
    totalTop10,
    predictedTop10InTop30,
    generatedAt: new Date().toISOString()
  };
};

const mergeCalibrationData = (target, source) => {
  if (!source) return target;
  target.tournaments.push(...(source.tournaments || []));
  target.totalTop5 += source.totalTop5 || 0;
  target.predictedTop5InTop20 += source.predictedTop5InTop20 || 0;
  target.totalTop10 += source.totalTop10 || 0;
  target.predictedTop10InTop30 += source.predictedTop10InTop30 || 0;
  return target;
};

const buildSeasonCalibrationData = ({ season, dataRootDir, logger = console }) => {
  const tournamentDirs = listSeasonTournamentDirs(dataRootDir, season);
  const aggregate = {
    tournaments: [],
    totalTop5: 0,
    predictedTop5InTop20: 0,
    totalTop10: 0,
    predictedTop10InTop30: 0,
    generatedAt: new Date().toISOString()
  };

  tournamentDirs.forEach(tournamentDir => {
    const tournamentSlug = path.basename(tournamentDir);
    const inputsDir = path.resolve(tournamentDir, 'inputs');
    const preEventDir = path.resolve(tournamentDir, 'pre_event');
    const postEventDir = path.resolve(tournamentDir, 'post_event');

    const fallbackName = formatTournamentDisplayName(tournamentSlug);
    const tournamentName = inferTournamentNameFromInputs(inputsDir, season, fallbackName) || fallbackName;
    const slugCandidates = buildSlugCandidates({
      tournamentSlug,
      tournamentName,
      tournamentDir
    });
    const primarySlug = slugCandidates[0] || tournamentSlug || slugifyTournament(tournamentName) || 'tournament';

    const rankingsJsonPath = preEventDir
      ? resolveExistingPath(preEventDir, slugCandidates, '_pre_event_rankings.json')
        || path.resolve(preEventDir, `${primarySlug}_pre_event_rankings.json`)
      : null;
    const rankingsCsvPath = preEventDir
      ? resolveExistingPath(preEventDir, slugCandidates, '_pre_event_rankings.csv')
        || path.resolve(preEventDir, `${primarySlug}_pre_event_rankings.csv`)
      : null;
    const resultsJsonPath = postEventDir
      ? resolveExistingPath(postEventDir, slugCandidates, '_results.json')
        || path.resolve(postEventDir, `${primarySlug}_results.json`)
      : null;
    const resultsCsvPath = postEventDir
      ? resolveExistingPath(postEventDir, slugCandidates, '_results.csv')
        || path.resolve(postEventDir, `${primarySlug}_results.csv`)
      : null;
    const legacyResultsJsonPath = postEventDir ? path.resolve(postEventDir, 'tournament_results.json') : null;
    const legacyResultsCsvPath = postEventDir ? path.resolve(postEventDir, 'tournament_results.csv') : null;

    const predictionsResult = loadTournamentPredictions({
      rankingsJsonPath,
      rankingsCsvPath
    });

    const resultsResult = (() => {
      const fromJson = loadTournamentResultsFromJson(resultsJsonPath);
      if (fromJson.results.length > 0) return fromJson;
      const fromLegacyJson = loadTournamentResultsFromJson(legacyResultsJsonPath);
      if (fromLegacyJson.results.length > 0) return fromLegacyJson;
      const fromCsv = loadTournamentResultsFromResultsCsv(resultsCsvPath);
      if (fromCsv.results.length > 0) return fromCsv;
      const fromLegacyCsv = loadTournamentResultsFromResultsCsv(legacyResultsCsvPath);
      if (fromLegacyCsv.results.length > 0) return fromLegacyCsv;
      return { source: 'missing', results: [] };
    })();

    if (predictionsResult.predictions.length === 0 || resultsResult.results.length === 0) {
      logger.log(`ℹ️  Calibration skip (${tournamentSlug}): missing predictions or results.`);
      return;
    }

    let displayName = tournamentName;
    if (resultsJsonPath && fs.existsSync(resultsJsonPath)) {
      const payload = readJsonFile(resultsJsonPath);
      displayName = payload?.tournament || payload?.eventName || displayName;
    }

    const calibration = buildCalibrationData({
      tournamentName: displayName,
      predictions: predictionsResult.predictions,
      results: resultsResult.results
    });

    mergeCalibrationData(aggregate, calibration);
  });

  return aggregate;
};

const writeCalibrationReport = (outputDir, calibrationData) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.calibrationReport}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.calibrationReport}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(calibrationData, null, 2));

  const toCsvRow = values => values
    .map(value => (value === null || value === undefined ? '' : JSON.stringify(value)))
    .join(',');

  const lines = [];
  lines.push(toCsvRow(['🎯 POST-TOURNAMENT CALIBRATION ANALYSIS']));
  lines.push('');
  lines.push(toCsvRow(['WINNER PREDICTION ACCURACY']));
  lines.push(toCsvRow(['Metric', 'Accuracy', 'Count']));

  const top5Pct = calibrationData.totalTop5 > 0
    ? (calibrationData.predictedTop5InTop20 / calibrationData.totalTop5) * 100
    : 0;
  const top10Pct = calibrationData.totalTop10 > 0
    ? (calibrationData.predictedTop10InTop30 / calibrationData.totalTop10) * 100
    : 0;

  lines.push(toCsvRow([
    'Top 5 finishers in Top 20 predictions',
    `${top5Pct.toFixed(1)}%`,
    `${calibrationData.predictedTop5InTop20}/${calibrationData.totalTop5}`
  ]));
  lines.push(toCsvRow([
    'Top 10 finishers in Top 30 predictions',
    `${top10Pct.toFixed(1)}%`,
    `${calibrationData.predictedTop10InTop30}/${calibrationData.totalTop10}`
  ]));

  lines.push('');
  lines.push(toCsvRow(['TOURNAMENT BREAKDOWN']));
  lines.push(toCsvRow(['Tournament', 'Top Finishers', 'Avg Miss (T5)', 'Top 5 Accuracy', 'Notes']));

  const tournaments = Array.isArray(calibrationData.tournaments)
    ? [...calibrationData.tournaments]
    : [];
  tournaments.sort((a, b) => (a?.accuracyMetrics?.avgMissTop5 || 0) - (b?.accuracyMetrics?.avgMissTop5 || 0));

  tournaments.forEach(tournament => {
    const top5 = tournament.topFinishers.filter(entry => entry.actualFinish <= 5);
    const top5Pred = top5.filter(entry => entry.predictedRank <= 20).length;
    const top5Acc = top5.length > 0 ? (top5Pred / top5.length) * 100 : null;
    const notes = top5.length === 0
      ? 'N/A'
      : (top5Pred === top5.length ? '✓ Perfect' : (top5Pred > 0 ? '~ Partial' : '✗ Missed'));

    lines.push(toCsvRow([
      tournament.name,
      tournament.topFinishers.length,
      tournament.accuracyMetrics.avgMissTop5.toFixed(1),
      top5Acc === null ? 'N/A' : `${top5Acc.toFixed(0)}%`,
      notes
    ]));
  });

  lines.push('');
  lines.push(toCsvRow(['NEXT STEPS']));
  lines.push(toCsvRow(['1. Review individual 02_Tournament_* sheets for detailed analysis']));
  lines.push(toCsvRow(['2. Compare Config vs Template vs Recommended weights']));
  lines.push(toCsvRow(['3. Adjust weights for metrics with high correlation but low current weight']));

  fs.writeFileSync(csvPath, lines.join('\n'));

  return { jsonPath, csvPath };
};

const resolveTournamentDir = (dataRootDir, season, tournamentName, tournamentSlug) => {
  if (!dataRootDir || !season) return null;
  const seasonDir = path.resolve(dataRootDir, String(season));
  const normalized = tournamentSlug || slugifyTournament(tournamentName);
  if (!fs.existsSync(seasonDir)) return normalized ? path.resolve(seasonDir, normalized) : seasonDir;
  const entries = fs.readdirSync(seasonDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== DEFAULT_OUTPUT_DIR_NAME)
    .map(entry => entry.name);
  if (normalized && entries.includes(normalized)) return path.resolve(seasonDir, normalized);
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
  return normalized ? path.resolve(seasonDir, normalized) : seasonDir;
};

const loadTournamentPredictions = ({ rankingsJsonPath, rankingsCsvPath, maxRows = 150 }) => {
  if (rankingsJsonPath && fs.existsSync(rankingsJsonPath)) {
    const payload = readJsonFile(rankingsJsonPath);
    const players = Array.isArray(payload?.players) ? payload.players : [];
    const predictions = players
      .map((player, idx) => ({
        dgId: String(player?.dgId || '').trim(),
        name: String(player?.name || '').trim(),
        rank: typeof player?.rank === 'number' ? player.rank : (idx + 1)
      }))
      .filter(entry => entry.dgId && entry.name)
      .slice(0, maxRows);
    return { source: 'json', predictions };
  }

  if (!rankingsCsvPath || !fs.existsSync(rankingsCsvPath)) {
    return { source: 'missing', predictions: [] };
  }

  const rows = parseCsvRows(rankingsCsvPath);
  const headerIndex = findHeaderRowIndex(rows, ['dg id', 'player name', 'rank']);
  if (headerIndex === -1) {
    return { source: 'csv', predictions: [] };
  }
  const headers = rows[headerIndex];
  const headerMap = buildHeaderIndexMap(headers);
  const dgIdIdx = headerMap.get('dg id');
  const nameIdx = headerMap.get('player name');
  const rankIdx = headerMap.get('rank') ?? headerMap.get('model rank');
  const dataRows = rows.slice(headerIndex + 1);
  const predictions = dataRows
    .map((row, idx) => {
      const dgId = dgIdIdx !== undefined ? String(row[dgIdIdx] || '').trim() : '';
      const name = nameIdx !== undefined ? String(row[nameIdx] || '').trim() : '';
      const rankValue = rankIdx !== undefined ? parseInt(String(row[rankIdx] || '').trim(), 10) : NaN;
      return {
        dgId,
        name,
        rank: Number.isNaN(rankValue) ? (idx + 1) : rankValue
      };
    })
    .filter(entry => entry.dgId && entry.name)
    .slice(0, maxRows);

  return { source: 'csv', predictions };
};

const loadTournamentResultsFromJson = resultsJsonPath => {
  if (!resultsJsonPath || !fs.existsSync(resultsJsonPath)) return { source: 'missing', results: [] };
  const payload = readJsonFile(resultsJsonPath);
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : payload?.resultsCurrent);
  if (!Array.isArray(rows)) return { source: 'json', results: [] };
  const results = rows
    .map(row => ({
      dgId: String(row?.dgId || row?.dg_id || row?.['DG ID'] || '').trim(),
      playerName: String(row?.playerName || row?.player_name || row?.name || row?.['Player Name'] || '').trim(),
      finishPosition: typeof row?.finishPosition === 'number'
        ? row.finishPosition
        : normalizeFinishPosition(row?.['Finish Position'] ?? row?.finish ?? row?.position)
    }))
    .filter(entry => entry.dgId);
  return { source: 'json', results: applyFinishFallback(results) };
};

const loadTournamentResultsFromResultsCsv = resultsCsvPath => {
  if (!resultsCsvPath || !fs.existsSync(resultsCsvPath)) return { source: 'missing', results: [] };
  const rows = parseCsvRows(resultsCsvPath);
  const headerIndex = findHeaderRowIndex(rows, ['dg id', 'player name', 'finish position']);
  if (headerIndex === -1) return { source: 'csv', results: [] };
  const headers = rows[headerIndex];
  const headerMap = buildHeaderIndexMap(headers);

  const dgIdIdx = headerMap.get('dg id');
  const nameIdx = headerMap.get('player name');
  const finishIdx = headerMap.get('finish position') ?? headerMap.get('finish');

  const results = rows.slice(headerIndex + 1)
    .map(row => {
      const dgId = dgIdIdx !== undefined ? String(row[dgIdIdx] || '').trim() : '';
      if (!dgId) return null;
      const playerName = nameIdx !== undefined ? String(row[nameIdx] || '').trim() : '';
      const finishRaw = finishIdx !== undefined ? row[finishIdx] : null;
      const finishPosition = normalizeFinishPosition(finishRaw);
      return {
        dgId,
        playerName: playerName || 'Unknown',
        finishPosition
      };
    })
    .filter(Boolean);

  return { source: 'results_csv', results: applyFinishFallback(results) };
};

const loadTournamentResultsFromHistoricalCsv = (historyCsvPath, eventId, season) => {
  if (!historyCsvPath || !fs.existsSync(historyCsvPath)) return { source: 'missing', results: [] };
  const rows = loadCsv(historyCsvPath, { skipFirstColumn: true });
  const eventIdStr = String(eventId || '').trim();
  const seasonStr = season ? String(season).trim() : null;
  const resultsByPlayer = {};

  rows.forEach(row => {
    const dgId = String(row['dg_id'] || '').trim();
    if (!dgId) return;
    const rowEvent = String(row['event_id'] || '').trim();
    if (eventIdStr && rowEvent !== eventIdStr) return;
    if (seasonStr) {
      const rowSeason = String(row['season'] || row['year'] || '').trim();
      if (rowSeason !== seasonStr) return;
    }
    const finishPosition = normalizeFinishPosition(row['fin_text']);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    const playerName = String(row['player_name'] || '').trim();
    if (!resultsByPlayer[dgId] || finishPosition < resultsByPlayer[dgId].finishPosition) {
      resultsByPlayer[dgId] = { finishPosition, playerName };
    }
  });

  const results = Object.entries(resultsByPlayer).map(([dgId, entry]) => ({
    dgId,
    playerName: entry.playerName || 'Unknown',
    finishPosition: entry.finishPosition
  }));

  return { source: 'historical_csv', results: applyFinishFallback(results) };
};

const extractHistoricalRowsFromSnapshotPayload = payload => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rounds)) return payload.rounds;
  if (typeof payload === 'object') {
    const nested = Object.values(payload).flatMap(value => Array.isArray(value) ? value : []);
    if (nested.length > 0) return nested;
  }
  return [];
};

const normalizeHistoricalRoundRow = row => {
  if (!row || typeof row !== 'object') return null;
  const dgId = row.dg_id || row.dgId || row.player_id || row.playerId || row.id;
  const eventId = row.event_id || row.eventId || row.tournament_id || row.tournamentId;
  if (!dgId || !eventId) return null;
  const yearValue = row.year ?? row.season ?? row.season_year ?? row.seasonYear;
  const roundNum = row.round_num ?? row.roundNum ?? row.round;
  const finText = row.fin_text ?? row.finish ?? row.finishPosition ?? row.fin;
  return {
    ...row,
    dg_id: String(dgId).trim(),
    player_name: row.player_name || row.playerName || row.name || null,
    event_id: String(eventId).trim(),
    year: yearValue ?? row.year,
    season: row.season ?? row.year ?? yearValue,
    round_num: roundNum ?? row.round_num,
    fin_text: finText ?? row.fin_text
  };
};

const loadTournamentResultsFromHistoricalApi = async (eventId, season) => {
  const eventIdStr = String(eventId || '').trim();
  const seasonValue = season ? String(season).trim() : null;
  if (!eventIdStr || !seasonValue) return { source: 'missing', results: [] };

  const snapshot = await getDataGolfHistoricalRounds({
    apiKey: DATAGOLF_API_KEY,
    cacheDir: DATAGOLF_CACHE_DIR,
    ttlMs: DATAGOLF_HISTORICAL_TTL_HOURS * 60 * 60 * 1000,
    allowStale: true,
    tour: DATAGOLF_HISTORICAL_TOUR,
    eventId: 'all',
    year: seasonValue,
    fileFormat: 'json'
  });

  if (!snapshot?.payload) return { source: snapshot?.source || 'missing', results: [] };
  const rows = extractHistoricalRowsFromSnapshotPayload(snapshot.payload)
    .map(normalizeHistoricalRoundRow)
    .filter(Boolean);

  const resultsByPlayer = {};
  rows.forEach(row => {
    const dgId = String(row.dg_id || '').trim();
    if (!dgId) return;
    const rowEvent = String(row.event_id || '').trim();
    if (rowEvent !== eventIdStr) return;
    const rowSeason = String(row.season || row.year || '').trim();
    if (seasonValue && rowSeason !== seasonValue) return;
    const finishPosition = normalizeFinishPosition(row.fin_text);
    if (!finishPosition || Number.isNaN(finishPosition)) return;
    const playerName = String(row.player_name || '').trim();
    if (!resultsByPlayer[dgId] || finishPosition < resultsByPlayer[dgId].finishPosition) {
      resultsByPlayer[dgId] = { finishPosition, playerName };
    }
  });

  const results = Object.entries(resultsByPlayer).map(([dgId, entry]) => ({
    dgId,
    playerName: entry.playerName || 'Unknown',
    finishPosition: entry.finishPosition
  }));

  return {
    source: snapshot.source || 'historical_api',
    results: applyFinishFallback(results),
    snapshot
  };
};

const loadTournamentResultsFromLiveStats = async () => {
  const snapshot = await getDataGolfLiveTournamentStats({
    apiKey: DATAGOLF_API_KEY,
    cacheDir: DATAGOLF_CACHE_DIR,
    ttlMs: DATAGOLF_LIVE_STATS_TTL_HOURS * 60 * 60 * 1000,
    allowStale: true,
    stats: RESULTS_LIVE_STATS,
    round: 'event_avg',
    display: 'value',
    fileFormat: 'json'
  });

  const liveStats = Array.isArray(snapshot?.payload?.live_stats)
    ? snapshot.payload.live_stats
    : [];

  const results = liveStats.map(entry => ({
    dgId: String(entry?.dg_id || '').trim(),
    playerName: String(entry?.player_name || '').trim(),
    finishPosition: normalizeFinishPosition(entry?.position)
  }));

  return {
    source: snapshot?.source || 'live_stats',
    results: applyFinishFallback(results),
    snapshot
  };
};

const writeTournamentResultsSnapshot = (resultsJsonPath, payload) => {
  if (!resultsJsonPath) return null;
  ensureDirectory(path.dirname(resultsJsonPath));
  fs.writeFileSync(resultsJsonPath, JSON.stringify(payload, null, 2));
  return resultsJsonPath;
};

const ensureTournamentResults = async ({
  resultsJsonPath,
  resultsCsvPath,
  resultsZScoreCsvPath,
  resultsFormattingCsvPath,
  legacyResultsJsonPath,
  rankingsCsvPath,
  historyCsvPath,
  eventId,
  season,
  tournamentName,
  logger = console
}) => {
  const resultsDir = resultsJsonPath ? path.dirname(resultsJsonPath) : null;
  const resolvedResultsCsvPath = resultsCsvPath || (resultsDir ? path.resolve(resultsDir, 'tournament_results.csv') : null);
  const modelData = parseModelRankingData(rankingsCsvPath);

  const buildPayloadAndWrite = ({ source, results, eventName, courseName, lastUpdated, apiSnapshots }) => {
    const rows = buildTournamentResultsRows({
      results,
      modelData,
      metricStats: modelData.metricStats
    });
    const metricStats = computeMetricStatsFromResults(rows);
    const zScores = buildZScoresForRows(rows, metricStats);
    const payload = {
      generatedAt: new Date().toISOString(),
      tournament: tournamentName || null,
      eventId: eventId || null,
      season: season || null,
      source,
      eventName: eventName || null,
      courseName: courseName || null,
      lastUpdated: lastUpdated || null,
      metricStats,
      zScores,
      results: rows,
      apiSnapshots: apiSnapshots || undefined
    };
    const pathWritten = writeTournamentResultsSnapshot(resultsJsonPath, payload);
    if (resolvedResultsCsvPath) {
      writeTournamentResultsCsv(resolvedResultsCsvPath, rows, {
        tournament: tournamentName || null,
        courseName: courseName || null,
        lastUpdated: lastUpdated || null,
        generatedAt: payload.generatedAt,
        source
      });
    }
    if (resultsZScoreCsvPath) {
      writeZScoresCsv(resultsZScoreCsvPath, rows, metricStats, {
        tournament: tournamentName || null,
        courseName: courseName || null,
        lastUpdated: lastUpdated || null,
        generatedAt: payload.generatedAt,
        source
      });
    }
    if (resultsFormattingCsvPath) {
      writeResultsFormattingCsv(resultsFormattingCsvPath, rows, {
        tournament: tournamentName || null,
        courseName: courseName || null,
        lastUpdated: lastUpdated || null,
        generatedAt: payload.generatedAt,
        source
      });
    }
    return { pathWritten, rows };
  };

  if (resultsJsonPath && fs.existsSync(resultsJsonPath)) {
    const payload = readJsonFile(resultsJsonPath);
    const payloadRows = Array.isArray(payload?.results) ? payload.results : [];
    const hasModelData = modelData?.playersById?.size > 0;
    const needsMetricRebuild = payloadRows.length > 0 && payloadRows.some(row => {
      if (!row || typeof row !== 'object') return true;
      return RESULTS_REQUIRED_FIELDS.some(field => row[field] === undefined || row[field] === null || row[field] === '');
    });
    const needsEnrichment = hasModelData && payloadRows.some(row => {
      const dgId = String(row?.['DG ID'] || '').trim();
      if (!dgId) return false;
      const modelRank = row?.['Model Rank'];
      return (modelRank === '' || modelRank === null || modelRank === undefined)
        && modelData.playersById.has(dgId);
    });

    if (needsMetricRebuild && historyCsvPath && fs.existsSync(historyCsvPath)) {
      const rawRows = loadCsv(historyCsvPath, { skipFirstColumn: true });
      const build = buildResultsFromHistoricalRows(rawRows, eventId, season);
      if (build.results.length > 0) {
        const stats = fs.statSync(historyCsvPath);
        const lastUpdated = stats?.mtime ? stats.mtime.toISOString() : null;
        const rebuilt = buildPayloadAndWrite({
          source: 'historical_csv',
          results: build.results,
          eventName: build.eventName,
          courseName: build.courseName,
          lastUpdated
        });
        logger.log('✓ Rebuilt results JSON to include full historical metrics.');
        return { source: 'historical_csv_rebuild', path: rebuilt.pathWritten || resultsJsonPath };
      }
    }

    if (needsEnrichment) {
      const results = payloadRows
        .map(row => {
          const dgId = String(row?.['DG ID'] || '').trim();
          if (!dgId) return null;
          const playerName = String(row?.['Player Name'] || row?.['Player'] || '').trim();
          const finishPosition = normalizeFinishPosition(row?.['Finish Position']);
          const score = parseNumericValue(row?.Score ?? row?.score);
          const metrics = {};
          RESULT_METRIC_FIELDS.forEach(field => {
            metrics[field.key] = parseNumericValue(row?.[field.label]);
          });
          return {
            dgId,
            playerName: playerName || 'Unknown',
            finishPosition,
            score,
            metrics
          };
        })
        .filter(Boolean);

      const rows = buildTournamentResultsRows({
        results,
        modelData,
        metricStats: modelData.metricStats
      });
      const metricStats = computeMetricStatsFromResults(rows);
      const zScores = buildZScoresForRows(rows, metricStats);
      const updatedPayload = {
        generatedAt: new Date().toISOString(),
        tournament: payload?.tournament || tournamentName || null,
        eventId: payload?.eventId || eventId || null,
        season: payload?.season || season || null,
        source: payload?.source || 'existing_json',
        eventName: payload?.eventName || null,
        courseName: payload?.courseName || null,
        lastUpdated: payload?.lastUpdated || null,
        metricStats,
        zScores,
        results: rows,
        apiSnapshots: payload?.apiSnapshots || undefined
      };
      writeTournamentResultsSnapshot(resultsJsonPath, updatedPayload);
      if (resolvedResultsCsvPath) {
        writeTournamentResultsCsv(resolvedResultsCsvPath, rows, {
          tournament: updatedPayload.tournament,
          courseName: updatedPayload.courseName,
          lastUpdated: updatedPayload.lastUpdated,
          generatedAt: updatedPayload.generatedAt,
          source: updatedPayload.source
        });
      }
      if (resultsZScoreCsvPath) {
        writeZScoresCsv(resultsZScoreCsvPath, rows, metricStats, {
          tournament: updatedPayload.tournament,
          courseName: updatedPayload.courseName,
          lastUpdated: updatedPayload.lastUpdated,
          generatedAt: updatedPayload.generatedAt,
          source: updatedPayload.source
        });
      }
      if (resultsFormattingCsvPath) {
        writeResultsFormattingCsv(resultsFormattingCsvPath, rows, {
          tournament: updatedPayload.tournament,
          courseName: updatedPayload.courseName,
          lastUpdated: updatedPayload.lastUpdated,
          generatedAt: updatedPayload.generatedAt,
          source: updatedPayload.source
        });
      }
      logger.log('✓ Enriched existing results JSON with model rankings.');
      return { source: 'existing_json_enriched', path: resultsJsonPath };
    }

    if (resolvedResultsCsvPath && !fs.existsSync(resolvedResultsCsvPath)) {
      if (payload?.results && Array.isArray(payload.results)) {
        writeTournamentResultsCsv(resolvedResultsCsvPath, payload.results, {
          tournament: payload?.tournament || null,
          courseName: payload?.courseName || null,
          lastUpdated: payload?.lastUpdated || null,
          generatedAt: payload?.generatedAt || null,
          source: payload?.source || null
        });
      }
    }

    if (resultsZScoreCsvPath && !fs.existsSync(resultsZScoreCsvPath) && payloadRows.length > 0) {
      const metricStats = payload?.metricStats || computeMetricStatsFromResults(payloadRows);
      writeZScoresCsv(resultsZScoreCsvPath, payloadRows, metricStats, {
        tournament: payload?.tournament || tournamentName || null,
        courseName: payload?.courseName || null,
        lastUpdated: payload?.lastUpdated || null,
        generatedAt: payload?.generatedAt || null,
        source: payload?.source || null
      });
    }

    if (resultsFormattingCsvPath && !fs.existsSync(resultsFormattingCsvPath) && payloadRows.length > 0) {
      writeResultsFormattingCsv(resultsFormattingCsvPath, payloadRows, {
        tournament: payload?.tournament || tournamentName || null,
        courseName: payload?.courseName || null,
        lastUpdated: payload?.lastUpdated || null,
        generatedAt: payload?.generatedAt || null,
        source: payload?.source || null
      });
    }
    return { source: 'existing_json', path: resultsJsonPath };
  }

  if (legacyResultsJsonPath && fs.existsSync(legacyResultsJsonPath) && resultsJsonPath) {
    const legacyPayload = readJsonFile(legacyResultsJsonPath);
    if (legacyPayload?.results && Array.isArray(legacyPayload.results)) {
      const legacyRows = legacyPayload.results;
      const pathWritten = writeTournamentResultsSnapshot(resultsJsonPath, legacyPayload);
      if (resolvedResultsCsvPath) {
        writeTournamentResultsCsv(resolvedResultsCsvPath, legacyRows, {
          tournament: legacyPayload?.tournament || null,
          courseName: legacyPayload?.courseName || null,
          lastUpdated: legacyPayload?.lastUpdated || null,
          generatedAt: legacyPayload?.generatedAt || null,
          source: legacyPayload?.source || 'legacy_json'
        });
      }
      logger.log(`✓ Migrated legacy results JSON to ${path.basename(resultsJsonPath)}.`);
      return { source: 'legacy_json', path: pathWritten };
    }
  }


  if (historyCsvPath && fs.existsSync(historyCsvPath)) {
    const rawRows = loadCsv(historyCsvPath, { skipFirstColumn: true });
    const build = buildResultsFromHistoricalRows(rawRows, eventId, season);
    if (build.results.length > 0) {
      const stats = fs.statSync(historyCsvPath);
      const lastUpdated = stats?.mtime ? stats.mtime.toISOString() : null;
      buildPayloadAndWrite({
        source: 'historical_csv',
        results: build.results,
        eventName: build.eventName,
        courseName: build.courseName,
        lastUpdated
      });
      logger.log(`✓ Tournament results sourced from Historical Data CSV (${build.results.length} players).`);
      return { source: 'historical_csv', path: resultsJsonPath };
    }
    logger.log('ℹ️  Historical Data CSV found, but no current-season results detected; falling back to API.');
  }

  const fromApi = await loadTournamentResultsFromHistoricalApi(eventId, season);
  if (fromApi.results.length > 0) {
    const rows = extractHistoricalRowsFromSnapshotPayload(fromApi.snapshot?.payload)
      .map(normalizeHistoricalRoundRow)
      .filter(Boolean);
    const build = buildResultsFromHistoricalRows(rows, eventId, season);
    buildPayloadAndWrite({
      source: fromApi.source,
      results: build.results,
      eventName: build.eventName,
      courseName: build.courseName,
      lastUpdated: fromApi.snapshot?.payload?.last_updated || null,
      apiSnapshots: {
        dataGolfHistoricalRounds: {
          source: fromApi.snapshot?.source || null,
          path: fromApi.snapshot?.path || null,
          lastUpdated: fromApi.snapshot?.payload?.last_updated || null
        }
      }
    });
    logger.log(`✓ Tournament results sourced from DataGolf historical rounds (${build.results.length} players).`);
    return { source: fromApi.source, path: resultsJsonPath };
  }

  if (fromApi.snapshot?.payload) {
    logger.warn('⚠️  Historical rounds payload loaded but no results found; skipping live stats fallback.');
    return { source: fromApi.source || 'historical_api', path: resultsJsonPath || null };
  }

  const fromLive = await loadTournamentResultsFromLiveStats();
  if (fromLive.results.length > 0) {
    const build = buildResultsFromLiveStatsPayload(fromLive.snapshot?.payload || {});
    buildPayloadAndWrite({
      source: fromLive.source,
      results: build.results,
      eventName: build.eventName,
      courseName: build.courseName,
      lastUpdated: fromLive.snapshot?.payload?.last_updated || null,
      apiSnapshots: {
        dataGolfLiveStats: {
          source: fromLive.snapshot?.source || null,
          path: fromLive.snapshot?.path || null,
          lastUpdated: fromLive.snapshot?.payload?.last_updated || null,
          eventName: fromLive.snapshot?.payload?.event_name || null,
          courseName: fromLive.snapshot?.payload?.course_name || null,
          statRound: fromLive.snapshot?.payload?.stat_round || null,
          statDisplay: fromLive.snapshot?.payload?.stat_display || null
        }
      }
    });
    logger.log(`✓ Tournament results sourced from DataGolf live stats (${build.results.length} players).`);
    return { source: fromLive.source, path: resultsJsonPath };
  }

  logger.warn('⚠️  Tournament results unavailable (CSV + API fallbacks failed).');
  return { source: 'missing', path: resultsJsonPath || null };
};

const loadTournamentConfig = ({ configCsvPath, courseContextPath, eventId }) => {
  if (configCsvPath && fs.existsSync(configCsvPath)) {
    const sharedConfig = getSharedConfig(configCsvPath);
    return {
      source: 'config_csv',
      eventId: sharedConfig?.currentEventId || eventId || null,
      courseType: sharedConfig?.courseType || null,
      courseName: sharedConfig?.courseNameRaw || null,
      courseNum: sharedConfig?.courseNum || null
    };
  }

  if (courseContextPath && fs.existsSync(courseContextPath)) {
    const courseContext = readJsonFile(courseContextPath);
    const eventKey = String(eventId || '').trim();
    const entry = courseContext && eventKey ? courseContext[eventKey] : null;
    if (entry) {
      return {
        source: 'course_context',
        eventId: eventId || null,
        courseType: entry.courseType || entry.templateKey || null,
        courseName: entry.courseName || entry.course || null,
        courseNum: entry.courseNum || null
      };
    }
  }

  return {
    source: 'none',
    eventId: eventId || null,
    courseType: null,
    courseName: null,
    courseNum: null
  };
};

const runSeasonValidation = async ({ season, dataRootDir, logger = console } = {}) => {
  if (!season || !dataRootDir) {
    throw new Error('validationRunner: season and dataRootDir are required');
  }

  const tournamentDirs = listSeasonTournamentDirs(dataRootDir, season);
  const results = [];

  for (const tournamentDir of tournamentDirs) {
    const tournamentSlug = path.basename(tournamentDir);
    const inputsDir = path.resolve(tournamentDir, 'inputs');
    const fallbackName = formatTournamentDisplayName(tournamentSlug);
    const tournamentName = inferTournamentNameFromInputs(inputsDir, season, fallbackName) || fallbackName;
    try {
      const validationResult = await runValidation({
        season,
        dataRootDir,
        tournamentName,
        tournamentSlug,
        tournamentDir,
        eventId: null,
        logger
      });
      results.push({ tournament: tournamentSlug, status: 'ok', outputDir: validationResult.outputDir });
    } catch (error) {
      logger.warn(`⚠️  Validation failed for ${tournamentSlug}: ${error.message}`);
      results.push({ tournament: tournamentSlug, status: 'error', error: error.message });
    }
  }

  return {
    season,
    outputDir: getValidationOutputDir(dataRootDir, season),
    results
  };
};

const runValidation = async ({
  season,
  dataRootDir,
  tournamentName,
  tournamentSlug,
  tournamentDir,
  eventId,
  logger = console
} = {}) => {
  if (!season || !dataRootDir) {
    throw new Error('validationRunner: season and dataRootDir are required');
  }

  const resolvedSlug = tournamentSlug || slugifyTournament(tournamentName);
  const outputDir = getValidationOutputDir(dataRootDir, season);
  const resolvedTournamentDir = tournamentDir || resolveTournamentDir(dataRootDir, season, tournamentName, resolvedSlug);
  const slugCandidates = buildSlugCandidates({
    tournamentSlug,
    tournamentName,
    tournamentDir: resolvedTournamentDir
  });
  const primarySlug = slugCandidates[0] || resolvedSlug || slugifyTournament(tournamentName) || 'tournament';
  const inputsDir = resolvedTournamentDir ? path.resolve(resolvedTournamentDir, 'inputs') : null;
  const preEventDir = resolvedTournamentDir ? path.resolve(resolvedTournamentDir, 'pre_event') : null;
  const postEventDir = resolvedTournamentDir ? path.resolve(resolvedTournamentDir, 'post_event') : null;
  const rankingsJsonPath = preEventDir
    ? resolveRankingPath(preEventDir, slugCandidates, '_pre_event_rankings.json')
      || path.resolve(preEventDir, `${primarySlug}_pre_event_rankings.json`)
    : null;
  const rankingsCsvPath = preEventDir
    ? resolveRankingPath(preEventDir, slugCandidates, '_pre_event_rankings.csv')
      || path.resolve(preEventDir, `${primarySlug}_pre_event_rankings.csv`)
    : null;
  const resultsBaseName = primarySlug;
  const resultsJsonPath = postEventDir
    ? resolveExistingPath(postEventDir, slugCandidates, '_results.json')
      || path.resolve(postEventDir, `${resultsBaseName}_results.json`)
    : null;
  const resultsCsvPath = postEventDir
    ? resolveExistingPath(postEventDir, slugCandidates, '_results.csv')
      || path.resolve(postEventDir, `${resultsBaseName}_results.csv`)
    : null;
  const resultsZScoreCsvPath = postEventDir
    ? resolveExistingPath(postEventDir, slugCandidates, '_results_zscores.csv')
      || path.resolve(postEventDir, `${resultsBaseName}_results_zscores.csv`)
    : null;
  const resultsFormattingCsvPath = postEventDir
    ? resolveExistingPath(postEventDir, slugCandidates, '_results_formatting.csv')
      || path.resolve(postEventDir, `${resultsBaseName}_results_formatting.csv`)
    : null;
  const legacyResultsJsonPath = postEventDir ? path.resolve(postEventDir, 'tournament_results.json') : null;
  const legacyResultsCsvPath = postEventDir ? path.resolve(postEventDir, 'tournament_results.csv') : null;
  const normalizedTournamentName = normalizeTournamentNameForSeason(tournamentName || resolvedSlug, season);
  const historyCsvPath = resolveInputCsvPath({
    inputsDir,
    season,
    suffix: 'Historical Data'
  });
  const configCsvPath = resolveInputCsvPath({
    inputsDir,
    season,
    suffix: 'Configuration Sheet'
  });
  const courseContextPath = path.resolve(__dirname, '..', 'utilities', 'course_context.json');
  let skipMetricAnalysis = false;
  const outputStates = new Map();
  const outputs = [];

  const trackOutput = (label, filePath) => {
    const entry = captureOutputState(label, filePath);
    if (entry?.path) outputStates.set(entry.path, entry);
    return entry;
  };

  const recordOutput = (label, filePath) => {
    if (!filePath) return;
    const entry = outputStates.get(filePath) || captureOutputState(label, filePath) || { label, path: filePath };
    recordOutputWrite(outputs, entry, true);
  };

  logger.log(`ℹ️  Validation runner initialized (season=${season}, outputDir=${outputDir})`);

  const config = loadTournamentConfig({
    configCsvPath,
    courseContextPath,
    eventId
  });

  const resultsSourceInfo = await ensureTournamentResults({
    resultsJsonPath,
    resultsCsvPath,
    resultsZScoreCsvPath,
    resultsFormattingCsvPath,
    legacyResultsJsonPath,
    legacyResultsCsvPath,
    rankingsCsvPath,
    historyCsvPath,
    eventId: config.eventId || eventId,
    season,
    tournamentName: tournamentName || resolvedSlug,
    logger
  });
  skipMetricAnalysis = resolvedSlug
    ? shouldSkipMetricAnalysis(outputDir, resolvedSlug, resultsJsonPath)
    : false;
  if (!skipMetricAnalysis && resolvedSlug && resolvedSlug.includes('seed-')) {
    skipMetricAnalysis = true;
    logger.log(`ℹ️  Skipping metric analysis for seed run ${resolvedSlug} (seed-specific analysis is redundant).`);
  }
  if (skipMetricAnalysis) {
    logger.log(`ℹ️  Skipping metric analysis for ${resolvedSlug} (already exists).`);
  }

  const predictionsResult = loadTournamentPredictions({
    rankingsJsonPath,
    rankingsCsvPath
  });

  const resultsResult = (() => {
    const fromJson = loadTournamentResultsFromJson(resultsJsonPath);
    if (fromJson.results.length > 0) return fromJson;
    const fromLegacyJson = loadTournamentResultsFromJson(legacyResultsJsonPath);
    if (fromLegacyJson.results.length > 0) return fromLegacyJson;
    const fromCsv = loadTournamentResultsFromResultsCsv(resultsCsvPath);
    if (fromCsv.results.length > 0) return fromCsv;
    const fromLegacyCsv = loadTournamentResultsFromResultsCsv(legacyResultsCsvPath);
    if (fromLegacyCsv.results.length > 0) return fromLegacyCsv;
    return loadTournamentResultsFromHistoricalCsv(historyCsvPath, config.eventId || eventId, season);
  })();

  const evaluation = evaluateTournamentPredictions(predictionsResult.predictions, resultsResult.results);
  const tournamentCalibration = buildCalibrationData({
    tournamentName: tournamentName || resolvedSlug,
    predictions: predictionsResult.predictions,
    results: resultsResult.results
  });
  const seasonCalibration = buildSeasonCalibrationData({
    season,
    dataRootDir,
    logger
  });
  const calibrationReportData = seasonCalibration.tournaments.length > 0
    ? seasonCalibration
    : tournamentCalibration;
  const calibrationJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.calibrationReport}.json`);
  const calibrationCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.calibrationReport}.csv`);
  trackOutput('calibrationReport.json', calibrationJsonPath);
  trackOutput('calibrationReport.csv', calibrationCsvPath);
  const calibrationOutputs = writeCalibrationReport(outputDir, calibrationReportData);
  recordOutput('calibrationReport.json', calibrationOutputs?.jsonPath);
  recordOutput('calibrationReport.csv', calibrationOutputs?.csvPath);

  let metricAnalysis = null;
  let metricAnalysisOutputs = null;
  const courseType = config.courseType || null;
  const courseTypeSource = config.source || null;
  if (!skipMetricAnalysis && resolvedSlug) {
    const metricAnalysisDir = getMetricAnalysisDir(outputDir) || outputDir;
    const metricJsonPath = path.resolve(metricAnalysisDir, `${resolvedSlug}_metric_analysis.json`);
    const metricCsvPath = path.resolve(metricAnalysisDir, `${resolvedSlug}_metric_analysis.csv`);
    trackOutput('metricAnalysis.json', metricJsonPath);
    trackOutput('metricAnalysis.csv', metricCsvPath);
    const resultsPayload = readJsonFile(resultsJsonPath);
    const resultsRows = Array.isArray(resultsPayload?.results)
      ? resultsPayload.results
      : (Array.isArray(resultsPayload) ? resultsPayload : []);
    metricAnalysis = buildMetricAnalysis({
      rankingsCsvPath,
      results: resultsResult.results,
      resultsRows: resultsRows.length > 0 ? resultsRows : resultsResult.results,
      historyCsvPath,
      eventId: config.eventId || eventId,
      season,
      tournamentSlug: resolvedSlug,
      courseType
    });
    if (metricAnalysis) {
      metricAnalysis.eventId = config.eventId || eventId || null;
      metricAnalysis.courseType = courseType || determineDetectedCourseType(metricAnalysis.metrics);
      metricAnalysis.courseTypeSource = courseTypeSource || null;
    }
    metricAnalysisOutputs = writeMetricAnalysis(outputDir, metricAnalysis, {
      season,
      tournamentName: tournamentName || resolvedSlug,
      courseType,
      configCsvPath,
      resultsJsonPath,
      rankingsCsvPath,
      rankingsJsonPath
    });
    recordOutput('metricAnalysis.json', metricAnalysisOutputs?.jsonPath);
    recordOutput('metricAnalysis.csv', metricAnalysisOutputs?.csvPath);
  }

  const metricAnalysisDir = getMetricAnalysisDir(outputDir);
  const existingMetricAnalyses = metricAnalysisDir && fs.existsSync(metricAnalysisDir)
    ? fs.readdirSync(metricAnalysisDir)
        .filter(name => name.endsWith('_metric_analysis.json'))
        .map(name => readJsonFile(path.resolve(metricAnalysisDir, name)))
        .filter(Boolean)
    : [];

  const allMetricAnalyses = metricAnalysis
    ? [...existingMetricAnalyses.filter(entry => entry?.tournament !== metricAnalysis.tournament), metricAnalysis]
    : existingMetricAnalyses;

  const classificationPayload = {
    generatedAt: new Date().toISOString(),
    entries: buildCourseTypeClassificationEntries({
      metricAnalyses: allMetricAnalyses,
      season
    })
  };
  const classificationJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.courseTypeClassification}.json`);
  const classificationCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.courseTypeClassification}.csv`);
  trackOutput('courseTypeClassification.json', classificationJsonPath);
  trackOutput('courseTypeClassification.csv', classificationCsvPath);
  const classificationOutputs = writeCourseTypeClassification(outputDir, classificationPayload);
  recordOutput('courseTypeClassification.json', classificationOutputs?.jsonPath);
  recordOutput('courseTypeClassification.csv', classificationOutputs?.csvPath);

  const byType = {
    POWER: allMetricAnalyses.filter(entry => entry?.courseType === 'POWER'),
    TECHNICAL: allMetricAnalyses.filter(entry => entry?.courseType === 'TECHNICAL'),
    BALANCED: allMetricAnalyses.filter(entry => entry?.courseType === 'BALANCED')
  };

  const powerCorrelationJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.powerCorrelationSummary}.json`);
  const powerCorrelationCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.powerCorrelationSummary}.csv`);
  const technicalCorrelationJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.technicalCorrelationSummary}.json`);
  const technicalCorrelationCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.technicalCorrelationSummary}.csv`);
  const balancedCorrelationJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.balancedCorrelationSummary}.json`);
  const balancedCorrelationCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.balancedCorrelationSummary}.csv`);
  trackOutput('powerCorrelationSummary.json', powerCorrelationJsonPath);
  trackOutput('powerCorrelationSummary.csv', powerCorrelationCsvPath);
  trackOutput('technicalCorrelationSummary.json', technicalCorrelationJsonPath);
  trackOutput('technicalCorrelationSummary.csv', technicalCorrelationCsvPath);
  trackOutput('balancedCorrelationSummary.json', balancedCorrelationJsonPath);
  trackOutput('balancedCorrelationSummary.csv', balancedCorrelationCsvPath);
  const correlationSummaries = {
    POWER: writeCorrelationSummary(outputDir, OUTPUT_NAMES.powerCorrelationSummary, buildCorrelationSummary(byType.POWER), {
      type: 'POWER',
      season,
      tournaments: byType.POWER.map(entry => entry.tournament).filter(Boolean)
    }),
    TECHNICAL: writeCorrelationSummary(outputDir, OUTPUT_NAMES.technicalCorrelationSummary, buildCorrelationSummary(byType.TECHNICAL), {
      type: 'TECHNICAL',
      season,
      tournaments: byType.TECHNICAL.map(entry => entry.tournament).filter(Boolean)
    }),
    BALANCED: writeCorrelationSummary(outputDir, OUTPUT_NAMES.balancedCorrelationSummary, buildCorrelationSummary(byType.BALANCED), {
      type: 'BALANCED',
      season,
      tournaments: byType.BALANCED.map(entry => entry.tournament).filter(Boolean)
    })
  };
  recordOutput('powerCorrelationSummary.json', correlationSummaries?.POWER?.jsonPath);
  recordOutput('powerCorrelationSummary.csv', correlationSummaries?.POWER?.csvPath);
  recordOutput('technicalCorrelationSummary.json', correlationSummaries?.TECHNICAL?.jsonPath);
  recordOutput('technicalCorrelationSummary.csv', correlationSummaries?.TECHNICAL?.csvPath);
  recordOutput('balancedCorrelationSummary.json', correlationSummaries?.BALANCED?.jsonPath);
  recordOutput('balancedCorrelationSummary.csv', correlationSummaries?.BALANCED?.csvPath);

  const summariesByType = {
    POWER: buildCorrelationSummary(byType.POWER),
    TECHNICAL: buildCorrelationSummary(byType.TECHNICAL),
    BALANCED: buildCorrelationSummary(byType.BALANCED)
  };
  const typeCounts = {
    POWER: byType.POWER.length,
    TECHNICAL: byType.TECHNICAL.length,
    BALANCED: byType.BALANCED.length
  };
  const templatesByType = {
    POWER: WEIGHT_TEMPLATES?.POWER || null,
    TECHNICAL: WEIGHT_TEMPLATES?.TECHNICAL || null,
    BALANCED: WEIGHT_TEMPLATES?.BALANCED || null
  };

  const weightCalibrationJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightCalibrationGuide}.json`);
  const weightCalibrationCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightCalibrationGuide}.csv`);
  trackOutput('weightCalibrationGuide.json', weightCalibrationJsonPath);
  trackOutput('weightCalibrationGuide.csv', weightCalibrationCsvPath);
  const weightCalibrationOutputs = writeWeightCalibrationGuide(outputDir, summariesByType, templatesByType, typeCounts);
  recordOutput('weightCalibrationGuide.json', weightCalibrationOutputs?.jsonPath);
  recordOutput('weightCalibrationGuide.csv', weightCalibrationOutputs?.csvPath);
  const configInfo = collectTournamentConfigInfo({ dataRootDir, season });
  const typeTournaments = {
    POWER: byType.POWER.map(entry => entry.tournament).filter(Boolean),
    TECHNICAL: byType.TECHNICAL.map(entry => entry.tournament).filter(Boolean),
    BALANCED: byType.BALANCED.map(entry => entry.tournament).filter(Boolean)
  };
  const weightTemplatesJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightTemplates}.json`);
  const weightTemplatesCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightTemplates}.csv`);
  trackOutput('weightTemplates.json', weightTemplatesJsonPath);
  trackOutput('weightTemplates.csv', weightTemplatesCsvPath);
  const weightTemplatesOutputs = writeWeightTemplatesOutput(outputDir, summariesByType, templatesByType, {
    configInfo,
    typeTournaments
  });
  recordOutput('weightTemplates.json', weightTemplatesOutputs?.jsonPath);
  recordOutput('weightTemplates.csv', weightTemplatesOutputs?.csvPath);

  const modelDeltaTrends = buildModelDeltaTrends({ resultsJsonPath, season, dataRootDir });
  const modelDeltaJsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.modelDeltaTrends}.json`);
  const modelDeltaCsvPath = path.resolve(outputDir, `${OUTPUT_NAMES.modelDeltaTrends}.csv`);
  trackOutput('modelDeltaTrends.json', modelDeltaJsonPath);
  trackOutput('modelDeltaTrends.csv', modelDeltaCsvPath);
  const modelDeltaTrendOutputs = writeModelDeltaTrends(outputDir, modelDeltaTrends);
  recordOutput('modelDeltaTrends.json', modelDeltaTrendOutputs?.jsonPath);
  recordOutput('modelDeltaTrends.csv', modelDeltaTrendOutputs?.csvPath);

  const processingLogPath = path.resolve(outputDir, `${OUTPUT_NAMES.processingLog}.json`);
  trackOutput('processingLog.json', processingLogPath);
  const dataProcessed = {
    predictionsCount: predictionsResult.predictions.length,
    resultsCount: resultsResult.results.length,
    metricAnalysis: metricAnalysis
      ? {
          metrics: metricAnalysis.metrics.length,
          top10Finishers: metricAnalysis.top10Finishers,
          totalFinishers: metricAnalysis.totalFinishers
        }
      : null,
    modelDeltaTrends: modelDeltaTrends
      ? {
          metrics: modelDeltaTrends.metrics.length,
          totalSamples: modelDeltaTrends.meta?.totalSamples ?? null,
          tournamentCount: modelDeltaTrends.meta?.tournamentCount ?? null,
          source: modelDeltaTrends.meta?.source ?? null
        }
      : null
  };
  const processingLog = writeProcessingLog(outputDir, {
    tournament: resolvedSlug || tournamentName || null,
    eventId: config.eventId || eventId || null,
    season,
    skipMetricAnalysis,
    dataProcessed,
    inputs: {
      rankingsJsonPath,
      rankingsCsvPath,
      resultsJsonPath,
      resultsCsvPath,
      configCsvPath
    },
    sources: {
      rankings: predictionsResult.source || null,
      results: resultsResult.source || null,
      resultsGeneratedFrom: resultsSourceInfo?.source || null,
      config: config.source || null
    },
    outputs
  });
  recordOutput('processingLog.json', processingLog?.jsonPath || processingLogPath);

  return {
    outputDir,
    outputs: OUTPUT_NAMES,
    skipMetricAnalysis,
    tournamentSlug: resolvedSlug || null,
    tournamentDir: resolvedTournamentDir || null,
    inputsDir,
    preEventDir,
    postEventDir,
    config,
    templateConfig: WEIGHT_TEMPLATES || {},
    predictions: predictionsResult,
    results: resultsResult,
    evaluation,
    calibration: calibrationReportData,
    tournamentCalibration,
    seasonCalibration,
    calibrationOutputs,
    courseTypeClassification: classificationPayload,
    courseTypeClassificationOutputs: classificationOutputs,
    metricAnalysis,
    metricAnalysisOutputs,
    correlationSummaries,
    weightCalibrationOutputs,
    weightTemplatesOutputs,
    modelDeltaTrends,
    modelDeltaTrendOutputs,
    processingLog
  };
};

module.exports = {
  OUTPUT_NAMES,
  getValidationOutputDir,
  shouldSkipMetricAnalysis,
  slugifyTournament,
  runValidation,
  runSeasonValidation
};
