#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_ROOT = path.resolve(ROOT_DIR, 'data');
const LEGACY_OUTPUT_ROOT = path.resolve(ROOT_DIR, 'output');

const args = process.argv.slice(2);
let TOURNAMENT_NAME = null;
let EVENT_ID = null;
let OUTPUT_DIR = null;
let SEASON = null;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--tournament' || args[i] === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
  }
  if ((args[i] === '--event' || args[i] === '--eventId') && args[i + 1]) {
    EVENT_ID = String(args[i + 1]).trim();
  }
  if ((args[i] === '--season' || args[i] === '--year') && args[i + 1]) {
    const parsed = parseInt(String(args[i + 1]).trim(), 10);
    SEASON = Number.isNaN(parsed) ? null : parsed;
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
const seedJsonRegex = new RegExp(`^(?:optimizer_)?${escapedBaseName}_seed-.+_(?:post_(?:tournament|event)_)?results\\.json$`);
const seedResultRegex = new RegExp(`^(?:optimizer_)?${escapedBaseName}_seed-.+_(?:post_(?:tournament|event)_)?results\\.(json|txt)$`);
const seedLogRegex = new RegExp(`^(?:optimizer_)?${escapedBaseName}_seed-.*(?:_post_(?:tournament|event)_)?log\\.(?:txt|log)$`);

function normalizeTournamentSlug(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.replace(/^optimizer-+/, '');
}

function listSeasonDirs(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .map(entry => ({ season: parseInt(entry.name, 10), path: path.resolve(rootDir, entry.name) }))
    .filter(entry => Number.isFinite(entry.season))
    .sort((a, b) => b.season - a.season);
}

function resolveTournamentDir(seasonDir, tournamentName) {
  if (!seasonDir || !fs.existsSync(seasonDir)) return null;
  const normalized = normalizeTournamentSlug(tournamentName);
  const entries = fs.readdirSync(seasonDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'validation_outputs')
    .map(entry => entry.name);

  if (normalized && entries.includes(normalized)) {
    return path.resolve(seasonDir, normalized);
  }

  if (normalized) {
    const tokens = normalized.split('-').filter(Boolean);
    let best = null;
    entries.forEach(name => {
      const dirTokens = name.split('-').filter(Boolean);
      const overlap = tokens.filter(token => dirTokens.includes(token)).length;
      if (!best || overlap > best.overlap) {
        best = { name, overlap };
      }
    });
    if (best && best.overlap > 0) {
      return path.resolve(seasonDir, best.name);
    }
  }

  return null;
}

function resolveDefaultSeedOutputDir({ tournamentName, season }) {
  if (!tournamentName) return null;
  const seasons = listSeasonDirs(DATA_ROOT);
  const seasonDirs = season
    ? seasons.filter(entry => entry.season === season)
    : seasons;

  for (const entry of seasonDirs) {
    const tournamentDir = resolveTournamentDir(entry.path, tournamentName);
    if (!tournamentDir) continue;
    const seedRunsDir = path.resolve(tournamentDir, 'post_event', 'seed_runs');
    if (fs.existsSync(seedRunsDir)) return seedRunsDir;
    const postEventDir = path.resolve(tournamentDir, 'post_event');
    if (fs.existsSync(postEventDir)) return postEventDir;
  }

  return null;
}

const resolvedOutputDir = OUTPUT_DIR
  ? (path.isAbsolute(OUTPUT_DIR)
    ? OUTPUT_DIR
    : path.resolve(ROOT_DIR, OUTPUT_DIR))
  : (resolveDefaultSeedOutputDir({ tournamentName: TOURNAMENT_NAME, season: SEASON }) || DATA_ROOT);

if (!fs.existsSync(resolvedOutputDir)) {
  console.error(`❌ Output directory not found: ${resolvedOutputDir}`);
  process.exit(1);
}

let effectiveOutputDir = resolvedOutputDir;
let files = fs.readdirSync(resolvedOutputDir)
  .filter(name => seedJsonRegex.test(name))
  .map(name => path.resolve(resolvedOutputDir, name));

if (files.length === 0) {
  // Back-compat: allow legacy `output/` usage for historical runs, but prefer `data/`.
  const legacyDir = LEGACY_OUTPUT_ROOT;
  if (resolvedOutputDir !== legacyDir && fs.existsSync(legacyDir)) {
    const legacyFiles = fs.readdirSync(legacyDir)
      .filter(name => seedJsonRegex.test(name))
      .map(name => path.resolve(legacyDir, name));
    if (legacyFiles.length > 0) {
      console.warn(`ℹ️  No seed results found in ${resolvedOutputDir}; falling back to legacy ${legacyDir}.`);
      effectiveOutputDir = legacyDir;
      files = legacyFiles;
    }
  }
  if (files.length === 0) {
    console.error(`❌ No seed results found for base name "${baseName}" in ${resolvedOutputDir}.`);
    console.error('Tip: pass --season <YYYY> and/or --outputDir <path to post_event/seed_runs>.');
    process.exit(1);
  }
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
lines.push('MODEL OPTIMIZER SEED SUMMARY');
lines.push('='.repeat(100));
lines.push(`Base: ${baseName}`);
lines.push(`Directory: ${effectiveOutputDir}`);
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

const summaryPath = path.resolve(effectiveOutputDir, `${baseName}_seed_summary.txt`);
fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');

console.log(`✅ Seed summary written to: ${summaryPath}`);

const bestSeed = best.seed || null;
const keptFiles = new Set([summaryPath]);

if (bestSeed) {
  const legacyBase = `${baseName}_seed-${bestSeed}`;
  const optimizerBase = `optimizer_${baseName}_seed-${bestSeed}`;
  const candidateNames = [
    // Current naming (preferred).
    `${legacyBase}_post_event_results.json`,
    `${legacyBase}_post_event_results.txt`,

    // Back-compat for older naming.
    `${legacyBase}_post_tournament_results.json`,
    `${legacyBase}_post_tournament_results.txt`,

    // Back-compat for legacy optimizer_-prefixed artifacts.
    `${optimizerBase}_post_event_results.json`,
    `${optimizerBase}_post_event_results.txt`,
    `${optimizerBase}_post_tournament_results.json`,
    `${optimizerBase}_post_tournament_results.txt`,

    // Keep the best seed log output as well (new + legacy).
    `${legacyBase}_post_event_log.txt`,
    `${legacyBase}_post_tournament_log.txt`,
    `${optimizerBase}_post_event_log.txt`,
    `${optimizerBase}_post_tournament_log.txt`,
    `${legacyBase}_log.txt`,
    `${optimizerBase}_log.txt`,
    `${legacyBase}.log`,
    `${optimizerBase}.log`,

    `${legacyBase}_results.json`,
    `${legacyBase}_results.txt`
  ];

  candidateNames.forEach(name => {
    const candidatePath = path.resolve(effectiveOutputDir, name);
    if (fs.existsSync(candidatePath)) {
      keptFiles.add(candidatePath);
    }
  });
}

const toDelete = fs.readdirSync(effectiveOutputDir)
  .filter(name => seedResultRegex.test(name) || seedLogRegex.test(name))
  .map(name => path.resolve(effectiveOutputDir, name))
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
