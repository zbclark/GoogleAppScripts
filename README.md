# Google Apps Scripts Repo

This repository is a workspace to store Google Apps Script projects locally.

## Pulling all Apps Script projects into this repo

I added a helper script that lists your Google Apps Script projects (via `clasp`) and clones or updates them into the `apps-scripts/` directory.

## Prerequisites

- Node.js and npm
- clasp: install globally with `npm install -g @google/clasp`
- jq: JSON processor (e.g. `sudo apt install jq` on Debian/Ubuntu)

## Usage

1. Authenticate with Google:
   ```bash
   clasp login
   ```

2. Run the helper script (multiple options):

   **Auto-discover projects:**
   ```bash
   ./scripts/pull_apps_scripts.sh
   ```

   **Pull specific script IDs:**
   ```bash
   ./scripts/pull_apps_scripts.sh SCRIPT_ID1 SCRIPT_ID2 ...
   ```

   **Pull from script-ids.txt file:**
   ```bash
   ./scripts/pull_apps_scripts.sh --from-file script-ids.txt
   ```

The script will create `apps-scripts/` and clone each project into a folder named with the project title (e.g., `ADS_Sales_Operations`).

## Finding Script IDs

If `clasp list` doesn't show your projects, you can find script IDs by:

1. Visit [script.google.com](https://script.google.com)
2. Open any project
3. Copy the script ID from the URL: `https://script.google.com/d/[SCRIPT_ID]/edit`
4. Add script IDs to `script-ids.txt` (one per line) or pass them as arguments

## Notes

- If a project is already present, the script runs `clasp pull` to update it.
- The script handles cases where `clasp list` doesn't work (common issue).
- Comments and empty lines in `script-ids.txt` are ignored.
- If you'd like a GitHub Action to sync projects automatically, open an issue and I can add an optional workflow.

## Your Current Projects

✅ **ADS Sales Operations** - Successfully cloned with 9 files:
- ProjectEntryForm.html
- projectEntryForm.js  
- statusColumnChanges.js
- checkDropdown.js
- tabulateInvoices.js
- weeklySummary.js
- insertNotesColumn.js
- moveQualifications.js
- appsscript.json