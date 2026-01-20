#!/bin/bash

# Replit-compatible startup script for Cloud Browser
# This runs in Replit's Nix environment (not Docker)

export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-5000}
export DISPLAY=${DISPLAY:-:99}
export HOME=${HOME:-/home/runner}

echo "🚀 Starting Cloud Browser on Replit..."
echo "   Port: $PORT"
echo "   Environment: $NODE_ENV"

# Create necessary directories
mkdir -p "$HOME/cloud-browser-data" /tmp/.X11-unix /var/run/dbus 2>/dev/null || true

# Clean up any stale processes
pkill -9 Xvfb 2>/dev/null || true
pkill -9 x11vnc 2>/dev/null || true
pkill -9 chromium 2>/dev/null || true

sleep 1

# Start the Node server
exec node server.js
