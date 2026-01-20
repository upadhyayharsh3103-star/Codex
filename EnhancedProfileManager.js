const dbModule = require('./db.js');
const {
  profiles,
  snapshots,
  oauthCredentials
} = require('../shared/schema.js');
const { eq, sql } = require('drizzle-orm');

const getDb = () => dbModule.db;
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { v4: uuidv4 } = require('uuid');

const execAsync = promisify(exec);

class EnhancedProfileManager {
  constructor(storageManager, config = {}) {
    this.storageManager = storageManager;
    this.profileDir = config.profileDir || path.join(process.env.HOME, 'cloud-browser-data');
    this.tempDir = path.join(process.env.HOME, 'cloud-browser-temp');
  }

  async initialize() {
    await Promise.all([
      fs.mkdir(this.profileDir, { recursive: true }),
      fs.mkdir(this.tempDir, { recursive: true })
    ]);

    console.log('EnhancedProfileManager initialized with advanced storage backend');
  }

  async createProfile(name, description = null) {
    return await this.storageManager.createProfile(name, description);
  }

  async listProfiles() {
    return await this.storageManager.listProfiles();
  }

  async getProfile(profileId) {
    return await this.storageManager.getProfile(profileId);
  }

  async deleteProfile(profileId) {
    return await this.storageManager.deleteProfile(profileId);
  }

  async saveSnapshot(profileId, snapshotName, sourceDir) {
    // Create a temporary zip file from the source directory
    const tempZipPath = path.join(this.tempDir, `temp_${uuidv4()}.zip`);
    
    await new Promise((resolve, reject) => {
      const output = fsSync.createWriteStream(tempZipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });

    try {
      // Use StorageManager to create the snapshot with compression, deduplication, etc.
      const snapshot = await this.storageManager.createSnapshot(profileId, snapshotName, tempZipPath);
      
      // Clean up temp file
      await fs.unlink(tempZipPath);
      
      return snapshot;
    } catch (err) {
      // Clean up on error
      await fs.unlink(tempZipPath).catch(() => {});
      throw err;
    }
  }

  async restoreSnapshot(snapshotId, targetDir) {
    // Get snapshot from database
    const [snapshot] = await getDb().select().from(snapshots).where(eq(snapshots.id, snapshotId));
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    // Update access tracking
    await getDb().update(snapshots)
      .set({
        accessCount: sql`${snapshots.accessCount} + 1`,
        lastAccessedAt: new Date()
      })
      .where(eq(snapshots.id, snapshotId));

    // Retrieve from object storage
    const data = await this.storageManager.objectStorage.retrieve(
      snapshot.objectStorageKey || path.basename(snapshot.filePath),
      snapshot.storageTier,
      {
        decompress: true,
        compressionAlgorithm: snapshot.compressionAlgorithm || 'gzip',
        decrypt: snapshot.encrypted,
        decryptionKey: this.storageManager.encryptionKey
      }
    );

    // Extract to target directory
    const tempZipPath = path.join(this.tempDir, `restore_${uuidv4()}.zip`);
    await fs.writeFile(tempZipPath, data);

    try {
      await fs.mkdir(targetDir, { recursive: true });
      
      await new Promise((resolve, reject) => {
        fsSync.createReadStream(tempZipPath)
          .pipe(unzipper.Extract({ path: targetDir }))
          .on('close', resolve)
          .on('error', reject);
      });

      // Clean up
      await fs.unlink(tempZipPath);
      
      return { success: true, path: targetDir };
    } catch (err) {
      await fs.unlink(tempZipPath).catch(() => {});
      throw err;
    }
  }

  async listSnapshots(profileId) {
    const cacheKey = `snapshots:${profileId}`;
    const cached = await this.storageManager.cacheManager.get(cacheKey);
    if (cached) return cached;

    const snapshotList = await getDb().select()
      .from(snapshots)
      .where(eq(snapshots.profileId, profileId))
      .orderBy(sql`${snapshots.createdAt} DESC`);

    await this.storageManager.cacheManager.set(cacheKey, snapshotList, 300000);
    return snapshotList;
  }

  async deleteSnapshot(snapshotId) {
    const profileId = await getDb().select({ profileId: snapshots.profileId })
      .from(snapshots)
      .where(eq(snapshots.id, snapshotId))
      .then(rows => rows[0]?.profileId);

    await this.storageManager.deleteSnapshot(snapshotId);
    
    if (profileId) {
      await this.storageManager.cacheManager.delete(`snapshots:${profileId}`);
    }
    
    return true;
  }

  async exportSnapshot(snapshotId, destinationPath) {
    const [snapshot] = await getDb().select().from(snapshots).where(eq(snapshots.id, snapshotId));
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    // Retrieve from object storage
    const data = await this.storageManager.objectStorage.retrieve(
      snapshot.objectStorageKey || path.basename(snapshot.filePath),
      snapshot.storageTier,
      {
        decompress: true,
        compressionAlgorithm: snapshot.compressionAlgorithm || 'gzip',
        decrypt: snapshot.encrypted,
        decryptionKey: this.storageManager.encryptionKey
      }
    );

    await fs.writeFile(destinationPath, data);
    return destinationPath;
  }

  async importSnapshot(profileId, snapshotName, sourceFilePath) {
    return await this.saveSnapshot(profileId, snapshotName, sourceFilePath);
  }

  async saveOAuthCredential(profileId, provider, credentialData) {
    const credId = uuidv4();
    const encryptedAccessToken = credentialData.access_token 
      ? this.storageManager.encrypt(credentialData.access_token)
      : null;
    const encryptedRefreshToken = credentialData.refresh_token
      ? this.storageManager.encrypt(credentialData.refresh_token)
      : null;

    const [credential] = await getDb().insert(oauthCredentials).values({
      id: credId,
      profileId,
      provider,
      email: credentialData.email || null,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt: credentialData.expires_at ? new Date(credentialData.expires_at) : null
    }).returning();

    return credential;
  }

  async getOAuthCredentials(profileId, provider = null) {
    let query = getDb().select().from(oauthCredentials).where(eq(oauthCredentials.profileId, profileId));
    
    if (provider) {
      query = query.where(eq(oauthCredentials.provider, provider));
    }

    const credentials = await query;

    // Decrypt tokens
    return credentials.map(cred => ({
      ...cred,
      accessToken: cred.accessToken ? this.storageManager.decrypt(cred.accessToken) : null,
      refreshToken: cred.refreshToken ? this.storageManager.decrypt(cred.refreshToken) : null
    }));
  }

  async deleteOAuthCredential(credentialId) {
    await getDb().delete(oauthCredentials).where(eq(oauthCredentials.id, credentialId));
    return true;
  }

  // Get comprehensive stats
  async getStats() {
    return await this.storageManager.getStorageStats();
  }
}

module.exports = EnhancedProfileManager;
