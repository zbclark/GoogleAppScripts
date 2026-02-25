const fs = require('fs');
const path = require('path');

// Embedded fallback (may be stale if you have newer per-run regression JSON artifacts).
const DEFAULT_COURSE_HISTORY_REGRESSION = {
  "4": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "5": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "6": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "104": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "202": {
    "slope": 0,
    "pValue": 1
  },
  "232": {
    "slope": 0,
    "pValue": 1
  },
  "233": {
    "slope": 0,
    "pValue": 1
  },
  "500": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "510": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "704": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "765": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "776": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "889": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "919": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "922": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "927": {
    "slope": 0,
    "pValue": 0.9999999989999999
  },
  "928": {
    "slope": -0.5343137254901987,
    "pValue": 0.8565280126019332
  }
};

let ACTIVE_REGRESSION_MAP = null;
let ACTIVE_REGRESSION_META = { source: 'embedded', path: null };
let LAST_ENV_FINGERPRINT = null;

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function normalizeRegressionMap(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const map = {};
  Object.entries(payload).forEach(([courseNum, entry]) => {
    if (!courseNum) return;
    if (!entry || typeof entry !== 'object') return;
    const slope = Number(entry.slope);
    const pValue = Number(entry.pValue);
    if (!Number.isFinite(slope) || !Number.isFinite(pValue)) return;
    map[String(courseNum).trim()] = { slope, pValue };
  });
  return Object.keys(map).length > 0 ? map : null;
}

function getCandidatePaths() {
  const candidates = [];
  const add = (value) => {
    if (!value) return;
    const resolved = path.resolve(String(value));
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };

  // Explicit file path wins.
  add(process.env.COURSE_HISTORY_REGRESSION_JSON);

  // Optimizer sets PRE_TOURNAMENT_OUTPUT_DIR to the regression output directory.
  const outDir = String(process.env.PRE_TOURNAMENT_OUTPUT_DIR || '').trim();
  if (outDir) {
    add(path.join(outDir, 'course_history_regression.json'));
    add(path.join(outDir, 'course_history_regression', 'course_history_regression.json'));
  }

  // Conventional fallbacks.
  const ROOT_DIR = path.resolve(__dirname, '..');
  add(path.join(ROOT_DIR, 'output', 'course_history_regression.json'));
  add(path.join(ROOT_DIR, 'output', 'course_history_regression', 'course_history_regression.json'));

  return candidates;
}

function maybeReloadRegressionMap() {
  const fingerprint = [
    String(process.env.COURSE_HISTORY_REGRESSION_JSON || '').trim(),
    String(process.env.PRE_TOURNAMENT_OUTPUT_DIR || '').trim()
  ].join('|');
  if (fingerprint === LAST_ENV_FINGERPRINT && ACTIVE_REGRESSION_MAP) return;
  LAST_ENV_FINGERPRINT = fingerprint;

  for (const candidate of getCandidatePaths()) {
    const payload = readJsonFile(candidate);
    const normalized = normalizeRegressionMap(payload);
    if (normalized) {
      ACTIVE_REGRESSION_MAP = normalized;
      ACTIVE_REGRESSION_META = { source: 'json', path: candidate };
      return;
    }
  }

  ACTIVE_REGRESSION_MAP = DEFAULT_COURSE_HISTORY_REGRESSION;
  ACTIVE_REGRESSION_META = { source: 'embedded', path: null };
}

function getCourseHistoryRegressionMap() {
  maybeReloadRegressionMap();
  return ACTIVE_REGRESSION_MAP || DEFAULT_COURSE_HISTORY_REGRESSION;
}

function getCourseHistoryRegressionMeta() {
  maybeReloadRegressionMap();
  return ACTIVE_REGRESSION_META;
}

function getCourseHistoryRegression(courseNum) {
  if (courseNum === null || courseNum === undefined) return null;
  const key = String(courseNum).trim();
  const map = getCourseHistoryRegressionMap();
  return map[key] || null;
}

module.exports = {
  // Backwards-compatible export name (note: may be stale if you don't point to a JSON artifact).
  COURSE_HISTORY_REGRESSION: DEFAULT_COURSE_HISTORY_REGRESSION,
  getCourseHistoryRegression,
  getCourseHistoryRegressionMap,
  getCourseHistoryRegressionMeta
};
