const METRIC_MAX_VALUES = {
  'Approach <100 Prox': 40,         // Avg: 16ft from <100y
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
// Helper function to convert per-shot SG values to per-round values
function normalizeApproachSG(perShotValue) {
  // Average number of approach shots per round on PGA Tour
  const AVG_APPROACH_SHOTS_PER_ROUND = 18;
  
  // Convert per-shot value to per-round value
  return perShotValue * AVG_APPROACH_SHOTS_PER_ROUND;
}

// Helper function to calculate Birdie Chances Created using clean metrics
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

// Helper function to apply trends to metrics with proper index mapping
function applyTrends(updatedMetrics, trends, playerName) {
  // Define constants
  const TREND_WEIGHT = 0.30; // How much trends influence the overall score
  const TREND_THRESHOLD = 0.005; // Minimum trend value to consider significant
  const BCC_INDEX = 14; // Index where BCC was inserted
 
  // Create a copy of metrics
  const adjustedMetrics = [...updatedMetrics];
  
  // Log for debugging
  console.log(`${playerName}: Trends array length: ${trends.length}, Metrics array length: ${updatedMetrics.length}`);
  
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
      console.warn(`${playerName}: Skipping trend at adjusted index ${adjustedIndex} (out of bounds)`);
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
    
    // Apply the trend
    const originalValue = adjustedMetrics[adjustedIndex];
    adjustedMetrics[adjustedIndex] = originalValue + trendImpact;
    
    console.log(`${playerName}: Applied trend to ${metricName} (original idx: ${originalIndex}, adjusted idx: ${adjustedIndex}): ${originalValue.toFixed(3)} → ${adjustedMetrics[adjustedIndex].toFixed(3)} (trend: ${trends[originalIndex].toFixed(3)}, impact: ${trendImpact.toFixed(3)})`);
  }
  
  return adjustedMetrics;
}

// Helper function to calculate WAR without index adjustments
function calculateWAR(adjustedMetrics, validatedKpis, groupStats, playerName, groups) {
  let war = 0;
  
  //console.log(`${playerName}: Starting WAR calculation with ${validatedKpis.length} KPIs`);
  
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
      
      // Find the group for this KPI
      let kpiGroup = null;
      for (const group of groups) {
        if (group.metrics.some(m => m.name === kpi.name)) {
          kpiGroup = group.name;
          break;
        }
      }
      
      if (!kpiGroup) {
        console.warn(`${playerName}: Could not find group for KPI: ${kpi.name}`);
        return;
      }
      
      // Get and validate the stats
      const kpiStats = groupStats[kpiGroup]?.[kpi.name];
      if (!kpiStats) {
        console.warn(`${playerName}: Stats not found for ${kpiGroup} -> ${kpi.name}`);
        return;
      }
      
      const mean = typeof kpiStats.mean === 'number' ? kpiStats.mean : 0;
      const stdDev = typeof kpiStats.stdDev === 'number' && kpiStats.stdDev > 0 ? kpiStats.stdDev : 0.0001;
      
      // Calculate z-score safely
      let zScore = (kpiValue - mean) / stdDev;
      
      // Apply transformation safely
      let transformedZScore = Math.sign(zScore) * Math.log(1 + Math.abs(zScore));
      
      // Calculate WAR contribution
      let kpiContribution = transformedZScore * kpi.weight;
      
      // Add to total WAR safely
      if (!isNaN(kpiContribution)) {
        war += kpiContribution;
      }
      
      //console.log(`${playerName} - KPI: ${kpi.name}, Value: ${kpiValue.toFixed(3)}, Weight: ${kpi.weight.toFixed(4)}, Contribution: ${kpiContribution.toFixed(4)}`);
    } catch (e) {
      console.error(`Error processing KPI for ${playerName}: ${e.message}`);
    }
  });
  
  //console.log(`${playerName}: Final WAR: ${war.toFixed(4)}`);
  return war;
}

// Helper function to calculate historical impact - NOT USED
function calculateHistoricalImpact(playerEvents, playerName, pastPerformance) {
  // Access globals from parent scope
  const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
  const PAST_PERF_ENABLED = pastPerformance?.enabled || false;
  const PAST_PERF_WEIGHT = Math.min(Math.max(pastPerformance?.weight || 0, 0), 1);
  const CURRENT_EVENT_ID = pastPerformance?.currentEventId ? String(pastPerformance.currentEventId) : null;
  
  // If no current event ID or no player events, return 0
  if (!CURRENT_EVENT_ID || !playerEvents) return 0;

  //console.log(`===== Beginning historical impact calc for ${playerName} at event ${CURRENT_EVENT_ID} =====`);
  //console.log(`===== Player events keys: ${Object.keys(playerEvents).join(', ')} =====`);
  
  const currentYear = new Date().getFullYear();
  const pastEvents = [];

  // Find all events matching the current event ID using a for loop
  const matchingEvents = [];
  const playerEventKeys = Object.keys(playerEvents);

  for (let i = 0; i < playerEventKeys.length; i++) {
    const key = playerEventKeys[i];
    const event = playerEvents[key];

    // Check if this is the target event by eventId
    if (String(event.eventId) === CURRENT_EVENT_ID) {
      // Only include if this is a past event (has year property and year < currentYear)
      if (event.year && event.year < currentYear) {
        matchingEvents.push([key, event]);
      }
    }
  }

  //console.log(`Found ${matchingEvents.length} matching historical events for event ${CURRENT_EVENT_ID}`);

  // DUMP FULL RAW DATA FOR MATCHING EVENTS
  for (let i = 0; i < matchingEvents.length; i++) {
    const [key, event] = matchingEvents[i];
    //console.log(`\n========== EVENT #${i + 1} (${event.year}) ==========`);
    console.log(`Event key: ${key}, eventId: ${event.eventId}, year: ${event.year}, position: ${event.position}`);

    // Log all top-level keys in the event
    console.log(`Event object keys: ${Object.keys(event).join(', ')}`);

    // Create a version we can stringify without the full round details
    const eventSummary = {
      ...event,
      rounds: `[Array of ${event.rounds?.length || 0} rounds]` // Replace actual rounds array with summary
    };

    // Stringify the event summary with indentation for readability
    console.log(`\nEvent structure:\n${JSON.stringify(eventSummary, null, 2)}`);

    // Show round numbers if available
    if (event.rounds && event.rounds.length > 0) {
      const roundNumbers = [];
      for (let j = 0; j < event.rounds.length; j++) {
        roundNumbers.push(event.rounds[j].roundNum);
      }
      roundNumbers.sort();
      console.log(`Round numbers present: ${roundNumbers.join(', ')}`);
    }
  }

  // Process each matching event
  for (let i = 0; i < matchingEvents.length; i++) {
    const [key, event] = matchingEvents[i];
    console.log(`\nProcessing event key: ${key}, eventId: ${event.eventId}, year: ${event.year}, position: ${event.position}`);

    // Determine if this event has all rounds or player missed the cut
    let isCompleteEvent = false;
    let missedCut = false;

    if (event.rounds && event.rounds.length > 0) {
      const roundNumbers = [];
      for (let j = 0; j < event.rounds.length; j++) {
        roundNumbers.push(event.rounds[j].roundNum);
      }
      roundNumbers.sort();

      isCompleteEvent = roundNumbers.includes(4); // Has final round
      missedCut = !isCompleteEvent && (roundNumbers.includes(1) || roundNumbers.includes(2)); // Only early rounds

      console.log(`Event has rounds: ${roundNumbers.join(', ')}`);
      console.log(`Complete event: ${isCompleteEvent}, Missed cut: ${missedCut}`);
    }

    // Position handling
    // Handle first the missed cut case regardless of position value
    if (missedCut) {
      // Player only played early rounds, treat as missed cut
      console.log(`Year ${event.year}: Round pattern indicates missed cut`);
      pastEvents.push({
        year: event.year,
        position: 100,
        finText: "CUT",
        specialFinish: true,
        source: 'missedCut'
      });
    
    } else if (event.position !== undefined && event.position !== null && !isNaN(event.position)) {
      // Normal finish with valid position
      console.log(`Year ${event.year}: Actual finish position ${event.position}`);
      pastEvents.push({
        year: event.year,
        position: event.position,
        finText: event.position.toString(),
        estimated: false,
        source: 'actual'
      });
    
    // Finally, handle completed events with missing position data
    } else if (isCompleteEvent) {
      // Player completed all rounds but we don't have position data
      console.log(`Year ${event.year}: Player completed all rounds but no position data`);
      const estimatedPosition = 35; // Default estimate

      pastEvents.push({
        year: event.year,
        position: estimatedPosition,
        finText: "Unknown",
        estimated: true,
        source: 'completed'
      });
    } else {
      console.log(`Year ${event.year}: Cannot determine finish position reliably, skipping`);
    }
  }

  console.log(`Found ${pastEvents.length} past events for ${playerName} at event ${CURRENT_EVENT_ID}`);

  if (pastEvents.length === 0) {
    console.log(`No past events found for ${playerName} at event ${CURRENT_EVENT_ID} - applying inexperience penalty`);
    return -0.25; // Small penalty for no course history
  }

  // Sort events by year, most recent first
  pastEvents.sort((a, b) => b.year - a.year);

  console.log(`After sorting: ${pastEvents.length} past events`);
  
  for (let i = 0; i < pastEvents.length; i++) {
    const event = pastEvents[i];
    console.log(`Event ${i + 1}: Year=${event.year}, Position=${event.position}, Text=${event.finText}, Type=${event.specialFinish ? 'Special' : (event.estimated ? 'Estimated' : 'Normal')}, Source=${event.source || 'unknown'}`);
  }

  let totalWeightedImpact = 0;
  let totalWeight = 0;

  // Calculate impact with recency weighting
  for (let i = 0; i < pastEvents.length; i++) {
    const event = pastEvents[i];
    // Ensure position is a valid number
    const position = isNaN(event.position) ? 100 : event.position;
    let eventImpact;

    // Special handling for WD/CUT
    if (event.specialFinish === true) {
      // Negative impact for WD/CUT
      eventImpact = -0.5;  // Penalty for WD/CUT
      console.log(`Event year ${event.year}, result: ${event.finText}, impact: ${eventImpact} (special finish)`);
    
    // Estimated positions get reduced impact
    } else if (event.estimated === true) {
      // Conservative impact for estimated positions
      if (position <= 25) eventImpact = 0.3;  // Assume decent finish
      else if (position <= 50) eventImpact = 0.1;  // Assume mediocre finish
      else eventImpact = -0.1;  // Assume below-average finish

      console.log(`Event year ${event.year}, result: ${event.finText}, impact: ${eventImpact} (estimated position)`);
    
    // Normal position-based impact for finished tournaments
    } else {
      if (position === 1) eventImpact = 2.0;       // Win gets double impact
      else if (position <= 3) eventImpact = 1.2;   // Top 3 gets enhanced impact
      else if (position <= 5) eventImpact = 0.9;   // Top 5 gets strong impact
      else if (position <= 10) eventImpact = 0.7;  // Top 10 gets good impact
      else if (position <= 25) eventImpact = 0.4;  // Top 25 gets moderate impact
      else if (position <= 50) eventImpact = 0.2;  // Made cut gets minor impact
      else if (position <= 65) eventImpact = 0.0;  // Poor finish, neutral impact
      else eventImpact = -0.3;                     // Very poor finish, minor negative

      console.log(`Event year ${event.year}, result: ${event.finText || position}, position: ${position}, impact: ${eventImpact} (normal finish)`);
    }

    // Recency weighting - more recent performances matter more
    const recencyWeight = Math.pow(0.8, i);
    totalWeightedImpact += eventImpact * recencyWeight;
    totalWeight += recencyWeight;

    console.log(`Event year ${event.year}, impact: ${eventImpact}, weight: ${recencyWeight.toFixed(2)}`);
  }

  // Calculate weighted average impact
  const weightedAvgImpact = totalWeightedImpact / totalWeight;

  // Enhanced appearance bonus - adjusted based on finish types
  const specialFinishCount = pastEvents.filter(e => e.specialFinish === true).length;
  const estimatedCount = pastEvents.filter(e => e.estimated === true).length;
  const standardFinishCount = pastEvents.length - specialFinishCount - estimatedCount;

  // Full bonus for normal finishes, reduced for WD/CUT
  const appearanceBonus = (standardFinishCount * 0.02) + (estimatedCount * 0.01) - (specialFinishCount * 0.01);

  const finalImpact = weightedAvgImpact + appearanceBonus;

  console.log(`Weighted avg impact: ${weightedAvgImpact.toFixed(2)}, Appearance bonus: ${appearanceBonus.toFixed(2)}, Final impact: ${finalImpact.toFixed(2)}`);

  return finalImpact;
}
 
function calculatePlayerMetrics(players, { groups, pastPerformance }, similarCoursesWeight, puttingCoursesWeight, courseSetupWeights) {
    // ...existing code...
  // Define constants
  const TREND_THRESHOLD = 0.005; // Minimum trend value to consider significant
  const PAST_PERF_ENABLED = pastPerformance?.enabled || false;
  const PAST_PERF_WEIGHT = Math.min(Math.max(pastPerformance?.weight || 0, 0), 1);
  const CURRENT_EVENT_ID = pastPerformance?.currentEventId ? String(pastPerformance.currentEventId) : null;
 
  console.log(`** CURRENT_EVENT_ID = "${CURRENT_EVENT_ID}" **`);

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
  const totalGroupWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  groups = groups.map(group => ({
    ...group,
    weight: group.weight / totalGroupWeight
  }));
  
  console.log("Normalized group weights:");
  groups.forEach(group => console.log(`  ${group.name}: ${group.weight.toFixed(3)}`));

 
  // 1. Extract Metric Values
  const allMetricValues = Object.entries(players).reduce((acc, [dgId, data]) => {
    // ...existing code...

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

    // === NEW DIAGNOSTIC LOGGING ===
    console.log(`METRIC DIAGNOSTICS: Player ${data.name} (${dgId})`);
    console.log('  Raw historicalAvgs:', historicalAvgs);
    console.log('  Raw approachMetrics:', approachMetrics);
    console.log('  Combined metrics array:', combinedMetrics);

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
  
  console.log("Course setup weights:", courseSetupWeights);
  
  // Ensure weights sum to 1.0
  const totalWeight = Object.values(courseSetupWeights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
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
        const value = metricsWithBCC[dgId]?.[metric.index];
        
        if (isProblematicMetric) {
          console.log(`  ${player.name}: value=${value}, type=${typeof value}, isNaN=${isNaN(value)}`);
        }
        
        // Exclude zero values for clean statistics - they're missing data not actual performance
        if (typeof value === 'number' && !isNaN(value) && value !== 0) {
          metricValues.push(value);
        }
      });
 
      // Initialize metric in groupStats
      groupStats[group.name][metric.name] = { 
        mean: 0, 
        stdDev: 0.001 // Minimum stdDev to avoid division by zero
      };
 
      console.log(`Found ${metricValues.length} valid values for ${metric.name}`);
      
      if (metricValues.length === 0) {
        console.error(`No valid values for ${metric.name} in ${group.name}`);
        
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
        
        if (baselineStdDevs[metric.name]) {
          groupStats[group.name][metric.name].stdDev = baselineStdDevs[metric.name];
          
          // Use more appropriate default means for different metric types
          if (metric.name.includes('Prox')) {
            groupStats[group.name][metric.name].mean = 30; // Proximity in feet
          } else if (metric.name === 'Birdie Chances Created') {
            groupStats[group.name][metric.name].mean = 4.0; // Typical value
          } else if (metric.name.includes('SG')) {
            groupStats[group.name][metric.name].mean = 0.0; // Strokes Gained baseline
          } else {
            groupStats[group.name][metric.name].mean = 0.5; // Generic default
          }
          
          console.log(`Using baseline values for ${metric.name}: mean=${groupStats[group.name][metric.name].mean}, stdDev=${baselineStdDevs[metric.name]}`);
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
        stdDev: metricStdDev || 0.001 // Ensure non-zero stdDev
      };
 
      console.log(`Group: ${group.name}, Metric: ${metric.name}`, {
        mean: metricMean,
        stdDev: metricStdDev,
        sampleValues: metricValues.slice(0, 5) // Show first 5 values
      });
    }
  }
 
  const processedPlayers = Object.entries(players).map(([dgId, data]) => {
  // Get similar course event IDs from configuration
  
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
      data.approachMetrics
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
 
    // Calculate Group Scores
    let totalMetricsCount = 0;
    let nonZeroMetricsCount = 0;
    const groupScores = {};
    
    for (const group of groups) {
      let groupScore = 0;
      let totalWeight = 0;
 
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
          // Get the appropriate max value for this proximity type
          const maxProxValue = METRIC_MAX_VALUES[metric.name] ||
                               (metric.name === 'Fairway Proximity' ? 60 :
                               metric.name === 'Rough Proximity' ? 80 : 60);
 
          // Transform to "approach quality" where higher is better
          value = maxProxValue - value;
 
          // Ensure non-negative values
          value = Math.max(0, value);
        }
        // NOTE: Scoring Average NOT transformed - using raw values
        // Lower score is better, so negative z-score means better than average

        const metricStats = groupStats[group.name]?.[metric.name];
        if (!metricStats) {
          console.error(`Metric stats missing for ${group.name} -> ${metric.name}`);
          console.error("Available groups:", Object.keys(groupStats));
          continue; // Skip this metric
        }
        
        const stdDev = metricStats.stdDev || 0.001; // Ensure non-zero
        let zScore = (value - metricStats.mean) / stdDev;
        
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
          groupScore += zScore * metric.weight;
          totalWeight += metric.weight;
        }
      }
      
      // Normalize by total weight if available
      if (totalWeight > 0) {
        groupScore = groupScore / totalWeight;
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
    
    // APPLY Z-SCORE DAMPENING FOR SPARSE DATA PLAYERS
    // Now that we have dataCoverage, recalculate group scores with dampening
    // This prevents their few good metrics from being inflated by zero-filtering
    // Players with <70% data coverage get z-scores reduced exponentially
    // At 63% coverage: dampening = 0.63^0.35 = 0.78 (22% reduction)
    // At 50% coverage: dampening = 0.50^0.35 = 0.60 (40% reduction)
    // At 37% coverage: dampening = 0.37^0.35 = 0.51 (49% reduction)
    if (dataCoverage < 0.70) {
      const dampingFactor = Math.pow(dataCoverage, 0.35);
      console.log(`${data.name}: Applying z-score dampening factor of ${dampingFactor.toFixed(3)} (coverage: ${dataCoverage.toFixed(3)})`);
      
      // Recalculate all group scores with dampened z-scores
      for (const group of groups) {
        let groupScore = 0;
        let totalWeight = 0;
        
        for (const metric of group.metrics) {
          let value = adjustedMetrics[metric.index];
          
          // Apply same transformations as before
          if (metric.name === 'Poor Shots') {
            const maxPoorShots = METRIC_MAX_VALUES['Poor Shots'] || 12;
            value = maxPoorShots - value;
          } else if (metric.name.includes('Prox') ||
                    metric.name === 'Fairway Proximity' ||
                    metric.name === 'Rough Proximity') {
            const maxProxValue = METRIC_MAX_VALUES[metric.name] ||
                                 (metric.name === 'Fairway Proximity' ? 60 :
                                 metric.name === 'Rough Proximity' ? 80 : 60);
            value = maxProxValue - value;
            value = Math.max(0, value);
          } else if (metric.name === 'Scoring Average') {
            const maxScore = METRIC_MAX_VALUES['Scoring Average'] || 74;
            value = maxScore - value;
          }
          
          const metricStats = groupStats[group.name]?.[metric.name];
          if (!metricStats) continue;
          
          let zScore = (value - metricStats.mean) / (metricStats.stdDev || 0.001);
          
          // Apply dampening
          zScore *= dampingFactor;
          
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
            totalWeight += metric.weight;
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
    
    // Calculate refined score with validation
    // Apply a STRICT coverage threshold: only players with 70%+ data get meaningful scores
    // EXCEPTION: sparse-data players with recent wins/top-10s get a pass
    let dataCoverageMultiplier = 1.0;
    let hasRecentWinOrTop10 = false;
    let isLowConfidencePlayer = false;
    let baselineScore = null;
    
    // Pre-sort events to check for recent win/top 10 (will reuse in past perf section)
    const pastPerformances = data.events || {};
    const sortedEvents = Object.entries(pastPerformances)
      .sort((a, b) => {
        const yearA = a[0].split('-').pop();
        const yearB = b[0].split('-').pop();
        return parseInt(yearB) - parseInt(yearA);
      });
    
    // Check if sparse-data player has a recent win or top 10 finish
    if (dataCoverage < 0.70 && sortedEvents.length > 0) {
      const [mostRecentKey, mostRecentEvent] = sortedEvents[0];
      if (CURRENT_EVENT_ID && mostRecentEvent.eventId?.toString() === CURRENT_EVENT_ID) {
        // If most recent is current event, check the second-most recent
        if (sortedEvents.length > 1) {
          const [secondKey, secondEvent] = sortedEvents[1];
          const position = secondEvent.position;
          hasRecentWinOrTop10 = position === 1 || (position && position <= 10);
        }
      } else {
        // Most recent is a past event
        const position = mostRecentEvent.position;
        hasRecentWinOrTop10 = position === 1 || (position && position <= 10);
      }
    }
    
    // FOR VERY SPARSE PLAYERS (<50% coverage): Assign baseline score based on recent form (REPLACEMENT, not floor)
    if (dataCoverage < 0.50) {
      isLowConfidencePlayer = true;
      
      // Check recent finishes and assign baseline score
      let recentTop20Count = 0;
      let recentTop10Count = 0;
      let totalRecentEvents = 0;
      
      for (const [eventKey, event] of sortedEvents) {
        // Skip current event
        if (CURRENT_EVENT_ID && event.eventId?.toString() === CURRENT_EVENT_ID) {
          continue;
        }
        // Look at last 10 events or until we've gone back 2 years
        if (totalRecentEvents >= 10) break;
        
        if (event.position && typeof event.position === 'number' && event.position < 100) {
          totalRecentEvents++;
          if (event.position <= 20) recentTop20Count++;
          if (event.position <= 10) recentTop10Count++;
        }
      }
      
      // Assign baseline score based on recent form - this REPLACES the calculated score for <50% coverage
      if (recentTop20Count === 0 && totalRecentEvents > 0) {
        // No recent top 20s → very low baseline (similar to missing cuts)
        baselineScore = 0.30;
        console.log(`${data.name}: Very sparse (${dataCoverage.toFixed(2)}), no recent top 20s → baseline score: ${baselineScore} (REPLACES calculated)`);
      } else if (recentTop20Count > 0 && recentTop10Count === 0) {
        // Recent top 20s but no top 10s → moderate baseline
        baselineScore = 0.75;
        console.log(`${data.name}: Very sparse (${dataCoverage.toFixed(2)}), recent top 20s → baseline score: ${baselineScore} (REPLACES calculated)`);
      } else if (recentTop10Count > 0) {
        // Recent top 10s → good baseline
        baselineScore = 1.20;
        console.log(`${data.name}: Very sparse (${dataCoverage.toFixed(2)}), recent top 10s → baseline score: ${baselineScore} (REPLACES calculated)`);
      } else if (totalRecentEvents === 0) {
        // No recent events at all → very low
        baselineScore = 0.20;
        console.log(`${data.name}: Very sparse (${dataCoverage.toFixed(2)}), no recent events → baseline score: ${baselineScore} (REPLACES calculated)`);
      }
    }
    
    // FOR MODERATELY SPARSE PLAYERS (50-70% coverage) WITHOUT RECENT SUCCESS: Assign baseline score based on recent form
    if (dataCoverage >= 0.50 && dataCoverage < 0.70 && !hasRecentWinOrTop10) {
      isLowConfidencePlayer = true;
      
      // Check recent finishes and assign baseline score
      let recentTop20Count = 0;
      let recentTop10Count = 0;
      let totalRecentEvents = 0;
      
      for (const [eventKey, event] of sortedEvents) {
        // Skip current event
        if (CURRENT_EVENT_ID && event.eventId?.toString() === CURRENT_EVENT_ID) {
          continue;
        }
        // Look at last 10 events or until we've gone back 2 years
        if (totalRecentEvents >= 10) break;
        
        if (event.position && typeof event.position === 'number' && event.position < 100) {
          totalRecentEvents++;
          if (event.position <= 20) recentTop20Count++;
          if (event.position <= 10) recentTop10Count++;
        }
      }
      
      // Assign baseline score based on recent form
      if (recentTop20Count === 0 && totalRecentEvents > 0) {
        // No recent top 20s → very low baseline (similar to missing cuts)
        baselineScore = 0.30;
        console.log(`${data.name}: Sparse (${dataCoverage.toFixed(2)}), no recent top 20s → baseline score: ${baselineScore}`);
      } else if (recentTop20Count > 0 && recentTop10Count === 0) {
        // Recent top 20s but no top 10s → moderate baseline
        baselineScore = 0.75;
        console.log(`${data.name}: Sparse (${dataCoverage.toFixed(2)}), recent top 20s → baseline score: ${baselineScore}`);
      } else if (recentTop10Count > 0) {
        // Recent top 10s → good baseline
        baselineScore = 1.20;
        console.log(`${data.name}: Sparse (${dataCoverage.toFixed(2)}), recent top 10s → baseline score: ${baselineScore}`);
      } else if (totalRecentEvents === 0) {
        // No recent events at all → very low
        baselineScore = 0.20;
        console.log(`${data.name}: Sparse (${dataCoverage.toFixed(2)}), no recent events → baseline score: ${baselineScore}`);
      }
    }
    
    // Use baseline score for low-confidence players, otherwise calculate normally
    let refinedWeightedScore;
    
    // TIER 1: Very sparse players (<50% coverage) - USE BASELINE REPLACEMENT
    if (dataCoverage < 0.50 && isLowConfidencePlayer && baselineScore !== null) {
      refinedWeightedScore = baselineScore;
      console.log(`${data.name}: Very sparse (<50%) - Using baseline score (${baselineScore}) to REPLACE calculated score (${(weightedScore * confidenceFactor * dataCoverageMultiplier).toFixed(3)})`);
    }
    // TIER 2: Moderately sparse players (50-70% coverage) without recent success - APPLY HARD FLOOR & CEILING
    else if (dataCoverage >= 0.50 && dataCoverage < 0.70 && isLowConfidencePlayer && baselineScore !== null) {
      // Strong floor prevents ranking too low, but also cap at reasonable ceiling
      const calculatedScore = weightedScore * confidenceFactor * dataCoverage;
      
      // Hard ceiling to prevent even dampened scores from being too high
      let hardCeiling = 1.15;
      if (dataCoverage < 0.60) {
        hardCeiling = 1.05;
      }
      if (dataCoverage < 0.55) {
        hardCeiling = 0.95;
      }
      
      refinedWeightedScore = Math.max(Math.min(calculatedScore, hardCeiling), baselineScore);
      
      console.log(`${data.name}: Sparse (50-70%) - calculated: ${calculatedScore.toFixed(3)}, baseline floor: ${baselineScore}, ceiling: ${hardCeiling}, result: ${refinedWeightedScore.toFixed(3)}`);
    }
    // TIER 3: Moderately sparse with recent success (50-70% coverage + recent win/top 10) - APPLY HARD CEILING
    else if (dataCoverage >= 0.50 && dataCoverage < 0.70 && hasRecentWinOrTop10) {
      // For players with <70% coverage, cap score even with recent success
      // This prevents them from dominating the rankings
      
      let recentTop20Count = 0;
      let recentTop10Count = 0;
      let totalRecentEvents = 0;
      
      for (const [eventKey, event] of sortedEvents) {
        if (CURRENT_EVENT_ID && event.eventId?.toString() === CURRENT_EVENT_ID) {
          continue;
        }
        if (totalRecentEvents >= 10) break;
        
        if (event.position && typeof event.position === 'number' && event.position < 100) {
          totalRecentEvents++;
          if (event.position <= 20) recentTop20Count++;
          if (event.position <= 10) recentTop10Count++;
        }
      }
      
      // Apply hard ceiling based on coverage and recent form
      // This ensures sparse-data players never rank above 70%+ coverage players
      let hardCeiling = 1.20; // Default ceiling for 50-70% players
      
      if (dataCoverage < 0.60) {
        hardCeiling = 1.10; // Very strict for <60% coverage
      }
      if (dataCoverage < 0.55) {
        hardCeiling = 1.00; // Even stricter for <55% coverage
      }
      
      const calculatedScore = weightedScore * confidenceFactor * dataCoverage;
      refinedWeightedScore = Math.min(calculatedScore, hardCeiling); // Use CEILING, not floor
      
      console.log(`${data.name}: Sparse (50-70%) with recent success - capping at ceiling ${hardCeiling} (calculated: ${calculatedScore.toFixed(3)}, coverage: ${dataCoverage.toFixed(2)})`);
    }
    // TIER 4: Adequate coverage (70%+) - NORMAL CALCULATION
    else if (dataCoverage >= 0.70) {
      if (dataCoverage < 0.85) {
        // 70-85% coverage: scale from 0.49 to 0.95
        dataCoverageMultiplier = 0.49 + ((dataCoverage - 0.70) / 0.15) * 0.46;
        refinedWeightedScore = weightedScore * confidenceFactor * dataCoverageMultiplier;
      } else {
        // 85%+ coverage: scale from 0.95 to 1.0
        dataCoverageMultiplier = 0.95 + ((dataCoverage - 0.85) / 0.15) * 0.05;
        refinedWeightedScore = weightedScore * confidenceFactor * dataCoverageMultiplier;
      }
    }
    // Fallback (shouldn't reach here)
    else {
      refinedWeightedScore = weightedScore * confidenceFactor * dataCoverageMultiplier;
    }
    
    // Check for recent top 10 to determine if low confidence caps should apply
    let hasRecentTop10 = false;
    if (sortedEvents.length > 0) {
      // Check first non-current event in sortedEvents
      for (const [eventKey, event] of sortedEvents) {
        if (CURRENT_EVENT_ID && event.eventId?.toString() === CURRENT_EVENT_ID) {
          continue; // Skip current event
        }
        if (event.position && event.position <= 10) {
          hasRecentTop10 = true;
          break;
        }
      }
    }
    
    // Determine if we should apply strict capping based on confidence
    // If confidence is below 0.85 AND player has no recent top 10, apply caps
    // Exception: Players with recent top 10 (even from other tours) don't get capped for low confidence
    // Also exception: Low-confidence players already got baseline scores
    const shouldCapForLowConfidence = confidenceFactor < 0.85 && !hasRecentTop10 && !isLowConfidencePlayer;
    
    if (shouldCapForLowConfidence) {
      refinedWeightedScore = Math.min(refinedWeightedScore, 0.15);
      console.log(`${data.name}: Low confidence (${confidenceFactor.toFixed(3)}) and no recent top 10 - capping weighted score at 0.15`);
    }
    
    if (isNaN(refinedWeightedScore)) {
      console.error(`Got NaN for refinedWeightedScore for ${data.name}, setting to 0`);
      refinedWeightedScore = 0;
    }
    
    let pastPerformanceMultiplier = 1.0;
    if (PAST_PERF_ENABLED && PAST_PERF_WEIGHT > 0) {
      // If confidence is low AND no recent top 10, cap the past performance multiplier
      if (shouldCapForLowConfidence) {
        pastPerformanceMultiplier = 0.3;
        console.log(`${data.name}: Low confidence and no recent top 10 - capping past perf multiplier at 0.3x`);
      } else if (sortedEvents.length > 0) {
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
          
          // Non-linear scale: better recent play gets exponential boost
          // avgPerformanceScore of:
          // -0.2 (bad finishes) → 0.6x multiplier
          // 0.0 (mediocre) → 0.85x multiplier
          // 0.5 (solid form) → 1.1x multiplier
          // 1.0 (strong form) → 1.7x multiplier
          // 1.5 (excellent/winning form) → 2.8x multiplier
          if (avgPerformanceScore <= 0) {
            // Below average play gets penalty
            pastPerformanceMultiplier = 0.85 + (avgPerformanceScore * 1.25);
          } else {
            // Above average play gets exponential boost
            pastPerformanceMultiplier = 1.0 + (Math.pow(avgPerformanceScore, 1.2) * 1.8);
          }
          
          const rawMultiplier = pastPerformanceMultiplier;
          
          // Cap the raw multiplier before applying weight to prevent exceeding bounds
          // Ensure multiplier is between 0.3 and 3.0 (wider range for greater impact)
          pastPerformanceMultiplier = Math.max(0.3, Math.min(3.0, pastPerformanceMultiplier));
          
          const cappedMultiplier = pastPerformanceMultiplier;
          const capApplied = (rawMultiplier !== cappedMultiplier);
          
          // Apply weight to scale the boost/penalty magnitude
          pastPerformanceMultiplier = 1.0 + ((pastPerformanceMultiplier - 1.0) * PAST_PERF_WEIGHT);
          
          const capIndicator = capApplied ? " [CAP APPLIED]" : "";
          console.log(`${data.name}: Avg perf score=${avgPerformanceScore.toFixed(2)}, raw=${rawMultiplier.toFixed(3)}, final=${pastPerformanceMultiplier.toFixed(3)}${capIndicator}`);
        } else {
          console.log(`${data.name}: No usable performance data (staying at 1.0x)`);
        }
      } else {
        console.log(`${data.name}: No sortedEvents (staying at 1.0x)`);
      }
    }

    // Extract KPI names and weights from metric groups
    const kpis = groups.flatMap(group =>
        group.metrics.map(metric => ({
            name: metric.name,
            index: metric.index,
            weight: group.weight * metric.weight
        }))
    );

    // Normalize KPI weights
    const totalKpiWeight = kpis.reduce((sum, kpi) => sum + kpi.weight, 0);
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

  return {
    players: processedPlayers,
    groupStats: groupStats
  };
}

function calculateDynamicWeight(baseWeight, dataPoints, minPoints, maxPoints = 20) {
  // Scale weight based on amount of data available
  if (dataPoints <= minPoints) return baseWeight * 0.8; // Reduce weight if minimum data
  if (dataPoints >= maxPoints) return baseWeight; // Full weight if plenty of data
    
  // Linear scaling between min and max points
  const scaleFactor = 0.8 + (0.2 * (dataPoints - minPoints) / (maxPoints - minPoints));
  return baseWeight * scaleFactor;
}

/**
 * Calculates which metrics have actual tournament/approach data (vs. defaults)
 * Returns a Set of metric indices that have real data
 * If a player has any tournament rounds, they have data for all metrics
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
    
    // Check if ANY round has a non-zero value for this metric
    const hasData = allHistoricalRounds.some(round => {
      const value = round?.metrics?.[metricKey];
      return typeof value === 'number' && value !== 0;
    });
    
    if (hasData) {
      metricsWithData.add(i);
    }
  }
  
  // Check approach metrics (16-33)
  // Approach metrics are stored as an array index in the order defined by getApproachMetrics
  if (approachMetrics && typeof approachMetrics === 'object') {
    const approachMetricMapping = {
      16: '<100.fwGIR',
      17: '<100.strokesGained',
      18: '<100.shotProx',
      19: '<150.fwGIR',
      20: '<150.fwStrokesGained',
      21: '<150.fwShotProx',
      22: '<150.roughGIR',
      23: '<150.roughStrokesGained',
      24: '<150.roughShotProx',
      25: '>150 - Rough.roughGIR',
      26: '>150 - Rough.roughStrokesGained',
      27: '>150 - Rough.roughShotProx',
      28: '<200.fwGIR',
      29: '<200.fwStrokesGained',
      30: '<200.fwShotProx',
      31: '>200.fwGIR',
      32: '>200.fwStrokesGained',
      33: '>200.fwShotProx'
    };
    
    for (let i = 16; i <= 33; i++) {
      const keyPath = approachMetricMapping[i];
      if (!keyPath) continue;
      
      const [category, metric] = keyPath.split('.');
      const value = approachMetrics[category]?.[metric];
      
      // If approach metric has non-zero value, mark as having data
      if (typeof value === 'number' && value !== 0) {
        metricsWithData.add(i);
      }
    }
  }
  
  return metricsWithData;
}

function calculateHistoricalAverages(historicalRounds, similarRounds = [], puttingRounds = [], options = {}) {
  // Default options
  const {
    lambda = 0.2, // Exponential decay factor for recency
    minHistoricalPoints = 2, // Min points needed for historical data (lowered from 10)
    minSimilarPoints = 2, // Min points needed for similar course data (lowered from 5)
    minPuttingPoints = 2, // Min points needed for putting-specific data (lowered from 5)
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
  return (rounds || [])
    .filter(r => r && r.date && !isNaN(new Date(r.date))) // Only keep rounds with valid dates
    .map(r => ({
      ...r,
      date: new Date(r.date)
    }))
    .sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
  };
 
  // Calculate weighted average for a set of values
  const calculateWeightedAverage = (values, decayFactor = lambda) => {
    if (!values || values.length === 0) return null;
    
    let sumWeighted = 0;
    let sumWeights = 0;
    
    values.forEach((value, i) => {
      const weight = Math.exp(-decayFactor * i); // Newest first
      sumWeighted += weight * value;
      sumWeights += weight;
    });
    
    return sumWeights > 0 ? sumWeighted / sumWeights : null;
  };
 
    // Helper function to calculate average for a specific metric
  const calculateMetricAverage = (rounds, metricKey, isVirtualMetric = false, minPoints = 0) => {
    if (!rounds || rounds.length < minPoints) return null;
    
    // Extract values based on metric type
    let values = [];
    
    if (isVirtualMetric) {
      // Special case for birdies or better
      values = rounds
        .map(round => (round.metrics.eagles || 0) + (round.metrics.birdies || 0))
        .filter(v => typeof v === 'number' && !isNaN(v));
    } else {
      // Normal metrics
      values = rounds
        .map(round => round.metrics?.[metricKey])
        .filter(v => typeof v === 'number' && !isNaN(v));
    }
    
    if (values.length < minPoints) return null;
    
    // Convert percentages if needed
    const isPercentage = ['drivingAccuracy', 'greensInReg', 'scrambling'].includes(metricKey);
    const adjustedValues = values.map(v => {
      if (!isPercentage) return v;
      return v > 1 ? v/100 : v; // Convert 0-100% to 0-1 decimal
    });
    
    return calculateWeightedAverage(adjustedValues);
  };
 
  // Prepare all rounds datasets
  const sortedHistorical = prepareRounds(historicalRounds);
  const sortedSimilar = prepareRounds(similarRounds);
  const sortedPutting = prepareRounds(puttingRounds);
  
  // Log the number of rounds for each category
  const playerName = sortedHistorical.length > 0 ? sortedHistorical[0].playerName : 'Unknown';
  console.log(`${playerName}: Prepared ${sortedHistorical.length} historical, ${sortedSimilar.length} similar, and ${sortedPutting.length} putting rounds`);
 
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
      minSimilarPoints
    );
    
    const puttingAvg = isPuttingMetric ? calculateMetricAverage(
      sortedPutting, 
      metricKey, 
      isVirtualMetric, 
      minPuttingPoints
    ) : null;
    
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
        
        // Blend similar with historical data
        finalValue = (similarAvg * dynamicSimilarWeight) + (historicalAvg * (1 - dynamicSimilarWeight));
        
        console.log(`${playerName} - ${metricKey}: BLENDED: ${similarAvg.toFixed(3)} × weight ${dynamicSimilarWeight.toFixed(2)} = ${(similarAvg * dynamicSimilarWeight).toFixed(3)}
          Historical: ${historicalAvg.toFixed(3)} × weight ${(1-dynamicSimilarWeight).toFixed(2)} = ${(historicalAvg * (1-dynamicSimilarWeight)).toFixed(3)}
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

function prepareRankingOutput(processedData, metricLabels) {
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

function validateKpiWeights(normalizedKpis) {
  const totalWeight = normalizedKpis.reduce((sum, kpi) => sum + kpi.weight, 0);
  
  // Check if weights sum to approximately 1.0 (allowing for small floating point errors)
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    console.warn(`KPI weights sum to ${totalWeight.toFixed(3)}, not 1.0. Normalizing weights.`);
    
    // Normalize the weights to ensure they sum to 1.0
    return normalizedKpis.map(kpi => ({
      ...kpi,
      weight: kpi.weight / totalWeight
    }));
  }
  
  return normalizedKpis;
}

// Helper function to get coverage confidence level
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

function calculateMetricTrends(finishes) {
  const TOTAL_ROUNDS = 24;
  const LAMBDA = 0.2 // Exponential decay factor
  const TREND_THRESHOLD = 0.005;
  const SMOOTHING_WINDOW = 3; // Size of smoothing window

  // Sort rounds by date descending
  const sortedRounds = (finishes || []).sort((a, b) => 
    new Date(b.date) - new Date(a.date) || b.roundNum - a.roundNum
  );

  // Get most recent valid rounds
  const recentRounds = sortedRounds.slice(0, TOTAL_ROUNDS).filter(round => {
    const isValid = round.metrics?.scoringAverage !== undefined;
    if (!isValid) console.log('Filtering invalid round:', round.date);
    return isValid;
  });

  // Return zeros if insufficient data
  if (recentRounds.length < 15) return Array(16).fill(0);

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

    // Skip if not enough data points
    if (values.length < 10) return 0;

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
    
    // Apply significance threshold
    const finalTrend = Math.abs(slope) > TREND_THRESHOLD 
      ? Number(slope.toFixed(3))
      : 0;

    return finalTrend;
  });
}

// Function to apply moving average smoothing
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

/**
 * Aggregates approach metrics for a player from approach data object.
 * Returns a flat array of metrics for direct comparison.
 * @param {Object} approachData - Player's approach metrics object
 * @returns {Array<number>} - Array of approach metrics in fixed order
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
          const rawValue = approachData[key]?.[subKey] || 0;
          
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
  
  // Log sample values after normalization
  if (approachData) {
    console.log('Approach metrics conversion example:');
    for (const [key, category] of Object.entries(safeData)) {
      for (const [metric, value] of Object.entries(category)) {
        if (metric.includes('SG') || metric.includes('strokesGained') || 
            metric.includes('StrokesGained')) {
          const originalValue = approachData[key]?.[metric] || 0;
          console.log(`  ${key}.${metric}: ${originalValue.toFixed(3)} → ${value.toFixed(3)}`);
        }
      }
    }
  }

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

/**
 * Aggregates all player data into a single object keyed by dgId, including classified rounds and approach metrics.
 * @param {Array} rounds - All round objects (with dgId, eventId, etc.)
 * @param {Object} approachDataMap - Map of dgId to approach metrics object
 * @param {Object} eventMetadata - Map of eventId to { isSimilar, isPuttingSpecific, ... }
 * @returns {Object} players - { dgId: { name, dgId, events, historicalRounds, similarRounds, puttingRounds, approachMetrics } }
 */
function aggregatePlayerData(fieldDataParam, historicalData, approachData, metricGroups, similarCourseIds, puttingCourseIds) {
  // Build players object from tournament field
  const players = {};
  for (const row of fieldDataParam) {
    const dgId = row.dg_id;
    if (!dgId) continue;
    players[dgId] = {
      name: row.player_name,
      dgId,
      events: {},
      historicalRounds: [],
      similarRounds: [],
      puttingRounds: [],
      approachMetrics: {}
    };
  }


    // Extract metrics from metricGroups
    const metrics = metricGroups.flatMap(group => group.metrics);

  
    // Build eventMetadata map using similar/putting course IDs
    const eventMetadata = {};
    for (const row of historicalData) {
        const eventId = row.event_id;
        if (!eventId) continue;
        if (!eventMetadata[eventId]) {
            const isSimilar = similarCourseIds.includes(eventId);
            const isPutting = puttingCourseIds.includes(eventId);
            eventMetadata[eventId] = {
                eventId,
                isPuttingSpecific: isPutting,
                isSimilar: isSimilar,
                categoryText: (isPutting && isSimilar) ? "Both" : (isPutting ? "Putting" : (isSimilar ? "Similar" : "Regular"))
            };
        }
    }
    
    // Process historical rounds and classify
    for (const row of historicalData) {
        const dgId = row.dg_id;
        if (!dgId || !players[dgId]) continue;

        // Use direct property access from row object instead of array indexing
        const eventId = Number(row.event_id);
        const roundDate = new Date(row.event_completed);
        const roundYear = roundDate.getFullYear();
        
        // Create year-specific event key
        const eventKey = `${dgId}-${eventId}-${roundYear}`;

        // Check if this is from a putting-specific or regular similar course
        const eventType = eventMetadata[eventId] || { 
            isPuttingSpecific: false, 
            isSimilar: false,
            categoryText: "Regular" 
        };
            
        // Initialize event if not exists
        if (!players[dgId].events[eventKey]) {
            players[dgId].events[eventKey] = {
                eventId: eventId, // Store eventId directly in the event object
                year: roundYear,  // Store the year explicitly
                position: row.fin_text, // fin_text from CSV
                isPuttingSpecific: eventType.isPuttingSpecific,
                isSimilar: eventType.isSimilar,
                categoryText: eventType.categoryText,
                rounds: []
            };
        }

        // Store round-level metrics in event
        const roundData = {
            playerName: players[dgId].name,
            date: roundDate,
            eventId: eventId,
            isPuttingSpecific: eventType.isPuttingSpecific,
            isSimilar: eventType.isSimilar,
            categoryText: eventType.categoryText,
            roundNum: Number(row.round_num),
            metrics: {
                scoringAverage: cleanMetricValue(row.score),
                eagles: cleanMetricValue(row.eagles_or_better),
                birdies: cleanMetricValue(row.birdies),
                birdiesOrBetter: cleanMetricValue(row.eagles_or_better),
                strokesGainedTotal: cleanMetricValue(row.sg_total),
                drivingDistance: cleanMetricValue(row.driving_dist),
                drivingAccuracy: cleanMetricValue(row.driving_acc, true),
                strokesGainedT2G: cleanMetricValue(row.sg_t2g),
                strokesGainedApp: cleanMetricValue(row.sg_app),
                strokesGainedArg: cleanMetricValue(row.sg_arg),
                strokesGainedOTT: cleanMetricValue(row.sg_ott),
                strokesGainedPutt: cleanMetricValue(row.sg_putt),
                greensInReg: cleanMetricValue(row.gir, true),
                scrambling: cleanMetricValue(row.scrambling, true),
                greatShots: cleanMetricValue(row.great_shots),
                poorShots: cleanMetricValue(row.poor_shots),
                fairwayProx: cleanMetricValue(row.prox_fw),
                roughProx: cleanMetricValue(row.prox_rgh)
            }
        };

        // Add round to the event
        players[dgId].events[eventKey].rounds.push(roundData);

        // Add round to appropriate collection (mutually exclusive categorization)
        if (eventType.isPuttingSpecific) {
            players[dgId].puttingRounds.push(roundData);
            console.log(`Added putting-specific round for ${players[dgId].name}, event ${eventId}`);
        } 
        else if (eventType.isSimilar) {
            players[dgId].similarRounds.push(roundData);
            console.log(`Added similar course round for ${players[dgId].name}, event ${eventId}`);
        }
        else {
            // Only add to historicalRounds if NOT similar or putting-specific
            players[dgId].historicalRounds.push(roundData);
        }
    };

    // Post-processing for historical averages
    Object.values(players).forEach(player => {
        // Sort all rounds by date (most recent first)
        player.historicalRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
        player.similarRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
        player.puttingRounds.sort((a, b) => b.date - a.date || b.roundNum - a.roundNum);
    });

    // Process approach metrics
    for (const row of approachData) {
        
        const dgId = row[0];
        if (players[dgId]) {
            players[dgId].approachMetrics = {
            '<100': {
                fwGIR: cleanMetricValue(row[16], true),  // Percentage
                strokesGained: cleanMetricValue(row[21]),
                shotProx: cleanMetricValue(row[20])
            },
            '<150': {
                fwGIR: cleanMetricValue(row[2], true),   // Percentage
                fwStrokesGained: cleanMetricValue(row[7]),
                fwShotProx: cleanMetricValue(row[6]),
                roughGIR: cleanMetricValue(row[37], true), // Percentage
                roughStrokesGained: cleanMetricValue(row[42]),
                roughShotProx: cleanMetricValue(row[41])
            },
            '>150 - Rough': {
                roughGIR: cleanMetricValue(row[23], true), // Percentage
                roughStrokesGained: cleanMetricValue(row[28]),
                roughShotProx: cleanMetricValue(row[27])
            },
            '<200': {
                fwGIR: cleanMetricValue(row[9], true),   // Percentage
                fwStrokesGained: cleanMetricValue(row[7]),
                fwShotProx: cleanMetricValue(row[6])
            },
            '>200': {
                fwGIR: cleanMetricValue(row[30], true),  // Percentage
                fwStrokesGained: cleanMetricValue(row[35]),
                fwShotProx: cleanMetricValue(row[34])
            }
            };
        }
    };
  
    return players;
}

    

function cleanMetricValue(value, isPercentage = false) {
  let numericValue = typeof value === 'string' 
    ? parseFloat(value.replace(/[^0-9.]/g, '')) 
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

// Helper function to normalize metric names for comparison
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

/**
 * Returns an array of debug info for each player, including group scores and all key columns.
 * @param {Array} processedPlayers - Array of player objects after scoring and ranking.
 * @returns {Array<Object>} Array of debug info objects for each player.
 */
function debugGroupScores(processedPlayers) {
  return processedPlayers.map((player, idx) => {
    // Compose group scores string
    const groupScores = player.groupScoresBeforeDampening
      ? Object.entries(player.groupScoresBeforeDampening)
          .map(([group, val]) => `${group}: ${val.toFixed(3)}`)
          .join('; ')
      : '';

    const groupScoresAfter = player.groupScoresAfterDampening
      ? Object.entries(player.groupScoresAfterDampening)
          .map(([group, val]) => `${group}: ${val.toFixed(3)}`)
          .join('; ')
      : '';

    return {
      Rank: player.rank || idx + 1,
      'Player Name': player.name,
      'DG ID': player.dgId,
      'Data Coverage %': player.dataCoverage ? (player.dataCoverage * 100).toFixed(1) : '',
      'Dampening Applied?': player.dampeningApplied ? 'YES' : 'NO',
      'Group Scores (Before Dampening)': groupScores,
      'Group Scores (After Dampening if applicable)': groupScoresAfter,
      'Weighted Score': player.weightedScore?.toFixed(3),
      'Confidence Factor': player.confidenceFactor?.toFixed(3),
      'Past Perf Multiplier': player.pastPerfMultiplier?.toFixed(2),
      'Refined Weighted Score': player.refinedWeightedScore?.toFixed(3),
      'Final WAR': player.war?.toFixed(2),
      'Notes': player.notes || ''
    };
  });
}

// Add to your exports:
module.exports = {
  calculatePlayerMetrics,
  aggregatePlayerData,
  prepareRankingOutput,
  debugGroupScores,
};
