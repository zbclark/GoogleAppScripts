const fs = require('fs');
const csv = require('csv-parse/sync');

// Read the Scheffler data
const data = fs.readFileSync('Waste Management (2026) - Scheffler Historical Data.csv', 'utf8');
const lines = data.split('\n');

// Row 5 (index 4) has the header
const headerLine = lines[4];
const headers = headerLine.split(',').map(h => h.trim());

// Parse all data lines starting from row 6 (index 5)
const dataLines = lines.slice(5).join('\n');
const records = csv.parse(dataLines, { 
  columns: headers,
  skip_empty_lines: true,
  relax_quotes: true
});

// Filter for Scheffler only (DG ID 18417)
const schefflerRounds = records.filter(r => parseInt(r.dg_id) === 18417);

// Similar events
const similarEvents = [3, 7, 12, 23, 28];

console.log('=== CHECKING RAW CSV DATA FOR SCHEFFLER AT SIMILAR EVENTS ===\n');

// First, show what columns are available
console.log('Available columns in CSV:');
headers.forEach((h, i) => {
  if (h.toLowerCase().includes('distance') || 
      h.toLowerCase().includes('accuracy') ||
      h.toLowerCase().includes('sg_') ||
      h.toLowerCase().includes('gir') ||
      h.toLowerCase().includes('driving')) {
    console.log(`  [${i}] ${h}`);
  }
});

console.log('\n=== SAMPLE DATA FOR SCHEFFLER AT EVENT 3 ===\n');

const event3 = schefflerRounds.filter(r => parseInt(r.event_id) === 3);
if (event3.length > 0) {
  const sample = event3[0];
  console.log(`Sample round: ${sample.year} Event 3`);
  console.log(`driving_acc: ${sample.driving_acc}`);
  console.log(`driving_dist: ${sample.driving_dist}`);
  console.log(`sg_ott: ${sample.sg_ott}`);
  console.log(`sg_app: ${sample.sg_app}`);
  console.log(`gir: ${sample.gir}`);
  
  // Check all columns for this round
  console.log('\nAll columns:');
  Object.entries(sample).forEach(([key, value]) => {
    if (value && value.trim && value.trim() !== '') {
      console.log(`  ${key}: ${value}`);
    }
  });
}
