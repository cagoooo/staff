// Service Worker for Offline Support
// 同一網域（cagoooo.github.io）的所有工具共用快取空間，只能清除自己這個網站的快取
const CACHE_PREFIX = 'smes-staff-';
const CACHE_NAME = CACHE_PREFIX + 'v1.0.2';
// 本站以前用過的快取名稱（舊版沒有專屬前綴，逐一列出才能清掉，不誤刪其他網站）
const LEGACY_CACHE_NAMES = ['smes-v2.1.0', 'smes-v3.5.0', 'smes-v3.12.0', 'smes-v3.12.1', 'smes-v3.14.5', 'smes-v3.14.6'];
const isOwnCache = (name) => name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_NAMES.includes(name);
const STATIC_ASSETS = [
    'index.html',
    'manifest.json',
    'css/pixel-style.css',
    'css/mobile-fixes.css',
    'css/dark-mode.css',
    'css/animations.css',
    'css/site-footer.css',
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
                    .filter((name) => isOwnCache(name) && name !== CACHE_NAME)
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
