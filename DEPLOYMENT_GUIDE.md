# Test Library Deployment Guide

## Overview
We've created a separate **TEST library** to safely test the historical tournament analysis feature without affecting production sheets.

## What's Different in Test Library

**Test Library (`Golf_Algorithm_Library_TEST`):**
- ❌ Does NOT include `tournamentResults.js` (avoids duplicate variable conflicts)
- ✅ Has self-contained `tournamentResults_historical.js` with all dependencies
- ✅ Includes sandbox mode for safe testing
- ✅ All other library files intact

**Production Library (`Golf_Algorithm_Library`):**
- ✅ Has both `tournamentResults.js` and `tournamentResults_historical.js`
- ✅ Full featured for production use

## Deployment Steps

### Step 1: Deploy Test Library to Google Apps Script

```bash
cd /workspaces/GoogleAppScripts/apps-scripts/Golf_Algorithm_Library_TEST

# Login to clasp if needed
clasp login

# Create new Google Apps Script project for test library
clasp create --type standalone --title "Golf Algorithm Library - TEST"

# This creates .clasp.json with new Script ID
# Push the test library code
clasp push
```

**Save the Script ID** from `.clasp.json` - you'll need it!

### Step 2: Create Test Sheet

1. **Make a copy** of one of your existing golf model sheets
2. **Rename it:** "Golf Model - Historical Analysis Test"
3. This keeps your production sheet safe

### Step 3: Link Test Sheet to Test Library

In your copied test sheet:

1. **Extensions** → **Apps Script**
2. **Left sidebar** → Click the **+** next to "Libraries"
3. **Script ID:** Paste the Script ID from Step 1
4. **Version:** Select "Head" (or latest version)
5. **Identifier:** Keep as "GolfAlgorithm"
6. Click **Add**
7. **Save** the project

### Step 4: Test the Feature

In your test sheet:

1. **Reload the sheet** to see new menu
2. **Menu:** `‼️ Model Tools ‼️` → `📊 Tournament Results`
3. **Try Sandbox first:** `🧪 Historical Analysis (Sandbox)`
   - Enter event ID in Config Sheet G9
   - Enter year when prompted
   - Check "Tournament Results - Sandbox" sheet
4. **Try Production mode:** `Historical Analysis (Production)`
   - Same process
   - Check "Historical Data" sheet for appended data
5. **Test multiple tournaments** to verify data preservation

## What to Verify

### ✅ Expected Behavior
- [ ] No duplicate variable errors
- [ ] Sandbox mode works without touching Historical Data
- [ ] Production mode appends to Historical Data (doesn't overwrite)
- [ ] Menu appears with submenu structure
- [ ] Can fetch multiple years of same tournament
- [ ] Each dataset in Historical Data has proper metadata

### ❌ Watch For
- Script errors about duplicate declarations
- Historical Data being cleared (should append only)
- Sandbox writing to Historical Data (shouldn't)
- Missing validation metrics

## Troubleshooting

### "ReferenceError: RESULTS_METRIC_TYPES is not defined"
- The test library file should be self-contained
- Check that `tournamentResults.js` is NOT in the test library
- Verify `tournamentResults_historical.js` has the constants at the top

### "Cannot find function fetchHistoricalTournamentResultsSandbox"
- Library may not be linked correctly
- Try reloading: `clasp push` then refresh test sheet
- Check library version is "Head" or latest

### "Required sheets not found"
- Make sure test sheet has "Player Ranking Model"
- Make sure test sheet has "Configuration Sheet"
- Event ID must be in G9

## After Testing

### If Everything Works ✅

1. **Merge feature branch to main:**
   ```bash
   git checkout main
   git merge feature/historical-tournament-analysis
   git push origin main
   ```

2. **Update production library:**
   ```bash
   cd /workspaces/GoogleAppScripts/apps-scripts/Golf_Algorithm_Library
   clasp push
   ```

3. **All production sheets** get the new feature automatically

### If Issues Found ❌

1. **Fix in test library** first
2. **Test again** in test sheet
3. **Once working,** copy fixes to main library
4. **Then merge** to main branch

## File Structure

```
apps-scripts/
├── Golf_Algorithm_Library/          # Production library (on main branch)
│   ├── tournamentResults.js        # Regular tournament results
│   └── tournamentResults_historical.js  # Historical with deps on above
│
└── Golf_Algorithm_Library_TEST/     # Test library (on feature branch)
    ├── [no tournamentResults.js]   # Removed to avoid conflicts
    └── tournamentResults_historical.js  # Self-contained version
```

## Script IDs

**Production Library:** `1DnL19m56VfDfyFOMIWk2Fca_tN4VJG9arnFiXCgoChAW67W_94B_zoqk`

**Test Library:** _(will be generated in Step 1)_

**Your Test Sheet:** _(copy of existing sheet)_

## Quick Reference

| Action | Command/Location |
|--------|------------------|
| Deploy test library | `cd Golf_Algorithm_Library_TEST && clasp push` |
| Update test sheet | Extensions → Apps Script → Update library version |
| Run sandbox test | Menu → Tournament Results → 🧪 Historical (Sandbox) |
| Run production test | Menu → Tournament Results → Historical (Production) |
| Check data preservation | Historical Data sheet → verify multiple tournaments |
| View commits | `git log --oneline feature/historical-tournament-analysis` |
| Merge when ready | `git checkout main && git merge feature/historical-tournament-analysis` |

## Safety Notes

- ✅ Test library is completely separate from production
- ✅ Test sheet is a copy - won't affect live sheets
- ✅ Sandbox mode doesn't write to Historical Data
- ✅ Can rollback easily with git
- ✅ Production sheets unaffected during testing

---

**Ready to deploy?** Start with Step 1 above!
