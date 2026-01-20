const fs = require('fs');
const path = require('path');

class BrowserConfigManager {
  constructor() {
    this.configPath = path.join(process.env.HOME, '.browser-config.json');
    const envBrowserCount = parseInt(process.env.BROWSER_COUNT || '1');
    this.defaultConfig = {
      browserCount: Math.min(3, Math.max(1, envBrowserCount)),
      displayResolutions: {
        1: '1280x720',
        2: '1280x720',  // Two browsers will split this
        3: '1280x960'   // Three browsers in 3x1 grid
      }
    };
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load browser config:', error.message);
    }
    return this.defaultConfig;
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save browser config:', error);
      return false;
    }
  }

  setBrowserCount(count) {
    const validCounts = [1, 2, 3];
    if (!validCounts.includes(count)) {
      throw new Error(`Invalid browser count. Must be 1, 2, or 3. Got: ${count}`);
    }
    this.config.browserCount = count;
    this.saveConfig();
    return this.config;
  }

  getBrowserCount() {
    return this.config.browserCount;
  }

  getDisplayResolution() {
    const count = this.config.browserCount;
    return this.config.displayResolutions[count];
  }

  getWindowDimensions() {
    const count = this.config.browserCount;
    const baseRes = this.getDisplayResolution();
    const [width, height] = baseRes.split('x').map(Number);

    if (count === 1) {
      return { width, height, windows: [{ x: 0, y: 0, width, height }] };
    } else if (count === 2) {
      const windowWidth = Math.floor(width / 2);
      return {
        width,
        height,
        windows: [
          { x: 0, y: 0, width: windowWidth, height },
          { x: windowWidth, y: 0, width: windowWidth, height }
        ]
      };
    } else if (count === 3) {
      const windowWidth = Math.floor(width / 3);
      return {
        width,
        height,
        windows: [
          { x: 0, y: 0, width: windowWidth, height },
          { x: windowWidth, y: 0, width: windowWidth, height },
          { x: windowWidth * 2, y: 0, width: windowWidth, height }
        ]
      };
    }
  }

  getConfig() {
    return { ...this.config };
  }
}

module.exports = BrowserConfigManager;
