/* Validate authored SVG paths and reproduce the historical third-bat parse error. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5000';
const brokenBat = 'M50 13 44 6 40 17C22 4 9 10 0 12c8 6 10 11 12 19 9-5 16-3 21 4 4-7 10-8 17-3 7-5 13-4 17 3 5-7 12-9 21-4 2-8 4-13-4 17 3 5-7 12-9 21-4 2-8 4-13 12-19-9-2-22-8-40 5L56 6Z';
function sources(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'vendor') return [];
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(?:js|html|svg)$/.test(file) ? [file] : [];
  });
}
const paths = ['index.html', ...sources('static')].flatMap(file =>
  [...fs.readFileSync(file, 'utf8').matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((match, index) => ({ file, index, d: match[1].replace(/\s+/g, ' ') })));
(async () => {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch({ headless: true, ...(engine === 'chromium' && process.env.AYO_CHROME_PATH ? { executablePath: process.env.AYO_CHROME_PATH } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
      const historical = await context.newPage();
      const originalErrors = [];
      historical.on('console', message => { if (message.type() === 'error') originalErrors.push(message.text()); });
      await historical.setContent(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${brokenBat}"/></svg>`);
      assert.ok(originalErrors.some(message => /parsing d=|attribute d:/.test(message)), 'original malformed path must reproduce a parsing error');
      await historical.close();
      // Render paths through the SVG parser itself; WebKit does not support CSS d.
      const literals = await context.newPage();
      const literalErrors = [];
      literals.on('console', message => { if (message.type() === 'error') literalErrors.push(message.text()); });
      await literals.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${paths.map(({ d }) => `<path d="${d}"/>`).join('')}</svg>`);
      assert.deepEqual(literalErrors, [], 'all authored literal path data must parse');
      assert.ok(await literals.locator('path').evaluateAll(nodes => nodes.every(node => node.getTotalLength() > 0)));
      await literals.close();
      const page = await context.newPage();
      const svgErrors = [], errors = [];
      page.on('console', message => { if (message.type() === 'error' && /parsing d=|attribute d:|svg.*path/i.test(message.text())) svgErrors.push(message.text()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-11-11T18:00:59Z') });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'api.open-meteo.com') return route.fulfill({ json: { current: { time: Date.parse('2026-11-11T17:55:00Z') / 1000, temperature_2m: 32, weather_code: 0, wind_speed_10m: 2, is_day: 1 } } });
        if (url.origin !== base) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { reports: [], alerts: [], status: 'unavailable' } });
        return route.continue();
      });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('weatherTemp').textContent === '32°F');
      // The approved utility interface replaced decorative bats with a divider bus.
      assert.equal(await page.locator('#dividerBus svg').count(),1);
      assert.equal(await page.locator('#dividerBus').getAttribute('aria-hidden'),'true');
      await page.evaluate(() => {
        const container = document.createElement('div');
        container.hidden = true;
        container.innerHTML = createBusIcon(false).options.html + createBusIcon(true).options.html;
        document.body.append(container);
        container.querySelectorAll('path').forEach(node => { if (!(node.getTotalLength() > 0)) throw Error('Invalid dynamic bus path'); });
        container.remove();
      });
      assert.equal(await page.locator('#weatherTemp').textContent(), '32°F');
      assert.deepEqual(svgErrors, []);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine}: historical error reproduced; ${paths.length} authored paths and both bus variants valid; current divider bus present; no SVG console errors; weather works`);
      await context.close();
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
