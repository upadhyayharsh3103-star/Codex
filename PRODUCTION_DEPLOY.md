# Production Deployment - Complete Setup

## 🚀 Deploy to Render (Easiest)

### Step 1: Push to GitHub
```bash
rm -f .git/index.lock
git pull origin main --rebase
git push origin main
```

### Step 2: Connect to Render
1. Go to https://render.com
2. Click **"New +"** → **"Web Service"**
3. Select your GitHub repository
4. Render auto-detects `render.yaml`
5. Click **"Create Web Service"**

### Step 3: Wait & Done! ✅
- Render builds the Docker image
- PostgreSQL database created automatically
- App deployed with auto-SSL
- Live at: `https://cloud-browser-xxxxx.onrender.com`

---

## 🐳 Startup Sequence

The entrypoint script does this automatically:

1. ✅ **Environment Setup** - Validates all variables
2. ✅ **System Checks** - Verifies X11, VNC, Chromium
3. ✅ **Database Init** - Syncs schema (retries 30 times)
4. ✅ **Directory Setup** - Creates all needed folders
5. ✅ **Cleanup** - Removes stale locks/processes
6. ✅ **Server Start** - Starts Node.js server
7. ✅ **Health Check** - Auto-monitors health

---

## 📋 What's Included

### Startup Command
```bash
docker-entrypoint.sh → node server.js
```

### Services
- ✅ Node.js Server (Port 5000)
- ✅ X11 Virtual Display (Xvfb)
- ✅ VNC Server (x11vnc on port 5900)
- ✅ Chromium Browser
- ✅ PostgreSQL Database
- ✅ Health Check Endpoint

### Auto-Features
- ✅ Database schema auto-sync
- ✅ Auto-restart on crash
- ✅ Graceful shutdown
- ✅ Health monitoring
- ✅ Error logging
- ✅ Process cleanup

---

## 🔧 Advanced Configuration

### Change Region
Edit `render.yaml`:
```yaml
region: london  # or: tokyo, sydney, frankfurt, singapore, etc.
```

### Increase Resources
```yaml
plan: pro  # or: premium
```

### Environment Variables
Add to `render.yaml`:
```yaml
envVars:
  - key: CUSTOM_VAR
    value: "value"
```

---

## 🐛 Troubleshooting

### App won't start
Check logs in Render dashboard:
1. Go to Render dashboard
2. Click your service
3. View "Logs" tab
4. Look for errors in startup output

### Database errors
```
Error: connect ECONNREFUSED
```
- Database is starting, wait 30 seconds
- Check DATABASE_URL format: `postgresql://user:pass@host/db`

### VNC not connecting
- VNC requires X11 (works on Render)
- If fails, server still works via web
- Check browser console for errors

### Port conflicts
Change PORT in render.yaml:
```yaml
PORT: "8000"  # Use different port
```

---

## 📊 Monitoring

### Health Check
- Endpoint: `/health`
- Frequency: Every 30 seconds
- Timeout: 10 seconds
- Auto-restarts on failure

### Logs
- Render dashboard → Logs tab
- Real-time streaming
- Full error traces
- Search functionality

### Metrics
- CPU usage
- Memory usage
- Request duration
- Error rates

---

## 🔐 Security

- ✅ Node.js in production mode
- ✅ Auto-SSL/HTTPS via Render
- ✅ Database encrypted connection
- ✅ Environment variables stored securely
- ✅ No secrets in code

---

## 💰 Costs

**Render Pricing:**
- **Free Plan**: Services sleep after 15 min inactivity
- **Standard Plan**: $10/month + $15/month DB = $25/month
- **Pro Plan**: $20/month + $15/month DB = $35/month

**Recommendation:** Use Free for testing, Standard for production.

---

## ✅ Verification

After deployment, verify everything:

```bash
# Check health
curl https://cloud-browser-xxxxx.onrender.com/health

# Access UI
# Browser: https://cloud-browser-xxxxx.onrender.com
# Click "Connect to Browser" to test VNC
```

---

## 🎯 Performance Tips

1. **Allocate More RAM**
   - Chromium needs 256MB minimum
   - Render Standard has 1GB (sufficient)
   - Pro plan has more resources

2. **Database Optimization**
   - Free PostgreSQL good for testing
   - Upgrade to paid for production

3. **Enable Caching**
   - Settings → Optimization → Ultra mode
   - Reduces bandwidth usage

---

## Support

Issues? Check:
1. **Render Logs** - First check source
2. **DOCKER_SETUP.md** - Local testing
3. **DEPLOYMENT_GUIDE.md** - Detailed info
4. **render.yaml** - Configuration
5. **docker-entrypoint.sh** - Startup logic

---

**You're ready for production! 🚀**

Your Cloud Browser will:
- Start reliably every time
- Auto-restart if it crashes
- Monitor health continuously
- Handle database initialization
- Serve users 24/7

Deploy with confidence! ✅
