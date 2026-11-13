// Render a tall page (body width 1200px) to a full-length PNG, for scroll videos.
// Usage: node render_tall.js <page.html> <out.png>
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [inFile, outFile] = process.argv.slice(2);
  if (!inFile || !outFile) { console.error('usage: node render_tall.js <page.html> <out.png>'); process.exit(2); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(inFile));
  await page.waitForTimeout(400);
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  await page.screenshot({ path: outFile, fullPage: true });
  await browser.close();
  console.log(`saved ${outFile} (${size.w}x${size.h})`);
  if (size.w > 1200) { console.log('FIX: page is wider than 1200px'); process.exit(1); }
  if (size.h <= 1300) console.log('NOTE: page barely scrolls; a still 4096x4096 card may be better');
})();
