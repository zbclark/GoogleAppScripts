const fs = require('fs');
const path = require('path');
const { loadCsv } = require('../utilities/csvLoader');
const { loadConfigCells, getCell, collectEventIds } = require('../utilities/configParser');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OUTPUT_DIR = process.env.PRE_TOURNAMENT_OUTPUT_DIR
  ? path.resolve(process.env.PRE_TOURNAMENT_OUTPUT_DIR)
  : path.resolve(__dirname, '..', 'output');
const SHOULD_WRITE_TEMPLATES = String(process.env.WRITE_TEMPLATES || '').trim().toLowerCase() === 'true';

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

const collectRecords = () => {
  const files = walkDir(DATA_DIR).filter(isHistoricalFile);
  if (!files.length) {
    console.error('No historical data files found.');
    process.exit(1);
  }

  const rawRows = [];
  files.forEach(filePath => {
    const rows = loadCsv(filePath, { skipFirstColumn: true });
    rows.forEach(row => rawRows.push(row));
  });

  return rawRows;
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

const buildCourseSimilarMap = (configFiles, eventIdToCourse) => {
  const courseSimilarMap = new Map();

  configFiles.forEach(configPath => {
    const cells = loadConfigCells(configPath);
    const currentEventId = String(getCell(cells, 9, 7) || '').trim();
    if (!currentEventId) return;
    const targetCourseNum = eventIdToCourse.get(currentEventId);
    if (!targetCourseNum) return;

    const similarEventIds = collectEventIds(cells, 33, 37, 7);
    const similarCourseNums = new Set([
      targetCourseNum
    ]);

    similarEventIds.forEach(eventId => {
      const courseNum = eventIdToCourse.get(String(eventId));
      if (courseNum) similarCourseNums.add(courseNum);
    });

    const existing = courseSimilarMap.get(targetCourseNum) || new Set();
    similarCourseNums.forEach(courseNum => existing.add(courseNum));
    courseSimilarMap.set(targetCourseNum, existing);
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

const run = () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rawRows = collectRecords();
  const eventMaxFinish = buildEventStats(rawRows);
  const eventIdToCourse = buildEventIdCourseMap(rawRows);
  const playerEventRecords = buildPlayerEventRecords(rawRows);
  const courseMap = buildCourseHistory(playerEventRecords, eventMaxFinish);

  const configFiles = walkDir(DATA_DIR).filter(isConfigFile);
  const courseSimilarMap = buildCourseSimilarMap(configFiles, eventIdToCourse);
  const courseMapWithSimilar = buildCourseHistoryWithSimilar(playerEventRecords, eventMaxFinish, courseSimilarMap);

  const summary = [];
  const detailedRows = [];
  const summarySimilar = [];
  const detailedRowsSimilar = [];

  courseMap.forEach((entries, courseNum) => {
    const withPrior = assignPriorStarts(entries);
    withPrior.forEach(entry => detailedRows.push(entry));

    const regression = computeRegression(withPrior);
    if (!regression) return;

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
  const regressionGasPath = path.resolve(__dirname, '..', '..', 'Golf_Algorithm_Library', 'utilities', 'courseHistoryRegression.js');

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

  if (SHOULD_WRITE_TEMPLATES) {
    const regressionJson = JSON.stringify(regressionMap, null, 2);
    fs.writeFileSync(regressionJsonPath, regressionJson);

    const regressionHeader = `const COURSE_HISTORY_REGRESSION = ${regressionJson};\n\n`;
    const regressionFn =
      `function getCourseHistoryRegression(courseNum) {\n` +
      `  if (courseNum === null || courseNum === undefined) return null;\n` +
      `  const key = String(courseNum).trim();\n` +
      `  return COURSE_HISTORY_REGRESSION[key] || null;\n` +
      `}\n\n`;
    const regressionNodeExport = `module.exports = { COURSE_HISTORY_REGRESSION, getCourseHistoryRegression };\n`;

    fs.writeFileSync(regressionNodePath, regressionHeader + regressionFn + regressionNodeExport);
    fs.writeFileSync(regressionGasPath, regressionHeader + regressionFn);
  }

  console.log(`✅ Wrote ${summary.length} course summaries to ${summaryPath}`);
  console.log(`✅ Wrote ${detailedRows.length} detail rows to ${detailPath}`);
  console.log(`✅ Wrote ${summarySimilar.length} similar-course summaries to ${summarySimilarPath}`);
  console.log(`✅ Wrote ${detailedRowsSimilar.length} similar-course detail rows to ${detailSimilarPath}`);
  if (SHOULD_WRITE_TEMPLATES) {
    console.log(`✅ Wrote course history regression JSON to ${regressionJsonPath}`);
    console.log(`✅ Wrote Node utility to ${regressionNodePath}`);
    console.log(`✅ Wrote GAS utility to ${regressionGasPath}`);
  } else {
    console.log('ℹ️  Skipped regression utility output (WRITE_TEMPLATES not enabled).');
  }
};

run();
