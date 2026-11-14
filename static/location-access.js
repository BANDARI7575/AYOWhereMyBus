/* One location permission flow, invoked only by explicit rider actions. */
(function(root){
'use strict';
const message=(code,es=false)=>({insecure:es?'La ubicación requiere HTTPS de confianza en este iPhone. Busca una parada manualmente.':'Location requires trusted HTTPS on this iPhone. Search for a stop manually.',unsupported:es?'Este navegador no ofrece ubicación. Busca manualmente.':'Location is unsupported in this browser. Search manually.',1:es?'Permiso de ubicación denegado. Revisa los permisos de Safari y los servicios de ubicación de iOS, o busca manualmente.':'Location permission denied. Check Safari permissions and iOS Location Services, or search manually.',2:es?'No se pudo determinar la ubicación. Comprueba los servicios de ubicación o busca manualmente.':'Location unavailable. Check Location Services or search manually.',3:es?'La ubicación tardó demasiado. Vuelve a intentar o busca manualmente.':'Location timed out. Try again or search manually.'})[code]||(es?'Ubicación no disponible. Busca manualmente.':'Location unavailable. Search manually.');
function request({es=false,options={}}={}){return new Promise((resolve,reject)=>{
 const fail=code=>reject(Object.assign(new Error(message(code,es)),{code}));
 if(root.isSecureContext===false)return fail('insecure');
 if(!root.navigator?.geolocation)return fail('unsupported');
 root.navigator.geolocation.getCurrentPosition(resolve,e=>fail(e.code),{enableHighAccuracy:false,timeout:10000,maximumAge:30000,...options});
});}
const api={request,message};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root.document)root.AyoLocation=api;
})(typeof window!=='undefined'?window:globalThis);
