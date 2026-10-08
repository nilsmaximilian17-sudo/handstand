// Service Worker fuer Handstand Logbuch: macht die App offline nutzbar.
// Eigene Dateien: erst Netz (damit Updates sofort ankommen), sonst Zwischenspeicher.
// Erkennungs-Bibliothek, Modell und Schrift: einmal laden, danach aus dem Zwischenspeicher.
const CORE = 'hs-core-v17';
const LIB = 'hs-lib-v1';
const CORE_FILES = ['handstand-log.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const POSE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const LIB_FILES = [
  POSE + '/vision_bundle.mjs',
  POSE + '/wasm/vision_wasm_internal.js',
  POSE + '/wasm/vision_wasm_internal.wasm',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const core = await caches.open(CORE);
    await Promise.allSettled(CORE_FILES.map((f) => core.add(new Request(f, { cache: 'reload' }))));
    const lib = await caches.open(LIB);
    await Promise.allSettled(LIB_FILES.map((u) => lib.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CORE && k !== LIB).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CORE);
  try {
    const res = await Promise.race([
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.status === 200) cache.put(req.url, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req.url, { ignoreSearch: true }))
      || (await cache.match('handstand-log.html'))
      || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(LIB);
  const hit = await cache.match(req);
  // Eine undurchsichtige (opaque) Antwort darf nicht fuer eine CORS-Anfrage benutzt werden.
  if (hit && !(hit.type === 'opaque' && req.mode === 'cors')) return hit;
  const res = await fetch(req);
  if (res && (res.status === 200 || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  // Alle fremden Dateien (Erkennungs-Bibliotheken, Modelle, Schrift): einmal laden, danach offline aus dem Speicher
  e.respondWith(cacheFirst(req));
});
