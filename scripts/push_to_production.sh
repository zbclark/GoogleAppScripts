#!/usr/bin/env bash
# Push local changes back to Google Apps Script production environment
# Usage:
#   ./push_to_production.sh                    # Push all projects
#   ./push_to_production.sh ProjectName        # Push specific project
#   ./push_to_production.sh --list             # List available projects

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="$ROOT_DIR/apps-scripts"

command -v clasp >/dev/null 2>&1 || { echo "clasp is not installed. Install with: npm i -g @google/clasp" >&2; exit 1; }

# Function to push a single project
push_project() {
    local project_dir="$1"
    local project_name=$(basename "$project_dir")
    
    if [[ ! -f "$project_dir/.clasp.json" ]]; then
        echo "❌ No .clasp.json found in $project_name - skipping"
        return 1
    fi
    
    local script_id=$(jq -r '.scriptId' "$project_dir/.clasp.json")
    echo "🚀 Pushing $project_name (ID: $script_id)..."
    
    if (cd "$project_dir" && clasp push); then
        echo "✅ Successfully pushed $project_name"
        return 0
    else
        echo "❌ Failed to push $project_name"
        return 1
    fi
}

# Function to list all projects
list_projects() {
    echo "📋 Available projects:"
    for dir in "$APPS_DIR"/*/; do
        if [[ -d "$dir" ]]; then
            local name=$(basename "$dir")
            local script_id="N/A"
            if [[ -f "$dir/.clasp.json" ]]; then
                script_id=$(jq -r '.scriptId' "$dir/.clasp.json" 2>/dev/null || echo "Invalid")
            fi
            echo "   • $name ($script_id)"
        fi
    done
}

# Function to deploy (create new version)
deploy_project() {
    local project_dir="$1"
    local project_name=$(basename "$project_dir")
    local description="${2:-Deployed from local repository $(date)}"
    
    echo "📦 Creating deployment for $project_name..."
    
    if (cd "$project_dir" && clasp deploy --description "$description"); then
        echo "✅ Successfully deployed $project_name"
        return 0
    else
        echo "❌ Failed to deploy $project_name"
        return 1
    fi
}

# Main script logic
case "${1:-}" in
    --list|-l)
        list_projects
        exit 0
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS] [PROJECT_NAME]"
        echo ""
        echo "OPTIONS:"
        echo "  --list, -l           List all available projects"
        echo "  --deploy, -d         Push and create deployment"
        echo "  --help, -h           Show this help message"
        echo ""
        echo "EXAMPLES:"
        echo "  $0                           # Push all projects"
        echo "  $0 ADS_Sales_Operations      # Push specific project"
        echo "  $0 --deploy Golf_Algorithm   # Push and deploy specific project"
        echo "  $0 --list                    # List all projects"
        exit 0
        ;;
    --deploy|-d)
        if [[ $# -lt 2 ]]; then
            echo "Error: --deploy requires a project name" >&2
            exit 1
        fi
        project_name="$2"
        project_dir="$APPS_DIR/$project_name"
        
        if [[ ! -d "$project_dir" ]]; then
            echo "❌ Project '$project_name' not found" >&2
            list_projects
            exit 1
        fi
        
        push_project "$project_dir" && deploy_project "$project_dir"
        exit $?
        ;;
    "")
        # Push all projects
        echo "🚀 Pushing all Google Apps Script projects to production..."
        echo "Logged in as: $(clasp show-authorized-user 2>/dev/null || echo "Not logged in")"
        echo ""
        
        success_count=0
        total_count=0
        
        for project_dir in "$APPS_DIR"/*/; do
            if [[ -d "$project_dir" ]]; then
                total_count=$((total_count + 1))
                if push_project "$project_dir"; then
                    success_count=$((success_count + 1))
                fi
                echo
            fi
        done
        
        echo "📊 Summary: $success_count/$total_count projects pushed successfully"
        [[ $success_count -eq $total_count ]] && exit 0 || exit 1
        ;;
    *)
        # Push specific project
        project_name="$1"
        project_dir="$APPS_DIR/$project_name"
        
        if [[ ! -d "$project_dir" ]]; then
            echo "❌ Project '$project_name' not found" >&2
            echo ""
            list_projects
            exit 1
        fi
        
        echo "🚀 Pushing $project_name to production..."
        echo "Logged in as: $(clasp show-authorized-user 2>/dev/null || echo "Not logged in")"
        echo ""
        
        push_project "$project_dir"
        exit $?
        ;;
esac