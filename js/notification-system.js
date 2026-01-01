// Enhanced Notification System Module
import { globalEvents, getAppCurrentUser } from './firestore.js';

let notificationPermission = 'default';
let reminderCheckInterval = null;

// Initialize notification system
export function initNotificationSystem() {
    console.log('[Notifications] Initializing...');

    // Check current permission
    if ('Notification' in window) {
        notificationPermission = Notification.permission;
    }

    // Inject notification permission button if needed
    injectNotificationUI();

    // Start reminder check loop (every 5 minutes)
    if (reminderCheckInterval) clearInterval(reminderCheckInterval);
    reminderCheckInterval = setInterval(checkUpcomingEvents, 5 * 60 * 1000);

    console.log('[Notifications] System initialized, permission:', notificationPermission);
}

// Inject notification permission UI
function injectNotificationUI() {
    const notifView = document.getElementById('view-notifications');
    if (!notifView || document.getElementById('notif-permission-section')) return;

    const permSection = document.createElement('div');
    permSection.id = 'notif-permission-section';
    permSection.className = 'content-card p-4 mb-4';
    permSection.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
                <h3 style="font-family: 'VT323', monospace; font-size: 22px;">🔔 瀏覽器推播通知</h3>
                <p id="notif-status" style="font-family: 'VT323', monospace; font-size: 18px; color: #636e72;">
                    ${getPermissionStatus()}
                </p>
            </div>
            <button onclick="requestNotificationPermission()" id="btn-notify-perm" class="pixel-btn" 
                ${notificationPermission === 'granted' ? 'disabled style="opacity: 0.5;"' : ''}>
                ${notificationPermission === 'granted' ? '✅ 已啟用' : '🔔 啟用通知'}
            </button>
        </div>
    `;

    notifView.insertBefore(permSection, notifView.firstChild);
}

// Get permission status text
function getPermissionStatus() {
    if (!('Notification' in window)) return '❌ 您的瀏覽器不支援推播通知';
    switch (notificationPermission) {
        case 'granted': return '✅ 已啟用推播通知，將收到行程提醒';
        case 'denied': return '❌ 已拒絕通知權限，請在瀏覽器設定中開啟';
        default: return '⚠️ 尚未啟用通知，點擊按鈕開啟';
    }
}

// Request notification permission
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('您的瀏覽器不支援推播通知');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        notificationPermission = permission;

        // Update UI
        const statusEl = document.getElementById('notif-status');
        const btnEl = document.getElementById('btn-notify-perm');
        if (statusEl) statusEl.innerText = getPermissionStatus();
        if (btnEl) {
            if (permission === 'granted') {
                btnEl.innerText = '✅ 已啟用';
                btnEl.disabled = true;
                btnEl.style.opacity = '0.5';

                // Show test notification
                showNotification('🎉 通知已啟用！', '您將收到行程提醒');
            }
        }
    } catch (err) {
        console.error('[Notifications] Permission request failed:', err);
    }
}

// Show a browser notification
export function showNotification(title, body, options = {}) {
    if (notificationPermission !== 'granted') return;

    const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options.tag || 'default',
        requireInteraction: options.requireInteraction || false,
        ...options
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
        if (options.onClick) options.onClick();
    };

    // Auto close after 10 seconds
    setTimeout(() => notification.close(), 10000);

    return notification;
}

// Check for upcoming events and send reminders
function checkUpcomingEvents() {
    if (notificationPermission !== 'granted') return;

    const currentUser = getAppCurrentUser();
    if (!currentUser) return;

    const events = globalEvents();
    const now = new Date();

    events.forEach(event => {
        // Only check events I'm involved in
        const isInvolved = event.targets?.includes(currentUser.id) || event.authorId === currentUser.id;
        if (!isInvolved) return;

        // Skip completed events
        if (event.completedBy?.includes(currentUser.id)) return;

        // Calculate time until event
        const eventDateTime = new Date(`${event.date}T${event.time || '09:00'}`);
        const diffMs = eventDateTime - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        // Reminder key to prevent duplicate notifications
        const reminderKey = `reminder_${event.id}_${Math.floor(diffHours)}`;

        // 1 hour reminder
        if (diffHours > 0.5 && diffHours <= 1 && !sessionStorage.getItem(reminderKey)) {
            showNotification(
                '⏰ 行程提醒',
                `「${event.title}」將在 1 小時後開始`,
                { tag: `event-${event.id}-1h` }
            );
            sessionStorage.setItem(reminderKey, 'sent');
        }

        // 1 day reminder
        if (diffHours > 23 && diffHours <= 24 && !sessionStorage.getItem(reminderKey)) {
            showNotification(
                '📅 明日行程',
                `「${event.title}」將在明天 ${event.time || '09:00'} 開始`,
                { tag: `event-${event.id}-1d` }
            );
            sessionStorage.setItem(reminderKey, 'sent');
        }
    });
}

// Manual trigger for testing
export function triggerTestNotification() {
    if (notificationPermission !== 'granted') {
        alert('請先啟用通知權限');
        return;
    }
    showNotification('🧪 測試通知', '這是一則測試通知訊息');
}

// Export to window
window.requestNotificationPermission = requestNotificationPermission;
window.triggerTestNotification = triggerTestNotification;
