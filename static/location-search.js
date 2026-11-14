/* No external geocoder is active. Adapters require an explicit approved integration. */
(function(root){
'use strict';let provider=null;
function registerProvider(adapter){if(!adapter||adapter.approved!==true||typeof adapter.search!=='function'||!adapter.id)throw Error('A reviewed, explicitly approved location provider is required');provider=adapter;}
async function searchStops(query,{signal}={}){const response=await root.fetch('/api/journey-locations?q='+encodeURIComponent(query),{signal,cache:'no-store'});if(!response.ok)throw Error('Official stop search unavailable');return response.json();}
async function searchPlaces(query,{consent=false,signal}={}){
 if(!provider)throw Error('Address and place search requires an approved provider');
 if(!consent)throw Error('Consent is required before sharing a location query');
 const rows=await provider.search(query,{signal});return rows.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180).map(p=>({kind:'place',name:String(p.name),latitude:p.latitude,longitude:p.longitude}));
}
const api={registerProvider,searchStops,searchPlaces,get placesAvailable(){return !!provider;}};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root.document)root.AyoLocationSearch=api;
})(typeof window!=='undefined'?window:globalThis);
