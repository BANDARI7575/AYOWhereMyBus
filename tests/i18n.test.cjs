const {test}=require('node:test');const assert=require('node:assert/strict');
const i18n=require('../static/i18n.js');const catalog=require('../static/es.json');i18n.load(catalog);
test('all catalog entries have deliberate Spanish text',()=>{for(const [en,es]of Object.entries(catalog)){assert.ok(en.trim());assert.ok(es.trim());if(en!=='Leaflet')assert.notEqual(en,es);}});
test('dynamic tracking, GPS age, directions and stop instructions translate without changing IDs',()=>{
 assert.equal(i18n.translate('3 buses'),'3 autobuses');assert.equal(i18n.translate('45 seconds ago'),'hace 45 segundos');
 assert.equal(i18n.translate('AYO! · Route 30'),'AYO! · Ruta 30');
 assert.equal(i18n.translate('Route 30 — Wisconsin Avenue'),'Ruta 30 — Wisconsin Avenue');
 assert.equal(i18n.translate('WISCONSIN & CASS'),'WISCONSIN & CASS');
 assert.equal(i18n.translate('Stop 2783 · 100 m away'),'Parada 2783 · a 100 m');
});
