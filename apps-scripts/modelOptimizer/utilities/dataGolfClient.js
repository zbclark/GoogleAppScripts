const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 2000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ensureDir = dirPath => {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const readJson = filePath => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
};

const writeJson = (filePath, payload) => {
  if (!filePath) return;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
};

const isFresh = (filePath, ttlMs) => {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    const stats = fs.statSync(filePath);
    return Date.now() - stats.mtimeMs < ttlMs;
  } catch (error) {
    return false;
  }
};

const fetchJsonWithRetry = async (url, options = {}) => {
  const {
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`HTTP ${response.status}: ${text}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      const isLastAttempt = attempt >= retries;
      const status = error.status || 0;
      const retryable = status === 429 || status >= 500 || error.name === 'AbortError';
      if (isLastAttempt || !retryable) {
        throw error;
      }
      await sleep(backoffMs * Math.pow(2, attempt));
    }
  }
  return null;
};

const getDataGolfRankings = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true
  } = options;

  const cachePath = cacheDir
    ? path.resolve(cacheDir, 'datagolf_rankings.json')
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/preds/get-dg-rankings?file_format=json&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

const getDataGolfApproachSkill = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    period = 'l24',
    fileFormat = 'json'
  } = options;

  const safePeriod = String(period || 'l24').trim().toLowerCase() || 'l24';
  const safeFormat = String(fileFormat || 'json').trim().toLowerCase() || 'json';
  const cacheSuffix = `${safePeriod}_${safeFormat}`.replace(/[^a-z0-9._-]/g, '_');
  const cachePath = cacheDir
    ? path.resolve(cacheDir, `datagolf_approach_skill_${cacheSuffix}.json`)
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/preds/approach-skill?period=${safePeriod}&file_format=${safeFormat}&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

const getDataGolfFieldUpdates = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    tour = 'pga',
    fileFormat = 'json'
  } = options;

  const safeTour = String(tour || 'pga').trim().toLowerCase() || 'pga';
  const safeFormat = String(fileFormat || 'json').trim().toLowerCase() || 'json';
  const cacheSuffix = `${safeTour}_${safeFormat}`.replace(/[^a-z0-9._-]/g, '_');
  const cachePath = cacheDir
    ? path.resolve(cacheDir, `datagolf_field_updates_${cacheSuffix}.json`)
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/field-updates?tour=${safeTour}&file_format=${safeFormat}&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

const getDataGolfPlayerDecompositions = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    tour = 'pga',
    fileFormat = 'json'
  } = options;

  const safeTour = String(tour || 'pga').trim().toLowerCase() || 'pga';
  const safeFormat = String(fileFormat || 'json').trim().toLowerCase() || 'json';
  const cacheSuffix = `${safeTour}_${safeFormat}`.replace(/[^a-z0-9._-]/g, '_');
  const cachePath = cacheDir
    ? path.resolve(cacheDir, `datagolf_player_decompositions_${cacheSuffix}.json`)
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/preds/player-decompositions?tour=${safeTour}&file_format=${safeFormat}&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

const getDataGolfSkillRatings = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    display = 'value',
    fileFormat = 'json'
  } = options;

  const safeDisplay = String(display || 'value').trim().toLowerCase() || 'value';
  const safeFormat = String(fileFormat || 'json').trim().toLowerCase() || 'json';
  const cacheSuffix = `${safeDisplay}_${safeFormat}`.replace(/[^a-z0-9._-]/g, '_');
  const cachePath = cacheDir
    ? path.resolve(cacheDir, `datagolf_skill_ratings_${cacheSuffix}.json`)
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/preds/skill-ratings?display=${safeDisplay}&file_format=${safeFormat}&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

const getDataGolfHistoricalRounds = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    tour = 'pga',
    eventId = 'all',
    year,
    fileFormat = 'json'
  } = options;

  const safeTour = String(tour || 'pga').trim().toLowerCase() || 'pga';
  const safeEventId = String(eventId ?? 'all').trim().toLowerCase() || 'all';
  const safeYear = year !== undefined && year !== null ? String(year).trim() : '';
  const safeFormat = String(fileFormat || 'json').trim().toLowerCase() || 'json';
  const cacheSuffix = `${safeTour}_${safeEventId}_${safeYear || 'year'}_${safeFormat}`.replace(/[^a-z0-9._-]/g, '_');
  const cachePath = cacheDir
    ? path.resolve(cacheDir, `datagolf_historical_rounds_${cacheSuffix}.json`)
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  if (!safeYear) {
    return { source: 'missing-year', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=${safeTour}&event_id=${safeEventId}&year=${safeYear}&file_format=${safeFormat}&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

const getDataGolfLiveTournamentStats = async (options = {}) => {
  const {
    apiKey,
    cacheDir,
    ttlMs = DEFAULT_TTL_MS,
    allowStale = true,
    stats = 'sg_ott,sg_app,sg_arg,sg_putt,sg_t2g,sg_bs,sg_total,distance,accuracy,gir,prox_fw,prox_rgh,scrambling,great_shots,poor_shots',
    round = 'event_avg',
    display = 'value',
    fileFormat = 'json'
  } = options;

  const safeStats = String(stats || '').trim().toLowerCase();
  const safeRound = String(round || 'event_avg').trim().toLowerCase() || 'event_avg';
  const safeDisplay = String(display || 'value').trim().toLowerCase() || 'value';
  const safeFormat = String(fileFormat || 'json').trim().toLowerCase() || 'json';
  const statsSlug = safeStats.replace(/[^a-z0-9]+/g, '_').slice(0, 120) || 'default';
  const cacheSuffix = `${statsSlug}_${safeRound}_${safeDisplay}_${safeFormat}`.replace(/[^a-z0-9._-]/g, '_');
  const cachePath = cacheDir
    ? path.resolve(cacheDir, `datagolf_live_tournament_stats_${cacheSuffix}.json`)
    : null;

  if (cachePath && isFresh(cachePath, ttlMs)) {
    return { source: 'cache', path: cachePath, payload: readJson(cachePath) };
  }

  if (!apiKey) {
    if (cachePath && allowStale && fs.existsSync(cachePath)) {
      return { source: 'cache-stale', path: cachePath, payload: readJson(cachePath) };
    }
    return { source: 'missing-key', path: cachePath, payload: null };
  }

  const endpoint = `https://feeds.datagolf.com/preds/live-tournament-stats?stats=${safeStats}&round=${safeRound}&display=${safeDisplay}&file_format=${safeFormat}&key=${apiKey}`;
  const payload = await fetchJsonWithRetry(endpoint);

  if (cachePath) {
    writeJson(cachePath, payload);
  }

  return { source: 'api', path: cachePath, payload };
};

module.exports = {
  getDataGolfRankings,
  getDataGolfApproachSkill,
  getDataGolfFieldUpdates,
  getDataGolfPlayerDecompositions,
  getDataGolfSkillRatings,
  getDataGolfHistoricalRounds,
  getDataGolfLiveTournamentStats
};
