/* Display conversions must not change the metric journey response or route arguments. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fixture = require('../fixtures/journey-walk.json');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5000';
(async () => {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch({ headless: true, ...(engine === 'chromium' && process.env.AYO_CHROME_PATH ? { executablePath: process.env.AYO_CHROME_PATH } : {}) });
    try {
      for (const language of ['en', 'es']) {
        const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce', geolocation: { latitude: 43, longitude: -88, accuracy: 800 }, permissions: ['geolocation'] });
        await context.addInitScript(language => localStorage.setItem('ayo-language', JSON.stringify(language)), language);
        const page = await context.newPage(); const errors = []; let query;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== base) return route.abort();
          if (url.pathname === '/api/journey-locations') return route.fulfill({ json: { locations: [{ ...fixture.origin, distance_meters: 100 }] } });
          if (url.pathname === '/api/journeys') {
            query = Object.fromEntries(url.searchParams);
            return route.fulfill({ json: { ...fixture, nearby_trip: true, straight_line_distance_meters: 1000, nearby_destination_stops: [{ ...fixture.destination, distance_meters: 200 }] } });
          }
          if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { reports: [], alerts: [], status: 'unavailable' } });
          return route.continue();
        });
        await page.clock.install({time:new Date(fixture.requested_at*1000)});await page.goto(base, { waitUntil: 'load' });await page.evaluate(()=>AyoSite.navigate('trip'));
        await page.evaluate(() => window.AyoI18n.ready);
        await page.locator('.journey-locate').first().click();
        await page.locator('#planFrom-list [role=option]').first().waitFor({ state: 'visible' });
        assert.ok((await page.locator('#planFrom-list').innerText()).includes(language === 'es' ? '328 pies' : '328 ft'));
        assert.ok((await page.locator('#planFrom-info').innerText()).includes(language === 'es' ? '2,625 pies' : '2,625 ft'));
        await page.locator('#planFrom-list [role=option]').first().click();
        assert.ok((await page.locator('#planFrom-info').innerText()).includes(language === 'es' ? '328 pies' : '328 ft'));
        await page.evaluate(stop => dispatchEvent(new CustomEvent('ayo:planner-context', { detail: { to: stop } })), fixture.destination);
        await page.locator('#allowEstimatedWalking').check();
        await page.locator('#planJourney').click();
        await page.locator('#journeyResults h3').waitFor();
        const text = await page.locator('#journeyResults').innerText();
        assert.match(text, /0.62 mi/);
        assert.match(text, /0.12 mi/);
        assert.ok(text.includes(language === 'es' ? '36 pies' : '36 ft'));
        assert.doesNotMatch(text, /\b(?:km\/h|km|metros?|meters?)\b|\b\d+ m\b/);
        assert.deepEqual(query, { from: fixture.origin.stop_id, to: fixture.destination.stop_id, walking: '1', choice: '0' });
        assert.equal(fixture.legs.find(leg => leg.type === 'walk').meters, 11);
        assert.equal(await page.evaluate(() => Object.values(state.map._layers).filter(layer => layer instanceof L.Polyline).length), 2);
        assert.deepEqual(errors, []);
        console.log('PASS customary planner distances, GPS accuracy, walking display, unchanged API arguments and map geometry', engine, language);
        await context.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
