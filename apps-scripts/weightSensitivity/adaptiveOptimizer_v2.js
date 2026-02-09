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

const { loadCsv } = require('./utilities/csvLoader');
const { buildPlayerData } = require('./utilities/dataPrep');
const { generatePlayerRankings, cleanMetricValue } = require('./modelCore');
const { getSharedConfig } = require('./utilities/configParser');
const { buildMetricGroupsFromConfig } = require('./metricConfigBuilder');
const { WEIGHT_TEMPLATES } = require('./utilities/weightTemplates');

const DATA_DIR = __dirname;
const DEFAULT_DATA_DIR = path.resolve(__dirname, 'data');
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// Parse CLI arguments
const args = process.argv.slice(2);
let TEMPLATE = null;
let OVERRIDE_EVENT_ID = null;
let OVERRIDE_SEASON = null;
let TOURNAMENT_NAME = null;
let DRY_RUN = true;

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
  if (args[i] === '--writeTemplates') {
    DRY_RUN = false;
  }
  if (args[i] === '--dryRun' || args[i] === '--dry-run') {
    DRY_RUN = true;
  }
}

console.log('---');
console.log('ADAPTIVE WEIGHT OPTIMIZER v2');
console.log('---');

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

    const metrics = {
      scoringAverage: row.score ? cleanMetricValue(row.score) : null,
      eagles: row.eagles_or_better ? cleanMetricValue(row.eagles_or_better) : null,
      birdies: row.birdies ? cleanMetricValue(row.birdies) : null,
      birdiesOrBetter: (row.birdies || row.eagles_or_better)
        ? cleanMetricValue(row.birdies) + cleanMetricValue(row.eagles_or_better)
        : null,
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
      greatShots: row.great_shots ? cleanMetricValue(row.great_shots) : null,
      poorShots: row.poor_shots ? cleanMetricValue(row.poor_shots) : null,
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

function normalizeGeneratedMetricLabel(metricLabel) {
  return String(metricLabel || '')
    .replace(/^(Scoring|Course Management):\s*/i, '')
    .trim();
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
  const matches = actualResults.filter(a => topN.has(String(a.dgId))).length;
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
  const { includeTopN = true } = options;
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

  return {
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

  if (hasFlat) {
    const nested = {};
    keys.forEach(key => {
      if (typeof metricWeights[key] !== 'number') return;
      const [groupName, metricName] = key.split('::');
      if (!groupName || !metricName) return;
      if (!nested[groupName]) nested[groupName] = {};
      nested[groupName][metricName] = { weight: metricWeights[key] };
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
        nested[groupName][metricName] = { weight: metricConfig.weight };
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

function deriveResultsFromHistory(rawHistoryData, eventId, season = null) {
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

    if (!resultsByPlayer[dgId] || finishPosition < resultsByPlayer[dgId]) {
      resultsByPlayer[dgId] = finishPosition;
    }
  });

  return Object.entries(resultsByPlayer).map(([dgId, finishPosition]) => ({ dgId, finishPosition }));
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
      const adjustment = (Math.random() * 2 - 1) * maxAdjustment;
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

function upsertTemplateInFile(filePath, template, options = {}) {
  const { replaceByEventId = false, dryRun = false } = options;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const marker = 'const WEIGHT_TEMPLATES = {';
    const markerIndex = fileContent.indexOf(marker);
    if (markerIndex === -1) return { updated: false, content: null };

    const findTemplateBlocks = () => {
      const blocks = [];
      let i = markerIndex + marker.length;
      let depth = 0;
      let inString = false;
      let stringChar = '';
      let keyStart = null;
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
            blocks.push({ key, start: entryStart, end: entryEnd });
            key = null;
            entryStart = null;
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
            while (j < fileContent.length && /[A-Za-z0-9_]/.test(fileContent[j])) j += 1;
            const possibleKey = fileContent.slice(keyStart, j);
            const afterKey = fileContent.slice(j).trimStart();
            if (afterKey.startsWith(':')) {
              key = possibleKey;
            }
          }
        }

        i += 1;
      }

      return blocks;
    };

    const blocks = findTemplateBlocks();
    let targetKey = template.name;
    let targetBlock = null;

    if (replaceByEventId) {
      const eventIdValue = String(template.eventId);
      const eventIdRegex = new RegExp(`eventId\\s*:\\s*['\"]${eventIdValue}['\"]`);
      for (const block of blocks) {
        const blockContent = fileContent.slice(block.start, block.end);
        if (eventIdRegex.test(blockContent)) {
          targetKey = block.key;
          targetBlock = block;
          break;
        }
      }
    } else {
      targetBlock = blocks.find(block => block.key === targetKey) || null;
    }

    const templateForWrite = { ...template, name: targetKey };
    const templateString = JSON.stringify({ __KEY__: templateForWrite }, null, 2)
      .replace(/^\{\n|\n\}$/g, '')
      .replace(/\n  /g, '\n  ')
      .replace(/"weight":/g, 'weight:');

    const templateWithKey = templateString.replace('__KEY__', targetKey).trim();
    let updatedContent;

    if (targetBlock) {
      const objectOnly = templateWithKey.slice(templateWithKey.indexOf('{'));
      updatedContent = fileContent.slice(0, targetBlock.start) + objectOnly + fileContent.slice(targetBlock.end);
    } else {
      const insertAt = fileContent.indexOf('};', markerIndex);
      if (insertAt === -1) return { updated: false, content: null };
      updatedContent = fileContent.slice(0, insertAt) + `,\n  ${templateWithKey}` + fileContent.slice(insertAt);
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

const CONFIG_PATH = resolveDataFile('Sony Open (2026) - Configuration Sheet.csv');
const FIELD_PATH = resolveDataFile('Sony Open (2026) - Tournament Field.csv');
const HISTORY_PATH = resolveDataFile('Sony Open (2026) - Historical Data.csv');
const APPROACH_PATH = resolveDataFile('Sony Open (2026) - Approach Skill.csv');
const RESULTS_PATH = resolveDataFile('Sony Open (2026) - Tournament Results.csv');

function runAdaptiveOptimizer() {
  const requiredFiles = [
    { name: 'Configuration Sheet', path: CONFIG_PATH },
    { name: 'Tournament Field', path: FIELD_PATH },
    { name: 'Historical Data', path: HISTORY_PATH },
    { name: 'Approach Skill', path: APPROACH_PATH }
  ];

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

  const CURRENT_EVENT_ID = OVERRIDE_EVENT_ID;
  const CURRENT_SEASON = OVERRIDE_SEASON ?? parseInt(sharedConfig.currentSeason || sharedConfig.currentYear || 2026);
  
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
    if (['POWER', 'BALANCED', 'TECHNICAL'].includes(templateName) || template.eventId === String(CURRENT_EVENT_ID)) {
      const normalized = normalizeTemplateWeights(template, baseMetricConfig);
      templateConfigs[templateName] = normalized;
      console.log(`✓ Loaded ${templateName} template`);
    }
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

  console.log('\n🔄 Loading data...');
  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded field: ${fieldData.length} players`);
  
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded history: ${historyData.length} rounds`);
  
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });
  console.log(`✓ Loaded approach: ${approachData.length} rows`);

  // Load actual results from a dedicated results file
  function loadActualResults(resultsPath) {
    const rawData = loadCsv(resultsPath, { skipFirstColumn: true });
    const results = [];
    rawData.forEach(row => {
      const dgId = String(row['DG ID'] || '').trim();
      if (!dgId) return;
      const finishPosition = parseFinishPosition(row['Finish Position']);
      if (finishPosition && !Number.isNaN(finishPosition)) {
        results.push({ dgId, finishPosition });
      }
    });
    return results;
  }

  const resultsFileExists = fs.existsSync(RESULTS_PATH);
  const resultsCurrent = resultsFileExists
    ? loadActualResults(RESULTS_PATH)
    : deriveResultsFromHistory(historyData, CURRENT_EVENT_ID, CURRENT_SEASON);

  if (resultsFileExists) {
    console.log(`✓ Loaded ${resultsCurrent.length} current season results`);
  } else {
    console.log(`⚠️  Results file not found. Derived ${resultsCurrent.length} results from historical data.`);
  }

  if (resultsCurrent.length === 0) {
    console.error('\n❌ No results found for the current season/event.');
    console.error('   Check that Historical Data contains fin_text for the selected season and event_id.');
    process.exit(1);
  }

  const field2026DgIds = new Set(fieldData.map(p => String(p['dg_id'] || '').trim()));
  console.log(`✓ Loaded 2026 field: ${field2026DgIds.size} players\n`);

  const runtimeConfig = {
    similarCoursesWeight: sharedConfig.similarCoursesWeight,
    puttingCoursesWeight: sharedConfig.puttingCoursesWeight,
    courseSetupWeights: sharedConfig.courseSetupWeights
  };

  const runRanking = ({ roundsRawData, approachRawData, groupWeights, metricWeights }) => {
    const playerData = buildPlayerData({
      fieldData,
      roundsRawData,
      approachRawData,
      currentEventId: CURRENT_EVENT_ID
    });

    const templateGroups = buildModifiedGroups(
      metricConfig.groups,
      groupWeights,
      metricWeights
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

  // =========================================================================
  // STEP 1: HISTORICAL METRIC CORRELATIONS + CURRENT-YEAR TEMPLATE BASELINE
  // =========================================================================
  console.log('---');
  console.log('STEP 1: HISTORICAL METRIC CORRELATIONS');
  console.log('Analyze past-year metrics vs finish position');
  console.log('---');

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
  console.log(`✓ Total historical rounds for event ${CURRENT_EVENT_ID}: ${historicalDataForField.length}\n`);

  const historicalMetricSamples = buildHistoricalMetricSamples(historicalDataForField, CURRENT_EVENT_ID);
  const historicalMetricCorrelations = computeHistoricalMetricCorrelations(historicalMetricSamples);

  console.log('---');
  console.log('STEP 1b: CURRENT-SEASON METRIC CORRELATIONS');
  console.log('Correlate generatePlayerRankings metrics for current season');
  console.log('---');

  const currentSeasonRounds = roundsByYear[CURRENT_SEASON] || [];
  let currentGeneratedMetricCorrelations = [];
  let currentGeneratedCorrelationMap = new Map();

  if (currentSeasonRounds.length > 0) {
    const currentTemplate = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    if (!currentTemplate) {
      console.warn('⚠️  No template available for current-season metric correlations.');
    } else {
    const currentRankingForMetrics = runRanking({
      roundsRawData: currentSeasonRounds,
      approachRawData: approachData,
      groupWeights: currentTemplate.groupWeights,
      metricWeights: currentTemplate.metricWeights
    });
    currentGeneratedMetricCorrelations = computeGeneratedMetricCorrelations(currentRankingForMetrics.players, resultsCurrent);
    currentGeneratedCorrelationMap = new Map(
      currentGeneratedMetricCorrelations.map(entry => [normalizeGeneratedMetricLabel(entry.label), entry.correlation])
    );
    console.log(`✓ Computed ${currentGeneratedMetricCorrelations.length} metric correlations for ${CURRENT_SEASON}`);
    }
  } else {
    console.warn(`⚠️  No ${CURRENT_SEASON} rounds found; skipping current-season metric correlations.`);
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
        metricWeights: config.metricWeights
      });

      perYear[year] = evaluateRankings(ranking.players, results, { includeTopN: useApproach });
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
      const top20Text = typeof currentEvaluation.top20 === 'number' ? `${currentEvaluation.top20.toFixed(1)}%` : 'n/a';
      const top20WeightedText = typeof currentEvaluation.top20WeightedScore === 'number' ? `${currentEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
      console.log(`   Correlation: ${currentEvaluation.correlation.toFixed(4)}`);
      console.log(`   Top-20: ${top20Text}`);
      console.log(`   Top-20 Weighted Score: ${top20WeightedText}`);
    } else {
      console.log(`   No evaluation data for ${CURRENT_SEASON}`);
    }
  }

  const bestTemplate = [...templateResults].sort((a, b) => {
    const evalA = a.evaluationCurrent;
    const evalB = b.evaluationCurrent;

    if (!evalA && !evalB) {
      return (b.evaluation?.correlation || 0) - (a.evaluation?.correlation || 0);
    }
    if (!evalA) return 1;
    if (!evalB) return -1;

    if (evalB.correlation !== evalA.correlation) {
      return evalB.correlation - evalA.correlation;
    }

    const aTop20 = typeof evalA.top20 === 'number' ? evalA.top20 : -Infinity;
    const bTop20 = typeof evalB.top20 === 'number' ? evalB.top20 : -Infinity;
    return bTop20 - aTop20;
  })[0];

  const baselineEvaluation = bestTemplate.evaluationCurrent || bestTemplate.evaluation;

  console.log('---');
  console.log('BEST BASELINE TEMPLATE (CURRENT YEAR)');
  console.log('---');

  const baselineTop20 = typeof baselineEvaluation.top20 === 'number' ? `${baselineEvaluation.top20.toFixed(1)}%` : 'n/a';
  const baselineTop20Weighted = typeof baselineEvaluation.top20WeightedScore === 'number' ? `${baselineEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';

  console.log(`\n✅ Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  console.log(`   Top-20: ${baselineTop20}`);
  console.log(`   Top-20 Weighted Score: ${baselineTop20Weighted}\n`);

  // ============================================================================
  // STEP 3: WEIGHT OPTIMIZATION (with 2026 approach metrics)
  // ============================================================================
  console.log('---');
  console.log('STEP 3: WEIGHT OPTIMIZATION');
  console.log('Randomized search starting from best template baseline');
  console.log(resultsFileExists
    ? 'Using current season results for optimization'
    : 'Using multi-year historical results for optimization');
  console.log('---');

  // Random search from best template
  console.log(`🔄 Grid search optimization from ${bestTemplate.name} baseline...`);
  console.log(`   Starting correlation: ${baselineEvaluation.correlation.toFixed(4)}`);

  const GROUP_GRID_RANGE = 0.20;
  const METRIC_GRID_RANGE = 0.15;
  const MAX_TESTS = 1500;
  const optimizedResults = [];
  
  for (let i = 0; i < MAX_TESTS; i++) {
    const weights = { ...bestTemplate.groupWeights };
    const groupNames = Object.keys(weights);
    const numAdjust = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < numAdjust; j++) {
      const groupName = groupNames[Math.floor(Math.random() * groupNames.length)];
      const adjustment = (Math.random() * 2 - 1) * GROUP_GRID_RANGE;
      weights[groupName] = Math.max(0.001, weights[groupName] * (1 + adjustment));
    }

    const normalizedWeights = normalizeWeights(weights);
    const adjustedMetricWeights = adjustMetricWeights(bestTemplate.metricWeights, metricConfig, METRIC_GRID_RANGE);

    let evaluation;
    if (resultsFileExists) {
      const ranking = runRanking({
        roundsRawData: roundsByYear[CURRENT_SEASON] || historicalDataForField,
        approachRawData: approachData,
        groupWeights: normalizedWeights,
        metricWeights: adjustedMetricWeights
      });
      evaluation = evaluateRankings(ranking.players, resultsCurrent, { includeTopN: true });
    } else {
      const yearly = {};
      availableYears.forEach(year => {
        const rounds = roundsByYear[year] || [];
        const results = resultsByYear[year] || [];
        if (rounds.length === 0 || results.length === 0) return;
        const ranking = runRanking({
          roundsRawData: rounds,
          approachRawData: approachData,
          groupWeights: normalizedWeights,
          metricWeights: adjustedMetricWeights
        });
        yearly[year] = evaluateRankings(ranking.players, results, { includeTopN: String(year) === String(CURRENT_SEASON) });
      });
      evaluation = aggregateYearlyEvaluations(yearly);
    }

    const alignmentScore = currentGeneratedCorrelationMap.size > 0
      ? computeMetricAlignmentScore(adjustedMetricWeights, normalizedWeights, currentGeneratedCorrelationMap)
      : 0;

    optimizedResults.push({
      weights: normalizedWeights,
      metricWeights: adjustedMetricWeights,
      alignmentScore,
      ...evaluation
    });
    
    if ((i + 1) % 100 === 0) {
      console.log(`   Tested ${i + 1}/${MAX_TESTS}...`);
    }
  }
  
  optimizedResults.sort((a, b) => {
    const scoreDiff = (b.alignmentScore || 0) - (a.alignmentScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return b.correlation - a.correlation;
  });
  const bestOptimized = optimizedResults[0];
  
  console.log(`\n✅ Best Optimized: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`   Metric Alignment Score: ${bestOptimized.alignmentScore.toFixed(4)}`);
  console.log(`   Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  const optimizedTop20Text = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const optimizedTop20WeightedText = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';
  console.log(`   Top-20: ${optimizedTop20Text}`);
  console.log(`   Top-20 Weighted Score: ${optimizedTop20WeightedText}\n`);

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
      metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights
    });

    const evaluation = evaluateRankings(ranking.players, resultsByYear[year] || resultsCurrent, { includeTopN: useApproach });
    multiYearResults[year] = evaluation;
    
    const top20Text = typeof evaluation.top20 === 'number' ? `${evaluation.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `${evaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`     Correlation: ${evaluation.correlation.toFixed(4)} | Top-20: ${top20Text} | Top-20 Weighted: ${top20WeightedText}`);
  }

  // ============================================================================
  // FINAL RESULTS
  // ============================================================================
  console.log('---');
  console.log('FINAL SUMMARY');
  console.log('---');

  console.log('\nBaseline Template Analysis (Current Year):');
  console.log(`  Best Template: ${bestTemplate.name}`);
  console.log(`  Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  const bestTemplateTop20 = typeof baselineEvaluation.top20 === 'number' ? `${baselineEvaluation.top20.toFixed(1)}%` : 'n/a';
  const bestTemplateTop20Weighted = typeof baselineEvaluation.top20WeightedScore === 'number' ? `${baselineEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
  console.log(`  Top-20: ${bestTemplateTop20}`);
  console.log(`  Top-20 Weighted Score: ${bestTemplateTop20Weighted}`);

  console.log('\nOptimized Results (2026):');
  console.log(`  Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`  Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  const bestOptimizedTop20 = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const bestOptimizedTop20Weighted = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';
  console.log(`  Top-20: ${bestOptimizedTop20}`);
  console.log(`  Top-20 Weighted Score: ${bestOptimizedTop20Weighted}`);

  console.log('\nMulti-Year Validation:');
  Object.entries(multiYearResults).forEach(([year, evalResult]) => {
    const top20Text = typeof evalResult.top20 === 'number' ? `${evalResult.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evalResult.top20WeightedScore === 'number' ? `${evalResult.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-20=${top20Text} | Top-20 Weighted=${top20WeightedText}`);
  });

  // Summary output
  console.log('---');
  console.log('📊 FINAL SUMMARY');
  console.log('---');

  console.log(`\n🏆 Step 1: Current-Year Baseline (${CURRENT_SEASON})`);
  console.log(`   Best Template: ${bestTemplate.name}`);
  console.log(`   Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  console.log(`   Top-20 Accuracy: ${bestTemplateTop20}`);
  console.log(`   Top-20 Weighted Score: ${bestTemplateTop20Weighted}`);
  console.log(`   Matched Players: ${baselineEvaluation.matchedPlayers}`);

  console.log('\n🎯 Step 3: Weight Optimization (2026 with approach metrics)');
  console.log(`   Best Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  console.log(`   Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  console.log(`   Top-20 Accuracy: ${bestOptimizedTop20}`);
  console.log(`   Top-20 Weighted Score: ${bestOptimizedTop20Weighted}`);
  console.log(`   Matched Players: ${bestOptimized.matchedPlayers}`);

  console.log(`   Baseline Template: ${bestTemplate.name}`);
  console.log('   Baseline Group Weights:');
  Object.entries(bestTemplate.groupWeights).forEach(([metric, weight]) => {
    console.log(`     ${metric}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n📈 Optimized Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    console.log(`   ${metric}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n📌 Weight Changes vs Baseline:');
  const weightDeltas = computeWeightDeltas(bestTemplate.groupWeights, bestOptimized.weights);
  Object.entries(weightDeltas).forEach(([metric, info]) => {
    const deltaPct = info.deltaPct === null ? 'n/a' : `${(info.deltaPct * 100).toFixed(1)}%`;
    console.log(`   ${metric}: ${(info.delta * 100).toFixed(1)}% (${deltaPct})`);
  });

  console.log('\n✓ Step 4: Multi-Year Validation Results');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    const top20Text = typeof result.top20 === 'number' ? `${result.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `${result.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`   ${year}: Correlation=${result.correlation.toFixed(4)}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}, Players=${result.matchedPlayers}`);
  });

  console.log('\n💡 Recommendation:');
  const improvement = bestOptimized.correlation - baselineEvaluation.correlation;
  if (improvement > 0.01) {
    console.log(`   ✅ Use optimized weights - shows ${(improvement).toFixed(4)} improvement`);
  } else if (improvement > 0) {
    console.log(`   ⚠️  Marginal improvement of ${(improvement).toFixed(4)} - consider template baseline`);
  } else {
    console.log(`   ❌ No improvement - stick with ${bestTemplate.name} template`);
  }

  console.log('\n' + '='.repeat(100) + '\n');

  // Also save results to JSON
  const output = {
    timestamp: new Date().toISOString(),
    eventId: CURRENT_EVENT_ID,
    tournament: TOURNAMENT_NAME || 'Sony Open',
    dryRun: DRY_RUN,
    historicalMetricCorrelations,
    currentGeneratedMetricCorrelations,
    availableYears,
    roundsByYearSummary: Object.fromEntries(Object.entries(roundsByYear).map(([year, rounds]) => [year, rounds.length])),
    resultsByYearSummary: Object.fromEntries(Object.entries(resultsByYear).map(([year, results]) => [year, results.length])),
    resultsCurrent,
    rawTemplateResults: templateResults,
    rawTemplateResultsCurrentYear: templateResults.map(result => ({
      name: result.name === String(CURRENT_EVENT_ID) ? 'CONFIGURATION_SHEET' : result.name,
      evaluation: result.yearly[CURRENT_SEASON] || null
    })),
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
      groupWeights: bestOptimized.weights,
      metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights,
      alignmentScore: bestOptimized.alignmentScore,
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

  const outputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const textLines = [];
  textLines.push('='.repeat(100));
  textLines.push('ADAPTIVE WEIGHT OPTIMIZER - FINAL RESULTS');
  textLines.push('='.repeat(100));
  textLines.push(`DRY RUN: ${DRY_RUN ? 'ON (template files not modified)' : 'OFF (templates written)'}`);
  textLines.push('');
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
  textLines.push(`CURRENT-SEASON GENERATED METRIC CORRELATIONS (${CURRENT_SEASON}):`);
  if (currentGeneratedMetricCorrelations.length === 0) {
    textLines.push(`  No ${CURRENT_SEASON} metric correlations computed.`);
  } else {
    currentGeneratedMetricCorrelations.forEach(entry => {
      textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push(`STEP 1: CURRENT-YEAR BASELINE (${CURRENT_SEASON})`);
  textLines.push(`Best Template: ${bestTemplate.name}`);
  textLines.push(`Correlation: ${baselineEvaluation.correlation.toFixed(4)}`);
  textLines.push(`R²: ${baselineEvaluation.rSquared.toFixed(4)}`);
  textLines.push(`RMSE: ${baselineEvaluation.rmse.toFixed(2)}`);
  textLines.push(`MAE: ${baselineEvaluation.mae.toFixed(2)}`);
  textLines.push(`Mean Error: ${baselineEvaluation.meanError.toFixed(2)}`);
  textLines.push(`Std Dev Error: ${baselineEvaluation.stdDevError.toFixed(2)}`);
  textLines.push(`Top-20 Accuracy: ${typeof baselineEvaluation.top20 === 'number' ? `${baselineEvaluation.top20.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Top-20 Weighted Score: ${typeof baselineEvaluation.top20WeightedScore === 'number' ? `${baselineEvaluation.top20WeightedScore.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Matched Players: ${baselineEvaluation.matchedPlayers}`);
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
  textLines.push('RESULTS CURRENT (derived/loaded):');
  resultsCurrent.forEach(result => {
    textLines.push(`  ${result.dgId}: ${result.finishPosition}`);
  });
  textLines.push('');
  textLines.push('STEP 3: WEIGHT OPTIMIZATION (2026 with approach metrics)');
  textLines.push(`Baseline Template: ${bestTemplate.name}`);
  textLines.push(`Best Correlation: ${bestOptimized.correlation.toFixed(4)}`);
  textLines.push(`Metric Alignment Score: ${bestOptimized.alignmentScore.toFixed(4)}`);
  textLines.push(`Best R²: ${bestOptimized.rSquared.toFixed(4)}`);
  textLines.push(`Best RMSE: ${bestOptimized.rmse.toFixed(2)}`);
  textLines.push(`Best MAE: ${bestOptimized.mae.toFixed(2)}`);
  textLines.push(`Best Mean Error: ${bestOptimized.meanError.toFixed(2)}`);
  textLines.push(`Best Std Dev Error: ${bestOptimized.stdDevError.toFixed(2)}`);
  textLines.push(`Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  textLines.push(`Top-20 Accuracy: ${typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Top-20 Weighted Score: ${typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a'}`);
  textLines.push(`Matched Players: ${bestOptimized.matchedPlayers}`);
  textLines.push('');
  textLines.push('Baseline Group Weights:');
  Object.entries(bestTemplate.groupWeights).forEach(([metric, weight]) => {
    textLines.push(`  ${metric}: ${(weight * 100).toFixed(1)}%`);
  });
  textLines.push('');
  textLines.push('Optimized Group Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    textLines.push(`  ${metric}: ${(weight * 100).toFixed(1)}%`);
  });
  textLines.push('');
  textLines.push('Weight Changes vs Baseline:');
  Object.entries(weightDeltas).forEach(([metric, info]) => {
    const deltaPct = info.deltaPct === null ? 'n/a' : `${(info.deltaPct * 100).toFixed(1)}%`;
    textLines.push(`  ${metric}: ${(info.delta * 100).toFixed(1)}% (${deltaPct})`);
  });
  textLines.push('');
  textLines.push('STEP 4: MULTI-YEAR VALIDATION (with 2026 approach metrics)');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    const top10Text = typeof result.top10 === 'number' ? `, Top-10=${result.top10.toFixed(1)}%` : '';
    const top20Text = typeof result.top20 === 'number' ? `, Top-20=${result.top20.toFixed(1)}%` : '';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `, Top-20 Weighted=${result.top20WeightedScore.toFixed(1)}%` : '';
    textLines.push(
      `  ${year}: Corr=${result.correlation.toFixed(4)}, R²=${result.rSquared.toFixed(4)}, RMSE=${result.rmse.toFixed(2)}, MAE=${result.mae.toFixed(2)}, Mean Err=${result.meanError.toFixed(2)}, Std Err=${result.stdDevError.toFixed(2)}${top10Text}${top20Text}${top20WeightedText}, Players=${result.matchedPlayers}`
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

  const textOutputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.txt');
  fs.writeFileSync(textOutputPath, textLines.join('\n'));

  const optimizedTop20Desc = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const optimizedTop20WeightedDesc = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';

  const optimizedTemplate = {
    name: TOURNAMENT_NAME ? `OPTIMIZED_${TOURNAMENT_NAME.toUpperCase().replace(/\s+/g, '_')}` : `OPTIMIZED_EVENT_${CURRENT_EVENT_ID}`,
    eventId: String(CURRENT_EVENT_ID),
    description: `${TOURNAMENT_NAME || 'Event'} ${CURRENT_SEASON || ''} Optimized: ${bestOptimized.correlation.toFixed(4)} corr, ${optimizedTop20Desc} Top-20, ${optimizedTop20WeightedDesc} Top-20 Weighted`,
    groupWeights: bestOptimized.weights,
    metricWeights: nestMetricWeights(bestOptimized.metricWeights || bestTemplate.metricWeights)
  };

  const writeBackTargets = [
    path.resolve(__dirname, 'utilities', 'weightTemplates.js'),
    path.resolve(__dirname, '..', 'Golf_Algorithm_Library', 'utilities', 'templateLoader.js')
  ];

  writeBackTargets.forEach(filePath => {
    const result = upsertTemplateInFile(filePath, optimizedTemplate, { replaceByEventId: true, dryRun: DRY_RUN });
    if (result.updated) {
      if (DRY_RUN && result.content) {
        const dryRunPath = path.resolve(OUTPUT_DIR, `dryrun_${path.basename(filePath)}`);
        fs.writeFileSync(dryRunPath, result.content, 'utf8');
        console.log(`🧪 Dry-run template output saved to: ${dryRunPath}`);
      } else {
        console.log(`✅ Template written to: ${filePath}`);
      }
    } else {
      console.warn(`⚠️  Template not written (unable to update): ${filePath}`);
    }
  });

  console.log(`✅ JSON results also saved to: output/adaptive_optimizer_v2_results.json`);
  console.log(`✅ Text results saved to: output/adaptive_optimizer_v2_results.txt\n`);
}

runAdaptiveOptimizer();

// Note: Text output functionality added via separate command
