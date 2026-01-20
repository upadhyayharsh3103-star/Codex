const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const execAsync = promisify(exec);

class ProfileManager {
  constructor(config = {}) {
    this.profileDir = config.profileDir || path.join(process.env.HOME, 'cloud-browser-data');
    this.snapshotsDir = config.snapshotsDir || path.join(process.env.HOME, 'cloud-browser-snapshots');
    this.metadataDbPath = config.metadataDbPath || path.join(this.snapshotsDir, 'profiles.db');
    this.keyFilePath = path.join(this.snapshotsDir, '.encryption_key');
    this.encryptionKey = null;
    
    this.db = null;
    this.currentProfileId = null;
  }

  async initialize() {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    
    await this.loadOrGenerateEncryptionKey();
    
    this.db = new Database(this.metadataDbPath);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 0,
        metadata TEXT
      )
    `);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        encrypted INTEGER DEFAULT 1,
        metadata TEXT,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_credentials (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        email TEXT,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);
    
    console.log('ProfileManager initialized');
  }

  async loadOrGenerateEncryptionKey() {
    if (process.env.PROFILE_ENCRYPTION_KEY) {
      this.encryptionKey = process.env.PROFILE_ENCRYPTION_KEY;
      console.log('Using encryption key from environment variable');
      return;
    }

    try {
      const keyData = await fs.readFile(this.keyFilePath, 'utf8');
      this.encryptionKey = keyData.trim();
      console.log('Loaded encryption key from file');
    } catch (err) {
      this.encryptionKey = crypto.randomBytes(32).toString('hex');
      await fs.writeFile(this.keyFilePath, this.encryptionKey, { mode: 0o600 });
      console.log('Generated new encryption key and saved to file');
    }
  }

  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = parts.join(':');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async createProfile(name, description = '') {
    const profileId = uuidv4();
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO profiles (id, name, description, created_at, updated_at, is_active)
      VALUES (?, ?, ?, ?, ?, 0)
    `);
    
    stmt.run(profileId, name, description, now, now);
    
    return {
      id: profileId,
      name,
      description,
      created_at: now,
      updated_at: now,
      is_active: false
    };
  }

  async listProfiles() {
    const stmt = this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC');
    return stmt.all();
  }

  async getProfile(profileId) {
    const stmt = this.db.prepare('SELECT * FROM profiles WHERE id = ?');
    return stmt.get(profileId);
  }

  async deleteProfile(profileId) {
    const snapshots = this.db.prepare('SELECT * FROM snapshots WHERE profile_id = ?').all(profileId);
    
    for (const snapshot of snapshots) {
      try {
        await fs.unlink(snapshot.file_path);
      } catch (err) {
        console.error(`Failed to delete snapshot file: ${snapshot.file_path}`, err);
      }
    }
    
    const stmt = this.db.prepare('DELETE FROM profiles WHERE id = ?');
    stmt.run(profileId);
    
    return { success: true, profileId };
  }

  async createSnapshot(profileId, snapshotName, includeActive = true) {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const snapshotId = uuidv4();
    const now = Date.now();
    const snapshotFileName = `${profileId}_${now}.zip`;
    const snapshotPath = path.join(this.snapshotsDir, snapshotFileName);
    
    const sourceDir = includeActive ? this.profileDir : null;
    
    if (!sourceDir) {
      throw new Error('No source directory specified for snapshot');
    }

    const size = await this.createArchive(sourceDir, snapshotPath);
    
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (id, profile_id, name, created_at, file_path, size_bytes, encrypted)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    
    stmt.run(snapshotId, profileId, snapshotName, now, snapshotPath, size);
    
    const updateStmt = this.db.prepare('UPDATE profiles SET updated_at = ?, size_bytes = ? WHERE id = ?');
    updateStmt.run(now, size, profileId);
    
    return {
      id: snapshotId,
      profile_id: profileId,
      name: snapshotName,
      created_at: now,
      file_path: snapshotPath,
      size_bytes: size
    };
  }

  async createArchive(sourceDir, outputPath) {
    const tempZipPath = outputPath + '.temp';
    
    const zipSize = await new Promise((resolve, reject) => {
      const output = fsSync.createWriteStream(tempZipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });
      
      let totalSize = 0;
      
      output.on('close', () => {
        totalSize = archive.pointer();
        resolve(totalSize);
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
    
    await this.encryptFile(tempZipPath, outputPath);
    
    await fs.unlink(tempZipPath);
    
    const stats = await fs.stat(outputPath);
    return stats.size;
  }

  async encryptFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      const input = fsSync.createReadStream(inputPath);
      const output = fsSync.createWriteStream(outputPath);
      
      output.write(iv);
      
      input.pipe(cipher).pipe(output);
      
      output.on('finish', () => resolve());
      output.on('error', reject);
      input.on('error', reject);
      cipher.on('error', reject);
    });
  }

  async decryptFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
      
      const input = fsSync.createReadStream(inputPath);
      const output = fsSync.createWriteStream(outputPath);
      
      let iv = null;
      let decipher = null;
      
      input.on('data', (chunk) => {
        if (!iv) {
          iv = chunk.slice(0, 16);
          decipher = crypto.createDecipheriv(algorithm, key, iv);
          const rest = chunk.slice(16);
          if (rest.length > 0) {
            output.write(decipher.update(rest));
          }
        } else {
          output.write(decipher.update(chunk));
        }
      });
      
      input.on('end', () => {
        if (decipher) {
          output.write(decipher.final());
        }
        output.end();
      });
      
      output.on('finish', () => resolve());
      output.on('error', reject);
      input.on('error', reject);
    });
  }

  async restoreSnapshot(snapshotId) {
    const snapshot = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId);
    
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }
    
    await this.stopBrowser();
    
    await this.clearProfileDirectory();
    
    await this.extractArchive(snapshot.file_path, this.profileDir);
    
    const updateStmt = this.db.prepare('UPDATE profiles SET is_active = 0');
    updateStmt.run();
    
    const activateStmt = this.db.prepare('UPDATE profiles SET is_active = 1, updated_at = ? WHERE id = ?');
    activateStmt.run(Date.now(), snapshot.profile_id);
    
    this.currentProfileId = snapshot.profile_id;
    
    await this.startBrowser();
    
    return {
      success: true,
      snapshot_id: snapshotId,
      profile_id: snapshot.profile_id
    };
  }

  async extractArchive(archivePath, targetDir) {
    const tempZipPath = archivePath + '.decrypted';
    
    await this.decryptFile(archivePath, tempZipPath);
    
    const extract = require('extract-zip');
    try {
      await extract(tempZipPath, { dir: path.resolve(targetDir) });
    } catch (err) {
      const unzipper = require('unzipper');
      await fsSync.createReadStream(tempZipPath)
        .pipe(unzipper.Extract({ path: targetDir }))
        .promise();
    }
    
    await fs.unlink(tempZipPath);
  }

  async clearProfileDirectory() {
    try {
      const files = await fs.readdir(this.profileDir);
      for (const file of files) {
        const filePath = path.join(this.profileDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          await fs.rm(filePath, { recursive: true, force: true });
        } else {
          await fs.unlink(filePath);
        }
      }
    } catch (err) {
      console.error('Error clearing profile directory:', err);
    }
  }

  async stopBrowser() {
    try {
      await execAsync('pkill -f chromium');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.log('Browser may not be running');
    }
  }

  async startBrowser() {
    try {
      const vncScript = path.join(__dirname, 'start-vnc.sh');
      spawn(vncScript, {
        detached: true,
        stdio: 'ignore',
        shell: true
      }).unref();
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      console.error('Error starting browser:', err);
    }
  }

  async exportSnapshot(snapshotId, outputPath) {
    const snapshot = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId);
    
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }
    
    if (snapshot.encrypted) {
      await fs.copyFile(snapshot.file_path, outputPath);
    } else {
      await fs.copyFile(snapshot.file_path, outputPath);
    }
    
    return {
      success: true,
      output_path: outputPath,
      size_bytes: snapshot.size_bytes,
      encrypted: snapshot.encrypted
    };
  }

  async importSnapshot(profileId, archivePath, snapshotName) {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const snapshotId = uuidv4();
    const now = Date.now();
    const snapshotFileName = `${profileId}_imported_${now}.zip`;
    const snapshotPath = path.join(this.snapshotsDir, snapshotFileName);
    
    await fs.copyFile(archivePath, snapshotPath);
    
    const stats = await fs.stat(snapshotPath);
    const size = stats.size;
    
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (id, profile_id, name, created_at, file_path, size_bytes, encrypted)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    
    stmt.run(snapshotId, profileId, snapshotName, now, snapshotPath, size);
    
    return {
      id: snapshotId,
      profile_id: profileId,
      name: snapshotName,
      created_at: now,
      size_bytes: size
    };
  }

  async listSnapshots(profileId = null) {
    let stmt;
    if (profileId) {
      stmt = this.db.prepare('SELECT * FROM snapshots WHERE profile_id = ? ORDER BY created_at DESC');
      return stmt.all(profileId);
    } else {
      stmt = this.db.prepare('SELECT * FROM snapshots ORDER BY created_at DESC');
      return stmt.all();
    }
  }

  async saveOAuthCredentials(profileId, provider, credentials) {
    const credId = uuidv4();
    const now = Date.now();
    
    const encryptedAccessToken = credentials.access_token ? this.encrypt(credentials.access_token) : null;
    const encryptedRefreshToken = credentials.refresh_token ? this.encrypt(credentials.refresh_token) : null;
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO oauth_credentials 
      (id, profile_id, provider, email, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      credId,
      profileId,
      provider,
      credentials.email || null,
      encryptedAccessToken,
      encryptedRefreshToken,
      credentials.expires_at || null,
      now,
      now
    );
    
    return { success: true, id: credId };
  }

  async getOAuthCredentials(profileId, provider) {
    const stmt = this.db.prepare(`
      SELECT * FROM oauth_credentials 
      WHERE profile_id = ? AND provider = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    const cred = stmt.get(profileId, provider);
    
    if (cred && cred.access_token) {
      cred.access_token = this.decrypt(cred.access_token);
    }
    if (cred && cred.refresh_token) {
      cred.refresh_token = this.decrypt(cred.refresh_token);
    }
    
    return cred;
  }

  async listOAuthCredentials(profileId) {
    const stmt = this.db.prepare(`
      SELECT id, profile_id, provider, email, expires_at, created_at, updated_at
      FROM oauth_credentials 
      WHERE profile_id = ?
      ORDER BY provider, created_at DESC
    `);
    
    return stmt.all(profileId);
  }

  async deleteOAuthCredentials(credentialId) {
    const stmt = this.db.prepare('DELETE FROM oauth_credentials WHERE id = ?');
    stmt.run(credentialId);
    return { success: true };
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = ProfileManager;
