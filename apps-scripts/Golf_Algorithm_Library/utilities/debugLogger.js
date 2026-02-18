const DEBUG_LOG_SHEET_NAME = "🔧 Debug - Calculations";
const DEBUG_EXECUTION_LOG_SHEET_NAME = "Debug Execution Log";
const DEBUG_LOG_RESET_PENDING_KEY = 'DOC_DEBUG_LOG_RESET_PENDING';
const LOGGING_ENABLED = false;
const DEFAULT_DEBUG_LOGGING = 'false';
const DEFAULT_TRACE_PLAYER = '';
const DEFAULT_TRACE_GROUP_STATS = 'true';
const DEFAULT_DEBUG_CALC_SHEET = 'false';
const DEFAULT_DEBUG_LOGGING_SETTING = DEFAULT_DEBUG_LOGGING;
let TRACE_PLAYER_NAME = '';
let TRACE_PLAYER_NAME_LOWER = '';
let TRACE_ENABLED = false;
let TRACE_GROUP_STATS_RAW = '';
let TRACE_GROUP_STATS = false;
let DEBUG_CALC_SHEET_RAW = '';
let DEBUG_CALC_SHEET_ENABLED = false;
let DEBUG_LOGGING_RAW = '';
let DEBUG_LOGGING_ENABLED = false;

const normalizeTraceValue = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return '';
  return raw;
};

const parseTraceBoolean = (value, fallback = false) => {
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y';
};

const refreshTraceConfig = () => {
  TRACE_PLAYER_NAME = normalizeTraceValue(
    PropertiesService.getDocumentProperties().getProperty('DOC_TRACE_PLAYER')
    || PropertiesService.getScriptProperties().getProperty('SCRIPT_TRACE_PLAYER')
  );
  if (!TRACE_PLAYER_NAME) {
    TRACE_PLAYER_NAME = DEFAULT_TRACE_PLAYER;
  }
  TRACE_PLAYER_NAME_LOWER = TRACE_PLAYER_NAME.toLowerCase();
  TRACE_ENABLED = TRACE_PLAYER_NAME.length > 0;

  TRACE_GROUP_STATS_RAW = normalizeTraceValue(
    PropertiesService.getDocumentProperties().getProperty('DOC_TRACE_GROUP_STATS')
    || PropertiesService.getScriptProperties().getProperty('SCRIPT_TRACE_GROUP_STATS')
    || DEFAULT_TRACE_GROUP_STATS
  );
  TRACE_GROUP_STATS = parseTraceBoolean(TRACE_GROUP_STATS_RAW, false);

  DEBUG_CALC_SHEET_RAW = normalizeTraceValue(
    PropertiesService.getDocumentProperties().getProperty('DOC_DEBUG_CALC_SHEET')
    || PropertiesService.getScriptProperties().getProperty('SCRIPT_DEBUG_CALC_SHEET')
    || DEFAULT_DEBUG_CALC_SHEET
  );
  DEBUG_CALC_SHEET_ENABLED = parseTraceBoolean(DEBUG_CALC_SHEET_RAW, false);

  DEBUG_LOGGING_RAW = normalizeTraceValue(
    PropertiesService.getDocumentProperties().getProperty('DOC_DEBUG_LOGGING')
    || PropertiesService.getScriptProperties().getProperty('SCRIPT_DEBUG_LOGGING')
    || DEFAULT_DEBUG_LOGGING_SETTING
  );
  DEBUG_LOGGING_ENABLED = parseTraceBoolean(DEBUG_LOGGING_RAW, false);
};

const shouldTracePlayer = (name) => TRACE_ENABLED && String(name || '').toLowerCase().includes(TRACE_PLAYER_NAME_LOWER);

const isDebugCalculationSheetEnabled = () => {
  refreshTraceConfig();
  return DEBUG_CALC_SHEET_ENABLED;
};
const isDebugLoggingEnabled = () => {
  refreshTraceConfig();
  return DEBUG_LOGGING_ENABLED;
};

function getDebugLoggingSettings() {
  refreshTraceConfig();
  return { enabled: DEBUG_LOGGING_ENABLED };
}

function setDebugLoggingSettings(enabled) {
  const value = enabled ? 'true' : 'false';
  const docProps = PropertiesService.getDocumentProperties();
  docProps.setProperty('DOC_DEBUG_LOGGING', value);
  docProps.setProperty('DOC_DEBUG_CALC_SHEET', value);

  if (enabled) {
    const ss = SpreadsheetApp.getActive();
    ensureDebugLogSheet(ss, DEBUG_LOG_SHEET_NAME);
  }

  refreshTraceConfig();
  return { enabled: DEBUG_LOGGING_ENABLED };
}

function markDebugLogsForReset() {
  PropertiesService.getDocumentProperties().setProperty(DEBUG_LOG_RESET_PENDING_KEY, 'true');
  resetDebugLogsIfPending();
}

function resetDebugLogsIfPending() {
  if (!isDebugLoggingEnabled()) return;
  const docProps = PropertiesService.getDocumentProperties();
  const pending = docProps.getProperty(DEBUG_LOG_RESET_PENDING_KEY);
  if (pending !== 'true') return;

  const ss = SpreadsheetApp.getActive();
  if (!ss) return;

  const calcSheet = ensureDebugLogSheet(ss, DEBUG_LOG_SHEET_NAME);

  if (calcSheet) {
    calcSheet.clearContents();
    calcSheet.setFrozenRows(1);
  }

  docProps.deleteProperty(DEBUG_LOG_RESET_PENDING_KEY);
}

const ensureDebugLogSheet = (ss, sheetName) => {
  if (!ss) return null;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(["— Debug Log —", ""]);
    sheet.appendRow(["Time", "Message"]);
  } else {
    const lastValues = sheet.getRange(lastRow, 1, 1, 2).getValues()[0];
    const hasHeader = String(lastValues[0]) === 'Time' && String(lastValues[1]) === 'Message';
    if (!hasHeader) {
      sheet.appendRow(['', '']);
      sheet.appendRow(["— Debug Log —", ""]);
      sheet.appendRow(["Time", "Message"]);
    }
  }
  return sheet;
};

function appendDebugExecutionLog(message, context = {}) {
  try {
    if (!isDebugLoggingEnabled()) return;
    const ss = SpreadsheetApp.getActive();
    if (!ss) return;
    resetDebugLogsIfPending();
    const calcSheet = ensureDebugLogSheet(ss, DEBUG_LOG_SHEET_NAME);

    if (context.reset) {
      if (calcSheet) {
        calcSheet.clearContents();
        calcSheet.setFrozenRows(1);
      }
      if (execSheet) {
        execSheet.clearContents();
        execSheet.setFrozenRows(1);
      }
      if (!message) return;
    }

    if (!message) return;

    const detailParts = [];
    if (context.tour) detailParts.push(`tour=${context.tour}`);
    if (context.eventId) detailParts.push(`eventId=${context.eventId}`);
    if (context.year) detailParts.push(`year=${context.year}`);
    if (context.courseIds) detailParts.push(`courseIds=${context.courseIds}`);
    if (context.allowedCourseIds) detailParts.push(`allowed=${context.allowedCourseIds}`);
    const detailText = detailParts.length ? ` | ${detailParts.join(' | ')}` : '';

    const row = [new Date().toLocaleTimeString(), `${message}${detailText}`];
    if (calcSheet) calcSheet.appendRow(row);
  } catch (error) {
    Logger.log(`Debug log write failed: ${error}`);
  }
}

function ensureTraceConfigViaUi() {
  try {
    const ui = SpreadsheetApp.getUi();
    const current = normalizeTraceValue(
      PropertiesService.getDocumentProperties().getProperty('DOC_TRACE_PLAYER')
      || PropertiesService.getScriptProperties().getProperty('SCRIPT_TRACE_PLAYER')
    );
    if (current) return;

    const response = ui.prompt(
      'Trace Player (Optional)',
      'Enter a player name to trace in the Debug Execution Log (leave blank to disable).',
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== ui.Button.OK) return;

    const value = response.getResponseText().trim();
    if (value) {
      PropertiesService.getScriptProperties().setProperty('SCRIPT_TRACE_PLAYER', value);
    } else {
      PropertiesService.getScriptProperties().deleteProperty('SCRIPT_TRACE_PLAYER');
    }
  } catch (error) {
    Logger.log(`Trace UI prompt skipped: ${error}`);
  }
}

function ensureTraceGroupStatsViaUi() {
  try {
    const ui = SpreadsheetApp.getUi();
    const current = normalizeTraceValue(
      PropertiesService.getDocumentProperties().getProperty('DOC_TRACE_GROUP_STATS')
      || PropertiesService.getScriptProperties().getProperty('SCRIPT_TRACE_GROUP_STATS')
    );
    if (current) return;

    const response = ui.alert(
      'Log Group Stats?',
      'Enable verbose group stats logging in the Debug Execution Log?',
      ui.ButtonSet.YES_NO
    );

    const enabled = response === ui.Button.YES;
    PropertiesService.getScriptProperties().setProperty('SCRIPT_TRACE_GROUP_STATS', enabled ? 'true' : 'false');
  } catch (error) {
    Logger.log(`Group stats UI prompt skipped: ${error}`);
  }
}

function ensureDebugCalculationSheetViaUi() {
  try {
    const ui = SpreadsheetApp.getUi();
    const current = normalizeTraceValue(
      PropertiesService.getDocumentProperties().getProperty('DOC_DEBUG_CALC_SHEET')
      || PropertiesService.getScriptProperties().getProperty('SCRIPT_DEBUG_CALC_SHEET')
    );
    if (current) return;

    const response = ui.alert(
      'Create Debug Calculation Sheet?',
      'Generate the detailed Debug Calculation Sheet (can be slow)?',
      ui.ButtonSet.YES_NO
    );

    const enabled = response === ui.Button.YES;
    PropertiesService.getScriptProperties().setProperty('SCRIPT_DEBUG_CALC_SHEET', enabled ? 'true' : 'false');
  } catch (error) {
    Logger.log(`Debug calculation UI prompt skipped: ${error}`);
  }
}

function initDebugLogCapture(options = {}) {
  const enabled = options.enabled ?? LOGGING_ENABLED;
  const logs = [];
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  if (!enabled) {
    return {
      enabled,
      logs,
      originalConsole,
      flushLogs: () => {},
      restore: () => {}
    };
  }

  appendDebugExecutionLog('', { reset: true });

  const logToBuffer = (level, args) => {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    logs.push([new Date().toLocaleTimeString(), `[${level}] ${msg}`]);
  };

  console.log = function(...args) {
    logToBuffer('LOG', args);
    originalConsole.log(...args);
  };
  console.warn = function(...args) {
    logToBuffer('WARN', args);
    originalConsole.warn(...args);
  };
  console.error = function(...args) {
    logToBuffer('ERROR', args);
    originalConsole.error(...args);
  };

  const flushLogs = () => {
    if (!enabled) return;
    if (logs.length === 0) {
      logs.push([new Date().toLocaleTimeString(), '[WARN] No console logs captured']);
    }
    logs.forEach(([, message]) => {
      appendDebugExecutionLog(message);
    });
  };

  const restore = () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  };

  return {
    enabled,
    logs,
    originalConsole,
    flushLogs,
    restore
  };
}
