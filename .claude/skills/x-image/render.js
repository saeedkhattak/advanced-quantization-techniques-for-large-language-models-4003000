// Render a 1024x1024 card to a 4096x4096 PNG and check that the content fits.
// Usage: node render.js <card.html> <out.png>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [inFile, outFile] = process.argv.slice(2);
  if (!inFile || !outFile) { console.error('usage: node render.js <card.html> <out.png>'); process.exit(2); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 4 });
  await page.goto('file://' + path.resolve(inFile));
  await page.waitForTimeout(400);
  const fit = await page.evaluate(() => {
    const pg = document.getElementById('pg');
    const kids = [...pg.children].map(e => e.getBoundingClientRect());
    const top = Math.min(...kids.map(r => r.top));
    const bottom = Math.max(...kids.map(r => r.bottom));
    return { scroll: pg.scrollHeight, top: Math.round(top), bottom: Math.round(1024 - bottom),
             wideOverflow: document.documentElement.scrollWidth > 1024 };
  });
  await page.screenshot({ path: outFile });
  await browser.close();
  const kb = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`saved ${outFile} (4096x4096, ${kb} KB)`);
  console.log(`margin top ${fit.top}px, bottom ${fit.bottom}px (CSS px; aim for 50 to 120 each)`);
  const problems = [];
  if (fit.scroll > 1024) problems.push(`content overflows by ${fit.scroll - 1024}px: shrink sizes or cut a block`);
  if (fit.wideOverflow) problems.push('content is wider than the card');
  if (fit.top < 50 || fit.bottom < 50) problems.push('too close to the edge: increase --pad or shrink sizes');
  if (fit.top > 120 && fit.bottom > 120) problems.push('lots of empty space: increase font sizes or add a block from the source');
  if (kb > 5000) problems.push('file is over 5 MB: X will reject it');
  if (problems.length) { console.log('FIX: ' + problems.join('; ')); process.exit(1); }
  console.log('OK');
})();
