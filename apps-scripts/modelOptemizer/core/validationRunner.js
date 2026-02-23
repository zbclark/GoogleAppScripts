const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const { loadCsv } = require('../utilities/csvLoader');
const { getSharedConfig } = require('../utilities/configParser');
const { WEIGHT_TEMPLATES } = require('../utilities/weightTemplates');
const {
  getDataGolfHistoricalRounds,
  getDataGolfLiveTournamentStats
} = require('../utilities/dataGolfClient');

const DEFAULT_OUTPUT_DIR_NAME = 'validation_outputs';
const ROOT_DIR = path.resolve(__dirname, '..');
const DATAGOLF_CACHE_DIR = path.resolve(ROOT_DIR, 'data', 'cache');
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
  'SG BS'
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
  { label: 'SG BS', key: 'sg_bs', hasModel: false }
];

const getValidationOutputDir = (dataRootDir, season) => {
  return path.resolve(dataRootDir, String(season), DEFAULT_OUTPUT_DIR_NAME);
};

const shouldSkipMetricAnalysis = (outputDir, tournamentSlug) => {
  const fileName = `${tournamentSlug}_metric_analysis.json`;
  return fs.existsSync(path.resolve(outputDir, fileName));
};

const ensureDirectory = dirPath => {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const slugifyTournament = value => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1].value === entries[i].value) {
      j += 1;
    }
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) {
      ranks[entries[k].index] = avgRank;
    }
    i = j + 1;
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
        prox_rgh: 0
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
        prox_rgh: player.metrics.prox_rgh / rounds
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
      prox_rgh: parseNumericValue(entry?.prox_rgh ?? entry?.prox_rough) || 0
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
    .map(metric => metricLabelMap.get(metric))
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
  tournamentSlug,
  courseType
}) => {
  const extracted = extractRankingMetrics(rankingsCsvPath);
  const { map: resultsById } = buildFinishPositionMap(results);
  const metrics = [];

  extracted.metricLabels.forEach(label => {
    const values = [];
    const positions = [];
    const top10Values = [];
    extracted.players.forEach(player => {
      const finish = resultsById.get(String(player.dgId));
      if (typeof finish !== 'number' || Number.isNaN(finish)) return;
      const raw = player.metrics?.[label];
      if (typeof raw !== 'number' || Number.isNaN(raw)) return;
      values.push(raw);
      positions.push(finish);
      if (finish <= 10) top10Values.push(raw);
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
    tournament: tournamentSlug || null,
    courseType: courseType || null,
    generatedAt: new Date().toISOString(),
    metrics
  };
};

const writeMetricAnalysis = (outputDir, metricAnalysis) => {
  if (!metricAnalysis?.tournament) return null;
  ensureDirectory(outputDir);
  const baseName = `${metricAnalysis.tournament}_metric_analysis`;
  const jsonPath = path.resolve(outputDir, `${baseName}.json`);
  const csvPath = path.resolve(outputDir, `${baseName}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(metricAnalysis, null, 2));

  const lines = ['metric,top10_avg,field_avg,delta,correlation,top10_count,field_count'];
  metricAnalysis.metrics.forEach(entry => {
    lines.push([
      entry.metric,
      entry.top10Avg.toFixed(6),
      entry.fieldAvg.toFixed(6),
      entry.delta.toFixed(6),
      entry.correlation.toFixed(6),
      entry.top10Count,
      entry.fieldCount
    ].join(','));
  });
  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const writeCourseTypeClassification = (outputDir, classification) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.courseTypeClassification}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.courseTypeClassification}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(classification, null, 2));

  const lines = ['tournament,eventId,courseType,source'];
  classification.entries.forEach(entry => {
    lines.push(`${entry.tournament},${entry.eventId || ''},${entry.courseType || ''},${entry.source || ''}`);
  });
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

const writeCorrelationSummary = (outputDir, name, metrics) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${name}.json`);
  const csvPath = path.resolve(outputDir, `${name}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify({ metrics, generatedAt: new Date().toISOString() }, null, 2));

  const lines = ['metric,avg_delta,avg correlation,tournament_count'];
  metrics.forEach(entry => {
    lines.push(`${entry.metric},${entry.avgDelta.toFixed(6)},${entry.avgCorrelation.toFixed(6)},${entry.samples}`);
  });
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

const writeWeightCalibrationGuide = (outputDir, summariesByType, templatesByType) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightCalibrationGuide}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightCalibrationGuide}.csv`);

  const guide = {
    generatedAt: new Date().toISOString(),
    types: {}
  };

  const lines = ['type,metric,template_weight,recommended_weight,avg_correlation,group'];

  ['POWER', 'TECHNICAL', 'BALANCED'].forEach(type => {
    const summary = summariesByType[type] || [];
    const template = templatesByType[type] || null;
    const recommended = buildRecommendedWeights(summary, template);
    guide.types[type] = recommended;
    recommended.forEach(entry => {
      lines.push([
        type,
        entry.metric,
        entry.templateWeight.toFixed(6),
        entry.recommendedWeight.toFixed(6),
        (entry.correlation || 0).toFixed(6),
        entry.group
      ].join(','));
    });
  });

  fs.writeFileSync(jsonPath, JSON.stringify(guide, null, 2));
  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const writeWeightTemplatesOutput = (outputDir, summariesByType, templatesByType) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightTemplates}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.weightTemplates}.csv`);

  const output = {
    generatedAt: new Date().toISOString(),
    templates: {}
  };
  const lines = ['type,metric,template_weight,recommended_weight'];

  ['POWER', 'TECHNICAL', 'BALANCED'].forEach(type => {
    const summary = summariesByType[type] || [];
    const template = templatesByType[type] || null;
    const recommended = buildRecommendedWeights(summary, template);
    output.templates[type] = recommended.reduce((acc, entry) => {
      acc[entry.metric] = {
        templateWeight: entry.templateWeight,
        recommendedWeight: entry.recommendedWeight,
        correlation: entry.correlation
      };
      lines.push([type, entry.metric, entry.templateWeight.toFixed(6), entry.recommendedWeight.toFixed(6)].join(','));
      return acc;
    }, {});
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
    if (key.toLowerCase().includes('model')) {
      const cleaned = key.replace(/\s*-\s*model$/i, '').replace(/_model$/i, '').replace(/model$/i, '').trim();
      const baseKey = keys.find(candidate => normalizeHeader(candidate) === normalizeHeader(cleaned));
      if (baseKey) {
        pairs.push({ base: baseKey, model: key });
      }
    }
  });

  const deltas = {};
  resultsPayload.forEach(row => {
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

const buildModelDeltaTrends = ({ resultsJsonPath }) => {
  const payload = readJsonFile(resultsJsonPath);
  const rows = Array.isArray(payload) ? payload : payload?.results || payload?.resultsCurrent;
  const deltas = extractModelDeltasFromResults(Array.isArray(rows) ? rows : []);
  const metrics = [];

  Object.entries(deltas).forEach(([metric, values]) => {
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
  return { generatedAt: new Date().toISOString(), metrics };
};

const writeModelDeltaTrends = (outputDir, modelDeltaTrends) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.modelDeltaTrends}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.modelDeltaTrends}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(modelDeltaTrends, null, 2));

  const lines = ['metric,count,mean_delta,mean_abs_delta,std_dev,bias_z,over_pct,under_pct,status'];
  modelDeltaTrends.metrics.forEach(entry => {
    lines.push([
      entry.metric,
      entry.count,
      entry.meanDelta.toFixed(6),
      entry.meanAbsDelta.toFixed(6),
      entry.stdDev.toFixed(6),
      entry.biasZ.toFixed(3),
      entry.overPct.toFixed(1),
      entry.underPct.toFixed(1),
      entry.status
    ].join(','));
  });
  fs.writeFileSync(csvPath, lines.join('\n'));
  return { jsonPath, csvPath };
};

const writeProcessingLog = (outputDir, details) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.processingLog}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    ...details
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

const writeCalibrationReport = (outputDir, calibrationData) => {
  ensureDirectory(outputDir);
  const jsonPath = path.resolve(outputDir, `${OUTPUT_NAMES.calibrationReport}.json`);
  const csvPath = path.resolve(outputDir, `${OUTPUT_NAMES.calibrationReport}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(calibrationData, null, 2));

  const lines = [];
  lines.push('Section,Metric,Value,Count');
  const top5Pct = calibrationData.totalTop5 > 0
    ? (calibrationData.predictedTop5InTop20 / calibrationData.totalTop5) * 100
    : 0;
  const top10Pct = calibrationData.totalTop10 > 0
    ? (calibrationData.predictedTop10InTop30 / calibrationData.totalTop10) * 100
    : 0;

  lines.push(`Winner Accuracy,Top 5 finishers in Top 20 predictions,${top5Pct.toFixed(1)}%,${calibrationData.predictedTop5InTop20}/${calibrationData.totalTop5}`);
  lines.push(`Winner Accuracy,Top 10 finishers in Top 30 predictions,${top10Pct.toFixed(1)}%,${calibrationData.predictedTop10InTop30}/${calibrationData.totalTop10}`);

  calibrationData.tournaments.forEach(tournament => {
    lines.push(`Tournament,${tournament.name},,`);
    lines.push('Tournament Detail,Top Finishers,Avg Miss (Top 5),Top 5 Accuracy');
    const top5 = tournament.topFinishers.filter(entry => entry.actualFinish <= 5);
    const top5Pred = top5.filter(entry => entry.predictedRank <= 20).length;
    const top5Acc = top5.length > 0 ? (top5Pred / top5.length) * 100 : 0;
    lines.push(`Tournament Detail,${tournament.topFinishers.length},${tournament.accuracyMetrics.avgMissTop5.toFixed(1)},${top5Acc.toFixed(0)}%`);
  });

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
    eventId: eventIdStr,
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
  legacyResultsJsonPath,
  legacyResultsCsvPath,
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

  if (resultsJsonPath && fs.existsSync(resultsJsonPath)) {
    if (resolvedResultsCsvPath && !fs.existsSync(resolvedResultsCsvPath)) {
      const payload = readJsonFile(resultsJsonPath);
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
    return { pathWritten, rows };
  };

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
  const inputsDir = resolvedTournamentDir ? path.resolve(resolvedTournamentDir, 'inputs') : null;
  const preEventDir = resolvedTournamentDir ? path.resolve(resolvedTournamentDir, 'pre_event') : null;
  const postEventDir = resolvedTournamentDir ? path.resolve(resolvedTournamentDir, 'post_event') : null;
  const rankingsJsonPath = preEventDir ? path.resolve(preEventDir, `optimizer_${resolvedSlug}_pre_event_rankings.json`) : null;
  const rankingsCsvPath = preEventDir ? path.resolve(preEventDir, `optimizer_${resolvedSlug}_pre_event_rankings.csv`) : null;
  const resultsBaseName = resolvedSlug || slugifyTournament(tournamentName) || 'tournament';
  const resultsJsonPath = postEventDir ? path.resolve(postEventDir, `${resultsBaseName}_results.json`) : null;
  const resultsCsvPath = postEventDir ? path.resolve(postEventDir, `${resultsBaseName}_results.csv`) : null;
  const legacyResultsJsonPath = postEventDir ? path.resolve(postEventDir, 'tournament_results.json') : null;
  const legacyResultsCsvPath = postEventDir ? path.resolve(postEventDir, 'tournament_results.csv') : null;
  const historyCsvPath = inputsDir && resolvedSlug
    ? path.resolve(inputsDir, `${tournamentName || resolvedSlug} (${season}) - Historical Data.csv`)
    : null;
  const configCsvPath = inputsDir && resolvedSlug
    ? path.resolve(inputsDir, `${tournamentName || resolvedSlug} (${season}) - Configuration Sheet.csv`)
    : null;
  const courseContextPath = path.resolve(__dirname, '..', 'utilities', 'course_context.json');
  const skipMetricAnalysis = resolvedSlug ? shouldSkipMetricAnalysis(outputDir, resolvedSlug) : false;

  logger.log(`ℹ️  Validation runner initialized (season=${season}, outputDir=${outputDir})`);
  if (skipMetricAnalysis) {
    logger.log(`ℹ️  Skipping metric analysis for ${resolvedSlug} (already exists).`);
  }

  const config = loadTournamentConfig({
    configCsvPath,
    courseContextPath,
    eventId
  });

  await ensureTournamentResults({
    resultsJsonPath,
    resultsCsvPath,
    legacyResultsJsonPath,
    legacyResultsCsvPath,
    rankingsCsvPath,
    historyCsvPath,
    eventId: config.eventId || eventId,
    season,
    tournamentName: tournamentName || resolvedSlug,
    logger
  });

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
  const calibration = buildCalibrationData({
    tournamentName: tournamentName || resolvedSlug,
    predictions: predictionsResult.predictions,
    results: resultsResult.results
  });
  const calibrationOutputs = writeCalibrationReport(outputDir, calibration);

  const courseType = config.courseType || null;
  const courseTypeSource = config.source || null;
  const classificationPayload = {
    generatedAt: new Date().toISOString(),
    entries: [
      {
        tournament: resolvedSlug || tournamentName || 'tournament',
        eventId: config.eventId || eventId || null,
        courseType: courseType,
        source: courseTypeSource
      }
    ]
  };
  const classificationOutputs = writeCourseTypeClassification(outputDir, classificationPayload);

  let metricAnalysis = null;
  let metricAnalysisOutputs = null;
  if (!skipMetricAnalysis && resolvedSlug) {
    metricAnalysis = buildMetricAnalysis({
      rankingsCsvPath,
      results: resultsResult.results,
      tournamentSlug: resolvedSlug,
      courseType
    });
    metricAnalysisOutputs = writeMetricAnalysis(outputDir, metricAnalysis);
  }

  const existingMetricAnalyses = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir)
        .filter(name => name.endsWith('_metric_analysis.json'))
        .map(name => readJsonFile(path.resolve(outputDir, name)))
        .filter(Boolean)
    : [];

  const byType = {
    POWER: existingMetricAnalyses.filter(entry => entry?.courseType === 'POWER'),
    TECHNICAL: existingMetricAnalyses.filter(entry => entry?.courseType === 'TECHNICAL'),
    BALANCED: existingMetricAnalyses.filter(entry => entry?.courseType === 'BALANCED')
  };

  const correlationSummaries = {
    POWER: writeCorrelationSummary(outputDir, OUTPUT_NAMES.powerCorrelationSummary, buildCorrelationSummary(byType.POWER)),
    TECHNICAL: writeCorrelationSummary(outputDir, OUTPUT_NAMES.technicalCorrelationSummary, buildCorrelationSummary(byType.TECHNICAL)),
    BALANCED: writeCorrelationSummary(outputDir, OUTPUT_NAMES.balancedCorrelationSummary, buildCorrelationSummary(byType.BALANCED))
  };

  const summariesByType = {
    POWER: buildCorrelationSummary(byType.POWER),
    TECHNICAL: buildCorrelationSummary(byType.TECHNICAL),
    BALANCED: buildCorrelationSummary(byType.BALANCED)
  };
  const templatesByType = {
    POWER: WEIGHT_TEMPLATES?.POWER || null,
    TECHNICAL: WEIGHT_TEMPLATES?.TECHNICAL || null,
    BALANCED: WEIGHT_TEMPLATES?.BALANCED || null
  };

  const weightCalibrationOutputs = writeWeightCalibrationGuide(outputDir, summariesByType, templatesByType);
  const weightTemplatesOutputs = writeWeightTemplatesOutput(outputDir, summariesByType, templatesByType);

  const modelDeltaTrends = buildModelDeltaTrends({ resultsJsonPath });
  const modelDeltaTrendOutputs = writeModelDeltaTrends(outputDir, modelDeltaTrends);

  const processingLog = writeProcessingLog(outputDir, {
    tournament: resolvedSlug || tournamentName || null,
    eventId: config.eventId || eventId || null,
    season,
    skipMetricAnalysis,
    inputs: {
      rankingsJsonPath,
      rankingsCsvPath,
      resultsJsonPath,
      historyCsvPath,
      configCsvPath
    }
  });

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
    calibration,
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
  runValidation
};
