// Script to load and print a sample of the historical CSV data
const { loadCsv } = require('./csvLoader');

// Path to your historical data CSV
const csvPath = './apps-scripts/Golf_Algorithm_Library/weightSensitivity/American Express (2026) - Historical Data (1).csv';

function printSampleRows() {
  // Specify headerRow: 4 (row 5, 0-based), skipFirstColumn: true
  const data = loadCsv(csvPath, { headerRow: 4, skipFirstColumn: true });
  console.log('Total rows loaded:', data.length);
  console.log('First 3 rows:');
  for (let i = 0; i < Math.min(3, data.length); i++) {
    console.log(data[i]);
  }
}

if (require.main === module) {
  printSampleRows();
}