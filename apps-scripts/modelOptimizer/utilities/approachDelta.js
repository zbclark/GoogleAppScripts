const fs = require('fs');
const path = require('path');
const { loadCsv } = require('./csvLoader');

const METRIC_DEFS = [
  { key: '50_100_fw_gir_rate', isPercent: true },
  { key: '50_100_fw_good_shot_rate', isPercent: true },
  { key: '50_100_fw_low_data_indicator', isPercent: false },
  { key: '50_100_fw_poor_shot_avoid_rate', isPercent: true },
  { key: '50_100_fw_proximity_per_shot', isPercent: false },
  { key: '50_100_fw_sg_per_shot', isPercent: false },
  { key: '50_100_fw_shot_count', isPercent: false },
  { key: '100_150_fw_gir_rate', isPercent: true },
  { key: '100_150_fw_good_shot_rate', isPercent: true },
  { key: '100_150_fw_low_data_indicator', isPercent: false },
  { key: '100_150_fw_poor_shot_avoid_rate', isPercent: true },
  { key: '100_150_fw_proximity_per_shot', isPercent: false },
  { key: '100_150_fw_sg_per_shot', isPercent: false },
  { key: '100_150_fw_shot_count', isPercent: false },
  { key: '150_200_fw_gir_rate', isPercent: true },
  { key: '150_200_fw_good_shot_rate', isPercent: true },
  { key: '150_200_fw_low_data_indicator', isPercent: false },
  { key: '150_200_fw_poor_shot_avoid_rate', isPercent: true },
  { key: '150_200_fw_proximity_per_shot', isPercent: false },
  { key: '150_200_fw_sg_per_shot', isPercent: false },
  { key: '150_200_fw_shot_count', isPercent: false },
  { key: 'under_150_rgh_gir_rate', isPercent: true },
  { key: 'under_150_rgh_good_shot_rate', isPercent: true },
  { key: 'under_150_rgh_low_data_indicator', isPercent: false },
  { key: 'under_150_rgh_poor_shot_avoid_rate', isPercent: true },
  { key: 'under_150_rgh_proximity_per_shot', isPercent: false },
  { key: 'under_150_rgh_sg_per_shot', isPercent: false },
  { key: 'over_150_rgh_gir_rate', isPercent: true },
  { key: 'over_150_rgh_good_shot_rate', isPercent: true },
  { key: 'over_150_rgh_low_data_indicator', isPercent: false },
  { key: 'over_150_rgh_poor_shot_avoid_rate', isPercent: true },
  { key: 'over_150_rgh_proximity_per_shot', isPercent: false },
  { key: 'over_150_rgh_sg_per_shot', isPercent: false },
  { key: 'over_150_rgh_shot_count', isPercent: false },
  { key: 'over_200_fw_gir_rate', isPercent: true },
  { key: 'over_200_fw_good_shot_rate', isPercent: true },
  { key: 'over_200_fw_low_data_indicator', isPercent: false },
  { key: 'over_200_fw_poor_shot_avoid_rate', isPercent: true },
  { key: 'over_200_fw_proximity_per_shot', isPercent: false },
  { key: 'over_200_fw_sg_per_shot', isPercent: false },
  { key: 'over_200_fw_shot_count', isPercent: false }
];

const BUCKETS_WITH_LOW_DATA = [
  '50_100_fw',
  '100_150_fw',
  '150_200_fw',
  'under_150_rgh',
  'over_150_rgh',
  'over_200_fw'
];

const BUCKET_METRIC_SUFFIXES = [
  'gir_rate',
  'good_shot_rate',
  'poor_shot_avoid_rate',
  'proximity_per_shot',
  'sg_per_shot'
];

const LOW_DATA_SHOT_THRESHOLD = 20;

const normalizeDgId = value => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.split('.')[0];
};

const parseNumber = (value, isPercent = false) => {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[%,$]/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  if (isPercent) {
    return parsed > 1 ? parsed / 100 : parsed;
  }
  return parsed;
};

const buildApproachIndex = rows => {
  const index = new Map();
  rows.forEach(row => {
    const dgId = normalizeDgId(row.dg_id || row['dg_id']);
    if (!dgId) return;

    const playerName = row.player_name || row['player_name'] || row.name || null;
    const metrics = {};

    METRIC_DEFS.forEach(def => {
      metrics[def.key] = parseNumber(row[def.key], def.isPercent);
    });

    index.set(dgId, {
      dgId,
      playerName,
      metrics
    });
  });

  return index;
};

const computeApproachDeltas = ({ previousRows, currentRows }) => {
  const previousIndex = buildApproachIndex(previousRows);
  const currentIndex = buildApproachIndex(currentRows);

  const allIds = new Set([...previousIndex.keys(), ...currentIndex.keys()]);
  const deltaRows = [];

  allIds.forEach(dgId => {
    const prev = previousIndex.get(dgId);
    const curr = currentIndex.get(dgId);
    const playerName = curr?.playerName || prev?.playerName || null;

    const row = {
      dg_id: dgId,
      player_name: playerName
    };

    METRIC_DEFS.forEach(def => {
      const prevValue = prev?.metrics?.[def.key] ?? null;
      const currValue = curr?.metrics?.[def.key] ?? null;
      const deltaValue = (prevValue !== null && currValue !== null)
        ? currValue - prevValue
        : null;

      row[`prev_${def.key}`] = prevValue;
      row[`curr_${def.key}`] = currValue;
      row[`delta_${def.key}`] = deltaValue;
    });

    BUCKETS_WITH_LOW_DATA.forEach(bucket => {
      const shotKey = `${bucket}_shot_count`;
      const goodRateKey = `${bucket}_good_shot_rate`;
      const poorAvoidKey = `${bucket}_poor_shot_avoid_rate`;
      const lowDataKey = `${bucket}_low_data_indicator`;

      const prevShots = prev?.metrics?.[shotKey] ?? null;
      const currShots = curr?.metrics?.[shotKey] ?? null;
      const prevGoodRate = prev?.metrics?.[goodRateKey] ?? null;
      const currGoodRate = curr?.metrics?.[goodRateKey] ?? null;
      const prevPoorAvoid = prev?.metrics?.[poorAvoidKey] ?? null;
      const currPoorAvoid = curr?.metrics?.[poorAvoidKey] ?? null;
      const prevLowData = prev?.metrics?.[lowDataKey] ?? null;
      const currLowData = curr?.metrics?.[lowDataKey] ?? null;

      const maxShots = Math.max(prevShots ?? 0, currShots ?? 0);
      const hasLowDataFlag = prevLowData === 1 || currLowData === 1;
      const allowLowData = !hasLowDataFlag || maxShots >= LOW_DATA_SHOT_THRESHOLD;

      if (!allowLowData) {
        BUCKET_METRIC_SUFFIXES.forEach(suffix => {
          row[`delta_${bucket}_${suffix}`] = null;
        });
      }

      const prevGoodCount = (prevShots !== null && prevGoodRate !== null)
        ? prevShots * prevGoodRate
        : null;
      const currGoodCount = (currShots !== null && currGoodRate !== null)
        ? currShots * currGoodRate
        : null;
      const deltaGoodCount = (allowLowData && prevGoodCount !== null && currGoodCount !== null)
        ? currGoodCount - prevGoodCount
        : null;

      const prevPoorCount = (prevShots !== null && prevPoorAvoid !== null)
        ? prevShots * (1 - prevPoorAvoid)
        : null;
      const currPoorCount = (currShots !== null && currPoorAvoid !== null)
        ? currShots * (1 - currPoorAvoid)
        : null;
      const deltaPoorCount = (allowLowData && prevPoorCount !== null && currPoorCount !== null)
        ? currPoorCount - prevPoorCount
        : null;

      const deltaGoodRate = (allowLowData && prevGoodRate !== null && currGoodRate !== null)
        ? currGoodRate - prevGoodRate
        : null;
      const deltaPoorAvoidRate = (allowLowData && prevPoorAvoid !== null && currPoorAvoid !== null)
        ? currPoorAvoid - prevPoorAvoid
        : null;

      const volumeWeight = allowLowData && (prevShots !== null || currShots !== null)
        ? Math.sqrt((prevShots ?? 0) + (currShots ?? 0))
        : null;

      const weightedDeltaGoodRate = (deltaGoodRate !== null && volumeWeight !== null)
        ? deltaGoodRate * volumeWeight
        : null;
      const weightedDeltaPoorAvoidRate = (deltaPoorAvoidRate !== null && volumeWeight !== null)
        ? deltaPoorAvoidRate * volumeWeight
        : null;

      row[`prev_${bucket}_good_shot_count`] = prevGoodCount;
      row[`curr_${bucket}_good_shot_count`] = currGoodCount;
      row[`delta_${bucket}_good_shot_count`] = deltaGoodCount;

      row[`prev_${bucket}_poor_shot_count`] = prevPoorCount;
      row[`curr_${bucket}_poor_shot_count`] = currPoorCount;
      row[`delta_${bucket}_poor_shot_count`] = deltaPoorCount;

      row[`delta_${bucket}_good_shot_rate`] = deltaGoodRate;
      row[`delta_${bucket}_poor_shot_avoid_rate`] = deltaPoorAvoidRate;
      row[`weighted_delta_${bucket}_good_shot_rate`] = weightedDeltaGoodRate;
      row[`weighted_delta_${bucket}_poor_shot_avoid_rate`] = weightedDeltaPoorAvoidRate;
      row[`volume_weight_${bucket}`] = volumeWeight;
    });

    deltaRows.push(row);
  });

  return deltaRows;
};

const APPROACH_SNAPSHOT_DIR = path.resolve(__dirname, '..', 'data', 'approach_snapshot');
const SNAPSHOT_PREFIX = 'snapshot:';

const resolveWildcardPath = (inputPath) => {
  if (!inputPath || !/[\*?]/.test(String(inputPath))) return inputPath;
  const absolutePath = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(inputPath);
  const dirName = path.dirname(absolutePath);
  if (!fs.existsSync(dirName)) return inputPath;

  const pattern = path.basename(absolutePath);
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  const matches = fs.readdirSync(dirName)
    .filter(name => regex.test(name))
    .map(name => path.join(dirName, name));

  if (matches.length === 0) return inputPath;
  matches.sort((a, b) => {
    const statA = fs.statSync(a);
    const statB = fs.statSync(b);
    return statB.mtimeMs - statA.mtimeMs;
  });
  return matches[0];
};

const listYtdArchives = () => {
  if (!fs.existsSync(APPROACH_SNAPSHOT_DIR)) return [];
  return fs.readdirSync(APPROACH_SNAPSHOT_DIR)
    .filter(name => /^approach_ytd_\d{4}-\d{2}-\d{2}\.json$/i.test(name))
    .map(name => ({
      name,
      path: path.resolve(APPROACH_SNAPSHOT_DIR, name),
      date: name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || ''
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const resolveSnapshotSelector = (selector) => {
  const normalized = String(selector || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'l24') {
    return path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_l24.json');
  }
  if (normalized === 'l12') {
    return path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_l12.json');
  }
  if (normalized === 'ytd_latest' || normalized === 'latest') {
    return path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_ytd_latest.json');
  }

  if (normalized === 'current') {
    const archives = listYtdArchives();
    if (archives.length > 0) return archives[archives.length - 1].path;
    return path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_ytd_latest.json');
  }

  if (normalized === 'previous') {
    const archives = listYtdArchives();
    if (archives.length > 1) return archives[archives.length - 2].path;
    if (archives.length === 1) return archives[0].path;
    return path.resolve(APPROACH_SNAPSHOT_DIR, 'approach_ytd_latest.json');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return path.resolve(APPROACH_SNAPSHOT_DIR, `approach_ytd_${normalized}.json`);
  }

  return null;
};

const extractApproachRowsFromJson = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.players)) return payload.players;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
};

const loadApproachCsv = (filePath) => {
  if (!filePath) return [];
  let targetPath = filePath;

  if (typeof filePath === 'string' && filePath.startsWith(SNAPSHOT_PREFIX)) {
    const selector = filePath.slice(SNAPSHOT_PREFIX.length);
    const resolved = resolveSnapshotSelector(selector);
    if (resolved) targetPath = resolved;
  }

  if (typeof targetPath === 'string' && targetPath.startsWith(SNAPSHOT_PREFIX)) {
    const selector = targetPath.slice(SNAPSHOT_PREFIX.length);
    const resolved = resolveSnapshotSelector(selector);
    if (resolved) targetPath = resolved;
  }

  targetPath = resolveWildcardPath(targetPath);

  let resolvedPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(targetPath);

  if (!fs.existsSync(resolvedPath)) {
    const baseName = path.basename(String(targetPath));
    if (baseName && baseName === String(targetPath)) {
      const snapshotCandidate = path.resolve(APPROACH_SNAPSHOT_DIR, baseName);
      if (fs.existsSync(snapshotCandidate)) {
        resolvedPath = snapshotCandidate;
      }
    }
  }

  if (!fs.existsSync(resolvedPath)) return [];

  if (resolvedPath.toLowerCase().endsWith('.json')) {
    try {
      const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      return extractApproachRowsFromJson(payload);
    } catch (error) {
      return [];
    }
  }

  return loadCsv(resolvedPath, {
    headerRow: 4,
    skipFirstColumn: true
  });
};

module.exports = {
  METRIC_DEFS,
  loadApproachCsv,
  computeApproachDeltas,
  extractApproachRowsFromJson
};
