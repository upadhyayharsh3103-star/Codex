# Cloud Browser Mobile App - Build Guide

This guide explains how to build the Cloud Browser mobile app (APK) for Android.

## Prerequisites

Before building, you need:

1. **Node.js** (v18 or later)
2. **Android Studio** (latest version)
3. **Java JDK 17** or later
4. **Android SDK** (installed via Android Studio)

## Quick Start

### Step 1: Install Dependencies

```bash
cd mobile-app
npm install
```

### Step 2: Add Android Platform

```bash
npx cap add android
```

### Step 3: Sync Web Assets

```bash
npx cap sync
```

### Step 4: Build Debug APK

**Option A: Using Command Line**
```bash
cd android
./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

**Option B: Using Android Studio**
```bash
npx cap open android
```
Then in Android Studio:
1. Wait for Gradle sync
2. Go to Build > Build Bundle(s) / APK(s) > Build APK(s)
3. Find APK in `android/app/build/outputs/apk/debug/`

## Building Release APK (For Distribution)

### Step 1: Generate Signing Key (First Time Only)

```bash
keytool -genkey -v -keystore cloud-browser-release.keystore -alias cloud-browser -keyalg RSA -keysize 2048 -validity 10000
```

### Step 2: Configure Signing in Android Studio

1. Open `android/` in Android Studio
2. Go to Build > Generate Signed Bundle/APK
3. Select APK
4. Choose your keystore file
5. Enter passwords and alias
6. Select release build variant
7. Click Finish

The signed APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

## App Configuration

### Changing App Name
Edit `capacitor.config.json`:
```json
{
  "appName": "Your App Name"
}
```

### Changing Package ID
Edit `capacitor.config.json`:
```json
{
  "appId": "com.yourcompany.appname"
}
```

After changing, run:
```bash
npx cap sync
```

## Adding App Icon

1. Create a 1024x1024 PNG icon
2. Save it as `resources/icon.png`
3. Install capacitor assets:
   ```bash
   npm install @capacitor/assets --save-dev
   ```
4. Generate icons:
   ```bash
   npx capacitor-assets generate --android
   ```

## Updating the App

After making changes to web files:
```bash
npx cap sync
```

Then rebuild the APK.

## Troubleshooting

### "SDK location not found"
Set the `ANDROID_HOME` environment variable:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

### "Gradle build failed"
1. Open Android Studio
2. Go to File > Sync Project with Gradle Files
3. Try building again

### "App crashes on startup"
- Make sure your Cloud Browser server is running
- Check that the server URL is correct
- Ensure HTTPS is enabled on your server

## How the App Works

1. User enters their Cloud Browser server URL
2. App saves recent servers for quick access
3. App loads the VNC viewer in a WebView
4. Full touch/mouse support for browser control
5. Quality settings adjust bandwidth usage

## Server Requirements

Your Cloud Browser server must:
- Be deployed and accessible via HTTPS
- Have the noVNC interface at `/novnc/vnc.html`
- Have the WebSocket proxy at `/websockify`
- Support cross-origin requests from the app

## Installing the APK

### On Android Device:
1. Transfer the APK file to your device
2. Open the file manager and find the APK
3. Tap to install (enable "Unknown sources" if prompted)

### Using ADB:
```bash
adb install app-debug.apk
```

## Publishing to Google Play

1. Build a signed release APK or AAB
2. Create a Google Play Developer account ($25 one-time fee)
3. Go to Google Play Console
4. Create a new app
5. Upload your signed APK/AAB
6. Fill in store listing details
7. Submit for review

## Support

For issues with the mobile app, check:
1. Server is running and accessible
2. Internet connection is stable
3. VNC connection settings are correct
