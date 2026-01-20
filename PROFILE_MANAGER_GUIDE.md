# Profile & Session Manager Guide

## Overview

The Cloud Browser now includes a powerful Profile & Session Manager that allows you to save, restore, and manage your complete browser state including:

- **Cookies & Sessions**: All website cookies and active login sessions
- **Local Storage & Session Storage**: Website data stored in the browser
- **IndexedDB**: Structured data stored by web applications
- **Browser History**: Your browsing history
- **Login Credentials**: Saved passwords and authentication tokens
- **Tabs**: Your open tabs and their state
- **Extensions Data**: Any browser extension data

## Key Features

### 1. Save Current Session
Click the "Save Current Session" button to instantly capture your entire browser state. This creates:
- A new profile
- A snapshot of all browser data
- Encrypted backup of your session

### 2. Create Profiles
Profiles are containers for multiple snapshots. Use them to organize different browsing contexts:
- **Work Profile**: For your work-related logins and sessions
- **Personal Profile**: For personal browsing
- **Testing Profile**: For testing different configurations

### 3. Create Snapshots
Snapshots are point-in-time captures of your browser state. Create snapshots:
- Before making major changes
- After logging into important accounts
- When you want to preserve a specific configuration

### 4. Restore Sessions
Restore any snapshot to return your browser to that exact state:
- All cookies and logins will be restored
- Your browsing history will be back
- All website data will be recovered

**Note**: Restoring a snapshot will restart the browser and replace your current session.

### 5. Export & Import
- **Export**: Download snapshot files to back them up offline
- **Import**: Upload previously exported snapshots to restore them

## How OAuth & Login Persistence Works

### Automatic Login Persistence

When you log into websites through the Cloud Browser, your login state is automatically preserved:

1. **Google Accounts**: Log into Gmail, YouTube, Google Drive, etc.
2. **Discord**: Log into Discord servers and DMs
3. **Social Media**: Facebook, Twitter, LinkedIn, etc.
4. **Banking & Finance**: Your banking sessions (use with caution)
5. **Any Website**: All cookies and sessions are saved

### Saving Your Logins

1. Log into your desired websites in the browser
2. Click "Profile Manager" in the header
3. Click "Save Current Session"
4. Give it a meaningful name (e.g., "All My Logins - Jan 2025")
5. Click "Save Session"

Your complete login state is now backed up!

### Restoring Your Logins

1. Go to Profile Manager
2. Find the profile with your saved logins
3. Click "View Snapshots"
4. Click "Restore" on the desired snapshot
5. Wait for the browser to restart

All your logins will be back exactly as they were!

## OAuth Provider Support

The system automatically handles authentication tokens for:

- **Google**: Gmail, YouTube, Drive, Calendar, etc.
- **Discord**: Server access, DMs, voice channels
- **GitHub**: Repository access, actions
- **Microsoft**: Outlook, Office 365, OneDrive
- **Twitter/X**: Tweets, DMs, lists
- **Facebook**: Posts, messages, groups
- **Any OAuth Provider**: Works with any OAuth 2.0 service

## Security Features

### Encryption
- All snapshots are stored as encrypted ZIP archives
- OAuth tokens are encrypted using AES-256-CBC
- Encryption keys are managed securely

### Data Isolation
- Each profile is completely isolated
- Snapshots cannot interfere with each other
- Secure file permissions on all stored data

### Best Practices
1. **Regular Snapshots**: Create snapshots regularly to avoid data loss
2. **Meaningful Names**: Use descriptive names for profiles and snapshots
3. **Export Important Data**: Download critical snapshots for offline backup
4. **Clean Up**: Delete old snapshots you no longer need
5. **Secure Storage**: Keep exported snapshots in a secure location

## API Endpoints

The Profile Manager exposes the following REST API endpoints:

### Profiles
- `GET /api/profiles` - List all profiles
- `POST /api/profiles` - Create a new profile
- `GET /api/profiles/:id` - Get profile details
- `DELETE /api/profiles/:id` - Delete a profile

### Snapshots
- `GET /api/snapshots` - List all snapshots
- `GET /api/profiles/:id/snapshots` - List snapshots for a profile
- `POST /api/profiles/:id/snapshots` - Create a new snapshot
- `POST /api/snapshots/:id/restore` - Restore a snapshot
- `GET /api/snapshots/:id/export` - Export a snapshot
- `POST /api/profiles/:id/import` - Import a snapshot

### OAuth Credentials
- `GET /api/profiles/:id/oauth` - List OAuth credentials for a profile
- `POST /api/profiles/:id/oauth/:provider` - Save OAuth credentials
- `GET /api/profiles/:id/oauth/:provider` - Get OAuth credentials
- `DELETE /api/oauth/:id` - Delete OAuth credentials

### Quick Actions
- `POST /api/current-profile/save` - Save current browser state

## Troubleshooting

### Snapshot Creation Fails
- Ensure you have sufficient disk space
- Check that the browser is running
- Try creating a smaller snapshot

### Restore Not Working
- Wait for the browser to fully restart (takes 5-10 seconds)
- Refresh the page after restore completes
- Check browser logs for errors

### Missing Login Data
- Ensure you created the snapshot while logged in
- Some websites may have additional security that requires re-authentication
- Two-factor authentication may need to be re-verified

## Technical Details

### Storage Locations
- **Active Profile**: `~/cloud-browser-data`
- **Snapshots**: `~/cloud-browser-snapshots`
- **Metadata DB**: `~/cloud-browser-snapshots/profiles.db`

### Snapshot Contents
Each snapshot contains:
- `Cookies` - Browser cookies database
- `Local Storage` - Local storage data
- `Session Storage` - Session storage data
- `IndexedDB` - IndexedDB databases
- `History` - Browsing history
- `Login Data` - Saved passwords
- `Preferences` - Browser preferences
- And more...

### Database Schema
The system uses SQLite to track:
- Profile metadata (name, description, dates)
- Snapshot metadata (file paths, sizes, dates)
- OAuth credentials (encrypted tokens, expiry)

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify disk space availability
3. Ensure all required permissions are granted
4. Contact support with snapshot IDs and error messages
