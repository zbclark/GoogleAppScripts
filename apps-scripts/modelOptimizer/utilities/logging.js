// utilities/logging.js
// Shared logging utility for context-aware log file creation
const fs = require('fs');
const path = require('path');

/**
 * Sets up logging to a file in the specified output directory, with event and context in the filename.
 * Also mirrors output to the console.
 * @param {string} outputDir - Directory for log file
 * @param {string} eventName - Event name for log file naming
 * @param {string} context - Context string (e.g., pre, post, run)
 */
function setupLogging(outputDir, eventName, context) {
  const safeEvent = String(eventName || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const logFile = path.join(outputDir, `${safeEvent}_${context}_log.txt`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...args) => {
    logStream.write(chunk);
    origStdoutWrite(chunk, ...args);
  };
  process.stderr.write = (chunk, ...args) => {
    logStream.write(chunk);
    origStderrWrite(chunk, ...args);
  };
  console.log(`Logging to ${logFile}`);
}

module.exports = { setupLogging };
