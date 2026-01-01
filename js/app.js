// Main Application Entry Point
import { initModal } from '../components/modal.js';
import { initAuth, checkLoadingComplete, setAuthDeps } from './auth.js';
import { globalUsers, getAppCurrentUser, setAppCurrentUser, startDataListeners, setFirestoreDeps } from './firestore.js';
import { initAppUI, updateSidebar, renderDashboard, renderNotifications, renderEditorOptions, updateNotificationBadge, switchTab } from './ui.js';
import { initEventModal } from './event-modal.js';
import { initSearch } from './search.js';
import { initStats } from './stats.js';
import { initNotificationSystem } from './notification-system.js';
import { initAdmin } from './admin.js';

// Wire up dependencies (avoid circular imports)
setAuthDeps({
    globalUsers,
    setAppCurrentUser,
    getAppCurrentUser,
    startDataListeners,
    initAppUI
});

setFirestoreDeps({
    checkLoadingComplete
});

// Initialize application
async function init() {
    console.log("Initializing modular application...");

    // Initialize modals and search
    initModal();
    initEventModal();
    initSearch();
    initStats();
    initNotificationSystem();
    initAdmin();

    // Initialize authentication
    await initAuth();

    // Timeout fallback
    setTimeout(() => {
        const loader = document.getElementById('global-loader');
        if (loader && loader.style.display !== 'none') {
            console.warn("Loading timeout, forcing entry");
            loader.style.display = 'none';

            const currentUser = getAppCurrentUser();
            if (currentUser) {
                initAppUI();
            } else {
                document.getElementById('auth-container').classList.remove('hidden-section');
            }
        }
    }, 8000);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

console.log("Modular app loaded successfully!");
