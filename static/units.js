/* US customary display units only. API and routing values remain metric. */
(function (root) {
  'use strict';
  const KM_TO_MI = 0.621371;
  const M_TO_FT = 3.28084;
  function value(input) {
    if ((typeof input !== 'number' && typeof input !== 'string') || String(input).trim() === '') return null;
    const number = Number(input);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  const convert = (input, factor) => value(input) === null ? null : Number(input) * factor;
  const toMiles = km => convert(km, KM_TO_MI);
  const toMph = kmh => convert(kmh, KM_TO_MI);
  const toFeet = meters => convert(meters, M_TO_FT);
  const language = () => root.document?.documentElement.lang || 'en';
  const number = (input, digits, lang) => new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(input);
  function miles(km, lang = language()) {
    const converted = toMiles(km);
    return converted === null ? '—' : `${number(converted, 2, lang)} mi`;
  }
  function feet(meters, lang = language()) {
    const converted = toFeet(meters);
    return converted === null ? '—' : `${number(converted, 0, lang)} ${lang === 'es' ? 'pies' : 'ft'}`;
  }
  function distance(meters, lang = language()) {
    const converted = value(meters);
    if (converted === null) return '—';
    return toMiles(converted / 1000) < 0.1 ? feet(converted, lang) : miles(converted / 1000, lang);
  }
  function speed(kmh, lang = language()) {
    const converted = toMph(kmh);
    return converted === null ? '—' : `${number(converted, 1, lang)} mph`;
  }
  const api = { toMiles, toMph, toFeet, miles, feet, distance, speed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) root.AyoUnits = api;
})(typeof window !== 'undefined' ? window : globalThis);
