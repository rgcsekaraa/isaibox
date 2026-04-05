#!/bin/bash
# =============================================================================
#  stop.sh — Stop Airflow processes
# =============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
AIRFLOW_HOME="$PROJECT_DIR/airflow_home"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stopping Airflow Services"
echo "  Home: $AIRFLOW_HOME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Find and kill PIDs
find "$AIRFLOW_HOME" -name "*.pid" -print | while read pid_file; do
    pid=$(cat "$pid_file")
    echo "Stopping process $pid (from $pid_file)..."
    kill "$pid" 2>/dev/null || echo "Process $pid already stopped."
    rm "$pid_file"
done

# Secondary cleanup for any lingering gunicorn/airflow processes
pkill -f "airflow" || true
pkill -f "gunicorn" || true

echo "✅  All Airflow services stopped."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
