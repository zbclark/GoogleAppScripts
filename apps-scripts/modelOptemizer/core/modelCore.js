/**
 * Model Core - Ported from results.js
 * This file contains the exact calculation logic from the production Google Apps Script model
 * The ONLY difference is data loading (CSV vs Google Sheets API)
 */

// Toggle verbose logging for model calculations
const fs = require('fs');
let getCourseHistoryRegression = null;
try {
  ({ getCourseHistoryRegression } = require('../utilities/courseHistoryRegression'));
} catch (err) {
  getCourseHistoryRegression = null;
}
const DEBUG_LOGGING = false;
const DEBUG_SNAPSHOT = String(process.env.DEBUG_SNAPSHOT || '').toLowerCase() === 'true';
const TRACE_PLAYER = String(process.env.TRACE_PLAYER || '').trim().toLowerCase();
let traceLogInitialized = false;
const snapshotLog = (...args) => {
  if (!DEBUG_SNAPSHOT) return;
  globalThis.console.log(...args);
};
const traceLog = (...args) => {
  if (!TRACE_PLAYER) return;
  globalThis.console.log(...args);

  const tracePath = String(process.env.TRACE_LOG_PATH || '').trim();
  if (!tracePath) return;

  if (!traceLogInitialized) {
    try {
      fs.writeFileSync(tracePath, '');
    } catch (err) {
      return;
    }
    traceLogInitialized = true;
  }

  const message = args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    try {
      return JSON.stringify(arg);
    } catch (err) {
      return String(arg);
    }
  }).join(' ');

  try {
    fs.appendFileSync(tracePath, `${message}\n`);
  } catch (err) {
    // ignore file write errors to avoid affecting scoring
  }
};
const shouldTracePlayer = (name) => TRACE_PLAYER && String(name || '').toLowerCase().includes(TRACE_PLAYER);
const console = DEBUG_LOGGING
  ? globalThis.console
  : {
      log: () => {},
      warn: () => {},
      error: () => {}
    };

// Constants from results.js
const METRIC_MAX_VALUES = {
  'Approach <100 Prox': 40,                             // Avg: 16ft from <100y
  'Approach <150 FW Prox': 50,      // Avg: 23.6 ft from 125y
  'Approach <150 Rough Prox': 60,   // Avg: 37.9 ft from 
  'Approach >150 Rough Prox': 75,   // Avg: 50 ft         
  'Approach <200 FW Prox': 65,      // Avg: 35ft from 175y
  'Approach >200 FW Prox': 90,      // Avg: 45ft from 210y
  'Fairway Proximity': 60,          // Avg general fairway proximity
  'Rough Proximity': 80,            // Avg: general rough proximity
  'Poor Shots': 12,                 // 12 poor shots/round = terrible performance
  'Scoring Average': 74,            // Refine based on PGA Average
  'Birdie Chances Created': 10      // Composit metric, max value estimate
};

const METRIC_TYPES = {
  LOWER_BETTER: new Set([
    'Poor Shots', 
    'Scoring Average',
    'Fairway Proximity',
    'Rough Proximity',
    'Approach <100 Prox',
    'Approach <150 FW Prox',
    'Approach <150 Rough Prox',
    'Approach >150 Rough Prox',
    'Approach <200 FW Prox',
    'Approach >200 FW Prox']),
  SCORING_AVG: new Set(['Scoring Average']),
  PERCENTAGE: new Set(['Driving Accuracy', 'GIR', 'Scrambling']),
  COUNT: new Set(['Great Shots', 'Birdies or Better']),
  COMPOSITE: new Set(['Birdie Chances Created'])
};

// ============================================================================
// FUNCTIONS PORTED FROM RESULTS.JS
// ============================================================================

module.exports = {
  normalizeApproachSG,
  calculateBCC,
  getApproachMetrics,
  calculateDynamicWeight,
  calculateHistoricalAverages,
  calculateMetricsWithData,
  calculatePlayerMetrics,
  validateKpiWeights,
  getCoverageConfidence,
  calculateMetricTrends,
  smoothData,
  applyTrends,
  calculateWAR,
  normalizeMetricName,
  calculateMetricVolatility,
  prepareRankingOutput,
  cacheGroupStats,
  cleanMetricValue,
  getSimilarCourseIds,
  getMetricGroups,
  aggregatePlayerData,
  generatePlayerRankings,
};

// ============================================================================
// FUNCTION 1: normalizeApproachSG (line 441 in results.js)
// ============================================================================
/**
 * Converts per-shot SG values to per-round values
 * NO CHANGES NEEDED - pure calculation, no data loading
 */
function normalizeApproachSG(perShotValue) {
  // Average number of approach shots per round on PGA Tour
  const AVG_APPROACH_SHOTS_PER_ROUND = 18;
  
  // Convert per-shot value to per-round value
  return perShotValue * AVG_APPROACH_SHOTS_PER_ROUND;
}

// ============================================================================
// FUNCTION 2: calculateBCC (line 450 in results.js)
// ============================================================================
/**
 * Calculates Birdie Chances Created using clean metrics
 * NO CHANGES NEEDED - pure calculation, takes metrics array and weights
 */
function calculateBCC(metrics, courseSetupWeights) {
  // Define metric indices for easier reference (BEFORE BCC insertion)
  const DRIVING_ACCURACY_INDEX = 2;    // Driving accuracy percentage
    
  // GIR indices for different distances
  const GIR_UNDER_100_INDEX = 16;      // Approach <100 GIR
  const GIR_FW_100_TO_150_INDEX = 19;  // Approach <150 FW GIR  
  const GIR_ROUGH_100_TO_150_INDEX = 22; // Approach <150 Rough GIR
  const GIR_ROUGH_OVER_150_INDEX = 25; // Approach >150 Rough GIR
  const GIR_FW_150_TO_200_INDEX = 28;  // Approach <200 FW GIR
  const GIR_FW_OVER_200_INDEX = 31;    // Approach >200 FW GIR
    
  // SG indices
  const SG_PUTTING_INDEX = 7;          // SG Putting
  const SG_UNDER_100_INDEX = 17;       // Approach <100 SG
  const SG_FW_100_TO_150_INDEX = 20;   // Approach <150 FW SG
  const SG_ROUGH_100_TO_150_INDEX = 23; // Approach <150 Rough SG  
  const SG_ROUGH_OVER_150_INDEX = 26;  // Approach >150 Rough SG
  const SG_FW_150_TO_200_INDEX = 29;   // Approach <200 FW SG
  const SG_FW_OVER_200_INDEX = 32;     // Approach >200 FW SG
    
  // Proximity indices
  const PROX_UNDER_100_INDEX = 18;     // Approach <100 Prox
  const PROX_FW_100_TO_150_INDEX = 21; // Approach <150 FW Prox
  const PROX_ROUGH_100_TO_150_INDEX = 24; // Approach <150 Rough Prox
  const PROX_ROUGH_OVER_150_INDEX = 27; // Approach >150 Rough Prox
  const PROX_FW_150_TO_200_INDEX = 30; // Approach <200 FW Prox
  const PROX_FW_OVER_200_INDEX = 33;   // Approach >200 FW Prox
  
  // Get player's actual driving accuracy (use 0.6 as default if missing)
  const drivingAccuracy = metrics[DRIVING_ACCURACY_INDEX] || 0.6;
  const fairwayPercent = drivingAccuracy;
  const roughPercent = 1 - fairwayPercent;
    
  // Extract putting
  const sgPutting = isNaN(metrics[SG_PUTTING_INDEX]) ? 0 : metrics[SG_PUTTING_INDEX];
    
  // Calculate weighted GIR by distance (higher is better)
  const girUnder100 = isNaN(metrics[GIR_UNDER_100_INDEX]) ? 0 : metrics[GIR_UNDER_100_INDEX];
  const girFW100to150 = isNaN(metrics[GIR_FW_100_TO_150_INDEX]) ? 0 : metrics[GIR_FW_100_TO_150_INDEX];
  const girFW150to200 = isNaN(metrics[GIR_FW_150_TO_200_INDEX]) ? 0 : metrics[GIR_FW_150_TO_200_INDEX];
  const girFWOver200 = isNaN(metrics[GIR_FW_OVER_200_INDEX]) ? 0 : metrics[GIR_FW_OVER_200_INDEX];
    
  // Include rough approaches
  const girRough100to150 = isNaN(metrics[GIR_ROUGH_100_TO_150_INDEX]) ? 0 : metrics[GIR_ROUGH_100_TO_150_INDEX];
  const girRoughOver150 = isNaN(metrics[GIR_ROUGH_OVER_150_INDEX]) ? 0 : metrics[GIR_ROUGH_OVER_150_INDEX];
    
  // Calculate weighted GIR - using player's actual fairway/rough percentages
  const weightedGIR = 
    (girUnder100 * courseSetupWeights.under100) +
    (girFW100to150 * courseSetupWeights.from100to150 * fairwayPercent) +
    (girRough100to150 * courseSetupWeights.from100to150 * roughPercent) +
    (girFW150to200 * courseSetupWeights.from150to200 * fairwayPercent) +
    (girRoughOver150 * (courseSetupWeights.from150to200 + courseSetupWeights.over200) * roughPercent) +
    (girFWOver200 * courseSetupWeights.over200 * fairwayPercent);

  // Get raw SG Approach metrics
  const sgUnder100_raw = metrics[SG_UNDER_100_INDEX] || 0;
  const sgFW100to150_raw = metrics[SG_FW_100_TO_150_INDEX] || 0;
  const sgFW150to200_raw = metrics[SG_FW_150_TO_200_INDEX] || 0;
  const sgFWOver200_raw = metrics[SG_FW_OVER_200_INDEX] || 0;
  const sgRough100to150_raw = metrics[SG_ROUGH_100_TO_150_INDEX] || 0;
  const sgRoughOver150_raw = metrics[SG_ROUGH_OVER_150_INDEX] || 0;
  
  // Convert from per-shot to per-round values
  const sgUnder100 = normalizeApproachSG(sgUnder100_raw);
  const sgFW100to150 = normalizeApproachSG(sgFW100to150_raw);
  const sgFW150to200 = normalizeApproachSG(sgFW150to200_raw);
  const sgFWOver200 = normalizeApproachSG(sgFWOver200_raw);
  const sgRough100to150 = normalizeApproachSG(sgRough100to150_raw);
  const sgRoughOver150 = normalizeApproachSG(sgRoughOver150_raw);
    
  // Calculate weighted approach SG - using player's actual fairway/rough percentages
  const weightedApproachSG = 
    (sgUnder100 * courseSetupWeights.under100) +
    (sgFW100to150 * courseSetupWeights.from100to150 * fairwayPercent) +
    (sgRough100to150 * courseSetupWeights.from100to150 * roughPercent) +
    (sgFW150to200 * courseSetupWeights.from150to200 * fairwayPercent) +
    (sgRoughOver150 * (courseSetupWeights.from150to200 + courseSetupWeights.over200) * roughPercent) +
    (sgFWOver200 * courseSetupWeights.over200 * fairwayPercent);
    
  // Get proximity metrics (lower is better)
  const proxUnder100 = metrics[PROX_UNDER_100_INDEX] || 0;
  const proxFW100to150 = metrics[PROX_FW_100_TO_150_INDEX] || 0;
  const proxFW150to200 = metrics[PROX_FW_150_TO_200_INDEX] || 0;
  const proxFWOver200 = metrics[PROX_FW_OVER_200_INDEX] || 0;
  const proxRough100to150 = metrics[PROX_ROUGH_100_TO_150_INDEX] || 0;
  const proxRoughOver150 = metrics[PROX_ROUGH_OVER_150_INDEX] || 0;
    
  // Calculate weighted proximity - using player's actual fairway/rough percentages
  const weightedProximity = 
    (proxUnder100 * courseSetupWeights.under100) +
    (proxFW100to150 * courseSetupWeights.from100to150 * fairwayPercent) +
    (proxRough100to150 * courseSetupWeights.from100to150 * roughPercent) +
    (proxFW150to200 * courseSetupWeights.from150to200 * fairwayPercent) +
    (proxRoughOver150 * (courseSetupWeights.from150to200 + courseSetupWeights.over200) * roughPercent) +
    (proxFWOver200 * courseSetupWeights.over200 * fairwayPercent);
    
  // Retrieve scoring average to factor in overall player performance
  const scoringAvg = metrics[12] || 72;
    
  // Hardcoded, statistically-determined component weights
  const girWeight = 0.40;      // GIR is the strongest predictor
  const approachWeight = 0.30; // Approach quality
  const puttingWeight = 0.25;  // Putting importance
  const scoringWeight = 0.05;  // Overall scoring ability
    
  // Calculate component values
  const girComponent = weightedGIR;
  const approachComponent = weightedApproachSG - (weightedProximity / 30); // Scaled proximity penalty
  const puttingComponent = sgPutting;
  const scoringComponent = 74 - scoringAvg; // 74 is max value from METRIC_MAX_VALUES
    
  // Final formula
  return (girComponent * girWeight) + 
         (approachComponent * approachWeight) + 
         (puttingComponent * puttingWeight) + 
         (scoringComponent * scoringWeight);
}

// ============================================================================
// FUNCTION 3: getApproachMetrics (line 2355 in results.js)
// ============================================================================
/**
 * Builds the 18-element approach metrics array from approachData
 * Data retrieval happens upstream (CSV loader / player object construction)
 * NO CHANGES to logic; only omits debug logging for parity
 */
function getApproachMetrics(approachData) {
  // Ensure each category has default values
  const categories = {
    '<100': { fwGIR: 0, strokesGained: 0, shotProx: 0 },
    '<150': { 
      fwGIR: 0, fwStrokesGained: 0, fwShotProx: 0,
      roughGIR: 0, roughStrokesGained: 0, roughShotProx: 0 
    },
    '>150 - Rough': { roughGIR: 0, roughStrokesGained: 0, roughShotProx: 0 },
    '<200': { fwGIR: 0, fwStrokesGained: 0, fwShotProx: 0 },
    '>200': { fwGIR: 0, fwStrokesGained: 0, fwShotProx: 0 }
  };
  
  const safeData = Object.fromEntries(
    Object.entries(categories).map(([key, defaults]) => [
      key,
      Object.fromEntries(
        Object.entries(defaults).map(([subKey]) => {
          // Get raw value
          const rawValue = approachData?.[key]?.[subKey] || 0;
          
          // Apply normalization for SG values - convert per-shot to per-round
          if (subKey.includes('SG') || subKey.includes('strokesGained') || 
              subKey.includes('StrokesGained')) {
            return [subKey, normalizeApproachSG(rawValue)];
          }
          
          return [subKey, rawValue];
        })
      )
    ])
  );
  
  return [
    // <100 metrics
    safeData['<100'].fwGIR,
    safeData['<100'].strokesGained,
    safeData['<100'].shotProx,
    // <150 metrics
    safeData['<150'].fwGIR,
    safeData['<150'].fwStrokesGained,
    safeData['<150'].fwShotProx,
    safeData['<150'].roughGIR,
    safeData['<150'].roughStrokesGained,
    safeData['<150'].roughShotProx,
    // >150 rough metrics
    safeData['>150 - Rough'].roughGIR,
    safeData['>150 - Rough'].roughStrokesGained,
    safeData['>150 - Rough'].roughShotProx,
    // <200 metrics
    safeData['<200'].fwGIR,
    safeData['<200'].fwStrokesGained,
    safeData['<200'].fwShotProx,
    // >200 metrics
    safeData['>200'].fwGIR,
    safeData['>200'].fwStrokesGained,
    safeData['>200'].fwShotProx
  ];
}

// ============================================================================
// FUNCTION 4: calculateDynamicWeight (line 2423 in results.js)
// ============================================================================
/**
 * Scales weight based on amount of data available
 * NO CHANGES NEEDED - pure calculation
 */
function calculateDynamicWeight(baseWeight, dataPoints, minPoints, maxPoints = 20) {
  // Scale weight based on amount of data available
  if (dataPoints <= minPoints) return baseWeight * 0.8; // Reduce weight if minimum data
  if (dataPoints >= maxPoints) return baseWeight; // Full weight if plenty of data
    
  // Linear scaling between min and max points
  const scaleFactor = 0.8 + (0.2 * (dataPoints - minPoints) / (maxPoints - minPoints));
  return baseWeight * scaleFactor;
}

// ============================================================================
// FUNCTION 5: calculateHistoricalAverages (line 2525 in results.js)
// ============================================================================
/**
 * Calculates per-player historical metric averages using historical/similar/putting rounds
 * Data retrieval happens upstream; this consumes arrays of round objects
 * NO LOGIC CHANGES
 */
function calculateHistoricalAverages(historicalRounds, similarRounds = [], puttingRounds = [], options = {}) {
  // Default options
  const {
    lambda = 0.25, // Exponential decay factor for recency
    lambdaPutting = 0.3, // Faster decay for putting-specific data
    minHistoricalPoints = 2, // Min points needed for historical data (lowered from 10)
    minSimilarPoints = 2, // Min points needed for similar course data (lowered from 5)
    minPuttingPoints = 2, // Min points needed for putting-specific data (lowered from 5)
    minSimilarRoundsForFullWeight = 12, // Min similar rounds before full weight applies
    similarHalfLifeYears = 2, // Recency half-life for similar-course rounds
    similarWeight = 0.6, // Weight for similar course data (0.0-1.0)
    puttingWeight = 0.7 // Weight for putting-specific data (0.0-1.0)
  } = options;
  
  // Track metrics with insufficient data for notes
  const lowDataMetrics = [];
 
  const indexToMetricKey = {
    0: 'strokesGainedTotal',
    1: 'drivingDistance',
    2: 'drivingAccuracy',
    3: 'strokesGainedT2G',
    4: 'strokesGainedApp',
    5: 'strokesGainedArg',
    6: 'strokesGainedOTT',
    7: 'strokesGainedPutt',
    8: 'greensInReg',
    9: 'scrambling',
    10: 'greatShots',
    11: 'poorShots',
    12: 'scoringAverage',
    13: 'birdiesOrBetter',
    14: 'fairwayProx',
    15: 'roughProx'
  };
 
  // Log all configuration parameters at the start
  console.log(`
                === HISTORICAL AVERAGES CALCULATION CONFIG ===
                - Lambda (recency factor): ${lambda}
                - Lambda Putting (recency factor): ${lambdaPutting}
                - Min data points: Historical=${minHistoricalPoints}, Similar=${minSimilarPoints}, Putting=${minPuttingPoints}
                - Blending weights: Similar=${similarWeight.toFixed(2)}, Putting=${puttingWeight.toFixed(2)}
                - Available rounds: Historical=${historicalRounds.length}, Similar=${similarRounds.length}, Putting=${puttingRounds.length}
                =============================================`);
 
  // Track which data sources were used for each metric
  const metricSources = {
    historical: 0,
    similar: 0,
    putting: 0,
    blended: 0,
    noData: 0
  };
 
  // Specific putting-related indexes
  const puttingRelatedIndexes = new Set([7]); // SG Putting
 
  // Create standardized date strings for consistent sorting
  const prepareRounds = (rounds) => {
    return rounds
      .filter(round => round && round.metrics)
      .sort((a, b) => {
        // First convert dates to ISO string format for consistent comparison
        const dateA = new Date(a.date).toISOString();
        const dateB = new Date(b.date).toISOString();
        
        // Primary sort by date (newest first)
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        // Secondary sort by round number (if dates are identical)
        return b.roundNum - a.roundNum;
      });
  }
 
  // Calculate weighted average for a set of values
  const calculateWeightedAverage = (values, decayFactor = lambda, dates = null, halfLifeYears = null) => {
    if (!values || values.length === 0) return null;
    
    let sumWeighted = 0;
    let sumWeights = 0;
    
    // For Scheffler's driving distance, show detailed lambda application
    const showDetail = playerName === 'Scheffler, Scottie' && values.length > 0 && values[0] > 200 && values[0] < 350;
    
    if (showDetail) {
      console.log(`\n📐 EXPONENTIAL DECAY WEIGHTING (λ=${decayFactor}):`);
      console.log(`\nRound Details (newest → oldest, index 0 = most recent):`);
      console.log(`Index | Distance | Weight Factor | Weighted Value | Weight %`);
      console.log(`─────────────────────────────────────────────────────────────`);
    }
    
    values.forEach((value, i) => {
      let weight = Math.exp(-decayFactor * i); // Newest first

      // Apply time-based decay (for similar-course rounds)
      if (dates && halfLifeYears && dates[i] instanceof Date && !isNaN(dates[i])) {
        const ageMs = Date.now() - dates[i].getTime();
        const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
        const timeWeight = Math.pow(2, -ageYears / halfLifeYears);
        weight *= timeWeight;
      }
      sumWeighted += weight * value;
      sumWeights += weight;
      
      if (showDetail && i < 16) { // Show first 16 rounds
        const weightedVal = weight * value;
        const weightPct = (weight / sumWeights * 100).toFixed(1);
        console.log(`  ${i.toString().padEnd(2)} | ${value.toFixed(1).padEnd(8)} | ${weight.toFixed(6).padEnd(13)} | ${weightedVal.toFixed(2).padEnd(14)} | ${weightPct}%`);
      }
    });
    
    if (showDetail) {
      console.log(`─────────────────────────────────────────────────────────────`);
      console.log(`Total rounds: ${values.length}`);
      console.log(`Sum of weights: ${sumWeights.toFixed(6)}`);
      console.log(`Sum of weighted values: ${sumWeighted.toFixed(2)}`);
      console.log(`Weighted Average = ${sumWeighted.toFixed(2)} / ${sumWeights.toFixed(6)} = ${(sumWeighted / sumWeights).toFixed(4)} yards\n`);
    }
    
    return sumWeights > 0 ? sumWeighted / sumWeights : null;
  };
 
    // Helper function to calculate average for a specific metric
  const calculateMetricAverage = (rounds, metricKey, isVirtualMetric = false, minPoints = 0, decayFactor = lambda, useTimeDecay = false, halfLifeYears = null) => {
    if (!rounds || rounds.length < minPoints) return null;
    
    // Extract values based on metric type
    let values = [];
    let dates = [];
    
    if (isVirtualMetric) {
      // Special case for birdies or better
      values = rounds
        .map(round => (round.metrics.eagles || 0) + (round.metrics.birdies || 0))
        .filter(v => typeof v === 'number' && !isNaN(v));
      if (useTimeDecay) {
        dates = rounds.map(round => round.date).filter(d => d instanceof Date && !isNaN(d));
      }
    } else {
      // Normal metrics
      values = [];
      dates = [];
      rounds.forEach(round => {
        const value = round.metrics?.[metricKey];
        if (typeof value === 'number' && !isNaN(value)) {
          values.push(value);
          if (useTimeDecay) {
            dates.push(round.date);
          }
        }
      });
    }
    
    if (values.length < minPoints) return null;
    
    // Convert percentages if needed
    const isPercentage = ['drivingAccuracy', 'greensInReg', 'scrambling'].includes(metricKey);
    const adjustedValues = values.map(v => {
      if (!isPercentage) return v;
      return v > 1 ? v/100 : v; // Convert 0-100% to 0-1 decimal
    });
    
    return calculateWeightedAverage(adjustedValues, decayFactor, useTimeDecay ? dates : null, useTimeDecay ? halfLifeYears : null);
  };
 
  // Prepare all rounds datasets
  const sortedHistorical = prepareRounds(historicalRounds);
  const sortedSimilar = prepareRounds(similarRounds);
  const sortedPutting = prepareRounds(puttingRounds);
  
  // Log the number of rounds for each category
  const playerName = sortedHistorical.length > 0 ? sortedHistorical[0].playerName : 'Unknown';
  console.log(`${playerName}: Prepared ${sortedHistorical.length} historical, ${sortedSimilar.length} similar, and ${sortedPutting.length} putting rounds`);
  
  // Log Scheffler's individual rounds
  if (playerName === 'Scheffler, Scottie') {
    console.log(`\n🎯 SCHEFFLER ROUND DETAILS:\n`);
    console.log(`Historical Rounds (events 2, 60, 464, 478):`);
    sortedHistorical.forEach((round, idx) => {
      if (round.metrics.drivingDistance) {
        console.log(`  Round ${idx + 1}: ${round.metrics.drivingDistance.toFixed(1)} yards (${round.eventName || 'event ' + round.eventId})`);
      }
    });
    console.log(`Similar Rounds (events 3, 7, 12, 23, 28):`);
    sortedSimilar.forEach((round, idx) => {
      if (round.metrics.drivingDistance) {
        console.log(`  Round ${idx + 1}: ${round.metrics.drivingDistance.toFixed(1)} yards (${round.eventName || 'event ' + round.eventId})`);
      }
    });
  }
 
  // Initialize results array
  const results = Array(16).fill(0);
 
  // For each metric, calculate the appropriate weighted average
  for (let index = 0; index < 16; index++) {
    const metricKey = indexToMetricKey[index];
    const isVirtualMetric = index === 13; // Birdies or Better
    const isPuttingMetric = puttingRelatedIndexes.has(index);
    
    // STEP 1: Get averages from each data source if available
    const historicalAvg = calculateMetricAverage(
      sortedHistorical, 
      metricKey, 
      isVirtualMetric, 
      minHistoricalPoints
    );
    
    const similarAvg = calculateMetricAverage(
      sortedSimilar, 
      metricKey, 
      isVirtualMetric, 
      minSimilarPoints,
      lambda,
      true,
      similarHalfLifeYears
    );
    
    const puttingAvg = isPuttingMetric ? calculateMetricAverage(
      sortedPutting, 
      metricKey, 
      isVirtualMetric, 
      minPuttingPoints,
      lambdaPutting
    ) : null;
    
    // Add detailed logging for Scheffler's putting metric calculation
    if (playerName === 'Scheffler, Scottie' && isPuttingMetric) {
      console.log(`  SCHEFFLER ${metricKey} RAW DATA:`);
      console.log(`    Putting rounds: ${sortedPutting.length}`);
      sortedPutting.forEach((r, i) => {
        console.log(`      Round ${i}: ${metricKey}=${r.metrics?.[metricKey]}, date=${r.date}, event=${r.eventId}`);
      });
      console.log(`    Historical rounds: ${sortedHistorical.length}`);
      const histValues = sortedHistorical.map(r => r.metrics?.[metricKey]).filter(v => typeof v === 'number' && !isNaN(v));
      console.log(`      Valid ${metricKey} values (${histValues.length}): ${histValues.slice(0, 10).map(v => v.toFixed(3)).join(', ')}${histValues.length > 10 ? '...' : ''}`);
      console.log(`    Calculated puttingAvg: ${puttingAvg}`);
      console.log(`    Calculated historicalAvg: ${historicalAvg}`);
    }
    
    // Log what data we have available
    console.log(`${playerName} - Metric ${metricKey}: ` + 
      `Historical=${historicalAvg !== null ? historicalAvg.toFixed(3) : 'n/a'}, ` +
      `Similar=${similarAvg !== null ? similarAvg.toFixed(3) : 'n/a'}, ` +
      `Putting=${puttingAvg !== null ? puttingAvg.toFixed(3) : 'n/a'}`);
    
    // STEP 2: Determine the final value based on available data and weights
    let finalValue = 0;
    
    if (isPuttingMetric && puttingAvg !== null) {
      if (historicalAvg !== null) {
        // Dynamically adjust putting weight based on data quantity
        const dynamicPuttingWeight = calculateDynamicWeight(
          puttingWeight, 
          sortedPutting.length,
          minPuttingPoints
        );
        
        // Blend putting-specific with historical data
        finalValue = (puttingAvg * dynamicPuttingWeight) + (historicalAvg * (1 - dynamicPuttingWeight));
        
        console.log(`${playerName} - ${metricKey}: BLENDED PUTTING ${puttingAvg.toFixed(3)} × weight ${dynamicPuttingWeight.toFixed(2)} = ${(puttingAvg * dynamicPuttingWeight).toFixed(3)}
          Historical: ${historicalAvg.toFixed(3)} × weight ${(1-dynamicPuttingWeight).toFixed(2)} = ${(historicalAvg * (1-dynamicPuttingWeight)).toFixed(3)}
          Final value: ${finalValue.toFixed(3)}`);
        
        // Add detailed logging for Scheffler
        if (playerName === 'Scheffler, Scottie') {
          console.log(`  SCHEFFLER PUTTING DETAIL:`);
          console.log(`    Putting rounds count: ${sortedPutting.length}`);
          console.log(`    Historical rounds count: ${sortedHistorical.length}`);
          console.log(`    Base putting weight: ${puttingWeight}`);
          console.log(`    Dynamic putting weight: ${dynamicPuttingWeight.toFixed(4)}`);
          console.log(`    Putting avg: ${puttingAvg.toFixed(6)}`);
          console.log(`    Historical avg: ${historicalAvg.toFixed(6)}`);
          console.log(`    Putting component: ${(puttingAvg * dynamicPuttingWeight).toFixed(6)}`);
          console.log(`    Historical component: ${(historicalAvg * (1-dynamicPuttingWeight)).toFixed(6)}`);
          console.log(`    Final blended: ${finalValue.toFixed(6)}`);
          console.log(`    GAS expected metric 7: 0.683350`);
        }
        
        metricSources.blended++;
      } else {
        // Just use putting data
        finalValue = puttingAvg;
        console.log(`${playerName} - ${metricKey}: Using putting-specific data only: ${finalValue.toFixed(3)}`);
        metricSources.putting++;
      }
    } else if (similarAvg !== null) {
      // For non-putting metrics, prioritize similar course data if available
      if (historicalAvg !== null) {
        // Dynamically adjust similar course weight based on data quantity
        const dynamicSimilarWeight = calculateDynamicWeight(
          similarWeight, 
          sortedSimilar.length,
          minSimilarPoints
        );
        
        // Additional scaling for limited similar-course samples
        const similarSampleScale = Math.min(1, sortedSimilar.length / minSimilarRoundsForFullWeight);
        const effectiveSimilarWeight = dynamicSimilarWeight * similarSampleScale;

        // Blend similar with historical data
        finalValue = (similarAvg * effectiveSimilarWeight) + (historicalAvg * (1 - effectiveSimilarWeight));
        
        if (playerName === 'Scheffler, Scottie' && metricKey === 'drivingDistance') {
          console.log(`\n📊 DETAILED BLENDING FOR ${playerName} - ${metricKey}:`);
          console.log(`  Similar Courses (events 3,7,12,23,28):`);
          console.log(`    - Rounds: ${sortedSimilar.length}`);
          console.log(`    - Weighted Average: ${similarAvg.toFixed(4)} yards`);
          console.log(`  Historical Courses (events 2,60,464,478):`);
          console.log(`    - Rounds: ${sortedHistorical.length}`);
          console.log(`    - Weighted Average: ${historicalAvg.toFixed(4)} yards`);
          console.log(`  Dynamic Weight (based on ${sortedSimilar.length} similar rounds):`);
          console.log(`    - Similar Weight: ${dynamicSimilarWeight.toFixed(4)} (${(dynamicSimilarWeight * 100).toFixed(1)}%)`);
          console.log(`    - Historical Weight: ${(1 - dynamicSimilarWeight).toFixed(4)} (${((1 - dynamicSimilarWeight) * 100).toFixed(1)}%)`);
          console.log(`  BLENDING CALCULATION:`);
          console.log(`    ${similarAvg.toFixed(4)} × ${dynamicSimilarWeight.toFixed(4)} = ${(similarAvg * dynamicSimilarWeight).toFixed(4)}`);
          console.log(`    ${historicalAvg.toFixed(4)} × ${(1 - dynamicSimilarWeight).toFixed(4)} = ${(historicalAvg * (1 - dynamicSimilarWeight)).toFixed(4)}`);
          console.log(`    BLENDED RESULT: ${finalValue.toFixed(4)} yards\n`);
        }
        
        console.log(`${playerName} - ${metricKey}: BLENDED: ${similarAvg.toFixed(3)} × weight ${effectiveSimilarWeight.toFixed(2)} = ${(similarAvg * effectiveSimilarWeight).toFixed(3)}
          Historical: ${historicalAvg.toFixed(3)} × weight ${(1-effectiveSimilarWeight).toFixed(2)} = ${(historicalAvg * (1-effectiveSimilarWeight)).toFixed(3)}
          Final value: ${finalValue.toFixed(3)}`);
        
        metricSources.blended++;
      } else {
        // Just use similar data
        finalValue = similarAvg;
        console.log(`${playerName} - ${metricKey}: Using similar course data only: ${finalValue.toFixed(3)}`);
        metricSources.similar++;
      }
    } else if (historicalAvg !== null) {
      // Use historical data only if that's all we have
      finalValue = historicalAvg;
      console.log(`${playerName} - ${metricKey}: Using historical data only: ${finalValue.toFixed(3)}`);
      metricSources.historical++;
    } else {
      // Last resort - try with combined rounds if we don't have enough in any category
      const allRounds = [...sortedHistorical, ...sortedSimilar, ...sortedPutting];
      if (allRounds.length >= minHistoricalPoints) {
        const combinedAvg = calculateMetricAverage(allRounds, metricKey, isVirtualMetric, minHistoricalPoints);
        if (combinedAvg !== null) {
          finalValue = combinedAvg;
          // Check if this is below standard minimum and add note
          const stdMinHistorical = 8; // Standard minimum for historical
          if (allRounds.length < stdMinHistorical) {
            lowDataMetrics.push(`${metricKey} (${allRounds.length} rounds)`);
          }
          console.log(`${playerName} - ${metricKey}: Using combined data (${allRounds.length} rounds): ${finalValue.toFixed(3)}`);
        } else {
          console.log(`${playerName} - ${metricKey}: No data available`);
          metricSources.noData++;
        }
      } else {
        console.log(`${playerName} - ${metricKey}: No data available`);
        metricSources.noData++;
      }
    }
    
    // Store the final calculated value
    results[index] = finalValue;
  }
 
  console.log(`
                === CALCULATION SUMMARY FOR ${playerName} ===
                - Metrics using historical data only: ${metricSources.historical}
                - Metrics using similar course data only: ${metricSources.similar}
                - Metrics using putting course data only: ${metricSources.putting} 
                - Metrics using blended data sources ${metricSources.blended}
                - Metrics with no data available: ${metricSources.noData}
                =======================================`);
 
  return results;
}

// ============================================================================
// FUNCTION 6: calculateMetricsWithData (line ~2436 in results.js)
// ============================================================================
/**
 * Calculates which metrics have actual tournament/approach data (vs. defaults)
 * Returns a Set of metric indices that have real data
 * approachMetrics should be the already-computed array (18 values) from getApproachMetrics
 */
function calculateMetricsWithData(historicalRounds, similarRounds, puttingRounds, approachMetrics) {
  const metricsWithData = new Set();
  
  // Map of metric indices to their corresponding metric keys in round.metrics
  const historicalMetricKeys = {
    0: 'strokesGainedTotal',
    1: 'drivingDistance',
    2: 'drivingAccuracy',
    3: 'strokesGainedT2G',
    4: 'strokesGainedApp',
    5: 'strokesGainedArg',
    6: 'strokesGainedOTT',
    7: 'strokesGainedPutt',
    8: 'greensInReg',
    9: 'scrambling',
    10: 'greatShots',
    11: 'poorShots',
    12: 'scoringAverage',
    13: 'birdiesOrBetter',
    14: 'fairwayProx',
    15: 'roughProx'
  };
  
  // Check historical metrics (0-15) across all round types
  const allHistoricalRounds = [...(historicalRounds || []), ...(similarRounds || []), ...(puttingRounds || [])];
  
  for (let i = 0; i <= 15; i++) {
    const metricKey = historicalMetricKeys[i];
    const zeroIsValid = metricKey !== 'drivingDistance' && metricKey !== 'scoringAverage';
    
    // Check if ANY round has a value for this metric (zero is valid for most metrics)
    const hasData = allHistoricalRounds.some(round => {
      const value = round?.metrics?.[metricKey];
      return typeof value === 'number' && !isNaN(value) && (value !== 0 || zeroIsValid);
    });
    
    if (hasData) {
      metricsWithData.add(i);
    }
  }
  
  // Check approach metrics (16-33)
  // approachMetrics is an array of 18 values from getApproachMetrics function
  // Only count as having data if the value is non-zero (zeros are default padding)
  if (Array.isArray(approachMetrics) && approachMetrics.length >= 18) {
    for (let i = 0; i < 18; i++) {
      const value = approachMetrics[i];
      // Non-zero approach metrics indicate real data was available
      if (typeof value === 'number' && !isNaN(value) && value !== 0) {
        metricsWithData.add(16 + i); // Approach metrics start at index 16
      }
    }
  }
  
  return metricsWithData;
}

// ============================================================================
// FUNCTION 7: calculatePlayerMetrics (line ~956 in results.js)
// ============================================================================
/**
 * Main calculation pipeline for player metrics and scores.
 * Data retrieval is external; this uses provided config values instead of SpreadsheetApp.
 */
function calculatePlayerMetrics(players, { groups, pastPerformance, config = {} }) {
  // Define constants
  const TREND_THRESHOLD = 0.005; // Minimum trend value to consider significant
  const PAST_PERF_ENABLED = pastPerformance?.enabled || false;
  const PAST_PERF_WEIGHT = Math.min(Math.max(pastPerformance?.weight || 0, 0), 1);
  const CURRENT_EVENT_ID = pastPerformance?.currentEventId ? String(pastPerformance.currentEventId) : null;
  const currentSeason = typeof config.currentSeason === 'number' && Number.isFinite(config.currentSeason)
    ? config.currentSeason
    : null;
  const courseNum = (typeof config.courseNum === 'number' || typeof config.courseNum === 'string')
    ? config.courseNum
    : (Array.isArray(config.courseNums) && config.courseNums.length > 0 ? config.courseNums[0] : null);
  const GLOBAL_PAST_WEIGHT_FALLBACK = 0.30;
  const COURSE_TYPE_PAST_WEIGHT_DEFAULTS = {
    POWER: 0.30,
    TECHNICAL: 0.30,
    BALANCED: 0.30
  };
  const LOW_SAMPLE_PAST_WEIGHTS = {
    1: 0.15,
    2: 0.20,
    3: 0.25
  };
  const DELTA_BLEND_PRED = 0.7;
  const DELTA_BLEND_TREND = 0.3;
  const DELTA_BUCKET_CAP = 0.10;
  const DELTA_BOTH_UP_BOOST = 0.05;
  const courseTypeRaw = config.courseType ? String(config.courseType).trim().toUpperCase() : '';
  const courseType = COURSE_TYPE_PAST_WEIGHT_DEFAULTS[courseTypeRaw] ? courseTypeRaw : null;
  const rampById = config.playerRampById || null;
  const rampWeight = typeof config.playerRampWeight === 'number'
    ? Math.max(0, Math.min(1, config.playerRampWeight))
    : 0;
  const rampMaxEvents = typeof config.playerRampMaxEvents === 'number' && Number.isFinite(config.playerRampMaxEvents)
    ? Math.max(1, config.playerRampMaxEvents)
    : 6;
  const computeRampReadiness = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const index = Number(entry.avgReturnToFormIndex);
    if (!Number.isFinite(index)) return null;
    if (index <= 0) return 1;
    if (index >= rampMaxEvents) return 0;
    return Math.max(0, Math.min(1, 1 - (index / rampMaxEvents)));
  };
  const traceMetricNames = [
    'strokesGainedTotal', 'drivingDistance', 'drivingAccuracy', 'strokesGainedT2G',
    'strokesGainedApp', 'strokesGainedArg', 'strokesGainedOTT', 'strokesGainedPutt',
    'greensInReg', 'scrambling', 'greatShots', 'poorShots',
    'scoringAverage', 'birdiesOrBetter', 'fairwayProx', 'roughProx',
    'approach <100 GIR', 'approach <100 SG', 'approach <100 Prox',
    'approach <150 FW GIR', 'approach <150 FW SG', 'approach <150 FW Prox',
    'approach <150 Rough GIR', 'approach <150 Rough SG', 'approach <150 Rough Prox',
    'approach >150 Rough GIR', 'approach >150 Rough SG', 'approach >150 Rough Prox',
    'approach <200 FW GIR', 'approach <200 FW SG', 'approach <200 FW Prox',
    'approach >200 FW GIR', 'approach >200 FW SG', 'approach >200 FW Prox'
  ];
  const traceMetricNamesWithBCC = [
    ...traceMetricNames.slice(0, 14),
    'Birdie Chances Created',
    ...traceMetricNames.slice(14)
  ];
 
  console.log(`** CURRENT_EVENT_ID = "${CURRENT_EVENT_ID}" **`);

  const getCourseHistoryWeight = (courseNumValue) => {
    if (!courseNumValue || typeof getCourseHistoryRegression !== 'function') return null;
    const entry = getCourseHistoryRegression(courseNumValue);
    if (!entry) return null;
    const slope = Number(entry.slope);
    const pValue = Number(entry.pValue);
    if (!Number.isFinite(slope) || !Number.isFinite(pValue)) return null;
    if (slope >= 0 || pValue >= 0.2) return 0.10;
    if (pValue <= 0.01) {
      if (slope <= -3.0) return 0.40;
      if (slope <= -1.5) return 0.30;
      return 0.25;
    }
    if (pValue <= 0.05) {
      if (slope <= -2.0) return 0.30;
      if (slope <= -1.0) return 0.25;
      return 0.20;
    }
    if (pValue <= 0.10) {
      if (slope <= -1.0) return 0.20;
      return 0.15;
    }
    return 0.10;
  };
 
  // Read the weights from configuration or use defaults
  const similarCoursesWeight = typeof config.similarCoursesWeight === 'number' ? config.similarCoursesWeight : 0.7;
  const puttingCoursesWeight = typeof config.puttingCoursesWeight === 'number' ? config.puttingCoursesWeight : 0.8;
  const deltaScoresById = config.deltaScoresById || {};

  // Fix group weights before using them
  groups = groups.map(group => {
    // Parse weight properly to ensure it's a valid number
    let cleanWeight = parseFloat(String(group.weight).replace(/[^0-9.]/g, ''));
    
    // Validate the weight
    if (isNaN(cleanWeight) || cleanWeight <= 0) {
      console.warn(`Invalid weight for group ${group.name}: ${group.weight}, using default 0.1`);
      cleanWeight = 0.1;
    }
    
    // For debugging, log the original and cleaned weight
    console.log(`Group ${group.name}: Original weight=${group.weight}, Cleaned weight=${cleanWeight}`);
    
    return {
      ...group,
      weight: cleanWeight
    };
  });
  
  // Normalize group weights to sum to 1.0
  // Only normalize if weights don't already sum to ~1.0
  const totalGroupWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const isAlreadyNormalized = Math.abs(totalGroupWeight - 1.0) < 0.01;
  
  if (!isAlreadyNormalized && totalGroupWeight > 0) {
    groups = groups.map(group => ({
      ...group,
      weight: group.weight / totalGroupWeight
    }));
    console.log(`Group weights were not normalized, normalized from total ${totalGroupWeight.toFixed(3)} to 1.0`);
  } else if (totalGroupWeight === 0) {
    console.warn("All group weights are 0! Using equal weights.");
    const equalWeight = 1.0 / groups.length;
    groups = groups.map(group => ({
      ...group,
      weight: equalWeight
    }));
  } else {
    console.log(`Group weights already normalized (total: ${totalGroupWeight.toFixed(3)})`);
  }
  
  console.log("Group weights:");
  groups.forEach(group => console.log(`  ${group.name}: ${group.weight.toFixed(3)}`));

  // 1. Extract Metric Values
  const allMetricValues = Object.entries(players).reduce((acc, [dgId, data]) => {
    const historicalAvgs = calculateHistoricalAverages(
      data.historicalRounds,
      data.similarRounds,
      data.puttingRounds,
      {
        similarWeight: similarCoursesWeight,
        puttingWeight: puttingCoursesWeight
      }
    );
    
    // Calculate approach metrics
    const approachMetrics = getApproachMetrics(data.approachMetrics);
 
    // Combine historical and approach metrics
    const combinedMetrics = [...historicalAvgs, ...approachMetrics];
 
    // Store the combined metrics in the accumulator
    acc[dgId] = combinedMetrics;
    return acc;
  }, {});
 
  // Validate data
  const playerCount = Object.keys(allMetricValues).length;
  const metricCount = Object.values(allMetricValues)[0]?.length || 0;
  console.log(`Player data summary: ${playerCount} players, ${metricCount} metrics per player`);
 
  // 2. Calculate Group Statistics (Mean and Standard Deviation)
  const groupStats = {};
  const problematicMetrics = new Set(['Approach >200 FW Prox']);
  
  // Read course setup weights from configuration
  const courseSetupWeights = {
    under100: config.courseSetupWeights?.under100,
    from100to150: config.courseSetupWeights?.from100to150,
    from150to200: config.courseSetupWeights?.from150to200,
    over200: config.courseSetupWeights?.over200
  };
  
  console.log("Course setup weights:", courseSetupWeights);
  
  // Ensure weights sum to 1.0
  const totalWeight = Object.values(courseSetupWeights).reduce((sum, w) => sum + (typeof w === 'number' ? w : 0), 0);
  if (Math.abs(totalWeight - 1.0) > 0.01 && totalWeight > 0) {
    console.warn(`Course setup weights sum to ${totalWeight.toFixed(3)}, normalizing...`);
    Object.keys(courseSetupWeights).forEach(key => {
      courseSetupWeights[key] /= totalWeight;
    });
  }
 
  // First, we should create a version of allMetricValues that includes BCC at index 14
  const metricsWithBCC = {};
  for (const [dgId, metrics] of Object.entries(allMetricValues)) {
    // Calculate BCC for this player
    const player = players[dgId];
    const bcc = calculateBCC(metrics, courseSetupWeights);
    
    // Insert BCC at position 14
    metricsWithBCC[dgId] = [
      ...metrics.slice(0, 14),
      bcc,
      ...metrics.slice(14)
    ];
  }
 
  // Now use metricsWithBCC to calculate stats
  for (const group of groups) {
    groupStats[group.name] = {};
    console.log(`Processing group: ${group.name}`);
    
    for (const metric of group.metrics) {
      console.log(`  Processing metric: ${metric.name} (index: ${metric.index})`);
      
      // Extract metric values using the correct array with BCC included
      const metricValues = [];
      const isProblematicMetric = problematicMetrics.has(metric.name);
      
      Object.entries(players).forEach(([dgId, player]) => {
        const rawValue = metricsWithBCC[dgId]?.[metric.index];
        
        if (isProblematicMetric) {
          console.log(`  ${player.name}: value=${rawValue}, type=${typeof rawValue}, isNaN=${isNaN(rawValue)}`);
        }
        
        // Include zero values for metrics where zero can be a valid outcome
        const zeroIsValid = metric.name !== 'Driving Distance' && metric.name !== 'Scoring Average';
        if (typeof rawValue === 'number' && !isNaN(rawValue) && (rawValue !== 0 || zeroIsValid)) {
          // APPLY TRANSFORM for correct field statistics
          let transformedValue = rawValue;
          
          // Apply same transforms as later in z-score calculation
          if (metric.name === 'Poor Shots') {
            const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
            transformedValue = maxPoorShots - rawValue;
          } else if (metric.name.includes('Prox') ||
                     metric.name === 'Fairway Proximity' ||
                     metric.name === 'Rough Proximity') {
            // Strip group prefix to find correct METRIC_MAX_VALUES entry
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
              baseMetricName = metric.name.split(':')[1].trim();
            }
            const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                                 (baseMetricName === 'Fairway Proximity' ? 60 :
                                 baseMetricName === 'Rough Proximity' ? 80 :
                                 baseMetricName === 'Approach <100 Prox' ? 40 :
                                 baseMetricName === 'Approach <150 FW Prox' ? 50 :
                                 baseMetricName === 'Approach <150 Rough Prox' ? 60 :
                                 baseMetricName === 'Approach >150 Rough Prox' ? 75 :
                                 baseMetricName === 'Approach <200 FW Prox' ? 65 :
                                 baseMetricName === 'Approach >200 FW Prox' ? 90 : 60);
            transformedValue = maxProxValue - rawValue;
            transformedValue = Math.max(0, transformedValue);
          } else if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            transformedValue = maxScore - rawValue;
          }
          
          metricValues.push(transformedValue);
        }
      });
 
      // Initialize metric in groupStats
      groupStats[group.name][metric.name] = { 
        mean: 0, 
        stdDev: 0.001, // Minimum stdDev to avoid division by zero
        count: 0,
        min: null,
        max: null
      };
 
      console.log(`Found ${metricValues.length} valid values for ${metric.name}`);
      
      if (metricValues.length === 0) {
        console.error(`No valid values for ${metric.name} in ${group.name}`);
        
        // Parse metric name for consistent baseline lookups (strip group prefix)
        let baseMetricName = metric.name;
        if (metric.name.includes(':')) {
          baseMetricName = metric.name.split(':')[1].trim();
        }
        
        // Use baseline standard deviations for known metrics
        const baselineStdDevs = {
          'Approach <100 Prox': 5.0,
          'Approach <150 FW Prox': 7.0,
          'Approach <150 Rough Prox': 9.0,
          'Approach >150 Rough Prox': 12.0,
          'Approach <200 FW Prox': 10.0,
          'Approach >200 FW Prox': 14.0,
          'Fairway Proximity': 7.0,
          'Rough Proximity': 10.0,
          'Birdie Chances Created': 3.0,
          // Add more baselines as needed
        };
        
        if (baselineStdDevs[baseMetricName]) {
          groupStats[group.name][metric.name].stdDev = baselineStdDevs[baseMetricName];
          
          // Use more appropriate default means for different metric types
          if (baseMetricName.includes('Prox')) {
            groupStats[group.name][metric.name].mean = 30; // Proximity in feet
          } else if (baseMetricName === 'Birdie Chances Created') {
            groupStats[group.name][metric.name].mean = 4.0; // Typical value
          } else if (baseMetricName.includes('SG')) {
            groupStats[group.name][metric.name].mean = 0.0; // Strokes Gained baseline
          } else {
            groupStats[group.name][metric.name].mean = 0.5; // Generic default
          }

          groupStats[group.name][metric.name].count = 0;
          groupStats[group.name][metric.name].min = null;
          groupStats[group.name][metric.name].max = null;
          
          console.log(`Using baseline values for ${metric.name}: mean=${groupStats[group.name][metric.name].mean}, stdDev=${baselineStdDevs[baseMetricName]}`);
        }
        
        continue;
      }
 
      // Calculate stats only if we have valid data
      const metricMean = metricValues.reduce((sum, v) => sum + v, 0) / metricValues.length;
      const sumSquares = metricValues.reduce((sum, v) => sum + Math.pow(v - metricMean, 2), 0);
      const metricStdDev = metricValues.length > 1 ? Math.sqrt(sumSquares / (metricValues.length - 1)) : 0;
 
      // Update groupStats with calculated values
      groupStats[group.name][metric.name] = {
        mean: metricMean,
        stdDev: metricStdDev || 0.001, // Ensure non-zero stdDev
        count: metricValues.length,
        min: metricValues.length ? Math.min(...metricValues) : null,
        max: metricValues.length ? Math.max(...metricValues) : null
      };
 
      console.log(`Group: ${group.name}, Metric: ${metric.name}`, {
        mean: metricMean,
        stdDev: metricStdDev,
        sampleValues: metricValues.slice(0, 5) // Show first 5 values
      });
    }
  }
 
  const processedPlayers = Object.entries(players).map(([dgId, data]) => {
    // Optional similar course IDs (unused in scoring, retained for parity with GAS logs)
    const similarCourseIds = Array.isArray(config.similarCourseIds) ? config.similarCourseIds : [];
    void similarCourseIds;
    
    // Get ALL tournament finishes (not just similar courses) for Top 5/Top 10 counting
    const allTournamentFinishes = Object.values(data.events)
      .map(event => event.position)
      .filter(pos => typeof pos === 'number' && !isNaN(pos) && pos !== 100); // Exclude missed cuts (position 100)
  
    const top5 = allTournamentFinishes.filter(pos =>
      typeof pos === 'number' && pos <= 5
    ).length;
    
    const top10 = allTournamentFinishes.filter(pos =>
      typeof pos === 'number' && pos >= 1 && pos <= 10
    ).length;
 
    // Calculate Metrics using all three round types with weights
    console.log(`Processing player: ${data.name}`);
    console.log(`Round counts: Historical=${data.historicalRounds.length}, Similar=${data.similarRounds.length}, Putting=${data.puttingRounds.length}`);
 
    // Calculate historical averages
    const historicalAvgs = calculateHistoricalAverages(
      data.historicalRounds,
      data.similarRounds,
      data.puttingRounds,
      {
        similarWeight: similarCoursesWeight,
        puttingWeight: puttingCoursesWeight
      }
    );
 
    // Calculate trends using historical rounds
    const trends = calculateMetricTrends(data.historicalRounds);
 
    // Get approach metrics
    const approachMetrics = getApproachMetrics(data.approachMetrics);
    
    // Calculate which metrics have actual data (for data coverage purposes)
    const metricsWithData = calculateMetricsWithData(
      data.historicalRounds,
      data.similarRounds,
      data.puttingRounds,
      approachMetrics  // Pass the computed array, not the raw object
    );
 
    // Create safe metrics array with exactly 34 elements
    const safeMetrics = [
      ...historicalAvgs.slice(0, 16), // First 16 historical metrics
      ...approachMetrics.slice(0, 18) // First 18 approach metrics
    ];
 
    // Validation check
    if (safeMetrics.length !== 34) {
      console.error(`Invalid metric count for ${data.name}: ${safeMetrics.length}`);
      safeMetrics.splice(34); // Truncate to 34 if over
      safeMetrics.push(...Array(34 - safeMetrics.length).fill(0)); // Pad if under
    }
 
    // Ensure numeric values
    const cleanMetrics = safeMetrics.map(m => {
      if (typeof m !== 'number' || isNaN(m)) {
        console.warn('Invalid metric found:', m);
        return 0;
      }
      return m;
    });
    

 
    // Calculate Birdie Chances Created using the helper function
    const birdieChancesCreated = calculateBCC(cleanMetrics, courseSetupWeights);
 
    // Create a new array with the Birdie Chances Created metric inserted at position 14
    const updatedMetrics = [
      ...cleanMetrics.slice(0, 14),  // Metrics before Birdie Chances Created
      birdieChancesCreated,          // Insert new metric
      ...cleanMetrics.slice(14)      // Metrics after Birdie Chances Created
    ];
    

 
    // Apply trends to metrics using the helper function
    const adjustedMetrics = applyTrends(updatedMetrics, trends, data.name);

    if (shouldTracePlayer(data.name)) {
      const formatValue = (value) => (typeof value === 'number' && !isNaN(value) ? value.toFixed(4) : 'n/a');
      traceLog(`\n=== TRACE PLAYER: ${data.name} (${dgId}) ===`);
      traceLog(`Rounds: Historical=${data.historicalRounds.length}, Similar=${data.similarRounds.length}, Putting=${data.puttingRounds.length}`);
      traceLog('Historical averages (0-15):');
      historicalAvgs.forEach((value, index) => {
        traceLog(`  [${index}] ${traceMetricNames[index]} = ${formatValue(value)}`);
      });
      traceLog('Approach metrics (16-33):');
      approachMetrics.forEach((value, index) => {
        const metricIndex = index + 16;
        traceLog(`  [${metricIndex}] ${traceMetricNames[metricIndex]} = ${formatValue(value)}`);
      });
      traceLog(`BCC (inserted @14) = ${formatValue(birdieChancesCreated)}`);
      traceLog('Adjusted metrics with BCC (post-trends):');
      adjustedMetrics.forEach((value, index) => {
        traceLog(`  [${index}] ${traceMetricNamesWithBCC[index]} = ${formatValue(value)}`);
      });
      traceLog('=== END TRACE PLAYER METRICS ===\n');
    }
 
    // Calculate Group Scores
    let totalMetricsCount = 0;
    let nonZeroMetricsCount = 0;
    const groupScores = {};
    
    for (const group of groups) {
    
      let groupScore = 0;
      let totalWeight = 0;
      let metricsProcessed = 0;
      let metricsSkipped = 0;

      for (const metric of group.metrics) {
        let value = adjustedMetrics[metric.index];
 
        // 1. Transform Poor Shots to Poor Shot Avoidance
        if (metric.name === 'Poor Shots') {
          const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
          value = maxPoorShots - value;
        
        // 2. Transform Proximity metrics to Approach Quality
        } else if (metric.name.includes('Prox') ||
                  metric.name === 'Fairway Proximity' ||
                  metric.name === 'Rough Proximity') {
          // Get the base metric name (strip group prefixes like "Course Management: " or "Scoring: ")
          let baseMetricName = metric.name;
          if (metric.name.includes(':')) {
            baseMetricName = metric.name.split(':')[1].trim();
          }
          
          // Try to find in METRIC_MAX_VALUES first, then use detailed fallback logic
          const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                               (baseMetricName === 'Fairway Proximity' ? 60 :
                               baseMetricName === 'Rough Proximity' ? 80 :
                               baseMetricName === 'Approach <100 Prox' ? 40 :
                               baseMetricName === 'Approach <150 FW Prox' ? 50 :
                               baseMetricName === 'Approach <150 Rough Prox' ? 60 :
                               baseMetricName === 'Approach >150 Rough Prox' ? 75 :
                               baseMetricName === 'Approach <200 FW Prox' ? 65 :
                               baseMetricName === 'Approach >200 FW Prox' ? 90 : 60);
 
          // Transform to "approach quality" where higher is better
          value = maxProxValue - value;
 
          // Ensure non-negative values
          value = Math.max(0, value);
        
        // 3. Transform Scoring Average to Scoring Quality
        } else if (metric.name === 'Scoring Average') {
          const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
          value = maxScore - value;
        }

        const metricStats = groupStats[group.name]?.[metric.name];
        if (!metricStats) {
          metricsSkipped++;
          console.error(`Metric stats missing for ${group.name} -> ${metric.name}`);
          continue; // Skip this metric
        }
        
        metricsProcessed++;
        
        const stdDev = metricStats.stdDev || 0.001; // Ensure non-zero
        let zScore = (value - metricStats.mean) / stdDev;

        if (shouldTracePlayer(data.name)) {
          traceLog(`  [TRACE METRIC] ${group.name} :: ${metric.name} | raw=${adjustedMetrics[metric.index]?.toFixed?.(4)}, trans=${value?.toFixed?.(4)}, mean=${metricStats.mean.toFixed(4)}, stdDev=${stdDev.toFixed(4)}, z=${zScore.toFixed(4)}, weight=${metric.weight.toFixed(6)}`);
        }
        
        if ((group.name === 'Approach - Short (<100)' || group.name === 'Driving Performance') && data.name === 'Scheffler, Scottie') {
          console.log(`  [METRIC] ${metric.name}: raw=${adjustedMetrics[metric.index]?.toFixed(4)}, trans=${value.toFixed(4)}, mean=${metricStats.mean.toFixed(4)}, stdDev=${stdDev.toFixed(4)}, z=${zScore.toFixed(4)}, weight=${metric.weight.toFixed(6)}`);
        }
        
        // Apply scoring differential penalties for scoring related metrics
        if (metric.name.includes('Score') || 
            metric.name.includes('Birdie') || 
            metric.name.includes('Par')) {
          
          const absZScore = Math.abs(zScore);
          if (absZScore > 2.0) {
            zScore *= Math.pow(absZScore / 2.0, 0.75);
          }
        }
        
        totalMetricsCount++;
        // Check if this metric has actual data (not just default/zero value)
        if (metricsWithData.has(metric.index)) {
          nonZeroMetricsCount++;
        }
        
        // Only apply weights if metric is significant
        if (metric.weight && typeof value === 'number' && !isNaN(value)) {
          const contrib = zScore * metric.weight;
          groupScore += contrib;
          totalWeight += Math.abs(metric.weight);
        }
      }
      
      // Normalize by total weight if available
      if (totalWeight > 0) {
        groupScore = groupScore / totalWeight;
      }
      
      if ((group.name === 'Approach - Short (<100)' || group.name === 'Driving Performance') && data.name === 'Scheffler, Scottie') {
        console.log(`[DEBUG Scheffler] ${group.name}: metricsProcessed=${metricsProcessed}, metricsSkipped=${metricsSkipped}, groupScore=${groupScore.toFixed(4)}, totalWeight=${totalWeight.toFixed(4)}`);
      }
      
      // Store the group score
      groupScores[group.name] = groupScore;
    }
    
    // Add explicit debug points to trace values
    console.log(`DEBUG - BEFORE CALCULATION - Player ${data.name}`);
    
    console.log(`GROUP SCORES DEBUGGING - Player: ${data.name}`);
    let groupScoreCount = 0;
    for (const [groupName, score] of Object.entries(groupScores)) {
      console.log(`  Group: ${groupName}, Score: ${score}, Valid: ${typeof score === 'number' && !isNaN(score)}`);
      if (typeof score === 'number' && !isNaN(score)) {
        groupScoreCount++;
      }
    }
    console.log(`  Total valid group scores: ${groupScoreCount} of ${Object.keys(groupScores).length}`);
    
    // Calculate weighted score from group scores with extensive validation
    let weightedScore = 0;
    let totalWeightUsed = 0;
    
    for (const group of groups) {
      // Get the corresponding group score if it exists
      const groupScore = groupScores[group.name];
      const groupWeight = group.weight || 0;
      
      // Debug the group's contribution
      console.log(`    Checking group: ${group.name}`);
      console.log(`    Score: ${groupScore}, Weight: ${groupWeight}`);
      console.log(`    Valid score: ${typeof groupScore === 'number' && !isNaN(groupScore)}`);
      console.log(`    Valid weight: ${typeof groupWeight === 'number' && groupWeight > 0}`);
      
      // Only use valid scores and weights
      if (typeof groupWeight === 'number' && groupWeight > 0 && 
          typeof groupScore === 'number' && !isNaN(groupScore)) {
        weightedScore += groupScore * groupWeight;
        totalWeightUsed += groupWeight;
        console.log(`    Adding to score: ${groupScore * groupWeight}, total now: ${weightedScore}`);
      } else {
        console.warn(`    Skipping invalid group: ${group.name}`);
      }
    }
    
    // Normalize weighted score with validation
    if (totalWeightUsed > 0) {
      weightedScore = weightedScore / totalWeightUsed;
      console.log(`  Final normalized weighted score: ${weightedScore}`);
    } else {
      // If no valid weights were found, set a default score of 0
      console.warn(`No valid weights for ${data.name}, defaulting to 0`);
      weightedScore = 0;
    }
    
    // Safety check for weightedScore
    if (isNaN(weightedScore)) {
      console.error(`Got NaN for weightedScore for ${data.name}, setting to 0`);
      weightedScore = 0;
    }
    
    // Calculate data coverage with validation
    const dataCoverage = nonZeroMetricsCount > 0 && totalMetricsCount > 0 ? 
                         nonZeroMetricsCount / totalMetricsCount : 0.5;
    
    // Get confidence factor with safety checks
    let confidenceFactor;
    try {
      confidenceFactor = getCoverageConfidence(dataCoverage);
      if (isNaN(confidenceFactor)) {
        console.error(`Got NaN from getCoverageConfidence for ${data.name}, using 1.0`);
        confidenceFactor = 1.0;
      }
    } catch (e) {
      console.error(`Error in getCoverageConfidence for ${data.name}: ${e.message}`);
      confidenceFactor = 1.0;
    }
    
    console.log(`Data coverage: ${dataCoverage}, Confidence factor: ${confidenceFactor}`);
    
    // Capture group scores BEFORE dampening for debug
    const groupScoresBeforeDampening = {...groupScores};
    let groupScoresAfterDampening = null;
    
    // Unified dampening based on data coverage (smooth, no hard cliffs)
    const coverageDampingFactor = dataCoverage < 0.70
      ? Math.exp(-1.5 * (1.0 - dataCoverage))
      : 1.0;
    
    if (coverageDampingFactor < 1.0) {
      console.log(`${data.name}: Applying coverage dampening factor of ${coverageDampingFactor.toFixed(3)} (coverage: ${dataCoverage.toFixed(3)})`);
      
      // Recalculate all group scores with dampened z-scores
      for (const group of groups) {
        let groupScore = 0;
        let totalWeight = 0;
        
        for (const metric of group.metrics) {
          let value = adjustedMetrics[metric.index];
          
          // Apply same transformations as main calculation
          if (metric.name === 'Poor Shots') {
            const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
            value = maxPoorShots - value;
          } else if (metric.name.includes('Prox') ||
                    metric.name === 'Fairway Proximity' ||
                    metric.name === 'Rough Proximity') {
            // Get the base metric name (strip group prefixes like "Course Management: " or "Scoring: ")
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
              baseMetricName = metric.name.split(':')[1].trim();
            }
            const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                                 (baseMetricName === 'Fairway Proximity' ? 60 :
                                 baseMetricName === 'Rough Proximity' ? 80 :
                                 baseMetricName === 'Approach <100 Prox' ? 40 :
                                 baseMetricName === 'Approach <150 FW Prox' ? 50 :
                                 baseMetricName === 'Approach <150 Rough Prox' ? 60 :
                                 baseMetricName === 'Approach >150 Rough Prox' ? 75 :
                                 baseMetricName === 'Approach <200 FW Prox' ? 65 :
                                 baseMetricName === 'Approach >200 FW Prox' ? 90 : 60);
            value = maxProxValue - value;
            value = Math.max(0, value);
          } else if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            value = maxScore - value;
          }
          
          const metricStats = groupStats[group.name]?.[metric.name];
          if (!metricStats) continue;
          
          let zScore = (value - metricStats.mean) / (metricStats.stdDev || 0.001);
          zScore *= coverageDampingFactor;
          
          // Apply scoring differential penalties
          if (metric.name.includes('Score') || 
              metric.name.includes('Birdie') || 
              metric.name.includes('Par')) {
            const absZScore = Math.abs(zScore);
            if (absZScore > 2.0) {
              zScore *= Math.pow(absZScore / 2.0, 0.75);
            }
          }
          
          if (metric.weight && typeof value === 'number' && !isNaN(value)) {
            groupScore += zScore * metric.weight;
            totalWeight += Math.abs(metric.weight);
          }
        }
        
        if (totalWeight > 0) {
          groupScore = groupScore / totalWeight;
        }
        
        // Update the group score with dampened value
        groupScores[group.name] = groupScore;
        console.log(`  Recalculated group ${group.name}: ${groupScore.toFixed(3)} (dampened)`);
      }
      
      // Capture group scores AFTER dampening for debug
      groupScoresAfterDampening = {...groupScores};
      
      // Recalculate weighted score with dampened group scores
      weightedScore = 0;
      let totalWeightUsed = 0;
      
      for (const group of groups) {
        const groupScore = groupScores[group.name];
        const groupWeight = group.weight || 0;
        
        if (typeof groupWeight === 'number' && groupWeight > 0 && 
            typeof groupScore === 'number' && !isNaN(groupScore)) {
          weightedScore += groupScore * groupWeight;
          totalWeightUsed += groupWeight;
        }
      }
      
      if (totalWeightUsed > 0) {
        weightedScore = weightedScore / totalWeightUsed;
      } else {
        weightedScore = 0;
      }
      
      console.log(`${data.name}: Recalculated weighted score with dampening: ${weightedScore.toFixed(3)}`);
    }
    
    // Apply bucket delta bonus to weighted score (pre-refinement)
    const deltaEntry = deltaScoresById[String(dgId)] || null;
    if (deltaEntry?.deltaTrendBuckets || deltaEntry?.deltaPredictiveBuckets) {
      const bucketWeights = {
        short: courseSetupWeights.under100,
        mid: courseSetupWeights.from100to150,
        long: courseSetupWeights.from150to200,
        veryLong: courseSetupWeights.over200
      };
      const bucketKeys = ['short', 'mid', 'long', 'veryLong'];
      const normalizedWeightSum = bucketKeys.reduce((sum, key) => {
        const value = bucketWeights[key];
        return sum + (typeof value === 'number' && !Number.isNaN(value) ? value : 0);
      }, 0);

      if (normalizedWeightSum > 0) {
        let bucketBonus = 0;
        bucketKeys.forEach(key => {
          const weight = bucketWeights[key];
          if (typeof weight !== 'number' || Number.isNaN(weight) || weight === 0) return;
          const trendBucket = deltaEntry?.deltaTrendBuckets?.[key];
          const predBucket = deltaEntry?.deltaPredictiveBuckets?.[key];
          if (typeof trendBucket !== 'number' && typeof predBucket !== 'number') return;
          const trendValue = typeof trendBucket === 'number' ? trendBucket : 0;
          const predValue = typeof predBucket === 'number' ? predBucket : 0;
          const blended = (DELTA_BLEND_PRED * predValue) + (DELTA_BLEND_TREND * trendValue);
          bucketBonus += blended * (weight / normalizedWeightSum);
        });

        const cappedBonus = Math.max(-DELTA_BUCKET_CAP, Math.min(DELTA_BUCKET_CAP, bucketBonus));
        const hasBothUp = typeof deltaEntry?.deltaPredictiveScore === 'number'
          && typeof deltaEntry?.deltaTrendScore === 'number'
          && deltaEntry.deltaPredictiveScore > 0
          && deltaEntry.deltaTrendScore > 0;
        const gatedBoost = hasBothUp ? DELTA_BOTH_UP_BOOST : 0;
        weightedScore += (cappedBonus + gatedBoost);
      }
    }

    // Refined score: apply confidence and coverage multipliers
    // Use smoother degradation curve for low-coverage players
    const dataCoverageMultiplier = dataCoverage < 0.70
      ? Math.max(0.4, 0.7 + (dataCoverage / 0.70) * 0.3) // Smooth curve from 0.4 to 1.0
      : 1.0;
    const refinedWeightedScore = weightedScore * confidenceFactor * dataCoverageMultiplier;
    
    // Defaults retained for debug fields
    const isLowConfidencePlayer = false;
    const baselineScore = null;
    const hasRecentTop10 = false;
    
    // Pre-sort events to check for recent win/top 10 (used in past perf section)
    const pastPerformances = data.events || {};
    const sortedEvents = Object.entries(pastPerformances)
      .sort((a, b) => {
        const yearA = a[0].split('-').pop();
        const yearB = b[0].split('-').pop();
        return parseInt(yearB) - parseInt(yearA);
      });
    
    if (isNaN(refinedWeightedScore)) {
      console.error(`Got NaN for refinedWeightedScore for ${data.name}, setting to 0`);
    }
    
    const getEventYear = (eventKey, event) => {
      if (typeof event?.year === 'number' && !Number.isNaN(event.year)) return event.year;
      const keyYear = parseInt(String(eventKey || '').split('-').pop(), 10);
      return Number.isFinite(keyYear) ? keyYear : null;
    };

    const courseHistoryCount = CURRENT_EVENT_ID
      ? Object.entries(pastPerformances).filter(([eventKey, event]) => {
          const eventId = event?.eventId ? String(event.eventId) : null;
          if (!eventId || eventId !== CURRENT_EVENT_ID) return false;
          const eventYear = getEventYear(eventKey, event);
          return eventYear !== null ? eventYear < currentSeason : true;
        }).length
      : 0;

    const courseHistoryWeight = getCourseHistoryWeight(courseNum);
    const baseFallbackWeight = courseHistoryWeight ?? COURSE_TYPE_PAST_WEIGHT_DEFAULTS[courseType] ?? GLOBAL_PAST_WEIGHT_FALLBACK;
    const cappedFallbackWeight = Math.min(PAST_PERF_WEIGHT, baseFallbackWeight);
    let effectivePastPerfWeight = PAST_PERF_WEIGHT;

    if (!PAST_PERF_ENABLED || PAST_PERF_WEIGHT <= 0) {
      effectivePastPerfWeight = 0;
    } else if (courseHistoryCount === 0) {
      effectivePastPerfWeight = cappedFallbackWeight;
    } else if (courseHistoryCount <= 3) {
      const lowSampleWeight = LOW_SAMPLE_PAST_WEIGHTS[courseHistoryCount] ?? PAST_PERF_WEIGHT;
      effectivePastPerfWeight = Math.min(PAST_PERF_WEIGHT, lowSampleWeight);
    }

    if (PAST_PERF_ENABLED && courseHistoryWeight !== null) {
      effectivePastPerfWeight = Math.min(effectivePastPerfWeight, courseHistoryWeight);
    }

    if (PAST_PERF_ENABLED && rampWeight > 0 && rampById) {
      const rampEntry = rampById[String(dgId)] || null;
      const rampReadiness = computeRampReadiness(rampEntry);
      if (typeof rampReadiness === 'number') {
        const adjusted = effectivePastPerfWeight * (1 - (rampWeight * rampReadiness));
        effectivePastPerfWeight = Math.max(0, adjusted);
      }
    }

    let pastPerformanceMultiplier = 1.0;
    if (PAST_PERF_ENABLED && effectivePastPerfWeight > 0) {
      console.log(`${data.name}: PastPerf sample=${courseHistoryCount}, courseNum=${courseNum || 'n/a'}, courseType=${courseType || 'GLOBAL'}, effectiveWeight=${effectivePastPerfWeight.toFixed(2)}`);
      if (sortedEvents.length > 0) {
        // Player has data - calculate full multiplier based on their performance
        // Calculate recency-weighted past performance score
        let weightedPerformanceScore = 0;
        let totalWeight = 0;
        let eventIndex = 0;
        
        sortedEvents.forEach(([eventKey, event]) => {
          // Skip current event
          if (CURRENT_EVENT_ID && event.eventId?.toString() === CURRENT_EVENT_ID) {
            return;
          }
          
          // Calculate position score with broader range (not just top 10)
          let positionScore = 0;
          const position = event.position;
          
          if (position === 1) {
            positionScore = 1.5; // Wins get highest score
          } else if (position <= 3) {
            positionScore = 1.2; // Top 3
          } else if (position <= 5) {
            positionScore = 1.0; // Top 5
          } else if (position <= 10) {
            positionScore = 0.8; // Top 10
          } else if (position <= 25) {
            positionScore = 0.4; // Top 25 (still counts!)
          } else if (position <= 50) {
            positionScore = 0.1; // Made cut (minor credit)
          } else {
            positionScore = -0.2; // Missed cut or very poor finish
          }
          
          // Apply STRONG recency decay - much heavier emphasis on recent events
          // Event 0 (most recent): weight = 1.0
          // Event 1: weight = 0.5
          // Event 2: weight = 0.25
          // Event 3+: weight = 0.1 (older results matter much less)
          const recencyWeight = eventIndex === 0 ? 1.0 : Math.pow(0.5, eventIndex);
          weightedPerformanceScore += positionScore * recencyWeight;
          totalWeight += recencyWeight;
          eventIndex++;
        });

        // Only apply multiplier if player has recent performances
        if (totalWeight > 0) {
          const avgPerformanceScore = weightedPerformanceScore / totalWeight;
          
          // Linear scale with bounded effect to prevent past performance from overwhelming current metrics
          // Score 0.0 → 0.7x, 0.5 → 1.0x, 1.0 → 1.3x, 2.0 → 1.9x (capped below)
          const rawMultiplier = 0.7 + (avgPerformanceScore * 0.6);
          const cappedMultiplier = Math.max(0.5, Math.min(1.8, rawMultiplier));
          
          // Apply weight to scale the boost/penalty magnitude
          pastPerformanceMultiplier = 1.0 + ((cappedMultiplier - 1.0) * effectivePastPerfWeight);
          
          const capIndicator = rawMultiplier !== cappedMultiplier ? " [CAP APPLIED]" : "";
          console.log(`${data.name}: Avg perf score=${avgPerformanceScore.toFixed(2)}, raw=${rawMultiplier.toFixed(3)}, capped=${cappedMultiplier.toFixed(3)}, final=${pastPerformanceMultiplier.toFixed(3)}${capIndicator}`);
        } else {
          console.log(`${data.name}: No usable performance data (staying at 1.0x)`);
        }
      } else {
        console.log(`${data.name}: No sortedEvents (staying at 1.0x)`);
      }
    }

    // Extract KPI names and weights from metric groups
    const kpis = groups.flatMap(group =>
        group.metrics.map(metric => {
            // Parse metric name to strip group prefix if present (e.g., "Course Management: Fairway Proximity" -> "Fairway Proximity")
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
                baseMetricName = metric.name.split(':')[1].trim();
            }
            return {
                name: baseMetricName,  // Use parsed base name for consistent KPI identification
                fullName: metric.name, // Store full name for groupStats lookup
                groupName: group.name, // Store group name for WAR calculation
                index: metric.index,
                weight: group.weight * metric.weight
            };
        })
    );

    // Normalize KPI weights
    const totalKpiWeight = kpis.reduce((sum, kpi) => sum + Math.abs(kpi.weight), 0);
    const normalizedKpis = kpis.map(kpi => ({
        ...kpi,
        weight: kpi.weight / totalKpiWeight
    }));

    // Validate and potentially adjust the weights
    const validatedKpis = validateKpiWeights(normalizedKpis);
    
    // Final score calculation with validation
    let finalScore = refinedWeightedScore * pastPerformanceMultiplier;
    if (isNaN(finalScore)) {
      console.error(`Got NaN for finalScore for ${data.name}, setting to 0`);
      finalScore = 0;
    }
    
    // Calculate WAR with validation
    let war;
    try {
      war = calculateWAR(adjustedMetrics, validatedKpis, groupStats, data.name, groups);
      if (isNaN(war)) {
        console.error(`Got NaN for war for ${data.name}, setting to 0`);
        war = 0;
      }
    } catch (e) {
      console.error(`Error calculating WAR for ${data.name}: ${e.message}`);
      war = 0;
    }
    
    // Return the player object with explicit property assignments
    return {
      dgId,
      name: data.name,
      groupScores, 
      top5,
      top10,
      metrics: updatedMetrics,
      weightedScore: weightedScore, 
      refinedWeightedScore: refinedWeightedScore,
      pastPerformanceMultiplier: pastPerformanceMultiplier,
      finalScore: finalScore,
      war: war,
      dataCoverage: dataCoverage,
      dataCoverageConfidence: getCoverageConfidence(dataCoverage) || 1.0,
      trends,
      // Debug fields for calculation sheet
      isLowConfidencePlayer: isLowConfidencePlayer,
      baselineScore: baselineScore,
      hasRecentTop10: hasRecentTop10,
      confidenceFactor: confidenceFactor,
      groupScoresBeforeDampening: groupScoresBeforeDampening,
      groupScoresAfterDampening: groupScoresAfterDampening
    };
  });

  cacheGroupStats(groupStats);

  if (DEBUG_SNAPSHOT) {
    const snapshotPlayers = Object.keys(metricsWithBCC).slice(0, 3);
    snapshotLog('\n=== DEBUG SNAPSHOT: metric stats + z-scores (first 3 players) ===');
    snapshotPlayers.forEach(dgId => {
      const player = players[dgId];
      const metrics = metricsWithBCC[dgId];
      if (!player || !metrics) return;
      snapshotLog(`\nPlayer: ${player.name} (${dgId})`);
      groups.forEach(group => {
        group.metrics.forEach(metric => {
          let value = metrics[metric.index];
          if (metric.name === 'Poor Shots') {
            const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
            value = maxPoorShots - value;
          } else if (metric.name.includes('Prox') ||
                     metric.name === 'Fairway Proximity' ||
                     metric.name === 'Rough Proximity') {
            let baseMetricName = metric.name;
            if (metric.name.includes(':')) {
              baseMetricName = metric.name.split(':')[1].trim();
            }
            const maxProxValue = METRIC_MAX_VALUES[baseMetricName] ||
                                 (baseMetricName === 'Fairway Proximity' ? 60 :
                                 baseMetricName === 'Rough Proximity' ? 80 :
                                 baseMetricName === 'Approach <100 Prox' ? 40 :
                                 baseMetricName === 'Approach <150 FW Prox' ? 50 :
                                 baseMetricName === 'Approach <150 Rough Prox' ? 60 :
                                 baseMetricName === 'Approach >150 Rough Prox' ? 75 :
                                 baseMetricName === 'Approach <200 FW Prox' ? 65 :
                                 baseMetricName === 'Approach >200 FW Prox' ? 90 : 60);
            value = Math.max(0, maxProxValue - value);
          } else if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            value = maxScore - value;
          }

          const stats = groupStats[group.name]?.[metric.name];
          if (!stats) return;
          const stdDev = stats.stdDev || 0.001;
          const zScore = (value - stats.mean) / stdDev;
          snapshotLog(`  ${group.name} :: ${metric.name} | raw=${metrics[metric.index]?.toFixed?.(4)}, trans=${value?.toFixed?.(4)}, mean=${stats.mean.toFixed(4)}, stdDev=${stdDev.toFixed(4)}, z=${zScore.toFixed(4)}`);
        });
      });
    });
    snapshotLog('=== END DEBUG SNAPSHOT ===\n');
  }

  return {
    players: processedPlayers,
    groupStats: groupStats
  };
}

// ============================================================================
// FUNCTION 8: validateKpiWeights (line ~1200 in results.js)
// ============================================================================
/**
 * Ensures KPI weights sum to 1.0, normalizing if needed
 */
function validateKpiWeights(normalizedKpis) {
  const totalWeight = normalizedKpis.reduce((sum, kpi) => sum + Math.abs(kpi.weight), 0);
  
  // Check if weights sum to approximately 1.0 (allowing for small floating point errors)
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    console.warn(`KPI weights sum to ${totalWeight.toFixed(3)}, not 1.0. Normalizing weights.`);
    
    // Normalize the weights to ensure they sum to 1.0
    return normalizedKpis.map(kpi => ({
      ...kpi,
      weight: totalWeight === 0 ? 0 : kpi.weight / totalWeight
    }));
  }
  
  return normalizedKpis;
}

// ============================================================================
// FUNCTION 9: getCoverageConfidence (line ~1230 in results.js)
// ============================================================================
/**
 * Computes confidence factor based on data coverage
 */
function getCoverageConfidence(dataCoverage) {
  // Validate input
  if (typeof dataCoverage !== 'number' || isNaN(dataCoverage)) {
    console.warn(`Invalid dataCoverage value: ${dataCoverage}, using default confidence of 1.0`);
    return 1.0;
  }
  
  // Ensure coverage is between 0 and 1
  const validCoverage = Math.max(0, Math.min(1, dataCoverage));
  
  // Use a simple curve where confidence increases with data coverage
  // This gives 0.6 at 50% coverage, 0.8 at 75% coverage, 1.0 at 100% coverage
  const confidence = Math.pow(validCoverage, 0.5);
  
  // Ensure we never return less than 0.5 confidence
  const finalConfidence = 0.5 + (confidence * 0.5);
  
  // Final validation to ensure no NaN is returned
  if (isNaN(finalConfidence)) {
    console.warn(`Calculated invalid confidence from coverage ${dataCoverage}, using default 1.0`);
    return 1.0;
  }
  
  return finalConfidence;
}

// ============================================================================
// FUNCTION 10: calculateMetricTrends (line ~1300 in results.js)
// ============================================================================
/**
 * Calculates recent trends for the 16 historical metrics
 */
function calculateMetricTrends(finishes) {
  const TOTAL_ROUNDS = 24;
  const LAMBDA = 0.2; // Exponential decay factor
  const TREND_THRESHOLD = 0.003; // Lowered from 0.005 to detect more subtle trends
  const SMOOTHING_WINDOW = 3; // Size of smoothing window

  // Sort rounds by date descending
  const sortedRounds = (finishes || []).sort((a, b) => 
    new Date(b.date) - new Date(a.date) || b.roundNum - a.roundNum
  );

  // Get most recent valid rounds
  const recentRounds = sortedRounds.slice(0, TOTAL_ROUNDS).filter(round => {
    const isValid = round.metrics?.scoringAverage !== undefined;
    return isValid;
  });

  // Return zeros if insufficient data - lowered from 15 to 8 rounds (more achievable)
  if (recentRounds.length < 8) return Array(16).fill(0);

  // Complete metric mapping with all indices
  const metricMap = {
    0: 'strokesGainedTotal',
    1: 'drivingDistance',
    2: 'drivingAccuracy',
    3: 'strokesGainedT2G',
    4: 'strokesGainedApp',
    5: 'strokesGainedArg',
    6: 'strokesGainedOTT',
    7: 'strokesGainedPutt',
    8: 'greensInReg',
    9: 'scrambling',
    10: 'greatShots',
    11: 'poorShots',
    12: 'scoringAverage',
    13: 'birdiesOrBetter',
    14: 'fairwayProx',
    15: 'roughProx'
  };

  return Array(16).fill().map((_, metricIndex) => {
    const metricName = metricMap[metricIndex];
    if (!metricName) return 0;

    // Extract metric values in chronological order (oldest to newest)
    const values = recentRounds
      .slice()
      .reverse() // Oldest first for regression calculation
      .map(round => round.metrics[metricName])
      .filter(value => typeof value === 'number' && !isNaN(value));

    // Skip if not enough data points - need 8+ rounds for meaningful trend (2+ weeks)
    if (values.length < 8) return 0;

    // Apply smoothing before calculating trend
    const smoothedValues = smoothData(values, SMOOTHING_WINDOW);
    
    // Calculate weighted linear regression with smoothed values
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumWeights = 0;
    
    smoothedValues.forEach((value, index) => {
      const x = index + 1; // Time period (1 = oldest)
      const y = value;
      const weight = Math.exp(-LAMBDA * (smoothedValues.length - index)); // More weight to recent
      
      sumX += weight * x;
      sumY += weight * y;
      sumXY += weight * x * y;
      sumX2 += weight * x * x;
      sumWeights += weight;
    });

    // Calculate regression slope (trend)
    const numerator = sumWeights * sumXY - sumX * sumY;
    const denominator = sumWeights * sumX2 - sumX * sumX;
    const slope = denominator !== 0 ? numerator / denominator : 0;
    
    // CRITICAL FIX: Scale trend by the metric baseline value
    // The slope is in absolute units (e.g., yards per round for driving distance)
    // But we need to express it as a fractional change (e.g., 0.01 = 1% per round)
    // Calculate the average metric value for this player to normalize
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const scaledSlope = avgValue !== 0 ? slope / avgValue : 0;
    
    // Apply significance threshold
    const finalTrend = Math.abs(scaledSlope) > TREND_THRESHOLD 
      ? Number(scaledSlope.toFixed(3))
      : 0;

    return finalTrend;
  });
}

// ============================================================================
// FUNCTION 11: smoothData (line ~1400 in results.js)
// ============================================================================
/**
 * Applies moving-average smoothing to a series
 */
function smoothData(values, windowSize) {
  if (values.length < windowSize) return values;
      
    const smoothed = [];
    for (let i = 0; i < values.length; i++) {
      // Calculate window boundaries, handling edge cases
      const start = Math.max(0, i - Math.floor(windowSize/2));
      const end = Math.min(values.length, i + Math.ceil(windowSize/2));
        
      // Calculate mean of values in window
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += values[j];
      }
      smoothed.push(sum / (end - start));
    }
  return smoothed;
}

// ============================================================================
// FUNCTION 12: applyTrends (line ~470 in results.js)
// ============================================================================
/**
 * Applies trends to metrics with proper index mapping (accounts for BCC insertion)
 */
function applyTrends(updatedMetrics, trends, playerName) {
  // Define constants
  const TREND_WEIGHT = 0.30; // How much trends influence the overall score
  const TREND_THRESHOLD = 0.005; // Minimum trend value to consider significant
  const BCC_INDEX = 14; // Index where BCC was inserted
 
  // Create a copy of metrics
  const adjustedMetrics = [...updatedMetrics];
  
  // Log Scheffler's trend application
  if (playerName === 'Scheffler, Scottie') {
    console.log(`\n🔄 TREND ADJUSTMENTS FOR ${playerName}:`);
    console.log(`Before trends applied: driving distance [1] = ${adjustedMetrics[1].toFixed(4)} yards`);
  }
  
  // Process each trend in the original trends array
  for (let originalIndex = 0; originalIndex < trends.length; originalIndex++) {
    // Skip insignificant trends
    if (Math.abs(trends[originalIndex]) <= TREND_THRESHOLD) {
      continue;
    }
    
    // Calculate the adjusted index (accounting for BCC insertion)
    // If the original index is 14 or higher, we need to add 1 to account for BCC
    const adjustedIndex = originalIndex >= 14 ? originalIndex + 1 : originalIndex;
    
    // Skip if adjusted index is out of bounds (shouldn't happen, but safety check)
    if (adjustedIndex >= updatedMetrics.length) {
      continue;
    }
    
    // Get metric name (for logging)
    const metricNames = [
      'strokesGainedTotal', 'drivingDistance', 'drivingAccuracy', 'strokesGainedT2G',
      'strokesGainedApp', 'strokesGainedArg', 'strokesGainedOTT', 'strokesGainedPutt',
      'greensInReg', 'scrambling', 'greatShots', 'poorShots',
      'scoringAverage', 'birdiesOrBetter', 'fairwayProx', 'roughProx',
      // Approach metrics...
      'approach <100 GIR', 'approach <100 SG', 'approach <100 Prox',
      'approach <150 FW GIR', 'approach <150 FW SG', 'approach <150 FW Prox',
      'approach <150 Rough GIR', 'approach <150 Rough SG', 'approach <150 Rough Prox',
      'approach >150 Rough GIR', 'approach >150 Rough SG', 'approach >150 Rough Prox',
      'approach <200 FW GIR', 'approach <200 FW SG', 'approach <200 FW Prox',
      'approach >200 FW GIR', 'approach >200 FW SG', 'approach >200 FW Prox'
    ];
    const metricName = metricNames[originalIndex] || `Unknown Metric ${originalIndex}`;
    
    // Determine if this is a "lower is better" metric
    const isLowerBetter = Array.from(METRIC_TYPES.LOWER_BETTER)
      .some(lowerBetterName => 
        normalizeMetricName(lowerBetterName) === normalizeMetricName(metricName)
      );
    
    // Calculate trend impact
    let trendImpact = trends[originalIndex] * TREND_WEIGHT;
    
    // For "lower is better" metrics, invert the trend impact
    if (isLowerBetter) {
      trendImpact = -trendImpact;
    }
    
    // Apply the trend multiplicatively to preserve proportionality
    const trendFactor = 1 + trendImpact;
    const safeTrendFactor = trendFactor === 0 ? 0.0001 : trendFactor;
    const originalValue = adjustedMetrics[adjustedIndex];
    adjustedMetrics[adjustedIndex] = originalValue * safeTrendFactor;
    
    // Detailed logging for Scheffler's driving distance
    if (playerName === 'Scheffler, Scottie' && originalIndex === 1) {
      console.log(`\n  Metric: ${metricName} (index ${originalIndex})`);
      console.log(`  Trend Value: ${trends[originalIndex].toFixed(6)} (fractional per-round change)`);
      console.log(`  Trend Weight: ${TREND_WEIGHT} (weight of trend in final adjustment)`);
      console.log(`  Trend Impact: ${trends[originalIndex].toFixed(6)} × ${TREND_WEIGHT} = ${trendImpact.toFixed(6)}`);
      console.log(`  Trend Factor: 1 + ${trendImpact.toFixed(6)} = ${safeTrendFactor.toFixed(6)}`);
      console.log(`  Value Before Trend: ${originalValue.toFixed(4)} yards`);
      console.log(`  Value After Trend: ${adjustedMetrics[adjustedIndex].toFixed(4)} yards`);
      console.log(`  Change: ${(adjustedMetrics[adjustedIndex] - originalValue).toFixed(4)} yards (${((adjustedMetrics[adjustedIndex] / originalValue - 1) * 100).toFixed(2)}%)\n`);
    }
  }
  
  if (playerName === 'Scheffler, Scottie') {
    console.log(`After trends applied: driving distance [1] = ${adjustedMetrics[1].toFixed(4)} yards\n`);
  }
  
  return adjustedMetrics;
}

// ============================================================================
// FUNCTION 13: calculateWAR (line ~520 in results.js)
// ============================================================================
/**
 * Calculates WAR without index adjustments
 */
function calculateWAR(adjustedMetrics, validatedKpis, groupStats, playerName, groups) {
  let war = 0;
  
  console.log(`${playerName}: Starting WAR calculation with ${validatedKpis.length} KPIs`);
  
  // First, validate all inputs to the WAR calculation
  if (!Array.isArray(adjustedMetrics) || !Array.isArray(validatedKpis)) {
    console.error(`Invalid inputs for ${playerName} WAR calculation`);
    return 0;
  }
  
  validatedKpis.forEach(kpi => {
    try {
      // Validate the KPI
      if (!kpi || typeof kpi.index !== 'number' || 
          typeof kpi.weight !== 'number' || !kpi.name) {
        console.warn(`Skipping invalid KPI for ${playerName}`);
        return;
      }
      
      const kpiIndex = kpi.index;
      
      // Safety check for array bounds
      if (kpiIndex < 0 || kpiIndex >= adjustedMetrics.length) {
        console.warn(`${playerName}: KPI index ${kpiIndex} out of bounds`);
        return;
      }
      
      // Get and validate the metric value
      let kpiValue = adjustedMetrics[kpiIndex];
      if (typeof kpiValue !== 'number' || isNaN(kpiValue)) {
        console.warn(`${playerName}: Invalid metric value at index ${kpiIndex}`);
        kpiValue = 0;
      }
      
      // APPLY TRANSFORMATIONS (same as group score calculation)
      // Transform "lower is better" metrics to "higher is better" for consistent z-score interpretation
      if (kpi.name === 'Poor Shots') {
        const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
        kpiValue = maxPoorShots - kpiValue;
      } else if (kpi.name.includes('Prox') ||
                 kpi.name === 'Fairway Proximity' ||
                 kpi.name === 'Rough Proximity') {
        // Strip group prefix to find correct METRIC_MAX_VALUES entry
        let baseKpiName = kpi.name;
        if (baseKpiName.includes(':')) {
          baseKpiName = baseKpiName.split(':')[1].trim();
        }
        // Get the appropriate max value for this proximity type
        const maxProxValue = METRIC_MAX_VALUES[baseKpiName] ||
                             (baseKpiName === 'Fairway Proximity' ? 60 :
                              baseKpiName === 'Rough Proximity' ? 80 :
                              baseKpiName === 'Approach <100 Prox' ? 40 :
                              baseKpiName === 'Approach <150 FW Prox' ? 50 :
                              baseKpiName === 'Approach <150 Rough Prox' ? 60 :
                              baseKpiName === 'Approach >150 Rough Prox' ? 75 :
                              baseKpiName === 'Approach <200 FW Prox' ? 65 :
                              baseKpiName === 'Approach >200 FW Prox' ? 90 : 60);
                             
        kpiValue = maxProxValue - kpiValue;
        kpiValue = Math.max(0, kpiValue);
      } else if (kpi.name === 'Scoring Average') {
        const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
        kpiValue = maxScore - kpiValue;
      }
      
      // Find the group for this KPI (now stored in the KPI object)
      const kpiGroup = kpi.groupName;
      
      if (!kpiGroup) {
        console.warn(`${playerName}: Could not find group for KPI: ${kpi.name}`);
        return;
      }
      
      // Get and validate the stats
      const kpiStats = groupStats[kpiGroup]?.[kpi.fullName];
      if (!kpiStats) {
        console.warn(`${playerName}: Stats not found for ${kpiGroup} -> ${kpi.fullName}`);
        return;
      }
      
      const mean = typeof kpiStats.mean === 'number' ? kpiStats.mean : 0;
      const stdDev = typeof kpiStats.stdDev === 'number' && kpiStats.stdDev > 0 ? kpiStats.stdDev : 0.0001;
      
      // Calculate z-score safely (now using transformed value)
      let zScore = (kpiValue - mean) / stdDev;
      
      // Apply transformation safely
      let transformedZScore = Math.sign(zScore) * Math.log(1 + Math.abs(zScore));
      
      // Calculate WAR contribution
      let kpiContribution = transformedZScore * kpi.weight;
      
      // Add to total WAR safely
      if (!isNaN(kpiContribution)) {
        war += kpiContribution;
      }
      
      console.log(`${playerName} - KPI: ${kpi.name}, Value: ${kpiValue.toFixed(3)}, Weight: ${kpi.weight.toFixed(4)}, Contribution: ${kpiContribution.toFixed(4)}`);
    } catch (e) {
      console.error(`Error processing KPI for ${playerName}: ${e.message}`);
    }
  });
  
  console.log(`${playerName}: Final WAR: ${war.toFixed(4)}`);
  return war;
}

// ============================================================================
// FUNCTION 14: normalizeMetricName (line 3346 in results.js)
// ============================================================================
/**
 * Normalizes metric names for comparison by converting to lowercase,
 * removing spaces, and standardizing abbreviations
 * NO CHANGES NEEDED - pure calculation, no data loading
 */
function normalizeMetricName(name) {
  return String(name).toLowerCase()
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/strokes(gained)?/g, 'sg') // Handle strokes gained variations
    .replace(/proximity/g, 'prox') // Standardize proximity
    .replace(/greens(in)?reg(ulation)?/g, 'gir') // Handle GIR variations
    .replace(/approach/g, 'app') // Standardize approach
    .replace(/&/g, 'and') // Handle ampersands
    .replace(/[<>]/g, ''); // Remove angle brackets
}
// ============================================================================
// FUNCTION 15: calculateMetricVolatility (line 2920 in results.js)
// ============================================================================
/**
 * Calculates metric volatility by analyzing trend magnitude and metric variance
 * Returns a value between 0.1 and 0.9 indicating confidence in metrics
 * NO CHANGES NEEDED - pure calculation, no data loading
 */
function calculateMetricVolatility(metrics, trends) {
  if (!metrics || !trends) return 0.5; // Default medium volatility if data missing
  
  // Get the magnitude of trends
  const trendsMagnitude = trends
    .filter(t => typeof t === 'number')
    .map(Math.abs)
    .reduce((sum, val) => sum + val, 0) / Math.max(1, trends.filter(t => typeof t === 'number').length);
  
  // Calculate standard deviation of available metrics as another volatility indicator
  const metricValues = Object.values(metrics).filter(v => typeof v === 'number' && !isNaN(v));
  
  let stdDev = 0;
  if (metricValues.length > 0) {
    const mean = metricValues.reduce((sum, val) => sum + val, 0) / metricValues.length;
    const squaredDiffs = metricValues.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / metricValues.length;
    stdDev = Math.sqrt(variance);
  }
  
  // Normalize standard deviation to a 0-1 scale (using a reasonable maximum value)
  const MAX_EXPECTED_STD_DEV = 5.0;
  const normalizedStdDev = Math.min(1, stdDev / MAX_EXPECTED_STD_DEV);
  
  // Normalize trends magnitude to a 0-1 scale
  const MAX_EXPECTED_TREND = 0.05;
  const normalizedTrendMagnitude = Math.min(1, trendsMagnitude / MAX_EXPECTED_TREND);
  
  // Combine both factors, giving more weight to trends
  const volatility = (normalizedTrendMagnitude * 0.7) + (normalizedStdDev * 0.3);
  
  console.log(`Volatility calculation: Trend magnitude = ${trendsMagnitude.toFixed(4)}, StdDev = ${stdDev.toFixed(2)}, Final volatility = ${volatility.toFixed(2)}`);
  
  // Return a value from 0.1 to 0.9 (never completely certain or uncertain)
  return 0.1 + (volatility * 0.8);
}

// ============================================================================
// FUNCTION 16: prepareRankingOutput (line 2798 in results.js)
// ============================================================================
/**
 * Prepares final ranking output by calculating confidence intervals and composite scores
 * Sorts players by refined weighted score with WAR as tiebreaker
 * NO CHANGES NEEDED - pure calculation, no data loading
 */
function prepareRankingOutput(processedData) {
  // Constants for ranking calculations
  const CLOSE_SCORE_THRESHOLD = 0.05; // 5% difference threshold for considering scores "close"
  const WAR_WEIGHT = 0.3; // 30% weight given to WAR in the composite score

  console.log(`Preparing ranking output for ${processedData.length} players...`);
  
  // Calculate confidence intervals and composite scores
  const dataWithConfidenceIntervals = processedData.map(player => {
    // Calculate uncertainty based on data coverage (less data = wider interval)
    const dataCoverageUncertainty = Math.max(0.1, 0.5 * (1 - player.dataCoverage));
    
    // Calculate metric volatility - more volatile metrics = wider interval
    const metricVolatility = calculateMetricVolatility(player.metrics, player.trends);
    
    // Combined uncertainty factor
    const uncertaintyFactor = (dataCoverageUncertainty + metricVolatility) / 2;
    
    // Calculate confidence interval margins
    const intervalMargin = uncertaintyFactor * Math.abs(player.weightedScore) * 0.5;
    
    // Calculate composite score that blends weighted score with WAR
    const compositeScore = (player.weightedScore * (1 - WAR_WEIGHT)) + (player.war * WAR_WEIGHT);
    
    return {
      ...player,
      confidenceInterval: {
        low: player.weightedScore - intervalMargin,
        high: player.weightedScore + intervalMargin
      },
      compositeScore // Add the calculated composite score
    };
  });
  
  console.log(`DEBUG: Before sorting - Sample player:`, {
    name: dataWithConfidenceIntervals[0]?.name,
    weightedScore: dataWithConfidenceIntervals[0]?.weightedScore,
    refinedWeightedScore: dataWithConfidenceIntervals[0]?.refinedWeightedScore,
    hasRefined: typeof dataWithConfidenceIntervals[0]?.refinedWeightedScore === 'number'
  });
  
  // Sort primarily by refined weighted score (which includes confidence and data coverage multipliers)
  const sortedData = dataWithConfidenceIntervals.sort((a, b) => {
    // Use refinedWeightedScore if available, fallback to weightedScore
    const scoreA = typeof a.refinedWeightedScore === 'number' ? a.refinedWeightedScore : a.weightedScore;
    const scoreB = typeof b.refinedWeightedScore === 'number' ? b.refinedWeightedScore : b.weightedScore;
    
    // Log first few comparisons
    if (a.name === "Spaun, J.J." || a.name === "Brennan, Michael") {
      console.log(`SORT: ${a.name} (refined: ${scoreA?.toFixed(3)}) vs ${b.name} (refined: ${scoreB?.toFixed(3)})`);
    }
    
    // For exact ties, use WAR directly
    if (scoreA === scoreB) {
      return b.war - a.war;
    }
    
    // For very close scores, use the composite score
    const scoresDifference = Math.abs(scoreA - scoreB);
    if (scoresDifference <= CLOSE_SCORE_THRESHOLD) {
      return b.compositeScore - a.compositeScore;
    }
    
    // Otherwise, sort by refined weighted score (which has confidence applied)
    return scoreB - scoreA;
  });
  
  // Add rank to each player
  let currentRank = 1;
  let lastWeightedScore = null;
  let lastCompositeScore = null;
  
  sortedData.forEach((player, index) => {
    // Use refinedWeightedScore if available, fallback to weightedScore
    const playerScore = typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore : player.weightedScore;
    
    // Check if this player should share a rank with the previous player
    if (index > 0) {
      const prevPlayer = sortedData[index - 1];
      const prevScore = typeof prevPlayer.refinedWeightedScore === 'number' ? prevPlayer.refinedWeightedScore : prevPlayer.weightedScore;
      
      // If refined weighted scores are identical, check if WAR is also identical
      if (playerScore === prevScore && 
          Math.abs(player.war - prevPlayer.war) < 0.01) {
        player.rank = prevPlayer.rank; // Same rank for true ties
      } else {
        player.rank = currentRank;
      }
    } else {
      player.rank = currentRank;
    }
    
    // Update tracking variables
    lastWeightedScore = playerScore;
    lastCompositeScore = player.compositeScore;
    currentRank++;
    
    // Log the ranking details
    console.log(`Rank ${player.rank}: ${player.name} - Score: ${player.weightedScore.toFixed(3)}, Refined: ${playerScore.toFixed(3)}, ` +
                `WAR: ${player.war.toFixed(2)}, Composite: ${player.compositeScore.toFixed(3)}`);
    
    // Log when WAR affected ranking
    if (index > 0) {
      const prevPlayer = sortedData[index - 1];
      const scoresDifference = Math.abs(player.weightedScore - prevPlayer.weightedScore);
      
      if (scoresDifference <= CLOSE_SCORE_THRESHOLD && 
          player.compositeScore !== prevPlayer.compositeScore) {
        // Determine who got the advantage from WAR
        const advantagedPlayer = player.compositeScore > prevPlayer.compositeScore ? player : prevPlayer;
        const disadvantagedPlayer = advantagedPlayer === player ? prevPlayer : player;
        
        console.log(`  WAR Tiebreaker: ${advantagedPlayer.name} (WAR: ${advantagedPlayer.war.toFixed(2)}) outranked ${disadvantagedPlayer.name} (WAR: ${disadvantagedPlayer.war.toFixed(2)})`);
      }
    }
  });
  
  return sortedData;
}

// ============================================================================
// FUNCTION 17: cacheGroupStats (line 3525 in results.js)
// ============================================================================
/**
 * Caches group statistics for future use
 * ADAPTED FOR NODE.JS: In GAS, this would store in PropertiesService.
 * In Node.js, this is a no-op since we don't need persistent caching.
 * Keeping function signature for compatibility.
 */
function cacheGroupStats(groupStats) {
  // In Node.js environment, we don't need to cache as we're processing in a single run
  // The original GAS version stored in PropertiesService for multi-execution persistence
  console.log("Group statistics caching: skipped in Node.js environment");
  // No-op: return undefined
}
// ============================================================================
// FUNCTION 18: cleanMetricValue (line 3327 in results.js)
// ============================================================================
/**
 * Cleans metric values by parsing numbers and handling percentages
 * NO CHANGES NEEDED - pure calculation, no data loading
 */
function cleanMetricValue(value, isPercentage = false) {
  let numericValue = typeof value === 'string' 
    ? parseFloat(value.replace(/[^0-9.\-]/g, ''))  // Preserve negative sign
    : Number(value);

  if (isNaN(numericValue)) {
    console.warn('Invalid value cleaned to 0:', value);
    numericValue = 0;
  }

  // Handle percentage normalization if needed
  if (isPercentage && numericValue > 1) {
    return numericValue / 100;
  }
  return numericValue;
}

// ============================================================================
// FUNCTION 19: getSimilarCourseIds (line 2084 in results.js)
// ============================================================================
/**
 * Extracts course IDs from a configuration array
 * ADAPTED FOR NODE.JS: Takes array instead of sheet range
 */
function getSimilarCourseIds(courseArray = []) {
  const courseIds = [];
  
  // Handle both array of arrays (from sheets) and flat arrays
  const flatArray = Array.isArray(courseArray[0]) 
    ? courseArray.flat() 
    : courseArray;
  
  flatArray.forEach(cellValue => {
    if (cellValue) {
      // Handle comma-separated IDs in a single cell
      if (typeof cellValue === 'string' && cellValue.includes(',')) {
        const ids = cellValue.split(',').map(id => id.trim()).filter(id => id);
        courseIds.push(...ids);
      } else {
        // Handle single ID
        courseIds.push(String(cellValue).trim());
      }
    }
  });
  
  return courseIds.filter(id => id !== '');
}

// ============================================================================
// FUNCTION 20: getMetricGroups (line 213 in results.js)
// ============================================================================
/**
 * Constructs metric group configuration from configuration object
 * ADAPTED FOR NODE.JS: Takes config object instead of sheet reads
 */
function getMetricGroups(config = {}) {
  // Read past performance configuration from config object
  const pastPerformanceEnabled = config.pastPerformanceEnabled || false;
  const pastPerformanceWeight = config.pastPerformanceWeight || 0;
  const currentEventId = config.currentEventId || null;

  // Master index registry - single source of truth
  const METRIC_INDICES = {
    // Historical Metrics (0-16)
    "SG Total": 0,
    "Driving Distance": 1,
    "Driving Accuracy": 2,
    "SG T2G": 3,
    "SG Approach": 4,
    "SG Around Green": 5,
    "SG OTT": 6,
    "SG Putting": 7,
    "Greens in Regulation": 8,
    "Scrambling": 9,
    "Great Shots": 10,
    "Poor Shots": 11,
    "Scoring Average": 12,
    "Birdies or Better": 13,
    "Birdie Chances Created": 14,
    "Fairway Proximity": 15,
    "Rough Proximity": 16,
    
    // Approach Metrics (17-34)
    "Approach <100 GIR": 17,
    "Approach <100 SG": 18,
    "Approach <100 Prox": 19,
    "Approach <150 FW GIR": 20,
    "Approach <150 FW SG": 21,
    "Approach <150 FW Prox": 22,
    "Approach <150 Rough GIR": 23,
    "Approach <150 Rough SG": 24,
    "Approach <150 Rough Prox": 25,
    "Approach >150 Rough GIR": 26,
    "Approach >150 Rough SG": 27,
    "Approach >150 Rough Prox": 28,
    "Approach <200 FW GIR": 29,
    "Approach <200 FW SG": 30,
    "Approach <200 FW Prox": 31,
    "Approach >200 FW GIR": 32,
    "Approach >200 FW SG": 33,
    "Approach >200 FW Prox": 34
  };

  // Build configuration from passed-in weights
  const configuration = {
    "Driving Performance": {
      metrics: {
        "Driving Distance": METRIC_INDICES["Driving Distance"],
        "Driving Accuracy": METRIC_INDICES["Driving Accuracy"],
        "SG OTT": METRIC_INDICES["SG OTT"]
      },
      weights: {
        "Driving Distance": config.weights?.drivingDistance ?? 0,
        "Driving Accuracy": config.weights?.drivingAccuracy ?? 0,
        "SG OTT": config.weights?.sgOTT ?? 0
      }
    },
    "Approach - Short (<100)": {
      metrics: {
        "Approach <100 GIR": METRIC_INDICES["Approach <100 GIR"],
        "Approach <100 SG": METRIC_INDICES["Approach <100 SG"],
        "Approach <100 Prox": METRIC_INDICES["Approach <100 Prox"]
      },
      weights: {
        "Approach <100 GIR": config.weights?.app100GIR ?? 0,
        "Approach <100 SG": config.weights?.app100SG ?? 0,
        "Approach <100 Prox": config.weights?.app100Prox ?? 0
      }
    },
    "Approach - Mid (100-150)": {
      metrics: {
        "Approach <150 FW GIR": METRIC_INDICES["Approach <150 FW GIR"],
        "Approach <150 FW SG": METRIC_INDICES["Approach <150 FW SG"],
        "Approach <150 FW Prox": METRIC_INDICES["Approach <150 FW Prox"],
        "Approach <150 Rough GIR": METRIC_INDICES["Approach <150 Rough GIR"],
        "Approach <150 Rough SG": METRIC_INDICES["Approach <150 Rough SG"],
        "Approach <150 Rough Prox": METRIC_INDICES["Approach <150 Rough Prox"]
      },
      weights: {
        "Approach <150 FW GIR": config.weights?.app150fwGIR ?? 0,
        "Approach <150 FW SG": config.weights?.app150fwSG ?? 0,
        "Approach <150 FW Prox": config.weights?.app150fwProx ?? 0,
        "Approach <150 Rough GIR": config.weights?.app150roughGIR ?? 0,
        "Approach <150 Rough SG": config.weights?.app150roughSG ?? 0,
        "Approach <150 Rough Prox": config.weights?.app150roughProx ?? 0
      }
    },
    "Approach - Long (150-200)": {
      metrics: {
        "Approach <200 FW GIR": METRIC_INDICES["Approach <200 FW GIR"],
        "Approach <200 FW SG": METRIC_INDICES["Approach <200 FW SG"],
        "Approach <200 FW Prox": METRIC_INDICES["Approach <200 FW Prox"],
        "Approach >150 Rough GIR": METRIC_INDICES["Approach >150 Rough GIR"],
        "Approach >150 Rough SG": METRIC_INDICES["Approach >150 Rough SG"],
        "Approach >150 Rough Prox": METRIC_INDICES["Approach >150 Rough Prox"]
      },
      weights: {
        "Approach <200 FW GIR": config.weights?.app200GIR ?? 0,
        "Approach <200 FW SG": config.weights?.app200SG ?? 0,
        "Approach <200 FW Prox": config.weights?.app200Prox ?? 0,
        "Approach >150 Rough GIR": config.weights?.app200roughGIR ?? 0,
        "Approach >150 Rough SG": config.weights?.app200roughSG ?? 0,
        "Approach >150 Rough Prox": config.weights?.app200roughProx ?? 0
      }
    },
    "Approach - Very Long (>200)": {
      metrics: {
        "Approach >200 FW GIR": METRIC_INDICES["Approach >200 FW GIR"],
        "Approach >200 FW SG": METRIC_INDICES["Approach >200 FW SG"],
        "Approach >200 FW Prox": METRIC_INDICES["Approach >200 FW Prox"]
      },
      weights: {
        "Approach >200 FW GIR": config.weights?.app200plusGIR ?? 0,
        "Approach >200 FW SG": config.weights?.app200plusSG ?? 0,
        "Approach >200 FW Prox": config.weights?.app200plusProx ?? 0
      }
    },
    "Putting": {
      metrics: {
        "SG Putting": METRIC_INDICES["SG Putting"]
      },
      weights: {
        "SG Putting": config.weights?.sgPutting ?? 0
      }
    },
    "Around the Green": {
      metrics: {
        "SG Around Green": METRIC_INDICES["SG Around Green"]
      },
      weights: {
        "SG Around Green": config.weights?.sgAroundGreen ?? 0
      }
    },
    "Scoring": {
      metrics: {
        "SG T2G": METRIC_INDICES["SG T2G"],
        "Scoring Average": METRIC_INDICES["Scoring Average"],
        "Birdie Chances Created": METRIC_INDICES["Birdie Chances Created"],
        "Scoring: Approach <100 SG": METRIC_INDICES["Approach <100 SG"],
        "Scoring: Approach <150 FW SG": METRIC_INDICES["Approach <150 FW SG"],
        "Scoring: Approach <150 Rough SG": METRIC_INDICES["Approach <150 Rough SG"],
        "Scoring: Approach <200 FW SG": METRIC_INDICES["Approach <200 FW SG"],
        "Scoring: Approach >200 FW SG": METRIC_INDICES["Approach >200 FW SG"],
        "Scoring: Approach >150 Rough SG": METRIC_INDICES["Approach >150 Rough SG"]
      },
      weights: {
        "SG T2G": config.weights?.sgT2G ?? 0,
        "Scoring Average": config.weights?.scoringAverage ?? 0,
        "Birdie Chances Created": config.weights?.birdieChances ?? 0,
        "Scoring: Approach <100 SG": config.weights?.scoring_app100SG ?? 0,
        "Scoring: Approach <150 FW SG": config.weights?.scoring_app150fwSG ?? 0,
        "Scoring: Approach <150 Rough SG": config.weights?.scoring_app150roughSG ?? 0,
        "Scoring: Approach <200 FW SG": config.weights?.scoring_app200SG ?? 0,
        "Scoring: Approach >200 FW SG": config.weights?.scoring_app200plusSG ?? 0,
        "Scoring: Approach >150 Rough SG": config.weights?.scoring_app150roughSG_alt ?? 0
      }
    },
    "Course Management": {
      metrics: {
        "Scrambling": METRIC_INDICES["Scrambling"],
        "Great Shots": METRIC_INDICES["Great Shots"],
        "Poor Shots": METRIC_INDICES["Poor Shots"],
        "Course Management: Approach <100 Prox": METRIC_INDICES["Approach <100 Prox"],
        "Course Management: Approach <150 FW Prox": METRIC_INDICES["Approach <150 FW Prox"],
        "Course Management: Approach <150 Rough Prox": METRIC_INDICES["Approach <150 Rough Prox"],
        "Course Management: Approach >150 Rough Prox": METRIC_INDICES["Approach >150 Rough Prox"],
        "Course Management: Approach <200 FW Prox": METRIC_INDICES["Approach <200 FW Prox"],
        "Course Management: Approach >200 FW Prox": METRIC_INDICES["Approach >200 FW Prox"]
      },
      weights: {
        "Scrambling": config.weights?.scrambling ?? 0,
        "Great Shots": config.weights?.greatShots ?? 0,
        "Poor Shots": config.weights?.poorShots ?? 0,
        "Course Management: Approach <100 Prox": config.weights?.cm_app100Prox ?? 0,
        "Course Management: Approach <150 FW Prox": config.weights?.cm_app150fwProx ?? 0,
        "Course Management: Approach <150 Rough Prox": config.weights?.cm_app150roughProx ?? 0,
        "Course Management: Approach >150 Rough Prox": config.weights?.cm_app150roughProx_over ?? 0,
        "Course Management: Approach <200 FW Prox": config.weights?.cm_app200Prox ?? 0,
        "Course Management: Approach >200 FW Prox": config.weights?.cm_app200plusProx ?? 0
      }
    },
    "Past Performance": {
      enabled: pastPerformanceEnabled,
      weight: pastPerformanceWeight,
      currentEventId: currentEventId
    }
  };

  // Validate configuration structure
  if (!configuration || typeof configuration !== "object") {
    throw new Error("Invalid configuration format");
  }

  // Group-level weights from config (Q16-Q24 for each group)
  const groupWeightMap = {
    "Driving Performance": config.groupWeights?.driving ?? 0,
    "Approach - Short (<100)": config.groupWeights?.appShort ?? 0,
    "Approach - Mid (100-150)": config.groupWeights?.appMid ?? 0,
    "Approach - Long (150-200)": config.groupWeights?.appLong ?? 0,
    "Approach - Very Long (>200)": config.groupWeights?.appVeryLong ?? 0,
    "Putting": config.groupWeights?.putting ?? 0,
    "Around the Green": config.groupWeights?.aroundGreen ?? 0,
    "Scoring": config.groupWeights?.scoring ?? 0,
    "Course Management": config.groupWeights?.courseManagement ?? 0
  };

  // Convert to final format with proper error handling
  try {
    return {
      groups: Object.entries(configuration)
        .filter(([key]) => key !== "Past Performance")
        .map(([groupName, groupData]) => ({
          name: groupName,
          metrics: Object.entries(groupData.metrics).map(([metricName, index]) => ({
            name: metricName,
            index,
            weight: groupData.weights[metricName] || 0
          })),
          weight: groupWeightMap[groupName] || Object.values(groupData.weights).reduce((sum, w) => sum + w, 0)
        })),
      pastPerformance: configuration["Past Performance"]
    };
  } catch (e) {
    console.error("Configuration processing failed:", e);
    throw new Error("Invalid metric group configuration format");
  }
}

// ============================================================================
// FUNCTION 21: aggregatePlayerData (line 2110 in results.js)
// ============================================================================
/**
 * Aggregates player data from multiple sources (tournament field, historical data, approach skill)
 * ADAPTED FOR NODE.JS: Takes data arrays instead of sheet reads
 */
function aggregatePlayerData(players = {}, historicalData = [], approachData = {}, similarCourseIds = [], puttingCourseIds = []) {
  const aggregatedPlayers = { ...players };

  // Initialize players if needed
  Object.values(aggregatedPlayers).forEach(player => {
    if (!player.events) player.events = {};
    if (!player.historicalRounds) player.historicalRounds = [];
    if (!player.similarRounds) player.similarRounds = [];
    if (!player.puttingRounds) player.puttingRounds = [];
    if (!player.approachMetrics) player.approachMetrics = {};
  });

  console.log(`Starting historical data processing with ${historicalData.length} rounds`);

  // First pass: Gather event metadata
  const eventMetadata = {};
  historicalData.forEach(row => {
    const eventId = row.eventId;
    if (!eventId) return;
    
    if (!eventMetadata[eventId]) {
      // Convert eventId to string for comparison with course ID arrays
      const eventIdStr = String(eventId);
      const isSimilar = similarCourseIds.includes(eventIdStr);
      const isPutting = puttingCourseIds.includes(eventIdStr);
      
      eventMetadata[eventId] = {
        eventId: eventId,
        isPuttingSpecific: isPutting,
        isSimilar: isSimilar,
        categoryText: (isPutting && isSimilar) ? "Both" :
                      (isPutting) ? "Putting" :
                      (isSimilar) ? "Similar" : "Regular"
      };
    }
  });

  console.log(`Found ${Object.keys(eventMetadata).length} unique events`);
  console.log(`Found ${Object.values(eventMetadata).filter(e => e.isPuttingSpecific).length} putting-specific events`);
  console.log(`Found ${Object.values(eventMetadata).filter(e => e.isSimilar).length} similar events`);

  // Second pass: Process player data
  let roundsProcessed = 0;
  historicalData.forEach(row => {
    const dgId = row.dgId;
    if (!aggregatedPlayers[dgId]) return;
    
    roundsProcessed++;
    if (roundsProcessed % 100 === 0) {
      console.log(`Processing round ${roundsProcessed} for player ${aggregatedPlayers[dgId].name}`);
    }

    const eventId = row.eventId;
    const roundDate = new Date(row.date || 0);
    const roundYear = roundDate.getFullYear();
    
    // Create year-specific event key
    const eventKey = `${dgId}-${eventId}-${roundYear}`;

    // Get event type
    const eventType = eventMetadata[eventId] || { 
      isPuttingSpecific: false, 
      isSimilar: false,
      categoryText: "Regular" 
    };
    
    // Initialize event if not exists
    if (!aggregatedPlayers[dgId].events[eventKey]) {
      aggregatedPlayers[dgId].events[eventKey] = {
        eventId: eventId,
        year: roundYear,
        position: row.position,
        isPuttingSpecific: eventType.isPuttingSpecific,
        isSimilar: eventType.isSimilar,
        categoryText: eventType.categoryText,
        rounds: []
      };
    }

    // Create round data
    const roundData = {
      playerName: aggregatedPlayers[dgId].name,
      date: roundDate,
      eventId: eventId,
      isPuttingSpecific: eventType.isPuttingSpecific,
      isSimilar: eventType.isSimilar,
      categoryText: eventType.categoryText,
      roundNum: row.roundNum,
      metrics: row.metrics || {}
    };

    // Add to event
    aggregatedPlayers[dgId].events[eventKey].rounds.push(roundData);

    // Add to appropriate collections
    // A round can be in BOTH similar and putting if the event is in both ranges
    if (eventType.isPuttingSpecific) {
      aggregatedPlayers[dgId].puttingRounds.push(roundData);
    }
    
    if (eventType.isSimilar) {
      aggregatedPlayers[dgId].similarRounds.push(roundData);
    }
    
    // Always add to historicalRounds so the most recent rounds are included
    aggregatedPlayers[dgId].historicalRounds.push(roundData);
  });

  console.log(`COMPLETED: Processed ${roundsProcessed} total rounds from Historical Data`);
  
  // Post-processing: Sort all rounds by date
  Object.values(aggregatedPlayers).forEach(player => {
    player.historicalRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
    player.similarRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
    player.puttingRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
    
    console.log(`Player ${player.name}: ${player.historicalRounds.length} historical rounds, ` +
                `${player.similarRounds.length} similar course rounds, ` +
                `${player.puttingRounds.length} putting-specific rounds`);
  });

  // Add approach metrics
  Object.entries(approachData).forEach(([dgId, metrics]) => {
    if (aggregatedPlayers[dgId]) {
      aggregatedPlayers[dgId].approachMetrics = metrics;
    }
  });
  
  return aggregatedPlayers;
}

// ============================================================================
// FUNCTION 22: generatePlayerRankings (line 35 in results.js)
// ============================================================================
/**
 * Main orchestrator function that calculates player rankings
 * ADAPTED FOR NODE.JS: Takes data objects instead of SpreadsheetApp sheet reads
 */
function generatePlayerRankings(players, metricGroups, historicalData, approachData, similarCourseIds, puttingCourseIds, config = {}) {
  console.log(`Starting generatePlayerRankings with ${Object.keys(players).length} players`);
  
  try {
    const DELTA_PREDICTIVE_WAR_WEIGHT = 0.05;
    const DELTA_PERCENTILE = 0.1;
    const CURRENT_SEASON = typeof config.currentSeason === 'number'
      ? config.currentSeason
      : new Date().getFullYear();

    // 1. Aggregate Player Data
    const aggregatedPlayers = aggregatePlayerData(
      players, 
      historicalData, 
      approachData, 
      similarCourseIds, 
      puttingCourseIds
    );

    // 2. Calculate Metrics and Apply Weights
    const rankedPlayers = calculatePlayerMetrics(aggregatedPlayers, {
      groups: metricGroups.groups,
      pastPerformance: metricGroups.pastPerformance,
      config: config
    });

    const processedData = rankedPlayers.players;
    const groupStats = rankedPlayers.groupStats || {};

    const resolveDeltaScoresById = () => {
      if (config && typeof config.getDeltaPlayerScoresForEvent === 'function' && metricGroups?.pastPerformance?.currentEventId) {
        return config.getDeltaPlayerScoresForEvent(metricGroups.pastPerformance.currentEventId, CURRENT_SEASON) || {};
      }
      if (config && config.deltaScoresById) return config.deltaScoresById;
      if (config && config.deltaScoresByEvent && metricGroups?.pastPerformance?.currentEventId) {
        const entry = config.deltaScoresByEvent[String(metricGroups.pastPerformance.currentEventId)];
        if (!entry) return {};
        if (CURRENT_SEASON && entry.season && Number(entry.season) !== Number(CURRENT_SEASON)) return {};
        return entry.players || {};
      }
      return {};
    };

    const deltaScoresById = resolveDeltaScoresById();
    const courseSetupWeights = config?.courseSetupWeights ? { ...config.courseSetupWeights } : null;
    if (courseSetupWeights) {
      const courseTotalWeight = Object.values(courseSetupWeights)
        .reduce((sum, w) => sum + (typeof w === 'number' && !isNaN(w) ? w : 0), 0);
      if (courseTotalWeight && Math.abs(courseTotalWeight - 1.0) > 0.01) {
        Object.keys(courseSetupWeights).forEach(key => {
          const value = courseSetupWeights[key];
          courseSetupWeights[key] = (typeof value === 'number' && !isNaN(value))
            ? value / courseTotalWeight
            : 0;
        });
      }
    }

    const DELTA_BLEND_PRED = 0.7;
    const DELTA_BLEND_TREND = 0.3;

    const deltaTrendScores = Object.values(deltaScoresById)
      .map(entry => entry?.deltaTrendScore)
      .filter(value => typeof value === 'number' && !isNaN(value))
      .sort((a, b) => a - b);
    const deltaPredictiveScores = Object.values(deltaScoresById)
      .map(entry => entry?.deltaPredictiveScore)
      .filter(value => typeof value === 'number' && !isNaN(value))
      .sort((a, b) => a - b);

    const getPercentileThreshold = (values, percentile) => {
      if (!values.length) return null;
      const idx = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * percentile)));
      return values[idx];
    };

    const deltaTrendLow = getPercentileThreshold(deltaTrendScores, DELTA_PERCENTILE);
    const deltaTrendHigh = getPercentileThreshold(deltaTrendScores, 1 - DELTA_PERCENTILE);
    const deltaPredLow = getPercentileThreshold(deltaPredictiveScores, DELTA_PERCENTILE);
    const deltaPredHigh = getPercentileThreshold(deltaPredictiveScores, 1 - DELTA_PERCENTILE);

    const computeBucketSignalMap = (scoresById, courseSetup) => {
      if (!courseSetup) return new Map();
      const bucketWeights = {
        short: courseSetup?.under100,
        mid: courseSetup?.from100to150,
        long: courseSetup?.from150to200,
        veryLong: courseSetup?.over200
      };
      const bucketKeys = ['short', 'mid', 'long', 'veryLong'];
      const totalWeight = bucketKeys.reduce((sum, key) => {
        const value = bucketWeights[key];
        return sum + (typeof value === 'number' && !isNaN(value) ? value : 0);
      }, 0);
      if (!totalWeight) return new Map();

      const entries = [];
      Object.entries(scoresById || {}).forEach(([dgId, entry]) => {
        if (!entry || (!entry.deltaTrendBuckets && !entry.deltaPredictiveBuckets)) return;
        let weightedSignal = 0;
        bucketKeys.forEach(key => {
          const weight = bucketWeights[key];
          if (typeof weight !== 'number' || isNaN(weight) || weight === 0) return;
          const trendVal = typeof entry.deltaTrendBuckets?.[key] === 'number' ? entry.deltaTrendBuckets[key] : 0;
          const predVal = typeof entry.deltaPredictiveBuckets?.[key] === 'number' ? entry.deltaPredictiveBuckets[key] : 0;
          const blended = (DELTA_BLEND_PRED * predVal) + (DELTA_BLEND_TREND * trendVal);
          weightedSignal += blended * (weight / totalWeight);
        });
        entries.push({ dgId, signal: weightedSignal });
      });

      if (!entries.length) return new Map();
      const mean = entries.reduce((sum, entry) => sum + entry.signal, 0) / entries.length;
      const variance = entries.reduce((sum, entry) => sum + Math.pow(entry.signal - mean, 2), 0) / entries.length;
      const stdDev = Math.sqrt(variance) || 0;
      const map = new Map();
      entries.forEach(entry => {
        const zScore = stdDev > 0 ? (entry.signal - mean) / stdDev : 0;
        map.set(entry.dgId, { signal: entry.signal, zScore });
      });
      return map;
    };

    const buildBucketSignalNote = (entry, courseSetup, signalEntry) => {
      if (!entry || (!entry.deltaTrendBuckets && !entry.deltaPredictiveBuckets)) return null;
      if (!courseSetup) return null;
      const bucketWeights = {
        short: courseSetup?.under100,
        mid: courseSetup?.from100to150,
        long: courseSetup?.from150to200,
        veryLong: courseSetup?.over200
      };
      const bucketMeta = [
        { key: 'short', label: 'S' },
        { key: 'mid', label: 'M' },
        { key: 'long', label: 'L' },
        { key: 'veryLong', label: 'VL' }
      ];
      const totalWeight = bucketMeta.reduce((sum, { key }) => {
        const value = bucketWeights[key];
        return sum + (typeof value === 'number' && !isNaN(value) ? value : 0);
      }, 0);
      if (!totalWeight) return null;

      const bucketThreshold = 0.005;
      let weightedSignal = 0;
      const bucketFlags = bucketMeta.map(({ key, label }) => {
        const weight = bucketWeights[key];
        if (typeof weight !== 'number' || isNaN(weight) || weight === 0) {
          return `${label}∅`;
        }
        const trendVal = typeof entry.deltaTrendBuckets?.[key] === 'number' ? entry.deltaTrendBuckets[key] : 0;
        const predVal = typeof entry.deltaPredictiveBuckets?.[key] === 'number' ? entry.deltaPredictiveBuckets[key] : 0;
        const blended = (DELTA_BLEND_PRED * predVal) + (DELTA_BLEND_TREND * trendVal);
        weightedSignal += blended * (weight / totalWeight);
        const arrow = blended >= bucketThreshold ? '↑' : (blended <= -bucketThreshold ? '↓' : '→');
        return `${label}${arrow}`;
      });

      const signalValue = signalEntry?.signal ?? weightedSignal;
      const zScore = signalEntry?.zScore ?? 0;
      const weightedArrow = zScore >= 0 ? '↑' : '↓';
      return `BucketSig ${weightedArrow} z=${zScore.toFixed(2)} (${signalValue.toFixed(3)}) [${bucketFlags.join(' ')}]`;
    };

    const bucketSignalById = computeBucketSignalMap(deltaScoresById, courseSetupWeights);

    const buildDeltaNote = (trendScore, predScore, entry, courseSetup, signalEntry) => {
      const parts = [];
      const hasPred = typeof predScore === 'number';
      if (hasPred) {
        if (deltaPredHigh !== null && predScore >= deltaPredHigh) {
          parts.push('ΔPred↑');
        } else if (deltaPredLow !== null && predScore <= deltaPredLow) {
          parts.push('ΔPred↓');
        } else {
          parts.push('ΔPred→');
        }
      } else {
        parts.push('ΔPred∅');
      }

      const hasTrend = typeof trendScore === 'number';
      if (hasTrend) {
        if (deltaTrendHigh !== null && trendScore >= deltaTrendHigh) {
          parts.push('ΔTrend↑');
        } else if (deltaTrendLow !== null && trendScore <= deltaTrendLow) {
          parts.push('ΔTrend↓');
        } else {
          parts.push('ΔTrend→');
        }
      } else {
        parts.push('ΔTrend∅');
      }

      const bucketNote = buildBucketSignalNote(entry, courseSetup, signalEntry);
      return `For Course Setup - ${parts.join(' ')}${bucketNote ? ` | ${bucketNote}` : ''}`;
    };

    processedData.forEach(player => {
      if (!player || !player.dgId) return;
      const entry = deltaScoresById[String(player.dgId)] || null;
      const trendScore = entry?.deltaTrendScore;
      const predScore = entry?.deltaPredictiveScore;
      player.deltaTrendScore = typeof trendScore === 'number' ? trendScore : null;
      player.deltaPredictiveScore = typeof predScore === 'number' ? predScore : null;
      const bucketSignalEntry = bucketSignalById.get(String(player.dgId)) || null;
      player.deltaNote = buildDeltaNote(
        player.deltaTrendScore,
        player.deltaPredictiveScore,
        entry,
        courseSetupWeights,
        bucketSignalEntry
      );

      if (typeof player.deltaPredictiveScore === 'number') {
        const cappedDelta = Math.max(-1, Math.min(1, player.deltaPredictiveScore));
        const deltaWarImpact = cappedDelta * DELTA_PREDICTIVE_WAR_WEIGHT;
        player.deltaWarImpact = deltaWarImpact;
        player.war = (typeof player.war === 'number' ? player.war : 0) + deltaWarImpact;
      } else {
        player.deltaWarImpact = 0;
      }
    });

    console.log(`Processed ${processedData.length} players with rankings`);

    // 3. Sort and Prepare Output
    const sortedData = prepareRankingOutput(processedData);

    // 4. Cache stats (no-op in Node.js)
    cacheGroupStats(groupStats);

    // 5. Return results
    return {
      success: true,
      players: sortedData,
      groupStats: groupStats,
      timestamp: new Date().toISOString(),
      message: "Rankings generated successfully!"
    };

  } catch (error) {
    console.error(`ERROR in generatePlayerRankings: ${error.message}`);
    throw error;
  }
}
