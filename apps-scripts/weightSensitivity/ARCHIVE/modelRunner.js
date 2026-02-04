// Local model runner for weight sensitivity analysis
// Accepts parsed player data and a weights object, returns evaluation metrics

/**
 * Compute a weighted score for each player.
 * @param {Array<object>} players - Array of player data objects
 * @param {object} weights - { metricName: weight, ... }
 * @param {string} [scoreField='score'] - Field to store computed score
 * @returns {Array<object>} Players with computed scores
 */
function scorePlayers(players, weights, scoreField = 'score') {
  return players.map(player => {
    let score = 0;
    for (const [metric, weight] of Object.entries(weights)) {
      const val = parseFloat(player[metric]);
      if (!isNaN(val)) score += val * weight;
    }
    return { ...player, [scoreField]: score };
  });
}

/**
 * Evaluate model accuracy: RMSE, correlation, top-10 accuracy
 * @param {Array<object>} players - Players with computed scores and actual finish
 * @param {string} scoreField - Field with computed score
 * @param {string} finishField - Field with actual finish position (e.g. 'fin_text' or 'finish_pos')
 * @returns {object} { rmse, correlation, top10Accuracy }
 */
function evaluateModel(players, scoreField, finishField) {
  // Filter players with both score and finish
  const valid = players.filter(p => !isNaN(parseFloat(p[scoreField])) && !isNaN(parseFloat(p[finishField])));
  if (valid.length === 0) return { rmse: NaN, correlation: NaN, top10Accuracy: NaN };
  // Sort by score (lower is better)
  const sorted = [...valid].sort((a, b) => a[scoreField] - b[scoreField]);
  // Assign model rank
  sorted.forEach((p, i) => { p.model_rank = i + 1; });
  // RMSE and correlation between model_rank and actual finish
  const n = sorted.length;
  const modelRanks = sorted.map(p => p.model_rank);
  const actualRanks = sorted.map(p => parseFloat(p[finishField]));
  const meanModel = modelRanks.reduce((a, b) => a + b, 0) / n;
  const meanActual = actualRanks.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(modelRanks.reduce((sum, r, i) => sum + Math.pow(r - actualRanks[i], 2), 0) / n);
  const corrNum = modelRanks.reduce((sum, r, i) => sum + (r - meanModel) * (actualRanks[i] - meanActual), 0);
  const corrDen = Math.sqrt(modelRanks.reduce((sum, r) => sum + Math.pow(r - meanModel, 2), 0) * actualRanks.reduce((sum, r) => sum + Math.pow(r - meanActual, 2), 0));
  const correlation = corrDen === 0 ? NaN : corrNum / corrDen;
  // Top-10 accuracy: how many of model's top 10 are in actual top 10
  const modelTop10 = sorted.slice(0, 10).map(p => p.player_name);
  const actualTop10 = [...sorted].sort((a, b) => a[finishField] - b[finishField]).slice(0, 10).map(p => p.player_name);
  const overlap = modelTop10.filter(name => actualTop10.includes(name)).length;
  const top10Accuracy = (overlap / 10) * 100;
  return { rmse, correlation, top10Accuracy };
}

module.exports = { scorePlayers, evaluateModel };