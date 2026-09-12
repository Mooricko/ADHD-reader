import JSZip from 'jszip';

/**
 * Downloads the ready-to-load Chrome Extension as a ZIP package
 * so users can extract and immediately load unpacked in chrome://extensions
 */
export async function downloadExtensionPackage() {
  const zip = new JSZip();

  // 1. Fetch manifest.json
  try {
    const manifestRes = await fetch('./manifest.json');
    if (manifestRes.ok) {
      zip.file('manifest.json', await manifestRes.text());
    }
  } catch {
    // fallback if fetch fails
  }

  // 2. Fetch content.js & content.css
  try {
    const contentJs = await fetch('./content.js');
    if (contentJs.ok) zip.file('content.js', await contentJs.text());

    const contentCss = await fetch('./content.css');
    if (contentCss.ok) zip.file('content.css', await contentCss.text());

    const bgJs = await fetch('./background.js');
    if (bgJs.ok) zip.file('background.js', await bgJs.text());
  } catch {
    // ignore
  }

  // 3. Add icons
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

  // 4. Fetch index.html and current assets if available
  try {
    const indexRes = await fetch('./index.html');
    if (indexRes.ok) {
      zip.file('index.html', await indexRes.text());
    }
  } catch {
    // ignore
  }

  // 5. Add README.txt
  const readme = `ADHD Reader - Chrome Extension (Manifest V3)
===================================================
How to install this extension in Google Chrome:

1. Extract / Unzip this folder to a local directory (e.g. ~/Downloads/adhd-reader-extension)
2. Open Google Chrome and go to: chrome://extensions
3. In the top-right corner, toggle ON "Developer mode"
4. Click "Load unpacked" in the top-left corner
5. Select the extracted folder containing manifest.json
6. Done! Pin the ADHD Reader extension to your browser toolbar.

How to use the Content Script to capture text from any webpage:
---------------------------------------------------------------
- Method 1 (Quick Bubble): Highlight any sentence or paragraph on any website.
  A sleek floating "⚡ Read in ADHD Reader" pill will appear above your selection. Click it!
- Method 2 (Right-Click Context Menu): Highlight text, right-click, and select
  "⚡ Read selected text with ADHD Reader".
- Method 3 (Keyboard Shortcut): Highlight text and press Alt+R (or Option+R on Mac).
- Method 4 (Toolbar Popup): Click the ADHD Reader icon in your browser toolbar,
  then click "⚡ Capture Selected Text from Webpage".
`;
  zip.file('README.txt', readme);

  // Generate ZIP blob and trigger browser download
  const blob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = 'adhd-reader-chrome-extension-v3.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
