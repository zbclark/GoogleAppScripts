// utilities/logging.js
// Shared logging utility for context-aware log file creation
const fs = require('fs');
const path = require('path');

let ACTIVE_HANDLE = null;

/**
 * Sets up logging to a file in the specified output directory, with event and context in the filename.
 * Also mirrors output to the console.
 * @param {string} outputDir - Directory for log file
 * @param {string} eventName - Event name for log file naming
 * @param {string} context - Context string (e.g., pre, post, run)
 */
function teardownLogging() {
  if (ACTIVE_HANDLE && typeof ACTIVE_HANDLE.teardown === 'function') {
    try {
      ACTIVE_HANDLE.teardown();
    } catch (error) {
      // Ignore
    }
  }
  ACTIVE_HANDLE = null;
}

function setupLogging(outputDir, eventName, context, options = {}) {
  if (!outputDir) return null;
  if (ACTIVE_HANDLE) return ACTIVE_HANDLE;
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
  // IMPORTANT: keep the original function references so we can restore them exactly.
  // Do not use .bind() here, otherwise teardown would restore a different function identity.
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;

  let fileEnabled = true;
  let tornDown = false;

  const writeToFile = (chunk) => {
    if (!fileEnabled) return;
    try {
      fs.appendFileSync(logFile, chunk);
    } catch (error) {
      // If the log file cannot be written, stop trying.
      fileEnabled = false;
    }
  };

  process.stdout.write = (chunk, ...args) => {
    writeToFile(chunk);
    return origStdoutWrite.call(process.stdout, chunk, ...args);
  };
  process.stderr.write = (chunk, ...args) => {
    writeToFile(chunk);
    return origStderrWrite.call(process.stderr, chunk, ...args);
  };

  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    try {
      process.stdout.write = origStdoutWrite;
    } catch (error) {
      // Ignore
    }
    try {
      process.stderr.write = origStderrWrite;
    } catch (error) {
      // Ignore
    }

    // Allow future setupLogging(...) calls in the same process.
    if (ACTIVE_HANDLE && ACTIVE_HANDLE.teardown === teardown) {
      ACTIVE_HANDLE = null;
    }
  };

  const autoTeardown = options && Object.prototype.hasOwnProperty.call(options, 'autoTeardown')
    ? !!options.autoTeardown
    : true;
  if (autoTeardown) {
    // Best-effort restore on exit. (Note: exit handlers must be sync.)
    process.once('exit', teardown);
  }

  ACTIVE_HANDLE = { logFile, teardown };
  console.log(`Logging to ${logFile}`);
  return ACTIVE_HANDLE;
}

module.exports = { setupLogging, teardownLogging };
