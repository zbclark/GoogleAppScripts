const fs = require('fs');
const { parse } = require('csv-parse/sync');

const cleanNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  const raw = String(value).replace(/[^0-9.\-]/g, '');
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadConfigCells = (configCsvPath) => {
  const raw = fs.readFileSync(configCsvPath, 'utf8');
  return parse(raw, {
    skip_empty_lines: false,
    relax_column_count: true
  });
};

const getCell = (cells, row, col) => {
  if (!cells[row - 1]) return null;
  return cells[row - 1][col - 1] || null;
};

const parseEventIds = (value) => String(value || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id && id !== '');

const collectEventIds = (cells, startRow, endRow, col) => {
  const ids = [];
  for (let row = startRow; row <= endRow; row++) {
    const cellValue = getCell(cells, row, col);
    if (!cellValue) continue;
    parseEventIds(cellValue).forEach(id => ids.push(id));
  }
  return ids;
};

const getSharedConfig = (configCsvPath) => {
  const cells = loadConfigCells(configCsvPath);
  const readCell = (row, col) => getCell(cells, row, col);

  const currentEventId = String(readCell(9, 7) || '2');
  const similarCourseIds = collectEventIds(cells, 33, 37, 7);
  const puttingCourseIds = collectEventIds(cells, 40, 44, 7);

  const courseSetupWeights = {
    under100: cleanNumber(readCell(17, 16)),
    from100to150: cleanNumber(readCell(18, 16)),
    from150to200: cleanNumber(readCell(19, 16)),
    over200: cleanNumber(readCell(20, 16))
  };

  const similarCoursesWeight = cleanNumber(readCell(33, 8), 0.7);
  const puttingCoursesWeight = cleanNumber(readCell(40, 8), 0.75);

  const pastPerformanceEnabled = String(readCell(27, 6)).trim() === 'Yes';
  const pastPerformanceWeight = cleanNumber(readCell(27, 7), 0);

  return {
    cells,
    getCell: readCell,
    currentEventId,
    similarCourseIds,
    puttingCourseIds,
    similarCoursesWeight,
    puttingCoursesWeight,
    courseSetupWeights,
    pastPerformanceEnabled,
    pastPerformanceWeight
  };
};

module.exports = {
  cleanNumber,
  loadConfigCells,
  getCell,
  parseEventIds,
  collectEventIds,
  getSharedConfig
};
