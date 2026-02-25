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
  if (!outputDir) return;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const safeEvent = String(eventName || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const logFile = path.join(outputDir, `${safeEvent}_${context}_log.txt`);
  try {
    fs.writeFileSync(logFile, '');
  } catch (error) {
    // Ignore
  }
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ...args) => {
    try {
      fs.appendFileSync(logFile, chunk);
    } catch (error) {
      // Ignore
    }
    origStdoutWrite(chunk, ...args);
  };
  process.stderr.write = (chunk, ...args) => {
    try {
      fs.appendFileSync(logFile, chunk);
    } catch (error) {
      // Ignore
    }
    origStderrWrite(chunk, ...args);
  };
  console.log(`Logging to ${logFile}`);
}

module.exports = { setupLogging };
