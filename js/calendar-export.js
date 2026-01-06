// Calendar Export Module - iCal / Google Calendar
import { globalEvents, getAppCurrentUser } from './firestore.js';
import { showAlert } from '../components/modal.js';

// Generate iCal format string
function generateICalEvent(event) {
    const now = new Date();
    const uid = `${event.id}@smes-calendar`;

    // Parse date and time
    const [year, month, day] = event.date.split('-');
    const [hour, minute] = (event.time || '09:00').split(':');

    // Format dates for iCal (YYYYMMDDTHHMMSS)
    const startDate = `${year}${month}${day}T${hour}${minute}00`;
    const endHour = String(parseInt(hour) + 1).padStart(2, '0');
    const endDate = `${year}${month}${day}T${endHour}${minute}00`;
    const nowFormatted = now.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

    // Escape special characters
    const escapeIcal = (str) => str ? str.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n') : '';

    return `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${nowFormatted}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${escapeIcal(event.title)}
DESCRIPTION:發起人：${escapeIcal(event.authorName)}
STATUS:${event.completedBy?.length > 0 ? 'COMPLETED' : 'CONFIRMED'}
END:VEVENT`;
}

// Generate full iCal file content
function generateICalFile(events) {
    const header = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SMES//行政業務協調系統//ZH
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:行政業務協調系統
X-WR-TIMEZONE:Asia/Taipei`;

    const footer = `END:VCALENDAR`;

    const eventStrings = events.map(e => generateICalEvent(e)).join('\n');

    return `${header}\n${eventStrings}\n${footer}`;
}

// Export all events to iCal file
export function exportToICal() {
    const events = globalEvents();

    if (events.length === 0) {
        showAlert('沒有可匯出的行程');
        return;
    }

    const icalContent = generateICalFile(events);
    const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `smes_calendar_${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showAlert('✅ 行事曆已匯出！');
}

// Export selected month events
export function exportMonthToICal(year, month) {
    const events = globalEvents().filter(e => {
        const [eYear, eMonth] = e.date.split('-');
        return parseInt(eYear) === year && parseInt(eMonth) === month;
    });

    if (events.length === 0) {
        showAlert('該月份沒有行程');
        return;
    }

    const icalContent = generateICalFile(events);
    const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `smes_${year}_${String(month).padStart(2, '0')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showAlert(`✅ ${year}年${month}月行事曆已匯出！`);
}

// Add to Google Calendar (single event)
export function addToGoogleCalendar(eventId) {
    const events = globalEvents();
    const event = events.find(e => e.id === eventId);

    if (!event) {
        showAlert('找不到該行程');
        return;
    }

    // Format for Google Calendar URL
    const [year, month, day] = event.date.split('-');
    const [hour, minute] = (event.time || '09:00').split(':');
    const startDate = `${year}${month}${day}T${hour}${minute}00`;
    const endHour = String(parseInt(hour) + 1).padStart(2, '0');
    const endDate = `${year}${month}${day}T${endHour}${minute}00`;

    const title = encodeURIComponent(event.title);
    const details = encodeURIComponent(`發起人：${event.authorName}`);

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${details}&ctz=Asia/Taipei`;

    window.open(googleUrl, '_blank');
}

// Initialize export UI
export function initCalendarExport() {
    console.log('[CalendarExport] Initializing...');

    // Add export button to calendar view
    setTimeout(() => {
        const calendarView = document.getElementById('view-calendar');
        if (calendarView && !document.getElementById('calendar-export-btn')) {
            const header = calendarView.querySelector('.content-card .flex');
            if (header) {
                const exportBtn = document.createElement('button');
                exportBtn.id = 'calendar-export-btn';
                exportBtn.className = 'pixel-btn';
                exportBtn.style.cssText = 'padding: 8px 12px; margin-left: 8px;';
                exportBtn.innerHTML = '📥 匯出';
                exportBtn.onclick = () => showExportMenu();
                header.appendChild(exportBtn);
            }
        }
    }, 1000);

    console.log('[CalendarExport] Module initialized');
}

// Show export menu
function showExportMenu() {
    const existing = document.getElementById('export-menu');
    if (existing) {
        existing.remove();
        return;
    }

    const menu = document.createElement('div');
    menu.id = 'export-menu';
    menu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--pixel-bg-card, #fff);
        border: 4px solid #2d3436;
        box-shadow: 6px 6px 0 #2d3436;
        padding: 20px;
        z-index: 100;
        min-width: 320px;
    `;

    menu.innerHTML = `
        <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">📥 匯出 / 訂閱行事曆</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <button onclick="exportToICal(); document.getElementById('export-menu').remove();" 
                class="pixel-btn" style="width: 100%;">
                📅 匯出全部 (iCal)
            </button>
            <button onclick="exportCurrentMonth(); document.getElementById('export-menu').remove();" 
                class="pixel-btn" style="width: 100%;">
                📆 匯出本月 (iCal)
            </button>
            <hr style="border: 1px dashed #ccc; margin: 8px 0;">
            <button onclick="showSubscriptionOptions();" 
                class="pixel-btn" style="width: 100%; background: #00b894;">
                📲 訂閱行事曆 (Google/Apple)
            </button>
            <button onclick="document.getElementById('export-menu').remove();" 
                class="pixel-btn pixel-btn-secondary" style="width: 100%;">
                ❌ 關閉
            </button>
        </div>
    `;

    document.body.appendChild(menu);
}

// Show subscription options
function showSubscriptionOptions() {
    const currentUser = getAppCurrentUser();
    if (!currentUser) {
        showAlert('請先登入');
        return;
    }

    const menu = document.getElementById('export-menu');
    if (!menu) return;

    // Cloud Function URL
    const baseUrl = 'https://asia-east1-smes-e1dc3.cloudfunctions.net/getICalFeed';
    const subscriptionUrl = `${baseUrl}?userId=${currentUser.id}`;

    menu.innerHTML = `
        <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">📲 訂閱行事曆</h3>
        <p style="font-size: 14px; color: #666; margin-bottom: 12px;">
            複製下方連結，貼到 Google Calendar 或 Apple Calendar 訂閱：
        </p>
        <div style="background: #f5f5f5; padding: 10px; border-radius: 8px; margin-bottom: 12px; word-break: break-all; font-size: 12px;">
            ${subscriptionUrl}
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <button onclick="copySubscriptionUrl('${subscriptionUrl}');" 
                class="pixel-btn" style="width: 100%; background: #6c5ce7;">
                📋 複製訂閱連結
            </button>
            <button onclick="openGoogleCalendarSubscribe('${encodeURIComponent(subscriptionUrl)}');" 
                class="pixel-btn" style="width: 100%; background: #4285f4;">
                📅 加入 Google Calendar
            </button>
            <button onclick="showExportMenu();" 
                class="pixel-btn pixel-btn-secondary" style="width: 100%;">
                ← 返回
            </button>
        </div>
        <p style="font-size: 12px; color: #999; margin-top: 12px;">
            💡 提示：訂閱會自動同步更新，無需手動匯入
        </p>
    `;
}

// Copy subscription URL to clipboard
function copySubscriptionUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        showAlert('✅ 訂閱連結已複製！');
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showAlert('✅ 訂閱連結已複製！');
    });
}

// Open Google Calendar subscription page
function openGoogleCalendarSubscribe(encodedUrl) {
    const googleUrl = `https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodedUrl}`;
    window.open(googleUrl, '_blank');
}

// Export current month
function exportCurrentMonth() {
    const now = new Date();
    exportMonthToICal(now.getFullYear(), now.getMonth() + 1);
}

// Export to window
window.exportToICal = exportToICal;
window.exportMonthToICal = exportMonthToICal;
window.addToGoogleCalendar = addToGoogleCalendar;
window.exportCurrentMonth = exportCurrentMonth;
window.showSubscriptionOptions = showSubscriptionOptions;
window.showExportMenu = showExportMenu;
window.copySubscriptionUrl = copySubscriptionUrl;
window.openGoogleCalendarSubscribe = openGoogleCalendarSubscribe;
