#!/bin/bash
set -e

# ╔════════════════════════════════════════════════════════════════╗
# ║     Cloud Browser - Production Docker Startup Script           ║
# ║     Production-grade initialization for Render & Docker        ║
# ╚════════════════════════════════════════════════════════════════╝

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🚀 Cloud Browser - Production Startup                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────────────────────────
# 1. ENVIRONMENT SETUP
# ─────────────────────────────────────────────────────────────────

export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-5000}
export DISPLAY=${DISPLAY:-:99}
export HOME=${HOME:-/app}

echo "📋 Environment Configuration:"
echo "   • Node Environment: $NODE_ENV"
echo "   • Server Port: $PORT"
echo "   • Display: $DISPLAY"
echo "   • Home Directory: $HOME"
echo ""

# ─────────────────────────────────────────────────────────────────
# 2. SYSTEM CHECKS
# ─────────────────────────────────────────────────────────────────

echo "✓ System Checks:"

# Check if required tools are available
if ! command -v Xvfb &> /dev/null; then
  echo "  ❌ Xvfb not found - installing..."
  apt-get update && apt-get install -y xvfb > /dev/null 2>&1
fi

if ! command -v x11vnc &> /dev/null; then
  echo "  ❌ x11vnc not found - installing..."
  apt-get update && apt-get install -y x11vnc > /dev/null 2>&1
fi

if ! command -v chromium &> /dev/null && ! command -v chromium-browser &> /dev/null; then
  echo "  ❌ Chromium not found - installing..."
  apt-get update && apt-get install -y chromium chromium-browser > /dev/null 2>&1
fi

echo "  ✅ All system dependencies available"
echo ""

# ─────────────────────────────────────────────────────────────────
# 3. DATABASE INITIALIZATION
# ─────────────────────────────────────────────────────────────────

if [ -n "$DATABASE_URL" ]; then
  echo "📦 Database Initialization:"
  echo "   • DATABASE_URL is set"
  
  # Wait for database to be available
  echo "   • Waiting for database connection..."
  for i in {1..30}; do
    if npm run db:push --force 2>&1 | grep -q "✓\|already\|exist"; then
      echo "   ✅ Database schema synchronized"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "   ⚠️  Database not available yet, continuing anyway"
      echo "      (will retry automatically)"
    fi
    sleep 1
  done
else
  echo "📦 Database Configuration:"
  echo "   ⚠️  DATABASE_URL not set"
  echo "      Using local storage only"
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# 4. DIRECTORY SETUP
# ─────────────────────────────────────────────────────────────────

echo "📁 Directory Setup:"
mkdir -p "$HOME/cloud-browser-data" /tmp/.X11-unix /var/run/dbus
echo "   ✅ Created necessary directories"
echo ""

# ─────────────────────────────────────────────────────────────────
# 5. CLEAN UP STALE LOCKS
# ─────────────────────────────────────────────────────────────────

echo "🧹 Cleanup:"
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 /var/run/dbus/pid 2>/dev/null || true
pkill -9 Xvfb 2>/dev/null || true
pkill -9 x11vnc 2>/dev/null || true
pkill -9 chromium 2>/dev/null || true
echo "   ✅ Cleared stale processes and locks"
echo ""

# ─────────────────────────────────────────────────────────────────
# 6. STARTUP MESSAGE
# ─────────────────────────────────────────────────────────────────

echo "🎬 Starting Cloud Browser Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Service Information:"
echo "   • Web Interface: http://0.0.0.0:$PORT"
echo "   • Health Check: http://0.0.0.0:$PORT/health"
echo "   • VNC Server: localhost:5900"
echo "   • Storage: $HOME/cloud-browser-data"
echo ""
echo "🔗 Available Endpoints:"
echo "   • Browser UI: http://localhost:$PORT"
echo "   • Storage Dashboard: http://localhost:$PORT/storage-dashboard.html"
echo "   • Profile Manager: http://localhost:$PORT/manager.html"
echo "   • Auto-Save Dashboard: http://localhost:$PORT/autosave-dashboard.html"
echo "   • AI Agent: http://localhost:$PORT/ai-agent.html"
echo ""
echo "✅ Ready to accept connections!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─────────────────────────────────────────────────────────────────
# 7. START NODE SERVER
# ─────────────────────────────────────────────────────────────────

# Enable graceful shutdown
trap 'echo "Shutting down gracefully..."; kill -TERM $!; exit 0' TERM INT

# Start the application
exec node server.js
