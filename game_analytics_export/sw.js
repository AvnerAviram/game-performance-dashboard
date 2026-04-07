const CACHE_NAME = 'gad-v5';
const CDN_CACHE = 'gad-cdn-v5';

const CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches
            .open(CDN_CACHE)
            .then(cache => cache.addAll(CDN_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== CDN_CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = event.request.url;

    // CDN resources: cache-first (immutable versioned URLs)
    if (url.startsWith('https://cdn.jsdelivr.net/')) {
        event.respondWith(
            caches.match(event.request).then(
                cached =>
                    cached ||
                    fetch(event.request).then(resp => {
                        const clone = resp.clone();
                        caches.open(CDN_CACHE).then(c => c.put(event.request, clone));
                        return resp;
                    })
            )
        );
        return;
    }

    // Hashed assets (/assets/main-abc123.js): cache-first (immutable)
    if (url.includes('/assets/') && !url.endsWith('.html')) {
        event.respondWith(
            caches.match(event.request).then(
                cached =>
                    cached ||
                    fetch(event.request).then(resp => {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                        return resp;
                    })
            )
        );
        return;
    }

    // Everything else (API calls, HTML pages): pass through to network
    // Server handles caching via ETag + Cache-Control headers
});
