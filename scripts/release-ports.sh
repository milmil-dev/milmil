#!/bin/bash
# Release ports used by milmil dev servers
# Kills air parent + server children by process group, preventing respawn
# Reads API_PORT from api/.env (defaults to 8080)
# Usage: make kill

API_PORT=$(grep -m1 '^API_PORT=' api/.env 2>/dev/null | cut -d= -f2)
API_PORT=${API_PORT:-8080}

# Find server PIDs and their parent (air) PIDs, kill entire process groups
for pid in $(pgrep -f "api/tmp/server" 2>/dev/null); do
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
    kill -- -"$pgid" 2>/dev/null && echo "Killed process group $pgid"
  else
    kill -9 "$pid" 2>/dev/null
  fi
done

# Also kill any standalone air processes
pkill -9 -f "air" 2>/dev/null

# Final sweep: kill anything still on the port
sleep 0.5
pids=$(lsof -ti:"$API_PORT" -sTCP:LISTEN 2>/dev/null)
if [ -n "$pids" ]; then
  echo "Port $API_PORT: killing remaining listeners"
  echo "$pids" | xargs kill -9 2>/dev/null
else
  echo "Port $API_PORT: free"
fi
