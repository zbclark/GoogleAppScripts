/**
 * Utilities: Data Loading
 * Consolidated data loading functions used across phases
 * 
 * Functions (from tournamentAnalysis.gs):
 * - listAvailableTournamentWorkbooks() - Find all tournament files
 * - loadTournamentPredictions() - Load from Player Ranking Model sheet
 * - loadTournamentResults() - Load from Tournament Results sheet
 * - loadTournamentConfig() - Load from Configuration Sheet
 * - validateSingleTournament() - Single tournament validation
 * - validateAllTournaments() - All tournaments validation
 */

const GOLF_DATA_YEAR_KEY = "GOLF_DATA_YEAR";
const DEFAULT_GOLF_DATA_YEAR = "2025";

function getGolfDataYear() {
  const props = PropertiesService.getScriptProperties();
  const storedYear = props.getProperty(GOLF_DATA_YEAR_KEY);
  if (storedYear && /^\d{4}$/.test(storedYear)) {
    return storedYear;
  }
  return DEFAULT_GOLF_DATA_YEAR;
}

function setGolfDataYear(year) {
  const normalized = String(year || "").trim();
  if (!/^\d{4}$/.test(normalized)) {
    throw new Error("Year must be a 4-digit value (e.g., 2025)");
  }
  PropertiesService.getScriptProperties().setProperty(GOLF_DATA_YEAR_KEY, normalized);
  return normalized;
}

function getGolfFolderName() {
  return `Golf ${getGolfDataYear()}`;
}

function configureGolfDataYear() {
  const ui = SpreadsheetApp.getUi();
  const currentYear = getGolfDataYear();
  const response = ui.prompt(
    "Set Golf Data Year",
    `Enter the 4-digit year for the Drive folder (current: ${currentYear})`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return null;
  }

  const enteredYear = response.getResponseText();
  try {
    const updatedYear = setGolfDataYear(enteredYear);
    ui.alert(`✅ Golf data year set to ${updatedYear} (folder: Golf ${updatedYear})`);
    return updatedYear;
  } catch (e) {
    ui.alert(`❌ ${e.message}`);
    return null;
  }
}

/**
 * Lists all tournament workbooks in the selected Golf folder
 */
function listAvailableTournamentWorkbooks() {
  try {
    const folderName = getGolfFolderName();
    const folders = DriveApp.getFoldersByName(folderName);
    
    if (!folders.hasNext()) {
      return { error: `${folderName} folder not found in Google Drive` };
    }
    
    const golfFolder = folders.next();
    const files = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    const tournaments = [];
    
    while (files.hasNext()) {
      const file = files.next();
      tournaments.push({
        name: file.getName(),
        id: file.getId(),
        url: file.getUrl(),
        lastModified: file.getLastUpdated()
      });
    }
    
    tournaments.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      count: tournaments.length,
      tournaments: tournaments,
      folderUrl: golfFolder.getUrl(),
      folderName: folderName
    };
  } catch (e) {
    return { error: `Error accessing Google Drive: ${e.message}` };
  }
}

/**
 * Loads predictions from a tournament workbook
 */
function loadTournamentPredictions(fileId, sheetName = "Player Ranking Model") {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { error: `Sheet "${sheetName}" not found` };
    }
    
    const data = sheet.getRange("C6:D" + sheet.getLastRow()).getValues();
    
    console.log(`Loading predictions from ${sheetName}: lastRow=${sheet.getLastRow()}, dataRows=${data.length}`);
    if (data.length > 0) {
      console.log(`First prediction row: ${JSON.stringify(data[0])}`);
    }
    
    const predictions = data
      .map((row, idx) => ({
        rank: idx + 1,
        dgId: String(row[0]).trim(),
        name: String(row[1]).trim()
      }))
      .filter(p => p.dgId && p.dgId !== "" && p.name && p.name !== "")
      .slice(0, 150);
    
    console.log(`Loaded ${predictions.length} predictions`);
    
    return {
      count: predictions.length,
      predictions: predictions
    };
  } catch (e) {
    return { error: `Error loading predictions: ${e.message}` };
  }
}

/**
 * Loads actual results from a tournament workbook
 */
function loadTournamentResults(fileId, sheetName = "Tournament Results") {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { error: `Sheet "${sheetName}" not found` };
    }
    
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange("B6:E" + lastRow).getValues();
    
    const results = data
      .map(row => {
        const dgId = String(row[0]).trim();
        const name = String(row[1]).trim();
        const finishStr = String(row[2]).trim();
        const finishFromCol = parseFinishPositionValue(row[3]);
        const finish = finishFromCol !== null ? finishFromCol : parseFinishPositionValue(finishStr);
        return { dgId, name, finishStr, finish };
      })
      .filter(r => r.dgId && r.dgId !== "")
      .slice(0, 200);
    
    console.log(`Loaded ${results.length} results`);
    
    return {
      count: results.length,
      results: results
    };
  } catch (e) {
    return { error: `Error loading results: ${e.message}` };
  }
}

function parseFinishPositionValue(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'CUT' || raw === 'WD' || raw === 'DQ') return null;
  if (raw.startsWith('T')) {
    const parsed = parseInt(raw.substring(1), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (/^(\d+)T$/.test(raw)) {
    const match = raw.match(/^(\d+)T$/);
    const parsed = match ? parseInt(match[1], 10) : NaN;
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function rankValues(values) {
  const entries = values.map((value, index) => ({ value, index }));
  entries.sort((a, b) => a.value - b.value);

  const ranks = Array(values.length);
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1].value === entries[i].value) {
      j += 1;
    }
    const avgRank = (i + j + 2) / 2; // 1-based rank average for ties
    for (let k = i; k <= j; k += 1) {
      ranks[entries[k].index] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function calculatePearsonCorrelation(xValues, yValues) {
  if (xValues.length === 0) return 0;
  const n = xValues.length;
  const meanX = xValues.reduce((a, b) => a + b, 0) / n;
  const meanY = yValues.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

function calculateSpearmanCorrelation(xValues, yValues) {
  if (!Array.isArray(xValues) || !Array.isArray(yValues)) return 0;
  if (xValues.length === 0 || xValues.length !== yValues.length) return 0;
  const rankedX = rankValues(xValues);
  const rankedY = rankValues(yValues);
  return calculatePearsonCorrelation(rankedX, rankedY);
}

function buildFinishPositionMap(results) {
  const positions = (results || [])
    .map(result => result?.finish)
    .filter(value => typeof value === 'number' && !Number.isNaN(value));
  const fallback = positions.length ? Math.max(...positions) + 1 : null;
  const map = new Map();

  (results || []).forEach(result => {
    const dgId = String(result?.dgId || '').trim();
    if (!dgId) return;
    const rawValue = result?.finish;
    const finishPosition = typeof rawValue === 'number' && !Number.isNaN(rawValue)
      ? rawValue
      : fallback;
    if (typeof finishPosition === 'number' && !Number.isNaN(finishPosition)) {
      map.set(dgId, finishPosition);
    }
  });

  return { map, fallback };
}

function calculateTopNHitRate(predictions, resultsById, n) {
  if (!predictions || !predictions.length || !resultsById || resultsById.size === 0) return 0;
  const sorted = [...predictions].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const topPredicted = sorted.slice(0, n);
  const matches = topPredicted.filter(pred => {
    const finish = resultsById.get(String(pred.dgId));
    return typeof finish === 'number' && !Number.isNaN(finish) && finish <= n;
  }).length;
  return topPredicted.length ? (matches / topPredicted.length) * 100 : 0;
}

function calculateRmse(predicted, actual) {
  if (!predicted.length || predicted.length !== actual.length) return 0;
  const sumSq = predicted.reduce((sum, value, idx) => sum + Math.pow(value - actual[idx], 2), 0);
  return Math.sqrt(sumSq / predicted.length);
}

function evaluateTournamentPredictions(predictions, results) {
  const { map: resultsById } = buildFinishPositionMap(results);
  const matchedPlayers = [];
  const predictedRanks = [];
  const actualFinishes = [];

  (predictions || []).forEach((pred, idx) => {
    const finish = resultsById.get(String(pred.dgId));
    if (typeof finish !== 'number' || Number.isNaN(finish)) return;
    const rankValue = typeof pred.rank === 'number' ? pred.rank : (idx + 1);
    predictedRanks.push(rankValue);
    actualFinishes.push(finish);
    matchedPlayers.push({
      name: pred.name,
      predictedRank: rankValue,
      actualFinish: finish,
      error: Math.abs(rankValue - finish)
    });
  });

  if (predictedRanks.length === 0) {
    return {
      matchedPlayers: [],
      metrics: {
        spearman: 0,
        rmse: 0,
        top5: 0,
        top10: 0,
        top20: 0,
        top50: 0
      }
    };
  }

  return {
    matchedPlayers,
    metrics: {
      spearman: calculateSpearmanCorrelation(predictedRanks, actualFinishes),
      rmse: calculateRmse(predictedRanks, actualFinishes),
      top5: calculateTopNHitRate(predictions, resultsById, 5),
      top10: calculateTopNHitRate(predictions, resultsById, 10),
      top20: calculateTopNHitRate(predictions, resultsById, 20),
      top50: calculateTopNHitRate(predictions, resultsById, 50)
    }
  };
}

/**
 * Loads configuration from a tournament workbook
 */
function loadTournamentConfig(fileId) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const configSheet = ss.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      return { error: "Configuration Sheet not found" };
    }
    
    // Read config data
    const config = {
      eventId: configSheet.getRange("G9").getValue(),
      courseType: configSheet.getRange("G10").getValue(),
      courseName: configSheet.getRange("G11").getValue()
    };
    
    return config;
  } catch (e) {
    return { error: `Error loading config: ${e.message}` };
  }
}

/**
 * Validates a single tournament's predictions vs actual results
 */
function validateSingleTournament(fileId, tournamentName) {
  try {
    const predictions = loadTournamentPredictions(fileId);
    const results = loadTournamentResults(fileId);
    
    if (predictions.error || results.error) {
      return { error: predictions.error || results.error };
    }
    
    const evaluation = evaluateTournamentPredictions(predictions.predictions, results.results);
    const matchedPlayers = evaluation.matchedPlayers || [];

    return {
      tournament: tournamentName,
      totalMatched: matchedPlayers.length,
      spearman: evaluation.metrics.spearman,
      rmse: evaluation.metrics.rmse,
      top5: evaluation.metrics.top5,
      top10: evaluation.metrics.top10,
      top20: evaluation.metrics.top20,
      top50: evaluation.metrics.top50,
      matchedPlayers: matchedPlayers
    };
  } catch (e) {
    return { error: `Error validating tournament: ${e.message}` };
  }
}

/**
 * Validates all tournaments
 */
function validateAllTournaments() {
  try {
    const available = listAvailableTournamentWorkbooks();
    
    if (available.error) {
      return { error: available.error };
    }
    
    const results = [];
    available.tournaments.forEach(tournament => {
      const validation = validateSingleTournament(tournament.id, tournament.name);
      if (!validation.error) {
        results.push(validation);
      }
    });
    
    return {
      totalTournaments: results.length,
      results: results
    };
  } catch (e) {
    return { error: `Error validating all tournaments: ${e.message}` };
  }
}
