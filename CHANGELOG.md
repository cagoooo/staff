# CHANGELOG

## [v2.1.0] - 2026-01-01

### P0 Security Enhancements
- **Password Hashing**: SHA-256 encryption via Web Crypto API
- **Password Migration**: Auto-migrate plain text to hashed on login
- **Session Expiration**: 24-hour session with auto-expiry
- **Security Rules**: Firestore rules for access control

### P0 Offline Support
- **Service Worker**: Cache static assets for offline access
- **LocalStorage Caching**: Cache users/events data
- **Offline Detection**: Network status handling
- **Offline Messages**: User-friendly offline alerts

### New Files
- `js/crypto.js` - Password hashing & session management
- `js/cache-manager.js` - LocalStorage cache wrapper
- `sw.js` - Service Worker
- `firestore.rules` - Firestore security rules

---

## [v2.0.0] - 2026-01-01

### Major Updates
- Code Modularization (6 ES6 modules)
- Full Traditional Chinese Localization
- Pixel Art UI with animations

---

## [v1.0.0] - Initial Release
- Basic login/register
- Google OAuth
- Firebase Firestore
- Dashboard & notifications
