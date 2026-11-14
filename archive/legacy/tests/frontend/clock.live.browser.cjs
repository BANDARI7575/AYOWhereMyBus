/* Real wall-clock verification against the running server; no mocked time or API data. */
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const base = process.env.AYO_TEST_URL || 'http://127.0.0.1:5000';
(async () => {
  const engine = process.env.AYO_TEST_ENGINE || 'chromium';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({
    headless: true,
    ...(engine === 'chromium' && process.env.AYO_CHROME_PATH ? { executablePath: process.env.AYO_CHROME_PATH } : {})
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const observation = window.__ayoClockLifecycle = { startCalls: 0, startCompleted: false, scheduled: 0, fired: 0 };
      const add = document.addEventListener.bind(document);
      document.addEventListener = (type, listener, options) => {
        if (type === 'DOMContentLoaded' && typeof listener === 'function' && listener.name === 'start') {
          return add(type, function (event) {
            if (listener !== window.start) return listener.call(this, event);
            observation.startCalls++;
            listener.call(this, event);
            observation.startCompleted = true;
          }, options);
        }
        return add(type, listener, options);
      };
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        if (callback !== window.synchronizeClock || typeof callback !== 'function') return timeout(callback, delay, ...args);
        observation.scheduled++;
        return timeout(function (...values) {
          observation.fired++;
          return callback.apply(this, values);
        }, delay, ...args);
      };
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'load' });
    const served = await page.evaluate(() => fetch('/static/app.js', { cache: 'no-cache' }).then(r => r.text()));
    assert.equal(served, readFileSync('static/app.js', 'utf8'));
    assert.ok(await page.evaluate(() => start.toString().includes('synchronizeClock()')));
    const samples = [];
    const started = performance.now();
    do {
      // Allow one second for browser task scheduling at the exact minute boundary.
      await page.waitForFunction(() => document.getElementById('clock').textContent ===
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date()) && document.getElementById('weatherClock').textContent === new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date()), null, { timeout: 1000 });
      const sample = await page.evaluate(() => ({ displayed: document.getElementById('clock').textContent, top: document.getElementById('weatherClock').textContent, epoch: Date.now(), hidden: document.hidden }));
      const expected = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(sample.epoch));
      assert.equal(sample.displayed, expected);
      assert.equal(sample.top, expected.replace(/ CST$/, ''));
      assert.equal(sample.hidden, false);
      samples.push(sample);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (performance.now() - started < 125000);
    assert.ok(new Set(samples.map(sample => sample.displayed)).size >= 3, 'automatic updates must cross two real minute boundaries');
    assert.ok(new Set(samples.map(sample => sample.top)).size >= 3, 'top clock must cross two real minute boundaries');
    const lifecycle = await page.evaluate(() => window.__ayoClockLifecycle);
    assert.equal(lifecycle.startCalls, 1);
    assert.equal(lifecycle.startCompleted, true, 'start() must return without an exception');
    assert.ok(lifecycle.fired >= 2, 'the browser must execute at least two automatic clock callbacks');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ engine, seconds: (performance.now() - started) / 1000, samples: samples.length, first: samples[0], last: samples.at(-1), lifecycle, errors }));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
