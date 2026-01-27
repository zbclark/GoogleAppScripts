const {
  calculateMetricSensitivity,
  performWeightSensitivityAnalysis,
  analyzeWeightEffectiveness
} = require('./weightSensitivity');

describe('Weight Sensitivity Analysis Utilities', () => {
  test('calculateMetricSensitivity returns array of results', () => {
    const results = calculateMetricSensitivity('SG OTT', { min: 0, max: 1, step: 0.5 });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('weight');
    expect(results[0]).toHaveProperty('rmse');
    expect(results[0]).toHaveProperty('correlation');
    expect(results[0]).toHaveProperty('top10Accuracy');
  });

  test('performWeightSensitivityAnalysis aggregates results for all metrics', () => {
    const metrics = ['SG OTT', 'SG Putting'];
    const results = performWeightSensitivityAnalysis(metrics, { min: 0, max: 1, step: 1 });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(metrics.length * 2); // min=0, max=1, step=1 => 2 steps per metric
    expect(results[0]).toHaveProperty('metric');
  });

  test('analyzeWeightEffectiveness summarizes RMSE range per metric', () => {
    const mockResults = [
      { metric: 'A', rmse: 10 },
      { metric: 'A', rmse: 20 },
      { metric: 'B', rmse: 5 },
      { metric: 'B', rmse: 8 }
    ];
    const summary = analyzeWeightEffectiveness(mockResults);
    expect(summary).toHaveProperty('A');
    expect(summary.A.rmseRange).toBe(10);
    expect(summary).toHaveProperty('B');
    expect(summary.B.rmseRange).toBe(3);
  });
});
