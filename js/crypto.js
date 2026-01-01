// Crypto Module - Password Hashing with SHA-256
// Uses Web Crypto API for secure hashing

/**
 * Hash a password using SHA-256
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hex encoded hash
 */
export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Stored hash to compare against
 * @returns {Promise<boolean>} - True if match
 */
export async function verifyPassword(password, hash) {
    const passwordHash = await hashPassword(password);
    return passwordHash === hash;
}

/**
 * Check if a password is already hashed (64 char hex string)
 * @param {string} password - Password to check
 * @returns {boolean} - True if already hashed
 */
export function isHashed(password) {
    if (!password) return false;
    return /^[a-f0-9]{64}$/i.test(password);
}

// Session management
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save session with timestamp
 * @param {Object} user - User data
 */
export function saveSession(user) {
    const session = {
        user: user,
        timestamp: Date.now(),
        expiry: Date.now() + SESSION_DURATION
    };
    sessionStorage.setItem('app_session', JSON.stringify(session));
}

/**
 * Get current session if valid
 * @returns {Object|null} - User data or null if expired
 */
export function getSession() {
    const sessionData = sessionStorage.getItem('app_session');
    if (!sessionData) return null;

    try {
        const session = JSON.parse(sessionData);

        // Check if session expired
        if (Date.now() > session.expiry) {
            clearSession();
            console.log('Session expired');
            return null;
        }

        return session.user;
    } catch (e) {
        clearSession();
        return null;
    }
}

/**
 * Clear session
 */
export function clearSession() {
    sessionStorage.removeItem('app_session');
    sessionStorage.removeItem('app_current_user');
}

/**
 * Check remaining session time
 * @returns {number} - Minutes remaining, or 0 if expired
 */
export function getSessionTimeRemaining() {
    const sessionData = sessionStorage.getItem('app_session');
    if (!sessionData) return 0;

    try {
        const session = JSON.parse(sessionData);
        const remaining = session.expiry - Date.now();
        return Math.max(0, Math.floor(remaining / 60000)); // in minutes
    } catch (e) {
        return 0;
    }
}
