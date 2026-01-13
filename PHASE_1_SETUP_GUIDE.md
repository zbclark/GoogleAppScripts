# Phase 1: Weight Template Generation - Setup Guide

## Overview
This system analyzes all 9 tournaments post-tournament to determine which metric weights were most effective for each course type (POWER, TECHNICAL, BALANCED).

## How to Use

### Step 1: Classify Each Tournament by Course Type
Before running the template generator, you must manually classify each tournament workbook.

**For each tournament workbook:**
1. Open the workbook from the Golf 2025 folder
2. Go to the Configuration Sheet
3. In cell **G10**, enter one of:
   - `POWER` - for distance-heavy courses (Valspar, Players, Texas Children's, Valero)
   - `TECHNICAL` - for precision-heavy courses (Masters, Palmer, Heritage)
   - `BALANCED` - for mixed-style courses

**Quick Reference:**
- **POWER courses:** Reward long drives + power metrics
  - Examples: Valspar (274 avg distance), Players, Texas Children's
  - Expect Driving Distance to be highly predictive

- **TECHNICAL courses:** Reward accuracy + precision metrics
  - Examples: Masters, Arnold Palmer, RBC Heritage  
  - Expect SG metrics to be highly predictive

### Step 2: Run Template Generation
1. Open the **Golf_Algo_Validation** workbook
2. Go to menu: **🏌️ 2025+ Tournament Validation** → **⚙️ Generate Weight Templates**
3. The function will:
   - Read classification from each tournament (G10)
   - Analyze which metrics were strongest for top-10 finishers
   - Group by course type
   - Generate 3 weight templates: POWER, TECHNICAL, BALANCED
   - Store results in Configuration Sheet rows 30-50

### Step 3: Review Generated Templates
In the Golf_Algo_Validation workbook, Configuration Sheet rows 30-50 will show:

```
POWER (X tournaments):
  Metric                    Average Value    Source Tournaments
  Driving Distance          XXX.XXX          X
  Driving Accuracy          X.XXX            X
  SG OTT                     X.XXX            X
  SG Total                   X.XXX            X
  Birdie Chances Created     X.XXX            X

TECHNICAL (X tournaments):
  [same metrics]

BALANCED (X tournaments):
  [same metrics]
```

## What the Templates Show

The templates reveal which metrics were most effective for top-10 finishers in each course type:

- **High values** = That metric was valuable for winners at this course type
- **Low values** = That metric didn't correlate with winning at this course type
- **Source Tournaments** = How many tournaments of this type were analyzed

## Next Steps (Phase 2)

Once templates are generated, the next phase will:
1. Automatically detect course type from field characteristics (Driving Distance)
2. Apply the appropriate weight template to rank players
3. Compare actual results vs template-predicted results
4. Refine templates iteratively

## Troubleshooting

**"Golf 2025 folder not found"**
- Make sure the Golf 2025 folder with 9 tournament workbooks exists in Google Drive

**"No course type found"**
- Check that G10 in each tournament workbook's Configuration Sheet has a value
- Values must be exactly: POWER, TECHNICAL, or BALANCED (case-sensitive)

**"No tournaments classified"**
- If no templates are generated, verify that at least one tournament has a course type in G10

## Data Captured

For each tournament classified, the system captures:
- Tournament name
- Course type (POWER/TECHNICAL/BALANCED)
- Average metric values for top-10 finishers:
  - Driving Distance (yards)
  - Driving Accuracy (%)
  - SG OTT
  - SG Total
  - Birdie Chances Created

These averages form the "weight templates" - they represent the successful metric profiles for each course type.
