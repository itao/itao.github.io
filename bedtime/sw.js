'use strict';
const CACHE='bedtime-v1';
const PAGE='/bedtime/';
const ASSETS=[PAGE,'/bedtime/manifest.webmanifest','/bedtime/assets/icon-192.png','/bedtime/assets/icon-512.png',
 '/bedtime/assets/fonts/dm-sans-400.ttf','/bedtime/assets/fonts/dm-sans-500.ttf',
 '/bedtime/assets/fonts/dm-sans-700.ttf','/bedtime/assets/fonts/dm-serif-display.ttf'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('bedtime-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname===PAGE||url.pathname==='/bedtime/index.html'){
  event.respondWith(fetch(event.request).then(async response=>{
   if(response.ok){const cache=await caches.open(CACHE);await cache.put(PAGE,response.clone());return response;}
   return (await caches.match(PAGE))||response;
  }).catch(()=>caches.match(PAGE)));
 }else if(ASSETS.includes(url.pathname)){
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
 }
});
