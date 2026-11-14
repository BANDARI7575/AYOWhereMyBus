const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5000';
async function assertClocks(page, expected) {
  assert.equal(await page.locator('#clock').textContent(), expected);
  assert.equal(await page.locator('#weatherClock').textContent(), expected.replace(/ CST$/, ''));
}
(async () => {
  const engine = process.env.AYO_TEST_ENGINE || 'chromium';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engine === 'chromium' && process.env.AYO_CHROME_PATH ? { executablePath: process.env.AYO_CHROME_PATH } : {}) });
  try {
    for (const failMap of [true, false]) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      await page.clock.install({ time: new Date('2026-11-11T18:00:59Z') });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/api/winter/reports') return route.fulfill({ json: { reports: [] } });
        if (url.pathname === '/api/alerts') return route.fulfill({ json: { alerts: [] } });
        return route.continue();
      });
      if (failMap) await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          window.L.map = () => { throw new Error('Synthetic map initialization failure'); };
        }, { once: true });
      });
      await page.goto(base, { waitUntil: 'load' });
      const before = await page.locator('#clock').textContent();
      await page.clock.runFor(2000);
      const after = await page.locator('#clock').textContent();
      console.log(JSON.stringify({ failMap, before, after, errors, svgErrors: consoleErrors.filter(e => /path|attribute d/.test(e)) }));
      assert.notEqual(after, before, 'clock must advance even if map initialization fails');
      assert.equal(after, '12:01 PM CST');
      await page.clock.runFor(60000);
      await assertClocks(page, '12:02 PM CST');
      await page.locator('#themeButton').click();
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('day-mode')), true);
      await page.clock.setSystemTime(new Date('2026-11-11T18:05:00Z'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await assertClocks(page, '12:05 PM CST');
      await page.clock.setSystemTime(new Date('2026-11-11T18:19:59Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await assertClocks(page, '12:19 PM CST');
      await page.clock.runFor(2000);
      await assertClocks(page, '12:20 PM CST');
      await page.clock.setSystemTime(new Date('2026-11-11T18:35:59Z'));
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await assertClocks(page, '12:35 PM CST');
      await page.clock.runFor(2000);
      await assertClocks(page, '12:36 PM CST');
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors.filter(e => /path|attribute d/.test(e)), []);
      await context.close();
    }
    // Exercise the real cache lifecycle too; isolated tests above block workers.
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-11-11T16:45:00Z') });
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const served = await page.evaluate(async () => {
      const response = await fetch('/static/app.js');
      return { source: await response.text(), cache: response.headers.get('Cache-Control') };
    });
    assert.equal(served.source, readFileSync('static/app.js', 'utf8'), 'controlled page receives current workspace JavaScript');
    assert.match(served.cache, /no-cache/);
    await page.evaluate(async () => {
      const cache = await caches.open('ayo-shell-v23');
      await cache.put('/static/app.js', new Response('/* stale install-time script */', { headers: { 'Content-Type': 'text/javascript' } }));
      await fetch('/static/app.js', { cache: 'no-cache' });
    });
    await page.waitForFunction(async source => {
      const cache = await caches.open('ayo-shell-v23');
      const response = await cache.match('/static/app.js');
      return response && await response.text() === source;
    }, served.source);
    assert.equal(await page.locator('script[src="/static/app.js"]').count(), 1);
    await assertClocks(page, '10:45 AM CST');
    await page.clock.runFor(14 * 60000);
    await assertClocks(page, '10:59 AM CST');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('clock').textContent.includes('CST'));
    await page.clock.runFor(14 * 60000);
    await assertClocks(page, '11:13 AM CST');
    assert.deepEqual(errors, []);
    await context.close();
    const response = await fetch(`${base}/static/vendor/leaflet/leaflet.js.map`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).version, 3);
    console.log('PASS clock ticks, tab return, map failure isolation, theme listener, SVG paths, source map, served bytes, and online/offline service-worker lifecycle');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
