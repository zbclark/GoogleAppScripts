#!/usr/bin/env bash
# Find all Google Apps Script projects accessible to your current Google account

set -euo pipefail

echo "🔍 Searching for Google Apps Script projects..."
echo "Logged in as: $(clasp show-authorized-user 2>/dev/null || echo "Not logged in")"
echo ""

# Get list of projects via clasp
projects_json=$(clasp list --json 2>/dev/null)

if [[ -z "$projects_json" || "$projects_json" == "[]" ]]; then
    echo "❌ No projects found via clasp list"
    echo ""
    echo "This could mean:"
    echo "• No projects exist in this Google account"
    echo "• Projects were created in a different Google account"
    echo "• Projects are shared but not owned by this account"
    echo ""
else
    echo "✅ Found $(echo "$projects_json" | jq length) project(s):"
    echo ""
    
    # Parse and display projects
    echo "$projects_json" | jq -r '.[] | "📝 \(.name)\n   ID: \(.id)\n   URL: https://script.google.com/d/\(.id)/edit\n"'
    
    echo "To add these to your script-ids.txt file:"
    echo "$projects_json" | jq -r '.[] | "\(.id) \(.name)"'
    echo ""
fi

echo "🌐 Alternative methods to find ALL your projects:"
echo ""
echo "1. Visit Google Apps Script directly:"
echo "   → https://script.google.com"
echo "   → All your projects will be listed there"
echo ""
echo "2. Search Google Drive for Apps Script files:"
echo "   → https://drive.google.com/drive/search?q=type:application/vnd.google-apps.script"
echo ""
echo "3. Check if you're using the right Google account:"
echo "   → clasp logout"
echo "   → clasp login"
echo "   → Select the account that has your Apps Script projects"
echo ""
echo "4. Manual method:"
echo "   → Open each project at script.google.com"
echo "   → Copy script ID from URL: https://script.google.com/d/[SCRIPT_ID]/edit"
echo "   → Add to script-ids.txt: SCRIPT_ID Project Name"