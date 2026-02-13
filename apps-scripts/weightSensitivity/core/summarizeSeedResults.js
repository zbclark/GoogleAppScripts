#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

const args = process.argv.slice(2);
let TOURNAMENT_NAME = null;
let EVENT_ID = null;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--tournament' || args[i] === '--name') && args[i + 1]) {
    TOURNAMENT_NAME = String(args[i + 1]).trim();
  }
  if ((args[i] === '--event' || args[i] === '--eventId') && args[i + 1]) {
    EVENT_ID = String(args[i + 1]).trim();
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

const files = fs.readdirSync(OUTPUT_DIR)
  .filter(name => name.startsWith(`${baseName}_seed-`) && name.endsWith('_results.json'))
  .map(name => path.resolve(OUTPUT_DIR, name));

if (files.length === 0) {
  console.error(`❌ No seed results found for base name "${baseName}" in output/.`);
  process.exit(1);
}

const summaries = files.map(filePath => {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const optimized = data.step3_optimized?.evaluation || {};
  const currentYearPlayers = Array.isArray(data.step3_optimized?.rankingsCurrentYear)
    ? data.step3_optimized.rankingsCurrentYear.length
    : null;
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
    matchedPlayers: currentYearPlayers ?? optimized.matchedPlayers ?? null
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
  lines.push(`${index + 1}. seed=${entry.seed || 'n/a'} | corr=${entry.correlation?.toFixed(4) ?? 'n/a'} | top20=${top20Text} | top20W=${top20WeightedText} | rmse=${entry.rmse?.toFixed(2) ?? 'n/a'} | mae=${entry.mae?.toFixed(2) ?? 'n/a'} | players=${entry.matchedPlayers ?? 'n/a'} | file=${entry.file}`);
});

lines.push('');
lines.push('Best seed:');
lines.push(`seed=${best.seed || 'n/a'} | file=${best.file}`);

const summaryPath = path.resolve(OUTPUT_DIR, `${baseName}_seed_summary.txt`);
fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');

console.log(`✅ Seed summary written to: ${summaryPath}`);
