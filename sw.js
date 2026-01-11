// Service Worker for Offline Support
const CACHE_NAME = 'smes-v3.14.5';
const STATIC_ASSETS = [
    'index.html',
    'manifest.json',
    'css/pixel-style.css',
    'css/mobile-fixes.css',
    'css/dark-mode.css',
    'css/animations.css',
    'js/app.js',
    'js/firebase-config.js',
    'js/auth.js',
    'js/firestore.js',
    'js/ui.js',
    'js/crypto.js',
    'js/cache-manager.js',
    'js/departments.js',
    'js/theme.js',
    'js/stats.js',
    'js/search.js',
    'js/tags.js',
    'js/event-modal.js',
    'js/swipe-gestures.js',
    'js/trash.js',
    'components/modal.js'
];

// Install - cache static assets (graceful failure)
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Cache each file individually to avoid single failure breaking all caching
                return Promise.allSettled(
                    STATIC_ASSETS.map(async (url) => {
                        try {
                            const response = await fetch(url);
                            if (response.ok) {
                                await cache.put(url, response);
                                console.log('[SW] Cached:', url);
                            } else {
                                console.warn('[SW] Failed to cache (not ok):', url);
                            }
                        } catch (err) {
                            console.warn('[SW] Failed to cache:', url, err.message);
                        }
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Removing old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip Firebase and external requests
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone and cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Return offline page for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
