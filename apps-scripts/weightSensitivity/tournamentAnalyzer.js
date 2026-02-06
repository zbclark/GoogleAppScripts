/**
 * Tournament Analyzer
 * 
 * Main orchestrator for weight optimization workflow:
 * 1. Load historical data (past years + current tournament)
 * 2. Load current field and approach data
 * 3. Compute metric correlations with finish positions
 * 4. Identify inverted metrics (negative correlations)
 * 5. Generate correlation report
 */

const fs = require('fs');
const path = require('path');

const { loadCsv } = require('./utilities/csvLoader');
const { buildPlayerData } = require('./utilities/dataPrep');
const { aggregatePlayerData, generatePlayerRankings } = require('./modelCore');
const { getSharedConfig } = require('./utilities/configParser');
const { buildMetricGroupsFromConfig } = require('./metricConfigBuilder');
const { getTournamentConfig } = require('./utilities/tournamentConfig');

const DATA_DIR = __dirname;
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// Get eventId and tournament name from command line
const EVENT_ID = process.argv[2] || '6';
const TOURNAMENT_NAME = process.argv[3] || null;

function parseFinishPosition(posStr) {
  if (!posStr) return null;
  const str = String(posStr).trim().toUpperCase();
  if (str.startsWith('T')) {
    const num = parseInt(str.substring(1));
    return Number.isNaN(num) ? null : num;
  }
  if (str === 'CUT' || str === 'WD' || str === 'DQ') return 999;
  const num = parseInt(str);
  return Number.isNaN(num) ? null : num;
}

function loadActualResults(resultsPath) {
  const rawData = loadCsv(resultsPath, { skipFirstColumn: true });
  const results = [];

  rawData.forEach(row => {
    const dgId = String(row['DG ID'] || '').trim();
    if (!dgId) return;

    const finishPosition = parseFinishPosition(row['Finish Position']);
    if (finishPosition === null || finishPosition === 999) return;

    results.push({
      dgId,
      name: row['Player Name'] || '',
      finishPosition
    });
  });

  return results;
}

function calculatePearsonCorrelation(xValues, yValues) {
  if (xValues.length < 2) return 0;
  
  const n = xValues.length;
  const meanX = xValues.reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  
  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 0;
  
  return numerator / denom;
}

async function analyzeCorrelations() {
  console.log('\n' + '='.repeat(90));
  console.log(`TOURNAMENT ANALYZER - CORRELATION ANALYSIS`);
  console.log(`Tournament: ${TOURNAMENT_NAME || `Event ${EVENT_ID}`} | Event ID: ${EVENT_ID}`);
  console.log('='.repeat(90));

  // Load tournament configuration
  let tournament;
  try {
    tournament = getTournamentConfig(EVENT_ID, DATA_DIR);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    console.log('\nAvailable tournaments:');
    require('./utilities/tournamentConfig').getAvailableTournaments().forEach(t => {
      console.log(`  - Event ID "${t.id}": ${t.name}`);
    });
    process.exit(1);
  }

  // Load config
  const CONFIG_PATH = tournament.configPath;
  const RESULTS_PATH = tournament.resultsPath;
  const FIELD_PATH = tournament.fieldPath;
  const HISTORY_PATH = tournament.historyPath;
  const APPROACH_PATH = tournament.approachPath;

  console.log('\n🔄 Loading configuration...');
  const sharedConfig = getSharedConfig(CONFIG_PATH);
  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId: sharedConfig.currentEventId
  });

  console.log('🔄 Loading tournament data...');
  const fieldData = loadCsv(FIELD_PATH, { skipFirstColumn: true });
  const historyData = loadCsv(HISTORY_PATH, { skipFirstColumn: true });
  const approachData = loadCsv(APPROACH_PATH, { skipFirstColumn: true });
  const actualResults = loadActualResults(RESULTS_PATH);

  console.log('🔄 Building player data...');
  const { players, historicalData, approachData: approachDataObj } = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId: sharedConfig.currentEventId
  });

  const aggregatedPlayers = aggregatePlayerData(
    players,
    historicalData,
    approachDataObj,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  console.log(`✅ Aggregated ${Object.keys(aggregatedPlayers).length} players`);

  // Generate rankings to compute metrics
  console.log('🔄 Generating player rankings to compute metrics...');
  const rankingResult = generatePlayerRankings(aggregatedPlayers, {
    groups: metricConfig.groups,
    pastPerformance: metricConfig.pastPerformance,
    config: metricConfig.config
  });
  const rankedPlayers = rankingResult.players;

  // Compute correlations
  console.log('🔄 Computing metric correlations...');
  const correlations = [];
  let globalMetricIdx = 0;

  metricConfig.groups.forEach((group, groupIdx) => {
    group.metrics.forEach((metric, localIdx) => {
      const metricLabel = `${group.name}::${metric.name}`;
      const metricValues = [];
      const positions = [];

      rankedPlayers.forEach(player => {
        const actualResult = actualResults.find(r => r.dgId === player.dgId);
        if (!actualResult) return;

        const metricValue = player.metrics[globalMetricIdx];
        if (typeof metricValue === 'number' && !isNaN(metricValue) && isFinite(metricValue)) {
          metricValues.push(metricValue);
          positions.push(actualResult.finishPosition);
        }
      });

      if (metricValues.length < 2) return;

      const correlation = calculatePearsonCorrelation(metricValues, positions);

      correlations.push({
        group: group.name,
        metric: metric.name,
        label: metricLabel,
        correlation,
        absCorrelation: Math.abs(correlation),
        isInverted: correlation < 0,
        sampleSize: metricValues.length
      });

      globalMetricIdx++;
    });
  });

  // Sort and display
  correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  console.log('\n' + '='.repeat(90));
  console.log('METRIC CORRELATIONS (sorted by strength)');
  console.log('='.repeat(90));
  console.log('\n' + 'Metric'.padEnd(50) + 'Correlation'.padEnd(15) + 'Inverted');
  console.log('-'.repeat(90));

  correlations.forEach(c => {
    const inverted = c.isInverted ? '⚠️ YES (invert)' : 'No';
    console.log(
      `${c.label.substring(0, 48).padEnd(50)}${c.correlation.toFixed(4).padStart(14)} ${inverted}`
    );
  });

  // Summary stats
  const invertedCount = correlations.filter(c => c.isInverted).length;
  const positiveCount = correlations.filter(c => !c.isInverted).length;
  const avgPosCorr = correlations
    .filter(c => !c.isInverted)
    .reduce((sum, c) => sum + c.correlation, 0) / positiveCount;
  const avgAbsCorr = correlations
    .reduce((sum, c) => sum + Math.abs(c.correlation), 0) / correlations.length;

  console.log('\n' + '='.repeat(90));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(90));
  console.log(`Total metrics analyzed: ${correlations.length}`);
  console.log(`  ✓ Positive correlation: ${positiveCount}`);
  console.log(`  ⚠️ Negative correlation (inverted): ${invertedCount}`);
  console.log(`\nAverage absolute correlation: ${avgAbsCorr.toFixed(4)}`);
  console.log(`Average positive correlation: ${avgPosCorr.toFixed(4)}`);

  // Group-level analysis
  console.log('\n' + '='.repeat(90));
  console.log('GROUP-LEVEL ANALYSIS');
  console.log('='.repeat(90));
  console.log('\n' + 'Group'.padEnd(35) + 'Avg Abs Corr'.padEnd(15) + 'Inverted Metrics');
  console.log('-'.repeat(90));

  const byGroup = {};
  correlations.forEach(c => {
    if (!byGroup[c.group]) byGroup[c.group] = [];
    byGroup[c.group].push(c);
  });

  Object.entries(byGroup).forEach(([group, metrics]) => {
    const avgAbs = metrics.reduce((sum, m) => sum + Math.abs(m.correlation), 0) / metrics.length;
    const inverted = metrics.filter(m => m.isInverted).map(m => m.metric);
    console.log(
      `${group.padEnd(35)}${avgAbs.toFixed(4).padStart(14)} ${inverted.length > 0 ? inverted.join(', ') : 'None'}`
    );
  });

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    eventId: sharedConfig.currentEventId,
    playersAnalyzed: Object.keys(aggregatedPlayers).length,
    finishersMatched: actualResults.length,
    metricsAnalyzed: correlations.length,
    summary: {
      positiveCorrelations: positiveCount,
      invertedCorrelations: invertedCount,
      averageAbsoluteCorrelation: avgAbsCorr,
      averagePositiveCorrelation: avgPosCorr
    },
    correlations,
    invertedMetrics: correlations.filter(c => c.isInverted).map(c => c.label)
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'correlation_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Results saved to: output/correlation_analysis.json`);

  console.log('\n' + '='.repeat(90) + '\n');
  
  return output;
}

// Run analysis
analyzeCorrelations().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
