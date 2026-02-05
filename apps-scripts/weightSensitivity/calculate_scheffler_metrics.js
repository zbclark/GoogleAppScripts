const fs = require('fs');
const csv = require('csv-parse/sync');

// Read the Scheffler data
const data = fs.readFileSync('Waste Management (2026) - Scheffler Historical Data.csv', 'utf8');
const lines = data.split('\n');

// Row 5 (index 4) has the header: ,dg_id,player_name,tour,season,year,event_id,...
const headerLine = lines[4];
const headers = headerLine.split(',').map(h => h.trim());

// Parse all data lines starting from row 6 (index 5)
const dataLines = lines.slice(5).join('\n');
const records = csv.parse(dataLines, { 
  columns: headers,
  skip_empty_lines: true,
  relax_quotes: true
});

console.log(`Total rounds loaded: ${records.length}`);

// Filter for Scheffler only (DG ID 18417)
const schefflerRounds = records.filter(r => parseInt(r.dg_id) === 18417);
console.log(`Scheffler rounds: ${schefflerRounds.length}`);

// Group by category based on event_id
const historicalEvents = [2, 60, 464, 478];  // Historical rounds (baseline courses)
const similarEvents = [3, 7, 12, 23, 28];  // Similar iron/scoring courses
const puttingEvents = [3, 475];  // Putting-specific courses

const historical = [];
const similar = [];
const putting = [];

schefflerRounds.forEach(r => {
  const eventId = parseInt(r.event_id);
  
  if (historicalEvents.includes(eventId)) {
    historical.push(r);
  }
  if (similarEvents.includes(eventId)) {
    similar.push(r);
  }
  if (puttingEvents.includes(eventId)) {
    putting.push(r);
  }
});

console.log(`\nRound Breakdown:`);
console.log(`  Historical (events 1-2): ${historical.length}`);
console.log(`  Similar (events 1-5): ${similar.length}`);
console.log(`  Putting (events 3-7): ${putting.length}`);

// Calculate driving performance metric for each round
function calculateDrivingMetric(round) {
  // Driving Performance = (Fairways Hit / Fairways Attempted) * Weight
  // This is a placeholder - actual formula depends on the data structure
  const score = parseInt(round.score || 0);
  const par = parseInt(round.course_par || 72);
  const scoreDiff = score - par;
  
  // Simple approximation: score relative to par
  return -scoreDiff; // Negative score diff = good driving (under par)
}

// Calculate approach metrics
function calculateApproachMetrics(round) {
  const score = parseInt(round.score || 0);
  const par = parseInt(round.course_par || 72);
  const scoreDiff = score - par;
  const birdies = parseInt(round.birdies || 0);
  const bogies = parseInt(round.bogies || 0);
  const pars = parseInt(round.pars || 0);
  
  return {
    approaching: (birdies + pars - bogies) * 0.5,
    proximity: (birdies * 2 + pars - bogies) * 0.3
  };
}

// Calculate putting metric
function calculatePuttingMetric(round) {
  const birdies = parseInt(round.birdies || 0);
  const bogies = parseInt(round.bogies || 0);
  return (birdies - bogies) * 1.0;
}

// Calculate averages for each metric
const metrics = {
  driving: { historical: [], similar: [], putting: [] },
  approach: { historical: [], similar: [], putting: [] },
  putting: { historical: [], similar: [], putting: [] }
};

historical.forEach(r => {
  metrics.driving.historical.push(calculateDrivingMetric(r));
  const app = calculateApproachMetrics(r);
  metrics.approach.historical.push(app.approaching);
  metrics.putting.historical.push(calculatePuttingMetric(r));
});

similar.forEach(r => {
  metrics.driving.similar.push(calculateDrivingMetric(r));
  const app = calculateApproachMetrics(r);
  metrics.approach.similar.push(app.approaching);
  metrics.putting.similar.push(calculatePuttingMetric(r));
});

putting.forEach(r => {
  metrics.driving.putting.push(calculateDrivingMetric(r));
  const app = calculateApproachMetrics(r);
  metrics.approach.putting.push(app.approaching);
  metrics.putting.putting.push(calculatePuttingMetric(r));
});

// Calculate averages
function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

console.log(`\n=== SCHEFFLER METRIC AVERAGES ===\n`);

console.log(`Driving Performance:`);
console.log(`  Historical Avg: ${avg(metrics.driving.historical).toFixed(3)}`);
console.log(`  Similar Avg: ${avg(metrics.driving.similar).toFixed(3)}`);
console.log(`  Putting Avg: ${avg(metrics.driving.putting).toFixed(3)}`);

console.log(`\nApproach Performance:`);
console.log(`  Historical Avg: ${avg(metrics.approach.historical).toFixed(3)}`);
console.log(`  Similar Avg: ${avg(metrics.approach.similar).toFixed(3)}`);
console.log(`  Putting Avg: ${avg(metrics.approach.putting).toFixed(3)}`);

console.log(`\nPutting Performance:`);
console.log(`  Historical Avg: ${avg(metrics.putting.historical).toFixed(3)}`);
console.log(`  Similar Avg: ${avg(metrics.putting.similar).toFixed(3)}`);
console.log(`  Putting Avg: ${avg(metrics.putting.putting).toFixed(3)}`);

// Show distribution of similar round events
console.log(`\n=== ROUND DISTRIBUTION ===\n`);
const eventDist = {};
const eventNames = {};
schefflerRounds.forEach(r => {
  const eventId = parseInt(r.event_id);
  eventDist[eventId] = (eventDist[eventId] || 0) + 1;
  eventNames[eventId] = r.event_name;
});

console.log(`All events for Scheffler:`);
Object.keys(eventDist).sort((a,b) => parseInt(a) - parseInt(b)).forEach(eventId => {
  console.log(`  Event ${eventId} (${eventNames[eventId]}): ${eventDist[eventId]} rounds`);
});
