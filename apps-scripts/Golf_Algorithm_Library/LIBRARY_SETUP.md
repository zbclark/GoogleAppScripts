# Golf Algorithm Library Setup Guide

## Overview
This is a **standalone Apps Script library** that contains all the Golf Algorithm code. You set it up ONCE, then add it to any new weekly sheet.

## Library Details
- **Script ID**: `1DnL19m56VfDfyFOMIWk2Fca_tN4VJG9arnFiXCgoChAW67W_94B_zoqk`
- **Script URL**: https://script.google.com/d/1DnL19m56VfDfyFOMIWk2Fca_tN4VJG9arnFiXCgoChAW67W_94B_zoqk/edit

---

## ONE-TIME SETUP: Deploy as Library

1. **Open the library script**: https://script.google.com/d/1DnL19m56VfDfyFOMIWk2Fca_tN4VJG9arnFiXCgoChAW67W_94B_zoqk/edit

2. **Deploy as Library**:
   - Click **Deploy** > **New deployment**
   - Select type: **Library**
   - Description: "Golf Algorithm Library v1"
   - Click **Deploy**
   - Copy the **Deployment ID** (you'll need this for each new sheet)

---

## WEEKLY WORKFLOW: Add Library to New Sheet

When you copy your sheet each week, follow these steps:

### Step 1: Open the New Sheet's Script Editor
1. Open your copied Google Sheet
2. Extensions > Apps Script
3. You'll see a blank script (or old bound code)

### Step 2: Add the Library
1. In the script editor, click the **+** next to "Libraries" (in the left sidebar)
2. Paste the Script ID: `1DnL19m56VfDfyFOMIWk2Fca_tN4VJG9arnFiXCgoChAW67W_94B_zoqk`
3. Click "Look up"
4. Select the latest version (or use "HEAD" for always-latest)
5. Set Identifier to: `GolfAlgorithm`
6. Click "Add"

### Step 3: Create Wrapper Functions (One Time Per Sheet)
In your sheet's Apps Script editor, replace all code with this wrapper:

```javascript
/**
 * Wrapper for Golf Algorithm Library
 * This calls the standalone library functions
 */

// Create menu on open
function onOpen() {
  GolfAlgorithm.onOpen();
}

// Configuration functions
function configurePGA() {
  GolfAlgorithm.configurePGA();
}

function configureDPWorld() {
  GolfAlgorithm.configureDPWorld();
}

function configureLIVGolf() {
  GolfAlgorithm.configureLIVGolf();
}

// Template loader
function loadWeightTemplate() {
  GolfAlgorithm.loadWeightTemplate();
}

function showTemplateInfo() {
  GolfAlgorithm.showTemplateInfo();
}

// Core algorithm functions
function fetchAndWriteData() {
  GolfAlgorithm.fetchAndWriteData();
}

function updateSheets() {
  GolfAlgorithm.updateSheets();
}

function loadHistoricalResults() {
  GolfAlgorithm.fetchHistoricalTournamentResults();
}

// Other utility functions as needed
function getCourseNameAndNum() {
  GolfAlgorithm.getCourseNameAndNum();
}

function setCoursesDropdown() {
  GolfAlgorithm.setCoursesDropdown();
}
```

### Step 4: Save and Refresh
1. Save the wrapper code (Ctrl+S or Cmd+S)
2. Refresh your Google Sheet
3. The custom menu should appear!

---

## UPDATING THE LIBRARY

When you make code changes:

1. **Update the library**:
   ```bash
   cd /workspaces/GoogleAppScripts/apps-scripts/Golf_Algorithm_Library
   clasp push
   ```

2. **Create new version** (in the library script editor):
   - Deploy > Manage deployments
   - Click "Edit" (pencil icon) on the Library deployment
   - Click "Create new version"
   - Add description (e.g., "Added PGA West template")
   - Click "Deploy"

3. **Sheets update automatically** if you selected "HEAD" version, or:
   - Libraries > Click settings icon > Update to new version

---

## BENEFITS

✅ **One codebase** - Update once, affects all sheets  
✅ **Static setup** - No need to update .clasp.json weekly  
✅ **Version control** - Can roll back if something breaks  
✅ **Easy copying** - Just add library to new sheets  

---

## TROUBLESHOOTING

**"Function not found" error**:
- Make sure you added the wrapper functions to the sheet's script
- Check the library identifier is `GolfAlgorithm`

**"Library not found" error**:
- Verify the Script ID is correct
- Make sure the library is deployed

**Code changes not appearing**:
- Create a new version in the library deployment
- Update library version in the sheet's Libraries section
