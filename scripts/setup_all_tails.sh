#!/bin/bash
TOURNAMENT="${1:-WM Phoenix Open}"
SEEDS=("${@:2}")
SESSION="all_tails"
LOG_PATHS=()
USE_LOG_PATHS=false

# Sample usage:
# cd /workspaces/GoogleAppScripts/apps-scripts/modelOptimizer && bash ../../setup_all_tails.sh "WM Phoenix Open" a b c d e
# Or pass explicit log paths:
# ./scripts/setup_all_tails.sh /abs/path/seed-a.log /abs/path/seed-b.log

tmux kill-session -t $SESSION 2>/dev/null
cd /workspaces/GoogleAppScripts/apps-scripts/modelOptimizer

normalize_slug() {
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/&/and/g' -e 's/[^a-z0-9]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-\|-$//g'
}

normalize_prefix() {
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/&/and/g' -e 's/[^a-z0-9]/_/g' -e 's/_\{2,\}/_/g' -e 's/^_\|_$//g'
}

if [ ${#SEEDS[@]} -eq 0 ]; then
  SEEDS=(a b c d e)
fi

if [[ "$TOURNAMENT" == *".log"* ]] || [[ "$TOURNAMENT" == /* ]] || [[ "$TOURNAMENT" == ./* ]]; then
  USE_LOG_PATHS=true
  LOG_PATHS=("$@")
fi

if [ "$USE_LOG_PATHS" = true ]; then
  if [ ${#LOG_PATHS[@]} -eq 0 ]; then
    echo "No log paths provided." >&2
    exit 1
  fi
  for log_path in "${LOG_PATHS[@]}"; do
    mkdir -p "$(dirname "$log_path")"
    touch "$log_path"
  done

  tmux new-session -d -s $SESSION

  for ((i=1; i<${#LOG_PATHS[@]}; i++)); do
    tmux split-window -t $SESSION
    tmux select-layout -t $SESSION tiled
  done

  PANES=( $(tmux list-panes -t $SESSION -F '#{pane_id}') )
  for idx in "${!LOG_PATHS[@]}"; do
    tmux send-keys -t ${PANES[$idx]} "tail -F ${LOG_PATHS[$idx]}" C-m
  done

  tmux attach -t $SESSION
  exit 0
fi

SLUG=$(normalize_slug "$TOURNAMENT")
PREFIX=$(normalize_prefix "$TOURNAMENT")
LOG_DIR="output"

POST_SEED_DIR="data/2026/${SLUG}/post_event/seed_runs"
if [ -d "$POST_SEED_DIR" ]; then
  LOG_DIR="$POST_SEED_DIR"
fi

# Detect existing prefix/tag from available logs (first matching seed)
DETECTED_PREFIX=""
DETECTED_TAG=""
for seed in "${SEEDS[@]}"; do
  candidate=$(ls "$LOG_DIR"/*_seed-${seed}_*run.log 2>/dev/null | head -n 1)
  if [ -n "$candidate" ]; then
    base=$(basename "$candidate")
    DETECTED_PREFIX=${base%%_seed-${seed}_*}
    if echo "$base" | grep -q "_LOEO_"; then
      DETECTED_TAG="_LOEO"
    elif echo "$base" | grep -q "_KFOLDS_"; then
      DETECTED_TAG="_KFOLDS"
    fi
    break
  fi
done

if [ -n "$DETECTED_PREFIX" ]; then
  PREFIX="$DETECTED_PREFIX"
fi

# Touch log files to ensure they exist
for seed in "${SEEDS[@]}"; do
  touch "$LOG_DIR/${PREFIX}_seed-${seed}${DETECTED_TAG}_run.log"
done

tmux new-session -d -s $SESSION


# Split horizontally to create 3 columns
tmux split-window -h -t $SESSION:0
tmux split-window -h -t $SESSION:0
tmux select-layout -t $SESSION tiled

# Split each column vertically to create 2 rows per column
tmux select-pane -t 0
tmux split-window -v -t $SESSION
tmux select-pane -t 1
tmux split-window -v -t $SESSION
tmux select-pane -t 2
tmux split-window -v -t $SESSION
tmux select-layout -t $SESSION tiled

# Get actual pane IDs
PANES=( $(tmux list-panes -t $SESSION -F '#{pane_id}') )

# Assign logs to available panes
for idx in "${!SEEDS[@]}"; do
  tmux send-keys -t ${PANES[$idx]} "tail -F $LOG_DIR/${PREFIX}_seed-${SEEDS[$idx]}${DETECTED_TAG}_run.log" C-m
done

# Auto-close the last (empty) pane if more panes than seeds
if [ ${#PANES[@]} -gt ${#SEEDS[@]} ]; then
  tmux send-keys -t ${PANES[-1]} "exit" C-m
fi

tmux attach -t $SESSION