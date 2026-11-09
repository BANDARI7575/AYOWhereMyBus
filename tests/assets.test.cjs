const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');

test('vendored stylesheet and script integrity matches the shipped bytes',()=>{
 const html=readFileSync('index.html','utf8');let count=0;
 for(const tag of html.matchAll(/<(?:link|script)\b[^>]*>/g)){
  const integrity=tag[0].match(/integrity="sha256-([^"]+)"/);
  if(!integrity)continue;
  const asset=tag[0].match(/(?:href|src)="(\/static\/[^\"]+)"/);
  assert.ok(asset,'integrity-protected asset must be local');
  assert.equal(createHash('sha256').update(readFileSync('.'+asset[1])).digest('base64'),integrity[1],asset[1]);count++;
 }
 assert.equal(count,2,'Leaflet script and stylesheet retain integrity protection');
});
