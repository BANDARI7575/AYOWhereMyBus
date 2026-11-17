/* Rule-based transit guidance. A future model adapter can implement this reply contract. */
(function(root){
'use strict';
function guidance(message,language='en'){
 const es=language==='es',t=(a,b)=>es?b:a,q=message.trim().toLocaleLowerCase(),links=[];
 const link=(text,href)=>links.push({text,href});let text;
 const stop=q.match(/(?:stop|parada)\s*#?\s*(\d{1,12})\b/);
 if(stop)return {lookupStop:stop[1]};
 if(/^(hi|hello|hey|hola|buenos días|buenas)[!?.\s]*$/.test(q))text=t('👋 Ayo! Where are we heading today?','👋 ¡Ayo! ¿A dónde vamos hoy?');
 else if(/thank|gracias/.test(q))text=t('You’re welcome! Have a safe ride.','¡De nada! Que tengas un buen viaje.');
 else if(/^(bye|goodbye|adiós|adios|hasta luego)[!?.\s]*$/.test(q))text=t('See you next ride!','¡Hasta el próximo viaje!');
 else if(/creat|founder|built|creó|creo|fundador/.test(q)){text=t('Abhiraj Bandari created AYO! Where’s My Bus? Read his founder profile for more.','Abhiraj Bandari creó AYO! Where’s My Bus? Consulta su perfil para saber más.');link(t('About the Founder','Acerca del fundador'),'/#founder');}
 else if(/alert|aviso|disruption/.test(q)){text=t('Service alerts are official notices about changes or disruptions. Open Alerts for the latest verified notices; I have not checked current alerts in this reply.','Los avisos de servicio son notificaciones oficiales de cambios o interrupciones. Abre Avisos para ver los datos verificados; esta respuesta no ha consultado avisos actuales.');link(t('Open Alerts','Abrir Avisos'),'/#alerts');}
 else if(/plan|trip|viaje/.test(q)){text=t('Open Trip, choose your origin and destination from official stop suggestions, then search. Review boarding stops and transfers in the result.','Abre Viaje, elige el origen y el destino de las sugerencias oficiales y busca. Revisa las paradas y los transbordos del resultado.');link(t('Plan a trip','Planear un viaje'),'/#trip');}
 else if(/next|arrival|when|próximo|proximo|cuándo|cuando|llegad/.test(q)){text=t('Which stop? Send “stop 1234” with your actual MCTS stop ID, or choose a stop on Stops. I can only report arrivals returned by verified services.','¿Qué parada? Envía “parada 1234” con el ID real de MCTS o elige una parada en Paradas. Solo puedo informar llegadas devueltas por servicios verificados.');link(t('Choose a stop','Elegir parada'),'/#stops');}
 else if(/near|stop|find.*bus|my bus|parada|cerca|buscar.*autobús|mi autobús/.test(q)){text=t('Open Stops and choose Enable My Location or Enter Location Manually. Select a verified result, adjust the radius, then open a stop to see its upcoming buses.','Abre Paradas y elige Activar mi ubicación o Introducir ubicación manualmente. Selecciona un resultado verificado, ajusta el radio y abre una parada para ver sus autobuses.');link(t('Find stops','Buscar paradas'),'/#stops');}
 else{text=t('I’m a rule-based transit helper, not a general-purpose AI model. I can explain stops, trip planning and alerts, or check an explicit MCTS stop ID. I cannot invent live transit information.','Soy un asistente de reglas, no un modelo de IA de propósito general. Puedo explicar paradas, viajes y avisos, o consultar un ID de parada de MCTS. No invento datos en vivo.');link(t('Open Stops','Abrir Paradas'),'/#stops');link(t('Open Trip','Abrir Viaje'),'/#trip');}
 return {text,links};
}
async function reply(message,language,services={}){
 const result=guidance(message,language);if(!result.lookupStop)return result;
 try{if(!services.departures)throw Error('Unavailable');return await services.departures(result.lookupStop,language);}
 catch{return {text:language==='es'?'No pude consultar las llegadas de esa parada. Abre Paradas y vuelve a intentarlo.':'I could not check arrivals for that stop. Open Stops and retry.',links:[{text:language==='es'?'Abrir Paradas':'Open Stops',href:'/#stops'}]};}
}
const api={guidance,reply};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AyoAssistant=api;
})(typeof window!=='undefined'?window:globalThis);
