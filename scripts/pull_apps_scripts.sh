#!/usr/bin/env bash
# Pull all Google Apps Script projects into the repo using clasp
# Creates an apps-scripts/ directory and clones/pulls each project
#
# Usage:
#   ./pull_apps_scripts.sh                    # Auto-discover projects via clasp list
#   ./pull_apps_scripts.sh SCRIPT_ID1 ID2... # Clone specific script IDs
#   ./pull_apps_scripts.sh --from-file FILE  # Read script IDs from file (one per line)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/apps-scripts"
SCRIPT_IDS_FILE="$ROOT_DIR/script-ids.txt"

command -v clasp >/dev/null 2>&1 || { echo "clasp is not installed. Install with: npm i -g @google/clasp" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required. Install with your package manager (apt install jq)" >&2; exit 1; }

mkdir -p "$OUT_DIR"

# Handle command line arguments
script_ids=()
if [[ $# -gt 0 ]]; then
  if [[ "$1" == "--from-file" ]]; then
    if [[ $# -lt 2 ]]; then
      echo "Usage: $0 --from-file <filename>" >&2
      exit 1
    fi
    file="$2"
    if [[ ! -f "$file" ]]; then
      echo "File not found: $file" >&2
      exit 1
    fi
    while IFS= read -r line; do
      if [[ -n "$line" && ! "$line" =~ ^[[:space:]]*# ]]; then
        script_ids+=("$line")
      fi
    done < "$file"
  else
    script_ids=("$@")
  fi
fi

if [[ ${#script_ids[@]} -gt 0 ]]; then
  echo "Processing ${#script_ids[@]} script IDs from command line/file..."
  projects=""
  for entry in "${script_ids[@]}"; do
    # Parse entry: could be "SCRIPT_ID" or "SCRIPT_ID Project Name"
    read -r id title <<< "$entry"
    
    if [[ -z "$title" ]]; then
      echo "Fetching project info for $id..."
      # Try to get the project title using clasp API
      project_title="Apps-Script-Project"
      
      # Method 1: Try to get project metadata via Google Apps Script API
      # This requires making a temp clone to access clasp commands with the project context
      temp_dir=$(mktemp -d)
      if (cd "$temp_dir" && clasp clone "$id" >/dev/null 2>&1); then
        # Look for meaningful names in the main script files
        main_files=()
        while IFS= read -r -d '' file; do
          main_files+=($(basename "$file" .js))
        done < <(find "$temp_dir" -name "*.js" -print0 | head -3)
        
        if [[ ${#main_files[@]} -gt 0 ]]; then
          # Use the most descriptive filename (longest or containing specific keywords)
          for file in "${main_files[@]}"; do
            if [[ ${#file} -gt ${#project_title} && "$file" != "Code" ]]; then
              project_title="$file"
            fi
          done
          # Prefer files with meaningful names
          for file in "${main_files[@]}"; do
            if [[ "$file" =~ (main|index|app|project|form|entry) ]]; then
              project_title="$file"
              break
            fi
          done
        fi
      fi
      rm -rf "$temp_dir"
      title="$project_title"
    else
      echo "Using provided name '$title' for $id"
    fi
    
    projects+=$(jq -nc --arg id "$id" --arg title "$title" '{scriptId:$id,title:$title}')$'\n'
  done
else
  echo "Auto-discovering Apps Script projects..."
  # Get projects list as JSON
  LIST_JSON="$(clasp list --json 2>/dev/null)"

  if [[ -z "$LIST_JSON" || "$LIST_JSON" == "[]" ]]; then
    echo "No Apps Script projects found via 'clasp list'."
    echo ""
    echo "This might happen if:"
    echo "1. You don't have any projects yet"
    echo "2. Projects were created in a different Google account"
    echo "3. Projects need manual access"
    echo ""
    echo "Solutions:"
    echo "1. Create a new project: clasp create --title 'My Project'"
    echo "2. Visit https://script.google.com to see your projects"
    echo "3. Use script IDs directly: $0 <SCRIPT_ID1> <SCRIPT_ID2> ..."
    echo "4. Create $SCRIPT_IDS_FILE with one script ID per line, then run: $0 --from-file $SCRIPT_IDS_FILE"
    exit 0
  fi

  # Extract individual projects from the JSON array
  projects=$(echo "$LIST_JSON" | jq -c '.[]')
fi

echo "Processing projects..."
count=0
while IFS= read -r proj; do
  [[ -z "$proj" ]] && continue
  scriptId=$(echo "$proj" | jq -r '.scriptId // .id // empty')
  title=$(echo "$proj" | jq -r '.title // .name // "untitled"')
  if [[ -z "$scriptId" || "$scriptId" == "null" ]]; then
    echo "Skipping invalid project entry: $proj" >&2
    continue
  fi

  # sanitize directory name
  safe_title=$(echo "$title" | tr ' /\\' '_' | tr -cd '[:alnum:]_.-')
  # Use just the project name, or add short ID suffix if there might be conflicts
  dir="$OUT_DIR/${safe_title}"

  if [[ -d "$dir/.clasp" || -d "$dir" && -f "$dir/.clasp" ]]; then
    echo "Updating existing project: $title ($scriptId)"
    (cd "$dir" && clasp pull) || echo "Warning: clasp pull failed for $dir" >&2
  else
    echo "Cloning project: $title ($scriptId) -> $dir"
    mkdir -p "$dir"
    # clasp clone requires --rootDir optionally; change into dir and run
    (cd "$dir" && clasp clone "$scriptId") || {
      echo "clasp clone failed for $scriptId, removing dir" >&2
      rm -rf "$dir"
      continue
    }
  fi
  count=$((count+1))
done < <(echo "$projects")

echo "Processed $count projects. Files are in $OUT_DIR"