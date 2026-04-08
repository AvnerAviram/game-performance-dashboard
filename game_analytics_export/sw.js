const CACHE_NAME = 'gad-v12';

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Hashed assets + self-hosted DuckDB WASM: cache-first (immutable)
    if ((url.includes('/assets/') || url.includes('/duckdb/')) && !url.endsWith('.html')) {
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

    // Game data files: stale-while-revalidate (fast repeat loads, eventual freshness)
    if (url.includes('/data/games.parquet') || url.includes('/data/games_processed.json')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const networkFetch = fetch(event.request)
                    .then(resp => {
                        if (resp.ok) {
                            const clone = resp.clone();
                            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                        }
                        return resp;
                    })
                    .catch(() => cached || fetch(event.request));

                return cached || networkFetch;
            })
        );
        return;
    }

    // Everything else (API calls, HTML pages): pass through to network
    // Server handles caching via ETag + Cache-Control headers
});
