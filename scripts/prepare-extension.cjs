const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function prepareExtension() {
  console.log('🚀 Preparing Chrome Extension files & zip bundle...');
  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(rootDir, 'public');
  const extDir = path.join(publicDir, 'extension');

  // Verify dist exists
  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/ directory does not exist. Run vite build first.');
    process.exit(1);
  }

  // Create target directories
  fs.mkdirSync(path.join(extDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(extDir, 'icons'), { recursive: true });

  // 1. Copy assets
  const appJsSrc = path.join(distDir, 'assets', 'app.js');
  const appCssSrc = path.join(distDir, 'assets', 'index.css');

  if (fs.existsSync(appJsSrc)) {
    fs.copyFileSync(appJsSrc, path.join(extDir, 'assets', 'app.js'));
    console.log('✓ Copied assets/app.js');
  } else {
    console.warn('⚠️ Warning: app.js not found in dist/assets');
  }

  if (fs.existsSync(appCssSrc)) {
    fs.copyFileSync(appCssSrc, path.join(extDir, 'assets', 'app.css'));
    fs.copyFileSync(appCssSrc, path.join(extDir, 'assets', 'index.css'));
    console.log('✓ Copied assets/app.css');
  }

  // 2. Prepare production index.html for extension
  const extensionHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ADHD Reader - Word-by-Word RSVP Focus Reader</title>
    <meta name="description" content="Word-by-word RSVP focus reader with middle-letter highlighting." />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&family=JetBrains+Mono:wght@400;500;700&family=Lexend:wght@300;400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script type="module" crossorigin src="./assets/app.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index.css">
  </head>
  <body class="bg-[#0f1117] text-slate-100 antialiased selection:bg-red-500/30 selection:text-red-200">
    <div id="root"></div>
  </body>
</html>
`;
  fs.writeFileSync(path.join(extDir, 'index.html'), extensionHtml, 'utf8');
  fs.writeFileSync(path.join(distDir, 'index.html'), extensionHtml, 'utf8');

  // 3. Copy manifest, background, content, icons
  const filesToCopy = [
    'manifest.json',
    'background.js',
    'content.js',
    'content.css'
  ];

  for (const file of filesToCopy) {
    const src = path.join(publicDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(extDir, file));
      fs.copyFileSync(src, path.join(distDir, file));
      console.log('✓ Synced ' + file);
    }
  }

  // Copy icons
  const iconsSrcDir = path.join(publicDir, 'icons');
  if (fs.existsSync(iconsSrcDir)) {
    const icons = fs.readdirSync(iconsSrcDir);
    for (const icon of icons) {
      fs.copyFileSync(path.join(iconsSrcDir, icon), path.join(extDir, 'icons', icon));
      fs.mkdirSync(path.join(distDir, 'icons'), { recursive: true });
      fs.copyFileSync(path.join(iconsSrcDir, icon), path.join(distDir, 'icons', icon));
    }
    console.log('✓ Synced icons');
  }

  // 4. Create README.txt
  const readmeText = `ADHD Reader - Chrome Extension (Manifest V3)
===================================================
How to install this extension in Google Chrome:

1. Open Google Chrome and navigate to: chrome://extensions
2. In the top-right corner, turn ON the "Developer mode" toggle.
3. Click the "Load unpacked" button in the top-left corner.
4. Select this extracted folder (the one containing manifest.json).
5. Done! Click the Extensions puzzle icon in Chrome toolbar and Pin ADHD Reader.

How to read highlighted text from any webpage:
---------------------------------------------
- Method 1 (Quick Floating Bubble): Highlight any sentence, article, or paragraph
  on any website. A floating "⚡ Read in ADHD Reader" pill will appear right above
  your selection. Click it to immediately open the RSVP Reader!
- Method 2 (Right-Click Menu): Highlight text, right click, and select
  "⚡ Read selected text with ADHD Reader".
- Method 3 (Keyboard Shortcut): Highlight text and press Alt+R (Option+R on Mac).
- Method 4 (Toolbar Popup): Click the ADHD Reader icon in your browser toolbar.
`;
  fs.writeFileSync(path.join(extDir, 'README.txt'), readmeText, 'utf8');

  // 5. Build ZIP bundle using JSZip
  const zip = new JSZip();
  zip.file('manifest.json', fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  zip.file('background.js', fs.readFileSync(path.join(extDir, 'background.js'), 'utf8'));
  zip.file('content.js', fs.readFileSync(path.join(extDir, 'content.js'), 'utf8'));
  zip.file('content.css', fs.readFileSync(path.join(extDir, 'content.css'), 'utf8'));
  zip.file('index.html', extensionHtml);
  zip.file('README.txt', readmeText);

  const assetsFolder = zip.folder('assets');
  if (fs.existsSync(path.join(extDir, 'assets', 'app.js'))) {
    assetsFolder.file('app.js', fs.readFileSync(path.join(extDir, 'assets', 'app.js'), 'utf8'));
  }
  if (fs.existsSync(path.join(extDir, 'assets', 'index.css'))) {
    assetsFolder.file('index.css', fs.readFileSync(path.join(extDir, 'assets', 'index.css'), 'utf8'));
    assetsFolder.file('app.css', fs.readFileSync(path.join(extDir, 'assets', 'index.css'), 'utf8'));
  }

  const iconsFolder = zip.folder('icons');
  if (fs.existsSync(iconsSrcDir)) {
    const icons = fs.readdirSync(iconsSrcDir);
    for (const icon of icons) {
      iconsFolder.file(icon, fs.readFileSync(path.join(iconsSrcDir, icon)));
    }
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const zipPath = path.join(publicDir, 'adhd-reader-chrome-extension-v3.zip');
  fs.writeFileSync(zipPath, zipBuffer);
  fs.writeFileSync(path.join(distDir, 'adhd-reader-chrome-extension-v3.zip'), zipBuffer);
  console.log(`🎉 Successfully packaged extension zip (${(zipBuffer.length / 1024).toFixed(1)} KB) to ${zipPath}`);
}

prepareExtension().catch((err) => {
  console.error('Error preparing extension:', err);
  process.exit(1);
});
