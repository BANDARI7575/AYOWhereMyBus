const {test}=require('node:test'),assert=require('node:assert/strict');
const assistant=require('../../static/js/assistant.js');
test('basic bilingual guidance uses known destinations and does not invent arrivals',()=>{
 for(const [language,questions]of [['en',['Hi','Hello','What can you do?','How do I find my bus?','How do I find nearby stops?','How do I plan a trip?','What are service alerts?','Who created this website?','Thank you','Bye']],['es',['Hola','¿Qué puedes hacer?','Buscar paradas','Planear un viaje','Avisos de servicio','¿Quién creó esto?','Gracias','Adiós']]])for(const q of questions){const result=assistant.guidance(q,language);assert.ok(result.text);assert.doesNotMatch(result.text,/\b\d+ min\b/);for(const link of result.links||[])assert.match(link.href,/^\/#(stops|trip|alerts|founder)$/);}
 assert.match(assistant.guidance('Who created this website?').text,/Abhiraj Bandari/);
 assert.match(assistant.guidance('What can you do?').text,/rule-based/);
});
test('explicit stop queries use the injected verified-service adapter only',async()=>{
 let id;const reply=await assistant.reply('next bus stop 1234','en',{departures:async value=>{id=value;return {text:'Verified fixture'};}});assert.equal(id,'1234');assert.equal(reply.text,'Verified fixture');assert.equal(assistant.guidance('When is my next bus?').lookupStop,undefined);assert.equal(assistant.guidance('parada #234','es').lookupStop,'234');
});
test('missing and failing transit services return honest bilingual fallback',async()=>{
 assert.match((await assistant.reply('stop 123','en')).text,/could not check/);
 assert.match((await assistant.reply('parada 123','es',{departures:async()=>{throw Error('offline');}})).text,/No pude consultar/);
});
