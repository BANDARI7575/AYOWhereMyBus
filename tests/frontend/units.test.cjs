const { test } = require('node:test');
const assert = require('node:assert/strict');
const units = require('../../static/units.js');
test('US customary conversions use the requested exact factors', () => {
  assert.equal(units.toMiles(1), 0.621371);
  assert.ok(Math.abs(units.toMph(100) - 62.1371) < 1e-10);
  assert.equal(units.toFeet(1), 3.28084);
  assert.equal(units.toMiles('1'), 0.621371);
});
test('distances choose feet for short walks and miles for longer distances', () => {
  assert.equal(units.distance(100, 'en'), '328 ft');
  assert.equal(units.distance(100, 'es'), '328 pies');
  assert.equal(units.distance(160, 'en'), '525 ft');
  assert.equal(units.distance(161, 'en'), '0.10 mi');
  assert.equal(units.distance(1000, 'en'), '0.62 mi');
  assert.equal(units.distance(1000, 'es'), '0.62 mi');
  assert.equal(units.miles(1.5), '0.93 mi');
  assert.equal(units.miles(3), '1.86 mi');
  assert.equal(units.feet(300), '984 ft');
});
test('speeds and zero values display correctly without changing source objects', () => {
  const bus = { speed_kmh: 100 };
  assert.equal(units.speed(bus.speed_kmh, 'en'), '62.1 mph');
  assert.equal(units.speed(bus.speed_kmh, 'es'), '62.1 mph');
  assert.deepEqual(bus, { speed_kmh: 100 });
  assert.equal(units.speed(0), '0.0 mph');
  assert.equal(units.distance(0), '0 ft');
});
test('missing and invalid measurements are never shown as zero or NaN', () => {
  for (const input of [null, undefined, '', ' ', true, false, NaN, Infinity, -1, {}, []]) {
    assert.equal(units.toMiles(input), null);
    assert.equal(units.distance(input), '—');
    assert.equal(units.speed(input), '—');
  }
});
test('loaded frontend scripts contain no hardcoded metric display labels', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  for (const match of html.matchAll(/<script[^>]*src="(\/static\/[^\"]+)"/g)) {
    if (match[1].includes('/vendor/')) continue;
    const source = fs.readFileSync('.' + match[1], 'utf8');
    assert.doesNotMatch(source, /\$\{[^}]+\}\s+(?:m|km|km\/h)\b|\b\d+(?:[.,]\d+)? km\b| km\/h\b/, match[1]);
  }
});
