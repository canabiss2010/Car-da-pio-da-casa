// cardapio_sw.js - versão para GitHub Pages (caminhos relativos)
// Atualize CACHE_NAME quando fizer mudanças para forçar atualização
const CACHE_NAME = 'cardapio-cache-v4';

const URLS_TO_CACHE = [
  './',
  'index.html',
  'cardapio_casa_pwa.html',
  'cardapio_manifest.json',
  'cardapio_sw.js',
  'icons/1147832-2.png',
  'icons/1147832.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => (key !== CACHE_NAME) ? caches.delete(key) : Promise.resolve())
    ))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
