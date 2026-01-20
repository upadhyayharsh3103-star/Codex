#!/bin/bash

DISPLAY_NUM=99
VNC_PORT=5900

# Read browser count from config file (default to 1)
BROWSER_CONFIG="$HOME/.browser-config.json"
if [ -f "$BROWSER_CONFIG" ]; then
  # Use proper JSON parsing with node
  BROWSER_COUNT=$(node -e "try { console.log(require('$BROWSER_CONFIG').browserCount || 1); } catch(e) { console.log(1); }" 2>/dev/null)
  BROWSER_COUNT=${BROWSER_COUNT:-1}
else
  BROWSER_COUNT=1
fi

# Set resolution based on browser count
case $BROWSER_COUNT in
  2) RESOLUTION="1280x720" ;;
  3) RESOLUTION="1280x960" ;;
  *) RESOLUTION="1280x720" ;;
esac

echo "Browser Config: Running $BROWSER_COUNT browser(s) at ${RESOLUTION}"

# Force kill any existing processes
pkill -9 Xvfb 2>/dev/null
pkill -9 x11vnc 2>/dev/null
pkill -9 chromium 2>/dev/null

# Clean up X11 locks and sockets
rm -f /tmp/.X${DISPLAY_NUM}-lock 2>/dev/null
rm -f /tmp/.X11-unix/X${DISPLAY_NUM} 2>/dev/null
rm -f /tmp/.lock-X${DISPLAY_NUM} 2>/dev/null

sleep 2

PROFILE_DIR="$HOME/cloud-browser-data"

echo "Setting up permanent browser profile..."
mkdir -p "$PROFILE_DIR"

echo "Cleaning up only lock files (keeping login data)..."
rm -rf "$PROFILE_DIR/SingletonLock" 2>/dev/null
rm -rf "$PROFILE_DIR/SingletonSocket" 2>/dev/null
rm -rf "$PROFILE_DIR/SingletonCookie" 2>/dev/null

echo "Starting virtual display :$DISPLAY_NUM..."
Xvfb :$DISPLAY_NUM -screen 0 ${RESOLUTION}x24 -ac -nolisten tcp &
XVFB_PID=$!
export DISPLAY=:$DISPLAY_NUM

sleep 2

echo "Starting x11vnc on port $VNC_PORT..."
x11vnc -display :$DISPLAY_NUM -forever -shared -rfbport $VNC_PORT -nopw \
  -wait 2 -defer 2 -threads -nobell -noxinerama > /tmp/x11vnc.log 2>&1 &
X11VNC_PID=$!

sleep 3

if ! kill -0 $X11VNC_PID 2>/dev/null; then
  echo "ERROR: x11vnc process died"
  cat /tmp/x11vnc.log 2>/dev/null | tail -20
  exit 1
fi

PORT_READY=0
for i in {1..20}; do
  if (ss -tuln 2>/dev/null | grep -q ":$VNC_PORT "); then
    PORT_READY=1
    break
  fi
  sleep 1
done

if [ $PORT_READY -eq 1 ]; then
  echo "✅ x11vnc started successfully on port $VNC_PORT (PID $X11VNC_PID)"
else
  echo "⚠️  x11vnc process running but port may not be fully ready. Continuing anyway..."
fi

# Calculate window positions and sizes based on browser count
if [ "$BROWSER_COUNT" = "1" ]; then
  WINDOWS=("--window-size=1280,720")
elif [ "$BROWSER_COUNT" = "2" ]; then
  WINDOWS=("--window-position=0,0 --window-size=640,720" "--window-position=640,0 --window-size=640,720")
elif [ "$BROWSER_COUNT" = "3" ]; then
  WINDOWS=("--window-position=0,0 --window-size=426,960" "--window-position=426,0 --window-size=426,960" "--window-position=852,0 --window-size=426,960")
fi

echo "Starting $BROWSER_COUNT Chromium browser(s) with low-resource optimization..."

PIDS=()
for i in $(seq 0 $((BROWSER_COUNT - 1))); do
  chromium --user-data-dir="$PROFILE_DIR/browser-$i" \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-extensions \
    --disable-sync \
    --disable-breakpad \
    --disable-default-apps \
    --disable-plugins \
    --disable-preconnect \
    --disable-background-networking \
    --disable-component-update \
    --disable-hang-monitor \
    --disable-client-side-phishing-detection \
    --no-default-browser-check \
    --no-pings \
    ${WINDOWS[$i]} \
    --no-first-run \
    --disable-first-run-ui \
    --enable-features=NetworkService,NetworkServiceInProcess,V8CodeCache \
    --disable-features=RendererCodeIntegrity,TranslateUI \
    --disable-session-crashed-bubble \
    "https://www.google.com" &
  PIDS+=($!)
  echo "Chromium browser $((i+1)) started with PID ${PIDS[$i]}"
  sleep 1
done

echo "VNC server ready on port $VNC_PORT"
echo "Display: $DISPLAY"
echo "Running $BROWSER_COUNT browser(s)"

# Keep services running
while kill -0 $X11VNC_PID 2>/dev/null || kill -0 ${PIDS[0]} 2>/dev/null; do
  sleep 60
  if ! kill -0 $X11VNC_PID 2>/dev/null; then
    echo "x11vnc crashed, restarting..."
    x11vnc -display :$DISPLAY_NUM -forever -shared -rfbport $VNC_PORT -nopw \
      -wait 2 -defer 2 -threads -nobell > /tmp/x11vnc.log 2>&1 &
    X11VNC_PID=$!
    sleep 2
  fi
done
