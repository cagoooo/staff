// Cache Manager - LocalStorage wrapper for offline data
const CACHE_KEYS = {
    USERS: 'smes_cached_users',
    EVENTS: 'smes_cached_events',
    LAST_SYNC: 'smes_last_sync'
};

/**
 * Save users to local cache
 * @param {Array} users - User list
 */
export function cacheUsers(users) {
    try {
        localStorage.setItem(CACHE_KEYS.USERS, JSON.stringify(users));
        updateLastSync();
    } catch (e) {
        console.warn('Failed to cache users:', e);
    }
}

/**
 * Get cached users
 * @returns {Array} - Cached users or empty array
 */
export function getCachedUsers() {
    try {
        const data = localStorage.getItem(CACHE_KEYS.USERS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Save events to local cache
 * @param {Array} events - Event list
 */
export function cacheEvents(events) {
    try {
        localStorage.setItem(CACHE_KEYS.EVENTS, JSON.stringify(events));
        updateLastSync();
    } catch (e) {
        console.warn('Failed to cache events:', e);
    }
}

/**
 * Get cached events
 * @returns {Array} - Cached events or empty array
 */
export function getCachedEvents() {
    try {
        const data = localStorage.getItem(CACHE_KEYS.EVENTS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Update last sync timestamp
 */
function updateLastSync() {
    localStorage.setItem(CACHE_KEYS.LAST_SYNC, Date.now().toString());
}

/**
 * Get last sync time
 * @returns {Date|null} - Last sync date or null
 */
export function getLastSyncTime() {
    const timestamp = localStorage.getItem(CACHE_KEYS.LAST_SYNC);
    return timestamp ? new Date(parseInt(timestamp)) : null;
}

/**
 * Check if cache is stale (older than 1 hour)
 * @returns {boolean} - True if cache is stale
 */
export function isCacheStale() {
    const lastSync = getLastSyncTime();
    if (!lastSync) return true;

    const oneHour = 60 * 60 * 1000;
    return (Date.now() - lastSync.getTime()) > oneHour;
}

/**
 * Clear all cached data
 */
export function clearCache() {
    Object.values(CACHE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
}

/**
 * Check if online
 * @returns {boolean} - True if online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Register online/offline event handlers
 * @param {Function} onOnline - Called when going online
 * @param {Function} onOffline - Called when going offline
 */
export function registerNetworkHandlers(onOnline, onOffline) {
    window.addEventListener('online', () => {
        console.log('[Cache] Back online');
        if (onOnline) onOnline();
    });

    window.addEventListener('offline', () => {
        console.log('[Cache] Gone offline');
        if (onOffline) onOffline();
    });
}
