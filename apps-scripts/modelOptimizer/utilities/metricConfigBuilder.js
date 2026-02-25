const { getMetricGroups, cleanMetricValue } = require('../core/modelCore');

const buildMetricGroupsFromConfig = ({ getCell, pastPerformanceEnabled, pastPerformanceWeight, currentEventId }) => {
  const groupWeights = {
    driving: cleanMetricValue(getCell(16, 17)),           // Q16
    appShort: cleanMetricValue(getCell(17, 17)),          // Q17
    appMid: cleanMetricValue(getCell(18, 17)),            // Q18
    appLong: cleanMetricValue(getCell(19, 17)),           // Q19
    appVeryLong: cleanMetricValue(getCell(20, 17)),       // Q20
    putting: cleanMetricValue(getCell(21, 17)),           // Q21
    aroundGreen: cleanMetricValue(getCell(22, 17)),       // Q22
    scoring: cleanMetricValue(getCell(23, 17)),           // Q23
    courseManagement: cleanMetricValue(getCell(24, 17))   // Q24
  };

  const metricWeights = {
    drivingDistance: cleanMetricValue(getCell(16, 7)),    // G16
    drivingAccuracy: cleanMetricValue(getCell(16, 8)),    // H16
    sgOTT: cleanMetricValue(getCell(16, 9)),              // I16

    app100GIR: cleanMetricValue(getCell(17, 7)),          // G17
    app100SG: cleanMetricValue(getCell(17, 8)),           // H17
    app100Prox: cleanMetricValue(getCell(17, 9)),         // I17

    app150fwGIR: cleanMetricValue(getCell(18, 7)),        // G18
    app150fwSG: cleanMetricValue(getCell(18, 8)),         // H18
    app150fwProx: cleanMetricValue(getCell(18, 9)),       // I18
    app150roughGIR: cleanMetricValue(getCell(18, 10)),    // J18
    app150roughSG: cleanMetricValue(getCell(18, 11)),     // K18
    app150roughProx: cleanMetricValue(getCell(18, 12)),   // L18

    app200GIR: cleanMetricValue(getCell(19, 7)),          // G19
    app200SG: cleanMetricValue(getCell(19, 8)),           // H19
    app200Prox: cleanMetricValue(getCell(19, 9)),         // I19
    app200roughGIR: cleanMetricValue(getCell(19, 10)),    // J19
    app200roughSG: cleanMetricValue(getCell(19, 11)),     // K19
    app200roughProx: cleanMetricValue(getCell(19, 12)),   // L19

    app200plusGIR: cleanMetricValue(getCell(20, 7)),      // G20
    app200plusSG: cleanMetricValue(getCell(20, 8)),       // H20
    app200plusProx: cleanMetricValue(getCell(20, 9)),     // I20

    sgPutting: cleanMetricValue(getCell(21, 7)),          // G21
    sgAroundGreen: cleanMetricValue(getCell(22, 7)),      // G22

    sgT2G: cleanMetricValue(getCell(23, 7)),              // G23
    scoringAverage: cleanMetricValue(getCell(23, 8)),     // H23
    birdieChances: cleanMetricValue(getCell(23, 9)),      // I23
    scoring_app100SG: cleanMetricValue(getCell(17, 16)),  // P17
    scoring_app150fwSG: cleanMetricValue(getCell(18, 16)), // P18
    scoring_app150roughSG: cleanMetricValue(getCell(23, 12)), // L23
    scoring_app200SG: cleanMetricValue(getCell(19, 16)),  // P19
    scoring_app200plusSG: cleanMetricValue(getCell(20, 16)), // P20
    scoring_app150roughSG_alt: cleanMetricValue(getCell(23, 13)), // M23

    scrambling: cleanMetricValue(getCell(24, 7)),         // G24
    greatShots: cleanMetricValue(getCell(24, 8)),         // H24
    poorShots: cleanMetricValue(getCell(24, 9)),          // I24
    cm_app100Prox: cleanMetricValue(getCell(24, 10)),     // J24
    cm_app150fwProx: cleanMetricValue(getCell(24, 11)),   // K24
    cm_app150roughProx: cleanMetricValue(getCell(24, 12)), // L24
    cm_app150roughProx_over: cleanMetricValue(getCell(24, 13)), // M24
    cm_app200Prox: cleanMetricValue(getCell(24, 14)),     // N24
    cm_app200plusProx: cleanMetricValue(getCell(24, 15))  // O24
  };

  return getMetricGroups({
    pastPerformanceEnabled,
    pastPerformanceWeight,
    currentEventId,
    weights: metricWeights,
    groupWeights
  });
};

module.exports = {
  buildMetricGroupsFromConfig
};
