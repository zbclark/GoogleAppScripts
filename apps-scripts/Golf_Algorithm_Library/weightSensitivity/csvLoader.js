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
    
  let headerLineIdx = 4;
  if (typeof options.headerRow === 'number') {
    headerLineIdx = options.headerRow;
  } else {
    // Fallback: auto-detect as before
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.split(',').length > 5 && !/^\s*#/.test(line)) {
        headerLineIdx = i;
        break;
      }
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