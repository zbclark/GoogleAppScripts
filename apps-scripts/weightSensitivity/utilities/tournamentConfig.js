/**
 * Tournament Configuration Mapping
 * Maps eventId to data files and tournament names
 */

const path = require('path');

const TOURNAMENTS = {
  '2': {
    name: 'PGA West',
    configFile: 'PGA West (2026) - Configuration Sheet.csv',
    resultsFile: 'PGA West (2026) - Tournament Results.csv',
    fieldFile: 'PGA West (2026) - Tournament Field.csv',
    historyFile: 'PGA West (2026) - Historical Data.csv',
    approachFile: 'PGA West (2026) - Approach Skill.csv'
  },
  '6': {
    name: 'Sony Open',
    configFile: 'Sony Open (2026) - Configuration Sheet.csv',
    resultsFile: 'Sony Open (2026) - Tournament Results.csv',
    fieldFile: 'Sony Open (2026) - Tournament Field.csv',
    historyFile: 'Sony Open (2026) - Historical Data.csv',
    approachFile: 'Sony Open (2026) - Approach Skill.csv'
  }
};

/**
 * Get tournament configuration and file paths
 * @param {string} eventId - Event ID (e.g., '6' for Sony Open)
 * @param {string} dataDir - Data directory path
 * @returns {Object} Tournament config with file paths
 */
function getTournamentConfig(eventId, dataDir) {
  const tournament = TOURNAMENTS[eventId];
  
  if (!tournament) {
    throw new Error(`Unknown eventId: ${eventId}. Available: ${Object.keys(TOURNAMENTS).join(', ')}`);
  }

  return {
    eventId,
    name: tournament.name,
    configPath: path.resolve(dataDir, tournament.configFile),
    resultsPath: path.resolve(dataDir, tournament.resultsFile),
    fieldPath: path.resolve(dataDir, tournament.fieldFile),
    historyPath: path.resolve(dataDir, tournament.historyFile),
    approachPath: path.resolve(dataDir, tournament.approachFile)
  };
}

/**
 * Get all available tournament IDs
 */
function getAvailableTournaments() {
  return Object.keys(TOURNAMENTS).map(id => ({
    id,
    name: TOURNAMENTS[id].name
  }));
}

module.exports = {
  TOURNAMENTS,
  getTournamentConfig,
  getAvailableTournaments
};
