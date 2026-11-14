/* Both clocks share current time; weather observation metadata remains separate. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5000';
(async () => {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch({ headless: true, ...(engine === 'chromium' && process.env.AYO_CHROME_PATH ? { executablePath: process.env.AYO_CHROME_PATH } : {}) });
    try {
      for (const language of ['en', 'es']) for (const width of [1120, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
        await context.addInitScript(language => localStorage.setItem('ayo-language', JSON.stringify(language)), language);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-11-11T18:00:59Z') });
        let observed = Date.parse('2026-11-11T17:55:00Z') / 1000;
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname === 'api.open-meteo.com') return route.fulfill({ json: { current: { time: observed, temperature_2m: 32, weather_code: 0, wind_speed_10m: 2, is_day: 1 } } });
          if (url.origin !== base) return route.abort();
          if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { reports: [], status: 'unavailable', alerts: [] } });
          return route.continue();
        });
        await page.goto(base, { waitUntil: 'load' });
        await page.evaluate(() => window.AyoI18n.ready);
        const format = epoch => new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(epoch));
        await page.waitForFunction(() => document.getElementById('weatherClock'));
        const stamp = page.locator('#weatherClock');
        assert.equal(await stamp.textContent(), format(Date.parse('2026-11-11T18:00:59Z')));
        const clockBefore = await page.locator('#clock').textContent();
        await page.clock.runFor(62000);
        assert.notEqual(await page.locator('#clock').textContent(), clockBefore);
        assert.equal(await stamp.textContent(), format(Date.parse('2026-11-11T18:02:01Z')), 'top clock must advance across both minute changes');
        const before = await stamp.textContent();
        observed += 300;
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction(observed => document.getElementById('weatherWidget').dataset.observedAt === String(observed), observed);
        assert.equal(await stamp.textContent(), before, 'weather refresh must not overwrite the live clock');
        assert.ok((await page.locator('#weatherWidget').getAttribute('title')).includes(format(observed * 1000)));
        observed -= 10000;
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction(() => document.getElementById('weatherTemp').textContent === '--°F');
        assert.equal(await stamp.textContent(), before, 'weather failure must preserve the live clock');
        assert.ok(await page.evaluate(() => {
          const stamp = document.getElementById('weatherClock').getBoundingClientRect();
          const widget = document.getElementById('weatherWidget').getBoundingClientRect();
          const language = document.getElementById('languageButton').getBoundingClientRect();
          return stamp.right <= widget.right + 1 && widget.right <= language.left + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
        }), 'label must fit the existing header');
        assert.deepEqual(errors, []);
        console.log('PASS both clocks across two minute boundaries, weather refresh/failure isolation, and header fit', engine, language, width);
        await context.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
