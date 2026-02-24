// Utility to collect historical records (shared)
const fs = require('fs');
const path = require('path');
const { loadCsv } = require('../utilities/csvLoader');

// Helper functions (minimal, for shared use)
const isHistoricalFile = (filePath) => filePath.toLowerCase().includes('historical data') && filePath.toLowerCase().endsWith('.csv');

const walkDir = (dir) => {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkDir(fullPath));
    } else {
      entries.push(fullPath);
    }
  });
  return entries;
};

const collectRecords = async ({ years = [], tours = [], dataDir, datagolfApiKey, datagolfCacheDir, datagolfHistoricalTtlMs, getDataGolfHistoricalRounds }) => {
  const allRows = [];
  // 1. Try CSVs in data dir
  if (dataDir && fs.existsSync(dataDir)) {
    const files = walkDir(dataDir).filter(isHistoricalFile);
    for (const filePath of files) {
      try {
        const rows = loadCsv(filePath, { skipFirstColumn: true })
          .filter(Boolean);
        allRows.push(...rows);
      } catch (err) {
        // Ignore
      }
    }
  }
  // 2. Optionally, try API if nothing found and key/years/tours provided
  if (allRows.length === 0 && datagolfApiKey && years.length && tours.length && getDataGolfHistoricalRounds) {
    for (const tour of tours) {
      for (const year of years) {
        try {
          const apiRows = await getDataGolfHistoricalRounds({
            apiKey: datagolfApiKey,
            cacheDir: datagolfCacheDir,
            ttlMs: datagolfHistoricalTtlMs,
            allowStale: true,
            tour,
            eventId: 'all',
            year,
            fileFormat: 'json'
          });
          if (Array.isArray(apiRows)) allRows.push(...apiRows);
        } catch (error) {
          // Ignore
        }
      }
    }
  }
  return allRows;
};

module.exports = collectRecords;
