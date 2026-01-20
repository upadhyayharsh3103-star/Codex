const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PACKAGE_NAME = 'cloud-browser-deployment';
const OUTPUT_DIR = path.join(__dirname, '..', 'deployments');

const filesToInclude = [
  'server.js',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'render.yaml',
  '.dockerignore',
  'start-vnc.sh',
  'websockify-proxy.js',
  'ProfileManager.js',
  'drizzle.config.js',
  'manager.html',
  'PROFILE_MANAGER_GUIDE.md',
  'DEPLOYMENT_GUIDE.md'
];

const directoriesToInclude = [
  'public',
  'novnc',
  'middleware',
  'routes',
  'server',
  'shared'
];

async function createDeploymentPackage() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(OUTPUT_DIR, `${PACKAGE_NAME}-${timestamp}.zip`);
  
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  output.on('close', () => {
    const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`\nDeployment package created successfully!`);
    console.log(`Location: ${outputPath}`);
    console.log(`Size: ${sizeMB} MB`);
    console.log(`\nThis package can be deployed to:`);
    console.log(`  - Render.com (using render.yaml)`);
    console.log(`  - Railway.app`);
    console.log(`  - Fly.io`);
    console.log(`  - Any Docker-compatible platform`);
    console.log(`  - Replit (import from ZIP)`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  for (const file of filesToInclude) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: file });
      console.log(`Added: ${file}`);
    } else {
      console.log(`Skipped (not found): ${file}`);
    }
  }

  for (const dir of directoriesToInclude) {
    const dirPath = path.join(__dirname, '..', dir);
    if (fs.existsSync(dirPath)) {
      archive.directory(dirPath, dir);
      console.log(`Added directory: ${dir}/`);
    } else {
      console.log(`Skipped directory (not found): ${dir}/`);
    }
  }

  await archive.finalize();
}

createDeploymentPackage().catch(console.error);
