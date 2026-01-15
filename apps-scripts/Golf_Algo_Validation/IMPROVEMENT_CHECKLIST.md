# Model Diagnostic & Improvement Checklist

**📘 Companion to:** [VALIDATION_FRAMEWORK.md](../../VALIDATION_FRAMEWORK.md) (Phases 1-3)  
**Used with:** [MODEL_IMPROVEMENT_GUIDE.md](MODEL_IMPROVEMENT_GUIDE.md) (Strategic workflow)

This checklist provides a tactical step-by-step guide for executing the validation phases described in VALIDATION_FRAMEWORK.md.

---

## Pre-Analysis Checklist
- [ ] Have at least 3-5 tournament results available
- [ ] Each tournament has "Tournament Results" sheet with actual finishes
- [ ] Each tournament has "Player Ranking Model" sheet with your pre-tournament predictions
- [ ] Results sheet has headers on Row 5 with: DG ID, Finish Position, Player Name
- [ ] Ranking sheet has headers on Row 5 with: DG ID, Player Name, Rank/Prediction

## Analysis Execution (In Order)

### Phase 1: Run Calibration Analysis
**Function**: `analyzePostTournamentCalibration()`
- [ ] Creates "Calibration Report" sheet
- [ ] Shows actual finish vs your predicted rank for each top finisher
- [ ] Calculates Top 5 accuracy % and Top 10 accuracy %
- [ ] Identifies which tournaments you were best/worst at

**Key Output to Check**:
- Your Top 5 Accuracy (target: >60%)
- Your Top 10 Accuracy (target: >70%)
- Which tournaments had lowest accuracy
- What was the average "Miss Score" for top 5?

### Phase 2: Run Metric Correlation Analysis  
**Function**: `analyzeMetricCorrelations()`
- [ ] Creates "01_Aggregate_Metric_Report" sheet
- [ ] Creates "00_Course_Type_Classification" sheet
- [ ] Creates per-tournament "02_Tournament_[Name]" sheets
- [ ] Shows top 35 metrics ranked by predictive power

**Key Output to Check**:
- Top 5 metrics overall (these are your strongest predictors)
- Delta values (>0.5 = very important, <0.2 = not important)
- Per-tournament variation (which metrics shift in importance)
- Course type classifications (which tournaments cluster)

### Phase 3: Deep Dive on Misses
**Manually investigate worst-performing tournaments**:

For each tournament with <60% accuracy:

**3.1 - Check Calibration Data**:
- [ ] Open "Calibration Report" 
- [ ] Find finishers with highest "Miss Score" (>20)
- [ ] Note their names and which stats they excelled at

Example:
```
Player X - Actual 3rd, Predicted 52 (Miss: 49)
  SG Total: 2.5 (you predicted 0.8)
  SG Putting: 1.8 (you predicted 0.4)
  ```

**3.2 - Check Metric Correlations for that Tournament**:
- [ ] Open "02_Tournament_[That Course]" sheet
- [ ] Find top 5 metrics for that course
- [ ] Check if they match with missed players' strong stats

Example:
```
Top 5 metrics at this course:
  1. SG Putting (delta: 1.5)
  2. SG Total (delta: 1.4)
  3. SG Approach (delta: 0.9)
  4. Greens in Regulation (delta: 0.8)
  5. Driving Accuracy (delta: 0.6)
```

**3.3 - Compare Your Weights to Actual**:
Create a simple table:

| Metric | Actual Rank (from sheet) | Your Weight | Action |
|--------|--------------------------|-------------|--------|
| SG Putting | 1st | 12% | ← Increase to 18% |
| SG Total | 2nd | 20% | ✓ Good |
| SG Approach | 3rd | 8% | ← Increase to 12% |
| Greens in Regulation | 4th | 5% | ← Increase to 8% |
| Driving Accuracy | 5th | 15% | ← Decrease to 10% |

**3.4 - Check Course Type**:
- [ ] What type is this course? (POWER/TECHNICAL/BALANCED)
- [ ] Do other courses of this type have similar patterns?
- [ ] Is this a systemic issue for that course type?

## Diagnostic Questions to Answer

### 1. Am I missing a metric entirely?
- [ ] Look at top 5 finishers in calibration
- [ ] What stats do they have in common?
- [ ] Do I track this metric? Yes / No
- **Action**: If no, add it. If yes, increase weight.

### 2. Is my accuracy consistent or tournament-dependent?
- [ ] Check accuracy across all tournaments in calibration
- [ ] Standard deviation of accuracy: High=varies / Low=consistent
- [ ] If varies: Are certain course types better/worse?
- **Action**: Create course-type-specific templates

### 3. Am I overweighting weak metrics?
- [ ] Compare your weights to aggregate metric report
- [ ] Metrics you weight heavily but have low delta (<0.2)?
- [ ] List them: ________________
- **Action**: Reduce weight, reallocate to high-delta metrics

### 4. Am I underweighting strong metrics?
- [ ] Find metrics with >0.5 delta in aggregate report
- [ ] What weight do you give them?
- [ ] Below 12%? ← Likely underweighting
- **Action**: Increase weight to 15-20%

### 5. Is this a global issue or local to certain courses?
- [ ] Check per-tournament variations in metric importance
- [ ] Does SG Putting always matter? Sometimes? Rarely?
- [ ] If always: Make it global (same weight everywhere)
- [ ] If sometimes: Use course-type templates
- **Action**: Build separate templates for each type

## Improvement Workflow

### Week 1: Diagnose
- [ ] Run calibration analysis
- [ ] Run metric correlation analysis
- [ ] Identify tournament with worst accuracy
- [ ] Answer diagnostic questions 1-5 above

### Week 2: Plan Changes
- [ ] List 3-5 specific weight changes needed
- [ ] Organize by course type
- [ ] Create "Template_[Type]_v2" with new weights
- [ ] Document rationale for each change

### Week 3: Test
- [ ] Run new weights on past similar tournaments
- [ ] Compare old vs new accuracy
- [ ] Measure improvement percentage
- [ ] If >5% improvement: Keep. If <5%: Refine further.

### Week 4: Deploy & Monitor
- [ ] Apply improved weights to next tournament prediction
- [ ] After tournament: Run calibration again
- [ ] Measure accuracy on new tournament
- [ ] Repeat cycle

## Metrics to Track Over Time

Create a simple tracking spreadsheet:

```
Date | Tournament | Old Accuracy | New Accuracy | Change | Change % | Type
-----|-----------|--------------|--------------|--------|----------|------
1/15 | Course A  | 45%          | 62%          | +17%   | +38%     | Power
1/22 | Course B  | 68%          | 71%          | +3%    | +4%      | Tech
1/29 | Course C  | 52%          | 58%          | +6%    | +12%     | Balanced
```

**Target**: Average improvement of 5-10% per cycle

## Common Improvement Patterns

### Pattern 1: "I'm missing top finishers with strong short game"
- [ ] SG Putting and SG Approach have high delta
- [ ] You weight them too low
- **Action**: Increase by 30-50% for courses where they're in top 5

### Pattern 2: "I'm too heavy on Driving Distance"
- [ ] Driving metrics have low delta at many courses
- [ ] You weight Driving Distance at 15%+
- **Action**: Reduce to 10% globally, increase to 12% only for Power courses

### Pattern 3: "Power players win at technical courses"
- [ ] Power courses show strength, technical courses show weakness
- [ ] You might not be identifying player archetypes
- **Action**: Note which players fit which style, adjust rankings by fit

### Pattern 4: "My templates work but have small gaps"
- [ ] Accuracy already >70% for each type
- [ ] Small tweaks needed per metric
- **Action**: Fine-tune weights by ±2-3%, test incrementally

## Success Metrics

| Metric | Baseline | 1 Month Target | 3 Month Target |
|--------|----------|---|---|
| Top 5 Accuracy | ? | +5% | +10% |
| Top 10 Accuracy | ? | +3% | +8% |
| Miss Score (avg) | ? | -5 places | -10 places |
| % of tournaments >70% | ? | +20 pts | +40 pts |

## Red Flags - When to Revise Approach

🚨 **Accuracy hasn't improved in 3 weeks** → You need a different metric or weighting strategy

🚨 **One course type consistently underperforms** → You might need a different template for that type

🚨 **Same player misses in multiple tournaments** → Might indicate model flaw (not course-specific)

🚨 **Winner often comes from outside top 50 predictions** → You're missing a key metric entirely
