# CHANGELOG

## [v2.0.0] - 2026-01-01

### Major Updates

#### Code Modularization
- Split monolithic `index.html` into ES6 modules
- Created modular architecture:
  - `js/firebase-config.js` - Firebase setup
  - `js/auth.js` - Authentication logic
  - `js/firestore.js` - Database operations
  - `js/ui.js` - UI rendering
  - `js/app.js` - Main entry point
  - `components/modal.js` - Shared modal component

#### Full Traditional Chinese Localization
- All UI text translated to Traditional Chinese
- System title: 行政業務協調系統
- All button labels, prompts, and messages in Chinese

#### Pixel Art UI
- Custom pixel game style CSS
- Animated login page with bounce and glow effects
- Rainbow gradient header on cards
- Responsive design (RWD) for mobile/tablet

### Technical Improvements
- Dependency injection pattern to avoid circular imports
- Clean separation of concerns
- Better maintainability for team collaboration

---

## [v1.0.0] - Initial Release
- Basic login/register functionality
- Google OAuth integration
- Firebase Firestore for data storage
- Dashboard with announcements and events
- Notification system
- Event creation with target user selection
