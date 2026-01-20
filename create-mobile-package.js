const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const OUTPUT_DIR = path.join(__dirname, '..', 'deployments');

const filesToInclude = [
  'mobile-app/package.json',
  'mobile-app/capacitor.config.json',
  'mobile-app/.gitignore',
  'mobile-app/MOBILE_BUILD_GUIDE.md',
  'mobile-app/www/index.html',
  'mobile-app/www/manifest.json'
];

async function createMobilePackage() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(OUTPUT_DIR, `cloud-browser-mobile-${timestamp}.zip`);
  
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  output.on('close', () => {
    const sizeKB = (archive.pointer() / 1024).toFixed(2);
    console.log(`\nMobile App Package created successfully!`);
    console.log(`Location: ${outputPath}`);
    console.log(`Size: ${sizeKB} KB`);
    console.log(`\nTo build the APK:`);
    console.log(`  1. Extract the ZIP file`);
    console.log(`  2. cd mobile-app`);
    console.log(`  3. npm install`);
    console.log(`  4. npx cap add android`);
    console.log(`  5. npx cap sync`);
    console.log(`  6. npx cap open android`);
    console.log(`  7. Build APK in Android Studio`);
    console.log(`\nSee MOBILE_BUILD_GUIDE.md for detailed instructions.`);
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

  await archive.finalize();
}

createMobilePackage().catch(console.error);
