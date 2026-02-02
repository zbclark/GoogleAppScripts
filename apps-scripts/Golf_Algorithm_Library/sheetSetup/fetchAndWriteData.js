/**
 * Constants
 */

const DEBUG = true;
const DEBUG_VERBOSE = true;
const BATCH_SIZE = 100; // Adjust the batch size as needed
const TOURNAMENTS_BATCH_SIZE = 50;
const MAX_RUNTIME = 300000; // 5 minutes max runtime

// API call settings - CRITICAL for preventing timeouts
const API_CALL_DELAY_MS = 3000; // 3 seconds between API calls (increased from 1 second for stability)
const API_TIMEOUT_MS = 30000; // 30 second timeout per API call
const SHEET_WRITE_DELAY_MS = 500; // Delay between batch writes

const PERIOD_MAPPING= {
  'last 3 months': 'l12',
  'last 6 months': 'l12',
  'last 12 months': 'l12',
  'last 24 months': 'l24'
};

const DATE_RANGES= {
  'last 3 months': 3,
  'last 6 months': 6,
  'last 12 months': 12,
  'last 24 months': 24
};

// Use MAIN_HEADERS in all functions instead of redefining
const MAIN_HEADERS = Object.freeze([
  "dg_id", "player_name", "tour", "season", "year",
  "event_id", "event_name", "event_completed", "course_name", "course_num", "fin_text",
  "course_par", "round_num", "start_hole", "teetime", "score", 
  "birdies", "bogies", "pars", "eagles_or_better", "doubles_or_worse",
  "driving_acc", "driving_dist", "gir", "scrambling",
  "great_shots", "poor_shots", "prox_fw", "prox_rgh",
  "sg_total", "sg_t2g", "sg_app", "sg_arg", "sg_ott", "sg_putt",
  "sg_categories", "traditional_stats"
]);

/**************************
*   Configuration Sheet Setup
**************************/
// Map sheet names to status cells (Configuration Sheet)
const STATUS_MAP = {
  "Tournament Field": "F2",
  "Approach Skill": "F3",
  "Historical Data": "F4",
  "ALL Tournaments": "F5",
  "PGA Tournaments" : "F6",
  "Similar Courses" : "F7"
};

/**************************
*   Enhanced Status Handler
**************************/
function updateCentralStatus(sheetName, status) {
  const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
  if (!configSheet) return;

  const cellRef = STATUS_MAP[sheetName];
  if (!cellRef) return;

  const statusRange = configSheet.getRange(cellRef);
  const props = PropertiesService.getDocumentProperties();
  const now = new Date();
  const timeZone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();

  try {
    switch(true) {
      case status === 'start':
        statusRange
          .setValue("Updating...")
          .setBackground("#FFF2CC");
          SpreadsheetApp.flush();
        break;

      case status === true:
        
        const formattedDate = Utilities.formatDate(now, timeZone, "M/d/yyyy h:mm a");
        
        // Update display and store in properties
        statusRange
          .setValue(`Last Update - Success: ${formattedDate}`)
          .setNumberFormat("m/d/yyyy h:mm AM/PM")
          .setBackground(null);
          SpreadsheetApp.flush();
        
        props.setProperty(sheetName, now.toISOString());
        break;

      case status === false: // Failure
        const lastSuccess = props.getProperty(sheetName);
        const displayDate = lastSuccess ? 
          Utilities.formatDate(new Date(lastSuccess), timeZone, "M/d/yyyy h:mm a") : "Never";
        
        statusRange
          .setValue(`Update Failed; Last Success: ${displayDate}`)
          .setBackground("#FFCCCC");
          SpreadsheetApp.flush();
        props.setProperty(sheetName+"_ERROR", now.toISOString());
        break;

      case typeof status === 'string':
        statusRange
          .setValue(status)
          .setBackground("#E3F2FD"); // Light blue for progress
        break;
      }
  } catch (error) {
    Logger.log(`Status update error for ${sheetName}: ${error}`);
  }
}

// Main function to calculate date range
function calculateDateRange(period) {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999); // End of day
  
  // Get month offset from lookup table
  const monthsBack = DATE_RANGES[period];
  if (!monthsBack) {
    Logger.log('Invalid period selected');
    return null;
  }

  // Calculate start date (more precise calculation)
  const startDate = new Date(today);
  startDate.setMonth(today.getMonth() - monthsBack);
  startDate.setDate(1); // Always start on first day of month
  startDate.setHours(0, 0, 0, 0); // Start of day

  // Handle edge cases (e.g. month with fewer days)
  if (startDate > endDate) {
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setDate(1);
  }

  logDebug(`Period: ${period} => Start: ${Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd")} | End: ${Utilities.formatDate(endDate, Session.getScriptTimeZone(), "yyyy-MM-dd")}`);
  
  return { 
    startDate, 
    endDate,
    periodCode: PERIOD_MAPPING[period] // Add the API period code
  };
}

/**
 * Logs debug messages when DEBUG is true.
 * @param {string} message - The message to log.
 */
function logDebug(message) {
  if (DEBUG) {
    //Logger.log(message);
    console.log(message);
  }
}

/**
 * Delays execution for the specified number of milliseconds.
 * Note: This function is synchronous in nature due to Utilities.sleep.
 * @param {number} ms - Milliseconds to delay.
 * @return {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => {
    Utilities.sleep(ms); // Pauses the script for 'ms' milliseconds.
    resolve();
  });
}

/**
 * Fetches and processes data from the given API endpoint.
 * @param {string} endpoint - The API endpoint URL.
 * @return {Array<Array<any>>} - Processed data ready for the sheet.
 * @throws Will throw an error if the API request fails or data parsing fails.
 */
async function APIDATA(endpoint) {
  try {
    logDebug("Starting API request to: " + endpoint);
    const response = UrlFetchApp.fetch(endpoint, { muteHttpExceptions: true });

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    logDebug("Response text length: " + responseText.length);

    if (responseCode !== 200) {
      throw new Error("API request failed with status " + responseCode + ": " + responseText);
    }

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
      logDebug("Parsed data as JSON: " + JSON.stringify(data));
    } catch (e) {
      // If it's not JSON, use parseEventData
      data = parseEventData(responseText);
      logDebug("Parsed data using parseEventData: " + JSON.stringify(data));
    }

    if (data === undefined) {
      throw new Error("Unexpected data format received from API");
    }

    logDebug("Data structure detected for processing.");
    const processedData = processData(data);

    logDebug("Data processed successfully.");
    return processedData;
  } catch (error) {
    Logger.log("Error in APIDATA: " + error.toString());
    throw error; // Propagate the error to be handled by the caller
  }
}

/**
 * Creates a data row array based on event, player, and round information.
 * @param {Object} data - The data object, which can be either event/player or round information.
 * @param {Set<string>} headerColumns - The set of unique header columns.
 * @return {Array<any>} - Mapped data row.
 */
function createRow(data, headerColumns) {
  logDebug(`Creating row with .stringify(data)}`);

  const row = [];

  for (const column of headerColumns) {
    if (data.hasOwnProperty(column)) {
      if (column === 'pga_number') {
        row.push(data[column] ? data[column].toString() : '');
      } else {
        row.push(data[column] || '');
      }
    } else {
      row.push('');
    }
  }

  return row;
}

/**
 * Parses raw event data from the API.
 * @param {string} text - The raw response text from the API.
 * @return {Object} - Parsed data object.
 */
function parseEventData(text) {
  var lines = text.split('\n');
  var eventData = {};
  var currentPlayer = null;

  lines.forEach(line => {
    var parts = line.split(':');
    if (parts.length < 2) return;

    var key = parts[0].trim();
    var value = parts.slice(1).join(':').trim();

    if (key === 'event number') eventData.event_id = value;
    else if (key === 'event name') eventData.event_name = value;
    else if (key === 'tour') eventData.tour = value;
    else if (key === 'event completed') eventData.event_completed = value;
    else if (key === 'year') eventData.year = parseInt(value);
    else if (key === 'season') eventData.season = parseInt(value);
    else if (key === 'sg categories') eventData.sg_categories = value;
    else if (key === 'fin_text' && currentPlayer) currentPlayer.fin_text = value;
    else if (/^\d+\./.test(key)) {
      if (currentPlayer) {
        if (!eventData.scores) eventData.scores = [];
        eventData.scores.push(currentPlayer);
      }
      var playerId = parseInt(key.split('.')[0]);
      currentPlayer = { dg_id: playerId, player_name: value };
    }
    else if (currentPlayer) {
      if (key.startsWith('round')) {
        var roundNum = key.split(' ')[1];
        try {
          currentPlayer[`round_${roundNum}`] = JSON.parse(value);
        } catch (e) {
          currentPlayer[`round_${roundNum}`] = {};
        }
      } else {
        currentPlayer[key] = value;
      }
    }
  });

  if (currentPlayer) {
    if (!eventData.scores) eventData.scores = [];
    eventData.scores.push(currentPlayer);
  }

  return eventData;
}

// Helper function for tournament field data (updated version)
function processTournamentFieldData(data) {
  const rows = [];
  const headerColumns = new Set();
  data.field.forEach((player) => {
    Object.keys(player).forEach((key) => {
      if (typeof player[key] !== 'object') {
        headerColumns.add(key);
      }
    });
  });
  rows.push(expectedHeaders || [
    "dg_id",
    "player_name",
    "am", 
    "event_name",
    "course_name",
    "course",
    "early_late",
    "pga_number",
    "current_round",
    "start_hole",
    "r1_teetime",
    "r2_teetime",
    "r3_teetime",
    "r4_teetime",
    "unofficial",
  ]);
  data.field.forEach((player) => {
    rows.push(createRowWithExpectedHeaders(player, rows[0]));
  });
  return rows;
}

/**
 * Processes fetched data, handling all supported data types
 * @param {Object|Array<Array<any>>} data - Input data (object or array of arrays)
 * @param {Array<string>} [expectedHeaders] - Optional headers for partial data
 * @returns {Array<Array<any>>} Processed data array with headers as first row
 */
function processData(data) {
  const rows = [];
  logDebug(`Processing data type: ${typeof data}`);

  // Handle array-based partial data
  if (Array.isArray(data)) {
    logDebug('Processing partial data array');
    return processPartialData(data);
  }

  // Handle object-based complete data
  if (typeof data === 'object' && data !== null) {
    // Tournament field data
    if (data.field && Array.isArray(data.field)) {
      logDebug('Processing tournament field data');
      return processTournamentField(data);
    }

    // Historical round data
    if (data.scores && Array.isArray(data.scores)) {
      logDebug('Processing historical round data');
      return processHistoricalRounds(data);
    }
  }

  logDebug('Unsupported data format');
  return [['Unsupported data format']];
}

// Helper function for partial data (array of arrays)
function processPartialData(data) {
  const headers = MAIN_HEADERS;
  const rows = [headers];
  
  data.forEach((row, index) => {
    if (index === 0 && !headers) return; // Skip header row if using built-in headers
    
    const cleanRow = headers.map((header, i) => {
      const value = row[i] || '';
      return typeof value === 'string' ? value.trim() : value;
    });
    
    if (cleanRow.some(cell => cell !== '')) {
      rows.push(cleanRow);
    }
  });
  
  logDebug(`Processed ${rows.length - 1} partial data rows`);
  return rows;
}

// Helper function for historical round data (updated version)
function processHistoricalRounds(data) {
  const headers = MAIN_HEADERS;
  const rows = [headers];

  // Process the event date once at the top level
  let eventDate = '';
  try {
    if (data.event_completed) {
      eventDate = Utilities.formatDate(new Date(data.event_completed), Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (data.event_date) {
      eventDate = Utilities.formatDate(new Date(data.event_date), Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  } catch (e) {
    console.log(`Date formatting error: ${e.message}`);
    eventDate = '';
  }

  // Process each player
  data.scores.forEach(playerScore => {
    // Find all round keys (round_1, round_2, etc.)
    const roundKeys = Object.keys(playerScore)
      .filter(key => key.startsWith('round_'));
    
    // Process each round
    roundKeys.forEach(roundKey => {
      const round = playerScore[roundKey];
      const roundNum = parseInt(roundKey.split('_')[1]);
      
      if (!round) {
        console.log(`Empty round data for ${playerScore.player_name}, round ${roundNum}`);
        return; // Skip this round
      }

      const row = [
        playerScore.dg_id,
        playerScore.player_name,
        data.tour,
        data.season, 
        data.year,
        data.event_id,
        data.event_name,
        eventDate,  // Using the date we processed at the top level
        round.course_name || '',
        round.course_num || '',
        playerScore.fin_text || '',
        round.course_par || 0,
        roundNum,
        round.start_hole || '',
        round.teetime || '',
        round.score || 0,
        round.birdies || 0,
        round.bogies || 0,
        round.pars || 0,
        round.eagles_or_better || 0,
        round.doubles_or_worse || 0,
        round.driving_acc || 0,
        round.driving_dist || 0,
        round.gir || 0,
        round.scrambling || 0,
        round.great_shots || 0,
        round.poor_shots || 0,
        round.prox_fw || 0,
        round.prox_rgh || 0,
        round.sg_total || 0,
        round.sg_t2g || 0,
        round.sg_app || 0,
        round.sg_arg || 0,
        round.sg_ott || 0,
        round.sg_putt || 0,
        data.sg_categories || '',
        data.traditional_stats || ''
      ];
      rows.push(row);
    });
  });

  // Sort the rows
  rows.sort((a, b) => {
    // 1. Primary sort: Event date (newest first)
    const dateCompare = b[7].localeCompare(a[7]);
    if (dateCompare !== 0) return dateCompare;
    
    // 2. Secondary sort: Event ID
    const eventCompare = a[5] - b[5]; 
    if (eventCompare !== 0) return eventCompare;

    // 3. Position sort
    const positionCompare = a[10].localeCompare(b[10]);
    if (positionCompare !== 0) return positionCompare;

    // 4. Player ID sort
    const playerCompare = a[0] - b[0]; 
    if (playerCompare !== 0) return playerCompare;

    // 5. Round number sort (ascending)
    return a[12] - b[12]; 
  });

  return rows;
}



function createRowWithExpectedHeaders(data, expectedHeaders) {
  const row = [];

  for (const header of expectedHeaders) {
    if (data.hasOwnProperty(header)) {
      if (header === 'pga_number') {
        row.push(data[header] ? data[header].toString() : '');
      } else {
        row.push(data[header] || '');
      }
    } else {
      row.push('');
    }
  }

  // Check if the row has any non-empty values
  if (row.some((value) => value !== '')) {
    logDebug("Created row: " + JSON.stringify(row));
    return row;
  } else {
    logDebug("Skipping empty row.");
    return null;
  }
}

/**
 * Maps partial/invalid data to headers with type conversion and validation
 * @param {Object|Array} partialData - Raw data from API
 * @param {Array<string>} headers - Expected column headers
 * @return {Array<any>|null} - Mapped row or null if invalid
 */
function mapPartialDataToHeaders(partialData) {
  const headers = MAIN_HEADERS;
  const mappedRow = new Array(headers.length).fill('');
  const fieldErrors = [];
  let mappedFieldCount = 0;

  try {
    headers.forEach((header, index) => {
      try {
        // 1. Get raw value with fallbacks
        let rawValue = partialData[header] ?? '';
        
        // 2. Handle special cases
        if (header === 'event_completed' && !rawValue) {
          rawValue = partialData.event_date || '';
        }

        // 3. Convert value
        const convertedValue = convertValueType(header, rawValue);
        mappedRow[index] = convertedValue;
        mappedFieldCount++;

        // Verbose logging for individual fields
        if (DEBUG_VERBOSE) {
          logDebug(`Mapped ${header}: ${rawValue} → ${convertedValue}`);
        }

      } catch (fieldError) {
        fieldErrors.push(`${header}: ${fieldError.message}`);
        mappedRow[index] = '';
      }
    });

    // Consolidated row status logging
    const validationPassed = validateRequiredFields(mappedRow, headers);
    const statusSymbol = validationPassed ? "✅" : "❌";
    const statusMessage = validationPassed 
      ? `Complete (${mappedFieldCount}/${headers.length} fields)`
      : `Failed - ${fieldErrors.length} errors`;

    if (DEBUG_VERBOSE) {
      logDebug(`${statusSymbol} Row ${validationPassed ? '' : 'NOT '}Valid | ${statusMessage}`);
    }

    if (DEBUG_VERBOSE) {
      logDebug(`Sample Data: ${mappedRow.slice(0, 5).join(' | ')}...`);
    }

    if (!validationPassed && fieldErrors.length > 0) {
      logDebug(`Field Errors: ${fieldErrors.join(' | ')}`);
    }

    return validationPassed ? mappedRow : null;

  } catch (error) {
    logDebug(`💥 Critical Row Processing Error: ${error.message}`);
    return null;
  }
}


// New helper function
function flattenObject(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix ? `${prefix}_` : '';
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      Object.assign(acc, flattenObject(obj[key], pre + key));
    } else {
      acc[pre + key] = obj[key];
    }
    return acc;
  }, {});
}


// Helper functions
function convertValueType(header, value) {
  const numericFields = ['dg_id', 'season', 'year', 'round_num', 'score', 
                        'birdies', 'bogies', 'pars', 'eagles_or_better', 
                        'doubles_or_worse'];
  const decimalFields = ['driving_acc', 'gir', 'scrambling', 'prox_fw', 
                        'prox_rgh', 'sg_total', 'sg_t2g', 'sg_app', 
                        'sg_arg', 'sg_ott', 'sg_putt'];

  if (numericFields.includes(header)) {
    return Number(value) || 0;
  }
  if (decimalFields.includes(header)) {
    return parseFloat(value)?.toFixed(3) || '0.000';
  }
  if (header === 'driving_dist') {
    return parseFloat(value)?.toFixed(1) || '0.0';
  }
  if (header === 'event_completed') {
    return formatDate(value);
  }
  if (header === 'fin_text') {
    return value?.toString() || ''; // No trimming
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value?.toString()?.trim() || '';
}

function findNestedValue(obj, header) {
  const variations = [
    header,
    header.toLowerCase(),
    header.replace(/_/g, ''),
    header.replace(/_/g, ' '),
    header.replace(/ /g, '_')
  ];

  for (const variant of variations) {
    if (obj.hasOwnProperty(variant)) return obj[variant];
  }
  
  // Search nested objects
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const nestedValue = findNestedValue(obj[key], header);
      if (nestedValue !== undefined) return nestedValue;
    }
  }
  
  return undefined;
}

function formatDate(value) {
  try {
    const date = new Date(value);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    return '';
  }
}

function validateRequiredFields(row, headers) {
  const requiredMap = new Map([
    ['dg_id', { types: ['number'], index: headers.indexOf('dg_id') }],
    ['player_name', { types: ['string'], index: headers.indexOf('player_name') }],
    ['event_id', { types: ['string', 'number'], index: headers.indexOf('event_id') }],
    ['round_num', { types: ['number'], index: headers.indexOf('round_num') }]
  ]);

  return Array.from(requiredMap).every(([field, { types, index }]) => {
    if (index === -1) {
      logDebug(`Missing required header: ${field}`);
      return false;
    }

    const value = row[index];
    let isValid = false;

    // Type checking
    if (types.includes('number')) {
      isValid = typeof value === 'number' && !isNaN(value);
    }
    if (types.includes('string')) {
      isValid = typeof value === 'string' && value.trim() !== '';
    }

    // Special case handling
    if (types.includes('number') && typeof value === 'string') {
      isValid = !isNaN(value) && value !== '';
    }

    if (!isValid) {
      logDebug(`Invalid ${field}: ${value} (${typeof value})`);
    }

    return isValid;
  });
}

/**
 * Retrieves selected tours from the "Configuration Sheet".
 * @return {Array<string>} - An array of selected tour identifiers.
 */
function getTourSelection() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Configuration Sheet"); // Replace with your sheet name
    if (!sheet) {
      throw new Error("Configuration Sheet not found.");
    }

    var selectedTours = [];
    
    var checkboxRange = sheet.getRange("B3:B31"); // Adjust based on your sheet layout
    var tourRange = sheet.getRange("C3:C31"); // Corresponding tour names
    
    var checkboxValues = checkboxRange.getValues();
    var tourValues = tourRange.getValues();
    
    for (var i = 0; i < checkboxValues.length; i++) {
      if (checkboxValues[i][0] === true) { // If checkbox is checked
        if (tourValues[i] && tourValues[i][0]) {
          selectedTours.push(tourValues[i][0].toString());
        }
      }
    }
    
    // If no tours are selected, return all available tours
    if (selectedTours.length === 0) {
      selectedTours = tourValues.map(row => row[0].toString()).filter(tour => tour);
      logDebug("No tours selected. Defaulting to all tours: " + selectedTours.join(", "));
    } else {
      logDebug("Selected tours: " + selectedTours.join(", "));
    }
    
    return selectedTours;
  } catch (error) {
    Logger.log("Error in getTourSelection: " + error.message);
    return []; // Return empty array on error
  }
}

/**
 * Retrieves event IDs from the "ALL Tournaments" sheet.
 * @return {Array<string>} - An array of unique event IDs.
 */
 function getEventIds(startDate, endDate) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName("ALL Tournaments");
    if (!sheet) throw new Error("Tournaments sheet not found");

    const data = sheet.getRange("B6:H" + sheet.getLastRow()).getValues();
    const validEvents = [];
    const invalidEvents = [];

    // Log date parameters first
    logDebug(`Date range parameters:
      Start: ${Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd")}
      End: ${Utilities.formatDate(endDate, Session.getScriptTimeZone(), "yyyy-MM-dd")}`);

    data.forEach((row, index) => {
      const eventDate = new Date(row[1]); // Column C (index 1)
      const eventId = row[3]?.toString(); // Column E (index 3)
      const rowNumber = index + 6; // Since data starts at row 6

      if (!eventId) {
        invalidEvents.push({row: rowNumber, reason: "Missing event ID"});
        return;
      }

      if (isNaN(eventDate)) {
        invalidEvents.push({row: rowNumber, reason: `Invalid date: ${row[1]}`});
        return;
      }

      const isInRange = eventDate >= startDate && eventDate <= endDate;
      const formattedDate = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), "yyyy-MM-dd");

      if (isInRange) {
        validEvents.push({
          row: rowNumber,
          eventId: eventId,
          date: formattedDate
        });
      } else {
        invalidEvents.push({
          row: rowNumber,
          eventId: eventId,
          reason: `Date out of range: ${formattedDate}`
        });
      }
    });

    // Detailed logging
    logDebug(`Valid events (${validEvents.length}):`);
    validEvents.forEach(event => {
      logDebug(`- Row ${event.row}: ${event.eventId} (${event.date})`);
    });

    logDebug(`Invalid/excluded events (${invalidEvents.length}):`);
    invalidEvents.forEach(event => {
      logDebug(`- Row ${event.row}: ${event.eventId} - ${event.reason}`);
    });

    return validEvents.map(event => event.eventId);

  } catch (error) {
    Logger.log("Error in getEventIds: " + error.message);
    return [];
  }
}

/**
 * Writes data to the sheet in batches asynchronously.
 * @param {Sheet} sheet - The Google Sheets sheet object.
 * @param {Range} startCell - The starting cell range.
 * @param {Array<Array<any>>} formattedData - The data to write.
 * @param {number} [batchSize=1000] - Number of rows per batch.
 * @return {Promise<void>}
 */
async function writeDataInBatchesWithSheetHeaders(sheet, startCell, formattedData, sheetColumnCount, sheetName) {
  try {
    const startRow = startCell.getRow();
    const startCol = startCell.getColumn();
    const totalBatches = Math.ceil(formattedData.length / BATCH_SIZE);
    const runtimeStart = new Date().getTime();

    // Fixed number formats with proper date format
    const numberFormats = MAIN_HEADERS.map(header => {
      switch(header) {
        case 'season': case 'year': case 'course_num': 
        case 'round_num': case 'score': 
          return "0";
        case 'driving_dist': 
          return "0.0";
        case 'event_completed': 
          return "yyyy-MM-dd"; // Correct date format
        case 'fin_text' : 
          return "@"
        default: return header.startsWith('sg_') ? "0.000" : "@"; // Use @ for text columns
      }
    });

    logDebug(`Starting batch write: ${formattedData.length} rows in ${totalBatches} batches of ${BATCH_SIZE}`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // Check runtime - if we're getting close to timeout, save progress and exit gracefully
      const elapsedMs = new Date().getTime() - runtimeStart;
      if (elapsedMs > MAX_RUNTIME * 0.8) { // 80% of max runtime
        logDebug(`⚠️ Approaching timeout (${(elapsedMs/1000).toFixed(1)}s elapsed). Completing batch ${batchIndex + 1}/${totalBatches} and stopping.`);
        updateCentralStatus(sheetName, `Partial update: ${batchIndex}/${totalBatches} batches written`);
        break;
      }

      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, formattedData.length);
      const batchData = formattedData.slice(start, end);
      const progress = ((batchIndex / totalBatches) * 100).toFixed(1);
      updateCentralStatus(sheetName, `Writing batch ${batchIndex + 1} of ${totalBatches} (${progress}%)`);

      if (batchData.length === 0) {
        logDebug(`Skipping empty batch ${batchIndex + 1}`);
        continue;
      }

      try {
        const targetRange = sheet.getRange(
          startRow + start,
          startCol,
          batchData.length,
          sheetColumnCount
        );

        // First write data
        targetRange.setValues(batchData);

        // Then apply formats if dimensions match
        if (numberFormats.length >= sheetColumnCount) {
          const formatsArray = batchData.map(row => 
            numberFormats.slice(0, sheetColumnCount)
          );
          
          try {
            targetRange.setNumberFormats(formatsArray);
             if (DEBUG_VERBOSE) {
              logDebug(`Formats applied to batch ${batchIndex + 1}`);
             }
          } catch (formatError) {
            Logger.log(`Batch ${batchIndex + 1} format error: ${formatError.message}`);
          }
        }

        // Flush to ensure data is written before moving to next batch
        SpreadsheetApp.flush();
        
        // Delay between writes to prevent sheet service overload
        if (batchIndex < totalBatches - 1) {
          await delay(SHEET_WRITE_DELAY_MS);
        }

        logDebug(`Batch ${batchIndex + 1} complete: ${batchData.length} rows written`);
      } catch (error) {
        Logger.log(`Batch ${batchIndex + 1} failed: ${error.message}`);
        throw error;
      }
    }

    logDebug(`Batch writing complete`);
    SpreadsheetApp.flush();
  } catch (error) {
    Logger.log("Error in writeDataInBatchesWithSheetHeaders: " + error.message);
    throw error;
  }
}

/**
 * Writes historical data incrementally (appends to existing data)
 * Used after each tournament to avoid losing progress if execution times out
 * @param {Sheet} sheet - The Historical Data sheet
 * @param {Array} dataToWrite - Array of [headers, ...rows]
 * @return {Promise<void>}
 */
async function writeHistoricalDataIncremental(historicalSheet, allData) {
  try {
    if (!allData || allData.length < 2) {
      logDebug(`No data to write incrementally`);
      return;
    }
    if (!historicalSheet) {
    SpreadsheetApp.getUi().alert(`Sheet named ${historicalSheet} not found.`);
  }

    const headers = allData[0];
    const newRows = allData.slice(1);
    
    // Find the last row with data
    const lastRow = historicalSheet.getLastRow();
    const startCell = historicalSheet.getRange("B5");
    const startRow = startCell.getRow();
    const startCol = startCell.getColumn();
    
    // Determine where to write new data
    let writeRow = startRow;
    if (lastRow >= startRow) {
      writeRow = lastRow + 1;
    }

    // Filter and validate rows
    const validRows = newRows.filter(row => {
      return row.length === headers.length && row.some(cell => cell !== '');
    });

    if (validRows.length === 0) {
      logDebug(`No valid rows to write incrementally`);
      return;
    }

    // Write new rows
    const targetRange = historicalSheet.getRange(
      writeRow,
      startCol,
      validRows.length,
      headers.length
    );

    targetRange.setValues(validRows);

    // Apply number formats
    const numberFormats = headers.map(header => {
      switch(header) {
        case 'season': case 'year': case 'course_num': 
        case 'round_num': case 'score': 
          return "0";
        case 'driving_dist': 
          return "0.0";
        case 'event_completed': 
          return "yyyy-MM-dd";
        case 'fin_text' : 
          return "@"
        default: return header.startsWith('sg_') ? "0.000" : "@";
      }
    });

    const formatsArray = validRows.map(row => numberFormats);
    targetRange.setNumberFormats(formatsArray);

    SpreadsheetApp.flush();
    logDebug(`Incremental write: ${validRows.length} rows appended to row ${writeRow}`);

  } catch (error) {
    logDebug(`Incremental write error: ${error.message}`);
    throw error;
  }
}

/**
 * @function updateHistoricalDataFromButton
 * @description Main controller function for updating historical golf data. Orchestrates:
 * - Date range calculation based on Configuration Sheet selection
 * - Event filtering from Tournaments sheet
 * - Batched API data fetching
 * - Data processing and spreadsheet writing
 * 
 * @example
 * // Returns "Historical data updated for last 12 months period (1250 rows)"
 * updateHistoricalDataFromButton();
 * 
 * @returns {string} Status message with results or error information. Formats:
 * - Success: "Historical data updated for [period] period ([X] rows)"
 * - No data: "No data found for selected period"
 * - Error: "Error: [error message]"
 * 
 * @throws {Error} Will throw if:
 * - Configuration Sheet not found
 * - Invalid date range calculation
 * - No tours selected
 * - API key missing
 * 
 * @requires {function} calculateDateRange From Configuration Sheet B7 value
 * @requires {function} getEventIds From Tournaments sheet data
 * @requires {function} getTourSelection From Configuration Sheet checkboxes
 * @requires {function} fetchHistoricalDataBatch For API data retrieval
 * @requires {function} writeDataInBatchesWithSheetHeaders For spreadsheet writing
 * 
 * @sideeffects
 * - Clears and updates Historical Data sheet (B5+)
 * - Modifies Script Properties with API key
 * - Writes debug info to Logger when DEBUG=true
 */
async function updateHistoricalDataFromButton() {  
  var sheetName = "Historical Data";  
  const ss = SpreadsheetApp.getActiveSpreadsheet();  
  const historicalSheet = ss.getSheetByName(sheetName);  
  if (!historicalSheet) SpreadsheetApp.getUi().alert(`Sheet named "${sheetName}" not found.`);  
  
  try {  
    updateCentralStatus(sheetName, 'start');  
    SpreadsheetApp.flush();  
    logDebug("Starting updateHistoricalDataFromButton function");  
  
    const props = PropertiesService.getScriptProperties();  
  
    // 1) Config + date range  
    const configSheet = ss.getSheetByName("Configuration Sheet");  
    if (!configSheet) throw new Error("Configuration Sheet not found");  
  
    const period = configSheet.getRange("F13").getValue();  
    const dateRange = calculateDateRange(period);  
    if (!dateRange) throw new Error("Failed to calculate date range");  
    const { startDate, endDate } = dateRange;  
  
    // 2) Special events  
    const specialEventRanges = [  
      configSheet.getRange("G29"),  
      configSheet.getRange("G33:G37"),  
      configSheet.getRange("G40:G44")  
    ];  
    const specialEventCells = specialEventRanges.flatMap(r => r.getValues()).flat().filter(String);  
    const specialEventIds = specialEventCells  
      .flatMap(cell => cell.toString().split(','))  
      .map(s => s.trim())  
      .filter(Boolean);  
    const uniqueSpecialEventIds = [...new Set(specialEventIds)];  
    logDebug(`Found ${uniqueSpecialEventIds.length} special events: ${uniqueSpecialEventIds.join(', ')}`);  
  
    // ---- Queue-based resume model ----  
    let filteredEvents = [];  
    let processedEventKeys = new Set();  
  
    const filteredEventsStr = props.getProperty('filteredEvents');  
    const processedEventKeysStr = props.getProperty('processedEventKeys');  
  
    if (filteredEventsStr) {  
      filteredEvents = JSON.parse(filteredEventsStr);  
      logDebug(`Loaded filteredEvents queue from props: ${filteredEvents.length}`);  
    }  
    if (processedEventKeysStr) {  
      processedEventKeys = new Set(JSON.parse(processedEventKeysStr));  
      logDebug(`Loaded processedEventKeys from props: ${processedEventKeys.size}`);  
    }  
  
    // These ARE the "code to tell the script what to do":  
    // Each one is an arrow function that runs props.setProperty(...)  
    const saveFilteredEvents = () => {  
      props.setProperty('filteredEvents', JSON.stringify(filteredEvents));  
      logDebug(`(props) saved filteredEvents queue length: ${filteredEvents.length}`);  
    };  
  
    const saveProcessedKeys = () => {  
      props.setProperty('processedEventKeys', JSON.stringify([...processedEventKeys]));  
      logDebug(`(props) saved processedEventKeys size: ${processedEventKeys.size}`);  
    };  
  
    // If no cached queue, compute ONCE (expensive), then persist  
    if (!filteredEventsStr) {  
      const eventIds = getEventIds(startDate, endDate);  
      logDebug(`Found ${eventIds.length} events in date range`);  
      if (eventIds.length === 0) return "No events found in selected date range";  
  
      const tours = getTourSelection();  
      logDebug(`Selected tours: ${tours.join(", ")}`);  
      if (tours.length === 0) throw new Error("No tours selected");  
  
      const tournamentSheet = ss.getSheetByName("ALL Tournaments");  
      if (!tournamentSheet) throw new Error("ALL Tournaments sheet not found");  
      const tournamentData = tournamentSheet.getRange("B6:H" + tournamentSheet.getLastRow()).getValues();  
      logDebug(`Loaded ${tournamentData.length} tournament records`);  
  
      // Initialize processed keys from sheet if we don't already have them  
      if (!processedEventKeysStr) {  
        const lastRow = historicalSheet.getLastRow();  
        if (lastRow > 5) {  
          const yearCol = 6; // adjust if your year is in a different column  
          const historicalData = historicalSheet.getRange(5, yearCol, lastRow - 4, 2).getValues();  
          historicalData.forEach(row => {  
            const year = row[0] ? row[0].toString().trim() : '';  
            const eventId = row[1] ? row[1].toString().trim() : '';  
            if (eventId && year) processedEventKeys.add(`${eventId}-${year}`);  
          });  
        }  
        saveProcessedKeys(); // <-- THIS writes processed keys to Script Properties  
        logDebug(`Initialized processedEventKeys from sheet: ${processedEventKeys.size}`);  
      }  
  
      // Build queue  
      const toursSet = new Set(tours);  
      const eventIdsSet = new Set(eventIds);  
      const existing = new Set();  
      filteredEvents = [];  
      const currentYear = new Date().getFullYear();  
  
      tournamentData.forEach(row => {  
        const tour = row[0]?.toString().trim();  
        const eventId = row[3]?.toString().trim();  
        const eventDate = new Date(row[1]);  
  
        if (!tour || !eventId) return;  
        if (isNaN(eventDate.getTime())) return;  
  
        const year = eventDate.getFullYear();  
        const key = `${eventId}-${year}`;  
  
        if (processedEventKeys.has(key)) return;  
        if (existing.has(key)) return;  
  
        const isSpecialEvent =  
          uniqueSpecialEventIds.includes(eventId) &&  
          toursSet.has(tour) &&  
          (year >= currentYear - 5);  
  
        if (isSpecialEvent) {  
          filteredEvents.push({ tour, eventId, year });  
          existing.add(key);  
          return;  
        }  
  
        const t = eventDate.getTime();  
        const isValidRegularEvent =  
          eventIdsSet.has(eventId) &&  
          toursSet.has(tour) &&  
          t >= startDate.getTime() &&  
          t <= endDate.getTime();  
  
        if (isValidRegularEvent) {  
          filteredEvents.push({ tour, eventId, year });  
          existing.add(key);  
        }  
      });  
  
      saveFilteredEvents(); // <-- THIS writes the computed queue to Script Properties  
      logDebug(`Computed + cached filteredEvents queue: ${filteredEvents.length}`);  
    }  
  
    const headers = MAIN_HEADERS;  
    let allData = [headers];  
    const apiKey = getApiKey();  
  
    logDebug(`Processing queue length: ${filteredEvents.length}`);  
    const runtimeStart = Date.now();  
  
    for (let i = 0; i < filteredEvents.length; i++) {  
      const elapsedMs = Date.now() - runtimeStart;  
      const remainingMs = MAX_RUNTIME - elapsedMs;  
      const estimatedTimePerEvent = elapsedMs / (i + 1);  
  
      if (remainingMs < estimatedTimePerEvent * 2) {  
        logDebug(`⚠️ Approaching timeout. Stopping. Queue remaining: ${filteredEvents.length - i}`);  
        updateCentralStatus(sheetName, `Partial update: queue remaining ${filteredEvents.length - i}. Will resume.`);  
        break;  
      }  
  
      const event = filteredEvents[i];  
      const eventKey = `${event.eventId}-${event.year}`;  
      updateCentralStatus(sheetName, `Processing ${i + 1}/${filteredEvents.length}: ${eventKey}`);  
      SpreadsheetApp.flush();  
  
      // If already processed, remove from queue + persist  
      if (processedEventKeys.has(eventKey)) {  
        logDebug(`Queue cleanup: removing already-processed ${eventKey}`);  
        filteredEvents.splice(i, 1);  
        i--;  
        saveFilteredEvents();  
        continue;  
      }  
  
      try {  
        const eventData = await fetchHistoricalDataBatch(  
          [event.tour],  
          event.eventId,  
          event.year,  
          apiKey,  
          headers  
        );  
  
        if (eventData && eventData.length > 1) {  
          allData.push(...eventData.slice(1));  
          await writeHistoricalDataIncremental(historicalSheet, allData);  
          allData = [headers];  
  
          // SUCCESS checkpoint:  
          // 1) add to processedEventKeys and save  
          // 2) remove from queue and save  
          processedEventKeys.add(eventKey);  
          saveProcessedKeys();  
  
          filteredEvents.splice(i, 1);  
          i--;  
          saveFilteredEvents();  
  
          logDebug(`✅ Wrote + removed ${eventKey}. Queue now ${filteredEvents.length}`);  
        } else {  
          logDebug(`No data for ${eventKey}. Leaving in queue (will retry next run).`);  
        }  
      } catch (error) {  
        logDebug(`Error processing ${eventKey}: ${error.message} (leaving in queue to retry)`);  
      }  
  
      if (i < filteredEvents.length - 1) {  
        await delay(API_CALL_DELAY_MS * 2);  
      }  
    }  
  
    // Remaining tournaments is just the queue length now  
    const remaining = filteredEvents.length;  
    if (remaining > 0) {  
      clearAndSetHistoricalTrigger();  
      updateCentralStatus(sheetName, `Partial update: ${remaining} tournaments remaining. Will resume shortly.`);  
      return `Partial update: ${remaining} tournaments remaining. Will resume shortly.`;  
    }  
  
    updateCentralStatus(sheetName, true);  
    logDebug(`All done. Queue empty.`);  
  
    return `Historical data updated for ${period} period`;  
  } catch (error) {  
    const errorMessage = `Line ${error.stack.split('\n')[1].match(/:(\d+):/)[1]}: ${error.message}`;  
    updateCentralStatus(sheetName, `Failed: ${errorMessage.slice(0, 50)}`);  
    SpreadsheetApp.flush();  
    Logger.log(error.stack);  
    return errorMessage;  
  }  
}  

/**
 * Fetches DataGolf data from the given API endpoint.
 * @param {string} endpoint - The API endpoint URL.
 * @return {Array<Object>} - Array of fetched data objects.
 * @throws Will throw an error if the API request fails or data parsing fails.
 */
async function fetchDataGolfData(endpoint) {
  try {
    logDebug("Starting API request to: " + endpoint);
    const response = await UrlFetchApp.fetch(endpoint, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error(`API request failed with status ${responseCode}: ${response.getContentText()}`);
    }

    const responseText = response.getContentText();
    logDebug("Response text length: " + responseText.length);
    
    // Handle empty responses
    if (responseText.trim() === "") {
      throw new Error("Empty API response");
    }

    const responseData = JSON.parse(responseText);
    logDebug("Data parsed successfully");
    
    // Handle different response structures
    const data = responseData.data || responseData;
    
    if (!Array.isArray(data)) {
      throw new Error(`Unexpected data format: ${typeof data}`);
    }

    return data;

  } catch (error) {
    Logger.log(`Error in fetchDataGolfData: ${error.toString()}\nEndpoint: ${endpoint}`);
    throw error;
  }
}

/**
 * Fetches player data from DataGolf API and writes to the "Approach Skill" sheet.
 * @return {string} - Status message indicating success or failure.
 */
async function updateApproachSkillDataFromButton() {
  var sheetName = "Approach Skill";

  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
    updateCentralStatus(sheetName, 'start');
    SpreadsheetApp.flush();
    const period = sheet.getRange("F13").getValue();
    const periodLabel = period;

    const dateRange = calculateDateRange(period);
    if (!dateRange) throw new Error("Invalid period selected");

    const endpoint = `https://feeds.datagolf.com/preds/approach-skill?` + 
      `period=${dateRange.periodCode}&file_format=json&key=${getApiKey()}`;

    // Add timeout and retry logic
    const playersData = await fetchDataGolfData(endpoint).catch(error => {
      throw new Error(`API fetch failed: ${error.message}`);
    });

    if (!playersData?.length) {
      const errorMessage = `Received empty dataset for period ${periodLabel} (${dateRange.periodCode})`;
      Logger.log(errorMessage);
      throw new Error(errorMessage);
    }

    // Data validation
    const validPlayers = playersData.filter(player => 
      player?.dg_id && player?.player_name
    );

    if (validPlayers.length === 0) {
      throw new Error("No valid player records found in response");
    }

     // Define all headers based on API response structure
    const headers = [
      "dg_id", "player_name",
      "100_150_fw_gir_rate", "100_150_fw_good_shot_rate", "100_150_fw_low_data_indicator",
      "100_150_fw_poor_shot_avoid_rate", "100_150_fw_proximity_per_shot", 
      "100_150_fw_sg_per_shot", "100_150_fw_shot_count",
      "150_200_fw_gir_rate", "150_200_fw_good_shot_rate", "150_200_fw_low_data_indicator",
      "150_200_fw_poor_shot_avoid_rate", "150_200_fw_proximity_per_shot",
      "150_200_fw_sg_per_shot", "150_200_fw_shot_count",
      "50_100_fw_gir_rate", "50_100_fw_good_shot_rate", "50_100_fw_low_data_indicator",
      "50_100_fw_poor_shot_avoid_rate", "50_100_fw_proximity_per_shot",
      "50_100_fw_sg_per_shot", "50_100_fw_shot_count",
      "over_150_rgh_gir_rate", "over_150_rgh_good_shot_rate", "over_150_rgh_low_data_indicator",
      "over_150_rgh_poor_shot_avoid_rate", "over_150_rgh_proximity_per_shot",
      "over_150_rgh_sg_per_shot", "over_150_rgh_shot_count",
      "over_200_fw_gir_rate", "over_200_fw_good_shot_rate", "over_200_fw_low_data_indicator",
      "over_200_fw_poor_shot_avoid_rate", "over_200_fw_proximity_per_shot",
      "over_200_fw_sg_per_shot", "over_200_fw_shot_count",
      "under_150_rgh_gir_rate", "under_150_rgh_good_shot_rate", "under_150_rgh_low_data_indicator",
      "under_150_rgh_poor_shot_avoid_rate", "under_150_rgh_proximity_per_shot",
      "under_150_rgh_sg_per_shot", "under_150_rgh_shot_count"
    ];

    // Map API response to spreadsheet columns
    const data = playersData.map(player => [
      player.dg_id,
      player.player_name,
      player["100_150_fw_gir_rate"],
      player["100_150_fw_good_shot_rate"],
      player["100_150_fw_low_data_indicator"],
      player["100_150_fw_poor_shot_avoid_rate"],
      player["100_150_fw_proximity_per_shot"],
      player["100_150_fw_sg_per_shot"],
      player["100_150_fw_shot_count"],
      player["150_200_fw_gir_rate"],
      player["150_200_fw_good_shot_rate"],
      player["150_200_fw_low_data_indicator"],
      player["150_200_fw_poor_shot_avoid_rate"],
      player["150_200_fw_proximity_per_shot"],
      player["150_200_fw_sg_per_shot"],
      player["150_200_fw_shot_count"],
      player["50_100_fw_gir_rate"],
      player["50_100_fw_good_shot_rate"],
      player["50_100_fw_low_data_indicator"],
      player["50_100_fw_poor_shot_avoid_rate"],
      player["50_100_fw_proximity_per_shot"],
      player["50_100_fw_sg_per_shot"],
      player["50_100_fw_shot_count"],
      player["over_150_rgh_gir_rate"],
      player["over_150_rgh_good_shot_rate"],
      player["over_150_rgh_low_data_indicator"],
      player["over_150_rgh_poor_shot_avoid_rate"],
      player["over_150_rgh_proximity_per_shot"],
      player["over_150_rgh_sg_per_shot"],
      player["over_150_rgh_shot_count"],
      player["over_200_fw_gir_rate"],
      player["over_200_fw_good_shot_rate"],
      player["over_200_fw_low_data_indicator"],
      player["over_200_fw_poor_shot_avoid_rate"],
      player["over_200_fw_proximity_per_shot"],
      player["over_200_fw_sg_per_shot"],
      player["over_200_fw_shot_count"],
      player["under_150_rgh_gir_rate"],
      player["under_150_rgh_good_shot_rate"],
      player["under_150_rgh_low_data_indicator"],
      player["under_150_rgh_poor_shot_avoid_rate"],
      player["under_150_rgh_proximity_per_shot"],
      player["under_150_rgh_sg_per_shot"],
      player["under_150_rgh_shot_count"]
    ]);

    const targetSheet = SpreadsheetApp.getActive().getSheetByName("Approach Skill");
    targetSheet.clearContents();
    
    // Write headers and data
    targetSheet.getRange(5, 2, 1, headers.length).setValues([headers]);
    targetSheet.getRange(6, 2, data.length, headers.length).setValues(data);

    // Format numerical columns (all except dg_id and player_name)
    const numFormatRange = targetSheet.getRange(2, 3, data.length, headers.length - 2);
    numFormatRange.setNumberFormat("0.00");
    updateCentralStatus(sheetName, true);
    SpreadsheetApp.flush();

    return `Approach Skill Data updated for ${periodLabel} (${validPlayers.length} valid players)`;

  } catch (error) {
    updateCentralStatus(sheetName, false);
    SpreadsheetApp.flush();
    Logger.log(`Error in updateApproachSkillDataFromButton: ${error.message}\nStack: ${error.stack}`);
    return `Error: ${error.message}`;
  }
}

/**
 * Fetches a batch of historical data for specific tours and event IDs.
 * @param {Array<string>} tours - List of selected tours.
 * @param {Array<string>} batchEventIds - Batch of event IDs.
 * @param {number} year - Year for data fetching.
 * @param {string} apiKey - API key for authentication.
 * @return {Array<Array<any>>} - Batch of historical data.
 */
/**
 * Fetches and processes historical data with enhanced error handling
 */
async function fetchHistoricalDataBatch(tours, eventId, year, apiKey, headers) {
  let successCount = 0;
  let errorCount = 0;
  const runtimeStart = new Date().getTime();
  
  try {
    let allData = [];
    const seenRows = new Set(); // For duplicate detection

    for (const tour of tours) {
      // Runtime check - if running low on time, skip remaining tours
      const elapsedMs = new Date().getTime() - runtimeStart;
      if (elapsedMs > MAX_RUNTIME * 0.9) {
        logDebug(`⚠️ Runtime exceeded 90%. Stopping API calls for event ${eventId}.`);
        break;
      }

      const endpoint = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=${tour}&event_id=${eventId}&year=${year}&file_format=json&key=${apiKey}`;
      
      try {
        logDebug(`Fetching: ${tour} event ${eventId} year ${year}...`);
        const response = UrlFetchApp.fetch(endpoint, { 
          muteHttpExceptions: true,
          timeout: API_TIMEOUT_MS
        });
        
        const responseData = processApiResponse(response);

        if (responseData.error) {
          logDebug(`API Error: ${responseData.error}`);
          errorCount++;
          continue;
        }

        const processedData = Array.isArray(responseData.data) ? 
          responseData.data.flatMap(item => processDataItem(item, headers)) :
          processDataItem(responseData.data, headers);

        // Deduplicate and validate
        processedData.forEach(row => {
          const rowHash = row.join('|');
          if (!seenRows.has(rowHash) && validateRow(row, headers)) {
            successCount++;
            allData.push(row);
            seenRows.add(rowHash);
          } else {
            errorCount++;
          }
        });
        
        logDebug(`Tour ${tour}: ${successCount} valid rows, ${errorCount} errors.`);
        
        // CRITICAL: Delay between API calls to avoid rate limiting
        if (tours.indexOf(tour) < tours.length - 1) {
          await delay(API_CALL_DELAY_MS);
        }

      } catch (error) {
        logDebug(`Tour ${tour} failed: ${error.message}`);
        errorCount++;
        
        // Still delay on error to avoid hammering API
        await delay(API_CALL_DELAY_MS);
      }
    }

    logDebug(`Batch complete: ${successCount} total valid rows`);
    return allData.length > 0 ? [MAIN_HEADERS, ...allData] : [];

  } catch (error) {
    logDebug(`Batch processing failed: ${error.message}`);
    return [];
  }
}

// Helper functions
function processApiResponse(response) {
  const status = response.getResponseCode();
  const text = response.getContentText().trim();

  // Handle empty responses
  if (text === "") {
    logDebug("Empty API response");
    return { data: [] };
  }

  try {
    return { data: JSON.parse(text) };
  } catch (e) {
    logDebug(`Failed to parse JSON: ${text.slice(0, 100)}`);
    return { data: text };
  }
}

function processDataItem(item, headers) {
  try {
    // Handle different response structures
    if (item?.scores) {
      return processNestedStructure(item, headers);
    }
    if (Array.isArray(item)) {
      return item.map(i => mapPartialDataToHeaders(i)).filter(Boolean);
    }
    return [mapPartialDataToHeaders(item)].filter(Boolean);
  } catch (error) {
    logDebug(`Item processing failed: ${error.message}`);
    return [];
  }
}

function processNestedStructure(data) {
  const rows = [];
  
  try {
    if (!data?.scores?.length) {
      logDebug("No player scores found");
      return rows;
    }

    data.scores.forEach(player => {
      // Get ALL rounds including empty/non-scoring ones
      const rounds = Object.keys(player)
        .filter(key => key.startsWith('round_'))
        .map(roundKey => ({
          num: parseInt(roundKey.split('_')[1]),
          data: player[roundKey] || {} // Preserve even empty rounds
        }));

      // Debug: Show found rounds
      logDebug(`Processing ${player.dg_id} with ${rounds.length} rounds`);

      rounds.forEach(round => {
        const rowData = {
          // Event data
          ...data,
          
          // Player data
          dg_id: player.dg_id,
          player_name: player.player_name,
          fin_text: player.fin_text || '',
          
          // Round data
          ...round.data,
          round_num: round.num,
          
          // Defaults for required fields
          score: round.data?.score || 0,
          birdies: round.data?.birdies || 0,
          bogies: round.data?.bogies || 0
        };

        const row = mapPartialDataToHeaders(rowData);
        if (row) rows.push(row);
      });
    });

    logDebug(`Generated ${rows.length} rows from ${data.scores.length} players`);
    return rows;

  } catch (error) {
    logDebug(`Nested processing failed: ${error.message}`);
    return [];
  }
}

function validateRow(row, headers) {
  return row?.length === headers.length &&
         !row.every(cell => cell === '') &&
         row.some(cell => 
           typeof cell === 'number' ||
           (typeof cell === 'string' && cell.trim() !== '')
         );
}


/**
 * Updates tournament field data from a button trigger.
 * @return {string} - Status message indicating success or failure.
 */
async function updateTournamentFieldDataFromButton() {
  var sheetName = "Tournament Field";
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tournament Field');
    updateCentralStatus(sheetName, 'start');
    SpreadsheetApp.flush();

    const apiKey = getApiKey();
    const tour = 'pga';

    // 1. Define your EXACT column structure
    const TARGET_HEADERS = [
      'dg_id',
      'player_name',
      'am',
      'event_name',
      'course_name', 
      'course',      
      'early_late',
      'pga_number',
      'current_round',
      'start_hole',
      'r1_teetime',
      'r2_teetime',
      'r3_teetime',
      'r4_teetime',
      'unofficial'
    ];

    const endpoint = `https://feeds.datagolf.com/field-updates?tour=${tour}&file_format=json&key=${apiKey}`;
    logDebug(`Fetching tournament field data from: ${endpoint}`);
    const response = await UrlFetchApp.fetch(endpoint);
    logDebug(`Received tournament ${JSON.stringify(response)}`);
    const responseText = response.getContentText();
    const data = JSON.parse(responseText);
    
    // Check if we need to handle team format or regular format
    let rows = [];
    
    if (data.field && data.field.length > 0 && 'p1_dg_id' in data.field[0]) {
      // Handle team tournament format (Zurich Classic)
      console.log("Detected team tournament format");
      
      // Process team data and create entries for each player
      data.field.forEach(team => {
        // Split team name to get individual player names
        const playerNames = team.team_name.split('/').map(name => name.trim());
        
        // Convert early_late value (0 = late, 1 = early)
        const earlyLateValue = team.early_late === 1 ? 'early' : 
                              team.early_late === 0 ? 'late' : '';
        
        // Create entry for first player
        if (team.p1_dg_id) {
          rows.push([
            team.p1_dg_id || '',
            playerNames[0] || '',
            0, // am
            team.event_name || data.event_name || '',
            team.course || '',
            team.course || '', // duplicating for course field
            earlyLateValue,
            '', // pga_number
            data.current_round || '',
            team.start_hole || '',
            team.r1_teetime || '',
            team.r2_teetime || '',
            team.r3_teetime || '',
            team.r4_teetime || '',
            team.unofficial || 0
          ]);
        }
        
        // Create entry for second player
        if (team.p2_dg_id) {
          rows.push([
            team.p2_dg_id || '',
            playerNames[1] || '',
            0, // am
            team.event_name || data.event_name || '',
            team.course || '',
            team.course || '', // duplicating for course field
            earlyLateValue,
            '', // pga_number
            data.current_round || '',
            team.start_hole || '',
            team.r1_teetime || '',
            team.r2_teetime || '',
            team.r3_teetime || '',
            team.r4_teetime || '',
            team.unofficial || 0
          ]);
        }
      });
    } else {
      // Handle standard individual tournament format (original code)
      rows = data.field.map(player => {
        return [
          player.dg_id || '',
          player.player_name || '',
          player.am || 0,
          data.event_name || '',     
          data.course_name || '',    
          data.course || '',         
          player.early_late || '',
          player.pga_number?.toString() || '',
          data.current_round || '',
          player.start_hole || '',
          player.r1_teetime || '',
          player.r2_teetime || '',
          player.r3_teetime || '',
          player.r4_teetime || '',
          player.unofficial || 0
        ];
      });
    }

    // 3. Write to sheet with validation
    const output = [TARGET_HEADERS, ...rows];
    const dataRange = sheet.getRange(5, 2, sheet.getLastRow() - 5, TARGET_HEADERS.length);
    const targetRange = sheet.getRange(5, 2, output.length, TARGET_HEADERS.length);
    
    // Clear exactly the needed columns
    dataRange.clearContent();
    
    // Set values with data validation
    targetRange.setValues(output);

    // Format PGA numbers as text to preserve leading zeros
    const pgaNumberColIndex = TARGET_HEADERS.indexOf('pga_number') + 1;
    sheet.getRange(5, pgaNumberColIndex, rows.length)
      .setNumberFormat('@STRING@');
    updateCentralStatus(sheetName, true);
    SpreadsheetApp.flush();

    return `Updated ${rows.length} players for ${data.event_name}`;

  } catch (error) {
    updateCentralStatus(sheetName, false);
    console.error('Failed to update field:', error);
    return `Error: ${error.message}`;
  }
}



async function updateTournamentsDataFromButton() {
  const START_ROW = 5;
  const sheetName = "ALL Tournaments";
  
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
    updateCentralStatus(sheetName, 'start');
    
    // Clear existing data from START_ROW
    if (sheet.getLastRow() >= START_ROW) {
      sheet.getRange(START_ROW, 2, sheet.getLastRow() - START_ROW + 1, 7).clearContent();
    }

    // API call
    const endpoint = `https://feeds.datagolf.com/historical-raw-data/event-list?file_format=json&key=${getApiKey()}`;
    updateCentralStatus(sheetName, "Fetching data...");
    
    const response = UrlFetchApp.fetch(endpoint, {
      muteHttpExceptions: true,
      validateHttpsCertificates: false,
      timeout: 60000 // Longer timeout
    });
    
    const responseText = response.getContentText();
    if (responseText.includes("invalid api key")) {
      throw new Error("Invalid API key - renew at datagolf.com");
    }

    const allEvents = JSON.parse(responseText);
    if (!Array.isArray(allEvents)) {
      throw new Error("API returned invalid data format");
    }

    // Look for Valspar specifically for debugging
    const valsparEvents = allEvents.filter(event => 
      event.event_name && event.event_name.toLowerCase().includes("valspar")
    );
    
    console.log(`Found ${valsparEvents.length} Valspar events in API response:`);
    valsparEvents.forEach(event => {
      console.log(JSON.stringify(event));
    });

    // Process all data with minimal overhead
    const columnsToKeep = ['tour', 'date', 'calendar_year', 'event_id', 
                          'event_name', 'sg_categories', 'traditional_stats'];
    const processedData = [columnsToKeep]; // Header row

    allEvents.forEach(event => {
      // Skip incomplete events
      if (!event.event_id || !event.event_name) return;
      
      // Format date (with error handling)
      let dateStr = '';
      try {
        if (event.date) {
          dateStr = Utilities.formatDate(new Date(event.date), Session.getScriptTimeZone(), "yyyy-MM-dd");
        } else if (event.event_completed) {
          dateStr = Utilities.formatDate(new Date(event.event_completed), Session.getScriptTimeZone(), "yyyy-MM-dd");
        }
      } catch (e) {
        console.log(`Date error for ${event.event_name}: ${e.message}`);
      }
      
      // Add row with consistent formatting
      processedData.push([
        event.tour || 'N/A',
        dateStr,
        parseInt(event.calendar_year) || '',
        event.event_id.toString(), // Ensure string format
        event.event_name,
        typeof event.sg_categories === 'string' ? event.sg_categories : JSON.stringify(event.sg_categories || []),
        typeof event.traditional_stats === 'string' ? event.traditional_stats : JSON.stringify(event.traditional_stats || [])
      ]);
    });

    console.log(`Total events to write: ${processedData.length - 1}`);
    
    // Write in reasonable batches
    const batchSize = 200; // More reasonable batch size
    for (let i = 0; i < processedData.length; i += batchSize) {
      const endIndex = Math.min(i + batchSize, processedData.length);
      const batch = processedData.slice(i, endIndex);
      
      const startRow = i === 0 ? START_ROW : START_ROW + i;
      sheet.getRange(startRow, 2, batch.length, columnsToKeep.length).setValues(batch);
      
      updateCentralStatus(sheetName, `Written ${endIndex - 1} of ${processedData.length - 1} events (${Math.round(((endIndex - 1) / (processedData.length - 1)) * 100)}%)`);
      SpreadsheetApp.flush();
      
      // Brief pause between batches
      if (i + batchSize < processedData.length) {
        await Utilities.sleep(1000);
      }
    }

    updateCentralStatus(sheetName, true);
    SpreadsheetApp.flush();
    
    return `Updated ${processedData.length - 1} events`;

  } catch (error) {
    console.error(error);
    updateCentralStatus(sheetName, false);
    SpreadsheetApp.flush();
    throw error;
  }
}



