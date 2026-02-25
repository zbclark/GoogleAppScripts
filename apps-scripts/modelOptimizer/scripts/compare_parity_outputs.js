const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ensureDirectory = dirPath => {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Defaults were historically hard-coded to `output/genesis/...`.
// We now require explicit file paths to avoid coupling to any particular local folder.
const DEFAULT_NODE_PATH = null;
const DEFAULT_GAS_PATH = null;

const args = process.argv.slice(2);
let NODE_PATH = DEFAULT_NODE_PATH;
let GAS_PATH = DEFAULT_GAS_PATH;
let OUT_PATH = path.resolve(__dirname, '..', 'data', 'parity_compare.txt');
const SCORE_TOLERANCE = 0.01;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--node' && args[i + 1]) NODE_PATH = args[i + 1];
  if (args[i] === '--gas' && args[i + 1]) GAS_PATH = args[i + 1];
  if (args[i] === '--out' && args[i + 1]) OUT_PATH = args[i + 1];
}

if (!NODE_PATH || !fs.existsSync(NODE_PATH)) {
  console.error(`Node output not found: ${NODE_PATH}`);
  console.error('Provide: --node <parity_modelcore.json>');
  process.exit(1);
}
if (!GAS_PATH || !fs.existsSync(GAS_PATH)) {
  console.error(`GAS output not found: ${GAS_PATH}`);
  console.error('Provide: --gas <GAS Player Ranking Model.csv>');
  process.exit(1);
}

const nodeData = JSON.parse(fs.readFileSync(NODE_PATH, 'utf8'));
const nodePlayers = new Map((nodeData.players || []).map(player => [String(player.dgId), player]));

const rawCsv = fs.readFileSync(GAS_PATH, 'utf8');
const csvLines = rawCsv.split(/\r?\n/);
let headerLineIdx = 4; // default to row 5

for (let i = 0; i < csvLines.length; i++) {
  const line = csvLines[i].trim();
  if (!line) continue;
  if (line.toLowerCase().includes('dg id')) {
    headerLineIdx = i;
    break;
  }
}

const slicedCsv = csvLines.slice(headerLineIdx).join('\n');
const records = parse(slicedCsv, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true
});

const normalizeNumber = value => {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const gasPlayers = new Map();
records.forEach(row => {
  const dgId = String(
    row['DG ID'] ||
    row['DGID'] ||
    row['DG Id'] ||
    row['DGID '] ||
    row['DG_ID'] ||
    row['DGId'] ||
    row['DG id'] ||
    row['DG_ID '] ||
    ''
  ).trim();
  const fallbackDgId = !dgId && Object.values(row).length >= 3
    ? String(Object.values(row)[2] || '').trim()
    : '';
  const resolvedDgId = dgId || fallbackDgId;
  if (!resolvedDgId) return;

  gasPlayers.set(resolvedDgId, {
    rank: normalizeNumber(row['Rank']),
    dgId: resolvedDgId,
    name: row['Player Name'] || row['Player'] || row['Name'] || '',
    weightedScore: normalizeNumber(row['Weighted Score']),
    refinedWeightedScore: normalizeNumber(row['Refined Weighted Score']),
    war: normalizeNumber(row['WAR']),
    deltaTrendScore: normalizeNumber(row['Delta Trend Score']),
    deltaPredictiveScore: normalizeNumber(row['Delta Predictive Score'])
  });
});

const diffs = [];
const rankSwaps = [];
const onlyInNode = [];
const onlyInGas = [];

const compareFields = (nodePlayer, gasPlayer) => {
  const fields = [
    'rank',
    'weightedScore',
    'refinedWeightedScore',
    'war',
    'deltaTrendScore',
    'deltaPredictiveScore'
  ];
  const deltas = {};
  fields.forEach(field => {
    const n = nodePlayer[field];
    const g = gasPlayer[field];
    if (typeof n === 'number' && typeof g === 'number') {
      const diff = n - g;
      if (field === 'rank') {
        if (Math.abs(diff) > 1e-6) {
          deltas[field] = diff;
        }
      } else if (Math.abs(diff) >= SCORE_TOLERANCE) {
        deltas[field] = diff;
      }
    } else if (n !== g) {
      deltas[field] = { node: n ?? null, gas: g ?? null };
    }
  });
  return deltas;
};

nodePlayers.forEach((nodePlayer, dgId) => {
  const gasPlayer = gasPlayers.get(dgId);
  if (!gasPlayer) {
    onlyInNode.push(nodePlayer);
    return;
  }
  const deltas = compareFields(nodePlayer, gasPlayer);
  if (Object.keys(deltas).length) {
    diffs.push({
      dgId,
      name: nodePlayer.name || gasPlayer.name || '',
      deltas
    });
  }

  if (typeof nodePlayer.rank === 'number' && typeof gasPlayer.rank === 'number' && nodePlayer.rank !== gasPlayer.rank) {
    rankSwaps.push({
      dgId,
      name: nodePlayer.name || gasPlayer.name || '',
      nodeRank: nodePlayer.rank,
      gasRank: gasPlayer.rank,
      diff: nodePlayer.rank - gasPlayer.rank
    });
  }
});

 gasPlayers.forEach((gasPlayer, dgId) => {
  if (!nodePlayers.has(dgId)) {
    onlyInGas.push(gasPlayer);
  }
});

const lines = [];
lines.push('='.repeat(100));
lines.push('PARITY COMPARISON: NODE vs GAS');
lines.push('='.repeat(100));
lines.push(`Node file: ${NODE_PATH}`);
lines.push(`GAS file:  ${GAS_PATH}`);
lines.push('');
lines.push(`Node players: ${nodePlayers.size}`);
lines.push(`GAS players: ${gasPlayers.size}`);
lines.push(`Only in Node: ${onlyInNode.length}`);
lines.push(`Only in GAS: ${onlyInGas.length}`);
lines.push(`Differences (>= ${SCORE_TOLERANCE} for scores): ${diffs.length}`);
lines.push(`Rank swaps: ${rankSwaps.length}`);
lines.push('');

if (onlyInNode.length) {
  lines.push('--- Only in Node (first 20) ---');
  onlyInNode.slice(0, 20).forEach(player => {
    lines.push(`${player.dgId} | ${player.name || ''}`);
  });
  lines.push('');
}

if (onlyInGas.length) {
  lines.push('--- Only in GAS (first 20) ---');
  onlyInGas.slice(0, 20).forEach(player => {
    lines.push(`${player.dgId} | ${player.name || ''}`);
  });
  lines.push('');
}

lines.push(`--- Rank swaps (first 50) ---`);
rankSwaps.slice(0, 50).forEach(entry => {
  const diffSign = entry.diff > 0 ? '+' : '';
  lines.push(`${entry.dgId} | ${entry.name} | node=${entry.nodeRank} gas=${entry.gasRank} rank_diff_from_gas=${diffSign}${entry.diff}`);
});
lines.push('');

lines.push('--- Differences (first 50, tolerance applied) ---');
diffs.slice(0, 50).forEach(entry => {
  lines.push(`${entry.dgId} | ${entry.name}`);
  Object.entries(entry.deltas).forEach(([field, delta]) => {
    if (typeof delta === 'number') {
      if (field === 'rank') {
        lines.push(`  rank_diff_from_gas=${delta > 0 ? '+' : ''}${delta.toFixed(6)}`);
      } else {
        lines.push(`  diff_${field}_from_gas=${delta > 0 ? '+' : ''}${delta.toFixed(6)}`);
      }
    } else {
      lines.push(`  diff_${field}_from_gas=node=${delta.node} gas=${delta.gas}`);
    }
  });
});

ensureDirectory(path.dirname(OUT_PATH));
fs.writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`✅ Comparison report saved to ${OUT_PATH}`);
