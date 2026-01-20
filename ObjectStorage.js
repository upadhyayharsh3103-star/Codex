const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { Client } = require('@replit/object-storage');

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
const brotliCompressAsync = promisify(zlib.brotliCompress);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

class ObjectStorage {
  constructor(config = {}) {
    this.replitClient = null;
    this.baseDir = config.baseDir || path.join(process.env.HOME, 'cloud-browser-object-storage');
    this.hotDir = path.join(this.baseDir, 'hot');
    this.warmDir = path.join(this.baseDir, 'warm');
    this.coldDir = path.join(this.baseDir, 'cold');
    this.cacheDir = path.join(this.baseDir, 'cache');
    this.compressionLevel = config.compressionLevel || 6;
    this.enableDeduplication = config.enableDeduplication !== false;
    this.deduplicationMap = new Map(); // hash -> file path
    this.useReplitStorage = false; // Will be set to true if Replit storage initializes successfully
  }

  async initialize() {
    // Create local cache directories
    await Promise.all([
      fs.mkdir(this.hotDir, { recursive: true }),
      fs.mkdir(this.warmDir, { recursive: true }),
      fs.mkdir(this.coldDir, { recursive: true }),
      fs.mkdir(this.cacheDir, { recursive: true })
    ]);

    // Replit Object Storage is optional - only use if properly configured
    // For now, use local storage only to avoid configuration issues
    this.useReplitStorage = false;
    console.log('ObjectStorage initialized with local storage tiers (hot/warm/cold)');

    if (this.enableDeduplication) {
      await this.loadDeduplicationIndex();
    }
  }

  async loadDeduplicationIndex() {
    const indexPath = path.join(this.baseDir, 'dedup_index.json');
    try {
      const data = await fs.readFile(indexPath, 'utf8');
      const index = JSON.parse(data);
      this.deduplicationMap = new Map(Object.entries(index));
      console.log(`Loaded ${this.deduplicationMap.size} deduplication entries`);
    } catch (err) {
      console.log('No existing deduplication index found, starting fresh');
    }
  }

  async saveDeduplicationIndex() {
    const indexPath = path.join(this.baseDir, 'dedup_index.json');
    const index = Object.fromEntries(this.deduplicationMap);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  async computeHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fsSync.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async compressData(data, algorithm = 'gzip') {
    if (algorithm === 'brotli') {
      return await brotliCompressAsync(data);
    }
    return await gzipAsync(data, { level: this.compressionLevel });
  }

  async decompressData(data, algorithm = 'gzip') {
    if (algorithm === 'brotli') {
      return await brotliDecompressAsync(data);
    }
    return await gunzipAsync(data);
  }

  getTierDirectory(tier) {
    switch (tier) {
      case 'hot': return this.hotDir;
      case 'warm': return this.warmDir;
      case 'cold': return this.coldDir;
      default: return this.warmDir;
    }
  }

  async store(key, filePath, options = {}) {
    const {
      tier = 'warm',
      compress = true,
      compressionAlgorithm = 'gzip',
      encrypt = false,
      encryptionKey = null,
      enableDedup = this.enableDeduplication
    } = options;

    // Check for deduplication
    let dedupHash = null;
    if (enableDedup) {
      dedupHash = await this.computeHash(filePath);
      if (this.deduplicationMap.has(dedupHash)) {
        const existingKey = this.deduplicationMap.get(dedupHash);
        console.log(`Deduplication: File already exists with key ${existingKey}`);
        return {
          key: existingKey,
          path: existingKey,
          dedupHash,
          deduplicated: true,
          originalSize: (await fs.stat(filePath)).size,
          storedSize: 0, // Reference only, no new storage
          tier
        };
      }
    }

    // Read file
    let data = await fs.readFile(filePath);
    const originalSize = data.length;

    // Compress if enabled
    let compressedSize = originalSize;
    if (compress) {
      data = await this.compressData(data, compressionAlgorithm);
      compressedSize = data.length;
    }

    // Encrypt if enabled
    if (encrypt && encryptionKey) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey.substring(0, 64), 'hex'), iv);
      let encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      data = Buffer.concat([iv, encrypted]);
    }

    // Store in Replit Object Storage (if available)
    const storageKey = `${tier}/${key}`;
    if (this.useReplitStorage) {
      const uploadResult = await this.replitClient.uploadFromBytes(storageKey, data);
      
      if (!uploadResult.ok) {
        console.warn(`Failed to upload to Replit Object Storage: ${uploadResult.error}, falling back to local storage`);
      }
    }

    // Store locally (as cache if using Replit storage, or primary storage if not)
    const tierDir = this.getTierDirectory(tier);
    const baseKey = key;  // key is just the filename, not tier/filename
    const localCachePath = path.join(tierDir, baseKey);
    await fs.mkdir(path.dirname(localCachePath), { recursive: true });
    await fs.writeFile(localCachePath, data);

    // Update deduplication index
    if (enableDedup && dedupHash) {
      this.deduplicationMap.set(dedupHash, storageKey);
      await this.saveDeduplicationIndex();
    }

    return {
      key: storageKey,
      path: storageKey,
      tier,
      originalSize,
      compressedSize,
      compressionRatio: originalSize > 0 ? (1 - compressedSize / originalSize) : 0,
      dedupHash,
      deduplicated: false,
      compressed: compress,
      encrypted: encrypt,
      compressionAlgorithm: compress ? compressionAlgorithm : null
    };
  }

  async retrieve(key, tier = 'warm', options = {}) {
    const {
      decompress = true,
      compressionAlgorithm = 'gzip',
      decrypt = false,
      decryptionKey = null
    } = options;

    // Normalize the storage key - if it already has tier prefix, use as-is, otherwise prepend tier
    const storageKey = key;  // Key is already in format "tier/snapshots/xyz.zip" from store()
    const baseKey = key.includes('/') ? key.split('/').slice(1).join('/') : key;
    
    // Try local cache first (using baseKey without tier prefix for file system)
    const tierDir = this.getTierDirectory(tier);
    const localCachePath = path.join(tierDir, baseKey);
    
    let data;
    try {
      data = await fs.readFile(localCachePath);
      console.log(`Retrieved from local storage: ${baseKey}`);
    } catch (err) {
      // Not in local cache
      if (this.useReplitStorage) {
        // Try to retrieve from Replit Object Storage
        const downloadResult = await this.replitClient.downloadAsBytes(storageKey);
        
        if (!downloadResult.ok) {
          throw new Error(`Failed to download from Replit Object Storage: ${downloadResult.error}`);
        }
        
        data = Buffer.from(downloadResult.value);
        
        // Cache locally for future access
        await fs.mkdir(path.dirname(localCachePath), { recursive: true });
        await fs.writeFile(localCachePath, data);
      } else {
        throw new Error(`File not found in local storage: ${baseKey}`);
      }
    }

    // Decrypt if needed
    if (decrypt && decryptionKey) {
      const iv = data.slice(0, 16);
      const encrypted = data.slice(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(decryptionKey.substring(0, 64), 'hex'), iv);
      data = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    // Decompress if needed
    if (decompress) {
      data = await this.decompressData(data, compressionAlgorithm);
    }

    return data;
  }

  async exists(key, tier = 'warm') {
    // Check local storage first
    const baseKey = key.includes('/') ? key.split('/').slice(1).join('/') : key;
    const tierDir = this.getTierDirectory(tier);
    const localPath = path.join(tierDir, baseKey);
    
    try {
      await fs.access(localPath);
      return true;
    } catch (err) {
      // Not in local storage
      if (this.useReplitStorage) {
        const storageKey = key;
        const listResult = await this.replitClient.list({ prefix: storageKey });
        
        if (!listResult.ok) {
          return false;
        }
        
        return listResult.value.some(obj => obj.name === storageKey);
      }
      return false;
    }
  }

  async delete(key, tier = 'warm') {
    // Key is already in "tier/path" format from store()
    const storageKey = key;
    const baseKey = key.includes('/') ? key.split('/').slice(1).join('/') : key;
    
    // Delete from Replit Object Storage (if available)
    if (this.useReplitStorage) {
      const deleteResult = await this.replitClient.delete(storageKey);
    
      if (!deleteResult.ok) {
        console.error(`Failed to delete ${storageKey} from Replit Object Storage:`, deleteResult.error);
      }
    }

    // Delete from local cache
    const tierDir = this.getTierDirectory(tier);
    const localCachePath = path.join(tierDir, baseKey);
    
    try {
      await fs.unlink(localCachePath);
    } catch (err) {
      // Ignore if not in cache
    }
    
    // Remove from deduplication index
    for (const [hash, path] of this.deduplicationMap.entries()) {
      if (path === storageKey) {
        this.deduplicationMap.delete(hash);
        await this.saveDeduplicationIndex();
        break;
      }
    }
    
    return true;
  }

  async moveTier(key, fromTier, toTier) {
    // Key format is "fromTier/baseKey", need to download from old location and upload to new
    const baseKey = key.includes('/') ? key.split('/').slice(1).join('/') : key;
    const oldStorageKey = `${fromTier}/${baseKey}`;
    const newStorageKey = `${toTier}/${baseKey}`;

    // If using Replit storage, move in cloud storage
    if (this.useReplitStorage) {
      // Download from old tier
      const downloadResult = await this.replitClient.downloadAsBytes(oldStorageKey);
      if (!downloadResult.ok) {
        throw new Error(`Failed to download for tier move: ${downloadResult.error}`);
      }

      // Upload to new tier
      const uploadResult = await this.replitClient.uploadFromBytes(newStorageKey, downloadResult.value);
      if (!uploadResult.ok) {
        throw new Error(`Failed to upload for tier move: ${uploadResult.error}`);
      }

      // Delete from old tier
      await this.replitClient.delete(oldStorageKey);
    }

    // Move in local storage
    const fromDir = this.getTierDirectory(fromTier);
    const toDir = this.getTierDirectory(toTier);
    const fromPath = path.join(fromDir, baseKey);
    const toPath = path.join(toDir, baseKey);

    try {
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.rename(fromPath, toPath);
    } catch (err) {
      console.warn(`Failed to move local file from ${fromPath} to ${toPath}:`, err.message);
    }

    // Update deduplication index
    for (const [hash, path] of this.deduplicationMap.entries()) {
      if (path === oldStorageKey) {
        this.deduplicationMap.set(hash, newStorageKey);
        await this.saveDeduplicationIndex();
        break;
      }
    }

    console.log(`Moved ${baseKey} from ${fromTier} to ${toTier}`);
    return newStorageKey;
  }

  async getStats() {
    const getDirectorySize = async (dir) => {
      let size = 0;
      let count = 0;
      
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });
        
        for (const file of files) {
          const filePath = path.join(dir, file.name);
          if (file.isDirectory()) {
            const subStats = await getDirectorySize(filePath);
            size += subStats.size;
            count += subStats.count;
          } else {
            const stats = await fs.stat(filePath);
            size += stats.size;
            count++;
          }
        }
      } catch (err) {
        // Directory doesn't exist or is empty
      }
      
      return { size, count };
    };

    const [hotStats, warmStats, coldStats] = await Promise.all([
      getDirectorySize(this.hotDir),
      getDirectorySize(this.warmDir),
      getDirectorySize(this.coldDir)
    ]);

    return {
      hot: hotStats,
      warm: warmStats,
      cold: coldStats,
      total: {
        size: hotStats.size + warmStats.size + coldStats.size,
        count: hotStats.count + warmStats.count + coldStats.count
      },
      deduplicationEntries: this.deduplicationMap.size
    };
  }
}

module.exports = ObjectStorage;
