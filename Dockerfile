FROM node:20-slim

# ╔════════════════════════════════════════════════════════════════╗
# ║  Cloud Browser - Production Dockerfile                         ║
# ║  Optimized for Render, Railway, Fly.io, and Docker             ║
# ╚════════════════════════════════════════════════════════════════╝

LABEL maintainer="Cloud Browser Team"
LABEL description="Cloud-based remote browser with VNC streaming"

# Install system dependencies for X11, VNC, and Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    chromium \
    chromium-browser \
    xdotool \
    fonts-liberation \
    fonts-noto-cjk \
    dbus-x11 \
    procps \
    psmisc \
    ca-certificates \
    curl \
    wget \
    net-tools \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install production dependencies with npm ci for reproducible builds
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY . .

# Make scripts executable
RUN chmod +x start-vnc.sh docker-entrypoint.sh

# Create necessary directories
RUN mkdir -p /app/cloud-browser-data /tmp/.X11-unix /var/run/dbus

# Set up environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99
ENV PORT=5000
ENV HOME=/app
ENV PATH=/app/node_modules/.bin:$PATH

# Health check - verify server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port for web interface
EXPOSE 5000

# Use entrypoint script for proper initialization
ENTRYPOINT ["/app/docker-entrypoint.sh"]
