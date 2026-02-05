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

console.log('=== SCHEFFLER METRICS AT SIMILAR EVENTS ===\n');

similarEvents.forEach(eventId => {
  const rounds = schefflerRounds.filter(r => parseInt(r.event_id) === eventId);
  const eventName = rounds.length > 0 ? rounds[0].event_name : 'Unknown';
  
  console.log(`\nEvent ${eventId} (${eventName}): ${rounds.length} rounds`);
  
  rounds.forEach((r, idx) => {
    const year = r.year;
    const sgTotal = parseFloat(r.sg_total) || 0;
    const sgOtt = parseFloat(r.sg_ott) || 0;
    const sgApp = parseFloat(r.sg_app) || 0;
    const sgArg = parseFloat(r.sg_arg) || 0;
    const sgPutt = parseFloat(r.sg_putt) || 0;
    const drivingAcc = r.driving_acc;
    const drivingDist = r.driving_dist;
    
    console.log(`  ${year} Rd${idx+1}: SG_Total=${sgTotal.toFixed(2)}, OTT=${sgOtt.toFixed(2)}, App=${sgApp.toFixed(2)}, Arg=${sgArg.toFixed(2)}, Putt=${sgPutt.toFixed(2)}`);
  });
});

// Calculate averages
console.log(`\n=== AVERAGES AT SIMILAR EVENTS ===\n`);

const similarRounds = schefflerRounds.filter(r => similarEvents.includes(parseInt(r.event_id)));
const sgTotalAvg = similarRounds.reduce((sum, r) => sum + (parseFloat(r.sg_total) || 0), 0) / similarRounds.length;
const sgOttAvg = similarRounds.reduce((sum, r) => sum + (parseFloat(r.sg_ott) || 0), 0) / similarRounds.length;
const sgAppAvg = similarRounds.reduce((sum, r) => sum + (parseFloat(r.sg_app) || 0), 0) / similarRounds.length;
const sgArgAvg = similarRounds.reduce((sum, r) => sum + (parseFloat(r.sg_arg) || 0), 0) / similarRounds.length;
const sgPuttAvg = similarRounds.reduce((sum, r) => sum + (parseFloat(r.sg_putt) || 0), 0) / similarRounds.length;

console.log(`SG_Total Avg: ${sgTotalAvg.toFixed(3)}`);
console.log(`SG_OTT Avg: ${sgOttAvg.toFixed(3)}`);
console.log(`SG_App Avg: ${sgAppAvg.toFixed(3)}`);
console.log(`SG_Arg Avg: ${sgArgAvg.toFixed(3)}`);
console.log(`SG_Putt Avg: ${sgPuttAvg.toFixed(3)}`);
