// tournamentConfig.js
// Stub for tournament configuration utilities

const fs = require('fs');
const path = require('path');

/**
 * Helper to find a file in a directory matching any of several patterns.
 * @param {string} dirPath - Directory to search
 * @param {Array<string|RegExp>} patterns - Patterns to match filenames
 * @returns {string|null} Absolute path to the matching file or null
 */
function findFileByPattern(dirPath, patterns) {
  try {
    const files = fs.readdirSync(dirPath);
    for (const pattern of patterns) {
      const matchingFile = files.find(file => {
        if (typeof pattern === 'string') {
          return file.includes(pattern);
        } else if (pattern instanceof RegExp) {
          return pattern.test(file);
        }
        return false;
      });
      if (matchingFile) {
        return path.join(dirPath, matchingFile);
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  return null;
}

/**
 * Returns tournament configuration paths and metadata for a given eventId.
 * @param {string} eventId - Tournament event ID
 * @param {string} dataDir - Directory containing tournament data
 * @returns {object} Tournament config paths
 */
function getTournamentConfig(eventId, dataDir) {
  const dataDirPath = path.join(dataDir, 'data');
  // Find files by pattern
  const configPath = findFileByPattern(dataDirPath, ['Configuration Sheet', 'Config']);
  const historyPath = findFileByPattern(dataDirPath, ['Historical Data', 'History']);
  // Set resultsPath to historyPath (they are the same)
  const resultsPath = historyPath;
  const fieldPath = findFileByPattern(dataDirPath, ['Tournament Field', 'Field']);
  const approachPath = findFileByPattern(dataDirPath, ['Approach Skill', 'Approach']);

  return {
    configPath,
    resultsPath,
    fieldPath,
    historyPath,
    approachPath,
    eventId,
    tournamentName: `Tournament ${eventId}`
  };
}

module.exports = { getTournamentConfig, findFileByPattern };
