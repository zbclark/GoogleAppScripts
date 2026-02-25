const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
const { loadCsv } = require('../utilities/csvLoader');
const { parsePosition } = require('../utilities/dataPrep');
const { parseEventDate } = require('../utilities/dataPrep');
const { getDataGolfHistoricalRounds } = require('../utilities/dataGolfClient');
const { extractHistoricalRowsFromSnapshotPayload } = require('../utilities/extractHistoricalRows');

const args = process.argv.slice(2);
let OVERRIDE_DIR = null;
let OVERRIDE_DATA_DIR = null;
let OVERRIDE_OUTPUT_DIR = null;
let OVERRIDE_METRIC = 'finish';
let OVERRIDE_MAX_EVENTS = 6;
let OVERRIDE_MIN_EVENTS = 3;
let OVERRIDE_TOURS = null;
let OVERRIDE_BASELINE_SEASONS = 5;
let OVERRIDE_API_YEARS = null;
let OVERRIDE_API_TOUR = null;
let OVERRIDE_DEBUG_API = false;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--dir' || args[i] === '--folder') && args[i + 1]) {
    OVERRIDE_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--dataDir' || args[i] === '--data-dir') && args[i + 1]) {
    OVERRIDE_DATA_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--outputDir' || args[i] === '--output-dir') && args[i + 1]) {
    OVERRIDE_OUTPUT_DIR = String(args[i + 1]).trim();
  }
  if (args[i] === '--metric' && args[i + 1]) {
    OVERRIDE_METRIC = String(args[i + 1]).trim().toLowerCase();
  }
  if (args[i] === '--maxEvents' && args[i + 1]) {
    const parsed = parseInt(String(args[i + 1]).trim(), 10);
    if (!Number.isNaN(parsed)) OVERRIDE_MAX_EVENTS = parsed;
  }
  if (args[i] === '--minEvents' && args[i + 1]) {
    const parsed = parseInt(String(args[i + 1]).trim(), 10);
    if (!Number.isNaN(parsed)) OVERRIDE_MIN_EVENTS = parsed;
  }
  if (args[i] === '--tours' && args[i + 1]) {
    OVERRIDE_TOURS = String(args[i + 1]).trim();
  }
  if ((args[i] === '--baselineSeasons' || args[i] === '--baseline-seasons') && args[i + 1]) {
    const parsed = parseInt(String(args[i + 1]).trim(), 10);
    if (!Number.isNaN(parsed)) OVERRIDE_BASELINE_SEASONS = parsed;
  }
  if ((args[i] === '--apiYears' || args[i] === '--api-years') && args[i + 1]) {
    OVERRIDE_API_YEARS = String(args[i + 1]).trim();
  }
  if ((args[i] === '--apiTour' || args[i] === '--api-tour') && args[i + 1]) {
    OVERRIDE_API_TOUR = String(args[i + 1]).trim();
  }
  if (args[i] === '--debugApi' || args[i] === '--debug-api') {
    OVERRIDE_DEBUG_API = true;
  }
}

const ROOT_DIR = path.resolve(__dirname, '..');
let DATA_DIR = path.resolve(ROOT_DIR, 'data');
// Legacy default was `.../output/`; keep everything under `data/` by default.
let OUTPUT_DIR = path.resolve(ROOT_DIR, 'data', 'analysis');

if (OVERRIDE_DIR) {
  const normalized = OVERRIDE_DIR.replace(/^[\/]+|[\/]+$/g, '');
  DATA_DIR = path.resolve(ROOT_DIR, 'data', normalized);
  OUTPUT_DIR = path.resolve(DATA_DIR, 'analysis');
}
if (OVERRIDE_DATA_DIR) {
  DATA_DIR = path.resolve(OVERRIDE_DATA_DIR);
}
if (OVERRIDE_OUTPUT_DIR) {
  OUTPUT_DIR = path.resolve(OVERRIDE_OUTPUT_DIR);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const metric = OVERRIDE_METRIC === 'sg_total' ? 'sg_total' : 'finish';
const maxEvents = Math.max(1, OVERRIDE_MAX_EVENTS || 6);
const minEvents = Math.max(2, OVERRIDE_MIN_EVENTS || 3);
const baselineSeasons = Math.max(1, OVERRIDE_BASELINE_SEASONS || 5);
const tourFilter = OVERRIDE_TOURS
  ? new Set(OVERRIDE_TOURS.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
  : null;
const datagolfApiKey = process.env.DATAGOLF_API_KEY || '';
const datagolfCacheDir = process.env.DATAGOLF_CACHE_DIR
  ? path.resolve(process.env.DATAGOLF_CACHE_DIR)
  : path.resolve(ROOT_DIR, 'data', 'cache');
const debugApi = OVERRIDE_DEBUG_API || String(process.env.DATAGOLF_DEBUG || '').trim().toLowerCase() === 'true';

const listCsvFiles = dir => {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.toLowerCase().endsWith('.csv'))
    .map(file => ({ name: file, path: path.resolve(dir, file) }));
};

const findHistoricalCsv = dir => {
  const candidates = listCsvFiles(dir).filter(file => file.name.toLowerCase().includes('historical data'));
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return candidates[0].path;
};

const parseYearSpec = spec => {
  if (!spec) return [];
  const raw = String(spec).trim();
  if (!raw) return [];
  if (raw.includes('-')) {
    const [startRaw, endRaw] = raw.split('-').map(value => value.trim());
    const start = parseInt(startRaw, 10);
    const end = parseInt(endRaw, 10);
    if (Number.isNaN(start) || Number.isNaN(end)) return [];
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    const years = [];
    for (let year = min; year <= max; year += 1) {
      years.push(year);
    }
    return years;
  }
  return raw.split(',')
    .map(value => parseInt(value.trim(), 10))
    .filter(year => Number.isFinite(year));
};

const normalizeHistoricalRoundRow = row => {
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
};

const loadHistoricalRowsFromApi = async ({ years, tour }) => {
  if (!datagolfApiKey) {
    return { rows: [], meta: { source: 'missing-key', years, tour } };
  }
  const resolvedTour = String(tour || 'pga').trim().toLowerCase() || 'pga';
  const rows = [];
  const yearSummaries = [];

  for (const year of years) {
    try {
      const snapshot = await getDataGolfHistoricalRounds({
        apiKey: datagolfApiKey,
        cacheDir: datagolfCacheDir,
        allowStale: true,
        tour: resolvedTour,
        eventId: 'all',
        year,
        fileFormat: 'json'
      });
      const rawRows = extractHistoricalRowsFromSnapshotPayload(snapshot?.payload);
      if (debugApi) {
        const payload = snapshot?.payload;
        const payloadType = Array.isArray(payload) ? 'array' : (payload === null ? 'null' : typeof payload);
        const keys = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? Object.keys(payload).slice(0, 15)
          : [];
        const errorMessage = payload?.error || payload?.message || payload?.status || null;
        console.log(`🔎 DataGolf debug (${year}): source=${snapshot?.source || 'unknown'}, payloadType=${payloadType}, keys=[${keys.join(', ')}]${errorMessage ? `, error=${errorMessage}` : ''}`);
      }
      const normalized = rawRows
        .map(normalizeHistoricalRoundRow)
        .filter(Boolean);
      rows.push(...normalized);
      yearSummaries.push({ year, source: snapshot?.source || 'unknown', rows: normalized.length });
    } catch (error) {
      yearSummaries.push({ year, source: 'error', error: error.message });
    }
  }

  return {
    rows,
    meta: {
      source: 'datagolf_api',
      tour: resolvedTour,
      years,
      cacheDir: datagolfCacheDir,
      yearSummaries
    }
  };
};

const main = async () => {
  const apiYears = parseYearSpec(OVERRIDE_API_YEARS);
  const apiTour = OVERRIDE_API_TOUR
    || (tourFilter && tourFilter.size === 1 ? Array.from(tourFilter.values())[0] : 'pga');

  let historicalPath = null;
  let rows = [];
  let sourceMeta = { historicalCsv: null, historicalJson: null, api: null, metric };

  // 1. Try cache JSON first
  const cacheDir = datagolfCacheDir || path.resolve(ROOT_DIR, 'data', 'cache');
  const jsonFiles = fs.existsSync(cacheDir)
    ? fs.readdirSync(cacheDir).filter(file => file.toLowerCase().includes('historical_rounds') && file.endsWith('.json'))
    : [];
  let historicalJsonPath = jsonFiles.length ? path.resolve(cacheDir, jsonFiles[0]) : null;

  if (historicalJsonPath) {
    const payload = JSON.parse(fs.readFileSync(historicalJsonPath, 'utf8'));
    rows = extractHistoricalRowsFromSnapshotPayload(payload);
    sourceMeta.historicalJson = historicalJsonPath;
    console.log(`✓ Loaded historical data JSON: ${path.basename(historicalJsonPath)} (${rows.length} rows)`);
  }

  // 2. Try CSV if JSON failed
  if (rows.length === 0) {
    let historicalCsvPath = findHistoricalCsv(DATA_DIR);
    if (historicalCsvPath) {
      rows = loadCsv(historicalCsvPath, { skipFirstColumn: true });
      sourceMeta.historicalCsv = historicalCsvPath;
      console.log(`✓ Loaded historical data CSV: ${path.basename(historicalCsvPath)} (${rows.length} rows)`);
    }
  }

  // 3. Try API if JSON and CSV failed and years specified
  if (rows.length === 0 && apiYears.length > 0) {
    const apiResult = await loadHistoricalRowsFromApi({ years: apiYears, tour: apiTour });
    if (apiResult.rows.length > 0) {
      rows = apiResult.rows;
      sourceMeta.api = apiResult.meta;
      console.log(`✓ Loaded historical rounds from API: ${rows.length} rows (${apiTour}, ${apiYears.join(', ')})`);
    } else if (apiResult.meta?.source === 'missing-key') {
      console.warn('ℹ️  DataGolf API key missing; no historical data found in cache or CSV.');
    } else {
      console.warn('ℹ️  DataGolf historical rounds API returned no rows; no historical data found in cache or CSV.');
      sourceMeta.api = apiResult.meta;
    }
  }

  // 4. Error if all sources failed
  if (rows.length === 0) {
    console.error(`❌ No historical data available (no JSON + no CSV + API empty in ${DATA_DIR}).`);
    process.exit(1);
  }

const eventMap = new Map();
rows.forEach(row => {
  const dgId = String(row.dg_id || '').trim();
  if (!dgId) return;
  const season = parseInt(String(row.season || row.year || '').trim(), 10);
  if (Number.isNaN(season)) return;
  const eventId = String(row.event_id || '').trim();
  if (!eventId) return;
  const tour = String(row.tour || '').trim().toLowerCase();
  if (tourFilter && tour && !tourFilter.has(tour)) return;

  const eventCompleted = parseEventDate(row.event_completed);
  if (!eventCompleted) return;

  const key = `${dgId}::${season}::${eventId}`;
  let record = eventMap.get(key);
  if (!record) {
    record = {
      dgId,
      playerName: String(row.player_name || '').trim() || 'Unknown',
      season,
      eventId,
      tour: tour || null,
      eventCompleted,
      finishPosition: null,
      sgTotalSum: 0,
      sgTotalCount: 0
    };
    eventMap.set(key, record);
  }

  if (!record.finishPosition) {
    const fin = parsePosition(row.fin_text);
    if (typeof fin === 'number' && Number.isFinite(fin)) {
      record.finishPosition = fin;
    }
  }

  const sgTotal = Number(row.sg_total);
  if (Number.isFinite(sgTotal)) {
    record.sgTotalSum += sgTotal;
    record.sgTotalCount += 1;
  }
});

const eventRecords = Array.from(eventMap.values()).map(record => {
  const sgAvg = record.sgTotalCount > 0 ? record.sgTotalSum / record.sgTotalCount : null;
  return {
    dgId: record.dgId,
    playerName: record.playerName,
    season: record.season,
    eventId: record.eventId,
    tour: record.tour,
    eventCompleted: record.eventCompleted,
    finishPosition: record.finishPosition,
    sgTotalAvg: sgAvg
  };
});

const buildPlayerSeasonBaselineMap = (records, metricKey, options = {}) => {
  const { maxSeasons = null } = options;
  const byPlayerSeason = new Map();
  records.forEach(record => {
    const perf = metricKey === 'sg_total' ? record.sgTotalAvg : record.finishPosition;
    if (!Number.isFinite(perf)) return;
    const key = `${record.dgId}::${record.season}`;
    if (!byPlayerSeason.has(key)) {
      byPlayerSeason.set(key, []);
    }
    byPlayerSeason.get(key).push(perf);
  });

  const seasonsByPlayer = new Map();
  Array.from(byPlayerSeason.keys()).forEach(key => {
    const [dgId, seasonStr] = key.split('::');
    const season = parseInt(seasonStr, 10);
    if (Number.isNaN(season)) return;
    if (!seasonsByPlayer.has(dgId)) seasonsByPlayer.set(dgId, []);
    seasonsByPlayer.get(dgId).push(season);
  });

  const baselineMap = new Map();
  seasonsByPlayer.forEach((seasons, dgId) => {
    const uniqueSeasons = Array.from(new Set(seasons)).sort((a, b) => a - b);
    uniqueSeasons.forEach(season => {
      let priorSeasons = uniqueSeasons.filter(s => s < season);
      if (typeof maxSeasons === 'number' && Number.isFinite(maxSeasons) && maxSeasons > 0) {
        priorSeasons = priorSeasons.slice(-maxSeasons);
      }
      if (!priorSeasons.length) return;
      let values = [];
      priorSeasons.forEach(prior => {
        const key = `${dgId}::${prior}`;
        const rows = byPlayerSeason.get(key) || [];
        values = values.concat(rows);
      });
      if (!values.length) return;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      baselineMap.set(`${dgId}::${season}`, {
        baseline: avg,
        sampleCount: values.length,
        seasonsUsed: priorSeasons.length
      });
    });
  });

  return baselineMap;
};

const baselineByPlayerSeason = buildPlayerSeasonBaselineMap(eventRecords, metric, { maxSeasons: baselineSeasons });

const groupByPlayerSeason = new Map();
eventRecords.forEach(record => {
  const perf = metric === 'sg_total' ? record.sgTotalAvg : record.finishPosition;
  if (!Number.isFinite(perf)) return;
  const key = `${record.dgId}::${record.season}`;
  if (!groupByPlayerSeason.has(key)) {
    groupByPlayerSeason.set(key, []);
  }
  groupByPlayerSeason.get(key).push({
    ...record,
    performance: perf
  });
});

const computeRegression = (points) => {
  const n = points.length;
  if (n < 2) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    den += dx * dx;
    varY += dy * dy;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const r = den > 0 && varY > 0 ? num / Math.sqrt(den * varY) : 0;
  return { slope, intercept, r };
};

const playerSeasonResults = [];

groupByPlayerSeason.forEach((events, key) => {
  const [dgId, seasonStr] = key.split('::');
  const season = parseInt(seasonStr, 10);
  const sorted = events.sort((a, b) => a.eventCompleted - b.eventCompleted);
  const window = sorted.slice(0, maxEvents);
  if (window.length < minEvents) return;

  const baselineInfo = baselineByPlayerSeason.get(`${dgId}::${season}`) || null;
  const baseline = baselineInfo?.baseline ?? null;

  const points = window.map((event, idx) => ({
    x: idx + 1,
    y: event.performance
  }));
  const regression = computeRegression(points);
  if (!regression) return;

  const slope = regression.slope;
  const intercept = regression.intercept;
  let returnToFormIndex = null;
  let returnStatus = 'no_baseline';

  if (Number.isFinite(baseline) && Number.isFinite(slope) && slope !== 0) {
    const predicted = (baseline - intercept) / slope;
    if (Number.isFinite(predicted)) {
      const improving = metric === 'finish' ? slope < 0 : slope > 0;
      if (!improving) {
        returnStatus = 'not_improving';
      } else if (predicted <= 0) {
        returnStatus = 'already_better';
        returnToFormIndex = 0;
      } else if (predicted > maxEvents) {
        returnStatus = 'outside_window';
        returnToFormIndex = predicted;
      } else {
        returnStatus = 'return_to_form';
        returnToFormIndex = predicted;
      }
    } else {
      returnStatus = 'invalid_prediction';
    }
  } else if (Number.isFinite(baseline) && (slope === 0 || !Number.isFinite(slope))) {
    returnStatus = 'flat_trend';
  }

  playerSeasonResults.push({
    dgId,
    playerName: window[0]?.playerName || 'Unknown',
    season,
    tour: window[0]?.tour || null,
    eventCount: window.length,
    slope,
    intercept,
    r: regression.r,
    baseline,
    baselineSampleCount: baselineInfo?.sampleCount ?? 0,
    baselineSeasonsUsed: baselineInfo?.seasonsUsed ?? 0,
    returnToFormIndex,
    returnToFormStatus: returnStatus,
    events: window.map((event, idx) => ({
      index: idx + 1,
      eventId: event.eventId,
      eventCompleted: event.eventCompleted.toISOString().slice(0, 10),
      performance: event.performance
    }))
  });
});

const playerAggregate = new Map();
playerSeasonResults.forEach(entry => {
  if (!playerAggregate.has(entry.dgId)) {
    playerAggregate.set(entry.dgId, {
      dgId: entry.dgId,
      playerName: entry.playerName,
      seasons: 0,
      slopeSum: 0,
      rSum: 0,
      sampleCount: 0,
      returnIndexSum: 0,
      returnIndexCount: 0
    });
  }
  const agg = playerAggregate.get(entry.dgId);
  agg.seasons += 1;
  agg.slopeSum += entry.slope;
  agg.rSum += entry.r;
  agg.sampleCount += 1;
  if (typeof entry.returnToFormIndex === 'number' && Number.isFinite(entry.returnToFormIndex)) {
    agg.returnIndexSum += entry.returnToFormIndex;
    agg.returnIndexCount += 1;
  }
});

const players = Array.from(playerAggregate.values()).map(entry => {
  const avgSlope = entry.sampleCount > 0 ? entry.slopeSum / entry.sampleCount : 0;
  const avgR = entry.sampleCount > 0 ? entry.rSum / entry.sampleCount : 0;
  const avgReturnToFormIndex = entry.returnIndexCount > 0
    ? entry.returnIndexSum / entry.returnIndexCount
    : null;
  const trend = metric === 'finish'
    ? (avgSlope > 0 ? 'slow_starter' : 'fast_starter')
    : (avgSlope < 0 ? 'slow_starter' : 'fast_starter');

  return {
    dgId: entry.dgId,
    playerName: entry.playerName,
    seasons: entry.seasons,
    avgSlope,
    avgR,
    avgReturnToFormIndex,
    returnToFormCount: entry.returnIndexCount,
    trend
  };
});

const sortBySlope = (direction) => {
  return [...players].sort((a, b) => direction * (a.avgSlope - b.avgSlope));
};

const buildPeakTimingSummary = () => {
  const statusCounts = playerSeasonResults.reduce((acc, entry) => {
    const key = entry.returnToFormStatus || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const returnToFormIndexes = playerSeasonResults
    .map(entry => entry.returnToFormIndex)
    .filter(value => typeof value === 'number' && Number.isFinite(value));
  const sortedReturnToForm = [...returnToFormIndexes].sort((a, b) => a - b);
  const avgReturnToForm = returnToFormIndexes.length
    ? returnToFormIndexes.reduce((a, b) => a + b, 0) / returnToFormIndexes.length
    : null;
  const medianReturnToForm = sortedReturnToForm.length
    ? sortedReturnToForm[Math.floor(sortedReturnToForm.length / 2)]
    : null;

  const returnToFormPlayers = players
    .filter(entry => typeof entry.avgReturnToFormIndex === 'number' && Number.isFinite(entry.avgReturnToFormIndex));

  const slowStarters = returnToFormPlayers
    .sort((a, b) => (b.avgReturnToFormIndex - a.avgReturnToFormIndex))
    .slice(0, 5)
    .map(entry => ({
      playerName: entry.playerName,
      avgReturnToFormIndex: entry.avgReturnToFormIndex,
      seasons: entry.seasons
    }));

  const fastStarters = returnToFormPlayers
    .sort((a, b) => (a.avgReturnToFormIndex - b.avgReturnToFormIndex))
    .slice(0, 5)
    .map(entry => ({
      playerName: entry.playerName,
      avgReturnToFormIndex: entry.avgReturnToFormIndex,
      seasons: entry.seasons
    }));

  const earlyPeakers = returnToFormPlayers
    .filter(entry => entry.avgReturnToFormIndex <= maxEvents)
    .sort((a, b) => a.avgReturnToFormIndex - b.avgReturnToFormIndex)
    .slice(0, 3)
    .map(entry => ({
      playerName: entry.playerName,
      avgReturnToFormIndex: entry.avgReturnToFormIndex,
      seasons: entry.seasons
    }));

  const latePeakers = returnToFormPlayers
    .filter(entry => entry.avgReturnToFormIndex > maxEvents)
    .sort((a, b) => b.avgReturnToFormIndex - a.avgReturnToFormIndex)
    .slice(0, 3)
    .map(entry => ({
      playerName: entry.playerName,
      avgReturnToFormIndex: entry.avgReturnToFormIndex,
      seasons: entry.seasons
    }));

  const exampleNarratives = [];
  earlyPeakers.forEach(entry => {
    exampleNarratives.push(
      `${entry.playerName} tends to reach baseline by event ${entry.avgReturnToFormIndex.toFixed(1)} (based on ${entry.seasons} seasons), indicating early-season readiness.`
    );
  });
  latePeakers.forEach(entry => {
    exampleNarratives.push(
      `${entry.playerName} typically reaches baseline after event ${maxEvents} (avg ${entry.avgReturnToFormIndex.toFixed(1)} over ${entry.seasons} seasons), suggesting a later peak.`
    );
  });

  return {
    statusCounts,
    avgReturnToFormIndex: avgReturnToForm,
    medianReturnToFormIndex: medianReturnToForm,
    slowStarters,
    fastStarters,
    earlyPeakers,
    latePeakers,
    exampleNarratives
  };
};

const peakTimingSummary = buildPeakTimingSummary();

const output = {
  meta: {
    createdAt: new Date().toISOString(),
    source: sourceMeta,
    window: {
      maxEvents,
      minEvents,
      baselineSeasons
    },
    plainEnglishSummary: {
      whatWeMeasured: 'We look at each player’s first few events each season and see if they improve or decline over those early starts.',
      slopeMeaning: metric === 'finish'
        ? 'For finish position, a negative slope means the player tends to finish better as the season progresses (improving).'
        : 'For SG Total, a positive slope means the player tends to gain more strokes as the season progresses (improving).',
      returnToFormMeaning: `Return-to-form index estimates the event number where the player is expected to reach their prior-${baselineSeasons}-season baseline performance.`,
      howToUse: 'If the return-to-form index is high, the player likely starts slow and improves later; if it is low or zero, they’re ready early.'
    },
    peakTimingSummary,
    totals: {
      playerSeasons: playerSeasonResults.length,
      players: players.length
    }
  },
  playerSeasons: playerSeasonResults,
  players,
  top: {
    slowStarters: sortBySlope(1).slice(-15).reverse(),
    fastStarters: sortBySlope(1).slice(0, 15)
  }
};

const jsonPath = path.resolve(OUTPUT_DIR, `early_season_ramp_${metric}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));

const csvLines = [];
csvLines.push(`# peak_timing_summary avg_return_to_form_index=${peakTimingSummary.avgReturnToFormIndex ?? ''}, median_return_to_form_index=${peakTimingSummary.medianReturnToFormIndex ?? ''}`);
csvLines.push(`# peak_timing_status_counts ${Object.entries(peakTimingSummary.statusCounts || {})
  .map(([key, value]) => `${key}:${value}`)
  .join(' | ')}`);
csvLines.push(`# peak_timing_early_peakers ${peakTimingSummary.earlyPeakers
  .map(entry => `${entry.playerName} (${entry.avgReturnToFormIndex.toFixed(1)}, seasons=${entry.seasons})`)
  .join(' | ')}`);
csvLines.push(`# peak_timing_late_peakers ${peakTimingSummary.latePeakers
  .map(entry => `${entry.playerName} (${entry.avgReturnToFormIndex.toFixed(1)}, seasons=${entry.seasons})`)
  .join(' | ')}`);
peakTimingSummary.exampleNarratives.forEach(line => {
  csvLines.push(`# peak_timing_example ${line}`);
});
csvLines.push('dg_id,player_name,seasons,avg_slope,avg_r,avg_return_to_form,return_to_form_count,trend');
players.sort((a, b) => b.seasons - a.seasons).forEach(entry => {
  csvLines.push([
    entry.dgId,
    JSON.stringify(entry.playerName),
    entry.seasons,
    entry.avgSlope.toFixed(6),
    entry.avgR.toFixed(6),
    entry.avgReturnToFormIndex === null ? '' : entry.avgReturnToFormIndex.toFixed(3),
    entry.returnToFormCount,
    entry.trend
  ].join(','));
});

const csvPath = path.resolve(OUTPUT_DIR, `early_season_ramp_${metric}.csv`);
fs.writeFileSync(csvPath, csvLines.join('\n'));

  console.log(`✅ Early-season ramp analysis complete.`);
  console.log(`   Metric: ${metric}`);
  console.log(`   Window: first ${maxEvents} events (min ${minEvents})`);
  console.log(`   Baseline: last ${baselineSeasons} seasons`);
  console.log(`   Players: ${players.length}`);
  console.log(`   Output JSON: ${jsonPath}`);
  console.log(`   Output CSV: ${csvPath}`);
};

main().catch(error => {
  console.error(`❌ Early-season ramp analysis failed: ${error.message}`);
  process.exit(1);
});
