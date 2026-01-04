// Reminders Module - Custom Event Reminders
import { db, appId } from './firebase-config.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';
import { getAppCurrentUser, getEventById, globalEvents } from './firestore.js';

// User's reminders
let _userReminders = [];
let _remindersUnsubscribe = null;
let _reminderCheckInterval = null;

// Reminder presets (minutes before event)
const REMINDER_PRESETS = [
    { value: 5, label: '5 分鐘前' },
    { value: 15, label: '15 分鐘前' },
    { value: 30, label: '30 分鐘前' },
    { value: 60, label: '1 小時前' },
    { value: 120, label: '2 小時前' },
    { value: 1440, label: '1 天前' },
    { value: 2880, label: '2 天前' },
    { value: 10080, label: '1 週前' }
];

// Initialize reminders module
export function initReminders() {
    console.log('[Reminders] Initializing...');

    // Request notification permission
    requestNotificationPermission();

    // Start reminder checker
    startReminderChecker();

    // Start reminders listener when user is available
    // Check periodically until user is logged in
    const checkUser = setInterval(() => {
        const user = getAppCurrentUser();
        if (user) {
            startRemindersListener();
            clearInterval(checkUser);
        }
    }, 2000);

    console.log('[Reminders] Module initialized');
}

// Request browser notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('[Reminders] Browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        console.log('[Reminders] Notification permission already granted');
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        console.log('[Reminders] Notification permission:', permission);
        return permission === 'granted';
    }

    return false;
}

// Start listening to user's reminders
export function startRemindersListener() {
    const user = getAppCurrentUser();
    if (!user) return;

    if (_remindersUnsubscribe) {
        _remindersUnsubscribe();
    }

    const remindersRef = collection(db, 'artifacts', appId, 'public', 'data', 'reminders');
    const q = query(remindersRef, where('userId', '==', user.id));

    _remindersUnsubscribe = onSnapshot(q, (snapshot) => {
        _userReminders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log('[Reminders] Loaded', _userReminders.length, 'reminders');
    }, (error) => {
        console.error('[Reminders] Listener error:', error);
    });
}

// Stop listening
export function stopRemindersListener() {
    if (_remindersUnsubscribe) {
        _remindersUnsubscribe();
        _remindersUnsubscribe = null;
    }
}

// Add a reminder for an event
export async function addReminder(eventId, minutesBefore, customMessage = '') {
    const user = getAppCurrentUser();
    if (!user) {
        showAlert('請先登入');
        return null;
    }

    const event = getEventById(eventId);
    if (!event) {
        showAlert('找不到該行程');
        return null;
    }

    // Calculate reminder time
    const eventDateTime = new Date(`${event.date}T${event.time || '00:00'}`);
    const reminderTime = new Date(eventDateTime.getTime() - (minutesBefore * 60 * 1000));

    // Check if reminder is in the past
    if (reminderTime <= new Date()) {
        showAlert('提醒時間已過，請選擇其他時間');
        return null;
    }

    // Check for duplicate
    const existing = _userReminders.find(r =>
        r.eventId === eventId && r.minutesBefore === minutesBefore
    );
    if (existing) {
        showAlert('已設定相同時間的提醒');
        return existing;
    }

    try {
        const remindersRef = collection(db, 'artifacts', appId, 'public', 'data', 'reminders');
        const docRef = await addDoc(remindersRef, {
            userId: user.id,
            eventId,
            eventTitle: event.title,
            eventDate: event.date,
            eventTime: event.time,
            minutesBefore,
            reminderTime: reminderTime.toISOString(),
            customMessage,
            triggered: false,
            createdAt: new Date().toISOString()
        });

        console.log('[Reminders] Added reminder:', docRef.id);
        showAlert(`已設定提醒：${getPresetLabel(minutesBefore)}`);
        return docRef.id;
    } catch (err) {
        console.error('[Reminders] Add failed:', err);
        showAlert('新增提醒失敗：' + err.message);
        return null;
    }
}

// Delete a reminder
export async function deleteReminder(reminderId) {
    try {
        const reminderRef = doc(db, 'artifacts', appId, 'public', 'data', 'reminders', reminderId);
        await deleteDoc(reminderRef);
        console.log('[Reminders] Deleted reminder:', reminderId);
        return true;
    } catch (err) {
        console.error('[Reminders] Delete failed:', err);
        showAlert('刪除提醒失敗：' + err.message);
        return false;
    }
}

// Get reminders for an event
export function getRemindersForEvent(eventId) {
    return _userReminders.filter(r => r.eventId === eventId);
}

// Get preset label
function getPresetLabel(minutes) {
    const preset = REMINDER_PRESETS.find(p => p.value === minutes);
    return preset ? preset.label : `${minutes} 分鐘前`;
}

// Start periodic reminder checker
function startReminderChecker() {
    // Check every minute
    _reminderCheckInterval = setInterval(() => {
        checkAndTriggerReminders();
    }, 60000);

    // Also check immediately
    setTimeout(() => checkAndTriggerReminders(), 5000);
}

// Check and trigger due reminders
async function checkAndTriggerReminders() {
    const user = getAppCurrentUser();
    if (!user) return;

    const now = new Date();

    for (const reminder of _userReminders) {
        if (reminder.triggered) continue;

        const reminderTime = new Date(reminder.reminderTime);

        // Check if reminder is due (within the last 2 minutes)
        if (reminderTime <= now && (now - reminderTime) < 120000) {
            console.log('[Reminders] Triggering reminder:', reminder.id);
            triggerReminder(reminder);

            // Mark as triggered
            try {
                const reminderRef = doc(db, 'artifacts', appId, 'public', 'data', 'reminders', reminder.id);
                await updateDoc(reminderRef, { triggered: true });
            } catch (err) {
                console.error('[Reminders] Failed to mark triggered:', err);
            }
        }
    }
}

// Trigger a reminder notification
function triggerReminder(reminder) {
    const title = `⏰ 行程提醒`;
    const body = reminder.customMessage ||
        `「${reminder.eventTitle}」將在 ${getPresetLabel(reminder.minutesBefore)} 開始\n時間：${reminder.eventDate} ${reminder.eventTime}`;

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: `reminder-${reminder.id}`,
            requireInteraction: true
        });

        notification.onclick = () => {
            window.focus();
            if (window.openEventModal) {
                window.openEventModal(reminder.eventId);
            }
            notification.close();
        };
    }

    // Also show in-app alert
    showAlert(`⏰ 行程提醒\n\n${reminder.eventTitle}\n時間：${reminder.eventDate} ${reminder.eventTime}`);
}

// Render reminder settings UI for an event
export function renderReminderSettings(eventId) {
    const reminders = getRemindersForEvent(eventId);
    const event = getEventById(eventId);

    if (!event) return '';

    const eventDateTime = new Date(`${event.date}T${event.time || '00:00'}`);
    const now = new Date();
    const isPast = eventDateTime <= now;

    return `
        <div class="mt-4 pt-4 border-t-2 border-gray-200">
            <h4 style="font-family: 'VT323', monospace; font-size: 20px; margin-bottom: 12px;">
                ⏰ 提醒設定
            </h4>
            
            ${isPast ? `
                <p class="text-gray-400" style="font-family: 'VT323', monospace; font-size: 16px;">
                    此行程已過期，無法設定提醒
                </p>
            ` : `
                <!-- Existing Reminders -->
                <div id="existing-reminders" class="mb-3">
                    ${reminders.length > 0 ? reminders.map(r => `
                        <div class="flex justify-between items-center p-2 bg-purple-50 mb-2" 
                            style="font-family: 'VT323', monospace; font-size: 16px; border-left: 3px solid #6c5ce7;">
                            <span>🔔 ${getPresetLabel(r.minutesBefore)}${r.triggered ? ' ✓ 已觸發' : ''}</span>
                            <button onclick="deleteReminderConfirm('${r.id}')" 
                                style="background: none; border: none; color: #e17055; cursor: pointer; font-size: 16px;">
                                🗑️
                            </button>
                        </div>
                    `).join('') : `
                        <p class="text-gray-400 mb-2" style="font-family: 'VT323', monospace; font-size: 16px;">
                            尚未設定提醒
                        </p>
                    `}
                </div>
                
                <!-- Add Reminder -->
                <div class="flex gap-2" style="position: relative; z-index: 100;">
                    <select id="reminder-preset" class="pixel-input flex-1" style="font-size: 14px; padding: 6px; position: relative; z-index: 100;">
                        <option value="">選擇提醒時間...</option>
                        ${REMINDER_PRESETS.map(p => {
        const reminderTime = new Date(eventDateTime.getTime() - (p.value * 60 * 1000));
        const isAvailable = reminderTime > now;
        return isAvailable ? `<option value="${p.value}">${p.label}</option>` : '';
    }).join('')}
                    </select>
                    <button onclick="addReminderFromSelect('${eventId}')" 
                        class="pixel-btn" style="padding: 6px 12px; font-size: 14px;">
                        ➕ 新增
                    </button>
                </div>
                
                <!-- Notification Permission Status -->
                <div id="notification-status" class="mt-2" style="font-size: 14px;">
                    ${getNotificationStatusHTML()}
                </div>
            `}
        </div>
    `;
}

// Get notification permission status HTML
function getNotificationStatusHTML() {
    if (!('Notification' in window)) {
        return '<span style="color: #e17055;">⚠️ 此瀏覽器不支援通知功能</span>';
    }

    if (Notification.permission === 'granted') {
        return '<span style="color: #00b894;">✓ 通知已啟用</span>';
    }

    if (Notification.permission === 'denied') {
        return '<span style="color: #e17055;">⚠️ 通知被封鎖，請在瀏覽器設定中啟用</span>';
    }

    return `<button onclick="requestNotificationPermissionUI()" class="pixel-btn" style="font-size: 12px; padding: 4px 8px;">
        🔔 啟用通知
    </button>`;
}

// Window exports
window.addReminderFromSelect = async function (eventId) {
    const select = document.getElementById('reminder-preset');
    if (!select || !select.value) {
        showAlert('請選擇提醒時間');
        return;
    }

    const minutes = parseInt(select.value);
    await addReminder(eventId, minutes);

    // Re-render the reminder settings
    const container = document.querySelector('#event-reminders-section');
    if (container) {
        container.innerHTML = renderReminderSettings(eventId);
    }

    select.value = '';
};

window.deleteReminderConfirm = function (reminderId) {
    // 先找到 reminder 並保存 eventId，因為刪除後可能無法取得
    const reminder = _userReminders.find(r => r.id === reminderId);
    const eventId = reminder?.eventId;

    showConfirm('確定要刪除這個提醒嗎？', async () => {
        await deleteReminder(reminderId);

        // 使用保存的 eventId 重新渲染提醒設定區塊
        if (eventId) {
            // 等待一小段時間讓 Firestore 監聽器更新 _userReminders
            setTimeout(() => {
                const container = document.querySelector('#event-reminders-section');
                if (container) {
                    container.innerHTML = renderReminderSettings(eventId);
                }
            }, 500);
        }
    });
};

window.requestNotificationPermissionUI = async function () {
    const granted = await requestNotificationPermission();
    if (granted) {
        showAlert('通知已啟用！');
    } else {
        showAlert('通知權限被拒絕');
    }

    // Update UI
    const status = document.getElementById('notification-status');
    if (status) {
        status.innerHTML = getNotificationStatusHTML();
    }
};

// Export for external use
export { REMINDER_PRESETS, _userReminders as userReminders };
