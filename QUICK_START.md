# Quick Start - CSV Analysis

## To analyze your Historical Data CSV:

The CSV file is on your local Windows machine, so you'll need to either:

### Option 1: Upload to Codespace (Recommended)
1. In VS Code, drag and drop your CSV file into the workspace
2. Or use: **Terminal** → **Upload Files**
3. Then run:
```bash
python scripts/csv_analyzer.py "/workspaces/GoogleAppScripts/American Express (2026) - Historical Data.csv"
```

### Option 2: Run Locally on Windows
If you have Python installed:
```bash
cd /path/to/GoogleAppScripts
python scripts/csv_analyzer.py "C:/Users/zclark/Downloads/American Express (2026) - Historical Data.csv"
```

### Option 3: Open File in VS Code
Open the CSV in VS Code and I can read it directly to check for duplicates.

## What the Analyzer Shows:

✅ **Summary:** Total rows, unique tournaments, unique player-rounds
📊 **Tournament List:** All tournaments in the data with round counts
⚠️ **Duplicates:** Any player-rounds that appear multiple times
📈 **Round Distribution:** Breakdown of rounds per tournament

## Test Library Info:

**Script ID:** `14DP0hxlVyYZHVc7LJhlNqvfasCfp2s3LlHiWurFtjQ5gJOm8VhX81KWO`

**To use in your test sheet:**
1. Copy one of your golf model sheets
2. Extensions → Apps Script → Libraries → Add
3. Paste Script ID above
4. Version: Head (development mode)
5. Identifier: GolfAlgorithm

**Menu will show:**
```
‼️ Model Tools ‼️
  └─ 📊 Tournament Results
       ├─ Fetch Current Results
       ├─ 🧪 Historical Analysis (Sandbox)    ← Start here!
       └─ Historical Analysis (Production)
```

Ready to analyze the CSV when you upload it!
