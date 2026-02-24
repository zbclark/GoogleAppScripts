#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.resolve(ROOT_DIR, 'output');

const args = process.argv.slice(2);
let TOURNAMENT_NAME = null;
let EVENT_ID = null;
let OUTPUT_DIR = null;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--tournament' || args[i] === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
  }
  if ((args[i] === '--event' || args[i] === '--eventId') && args[i + 1]) {
    EVENT_ID = String(args[i + 1]).trim();
  }
  if ((args[i] === '--dir' || args[i] === '--outputDir' || args[i] === '--output-dir') && args[i + 1]) {
    OUTPUT_DIR = String(args[i + 1]).trim();
  }
}

if (!TOURNAMENT_NAME && !EVENT_ID) {
  console.error('❌ Provide --tournament "Name" or --event <id> to summarize seed results.');
  process.exit(1);
}

const baseName = (TOURNAMENT_NAME || `event_${EVENT_ID}`)
  .toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/[^a-z0-9_\-]/g, '');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedBaseName = escapeRegExp(baseName);
const seedJsonRegex = new RegExp(`^(?:optimizer_)?${escapedBaseName}_seed-.+_(?:post_tournament_)?results\\.json$`);
const seedResultRegex = new RegExp(`^(?:optimizer_)?${escapedBaseName}_seed-.+_(?:post_tournament_)?results\\.(json|txt)$`);
const seedLogRegex = new RegExp(`^(?:optimizer_)?${escapedBaseName}_seed-.*\\.log$`);

const resolvedOutputDir = OUTPUT_DIR
  ? (path.isAbsolute(OUTPUT_DIR)
    ? OUTPUT_DIR
    : path.resolve(ROOT_DIR, OUTPUT_DIR))
  : OUTPUT_ROOT;

if (!fs.existsSync(resolvedOutputDir)) {
  console.error(`❌ Output directory not found: ${resolvedOutputDir}`);
  process.exit(1);
}

const files = fs.readdirSync(resolvedOutputDir)
  .filter(name => seedJsonRegex.test(name))
  .map(name => path.resolve(resolvedOutputDir, name));

if (files.length === 0) {
  console.error(`❌ No seed results found for base name "${baseName}" in ${resolvedOutputDir}.`);
  process.exit(1);
}

const getRecommendationType = (approach) => {
  if (!approach) {
    return 'unknown';
  }
  const normalized = String(approach).toLowerCase();
  if (normalized.includes('baseline') || normalized.includes('template')) {
    return 'baseline';
  }
  if (normalized.includes('optimized')) {
    return 'optimized';
  }
  return 'unknown';
};

const summaries = files.map(filePath => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const optimized = data.step3_optimized?.evaluation || {};
  const currentYearPlayers = Array.isArray(data.step3_optimized?.rankingsCurrentYear)
    ? data.step3_optimized.rankingsCurrentYear.length
    : null;
  const recommendation = data.recommendation || {};
  const recommendationApproach = recommendation.approach ?? null;
  const recommendationType = getRecommendationType(recommendationApproach);
  const baselineTemplate = recommendation.baselineTemplate ?? data.baselineTemplate ?? null;
  return {
    file: path.basename(filePath),
    seed: data.optSeed || null,
    correlation: optimized.correlation ?? null,
    rSquared: optimized.rSquared ?? null,
    rmse: optimized.rmse ?? null,
    mae: optimized.mae ?? null,
    meanError: optimized.meanError ?? null,
    stdDevError: optimized.stdDevError ?? null,
    top20: optimized.top20 ?? null,
    top20WeightedScore: optimized.top20WeightedScore ?? null,
    matchedPlayers: currentYearPlayers ?? optimized.matchedPlayers ?? null,
    recommendationApproach,
    recommendationType,
    baselineTemplate
  };
});

summaries.sort((a, b) => {
  if ((b.correlation ?? -Infinity) !== (a.correlation ?? -Infinity)) {
    return (b.correlation ?? -Infinity) - (a.correlation ?? -Infinity);
  }
  if ((b.top20 ?? -Infinity) !== (a.top20 ?? -Infinity)) {
    return (b.top20 ?? -Infinity) - (a.top20 ?? -Infinity);
  }
  return (b.top20WeightedScore ?? -Infinity) - (a.top20WeightedScore ?? -Infinity);
});

const best = summaries[0];
const recommendationGroups = new Map();

summaries.forEach(entry => {
  const key = [
    entry.recommendationType || 'unknown',
    entry.recommendationApproach || 'n/a',
    entry.baselineTemplate || 'n/a'
  ].join('|');

  if (!recommendationGroups.has(key)) {
    recommendationGroups.set(key, {
      type: entry.recommendationType || 'unknown',
      approach: entry.recommendationApproach || null,
      baselineTemplate: entry.baselineTemplate || null,
      seeds: [],
      count: 0
    });
  }

  const group = recommendationGroups.get(key);
  group.count += 1;
  if (entry.seed) {
    group.seeds.push(entry.seed);
  }
});

const lines = [];
lines.push('='.repeat(100));
lines.push('ADAPTIVE OPTIMIZER SEED SUMMARY');
lines.push('='.repeat(100));
lines.push(`Base: ${baseName}`);
lines.push(`Seeds analyzed: ${summaries.length}`);
lines.push('');
lines.push('Top seed ranking (sorted by correlation, then Top-20, then Top-20 Weighted):');
lines.push('');

summaries.forEach((entry, index) => {
  const top20Text = typeof entry.top20 === 'number' ? `${entry.top20.toFixed(1)}%` : 'n/a';
  const top20WeightedText = typeof entry.top20WeightedScore === 'number' ? `${entry.top20WeightedScore.toFixed(1)}%` : 'n/a';
  const recType = entry.recommendationType || 'unknown';
  const baselineText = entry.baselineTemplate ? ` | baseline=${entry.baselineTemplate}` : '';
  lines.push(`${index + 1}. seed=${entry.seed || 'n/a'} | corr=${entry.correlation?.toFixed(4) ?? 'n/a'} | top20=${top20Text} | top20W=${top20WeightedText} | rmse=${entry.rmse?.toFixed(2) ?? 'n/a'} | mae=${entry.mae?.toFixed(2) ?? 'n/a'} | players=${entry.matchedPlayers ?? 'n/a'} | rec=${recType}${baselineText} | file=${entry.file}`);
});

lines.push('');
lines.push('Best seed:');
lines.push(`seed=${best.seed || 'n/a'} | file=${best.file}`);
lines.push(`Recommendation for best seed: ${best.recommendationApproach ?? 'n/a'}${best.baselineTemplate ? ` | baseline=${best.baselineTemplate}` : ''}`);
if (best.recommendationType === 'baseline') {
  lines.push('Note: Baseline template recommended over optimized weights.');
} else if (best.recommendationType === 'optimized') {
  lines.push('Note: Optimized weights recommended over baseline template.');
} else {
  lines.push('Note: Recommendation unavailable or unclassified.');
}

lines.push('');
lines.push('Recommendation rollup (from results.json):');
if (recommendationGroups.size === 0) {
  lines.push('n/a');
} else {
  recommendationGroups.forEach(group => {
    const seedsText = group.seeds.length > 0 ? group.seeds.join(', ') : 'n/a';
    const approachText = group.approach ?? 'n/a';
    const baselineText = group.baselineTemplate ? ` | baseline=${group.baselineTemplate}` : '';
    lines.push(`- ${group.type}: ${approachText}${baselineText} | seeds=${seedsText} | count=${group.count}`);
  });
}

const summaryPath = path.resolve(resolvedOutputDir, `${baseName}_seed_summary.txt`);
fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');

console.log(`✅ Seed summary written to: ${summaryPath}`);

const bestSeed = best.seed || null;
const keptFiles = new Set([summaryPath]);

if (bestSeed) {
  const legacyBase = `${baseName}_seed-${bestSeed}`;
  const optimizerBase = `optimizer_${baseName}_seed-${bestSeed}`;
  const candidateNames = [
    `${optimizerBase}_post_tournament_results.json`,
    `${optimizerBase}_post_tournament_results.txt`,
    `${legacyBase}_results.json`,
    `${legacyBase}_results.txt`
  ];

  candidateNames.forEach(name => {
    const candidatePath = path.resolve(resolvedOutputDir, name);
    if (fs.existsSync(candidatePath)) {
      keptFiles.add(candidatePath);
    }
  });
}

const toDelete = fs.readdirSync(resolvedOutputDir)
  .filter(name => seedResultRegex.test(name) || seedLogRegex.test(name))
  .map(name => path.resolve(resolvedOutputDir, name))
  .filter(filePath => !keptFiles.has(filePath));

if (toDelete.length > 0) {
  toDelete.forEach(filePath => {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn(`⚠️ Unable to delete ${filePath}: ${error.message}`);
    }
  });
  console.log(`🧹 Removed ${toDelete.length} seed files/logs (kept best seed outputs).`);
} else {
  console.log('🧹 No extra seed files/logs found to remove.');
}
