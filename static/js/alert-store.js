/* One last-good official snapshot shared by every rider-facing alert display. */
(function (root) {
  'use strict';
  let snapshot = null;
  let pending = null;
  const bindings = new Map();

  function render() {
    root.AyoAlertData = snapshot; // Compatibility for existing integrations.
    for (const [host, binding] of bindings) {
      if (!host.isConnected) {
        bindings.delete(host);
        continue;
      }
      root.AyoTransit.renderAlerts(host, snapshot || {status: 'unavailable', alerts: []}, binding.route, binding.language);
    }
    root.dispatchEvent(new Event('ayo:alerts-updated'));
  }

  function unavailable() {
    const hasLastGood = snapshot?.received_at && snapshot.status !== 'unavailable';
    snapshot = hasLastGood
      ? {...snapshot, status: 'stale', refresh_error: true}
      : {status: 'unavailable', alerts: []};
  }

  async function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await root.fetch('/api/service-alerts', {cache: 'no-store'});
        if (!response.ok) throw Error('Alerts unavailable');
        const data = await response.json();
        if (!Array.isArray(data.alerts)) throw Error('Invalid alerts');
        if (data.status === 'fresh') snapshot = {...data, received_at: Date.now() / 1000};
        else unavailable();
      } catch {
        unavailable();
      } finally {
        pending = null;
        render();
      }
      return snapshot;
    })();
    return pending;
  }

  root.AyoAlertStore = {
    refresh,
    bind(host, route = '', language = document.documentElement.lang) {
      bindings.set(host, {route, language});
      render();
      if (!snapshot) refresh();
    },
    get snapshot() { return snapshot; },
    invalidate() { unavailable(); render(); }
  };
  root.addEventListener('offline', () => root.AyoAlertStore.invalidate());
})(window);
