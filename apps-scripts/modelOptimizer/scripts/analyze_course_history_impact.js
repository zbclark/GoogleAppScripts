const fs = require('fs');
const path = require('path');
const { loadCsv } = require('../utilities/csvLoader');
const { getDataGolfHistoricalRounds } = require('../utilities/dataGolfClient');
const buildRecentYears = require('../utilities/buildRecentYears');
const collectRecords = require('../utilities/collectRecords');
const { extractHistoricalRowsFromSnapshotPayload } = require('../utilities/extractHistoricalRows');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OUTPUT_DIR = process.env.PRE_TOURNAMENT_OUTPUT_DIR
  ? path.resolve(process.env.PRE_TOURNAMENT_OUTPUT_DIR)
  // Legacy default was `.../output/`; keep everything under `data/` by default.
  : path.resolve(__dirname, '..', 'data', 'course_history_regression');
const SHOULD_WRITE_TEMPLATES = String(process.env.WRITE_TEMPLATES || '').trim().toLowerCase() === 'true';
const DATAGOLF_API_KEY = String(process.env.DATAGOLF_API_KEY || '').trim();
const DATAGOLF_CACHE_DIR = path.resolve(__dirname, '..', 'data', 'cache');
const DATAGOLF_HISTORICAL_TTL_HOURS = (() => {
  const raw = parseFloat(String(process.env.DATAGOLF_HISTORICAL_TTL_HOURS || '').trim());
  return Number.isNaN(raw) ? 72 : Math.max(1, raw);
})();
const DATAGOLF_HISTORICAL_TTL_MS = DATAGOLF_HISTORICAL_TTL_HOURS * 60 * 60 * 1000;
const COURSE_CONTEXT_PATH = path.resolve(__dirname, '..', 'utilities', 'course_context.json');
const PRE_TOURNAMENT_EVENT_ID = String(process.env.PRE_TOURNAMENT_EVENT_ID || '').trim();
const PRE_TOURNAMENT_SEASON = (() => {
  const raw = parseInt(String(process.env.PRE_TOURNAMENT_SEASON || '').trim(), 10);
  return Number.isNaN(raw) ? null : raw;
})();

const DEBUG = (() => {
  const debugFlags = [
    process.env.COURSE_HISTORY_DEBUG,
    process.env.DATAGOLF_DEBUG
  ].map(value => String(value || '').trim().toLowerCase());
  return debugFlags.some(value => value === 'true' || value === '1' || value === 'yes');
})();

const WALK_IGNORE = new Set(['output', 'node_modules', '.git']);

const walkDir = (dir) => {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (WALK_IGNORE.has(entry.name)) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath));
    } else {
      entries.push(fullPath);
    }
  });
  return entries;
};

const isHistoricalFile = (filePath) => filePath.toLowerCase().includes('historical data') && filePath.toLowerCase().endsWith('.csv');
const isConfigFile = (filePath) => filePath.toLowerCase().includes('configuration sheet') && filePath.toLowerCase().endsWith('.csv');

const parseFinText = (finText) => {
  if (finText === null || finText === undefined) return null;
  const raw = String(finText).trim().toUpperCase();
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const value = parseInt(match[0], 10);
  return Number.isFinite(value) ? value : null;
};

const classifyFinText = (finText) => {
  const raw = String(finText || '').trim().toUpperCase();
  if (!raw) return { type: 'unknown', value: null };
  if (raw === 'WD' || raw === 'DQ' || raw === 'DNS' || raw === 'DNF') {
    return { type: 'withdrawal', value: null };
  }
  if (raw === 'CUT' || raw === 'MC' || raw === 'MDF') {
    return { type: 'cut', value: null };
  }
  const numeric = parseFinText(raw);
  if (numeric !== null) return { type: 'numeric', value: numeric };
  return { type: 'unknown', value: null };
};

const toNumber = (value) => {
  const parsed = parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const loadCourseContext = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
};

const resolveCourseContextEntry = (context, eventId) => {
  if (!context || typeof context !== 'object') return null;
  const key = String(eventId || '').trim();
  if (!key) return null;
  if (context.byEventId && context.byEventId[key]) return context.byEventId[key];
  return null;
};

const normalizeIdList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,|]/)
    .map(item => String(item || '').trim())
    .filter(Boolean);
};

const normalizeCourseNums = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,|]/)
    .map(item => String(item || '').trim())
    .filter(Boolean);
};

const buildEventCourseMap = (context, eventIds, explicitMap = {}) => {
  const map = new Map();
  eventIds.forEach(eventId => {
    const key = String(eventId || '').trim();
    if (!key) return;
    const direct = explicitMap?.[key];
    if (Array.isArray(direct) && direct.length > 0) {
      map.set(key, normalizeCourseNums(direct));
      return;
    }
    const entry = context?.byEventId?.[key];
    if (entry?.courseNums && Array.isArray(entry.courseNums) && entry.courseNums.length > 0) {
      map.set(key, normalizeCourseNums(entry.courseNums));
    }
  });
  return map;
};

const buildTourList = (context, entry) => {
  const entryTours = normalizeIdList(entry?.tours || entry?.tour || entry?.tourIds);
  if (entryTours.length > 0) return entryTours.map(tour => tour.toLowerCase());
  const defaultTours = normalizeIdList(context?.defaultTours);
  if (defaultTours.length > 0) return defaultTours.map(tour => tour.toLowerCase());
  return ['pga'];
};

const logGamma = (z) => {
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = p[0];
  for (let i = 1; i < p.length; i++) {
    x += p[i] / (z + i);
  }
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};

const betacf = (a, b, x) => {
  const MAX_ITER = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x / qap);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    let m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
};

const betai = (a, b, x) => {
  if (x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;
  const lnBeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(a, b, x) / a;
  }
  return 1 - front * betacf(b, a, 1 - x) / b;
};

const tCdf = (tValue, df) => {
  if (!Number.isFinite(tValue) || !Number.isFinite(df) || df <= 0) return NaN;
  const x = df / (df + tValue * tValue);
  const a = df / 2;
  const b = 0.5;
  const ib = betai(a, b, x);
  if (!Number.isFinite(ib)) return NaN;
  if (tValue >= 0) {
    return 1 - 0.5 * ib;
  }
  return 0.5 * ib;
};

const erf = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
};

const normalCdf = (x) => 0.5 * (1 + erf(x / Math.sqrt(2)));

const computeRegression = (pairs) => {
  const n = pairs.length;
  if (n < 3) return null;
  const xs = pairs.map(p => p.priorStarts);
  const ys = pairs.map(p => p.finishPosition);
  const meanX = xs.reduce((sum, v) => sum + v, 0) / n;
  const meanY = ys.reduce((sum, v) => sum + v, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r = (sxx === 0 || syy === 0) ? 0 : sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const tStat = r === 0 ? 0 : r * Math.sqrt(df / (1 - r * r));
  let pValue;
  if (df >= 30) {
    pValue = 2 * (1 - normalCdf(Math.abs(tStat)));
  } else {
    pValue = 2 * (1 - tCdf(Math.abs(tStat), df));
  }
  pValue = Math.min(1, Math.max(0, pValue));
  return { n, slope, intercept, r, tStat, pValue };
};


const normalizeHistoricalRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  const dgId = row.dg_id || row.dgId || row.player_id || row.playerId || row.id;
  const eventId = row.event_id || row.eventId || row.tournament_id || row.tournamentId;
  if (!dgId || !eventId) return null;
  const normalizedCourseNum = row.course_num || row.courseNum || row.course || row.course_id || row.courseId || null;
  return {
    ...row,
    dg_id: String(dgId).trim(),
    player_name: row.player_name || row.playerName || row.name || null,
    event_id: String(eventId).trim(),
    course_num: normalizedCourseNum !== null && normalizedCourseNum !== undefined
      ? String(normalizedCourseNum).trim()
      : null,
    fin_text: row.fin_text ?? row.finish ?? row.finishPosition ?? row.fin ?? row.position ?? null,
    event_completed: row.event_completed ?? row.eventCompleted ?? row.end_date ?? row.completed ?? row.date ?? null,
    year: row.year ?? row.season ?? row.season_year ?? row.seasonYear ?? null,
    season: row.season ?? row.year ?? null,
    round_num: row.round_num ?? row.roundNum ?? row.round ?? null
  };
};

const buildMonthSet = (monthsBack = 3) => {
  const now = new Date();
  const months = new Set();
  for (let i = 0; i <= monthsBack; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
  }
  return months;
};

const isRowInRecentMonths = (row, monthSet) => {
  const date = parseDate(row.event_completed || row.date || row.start_date || row.eventCompleted);
  if (!date) return false;
  const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
  return monthSet.has(key);
};


const normalizeEventKey = (row) => {
  const year = row.year || row.season || row.event_year || '';
  const eventId = row.event_id || row.eventId || '';
  return `${year}-${eventId}`;
};

const buildEventStats = (rows) => {
  const eventMaxFinish = new Map();
  rows.forEach(row => {
    const eventKey = normalizeEventKey(row);
    const fin = classifyFinText(row.fin_text);
    if (fin.type === 'numeric' && Number.isFinite(fin.value)) {
      const currentMax = eventMaxFinish.get(eventKey) ?? null;
      if (currentMax === null || fin.value > currentMax) {
        eventMaxFinish.set(eventKey, fin.value);
      }
    }
  });
  return eventMaxFinish;
};

const buildEventIdCourseMap = (rows) => {
  const counts = new Map();
  rows.forEach(row => {
    const eventId = String(row.event_id || '').trim();
    const courseNum = String(row.course_num || '').trim();
    if (!eventId || !courseNum) return;
    let courseCounts = counts.get(eventId);
    if (!courseCounts) {
      courseCounts = new Map();
      counts.set(eventId, courseCounts);
    }
    courseCounts.set(courseNum, (courseCounts.get(courseNum) || 0) + 1);
  });

  const eventIdToCourse = new Map();
  counts.forEach((courseCounts, eventId) => {
    let bestCourse = null;
    let bestCount = -1;
    courseCounts.forEach((count, courseNum) => {
      if (count > bestCount) {
        bestCount = count;
        bestCourse = courseNum;
      }
    });
    if (bestCourse) eventIdToCourse.set(eventId, bestCourse);
  });
  return eventIdToCourse;
};

const buildCourseSimilarMapFromContext = (context) => {
  const courseSimilarMap = new Map();
  if (!context || !context.byEventId) return courseSimilarMap;

  Object.values(context.byEventId).forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const targetCourseNum = entry.courseNum || (Array.isArray(entry.courseNums) ? entry.courseNums[0] : null);
    if (!targetCourseNum) return;
    const similarCourseNums = new Set([
      String(targetCourseNum).trim()
    ]);
    if (entry.similarCourseCourseNums && typeof entry.similarCourseCourseNums === 'object') {
      Object.values(entry.similarCourseCourseNums).forEach(list => {
        normalizeCourseNums(list).forEach(courseNum => similarCourseNums.add(courseNum));
      });
    }
    const existing = courseSimilarMap.get(String(targetCourseNum).trim()) || new Set();
    similarCourseNums.forEach(courseNum => existing.add(courseNum));
    courseSimilarMap.set(String(targetCourseNum).trim(), existing);
  });

  return courseSimilarMap;
};

const buildInverseSimilarMap = (courseSimilarMap) => {
  const inverse = new Map();
  courseSimilarMap.forEach((similarSet, targetCourseNum) => {
    similarSet.forEach(sourceCourseNum => {
      const targets = inverse.get(sourceCourseNum) || new Set();
      targets.add(targetCourseNum);
      inverse.set(sourceCourseNum, targets);
    });
  });
  return inverse;
};

const buildPlayerEventRecords = (rows) => {
  const recordMap = new Map();
  rows.forEach(row => {
    const eventKey = normalizeEventKey(row);
    const dgId = String(row.dg_id || '').trim();
    if (!dgId || !eventKey) return;
    const recordKey = `${eventKey}-${dgId}`;
    const roundNum = toNumber(row.round_num) ?? 0;
    const existing = recordMap.get(recordKey);
    if (!existing || roundNum >= existing.roundNum) {
      recordMap.set(recordKey, {
        eventKey,
        dgId,
        playerName: row.player_name,
        eventId: row.event_id,
        season: row.season,
        year: row.year,
        eventCompleted: row.event_completed,
        courseNum: String(row.course_num || '').trim(),
        finText: row.fin_text,
        roundNum
      });
    }
  });
  return Array.from(recordMap.values());
};

const buildCourseHistory = (records, eventMaxFinish) => {
  const courseMap = new Map();

  records.forEach(record => {
    const courseNum = record.courseNum;
    if (!courseNum) return;
    const fin = classifyFinText(record.finText);
    if (fin.type === 'withdrawal') return;

    const eventMax = eventMaxFinish.get(record.eventKey) ?? null;
    let finishPosition = null;
    if (fin.type === 'numeric') {
      finishPosition = fin.value;
    } else if (fin.type === 'cut' && eventMax !== null) {
      finishPosition = eventMax + 1;
    }

    if (!Number.isFinite(finishPosition)) return;

    const courseEntry = courseMap.get(courseNum) || [];
    courseEntry.push({
      courseNum,
      dgId: record.dgId,
      playerName: record.playerName,
      eventKey: record.eventKey,
      eventCompleted: record.eventCompleted,
      year: Number(record.year) || null,
      finishPosition
    });
    courseMap.set(courseNum, courseEntry);
  });

  return courseMap;
};

const buildCourseHistoryWithSimilar = (records, eventMaxFinish, courseSimilarMap) => {
  const courseMap = new Map();
  const inverseMap = buildInverseSimilarMap(courseSimilarMap);

  records.forEach(record => {
    const sourceCourseNum = record.courseNum;
    if (!sourceCourseNum) return;
    const fin = classifyFinText(record.finText);
    if (fin.type === 'withdrawal') return;

    const eventMax = eventMaxFinish.get(record.eventKey) ?? null;
    let finishPosition = null;
    if (fin.type === 'numeric') {
      finishPosition = fin.value;
    } else if (fin.type === 'cut' && eventMax !== null) {
      finishPosition = eventMax + 1;
    }

    if (!Number.isFinite(finishPosition)) return;

    const targetCourses = inverseMap.get(sourceCourseNum) || new Set([sourceCourseNum]);

    targetCourses.forEach(targetCourseNum => {
      const courseEntry = courseMap.get(targetCourseNum) || [];
      courseEntry.push({
        courseNum: targetCourseNum,
        sourceCourseNum,
        dgId: record.dgId,
        playerName: record.playerName,
        eventKey: record.eventKey,
        eventCompleted: record.eventCompleted,
        year: Number(record.year) || null,
        finishPosition
      });
      courseMap.set(targetCourseNum, courseEntry);
    });
  });

  return courseMap;
};

const assignPriorStarts = (courseEntries) => {
  const results = [];
  const byPlayer = new Map();

  courseEntries.forEach(entry => {
    const list = byPlayer.get(entry.dgId) || [];
    list.push(entry);
    byPlayer.set(entry.dgId, list);
  });

  byPlayer.forEach(entries => {
    entries.sort((a, b) => {
      const dateA = parseDate(a.eventCompleted);
      const dateB = parseDate(b.eventCompleted);
      if (dateA && dateB) return dateA - dateB;
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      if (a.year && b.year) return a.year - b.year;
      return String(a.eventKey).localeCompare(String(b.eventKey));
    });

    entries.forEach((entry, index) => {
      results.push({
        ...entry,
        priorStarts: index
      });
    });
  });

  return results;
};

const run = async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const context = loadCourseContext(COURSE_CONTEXT_PATH);
  const contextEntry = resolveCourseContextEntry(context, PRE_TOURNAMENT_EVENT_ID);
  const tours = buildTourList(context, contextEntry);
  const eventId = String(contextEntry?.eventId || PRE_TOURNAMENT_EVENT_ID || '').trim();
  const courseNumList = normalizeCourseNums(contextEntry?.courseNums || contextEntry?.courseNum);
  const similarEventIds = normalizeIdList(contextEntry?.similarCourseIds);
  const puttingEventIds = normalizeIdList(contextEntry?.puttingCourseIds);
  const similarCourseMap = contextEntry?.similarCourseCourseNums || {};
  const puttingCourseMap = contextEntry?.puttingCourseCourseNums || {};

  const eventCourseMap = buildEventCourseMap(context, [eventId].filter(Boolean), { [eventId]: courseNumList });
  const similarEventCourseMap = buildEventCourseMap(context, similarEventIds, similarCourseMap);
  const puttingEventCourseMap = buildEventCourseMap(context, puttingEventIds, puttingCourseMap);

  const lastFiveYears = buildRecentYears(PRE_TOURNAMENT_SEASON, 5);
  const recentMonthSet = buildMonthSet(3);
  const recentMonthYears = new Set(Array.from(recentMonthSet).map(key => parseInt(key.split('-')[0], 10)));
  const recentYears = Array.from(recentMonthYears).filter(year => Number.isFinite(year));
  const yearsToFetch = Array.from(new Set([...lastFiveYears, ...recentYears])).filter(year => Number.isFinite(year));

  let apiPayload = await collectRecords({
    years: yearsToFetch,
    tours,
    dataDir: DATA_DIR,
    datagolfApiKey: DATAGOLF_API_KEY,
    datagolfCacheDir: DATAGOLF_CACHE_DIR,
    datagolfHistoricalTtlMs: DATAGOLF_HISTORICAL_TTL_MS,
    getDataGolfHistoricalRounds,
    preferApi: true
  });
  let rawRows = extractHistoricalRowsFromSnapshotPayload(apiPayload);
  const targetCourseNums = new Set(courseNumList.map(value => String(value).trim()));
  const hasTargetEventRows = rawRows.some(row => {
    const rowEventId = String(row?.event_id || row?.eventId || '').trim();
    if (!rowEventId || rowEventId !== eventId) return false;
    const rowCourse = row?.course_num || row?.courseNum || null;
    const courseKey = rowCourse !== null && rowCourse !== undefined ? String(rowCourse).trim() : '';
    return targetCourseNums.size > 0 ? targetCourseNums.has(courseKey) : true;
  });
  if (!hasTargetEventRows) {
    const fallbackRows = [];
    for (const tour of tours) {
      for (const year of yearsToFetch) {
        try {
          const snapshot = await getDataGolfHistoricalRounds({
            apiKey: DATAGOLF_API_KEY,
            cacheDir: DATAGOLF_CACHE_DIR,
            ttlMs: DATAGOLF_HISTORICAL_TTL_MS,
            allowStale: true,
            tour,
            eventId: 'all',
            year,
            fileFormat: 'json'
          });
          const extracted = extractHistoricalRowsFromSnapshotPayload(snapshot?.payload);
          if (extracted.length > 0) fallbackRows.push(...extracted);
        } catch (error) {
          // Ignore
        }
      }
    }
    if (fallbackRows.length > 0) {
      rawRows = rawRows.concat(fallbackRows);
    }
  }
  if (rawRows.length === 0) {
    console.error('No historical data found in JSON, CSV, or API.');
    process.exit(1);
  }
  
  const scopedEventIds = new Set([
    eventId,
    ...similarEventIds,
    ...puttingEventIds
  ].filter(Boolean).map(String));
  const similarPuttingEventIds = new Set(
    [...similarEventIds, ...puttingEventIds].filter(Boolean).map(String)
  );

  const filteredRows = rawRows
    .map(normalizeHistoricalRow)
    .filter(Boolean)
    .filter(row => {
      const rowEventId = String(row.event_id || '').trim();
      if (!rowEventId) return false;
      const rowYear = parseInt(String(row.year || row.season || '').trim(), 10);
      const inRecentMonths = isRowInRecentMonths(row, recentMonthSet);
      if (inRecentMonths) return true;
      if (rowEventId === eventId && lastFiveYears.includes(rowYear)) {
        const courseNum = row.course_num ? String(row.course_num).trim() : null;
        const allowedCourses = eventCourseMap.get(rowEventId)
          || similarEventCourseMap.get(rowEventId)
          || puttingEventCourseMap.get(rowEventId)
          || null;
        if (!allowedCourses || allowedCourses.length === 0) return true;
        return courseNum ? allowedCourses.includes(courseNum) : false;
      }
      if (similarPuttingEventIds.has(rowEventId)) {
        return false;
      }
      return false;
    });

  if (!filteredRows.length) {
    console.error('No historical rows matched the scoped event/tour filters.');
    process.exit(1);
  }

  const eventMaxFinish = buildEventStats(filteredRows);
  const playerEventRecords = buildPlayerEventRecords(filteredRows);
  const courseMap = buildCourseHistory(playerEventRecords, eventMaxFinish);

  const courseSimilarMap = buildCourseSimilarMapFromContext(context);
  const courseMapWithSimilar = buildCourseHistoryWithSimilar(playerEventRecords, eventMaxFinish, courseSimilarMap);

  const summary = [];
  const detailedRows = [];
  const summarySimilar = [];
  const detailedRowsSimilar = [];

  courseMap.forEach((entries, courseNum) => {
    if (DEBUG) console.log(`DEBUG: courseNum ${courseNum} has ${entries.length} entries`);
    const withPrior = assignPriorStarts(entries);
    withPrior.forEach(entry => detailedRows.push(entry));

    const regression = computeRegression(withPrior);
    if (!regression) {
      if (DEBUG) console.log(`DEBUG: No regression computed for courseNum ${courseNum} (not enough data)`);
      return;
    }

    summary.push({
      courseNum,
      n: regression.n,
      slope: regression.slope,
      intercept: regression.intercept,
      r: regression.r,
      tStat: regression.tStat,
      pValue: regression.pValue
    });
  });

  courseMapWithSimilar.forEach((entries, courseNum) => {
    const withPrior = assignPriorStarts(entries);
    withPrior.forEach(entry => detailedRowsSimilar.push(entry));

    const regression = computeRegression(withPrior);
    if (!regression) return;

    summarySimilar.push({
      courseNum,
      n: regression.n,
      slope: regression.slope,
      intercept: regression.intercept,
      r: regression.r,
      tStat: regression.tStat,
      pValue: regression.pValue
    });
  });

  summary.sort((a, b) => a.pValue - b.pValue);
  summarySimilar.sort((a, b) => a.pValue - b.pValue);

  const summaryPath = path.resolve(OUTPUT_DIR, 'course_history_regression_summary.csv');
  const detailPath = path.resolve(OUTPUT_DIR, 'course_history_regression_details.csv');
  const summarySimilarPath = path.resolve(OUTPUT_DIR, 'course_history_regression_summary_similar.csv');
  const detailSimilarPath = path.resolve(OUTPUT_DIR, 'course_history_regression_details_similar.csv');
  const regressionJsonPath = path.resolve(OUTPUT_DIR, 'course_history_regression.json');
  const regressionNodePath = path.resolve(__dirname, '..', 'utilities', 'courseHistoryRegression.js');

  const summaryLines = [
    'course_num,n,slope,intercept,r,t_stat,p_value'
  ];
  summary.forEach(row => {
    summaryLines.push([
      row.courseNum,
      row.n,
      row.slope.toFixed(6),
      row.intercept.toFixed(6),
      row.r.toFixed(6),
      row.tStat.toFixed(6),
      row.pValue.toFixed(6)
    ].join(','));
  });

  const detailLines = [
    'course_num,dg_id,player_name,event_key,event_completed,year,finish_position,prior_starts'
  ];
  detailedRows.forEach(row => {
    const safeName = String(row.playerName || '').replace(/"/g, '""');
    detailLines.push([
      row.courseNum,
      row.dgId,
      `"${safeName}"`,
      row.eventKey,
      row.eventCompleted || '',
      row.year || '',
      row.finishPosition,
      row.priorStarts
    ].join(','));
  });

  const summarySimilarLines = [
    'course_num,n,slope,intercept,r,t_stat,p_value'
  ];
  summarySimilar.forEach(row => {
    summarySimilarLines.push([
      row.courseNum,
      row.n,
      row.slope.toFixed(6),
      row.intercept.toFixed(6),
      row.r.toFixed(6),
      row.tStat.toFixed(6),
      row.pValue.toFixed(6)
    ].join(','));
  });

  const detailSimilarLines = [
    'course_num,source_course_num,dg_id,player_name,event_key,event_completed,year,finish_position,prior_starts'
  ];
  detailedRowsSimilar.forEach(row => {
    const safeName = String(row.playerName || '').replace(/"/g, '""');
    detailSimilarLines.push([
      row.courseNum,
      row.sourceCourseNum || '',
      row.dgId,
      `"${safeName}"`,
      row.eventKey,
      row.eventCompleted || '',
      row.year || '',
      row.finishPosition,
      row.priorStarts
    ].join(','));
  });

  fs.writeFileSync(summaryPath, summaryLines.join('\n'));
  fs.writeFileSync(detailPath, detailLines.join('\n'));
  fs.writeFileSync(summarySimilarPath, summarySimilarLines.join('\n'));
  fs.writeFileSync(detailSimilarPath, detailSimilarLines.join('\n'));

  const regressionMap = summary.reduce((acc, row) => {
    acc[row.courseNum] = {
      slope: Number(row.slope),
      pValue: Number(row.pValue)
    };
    return acc;
  }, {});

  const regressionJson = JSON.stringify(regressionMap, null, 2);
  fs.writeFileSync(regressionJsonPath, regressionJson);

  if (SHOULD_WRITE_TEMPLATES) {
    const regressionHeader = `const COURSE_HISTORY_REGRESSION = ${regressionJson};\n\n`;
    const regressionFn =
      `function getCourseHistoryRegression(courseNum) {\n` +
      `  if (courseNum === null || courseNum === undefined) return null;\n` +
      `  const key = String(courseNum).trim();\n` +
      `  return COURSE_HISTORY_REGRESSION[key] || null;\n` +
      `}\n\n`;
    const regressionNodeExport = `module.exports = { COURSE_HISTORY_REGRESSION, getCourseHistoryRegression };\n`;

    fs.writeFileSync(regressionNodePath, regressionHeader + regressionFn + regressionNodeExport);
    console.log(`✅ Wrote Node utility to ${regressionNodePath}`);
  }

  console.log(`✅ Wrote ${summary.length} course summaries to ${summaryPath}`);
  console.log(`✅ Wrote ${detailedRows.length} detail rows to ${detailPath}`);
  console.log(`✅ Wrote ${summarySimilar.length} similar-course summaries to ${summarySimilarPath}`);
  console.log(`✅ Wrote ${detailedRowsSimilar.length} similar-course detail rows to ${detailSimilarPath}`);
  console.log(`✅ Wrote course history regression JSON to ${regressionJsonPath}`);
  console.log(`ℹ️  Tours used: ${tours.join(', ')}`);
  console.log(`ℹ️  Event scope: ${eventId || 'n/a'} + similar (${similarEventIds.length}) + putting (${puttingEventIds.length})`);
  console.log(`ℹ️  Year scope: last5=[${lastFiveYears.join(', ')}], recentMonths=[${Array.from(recentMonthSet).join(', ')}]`);
  if (!SHOULD_WRITE_TEMPLATES) {
    console.log('ℹ️  Skipped regression utility output (WRITE_TEMPLATES not enabled).');
  }
};

run().catch(error => {
  console.error(`❌ Course history regression failed: ${error.message}`);
  process.exit(1);
});
