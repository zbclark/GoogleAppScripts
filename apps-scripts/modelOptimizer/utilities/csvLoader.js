// Utility to load and parse CSV files for local model testing
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

/**
 * Load and parse a CSV file into an array of objects.

 * Optionally specify the header row index (0-based) and skipFirstColumn (true/false).
 * @param {string} filePath - Absolute or relative path to the CSV file
 * @param {object} [options] - { headerRow: number, skipFirstColumn: boolean, ...csv-parse options }
 * @returns {Array<object>} Parsed data
 */
function loadCsv(filePath, options = {}) {
    const absPath = path.resolve(filePath);
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split(/\r?\n/);
    
  // Default header row is 5 (index 4) - look for the line with actual column names
  let headerLineIdx = 4;
  if (typeof options.headerRow === 'number') {
    headerLineIdx = options.headerRow;
  } else {
    // Auto-detect: prefer the line that starts with dg_id (optionally after a leading comma)
    let detectedIdx = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^,?\s*dg_id,/.test(line)) {
        detectedIdx = i;
        break;
      }
    }
    if (detectedIdx === null) {
      // Fallback: find the first line that contains 'dg_id' or 'player_name'
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('dg_id') || line.includes('player_name')) {
          detectedIdx = i;
          break;
        }
      }
    }
    if (detectedIdx !== null) {
      headerLineIdx = detectedIdx;
    }
  }
  // Optionally remove first column from all rows
  let processedLines = lines.slice(headerLineIdx);
  if (options.skipFirstColumn) {
    processedLines = processedLines.map(line => {
      // Remove first column (up to first comma)
      const idx = line.indexOf(',');
      return idx === -1 ? '' : line.slice(idx + 1);
    });
  }

  processedLines = processedLines.filter(line => {
    if (!line) return false;
    const trimmed = String(line).trim();
    if (!trimmed) return false;
    // Treat comma-only rows as empty
    const contentOnly = trimmed.replace(/,+/g, '').trim();
    return contentOnly.length > 0;
  });
  // Print processed header line for diagnostics
  const trimmedContent = processedLines.join('\n');
  const parseOpts = { ...options };
  delete parseOpts.headerRow;
  delete parseOpts.skipFirstColumn;
  const records = parse(trimmedContent, {
    columns: true,
    skip_empty_lines: true,
    ...parseOpts
  });
  return records;
}

module.exports = { loadCsv };