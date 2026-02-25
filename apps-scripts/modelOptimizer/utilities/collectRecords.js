// Utility to collect historical records (shared)
const fs = require('fs');
const path = require('path');
const { loadCsv } = require('./csvLoader');
const { extractHistoricalRowsFromSnapshotPayload } = require('./extractHistoricalRows');

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

const collectRecords = async ({
  years = [],
  tours = [],
  dataDir,
  datagolfApiKey,
  datagolfCacheDir,
  datagolfHistoricalTtlMs,
  getDataGolfHistoricalRounds,
  includeApi = false,
  preferApi = false
}) => {
  const allRows = [];
  const shouldFetchApi = years.length && tours.length && getDataGolfHistoricalRounds;

  const fetchApiRows = async () => {
    for (const tour of tours) {
      for (const year of years) {
        try {
          const apiSnapshot = await getDataGolfHistoricalRounds({
            apiKey: datagolfApiKey,
            cacheDir: datagolfCacheDir,
            ttlMs: datagolfHistoricalTtlMs,
            allowStale: true,
            tour,
            eventId: 'all',
            year,
            fileFormat: 'json'
          });
          const apiRows = extractHistoricalRowsFromSnapshotPayload(apiSnapshot?.payload);
          if (apiRows.length > 0) allRows.push(...apiRows);
        } catch (error) {
          // Ignore
        }
      }
    }
  };

  if (shouldFetchApi && preferApi) {
    await fetchApiRows();
  }

  if (!preferApi && dataDir && fs.existsSync(dataDir)) {
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

  if ((allRows.length === 0 || includeApi) && shouldFetchApi && !preferApi) {
    await fetchApiRows();
  }

  if (preferApi && allRows.length === 0 && dataDir && fs.existsSync(dataDir)) {
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

  return allRows;
};

module.exports = collectRecords;
