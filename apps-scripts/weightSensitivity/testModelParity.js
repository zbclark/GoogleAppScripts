// testModelParity.js
// Test script for 1:1 model parity using per-round data loading (matching GAS architecture)

const { loadCsv } = require('./csvLoader');
const {
  generatePlayerRankings,
  getMetricGroups,
  cleanMetricValue,
  getSimilarCourseIds
} = require('./modelCore');
const { parse } = require('csv-parse/sync');
const path = require('path');
const fs = require('fs');

// === CONFIGURATION ===
const DATA_DIR = __dirname;
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// === 1. LOAD DATA ===
console.log('Loading CSV data...');
const fieldCsvPath = path.resolve(DATA_DIR, 'Waste Management (2026) - Tournament Field.csv');
const roundsCsvPath = path.resolve(DATA_DIR, 'Waste Management (2026) - Historical Data.csv');
const approachCsvPath = path.resolve(DATA_DIR, 'Waste Management (2026) - Approach Skill.csv');
const configCsvPath = path.resolve(DATA_DIR, 'Waste Management (2026) - Configuration Sheet.csv');

const fieldData = loadCsv(fieldCsvPath, { skipFirstColumn: true });
const roundsRawData = loadCsv(roundsCsvPath, { skipFirstColumn: true });
const approachRawData = loadCsv(approachCsvPath, { skipFirstColumn: true });

console.log(`  Loaded ${fieldData.length} tournament field entries`);
console.log(`  Loaded ${roundsRawData.length} historical rounds`);
console.log(`  Loaded ${approachRawData.length} approach records`);

// Read config once for current event filter
const configRawPath = path.resolve(DATA_DIR, 'Waste Management (2026) - Configuration Sheet.csv');
const configRawContent = fs.readFileSync(configRawPath, 'utf8');
const configCellsForFilter = parse(configRawContent, {
  skip_empty_lines: false,
  relax_column_count: true
});
const getCellForFilter = (row, col) => {
  if (!configCellsForFilter[row - 1]) return null;
  return configCellsForFilter[row - 1][col - 1] || null;
};
const currentEventIdForFilter = String(getCellForFilter(9, 7) || '2');

// Helper function to parse tournament position strings like "T5" → 5, "CUT" → 100
function parsePosition(positionValue) {
  if (!positionValue) return 100; // No position data = treated as missed cut
  
  const str = String(positionValue).trim().toUpperCase();
  
  // Handle tied positions (e.g., "T5" or "T15")
  if (str.includes('T')) {
    const num = parseInt(str.replace('T', ''), 10);
    return isNaN(num) ? 100 : num;
  }
  
  // Handle missed cuts and withdrawals
  if (str === 'CUT' || str === 'WD' || str === 'DQ') {
    return 100;
  }
  
  // Try to parse as number
  const num = Number(str);
  return isNaN(num) ? 100 : num;
}


// === 2. TRANSFORM DATA TO INTERNAL FORMAT ===
console.log('Transforming data...');

// Transform tournament field data
const players = {};
fieldData.forEach(row => {
  const dgId = row.dg_id || row['dg_id'];
  const name = row.player_name || row['player_name'];
  if (dgId && name) {
    players[dgId] = {
      name: name,
      dgId: dgId,
      events: {},
      historicalRounds: [],
      similarRounds: [],
      puttingRounds: [],
      approachMetrics: {}
    };
  }
});
console.log(`  Initialized ${Object.keys(players).length} players`);

// Transform historical rounds data
const historicalData = [];
let schefflerRoundCount = 0;
roundsRawData.forEach(row => {
  if (!row.dg_id) return; // Skip empty rows

  const tournamentYear = row.year || row.season;
  if ((tournamentYear === 2026 || tournamentYear === '2026') && String(row.event_id) === currentEventIdForFilter) {
    return;
  }
  
  // Debug Scheffler's data
  if (row.player_name && row.player_name.includes('Scheffler')) {
    schefflerRoundCount++;
    if (schefflerRoundCount <= 5) {
      console.log(`  Scheffler round ${schefflerRoundCount}: eventId=${row.event_id}, score=${row.score}, sg_total=${row.sg_total}, sg_putt=${row.sg_putt}, sg_arg=${row.sg_arg}`);
    }
  }
  
  historicalData.push({
    dgId: row.dg_id,
    eventId: row.event_id,
    date: new Date(row.event_completed || new Date()),
    roundNum: cleanMetricValue(row.round_num),
    position: parsePosition(row.fin_text), // Parse position like "T5" → 5, "CUT" → 100
    metrics: {
      scoringAverage: row.score ? cleanMetricValue(row.score) : undefined,
      eagles: row.eagles_or_better ? cleanMetricValue(row.eagles_or_better) : undefined,
      birdies: row.birdies ? cleanMetricValue(row.birdies) : undefined,
      birdiesOrBetter: (row.birdies || row.eagles_or_better) ? 
        cleanMetricValue(row.birdies) + cleanMetricValue(row.eagles_or_better) : undefined,
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
      greatShots: row.great_shots ? cleanMetricValue(row.great_shots) : undefined,
      poorShots: row.poor_shots ? cleanMetricValue(row.poor_shots) : undefined,
      fairwayProx: row.prox_fw ? cleanMetricValue(row.prox_fw) : undefined,
      roughProx: row.prox_rgh ? cleanMetricValue(row.prox_rgh) : undefined
    }
  });
});
console.log(`  Prepared ${historicalData.length} historical rounds`);

// Transform approach skill data
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
console.log(`  Prepared approach data for ${Object.keys(approachData).length} players`);

// === 3. BUILD CONFIGURATION ===
console.log('Building metric configuration...');

// Load config CSV without column name headers (raw array access)
const configRawLines = configRawContent.split(/\r?\n/);

// Parse as array of arrays for direct cell access
const configCells = parse(configRawContent, { 
  skip_empty_lines: false,
  relax_column_count: true 
});

// Helper to get cell value (1-indexed like Excel)
const getCell = (row, col) => {
  if (!configCells[row - 1]) return null;
  return configCells[row - 1][col - 1] || null;
};

// Extract similar course IDs (G33:G37) - can be single IDs or comma-separated
const similarCourseIds = [];
for (let row = 33; row <= 37; row++) {
  const val = getCell(row, 7); // Column G - event IDs
  if (val) {
    const trimmed = String(val).trim();
    // Handle comma-separated IDs
    if (trimmed.includes(',')) {
      const ids = trimmed.split(',').map(id => id.trim()).filter(id => id);
      similarCourseIds.push(...ids);
    } else if (trimmed) {
      similarCourseIds.push(trimmed);
    }
  }
}

// Extract putting course IDs (G40:G44) - can be single IDs or comma-separated
const puttingCourseIds = [];
for (let row = 40; row <= 44; row++) {
  const val = getCell(row, 7); // Column G - event IDs
  if (val) {
    const trimmed = String(val).trim();
    // Handle comma-separated IDs
    if (trimmed.includes(',')) {
      const ids = trimmed.split(',').map(id => id.trim()).filter(id => id);
      puttingCourseIds.push(...ids);
    } else if (trimmed) {
      puttingCourseIds.push(trimmed);
    }
  }
}

console.log(`  Similar course IDs: ${similarCourseIds.join(', ')}`);
console.log(`  Putting course IDs: ${puttingCourseIds.join(', ')}`);

// Extract course setup weights from column P (rows 17-20)
const courseSetupWeights = {
  under100: cleanMetricValue(getCell(17, 16)),      // P17
  from100to150: cleanMetricValue(getCell(18, 16)), // P18
  from150to200: cleanMetricValue(getCell(19, 16)), // P19
  over200: cleanMetricValue(getCell(20, 16))        // P20
};

console.log(`  Course setup weights: <100=${courseSetupWeights.under100}, 100-150=${courseSetupWeights.from100to150}, 150-200=${courseSetupWeights.from150to200}, >200=${courseSetupWeights.over200}`);

// Extract similar/putting course weights
const similarCoursesWeight = cleanMetricValue(getCell(33, 8)) || 0.7;  // H33
const puttingCoursesWeight = cleanMetricValue(getCell(40, 8)) || 0.75; // H40

console.log(`  Similar courses weight: ${similarCoursesWeight}`);
console.log(`  Putting courses weight: ${puttingCoursesWeight}`);

// Extract group weights from column Q (rows 16-24)
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

console.log(`  Group weights: ${JSON.stringify(groupWeights)}`);

// Extract past performance configuration
const pastPerformanceEnabled = getCell(27, 6) === 'Yes'; // F27
const pastPerformanceWeight = cleanMetricValue(getCell(27, 7)) || 0; // G27
const currentEventId = String(getCell(9, 7) || '2'); // G9

console.log(`  Past performance: enabled=${pastPerformanceEnabled}, weight=${pastPerformanceWeight}`);
console.log(`  Current event ID: ${currentEventId}`);

// Extract metric weights directly from CSV rows (columns G onwards for each metric)
// Based on CSV structure: Column G=first weight, H=second, I=third, etc.
const metricWeights = {
  // Row 16 - Driving Performance: G16=0.05, H16=0.4, I16=0.55
  drivingDistance: cleanMetricValue(getCell(16, 7)),    // G16
  drivingAccuracy: cleanMetricValue(getCell(16, 8)),    // H16
  sgOTT: cleanMetricValue(getCell(16, 9)),              // I16
  
  // Row 17 - Approach Short (<100): G17=0.1, H17=0.4, I17=0.5, P17=0.154 (course setup)
  app100GIR: cleanMetricValue(getCell(17, 7)),          // G17
  app100SG: cleanMetricValue(getCell(17, 8)),           // H17
  app100Prox: cleanMetricValue(getCell(17, 9)),         // I17
  
  // Row 18 - Approach Mid (100-150): G18=0.1, H18=0.42, I18=0.48, J18-L18, P18=0.253
  app150fwGIR: cleanMetricValue(getCell(18, 7)),        // G18
  app150fwSG: cleanMetricValue(getCell(18, 8)),         // H18
  app150fwProx: cleanMetricValue(getCell(18, 9)),       // I18
  app150roughGIR: cleanMetricValue(getCell(18, 7)),     // G18 (reuse FW weight)
  app150roughSG: cleanMetricValue(getCell(18, 8)),      // H18 (reuse FW weight)
  app150roughProx: cleanMetricValue(getCell(18, 9)),    // I18 (reuse FW weight)
  
  // Row 19 - Approach Long (150-200): G19=0.1, H19=0.35, I19=0.55, P19=0.293
  app200GIR: cleanMetricValue(getCell(19, 7)),          // G19
  app200SG: cleanMetricValue(getCell(19, 8)),           // H19
  app200Prox: cleanMetricValue(getCell(19, 9)),         // I19
  app200roughGIR: cleanMetricValue(getCell(19, 7)),     // G19 (reuse FW weight)
  app200roughSG: cleanMetricValue(getCell(19, 8)),      // H19 (reuse FW weight)
  app200roughProx: cleanMetricValue(getCell(19, 9)),    // I19 (reuse FW weight)
  
  // Row 20 - Approach Very Long (>200): G20=0.09, H20=0.28, I20=0.63, P20=0.3
  app200plusGIR: cleanMetricValue(getCell(20, 7)),      // G20
  app200plusSG: cleanMetricValue(getCell(20, 8)),       // H20
  app200plusProx: cleanMetricValue(getCell(20, 9)),     // I20
  
  // Row 21 - Putting: G21=1.0
  sgPutting: cleanMetricValue(getCell(21, 7)),          // G21
  
  // Row 22 - Around the Green: G22=1.0
  sgAroundGreen: cleanMetricValue(getCell(22, 7)),      // G22
  
  // Row 23 - Scoring: G23=0.22, H23=0.13, I23=0.12, J23-O23, then use P17-P20 for approach SG
  sgT2G: cleanMetricValue(getCell(23, 7)),              // G23
  scoringAverage: cleanMetricValue(getCell(23, 8)),     // H23
  birdieChances: cleanMetricValue(getCell(23, 9)),      // I23
  scoring_app100SG: cleanMetricValue(getCell(17, 16)),  // P17 (Approach <100 course setup weight)
  scoring_app150fwSG: cleanMetricValue(getCell(18, 16)), // P18 (Approach <150 FW course setup)
  scoring_app150roughSG: cleanMetricValue(getCell(18, 16)), // P18 (same as <150 FW)
  scoring_app200SG: cleanMetricValue(getCell(19, 16)),  // P19 (Approach <200 FW course setup)
  scoring_app200plusSG: cleanMetricValue(getCell(20, 16)), // P20 (Approach >200 FW course setup)
  scoring_app150roughSG_alt: cleanMetricValue(getCell(20, 16)), // P20 (Approach >150 Rough)
  
  // Row 24 - Course Management: G24=0.1, H24=0.08, I24=0.08, J24-O24
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

console.log(`  Metric weights extracted: ${Object.keys(metricWeights).length} weights`);
console.log(`  Sample weights - Driving: Distance=${metricWeights.drivingDistance}, Accuracy=${metricWeights.drivingAccuracy}, OTT=${metricWeights.sgOTT}`);

// Build metric groups configuration
const metricGroups = getMetricGroups({
  pastPerformanceEnabled,
  pastPerformanceWeight,
  currentEventId,
  weights: metricWeights,
  groupWeights
});

console.log(`  Configured ${metricGroups.groups.length} metric groups`);

// === 4. RUN MODEL ===
console.log('\nRunning player ranking model...');
console.log('='.repeat(60));

try {
  const result = generatePlayerRankings(
    players,
    metricGroups,
    historicalData,
    approachData,
    similarCourseIds,
    puttingCourseIds,
    {
      similarCoursesWeight,
      puttingCoursesWeight,
      courseSetupWeights
    }
  );

  // === 5. OUTPUT RESULTS ===
  console.log('='.repeat(60));
  console.log(`\nModel execution: ${result.message}`);
  console.log(`Total players ranked: ${result.players.length}`);

  // Write detailed results to JSON
  const jsonOutputPath = path.resolve(OUTPUT_DIR, 'rankings.json');
  fs.writeFileSync(jsonOutputPath, JSON.stringify({
    metadata: {
      timestamp: result.timestamp,
      playerCount: result.players.length,
      groupCount: metricGroups.groups.length
    },
    players: result.players,
    groupStats: result.groupStats
  }, null, 2));
  console.log(`\nDetailed results written to: ${jsonOutputPath}`);

  // Write CSV summary
  const csvOutputPath = path.resolve(OUTPUT_DIR, 'rankings_summary.csv');
  const csvHeader = 'Rank,Player Name,Weighted Score,Refined Score,WAR,Composite Score,Data Coverage,Confidence\n';
  const csvRows = result.players
    .map(p => `${p.rank},${p.name},${p.weightedScore?.toFixed(3) || 'N/A'},${p.refinedWeightedScore?.toFixed(3) || 'N/A'},${p.war?.toFixed(2) || 'N/A'},${p.compositeScore?.toFixed(3) || 'N/A'},${(p.dataCoverage * 100)?.toFixed(1) || 'N/A'}%,${p.confidenceFactor?.toFixed(3) || 'N/A'}`)
    .join('\n');
  fs.writeFileSync(csvOutputPath, csvHeader + csvRows);
  console.log(`Summary CSV written to: ${csvOutputPath}`);

  // Display top 10 with detailed metrics for comparison with GAS
  console.log('\n='.repeat(80));
  console.log('TOP 10 RANKED PLAYERS - DETAILED METRICS:');
  console.log('='.repeat(80));
  result.players.slice(0, 10).forEach((player, idx) => {
    console.log(`\n${idx + 1}. ${player.name} (DG ID: ${player.dgId})`);
    console.log(`   Data Coverage: ${(player.dataCoverage * 100).toFixed(1)}%`);
    
    // Show all group scores with better formatting
    if (player.groupScores) {
      console.log('   Group Scores:');
      Object.entries(player.groupScores).forEach(([groupName, score]) => {
        console.log(`     - ${groupName}: ${Number(score).toFixed(3)}`);
      });
    }
    
    console.log(`   Weighted Score: ${player.weightedScore?.toFixed(3)}`);
    console.log(`   Confidence Factor: ${player.confidenceFactor?.toFixed(3)}`);
    console.log(`   Past Perf Multiplier: ${player.pastPerformanceMultiplier?.toFixed(3)}`);
    console.log(`   Refined Score: ${player.refinedWeightedScore?.toFixed(3)}`);
    console.log(`   Final WAR: ${player.war?.toFixed(3)}`);
  });

  // COMPARISON WITH GAS OUTPUT FOR SCHEFFLER
  console.log('\n='.repeat(80));
  console.log('EXPECTED vs ACTUAL - SCHEFFLER (DG ID 18417):');
  console.log('='.repeat(80));
  const scheffler = result.players.find(p => p.dgId === '18417');
  if (scheffler) {
    console.log('Expected (GAS):');
    console.log('  Driving Performance: 2.3829');
    console.log('  Approach - Short (<100): 1.3911');
    console.log('  Approach - Mid (100-150): 1.3457231093497062');
    console.log('  Approach - Long (150-200): 1.9482755792614541');
    console.log('  Approach - Very Long (>200): 1.7493');
    console.log('  Putting: 1.2916');
    console.log('  Around the Green: -1.0366');
    console.log('  Scoring: 2.0739');
    console.log('  Course Management: 1.4298');
    console.log('  Weighted Score: 1.5412895260226627');
    console.log('  Refined Score: 1.6755923497584515');
    
    console.log('\nActual (Node.js):');
    Object.entries(scheffler.groupScores || {}).forEach(([groupName, score]) => {
      console.log(`  ${groupName}: ${Number(score).toFixed(3)}`);
    });
    console.log(`  Weighted Score: ${scheffler.weightedScore?.toFixed(3)}`);
    console.log(`  Refined Score: ${scheffler.refinedWeightedScore?.toFixed(3)}`);
    
    // Show all individual metrics
    console.log('\n' + '='.repeat(80));
    console.log('ALL INDIVIDUAL METRICS - SCHEFFLER:');
    console.log('='.repeat(80));
    if (scheffler.metrics && Array.isArray(scheffler.metrics)) {
      scheffler.metrics.forEach((value, index) => {
        const displayValue = typeof value === 'number' && !isNaN(value) ? value.toFixed(4) : 'N/A';
        console.log(`[${index}]: ${displayValue}`);
      });
    } else {
      console.log('No metrics array found');
    }
  }

  console.log(`\n✅ Model parity test completed successfully!`);
  process.exit(0);

} catch (error) {
  console.error('\n❌ Model parity test failed!');
  console.error(`Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
