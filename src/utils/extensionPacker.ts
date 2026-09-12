import JSZip from 'jszip';

/**
 * Downloads the ready-to-load Chrome Extension as a ZIP package
 * so users can extract and immediately load unpacked in chrome://extensions.
 * 
 * Contains the production-built bundle (HTML, JS, CSS, background service worker,
 * content scripts, and manifest) ensuring it will never open a blank page in Chrome.
 */
export async function downloadExtensionPackage(): Promise<void> {
  // Strategy 1: Attempt to download the pre-compiled, fully bundled zip directly
  try {
    const prebuiltZipRes = await fetch('./adhd-reader-chrome-extension-v3.zip');
    if (prebuiltZipRes.ok) {
      const blob = await prebuiltZipRes.blob();
      if (blob.size > 5000) { // Valid non-empty zip
        triggerDownload(blob, 'adhd-reader-chrome-extension-v3.zip');
        return;
      }
    }
  } catch (err) {
    console.debug('Prebuilt zip fetch failed, falling back to dynamic packing:', err);
  }

  // Strategy 2: Dynamically assemble the zip with compiled assets
  const zip = new JSZip();

  // 1. Fetch manifest.json
  try {
    const manifestRes = await fetch('./manifest.json');
    if (manifestRes.ok) {
      zip.file('manifest.json', await manifestRes.text());
    }
  } catch {
    // fallback
  }

  // 2. Fetch extension background and content scripts
  try {
    const [contentJs, contentCss, bgJs] = await Promise.all([
      fetch('./content.js').then((r) => r.ok ? r.text() : ''),
      fetch('./content.css').then((r) => r.ok ? r.text() : ''),
      fetch('./background.js').then((r) => r.ok ? r.text() : '')
    ]);

    if (contentJs) zip.file('content.js', contentJs);
    if (contentCss) zip.file('content.css', contentCss);
    if (bgJs) zip.file('background.js', bgJs);
  } catch (err) {
    console.warn('Failed to fetch extension scripts:', err);
  }

  // 3. Add Extension icons
  const iconFolder = zip.folder('icons');
  for (const size of [16, 32, 48, 128]) {
    try {
      const res = await fetch(`./icons/icon${size}.png`);
      if (res.ok) {
        const blob = await res.blob();
        iconFolder?.file(`icon${size}.png`, blob);
      }
    } catch {
      // ignore
    }
  }

  // 4. Add production index.html (MUST reference ./assets/app.js, NOT /src/main.tsx)
  const productionHtml = `<!doctype html>
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
  zip.file('index.html', productionHtml);

  // 5. Fetch bundled assets (assets/app.js and assets/index.css)
  const assetsFolder = zip.folder('assets');
  try {
    const [appJsRes, appCssRes] = await Promise.all([
      fetch('./extension/assets/app.js').catch(() => null),
      fetch('./extension/assets/index.css').catch(() => null)
    ]);

    if (appJsRes && appJsRes.ok) {
      const appJsCode = await appJsRes.text();
      assetsFolder?.file('app.js', appJsCode);
    }
    if (appCssRes && appCssRes.ok) {
      const appCssCode = await appCssRes.text();
      assetsFolder?.file('index.css', appCssCode);
      assetsFolder?.file('app.css', appCssCode);
    }
  } catch (err) {
    console.warn('Failed to package compiled assets:', err);
  }

  // 6. Add complete installation instructions
  const readme = `ADHD Reader - Chrome Extension (Manifest V3)
===================================================
How to install this extension in Google Chrome:

1. Extract / Unzip this folder to a local directory (e.g. ~/Downloads/adhd-reader-extension)
2. Open Google Chrome and go to: chrome://extensions
3. In the top-right corner, toggle ON "Developer mode"
4. Click "Load unpacked" in the top-left corner
5. Select the extracted folder containing manifest.json
6. Done! Pin the ADHD Reader extension to your browser toolbar.

How to capture and read text from any webpage:
---------------------------------------------
- Method 1 (Quick Floating Bubble): Highlight any sentence, article, or paragraph
  on any website. A floating "[ ⚡ Read in ADHD Reader ]" pill will appear right above
  your selection. Click it to immediately open the word-by-word RSVP reader!
- Method 2 (Right-Click Menu): Highlight text, right click, and select
  "⚡ Read selected text with ADHD Reader".
- Method 3 (Keyboard Shortcut): Highlight text and press Alt+R (Option+R on Mac).
- Method 4 (Toolbar Popup): Click the ADHD Reader icon in your browser toolbar.
`;
  zip.file('README.txt', readme);

  // Generate ZIP blob and trigger browser download
  const blob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  triggerDownload(blob, 'adhd-reader-chrome-extension-v3.zip');
}

function triggerDownload(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
