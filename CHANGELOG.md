# CHANGELOG

## [v2.3.0] - 2026-01-01

### Google Calendar Integration
- **Calendar Sync**: One-way sync from system to Google Calendar
- **OAuth Scope**: Auto-request calendar permission on Google login
- **Sync Option**: "📅 同步至 Google 行事曆" checkbox in event form
- **Access Token**: Store and manage calendar access token

### New Files
- `js/google-calendar.js` - Google Calendar API module

---

## [v2.2.0] - 2026-01-01

### Backend RWD Optimization
- **Mobile Hamburger Menu**: ☰ toggle for sidebar
- **Collapsible Sidebar**: Slide-in animation with overlay
- **Touch-Friendly**: Min 48px button/input size
- **Responsive Dashboard**: Grid → single column on mobile
- **Scrollable Auth**: Login page scrollable on short screens
- **Larger Title**: 36px login title with RWD breakpoints

### RWD Breakpoints
- Desktop: > 1024px (sidebar + 2-col grid)
- Tablet: 768-1024px (sidebar + 1-col grid)
- Mobile: < 768px (hamburger menu)
- Small: < 480px (compact UI)
- Short: < 600px height (compressed login)

---

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
