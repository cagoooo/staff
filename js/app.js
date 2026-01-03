// Main Application Entry Point
import { initModal } from '../components/modal.js';
import { initAuth, checkLoadingComplete, setAuthDeps, restoreRememberedCredentials } from './auth.js';
import { globalUsers, getAppCurrentUser, setAppCurrentUser, startDataListeners, setFirestoreDeps } from './firestore.js';
import { initAppUI, updateSidebar, renderDashboard, renderNotifications, renderEditorOptions, updateNotificationBadge, switchTab } from './ui.js';
import { initEventModal } from './event-modal.js';
import { initSearch } from './search.js';
import { initStats } from './stats.js';
import { initNotificationSystem } from './notification-system.js';
import { initAdmin } from './admin.js';
import './storage.js'; // Load storage utilities
import { initTheme } from './theme.js';
import { initCalendarExport } from './calendar-export.js';
import { initBatchOperations } from './batch-operations.js';
import { initRecurringEvents } from './recurring-events.js';
import { initTags } from './tags.js';
import { initComments } from './comments.js';
import { initReminders } from './reminders.js';
import { initLineConnect } from './line-connect.js';
import './conflict-detection.js'; // Load conflict detection
import { initTemplates } from './templates.js';
import './backup-restore.js'; // Load backup/restore

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
    initTheme();
    initCalendarExport();
    initBatchOperations();
    initRecurringEvents();
    initTags();
    initComments();
    initReminders();
    initLineConnect();
    initTemplates();

    // 恢復記住的帳號密碼
    restoreRememberedCredentials();

    // Initialize authentication (includes 3s timeout fallback)
    await initAuth();
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

console.log("Modular app loaded successfully!");
