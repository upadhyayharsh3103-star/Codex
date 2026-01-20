# Deploy to Render in 3 Easy Steps

## Step 1: Push to GitHub
```bash
git add .
git commit -m "Cloud Browser - Production Ready"
git push -u origin main
```

## Step 2: Connect to Render
1. Go to https://render.com and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Select **"Deploy from GitHub repo"**
4. Find and select your `cloud-browser` repository
5. Render will auto-detect the `render.yaml` configuration

## Step 3: That's It! 🎉
- Render automatically creates a PostgreSQL database
- Deploys your Docker container
- Sets up the environment variables
- Your app is live at: `https://cloud-browser-xxxxx.onrender.com`

## What's Included
✅ VNC-enabled Chromium browser in Docker  
✅ PostgreSQL database with auto-configuration  
✅ Redis-compatible storage for sessions  
✅ WebSocket support for VNC streaming  
✅ Automatic SSL/HTTPS  
✅ Auto-deploy on git push  

## Browser Access
Once deployed, visit your Render URL:
- **Web Interface**: https://cloud-browser-xxxxx.onrender.com
- **Connect to Browser**: Click "Connect to Browser" button
- **Full VNC Access**: Real-time remote browser control

## Performance Notes
- **Free Tier**: Services spin down after 15 minutes of inactivity (~30s cold start)
- **Paid Tier**: Always-on, recommended for production
- **Resources**: Standard plan includes 0.5 CPU + 1GB RAM (sufficient for browser)

## Customization
To modify deployment settings, edit `render.yaml`:
- Change `plan:` to `pro` or `premium` for production
- Adjust `region:` for lower latency (tokyo, london, sydney, etc.)
- Scale `numInstances:` for load balancing

## Troubleshooting
If the app doesn't start:
1. Check the Render dashboard logs
2. Verify `DATABASE_URL` is set in environment
3. Ensure `PORT` is set to 5000
4. Check that `DISPLAY=:99` is configured

Need help? See `DEPLOYMENT_GUIDE.md` for detailed information.
