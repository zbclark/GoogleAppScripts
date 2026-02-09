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
        weight: Math.abs(weight),
        logisticWeight: weight,
        top20Correlation: typeof corr === 'number' ? corr : null
      };
    });
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    const normalized = weights.map(entry => ({
      ...entry,
      weight: total > 0 ? entry.weight / total : 0
    }));
    return {
      source: 'top20-logistic',
      weights: normalized.sort((a, b) => b.weight - a.weight)
    };
  }

  if (Array.isArray(top20Signal) && top20Signal.length > 0) {
    const weights = top20Signal.map(entry => ({
      label: entry.label,
      weight: Math.abs(entry.correlation),
      logisticWeight: null,
      top20Correlation: entry.correlation
    }));
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    const normalized = weights.map(entry => ({
      ...entry,
      weight: total > 0 ? entry.weight / total : 0
    }));
    return {
      source: 'top20-signal',
      weights: normalized.sort((a, b) => b.weight - a.weight)
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
    groupTotals[groupName] = (groupTotals[groupName] || 0) + (entry.weight || 0);
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
    const predictedTop20 = sortedPredictions.slice(0, 20).map(p => String(p.dgId));
    const actualTop20 = actualResults
      .filter(result => result.finishPosition && !Number.isNaN(result.finishPosition) && result.finishPosition <= 20)
      .sort((a, b) => a.finishPosition - b.finishPosition)
      .map(result => String(result.dgId));
    const actualTop20Set = new Set(actualTop20);
    const overlap = predictedTop20.filter(id => actualTop20Set.has(id));
    evaluation.top20Details = {
      predicted: predictedTop20,
      actual: actualTop20,
      overlap,
      overlapCount: overlap.length
    };
  }

  return evaluation;
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
      .replace(/"weight":/g, 'weight:')
      .replace(/\{\s*weight:\s*([0-9.\-eE]+)\s*\}/g, '{ weight: $1 }');

    const templateWithKey = templateString.replace('__KEY__', templateForWrite.name).trim();
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
  let courseTemplateKey = null;
  
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

  const fallbackTemplateKey = normalizeTemplateKey(TOURNAMENT_NAME) || `EVENT_${CURRENT_EVENT_ID}`;
  const fieldCourseName = fieldData.find(row => row && (row.course_name || row.course))?.course_name
    || fieldData.find(row => row && (row.course_name || row.course))?.course
    || null;
  const historyCourseName = historyData.find(row => {
    const eventId = String(row['event_id'] || '').trim();
    if (eventId !== String(CURRENT_EVENT_ID)) return false;
    const season = parseInt(String(row['season'] || row['year'] || '').trim());
    if (Number.isNaN(season)) return false;
    return String(season) === String(CURRENT_SEASON) && row['course_name'];
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
    : deriveResultsFromHistory(historyData, CURRENT_EVENT_ID, CURRENT_SEASON, fieldNameLookup);

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

  const runRanking = ({ roundsRawData, approachRawData, groupWeights, metricWeights, includeCurrentEventRounds = false }) => {
    const playerData = buildPlayerData({
      fieldData,
      roundsRawData,
      approachRawData,
      currentEventId: CURRENT_EVENT_ID,
      currentSeason: CURRENT_SEASON,
      includeCurrentEventRounds
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
      if (!Array.isArray(player.metrics) || player.metrics.length < GENERATED_METRIC_LABELS.length) return acc;
      const features = [];
      for (let i = 0; i < GENERATED_METRIC_LABELS.length; i++) {
        const rawValue = player.metrics[i];
        if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) return acc;
        const adjustedValue = LOWER_BETTER_GENERATED_METRICS.has(GENERATED_METRIC_LABELS[i]) ? -rawValue : rawValue;
        features.push(adjustedValue);
      }
      acc.push({ features, label: finishPosition <= 20 ? 1 : 0 });
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
  const currentSeasonRoundsAllEvents = historyData.filter(row => {
    const dgId = String(row['dg_id'] || '').trim();
    if (!field2026DgIds.has(dgId)) return false;
    const year = parseInt(String(row['year'] || row['season'] || '').trim());
    if (Number.isNaN(year)) return false;
    return String(year) === String(CURRENT_SEASON);
  });
  let currentGeneratedMetricCorrelations = [];
  let currentGeneratedTop20Correlations = [];
  let currentGeneratedTop20Logistic = null;
  let currentGeneratedTop20CvSummary = null;
  let suggestedTop20MetricWeights = { source: 'none', weights: [] };
  let suggestedTop20GroupWeights = { source: 'none', weights: [] };
  let tunedTop20GroupWeights = null;
  let currentGeneratedCorrelationMap = new Map();
  let currentGeneratedTop20AlignmentMap = new Map();

  if (currentSeasonRounds.length > 0 || currentSeasonRoundsAllEvents.length > 0) {
    const currentTemplate = templateConfigs[CURRENT_EVENT_ID] || Object.values(templateConfigs)[0];
    if (!currentTemplate) {
      console.warn('⚠️  No template available for current-season metric correlations.');
    } else {
      const similarCourseIds = normalizeIdList(sharedConfig.similarCourseIds);
      const puttingCourseIds = normalizeIdList(sharedConfig.puttingCourseIds);
      const similarCourseBlend = clamp01(sharedConfig.similarCoursesWeight, 0.3);
      const puttingCourseBlend = clamp01(sharedConfig.puttingCoursesWeight, 0.35);
      const fieldIdSet = field2026DgIds;

      const roundsForMetrics = currentSeasonRoundsAllEvents.length > 0
        ? currentSeasonRoundsAllEvents
        : currentSeasonRounds;
      if (roundsForMetrics.length !== currentSeasonRounds.length) {
        console.log(`ℹ️  Using ${roundsForMetrics.length} current-season rounds (all events) for metric correlations instead of ${currentSeasonRounds.length} event-only rounds.`);
      }
      const currentRankingForMetrics = runRanking({
        roundsRawData: roundsForMetrics,
        approachRawData: approachData,
        groupWeights: currentTemplate.groupWeights,
        metricWeights: currentTemplate.metricWeights,
        includeCurrentEventRounds: true
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
            includeCurrentEventRounds: true
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
            includeCurrentEventRounds: true
          });
          const puttingMetricCorrelations = computeGeneratedMetricCorrelations(puttingRanking.players, puttingCourseResults);
          const puttingTop20Correlations = computeGeneratedMetricTopNCorrelations(puttingRanking.players, puttingCourseResults, 20);
          currentGeneratedMetricCorrelations = blendSingleMetricCorrelation(currentGeneratedMetricCorrelations, puttingMetricCorrelations, 'SG Putting', puttingCourseBlend);
          currentGeneratedTop20Correlations = blendSingleMetricCorrelation(currentGeneratedTop20Correlations, puttingTop20Correlations, 'SG Putting', puttingCourseBlend);
        }
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
      console.log(`✓ Computed ${currentGeneratedMetricCorrelations.length} metric correlations for ${CURRENT_SEASON}`);
    }
  } else {
    console.warn(`⚠️  No ${CURRENT_SEASON} rounds found (event or all-events); skipping current-season metric correlations.`);
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
  const configTemplateResult = templateResults.find(result => result.name === String(CURRENT_EVENT_ID));
  const configBaselineEvaluation = configTemplateResult ? (configTemplateResult.evaluationCurrent || configTemplateResult.evaluation) : null;

  console.log('---');
  console.log('STEP 2: TOP-20 GROUP WEIGHT TUNING');
  console.log('Tune lower-importance groups for Top-20 outcomes');
  console.log('---');

  const step2BaseTemplate = configTemplateResult || bestTemplate;
  const step2BaseTemplateName = step2BaseTemplate === configTemplateResult ? 'CONFIGURATION_SHEET' : bestTemplate.name;
  const step2MetricWeights = step2BaseTemplate.metricWeights || bestTemplate.metricWeights;

  const groupWeightsSeed = suggestedTop20GroupWeights.weights.length > 0
    ? buildGroupWeightsMap(suggestedTop20GroupWeights.weights)
    : step2BaseTemplate.groupWeights;
  const groupWeightsSeedNormalized = normalizeWeights(groupWeightsSeed);
  const optimizableGroups = selectOptimizableGroups(suggestedTop20GroupWeights.weights.length > 0
    ? suggestedTop20GroupWeights.weights
    : Object.entries(groupWeightsSeedNormalized).map(([groupName, weight]) => ({ groupName, weight })), 3);

  const GROUP_TUNE_RANGE = 0.25; // ±25% adjustments
  const GROUP_TUNE_TESTS = 400;

  const tunedResults = [];
  for (let i = 0; i < GROUP_TUNE_TESTS; i++) {
    const candidate = { ...groupWeightsSeedNormalized };
    optimizableGroups.forEach(groupName => {
      const base = candidate[groupName] || 0.0001;
      const adjustment = (Math.random() * 2 - 1) * GROUP_TUNE_RANGE;
      candidate[groupName] = Math.max(0.0001, base * (1 + adjustment));
    });
    const normalizedCandidate = normalizeWeights(candidate);

    const ranking = runRanking({
      roundsRawData: roundsByYear[CURRENT_SEASON] || historicalDataForField,
      approachRawData: approachData,
      groupWeights: normalizedCandidate,
      metricWeights: step2MetricWeights
    });
    const evaluation = evaluateRankings(ranking.players, resultsCurrent, { includeTopN: true });
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
  const WEIGHT_OBJECTIVE = {
    correlation: 0.3,
    top20: 0.5,
    alignment: 0.2
  };
  
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

    const alignmentScore = currentGeneratedTop20AlignmentMap.size > 0
      ? computeMetricAlignmentScore(adjustedMetricWeights, normalizedWeights, currentGeneratedTop20AlignmentMap)
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
  console.log(`   Improvement: ${((bestOptimized.correlation - baselineEvaluation.correlation) / Math.abs(baselineEvaluation.correlation) * 100).toFixed(2)}%`);
  const bestOptimizedTop10 = typeof bestOptimized.top10 === 'number' ? `${bestOptimized.top10.toFixed(1)}%` : 'n/a';
  const optimizedTop20Text = typeof bestOptimized.top20 === 'number' ? `${bestOptimized.top20.toFixed(1)}%` : 'n/a';
  const optimizedTop20WeightedText = typeof bestOptimized.top20WeightedScore === 'number' ? `${bestOptimized.top20WeightedScore.toFixed(1)}%` : 'n/a';
  console.log(`   Top-10: ${bestOptimizedTop10}`);
  console.log(`   Top-20: ${optimizedTop20Text}`);
  console.log(`   Top-20 Weighted Score: ${optimizedTop20WeightedText}\n`);

  const optimizedRankingCurrent = runRanking({
    roundsRawData: roundsByYear[CURRENT_SEASON] || historicalDataForField,
    approachRawData: approachData,
    groupWeights: bestOptimized.weights,
    metricWeights: bestOptimized.metricWeights || bestTemplate.metricWeights
  });

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
    
    const top10Text = typeof evaluation.top10 === 'number' ? `${evaluation.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof evaluation.top20 === 'number' ? `${evaluation.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof evaluation.top20WeightedScore === 'number' ? `${evaluation.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`     Correlation: ${evaluation.correlation.toFixed(4)} | Top-10: ${top10Text} | Top-20: ${top20Text} | Top-20 Weighted: ${top20WeightedText}`);
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
    console.log(`  ${year}: Correlation=${evalResult.correlation.toFixed(4)} | Top-10=${top10Text} | Top-20=${top20Text} | Top-20 Weighted=${top20WeightedText}`);
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
  console.log(`   Matched Players: ${bestOptimized.matchedPlayers}`);

  console.log('\n📈 Optimized Weights:');
  Object.entries(bestOptimized.weights).forEach(([metric, weight]) => {
    console.log(`   ${metric}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n✓ Step 4: Multi-Year Validation Results');
  Object.entries(multiYearResults).sort().forEach(([year, result]) => {
    const top10Text = typeof result.top10 === 'number' ? `${result.top10.toFixed(1)}%` : 'n/a';
    const top20Text = typeof result.top20 === 'number' ? `${result.top20.toFixed(1)}%` : 'n/a';
    const top20WeightedText = typeof result.top20WeightedScore === 'number' ? `${result.top20WeightedScore.toFixed(1)}%` : 'n/a';
    console.log(`   ${year}: Correlation=${result.correlation.toFixed(4)}, Top-10=${top10Text}, Top-20=${top20Text}, Top-20 Weighted=${top20WeightedText}, Players=${result.matchedPlayers}`);
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
  const metricStatsDiagnostics = buildMetricStatsDiagnostics(optimizedRankingCurrent.groupStats, {
    stdDevThreshold: 0.05,
    minCount: 10
  });

  const output = {
    timestamp: new Date().toISOString(),
    eventId: CURRENT_EVENT_ID,
    tournament: TOURNAMENT_NAME || 'Sony Open',
    dryRun: DRY_RUN,
    historicalMetricCorrelations,
    currentGeneratedMetricCorrelations,
    currentGeneratedTop20Correlations,
    currentGeneratedTop20Logistic,
    currentGeneratedTop20CvSummary,
    blendSettings: {
      similarCourseIds: normalizeIdList(sharedConfig.similarCourseIds),
      puttingCourseIds: normalizeIdList(sharedConfig.puttingCourseIds),
      similarCoursesWeight: clamp01(sharedConfig.similarCoursesWeight, 0.3),
      puttingCoursesWeight: clamp01(sharedConfig.puttingCoursesWeight, 0.35)
    },
    suggestedTop20MetricWeights,
    suggestedTop20GroupWeights,
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

  const outputPath = path.resolve(OUTPUT_DIR, 'adaptive_optimizer_v2_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const textLines = [];
  textLines.push('='.repeat(100));
  textLines.push('ADAPTIVE WEIGHT OPTIMIZER - FINAL RESULTS');
  textLines.push('='.repeat(100));
  textLines.push(`DRY RUN: ${DRY_RUN ? 'ON (template files not modified)' : 'OFF (templates written)'}`);
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
  textLines.push(`STEP 1b: CURRENT-SEASON GENERATED METRICS (${CURRENT_SEASON})`);
  textLines.push('Functions: runRanking (adaptiveOptimizer_v2.js) -> buildPlayerData (utilities/dataPrep.js) -> generatePlayerRankings (modelCore.js)');
  textLines.push('Additional: computeGeneratedMetricCorrelations, computeGeneratedMetricTopNCorrelations, trainTopNLogisticModel, crossValidateTopNLogisticByEvent, buildSuggestedMetricWeights, buildSuggestedGroupWeights (adaptiveOptimizer_v2.js)');
  const reportSimilarCourseIds = normalizeIdList(sharedConfig.similarCourseIds);
  const reportPuttingCourseIds = normalizeIdList(sharedConfig.puttingCourseIds);
  const reportSimilarBlend = clamp01(sharedConfig.similarCoursesWeight, 0.3);
  const reportPuttingBlend = clamp01(sharedConfig.puttingCoursesWeight, 0.35);
  textLines.push(`Blend settings: similarCourseEvents=${reportSimilarCourseIds.length}, similarBlend=${reportSimilarBlend.toFixed(2)}, puttingCourseEvents=${reportPuttingCourseIds.length}, puttingBlend=${reportPuttingBlend.toFixed(2)} (SG Putting only)`);
  textLines.push(`CURRENT-SEASON GENERATED METRIC CORRELATIONS (${CURRENT_SEASON}):`);
  if (currentGeneratedMetricCorrelations.length === 0) {
    textLines.push(`  No ${CURRENT_SEASON} metric correlations computed.`);
  } else {
    currentGeneratedMetricCorrelations.forEach(entry => {
      textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push(`CURRENT-SEASON GENERATED METRIC TOP-20 SIGNAL (${CURRENT_SEASON}):`);
  if (currentGeneratedTop20Correlations.length === 0) {
    textLines.push(`  No ${CURRENT_SEASON} top-20 correlations computed.`);
  } else {
    currentGeneratedTop20Correlations.forEach(entry => {
      textLines.push(`  ${entry.index}. ${entry.label}: Corr=${entry.correlation.toFixed(4)}, Samples=${entry.samples}`);
    });
  }
  textLines.push('');
  textLines.push(`CURRENT-SEASON TOP-20 LOGISTIC MODEL (${CURRENT_SEASON}):`);
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
  textLines.push(`STEP 1c: CURRENT-YEAR TEMPLATE BASELINE (${CURRENT_SEASON})`);
  textLines.push('Functions: runRanking, evaluateRankings, computeTemplateCorrelationAlignment (adaptiveOptimizer_v2.js)');
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
  textLines.push(`Matched Players: ${bestOptimized.matchedPlayers}`);
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
    name: courseTemplateKey,
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
