const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AutoSaveManager {
  constructor(enhancedProfileManager, config = {}) {
    this.enhancedProfileManager = enhancedProfileManager;
    this.profileDir = config.profileDir || path.join(process.env.HOME, 'cloud-browser-data');
    
    // Auto-save configuration
    this.autoSaveInterval = config.autoSaveInterval || 5 * 60 * 1000; // 5 minutes default
    this.maxAutoSaves = config.maxAutoSaves || 100; // Keep last 100 auto-saves
    this.autoSaveProfileName = config.autoSaveProfileName || 'AutoSave-Memory';
    
    this.autoSaveTimer = null;
    this.autoSaveProfile = null;
    this.isRunning = false;
    this.lastSaveTime = null;
    this.saveCount = 0;
  }

  async initialize() {
    console.log('🤖 Initializing Auto-Save Memory System...');
    
    // Create or get the auto-save profile
    const profiles = await this.enhancedProfileManager.listProfiles();
    this.autoSaveProfile = profiles.find(p => p.name === this.autoSaveProfileName);
    
    if (!this.autoSaveProfile) {
      console.log('📁 Creating Auto-Save Memory profile...');
      this.autoSaveProfile = await this.enhancedProfileManager.createProfile(
        this.autoSaveProfileName,
        'Automatic continuous backup of all browser user data'
      );
    }
    
    console.log(`✅ Auto-Save Memory System initialized`);
    console.log(`   📊 Profile ID: ${this.autoSaveProfile.id}`);
    console.log(`   ⏰ Auto-save interval: ${this.autoSaveInterval / 1000 / 60} minutes`);
    console.log(`   📦 Max auto-saves kept: ${this.maxAutoSaves}`);
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Auto-Save already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Auto-Save Memory System...');
    
    // Perform initial save
    await this.performAutoSave();
    
    // Schedule periodic auto-saves
    this.autoSaveTimer = setInterval(async () => {
      await this.performAutoSave();
    }, this.autoSaveInterval);
    
    console.log(`✅ Auto-Save Memory System is now running (saves every ${this.autoSaveInterval / 1000 / 60} minutes)`);
  }

  async stop() {
    if (!this.isRunning) {
      console.log('⚠️  Auto-Save not running');
      return;
    }

    this.isRunning = false;
    
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    console.log('🛑 Auto-Save Memory System stopped');
  }

  async performAutoSave() {
    try {
      const startTime = Date.now();
      
      // Check if browser data directory exists
      const exists = await fs.access(this.profileDir)
        .then(() => true)
        .catch(() => false);
      
      if (!exists) {
        console.log('⚠️  Browser data directory not found, skipping auto-save');
        return null;
      }

      // Create snapshot name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotName = `AutoSave-${timestamp}`;
      
      console.log(`💾 Creating auto-save: ${snapshotName}...`);
      
      // Save the current browser state - use appropriate method for the profile manager
      let snapshot;
      if (this.enhancedProfileManager.saveSnapshot) {
        // EnhancedProfileManager method
        snapshot = await this.enhancedProfileManager.saveSnapshot(
          this.autoSaveProfile.id,
          snapshotName,
          this.profileDir
        );
      } else {
        // Legacy ProfileManager method
        snapshot = await this.enhancedProfileManager.createSnapshot(
          this.autoSaveProfile.id,
          snapshotName,
          this.profileDir
        );
      }
      
      this.lastSaveTime = new Date();
      this.saveCount++;
      
      const duration = Date.now() - startTime;
      console.log(`✅ Auto-save completed in ${duration}ms (Total saves: ${this.saveCount})`);
      
      if (snapshot.sizeBytes) {
        console.log(`   📦 Size: ${(snapshot.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
      } else if (snapshot.size_bytes) {
        console.log(`   📦 Size: ${(snapshot.size_bytes / 1024 / 1024).toFixed(2)} MB`);
      }
      
      // Clean up old auto-saves
      await this.cleanupOldAutoSaves();
      
      return snapshot;
    } catch (error) {
      console.error('❌ Auto-save failed:', error.message);
      return null;
    }
  }

  async cleanupOldAutoSaves() {
    try {
      // Get all snapshots for the auto-save profile
      const snapshots = await this.enhancedProfileManager.listSnapshots(this.autoSaveProfile.id);
      
      // Sort by creation date (newest first)
      snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Delete old snapshots beyond maxAutoSaves
      if (snapshots.length > this.maxAutoSaves) {
        const toDelete = snapshots.slice(this.maxAutoSaves);
        console.log(`🗑️  Cleaning up ${toDelete.length} old auto-saves...`);
        
        for (const snapshot of toDelete) {
          try {
            await this.enhancedProfileManager.deleteSnapshot(snapshot.id);
          } catch (error) {
            console.error(`Failed to delete snapshot ${snapshot.id}:`, error.message);
          }
        }
        
        console.log(`✅ Cleanup complete. Kept ${this.maxAutoSaves} most recent auto-saves`);
      }
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  async getAutoSaveHistory(limit = 50) {
    try {
      const snapshots = await this.enhancedProfileManager.listSnapshots(this.autoSaveProfile.id);
      
      // Sort by creation date (newest first)
      snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Return limited results
      return snapshots.slice(0, limit).map(snapshot => ({
        id: snapshot.id,
        name: snapshot.name,
        createdAt: snapshot.createdAt,
        sizeBytes: snapshot.sizeBytes,
        sizeMB: (snapshot.sizeBytes / 1024 / 1024).toFixed(2),
        storageTier: snapshot.storageTier,
        accessCount: snapshot.accessCount || 0
      }));
    } catch (error) {
      console.error('❌ Failed to get auto-save history:', error.message);
      return [];
    }
  }

  async restoreFromHistory(snapshotId) {
    try {
      console.log(`🔄 Restoring from auto-save: ${snapshotId}...`);
      
      // Stop auto-save during restore
      const wasRunning = this.isRunning;
      if (wasRunning) {
        await this.stop();
      }
      
      // Restore the snapshot
      await this.enhancedProfileManager.restoreSnapshot(snapshotId, this.profileDir);
      
      console.log('✅ Auto-save restored successfully');
      
      // Restart auto-save if it was running
      if (wasRunning) {
        setTimeout(() => {
          this.start();
        }, 5000); // Wait 5 seconds before resuming auto-saves
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      throw error;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSaveTime: this.lastSaveTime,
      saveCount: this.saveCount,
      autoSaveInterval: this.autoSaveInterval,
      maxAutoSaves: this.maxAutoSaves,
      profileId: this.autoSaveProfile?.id || null,
      profileName: this.autoSaveProfileName
    };
  }

  async updateConfig(config = {}) {
    if (config.autoSaveInterval && config.autoSaveInterval >= 60000) { // Min 1 minute
      this.autoSaveInterval = config.autoSaveInterval;
      
      // Restart timer if running
      if (this.isRunning) {
        await this.stop();
        await this.start();
      }
    }
    
    if (config.maxAutoSaves && config.maxAutoSaves > 0) {
      this.maxAutoSaves = config.maxAutoSaves;
      await this.cleanupOldAutoSaves();
    }
    
    return this.getStatus();
  }
}

module.exports = AutoSaveManager;
