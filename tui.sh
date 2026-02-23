#!/bin/bash
# Launch md-browse TUI
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/tui/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Setting up Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install -q -r "$SCRIPT_DIR/tui/requirements.txt"
fi

cd "$SCRIPT_DIR"
exec "$VENV_DIR/bin/python" -m tui "$@"
