#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadApproachCsv, computeApproachDeltas } = require('../utilities/approachDelta');
const { loadCsv } = require('../utilities/csvLoader');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
    args[key] = value;
    if (value !== true) i++;
  }
  return args;
};

const args = parseArgs(process.argv);
const previousPath = args.previous || args.prev;
const currentPath = args.current || args.curr;
let fieldPath = args.field || args.fieldPath || null;
const outPath = args.out || 'output/approach_deltas.csv';
const defaultJsonName = `approach_deltas_${new Date().toISOString().slice(0, 10)}.json`;
const outJsonPath = args.outJson || `data/approach_deltas/${defaultJsonName}`;

if (!previousPath || !currentPath) {
  console.error('Usage: node scripts/compute_approach_deltas.js --previous <csv> --current <csv> [--out <csv>] [--outJson <json>]');
  console.error('Paths can be absolute or relative to the repo root or modelOptemizer/ directory.');
  console.error('Optional: --field <csv> to filter deltas to the tournament field.');
  process.exit(1);
}

const moduleRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(moduleRoot, 'data');

const findDefaultFieldPath = () => {
  if (!fs.existsSync(dataDir)) return null;
  const matches = fs.readdirSync(dataDir)
    .filter(name => /Tournament Field\.csv$/i.test(name))
    .map(name => path.join(dataDir, name));
  if (matches.length === 1) return matches[0];
  return null;
};

const resolveInputPath = (value) => {
  if (path.isAbsolute(value)) return value;
  const cwdPath = path.resolve(process.cwd(), value);
  if (fs.existsSync(cwdPath)) return cwdPath;
  const modulePath = path.resolve(moduleRoot, value);
  if (fs.existsSync(modulePath)) return modulePath;
  return cwdPath;
};

const resolveOutputPath = (value) => {
  if (path.isAbsolute(value)) return value;
  const cwdPath = path.resolve(process.cwd(), value);
  const modulePath = path.resolve(moduleRoot, value);
  if (value.startsWith('apps-scripts/')) return cwdPath;
  if (value.startsWith('output/') || value.startsWith('data/')) return modulePath;
  return modulePath;
};

const previousRows = loadApproachCsv(resolveInputPath(previousPath));
const currentRows = loadApproachCsv(resolveInputPath(currentPath));

if (!fieldPath) {
  fieldPath = findDefaultFieldPath();
}

const resolvedPrevPath = resolveInputPath(previousPath);
const resolvedCurrPath = resolveInputPath(currentPath);
const resolvedFieldPath = fieldPath ? resolveInputPath(fieldPath) : null;
const resolvedOutPath = resolveOutputPath(outPath);
const resolvedJsonPath = outJsonPath ? resolveOutputPath(outJsonPath) : null;

const deltaMeta = {
  generatedAt: new Date().toISOString(),
  previousPath: resolvedPrevPath,
  currentPath: resolvedCurrPath,
  fieldPath: resolvedFieldPath,
  outputPath: resolvedOutPath,
  jsonPath: resolvedJsonPath,
  note: 'Raw deltas are emitted. Lower-is-better metrics (e.g., proximity_per_shot, poor_shot_count) should be inverted downstream using the same normalization logic as other metrics.'
};

console.log('Resolved paths:');
console.log(`  Previous: ${resolvedPrevPath}`);
console.log(`  Current : ${resolvedCurrPath}`);
if (resolvedFieldPath) {
  console.log(`  Field   : ${resolvedFieldPath}`);
}
console.log(`  Output  : ${resolvedOutPath}`);
if (resolvedJsonPath) {
  console.log(`  Output JSON: ${resolvedJsonPath}`);
}
const deltaRows = computeApproachDeltas({ previousRows, currentRows });

const normalizeDgId = value => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.split('.')[0];
};

let filteredRows = deltaRows;
let fieldIds = null;
if (resolvedFieldPath) {
  const fieldRows = loadCsv(resolvedFieldPath);
  fieldIds = new Set(
    fieldRows
      .map(row => normalizeDgId(row.dg_id || row['dg_id']))
      .filter(Boolean)
  );
  filteredRows = deltaRows.filter(row => fieldIds.has(String(row.dg_id)));
  deltaMeta.fieldFilter = {
    applied: true,
    fieldCount: fieldIds.size,
    beforeCount: deltaRows.length,
    afterCount: filteredRows.length
  };
} else {
  deltaMeta.fieldFilter = {
    applied: false,
    beforeCount: deltaRows.length
  };
}

const flagField = (rows) => rows.map(row => ({
  ...row,
  tournament_field: fieldIds ? fieldIds.has(String(row.dg_id)) : null
}));

filteredRows = flagField(filteredRows);

if (!filteredRows.length) {
  console.warn('No delta rows generated. Check that dg_id values exist in both files.');
}

const headers = filteredRows.length ? Object.keys(filteredRows[0]) : ['dg_id', 'player_name'];
const csvLines = [headers.join(',')];

filteredRows.forEach(row => {
  const line = headers.map(key => {
    const value = row[key];
    if (value === null || value === undefined) return '';
    const str = String(value);
    return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
  });
  csvLines.push(line.join(','));
});

const outDir = path.dirname(resolvedOutPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(resolvedOutPath, csvLines.join('\n'));
console.log(`Wrote approach deltas to ${resolvedOutPath}`);

if (resolvedJsonPath) {
  const jsonDir = path.dirname(resolvedJsonPath);
  if (!fs.existsSync(jsonDir)) {
    fs.mkdirSync(jsonDir, { recursive: true });
  }
  fs.writeFileSync(resolvedJsonPath, JSON.stringify({ meta: deltaMeta, rows: filteredRows }, null, 2));
  console.log(`Wrote approach deltas JSON to ${resolvedJsonPath}`);
}
