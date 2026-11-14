const {test}=require('node:test');const assert=require('node:assert/strict');
const i18n=require('../../static/i18n.js');const catalog=require('../../static/es.json');i18n.load(catalog);
test('all catalog entries have deliberate Spanish text',()=>{for(const [en,es]of Object.entries(catalog)){assert.ok(en.trim());assert.ok(es.trim());if(en!=='Leaflet')assert.notEqual(en,es);}});
test('dynamic tracking, GPS age, directions and stop instructions translate without changing IDs',()=>{
 assert.equal(i18n.translate('3 buses'),'3 autobuses');assert.equal(i18n.translate('45 seconds ago'),'hace 45 segundos');
 assert.equal(i18n.translate('AYO! · Route 30'),'AYO! · Ruta 30');
 assert.equal(i18n.translate('Route 30 — Wisconsin Avenue'),'Ruta 30 — Wisconsin Avenue');
 assert.equal(i18n.translate('WISCONSIN & CASS'),'WISCONSIN & CASS');
 assert.equal(i18n.translate('Stop 2783 · 328 ft away'),'Parada 2783 · a 328 pies');
});
test('customary distance and nearby-radius labels translate consistently',()=>{
 assert.equal(i18n.translate('328 ft away'),'a 328 pies');
 assert.equal(i18n.translate('0.62 mi away'),'a 0.62 mi');
 assert.equal(i18n.translate('Stop 1 · 328 pies away'),'Parada 1 · a 328 pies');
 assert.match(i18n.translate('2 reported buses within 1.86 mi. Use Rider tools for stops and verified arrival data.'),/2 autobuses informados en 1.86 mi/);
});
