const fs = require('fs');
const path = require('path');

const { loadCsv } = require('../utilities/csvLoader');
const { buildPlayerData } = require('../utilities/dataPrep');
const { getSharedConfig } = require('../utilities/configParser');
const { buildMetricGroupsFromConfig } = require('../utilities/metricConfigBuilder');
const { aggregatePlayerData, calculatePlayerMetrics, prepareRankingOutput } = require('../core/modelCore');
const { getDeltaPlayerScoresForEvent } = require('../utilities/deltaPlayerScores');

const ROOT_DIR = path.resolve(__dirname, '..');
let DATA_DIR = path.resolve(ROOT_DIR, 'data');
// Legacy default was `.../output/`; keep parity artifacts under `data/` by default.
let OUTPUT_DIR = path.resolve(ROOT_DIR, 'data', 'parity_outputs');

const args = process.argv.slice(2);
let OVERRIDE_DIR = null;
let OVERRIDE_OUTPUT_DIR = null;
let TOURNAMENT_NAME = null;
let SEASON = null;
let INCLUDE_CURRENT_EVENT_ROUNDS = false;
const DELTA_BLEND_PRED = 0.7;
const DELTA_BLEND_TREND = 0.3;
const TRACE_PLAYER = String(process.env.TRACE_PLAYER || '').trim();
const TRACE_PLAYER_LOWER = TRACE_PLAYER.toLowerCase();
const shouldTracePlayer = (name) => TRACE_PLAYER && String(name || '').toLowerCase().includes(TRACE_PLAYER_LOWER);
const METRIC_LABELS = [
  // Historical Metrics (17)
  "SG Total", "Driving Distance", "Driving Accuracy",
  "SG T2G", "SG Approach", "SG Around Green",
  "SG OTT", "SG Putting", "Greens in Regulation",
  "Scrambling", "Great Shots", "Poor Shots",
  "Scoring Average", "Birdies or Better", "Birdie Chances Created",
  "Fairway Proximity", "Rough Proximity",
  // Approach Metrics (18)
  "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox",
  "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox",
  "Approach <150 Rough GIR", "Approach <150 Rough SG", "Approach <150 Rough Prox",
  "Approach >150 Rough GIR", "Approach >150 Rough SG", "Approach >150 Rough Prox",
  "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox",
  "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox"
];

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--dir' || args[i] === '--folder') && args[i + 1]) {
    OVERRIDE_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--outputDir' || args[i] === '--output-dir') && args[i + 1]) {
    OVERRIDE_OUTPUT_DIR = String(args[i + 1]).trim();
  }
  if ((args[i] === '--tournament' || args[i] === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
  }
  if ((args[i] === '--season' || args[i] === '--year') && args[i + 1]) {
    const parsedSeason = parseInt(String(args[i + 1]).trim(), 10);
    SEASON = Number.isNaN(parsedSeason) ? null : parsedSeason;
  }
  if (args[i] === '--includeCurrentEventRounds' || args[i] === '--include-current-event-rounds') {
    INCLUDE_CURRENT_EVENT_ROUNDS = true;
  }
}

if (OVERRIDE_DIR) {
  const normalizedDir = OVERRIDE_DIR.replace(/^[\/]+|[\/]+$/g, '');
  const dataFolder = path.resolve(ROOT_DIR, 'data', normalizedDir);
  if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder, { recursive: true });
  DATA_DIR = dataFolder;
  OUTPUT_DIR = path.resolve(dataFolder, 'parity_outputs');
}

if (OVERRIDE_OUTPUT_DIR) {
  OUTPUT_DIR = path.isAbsolute(OVERRIDE_OUTPUT_DIR)
    ? OVERRIDE_OUTPUT_DIR
    : path.resolve(ROOT_DIR, OVERRIDE_OUTPUT_DIR);
}

const resolveTournamentFile = (suffix, tournamentName, season, fallbackName) => {
  const baseName = String(tournamentName || fallbackName || '').trim();
  const seasonTag = season ? `(${season})` : '';
  const exactName = baseName ? `${baseName} ${seasonTag} - ${suffix}.csv`.replace(/\s+/g, ' ').trim() : '';
  const altName = baseName ? `${baseName} - ${suffix}.csv` : '';

  const candidates = [];
  if (fs.existsSync(DATA_DIR)) {
    fs.readdirSync(DATA_DIR).forEach(file => {
      if (!file.toLowerCase().endsWith('.csv')) return;
      if (!file.toLowerCase().includes(suffix.toLowerCase())) return;
      candidates.push({ file, path: path.resolve(DATA_DIR, file) });
    });
  }

  if (exactName) {
    const match = candidates.find(c => c.file.toLowerCase() === exactName.toLowerCase());
    if (match) return match.path;
  }

  if (altName) {
    const match = candidates.find(c => c.file.toLowerCase() === altName.toLowerCase());
    if (match) return match.path;
  }

  if (baseName) {
    const match = candidates.find(c => c.file.toLowerCase().includes(baseName.toLowerCase()) && c.file.toLowerCase().includes(suffix.toLowerCase()));
    if (match) return match.path;
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.file.localeCompare(b.file));
    return candidates[0].path;
  }

  const fallback = exactName || altName || `${suffix}.csv`;
  return path.resolve(DATA_DIR, fallback);
};

const runParity = () => {
  const seasonValue = SEASON ?? new Date().getFullYear();
  const fallbackTournament = TOURNAMENT_NAME || 'Event';

  if (TRACE_PLAYER) {
    const safeName = TRACE_PLAYER.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    process.env.TRACE_LOG_PATH = path.resolve(OUTPUT_DIR, `trace_${safeName || 'trace'}.txt`);
  }

  const configPath = resolveTournamentFile('Configuration Sheet', TOURNAMENT_NAME, seasonValue, fallbackTournament);
  const fieldPath = resolveTournamentFile('Tournament Field', TOURNAMENT_NAME, seasonValue, fallbackTournament);
  const historyPath = resolveTournamentFile('Historical Data', TOURNAMENT_NAME, seasonValue, fallbackTournament);
  const approachPath = resolveTournamentFile('Approach Skill', TOURNAMENT_NAME, seasonValue, fallbackTournament);

  const required = [
    { name: 'Configuration Sheet', path: configPath },
    { name: 'Tournament Field', path: fieldPath },
    { name: 'Historical Data', path: historyPath },
    { name: 'Approach Skill', path: approachPath }
  ];

  const missing = required.filter(file => !fs.existsSync(file.path));
  if (missing.length) {
    console.error('Missing required input files:');
    missing.forEach(file => console.error(`- ${file.name}: ${file.path}`));
    process.exit(1);
  }

  const sharedConfig = getSharedConfig(configPath);
  const currentEventId = String(sharedConfig.currentEventId || '').trim();
  if (!currentEventId) {
    console.error('Missing current event ID in configuration sheet (G9).');
    process.exit(1);
  }

  const metricConfig = buildMetricGroupsFromConfig({
    getCell: sharedConfig.getCell,
    pastPerformanceEnabled: sharedConfig.pastPerformanceEnabled,
    pastPerformanceWeight: sharedConfig.pastPerformanceWeight,
    currentEventId
  });

  const fieldData = loadCsv(fieldPath, { skipFirstColumn: true });
  const historyData = loadCsv(historyPath, { skipFirstColumn: true });
  const approachData = loadCsv(approachPath, { skipFirstColumn: true });

  const playerData = buildPlayerData({
    fieldData,
    roundsRawData: historyData,
    approachRawData: approachData,
    currentEventId,
    currentSeason: seasonValue,
    includeCurrentEventRounds: INCLUDE_CURRENT_EVENT_ROUNDS
  });

  const deltaScoresById = getDeltaPlayerScoresForEvent(currentEventId, seasonValue) || {};

  const runtimeConfig = {
    currentSeason: seasonValue,
    deltaScoresById,
    courseSetupWeights: sharedConfig.courseSetupWeights,
    similarCoursesWeight: sharedConfig.similarCoursesWeight,
    puttingCoursesWeight: sharedConfig.puttingCoursesWeight,
    courseType: sharedConfig.courseType,
    courseNum: sharedConfig.courseNum
  };

  const aggregatedPlayers = aggregatePlayerData(
    playerData.players,
    playerData.historicalData,
    playerData.approachData,
    sharedConfig.similarCourseIds,
    sharedConfig.puttingCourseIds
  );

  const rankedPlayers = calculatePlayerMetrics(aggregatedPlayers, {
    groups: metricConfig.groups,
    pastPerformance: metricConfig.pastPerformance,
    config: runtimeConfig
  });

  const processedData = rankedPlayers.players;
  const groupStats = rankedPlayers.groupStats || {};

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

  const deltaTrendLow = getPercentileThreshold(deltaTrendScores, 0.1);
  const deltaTrendHigh = getPercentileThreshold(deltaTrendScores, 0.9);
  const deltaPredLow = getPercentileThreshold(deltaPredictiveScores, 0.1);
  const deltaPredHigh = getPercentileThreshold(deltaPredictiveScores, 0.9);

  const computeBucketSignalMap = (scoresById, courseSetup) => {
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

  const bucketSignalById = computeBucketSignalMap(deltaScoresById, sharedConfig.courseSetupWeights);

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
    player.deltaNote = buildDeltaNote(player.deltaTrendScore, player.deltaPredictiveScore, entry, sharedConfig.courseSetupWeights, bucketSignalEntry);

    if (typeof player.deltaPredictiveScore === 'number') {
      const cappedDelta = Math.max(-1, Math.min(1, player.deltaPredictiveScore));
      const deltaWarImpact = cappedDelta * 0.05;
      player.deltaWarImpact = deltaWarImpact;
      player.war = (typeof player.war === 'number' ? player.war : 0) + deltaWarImpact;
    } else {
      player.deltaWarImpact = 0;
    }
  });

  const sortedData = prepareRankingOutput(processedData);

  const rankingResult = {
    success: true,
    players: sortedData,
    groupStats,
    timestamp: new Date().toISOString(),
    message: "Rankings generated successfully!"
  };

  if (TRACE_PLAYER) {
    const targetPlayer = processedData.find(p => p && shouldTracePlayer(p.name)) || null;
    const targetData = targetPlayer ? aggregatedPlayers[targetPlayer.dgId] : null;
    const snapshotLines = [];
    const push = (line) => snapshotLines.push(line);
    push(`TRACE_PLAYER: ${TRACE_PLAYER}`);
    push(`Players processed: ${processedData.length}`);
    push(`Target player found: ${targetPlayer ? 'YES' : 'NO'}`);
    if (targetPlayer) {
      push(`${targetPlayer.name} DG ID: ${targetPlayer.dgId}`);
      if (targetData) {
        push('Round Categorization:');
        push(`  Putting rounds: ${targetData.puttingRounds.length}`);
        push(`  Historical rounds: ${targetData.historicalRounds.length}`);
        push(`  Similar rounds: ${targetData.similarRounds.length}`);

        if (targetData.puttingRounds.length > 0) {
          targetData.puttingRounds.forEach((r, i) => {
            push(`  Putting Round ${i}: event=${r.eventId}, sg_putt=${r.metrics?.strokesGainedPutt}, roundNum=${r.roundNum}`);
          });
        }

        if (targetData.historicalRounds.length > 0) {
          push('  Historical sg_putt values:');
          targetData.historicalRounds.forEach((r, i) => {
            push(`    Historical Round ${i}: event=${r.eventId}, sg_putt=${r.metrics?.strokesGainedPutt}, roundNum=${r.roundNum}`);
          });

          const sgPuttValues = targetData.historicalRounds
            .map(r => r.metrics?.strokesGainedPutt)
            .filter(v => typeof v === 'number' && !isNaN(v));
          if (sgPuttValues.length > 0) {
            let sumWeighted = 0;
            let sumWeights = 0;
            sgPuttValues.forEach((value, i) => {
              const weight = Math.exp(-0.2 * i);
              sumWeighted += weight * value;
              sumWeights += weight;
            });
            const weightedAvg = sumWeights > 0 ? sumWeighted / sumWeights : 0;
            push(`  Weighted Average SG Putt (lambda=0.2): ${weightedAvg}`);
            push(`  Calculation: ${sgPuttValues.map((v, i) => `${v}*exp(-0.2*${i})`).join(' + ')} / sum(weights)`);
          }
        }

        if (targetData.approachMetrics) {
          push('Approach Metrics Raw Data:');
          push(`  <100 FW GIR: ${targetData.approachMetrics['<100']?.fwGIR}`);
          push(`  <100 SG (per-shot): ${targetData.approachMetrics['<100']?.strokesGained}`);
          push(`  <100 Prox: ${targetData.approachMetrics['<100']?.shotProx}`);
          push(`  <150 FW GIR: ${targetData.approachMetrics['<150']?.fwGIR}`);
          push(`  <150 FW SG (per-shot): ${targetData.approachMetrics['<150']?.fwStrokesGained}`);
          push(`  <150 FW Prox: ${targetData.approachMetrics['<150']?.fwShotProx}`);
        }

        if (Array.isArray(targetPlayer.metrics) && targetPlayer.metrics.length > 14) {
          const bccValue = targetPlayer.metrics[14];
          push('BCC Calculation Components:');
          push(`  Driving Accuracy (metric 2): ${targetPlayer.metrics[2]}`);
          push(`  SG Putting (metric 7): ${targetPlayer.metrics[7]}`);
          push(`  Approach <100 GIR (metric 17): ${targetPlayer.metrics[17]}`);
          push(`  Approach <150 FW GIR (metric 20): ${targetPlayer.metrics[20]}`);
          push(`  Approach <150 Rough GIR (metric 23): ${targetPlayer.metrics[23]}`);
          push(`  Approach >150 Rough GIR (metric 26): ${targetPlayer.metrics[26]}`);
          push(`  Approach <200 FW GIR (metric 29): ${targetPlayer.metrics[29]}`);
          push(`  Approach >200 FW GIR (metric 32): ${targetPlayer.metrics[32]}`);
          push(`  Approach <100 SG (metric 18): ${targetPlayer.metrics[18]}`);
          push(`  Approach <150 FW SG (metric 21): ${targetPlayer.metrics[21]}`);
          push(`  Calculated BCC (metric 14): ${bccValue}`);
        }
      }

      push(`WeightedScore: ${targetPlayer.weightedScore}`);
      push(`RefinedWeightedScore: ${targetPlayer.refinedWeightedScore}`);
      push(`PastPerfMultiplier: ${targetPlayer.pastPerformanceMultiplier}`);
      push(`DataCoverage: ${targetPlayer.dataCoverage} | Confidence: ${targetPlayer.confidenceFactor}`);

      if (targetPlayer.groupScores) {
        Object.entries(targetPlayer.groupScores).forEach(([groupName, score]) => {
          push(`GroupScore ${groupName}: ${score}`);
        });
      }

      if (Array.isArray(targetPlayer.metrics)) {
        targetPlayer.metrics.forEach((val, idx) => {
          const label = METRIC_LABELS[idx] || `Metric ${idx}`;
          push(`Metric ${idx} ${label}: ${val}`);
        });
      }

      if (Array.isArray(targetPlayer.metrics)) {
        const puttingValue = targetPlayer.metrics[7];
        const puttingStats = groupStats?.["Putting"]?.["SG Putting"];
        if (typeof puttingValue === 'number' && puttingStats) {
          const puttingStdDev = puttingStats.stdDev || 0.001;
          const puttingZ = (puttingValue - puttingStats.mean) / puttingStdDev;
          push(`Putting Metric Value (index 7): ${puttingValue}`);
          push(`Putting Stats mean=${puttingStats.mean}, stdDev=${puttingStdDev}`);
          push(`Putting Z-Score: ${puttingZ}`);
        }
      }

      if (Array.isArray(targetPlayer.metrics) && targetPlayer.metrics.length >= 35) {
        for (let i = 17; i <= 34; i++) {
          const label = METRIC_LABELS[i] || `Approach Metric ${i}`;
          push(`Approach Metric ${i} ${label}: ${targetPlayer.metrics[i]}`);
        }
      }

      if (Array.isArray(targetPlayer.metrics) && targetPlayer.metrics.length > 14) {
        push(`Derived Metric BCC (index 14): ${targetPlayer.metrics[14]}`);
      }

      if (Array.isArray(targetPlayer.trends)) {
        const trendLabels = [
          'SG Total', 'Driving Distance', 'Driving Accuracy', 'SG T2G',
          'SG Approach', 'SG Around Green', 'SG OTT', 'SG Putting',
          'Greens in Regulation', 'Scrambling', 'Great Shots', 'Poor Shots',
          'Scoring Average', 'Birdies or Better', 'Fairway Proximity', 'Rough Proximity'
        ];
        targetPlayer.trends.forEach((trendVal, idx) => {
          const label = trendLabels[idx] || `Trend ${idx}`;
          push(`Trend ${idx} ${label}: ${trendVal}`);
        });
      }

      if (targetPlayer.groupScoresBeforeDampening) {
        push(`GroupScores Before Dampening: ${JSON.stringify(targetPlayer.groupScoresBeforeDampening)}`);
      }
      if (targetPlayer.groupScoresAfterDampening) {
        push(`GroupScores After Dampening: ${JSON.stringify(targetPlayer.groupScoresAfterDampening)}`);
      }

      const statsFocus = new Set([
        'Scoring Average',
        'Birdie Chances Created',
        'SG T2G',
        'SG Putting',
        'SG Around Green'
      ]);
      Object.entries(groupStats).forEach(([groupName, metrics]) => {
        Object.entries(metrics).forEach(([metricName, stats]) => {
          if (metricName.includes('Approach') || metricName.includes('Prox') || statsFocus.has(metricName)) {
            push(`Stats ${groupName} -> ${metricName}: mean=${stats.mean}, stdDev=${stats.stdDev}`);
          }
        });
      });
    }

    const safeName = TRACE_PLAYER.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const snapshotPath = path.resolve(OUTPUT_DIR, `debug_snapshot_${safeName || 'trace'}.txt`);
    fs.writeFileSync(snapshotPath, snapshotLines.join('\n'));
    console.log(`✅ Debug snapshot saved to ${snapshotPath}`);
  }

  const pickFields = player => ({
    rank: player.rank,
    dgId: player.dgId,
    name: player.name,
    weightedScore: player.weightedScore,
    refinedWeightedScore: player.refinedWeightedScore,
    war: player.war,
    deltaTrendScore: player.deltaTrendScore,
    deltaPredictiveScore: player.deltaPredictiveScore,
    deltaNote: player.deltaNote
  });

  const output = {
    timestamp: new Date().toISOString(),
    eventId: currentEventId,
    season: seasonValue,
    tournament: TOURNAMENT_NAME || fallbackTournament,
    dataDir: DATA_DIR,
    outputDir: OUTPUT_DIR,
    files: {
      configurationSheet: configPath,
      tournamentField: fieldPath,
      historicalData: historyPath,
      approachSkill: approachPath
    },
    summary: {
      players: rankingResult.players?.length || 0,
      includeCurrentEventRounds: INCLUDE_CURRENT_EVENT_ROUNDS
    },
    top50: (rankingResult.players || []).slice(0, 50).map(pickFields),
    players: (rankingResult.players || []).map(pickFields)
  };

  const outputPath = path.resolve(OUTPUT_DIR, 'parity_modelcore.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Parity output saved to ${outputPath}`);

  const textLines = [];
  textLines.push('='.repeat(100));
  textLines.push('MODELCORE PARITY OUTPUT');
  textLines.push('='.repeat(100));
  textLines.push(`Timestamp: ${output.timestamp}`);
  textLines.push(`Event: ${output.eventId} | Season: ${output.season} | Tournament: ${output.tournament}`);
  textLines.push(`Data Dir: ${output.dataDir}`);
  textLines.push(`Include Current Event Rounds: ${output.summary.includeCurrentEventRounds}`);
  textLines.push(`Players: ${output.summary.players}`);
  textLines.push('');
  textLines.push('Top 50 Rankings:');
  textLines.push('Rank | DG ID | Name | Weighted | Refined | WAR | ΔTrend | ΔPred | ΔNote');
  textLines.push('-'.repeat(100));

  output.top50.forEach(player => {
    const values = [
      player.rank,
      player.dgId,
      player.name,
      typeof player.weightedScore === 'number' ? player.weightedScore.toFixed(3) : 'n/a',
      typeof player.refinedWeightedScore === 'number' ? player.refinedWeightedScore.toFixed(3) : 'n/a',
      typeof player.war === 'number' ? player.war.toFixed(3) : 'n/a',
      typeof player.deltaTrendScore === 'number' ? player.deltaTrendScore.toFixed(3) : 'n/a',
      typeof player.deltaPredictiveScore === 'number' ? player.deltaPredictiveScore.toFixed(3) : 'n/a',
      player.deltaNote || ''
    ];
    textLines.push(values.join(' | '));
  });

  const textPath = path.resolve(OUTPUT_DIR, 'parity_modelcore.txt');
  fs.writeFileSync(textPath, textLines.join('\n'));
  console.log(`✅ Parity text output saved to ${textPath}`);
};

runParity();
