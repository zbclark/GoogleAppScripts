const HISTORICAL_METRICS = [
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
  'Rough Proximity'
];

const APPROACH_METRICS = [
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

const LOWER_BETTER = new Set([
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

const PERCENT_FORMAT = '0.00%';
const DEFAULT_FORMAT = '0.000';

const percentMetrics = new Set([
  'Driving Accuracy',
  'Greens in Regulation',
  'Scrambling',
  'Approach <100 GIR',
  'Approach <150 FW GIR',
  'Approach <150 Rough GIR',
  'Approach >150 Rough GIR',
  'Approach <200 FW GIR',
  'Approach >200 FW GIR'
]);

const buildColumns = () => {
  const columns = [
    { name: 'Rank', format: '0', width: 70 },
    { name: 'DG ID', format: '0', width: 70 },
    { name: 'Player Name', format: 'text', width: 140 },
    { name: 'Top 5', format: '0', width: 70 },
    { name: 'Top 10', format: '0', width: 70 },
    { name: 'Weighted Score', format: '0.00' },
    { name: 'Past Perf. Mult.', format: DEFAULT_FORMAT }
  ];

  HISTORICAL_METRICS.forEach((metric) => {
    const format = percentMetrics.has(metric) ? PERCENT_FORMAT : DEFAULT_FORMAT;
    columns.push({
      name: metric,
      group: 'historical',
      format,
      direction: LOWER_BETTER.has(metric) ? 'lower_better' : 'higher_better',
      zScoreColoring: true
    });
    columns.push({
      name: `${metric} Trend`,
      group: 'historical_trend',
      format: DEFAULT_FORMAT,
      direction: LOWER_BETTER.has(metric) ? 'lower_better' : 'higher_better',
      trend: true
    });
  });

  APPROACH_METRICS.forEach((metric) => {
    const format = percentMetrics.has(metric) ? PERCENT_FORMAT : DEFAULT_FORMAT;
    columns.push({
      name: metric,
      group: 'approach',
      format,
      direction: LOWER_BETTER.has(metric) ? 'lower_better' : 'higher_better',
      zScoreColoring: true,
      zeroAsNoData: true
    });
  });

  columns.push(
    { name: 'Refined Weighted Score', format: '0.00', width: 90 },
    { name: 'WAR', format: '0.00', width: 75 },
    { name: 'Delta Trend Score', format: DEFAULT_FORMAT, width: 110, zScoreColoring: true },
    { name: 'Delta Predictive Score', format: DEFAULT_FORMAT, width: 130, zScoreColoring: true }
  );

  return columns;
};

const RANKING_FORMATTING_SCHEMA = {
  sheetName: 'Player Ranking Model',
  headerRow: 5,
  // Row immediately below headers contains a synthetic MEDIAN row in the exported rankings CSV.
  medianRow: 6,
  // Actual player data begins after the MEDIAN row.
  dataStartRow: 7,
  // When applying conditional formatting or computing distribution stats (e.g. z-scores),
  // exclude the MEDIAN row and start at the first player row.
  conditionalFormattingStartRow: 7,
  notesColumn: 1,
  notesColumnHeader: 'Expected Peformance Notes',
  tableStartColumn: 2,
  notesColumnWidth: 350,
  columnDefaults: {
    width: 110,
    format: DEFAULT_FORMAT
  },
  columns: buildColumns(),
  zScoreColoring: {
    thresholds: [0.5, 1, 2],
    positivePalette: ['#a1d99b', '#31a354', '#006837'],
    negativePalette: ['#fb6a4a', '#de2d26', '#a50f15'],
    zeroAsNoData: true,
    zeroColor: '#D3D3D3'
  },
  trendFormatting: {
    backgroundGood: '#E6F4EA',
    backgroundBad: '#FCE8E8',
    textGood: '#137333',
    textBad: '#A50E0E',
    thresholdsByMetricIndex: {
      0: 0.01,
      1: 0.05,
      2: 0.02,
      3: 0.01,
      4: 0.01,
      5: 0.01,
      6: 0.01,
      7: 0.01,
      8: 0.02,
      9: 0.02,
      10: 0.02,
      11: 0.02,
      12: 0.01,
      13: 0.02,
      14: 0.02,
      15: 0.01,
      16: 0.01
    }
  }
};

const getRankingFormattingSchema = () => ({
  ...RANKING_FORMATTING_SCHEMA,
  columns: [...RANKING_FORMATTING_SCHEMA.columns]
});

module.exports = {
  HISTORICAL_METRICS,
  APPROACH_METRICS,
  RANKING_FORMATTING_SCHEMA,
  getRankingFormattingSchema
};
