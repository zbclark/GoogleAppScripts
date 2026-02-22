const { cleanMetricValue } = require('../core/modelCore');

const parsePosition = (positionValue) => {
  if (!positionValue) return 100;

  const str = String(positionValue).trim().toUpperCase();

  if (str.includes('T')) {
    const num = parseInt(str.replace('T', ''), 10);
    return Number.isNaN(num) ? 100 : num;
  }

  if (str === 'CUT' || str === 'WD' || str === 'DQ') {
    return 100;
  }

  const num = Number(str);
  return Number.isNaN(num) ? 100 : num;
};

const parseEventDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
    // Excel serial date (days since 1899-12-30)
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + numericValue * 86400000);
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const deriveBirdiesOrBetter = (row) => {
  const hasBirdies = row.birdies !== undefined && row.birdies !== null;
  const hasEagles = row.eagles_or_better !== undefined && row.eagles_or_better !== null;
  if (hasBirdies || hasEagles) {
    const birdies = hasBirdies ? cleanMetricValue(row.birdies) : 0;
    const eagles = hasEagles ? cleanMetricValue(row.eagles_or_better) : 0;
    return birdies + eagles;
  }
  if (row.birdies_or_better !== undefined && row.birdies_or_better !== null) {
    return cleanMetricValue(row.birdies_or_better);
  }
  return undefined;
};

const buildPlayerData = ({ fieldData, roundsRawData, approachRawData, currentEventId, currentSeason = null, includeCurrentEventRounds = false }) => {
  const players = {};
  fieldData.forEach(row => {
    const dgId = row.dg_id || row['dg_id'];
    const name = row.player_name || row['player_name'];
    if (dgId && name) {
      players[dgId] = {
        name,
        dgId,
        events: {},
        historicalRounds: [],
        similarRounds: [],
        puttingRounds: [],
        approachMetrics: {}
      };
    }
  });

  const historicalData = [];
  roundsRawData.forEach(row => {
    if (!row.dg_id) return;

    const tournamentYear = row.year || row.season;
    if (!includeCurrentEventRounds) {
      const seasonMatch = currentSeason !== null && currentSeason !== undefined
        ? String(tournamentYear) === String(currentSeason)
        : false;
      const eventMatch = String(row.event_id) === String(currentEventId);
      if (seasonMatch && eventMatch) {
        return;
      }
    }

    const parsedDate = parseEventDate(row.event_completed) || new Date();

    historicalData.push({
      dgId: row.dg_id,
      eventId: row.event_id,
      date: parsedDate,
      roundNum: cleanMetricValue(row.round_num),
      position: parsePosition(row.fin_text),
      metrics: {
        scoringAverage: row.score ? cleanMetricValue(row.score) : undefined,
        eagles: row.eagles_or_better ? cleanMetricValue(row.eagles_or_better) : undefined,
        birdies: row.birdies ? cleanMetricValue(row.birdies) : undefined,
        birdiesOrBetter: deriveBirdiesOrBetter(row),
        strokesGainedTotal: row.sg_total ? cleanMetricValue(row.sg_total) : undefined,
        drivingDistance: row.driving_dist ? cleanMetricValue(row.driving_dist) : undefined,
        drivingAccuracy: row.driving_acc ? cleanMetricValue(row.driving_acc, true) : undefined,
        strokesGainedT2G: row.sg_t2g ? cleanMetricValue(row.sg_t2g) : undefined,
        strokesGainedApp: row.sg_app ? cleanMetricValue(row.sg_app) : undefined,
        strokesGainedArg: row.sg_arg ? cleanMetricValue(row.sg_arg) : undefined,
        strokesGainedOTT: row.sg_ott ? cleanMetricValue(row.sg_ott) : undefined,
        strokesGainedPutt: row.sg_putt ? cleanMetricValue(row.sg_putt) : undefined,
        greensInReg: row.gir ? cleanMetricValue(row.gir, true) : undefined,
        scrambling: row.scrambling ? cleanMetricValue(row.scrambling, true) : undefined,
        greatShots: row.great_shots !== undefined && row.great_shots !== null
          ? cleanMetricValue(row.great_shots)
          : undefined,
        poorShots: row.poor_shots !== undefined && row.poor_shots !== null
          ? cleanMetricValue(row.poor_shots)
          : undefined,
        fairwayProx: row.prox_fw ? cleanMetricValue(row.prox_fw) : undefined,
        roughProx: row.prox_rgh ? cleanMetricValue(row.prox_rgh) : undefined
      }
    });
  });

  const approachData = {};
  approachRawData.forEach(row => {
    const dgId = row.dg_id ? String(row.dg_id).split('.')[0] : null;
    if (!dgId) return;

    approachData[dgId] = {
      '<100': {
        fwGIR: cleanMetricValue(row['50_100_fw_gir_rate'], true),
        strokesGained: cleanMetricValue(row['50_100_fw_sg_per_shot']),
        shotProx: cleanMetricValue(row['50_100_fw_proximity_per_shot'])
      },
      '<150': {
        fwGIR: cleanMetricValue(row['100_150_fw_gir_rate'], true),
        fwStrokesGained: cleanMetricValue(row['100_150_fw_sg_per_shot']),
        fwShotProx: cleanMetricValue(row['100_150_fw_proximity_per_shot']),
        roughGIR: cleanMetricValue(row['under_150_rgh_gir_rate'], true),
        roughStrokesGained: cleanMetricValue(row['under_150_rgh_sg_per_shot']),
        roughShotProx: cleanMetricValue(row['under_150_rgh_proximity_per_shot'])
      },
      '>150 - Rough': {
        roughGIR: cleanMetricValue(row['over_150_rgh_gir_rate'], true),
        roughStrokesGained: cleanMetricValue(row['over_150_rgh_sg_per_shot']),
        roughShotProx: cleanMetricValue(row['over_150_rgh_proximity_per_shot'])
      },
      '<200': {
        fwGIR: cleanMetricValue(row['150_200_fw_gir_rate'], true),
        fwStrokesGained: cleanMetricValue(row['150_200_fw_sg_per_shot']),
        fwShotProx: cleanMetricValue(row['150_200_fw_proximity_per_shot'])
      },
      '>200': {
        fwGIR: cleanMetricValue(row['over_200_fw_gir_rate'], true),
        fwStrokesGained: cleanMetricValue(row['over_200_fw_sg_per_shot']),
        fwShotProx: cleanMetricValue(row['over_200_fw_proximity_per_shot'])
      }
    };
  });

  return { players, historicalData, approachData };
};

module.exports = {
  buildPlayerData,
  parsePosition,
  parseEventDate
};
