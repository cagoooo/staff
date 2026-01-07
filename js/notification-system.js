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

    // Only show as enabled if user has bound LINE account AND has enabled sync
    const currentUser = getAppCurrentUser();
    const hasLineBound = !!currentUser?.lineUserId;
    const lineSyncEnabled = hasLineBound && localStorage.getItem('smes_line_sync') === 'true';

    const permSection = document.createElement('div');
    permSection.id = 'notif-permission-section';
    permSection.className = 'content-card p-4 mb-4';
    permSection.innerHTML = `
        <!-- 瀏覽器推播通知 -->
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4 pb-4" style="border-bottom: 2px dashed #dfe6e9;">
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
        
        <!-- LINE 同步選項 -->
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4 pb-4" style="border-bottom: 2px dashed #dfe6e9;">
            <div>
                <h3 style="font-family: 'VT323', monospace; font-size: 22px;">📲 LINE 提醒同步</h3>
                <p style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72; line-height: 1.5;">
                    當瀏覽器推播行程提醒時，<br>
                    <span style="color: #6c5ce7;">同時發送 LINE 訊息到您的手機</span>
                </p>
                <p style="font-family: 'VT323', monospace; font-size: 14px; color: #999; margin-top: 6px;">
                    💡 需先在個人設定中綁定 LINE 帳號
                </p>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="line-sync-toggle" 
                    ${lineSyncEnabled ? 'checked' : ''} 
                    onchange="toggleLineSync(this.checked)"
                    class="w-5 h-5 accent-green-500">
                <span id="line-sync-status" style="font-family: 'VT323', monospace; font-size: 18px; color: ${lineSyncEnabled ? '#00b894' : '#636e72'};">
                    ${lineSyncEnabled ? '✅ 已開啟' : '已關閉'}
                </span>
            </label>
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

        // Skip completed events (including globally completed by author)
        if (event.isGloballyCompleted || event.completedBy?.includes(currentUser.id)) return;

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
            // 同步發送 LINE 提醒
            sendLineReminder(event).catch(console.error);
            sessionStorage.setItem(reminderKey, 'sent');
        }

        // 1 day reminder
        if (diffHours > 23 && diffHours <= 24 && !sessionStorage.getItem(reminderKey)) {
            showNotification(
                '📅 明日行程',
                `「${event.title}」將在明天 ${event.time || '09:00'} 開始`,
                { tag: `event-${event.id}-1d` }
            );
            // 同步發送 LINE 提醒
            sendLineReminder(event).catch(console.error);
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

// Toggle LINE sync for reminders
export async function toggleLineSync(enabled) {
    const currentUser = getAppCurrentUser();

    // Check if user has bound LINE account before enabling
    if (enabled && !currentUser?.lineUserId) {
        // Reset toggle to unchecked
        const toggle = document.getElementById('line-sync-toggle');
        if (toggle) toggle.checked = false;

        // Show warning
        if (window.showAlert) {
            window.showAlert('⚠️ 您尚未綁定 LINE 帳號！請先至「帳號設定」綁定 LINE 才能使用此功能');
        }

        // Navigate to account settings and scroll to LINE section
        if (window.switchTab) {
            window.switchTab('account');
            setTimeout(() => {
                const lineSection = document.getElementById('line-settings-container');
                if (lineSection) {
                    lineSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    lineSection.style.animation = 'pulse 1s ease-in-out 3';
                    setTimeout(() => lineSection.style.animation = '', 3000);
                }
            }, 300);
        }
        return;
    }

    localStorage.setItem('smes_line_sync', enabled ? 'true' : 'false');

    // Update UI with visual feedback
    const statusEl = document.getElementById('line-sync-status');
    if (statusEl) {
        statusEl.style.color = enabled ? '#00b894' : '#636e72';
        statusEl.textContent = enabled ? '✅ 已開啟' : '已關閉';

        // 短暫高亮效果
        statusEl.style.transition = 'all 0.3s';
        statusEl.style.transform = 'scale(1.1)';
        setTimeout(() => {
            statusEl.style.transform = 'scale(1)';
        }, 300);
    }

    // 顯示狀態變更提示
    const message = enabled
        ? '📲 LINE 提醒同步已開啟！瀏覽器提醒時將同步發送 LINE 訊息'
        : '📴 LINE 提醒同步已關閉';

    // 建立簡易 Toast 通知
    showToast(message, enabled ? '#00b894' : '#636e72');

    console.log('[Notifications] LINE sync:', enabled ? 'enabled' : 'disabled');

    // 發送 LINE 同步狀態通知給使用者 (currentUser already declared at top of function)
    if (currentUser?.lineUserId && currentUser?.lineNotifyEnabled) {
        try {
            const response = await fetch('https://asia-east1-smes-e1dc3.cloudfunctions.net/notifySyncStatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    enabled: enabled
                })
            });

            if (response.ok) {
                console.log('[Notifications] LINE sync status notification sent');
            } else {
                console.warn('[Notifications] Failed to send LINE sync status notification');
            }
        } catch (err) {
            console.error('[Notifications] Error sending LINE sync status notification:', err);
        }
    }
}

// 簡易 Toast 通知
function showToast(message, bgColor = '#333') {
    // 移除舊的 toast
    const oldToast = document.getElementById('line-sync-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'line-sync-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${bgColor};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: 'VT323', monospace;
        font-size: 18px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: toastIn 0.3s ease;
    `;
    toast.textContent = message;

    // 加入動畫樣式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes toastIn {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    // 3 秒後移除
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Send LINE reminder for an event (called when browser reminder triggers)
async function sendLineReminder(event) {
    const lineSyncEnabled = localStorage.getItem('smes_line_sync') === 'true';
    if (!lineSyncEnabled) return;

    const currentUser = getAppCurrentUser();
    if (!currentUser?.lineUserId || !currentUser?.lineNotifyEnabled) return;

    try {
        // Call Cloud Function to send LINE message
        const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js");
        const functions = getFunctions();
        const sendReminder = httpsCallable(functions, 'sendLineReminder');

        await sendReminder({
            eventId: event.id,
            eventTitle: event.title,
            eventTime: event.time || '09:00',
            userId: currentUser.id
        });

        console.log('[Notifications] LINE reminder sent for event:', event.id);
    } catch (err) {
        console.error('[Notifications] Failed to send LINE reminder:', err);
    }
}

// Export to window
window.requestNotificationPermission = requestNotificationPermission;
window.triggerTestNotification = triggerTestNotification;
window.toggleLineSync = toggleLineSync;

// Make sendLineReminder available internally
export { sendLineReminder };
