#!/usr/bin/env node
/**
 * Diagnose metric weights - compare what test loads vs what actual model expects
 */

const path = require('path');
const { parse } = require('csv-parse/sync');
const fs = require('fs');

const configCsvPath = path.resolve(__dirname, 'American Express (2026) - Configuration Sheet.csv');
const configRaw = fs.readFileSync(configCsvPath, 'utf-8');
const configData = parse(configRaw, { columns: false, skip_empty_lines: true });

console.log('='.repeat(80));
console.log('WEIGHT CONFIGURATION DIAGNOSTIC');
console.log('='.repeat(80));

// Find the "Approach - Long (150-200)" row
const approachLongRowIndex = configData.findIndex(row => 
  row[0] && row[0].toString().toLowerCase().includes('approach') && 
  row[0].toString().includes('150') && row[0].toString().includes('200')
);

if (approachLongRowIndex >= 0) {
  const row = configData[approachLongRowIndex];
  console.log('\nApproach - Long (150-200) Configuration:');
  console.log('Row index:', approachLongRowIndex);
  console.log('Row data:', row);
  console.log('\nColumn breakdown:');
  row.forEach((cell, idx) => {
    if (cell !== '') {
      console.log(`  Col ${idx}: "${cell}"`);
    }
  });
  
  // Column Q would be index 16 (0-indexed)
  console.log(`\n⚠️  Column Q (index 16 - Group Weight): "${row[16]}"`);
}

// Also check metric weights columns (G, H, I, J, K, L)
console.log('\n' + '='.repeat(80));
console.log('METRIC WEIGHTS FOR APPROACH - LONG (150-200)');
console.log('='.repeat(80));

if (approachLongRowIndex >= 0) {
  const row = configData[approachLongRowIndex];
  console.log(`Column G (index 6): ${row[6]} - Approach <200 FW GIR weight`);
  console.log(`Column H (index 7): ${row[7]} - Approach <200 FW SG weight`);
  console.log(`Column I (index 8): ${row[8]} - Approach <200 FW Prox weight`);
}

// Calculate what the test is currently using
console.log('\n' + '='.repeat(80));
console.log('TEST VS ACTUAL COMPARISON');
console.log('='.repeat(80));

console.log('\nTest output showed:');
console.log('  Approach <200 FW GIR weight: 0.100');
console.log('  Approach <200 FW SG weight: 0.350');
console.log('  Approach <200 FW Prox weight: 0.550');
console.log('  Total: 1.000');
console.log('\n  Group score calculation: 3.301');

console.log('\nActual model output:');
console.log('  Group score: 10.223');
console.log('\n  Difference factor: 10.223 / 3.301 = 3.10x');

console.log('\n💡 HYPOTHESIS:');
console.log('  If metric weights were 3.1x larger, we\'d get the right answer.');
console.log('  This suggests the test is normalizing weights when it shouldn\'t,');
console.log('  OR the actual model is NOT normalizing when it should.');
console.log('='.repeat(80));
