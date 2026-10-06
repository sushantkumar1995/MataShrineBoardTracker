const VERSION = 'shrine-v1';
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(['./','./manifest.webmanifest','./icon-192.png','./icon-512.png']))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
 const u = new URL(e.request.url);
 if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
 if (e.request.mode === 'navigate') {e.respondWith(fetch(e.request).then(r => {if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put('./',copy));}return r;}).catch(()=>caches.match('./')));return;}
 e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(e.request,copy));}return r;})));
});
