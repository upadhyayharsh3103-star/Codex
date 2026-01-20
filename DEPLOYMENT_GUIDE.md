# Cloud Browser Deployment Guide

This guide explains how to deploy the Cloud Browser application to various platforms.

## Requirements

This application requires:
- Node.js 18+
- Chromium browser
- Xvfb (virtual framebuffer)
- x11vnc (VNC server)
- xdotool (for keyboard simulation)

## Deployment Options

### Option 1: Render.com (Recommended for Docker)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Deploy on Render**
   - Go to [render.com](https://render.com) and sign up/login
   - Click "New +" > "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect the `render.yaml` and `Dockerfile`
   - Add environment variable: `DATABASE_URL` (your PostgreSQL connection string)
   - Click "Create Web Service"

3. **Set up Database**
   - In Render dashboard, create a new PostgreSQL database
   - Copy the connection string to your web service's `DATABASE_URL` env var

### Option 2: Railway.app

1. **Push to GitHub** (same as above)

2. **Deploy on Railway**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" > "Deploy from GitHub repo"
   - Select your repository
   - Railway will build using the Dockerfile
   - Add PostgreSQL database from the Railway dashboard
   - The `DATABASE_URL` will be automatically injected

### Option 3: Fly.io

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Deploy**
   ```bash
   fly auth login
   fly launch --dockerfile Dockerfile
   fly secrets set DATABASE_URL="your-postgresql-url"
   fly deploy
   ```

### Option 4: Import to Replit

1. **Download the deployment package**
   - Run: `node scripts/create-deployment-package.js`
   - Find the ZIP file in `deployments/` folder

2. **Import to Replit**
   - Go to [replit.com](https://replit.com)
   - Click "Create Repl"
   - Choose "Import from Zip"
   - Upload the deployment package ZIP
   - The Replit environment will need to be configured for Nix packages

### Option 5: Docker (Self-hosted)

1. **Build the image**
   ```bash
   docker build -t cloud-browser .
   ```

2. **Run the container**
   ```bash
   docker run -d \
     -p 5000:5000 \
     -e DATABASE_URL="your-postgresql-url" \
     -e NODE_ENV=production \
     --name cloud-browser \
     cloud-browser
   ```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `DATABASE_URL` | Yes* | PostgreSQL connection string |
| `NODE_ENV` | No | Environment mode (production/development) |

*Required for enhanced profile management with database storage

## Important Notes

### VNC Requirements
This app runs a full Chromium browser inside a virtual display. The host system must support:
- X11 virtual framebuffer (Xvfb)
- VNC server (x11vnc)
- Chromium browser

### Resource Requirements
- **RAM**: Minimum 1GB, recommended 2GB+
- **CPU**: At least 1 vCPU
- **Storage**: 500MB for app + browser data

### Free Tier Limitations
Most free tiers (Render, Railway) have limitations:
- Services spin down after inactivity
- Cold starts take 30+ seconds
- Limited RAM may cause browser crashes

Consider paid plans for production use.

## Troubleshooting

### "Cannot connect to VNC"
- Ensure Xvfb and x11vnc are properly installed
- Check if port 5900 is available internally
- Review logs: `docker logs cloud-browser`

### "Browser not loading"
- Verify Chromium is installed
- Check display environment variable: `echo $DISPLAY`
- Ensure no sandbox conflicts: `--no-sandbox` flag

### "Database connection failed"
- Verify DATABASE_URL is correctly formatted
- Ensure PostgreSQL server is accessible
- Check SSL requirements for the database

## Support

For issues specific to this deployment, check the logs and ensure all system dependencies are properly installed in your Docker/container environment.
