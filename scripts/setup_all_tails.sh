#!/bin/bash
TOURNAMENT="${1:-WM Phoenix Open}"
SEEDS=("${@:2}")
SESSION="all_tails"

# Sample usage:
# cd /workspaces/GoogleAppScripts/apps-scripts/weightSensitivity && bash ../../setup_all_tails.sh "WM Phoenix Open" a b c d e

tmux kill-session -t $SESSION 2>/dev/null
cd /workspaces/GoogleAppScripts/apps-scripts/weightSensitivity

# Normalize tournament name for file prefix
PREFIX=$(echo "$TOURNAMENT" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')

# Touch log files to ensure they exist
for seed in "${SEEDS[@]}"; do
  touch output/${PREFIX}_seed-${seed}_run.log
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
  tmux send-keys -t ${PANES[$idx]} "tail -F output/${PREFIX}_seed-${SEEDS[$idx]}_run.log" C-m
done

# Auto-close the last (empty) pane if more panes than seeds
if [ ${#PANES[@]} -gt ${#SEEDS[@]} ]; then
  tmux send-keys -t ${PANES[-1]} "exit" C-m
fi

tmux attach -t $SESSION