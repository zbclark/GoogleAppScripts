// Utility to build an array of recent years
module.exports = function buildRecentYears(season, yearCount = 5) {
  const baseYear = season || new Date().getFullYear();
  return Array.from({ length: yearCount }, (_, idx) => baseYear - idx);
};
