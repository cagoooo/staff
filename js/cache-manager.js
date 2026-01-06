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
    // Create offline indicator if not exists
    createOfflineIndicator();

    window.addEventListener('online', () => {
        console.log('[Cache] Back online');
        hideOfflineIndicator();
        showOnlineToast();
        if (onOnline) onOnline();
    });

    window.addEventListener('offline', () => {
        console.log('[Cache] Gone offline');
        showOfflineIndicator();
        if (onOffline) onOffline();
    });

    // Check initial state
    if (!navigator.onLine) {
        showOfflineIndicator();
    }
}

// Create offline indicator element
function createOfflineIndicator() {
    if (document.getElementById('offline-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(90deg, #e17055, #d63031);
        color: white;
        text-align: center;
        padding: 10px;
        font-family: 'VT323', monospace;
        font-size: 18px;
        z-index: 99999;
        display: none;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    indicator.innerHTML = '📡 您目前離線中，部分功能可能受限';
    document.body.appendChild(indicator);
}

// Show offline indicator
function showOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.style.display = 'block';
    }
}

// Hide offline indicator
function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Show online toast
function showOnlineToast() {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(90deg, #00b894, #00cec9);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-family: 'VT323', monospace;
        font-size: 18px;
        z-index: 99999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: fadeInOut 3s ease forwards;
    `;
    toast.textContent = '✅ 已恢復連線';

    // Add animation styles
    if (!document.getElementById('toast-animation-style')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-style';
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
