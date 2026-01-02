// Batch Operations Module
import { globalEvents, getAppCurrentUser, deleteEvent } from './firestore.js';
import { showAlert, showConfirm } from '../components/modal.js';
import { db, appId } from './firebase-config.js';
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let selectedEvents = new Set();
let batchMode = false;

// Initialize batch operations
export function initBatchOperations() {
    console.log('[BatchOps] Initializing...');

    // Add batch mode toggle to dashboard
    setTimeout(() => {
        injectBatchUI();
    }, 1500);

    console.log('[BatchOps] Module initialized');
}

// Inject batch operation UI
function injectBatchUI() {
    const dashboard = document.getElementById('view-dashboard');
    if (!dashboard || document.getElementById('batch-toolbar')) return;

    // Batch toolbar (hidden by default)
    const toolbar = document.createElement('div');
    toolbar.id = 'batch-toolbar';
    toolbar.className = 'hidden-section';
    toolbar.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: var(--pixel-bg-card, #fff);
        border-top: 4px solid #2d3436;
        padding: 12px;
        display: flex;
        justify-content: center;
        gap: 12px;
        z-index: 50;
        flex-wrap: wrap;
    `;
    toolbar.innerHTML = `
        <span id="batch-count" style="font-family: 'VT323', monospace; font-size: 20px; display: flex; align-items: center;">
            已選擇 <strong id="selected-count">0</strong> 項
        </span>
        <button onclick="batchMarkComplete()" class="pixel-btn" style="padding: 8px 16px;">
            ✅ 標記完成
        </button>
        <button onclick="batchDelete()" class="pixel-btn" style="padding: 8px 16px; background: #e17055;">
            🗑️ 批次刪除
        </button>
        <button onclick="batchExport()" class="pixel-btn" style="padding: 8px 16px;">
            📥 匯出選取
        </button>
        <button onclick="exitBatchMode()" class="pixel-btn pixel-btn-secondary" style="padding: 8px 16px;">
            ❌ 取消
        </button>
    `;
    document.body.appendChild(toolbar);

    // Add batch mode button to announcement header
    const announcementCard = dashboard.querySelector('.content-card');
    if (announcementCard) {
        const header = announcementCard.querySelector('h2');
        if (header && !document.getElementById('btn-batch-mode')) {
            const batchBtn = document.createElement('button');
            batchBtn.id = 'btn-batch-mode';
            batchBtn.className = 'pixel-btn';
            batchBtn.style.cssText = 'padding: 4px 10px; font-size: 16px; margin-left: 10px;';
            batchBtn.innerHTML = '☑️ 批次';
            batchBtn.onclick = () => enterBatchMode();
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.appendChild(batchBtn);
        }
    }
}

// Enter batch selection mode
export function enterBatchMode() {
    batchMode = true;
    selectedEvents.clear();

    document.getElementById('batch-toolbar')?.classList.remove('hidden-section');
    document.getElementById('btn-batch-mode')?.classList.add('hidden-section');

    // Add checkboxes to announcement items
    const items = document.querySelectorAll('#announcement-list > div');
    items.forEach(item => {
        if (item.querySelector('.batch-checkbox')) return;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'batch-checkbox';
        checkbox.style.cssText = 'width: 20px; height: 20px; margin-right: 10px; cursor: pointer;';
        checkbox.onchange = (e) => {
            e.stopPropagation();
            const eventId = item.dataset.eventId;
            if (checkbox.checked) {
                selectedEvents.add(eventId);
            } else {
                selectedEvents.delete(eventId);
            }
            updateSelectedCount();
        };

        item.style.display = 'flex';
        item.style.alignItems = 'flex-start';
        item.insertBefore(checkbox, item.firstChild);

        // Prevent modal from opening in batch mode
        item.onclick = (e) => {
            if (batchMode) {
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        };
    });

    updateSelectedCount();
}

// Exit batch selection mode
export function exitBatchMode() {
    batchMode = false;
    selectedEvents.clear();

    document.getElementById('batch-toolbar')?.classList.add('hidden-section');
    document.getElementById('btn-batch-mode')?.classList.remove('hidden-section');

    // Remove checkboxes
    document.querySelectorAll('.batch-checkbox').forEach(cb => cb.remove());

    // Restore normal click behavior - re-render dashboard
    if (window.renderDashboard) window.renderDashboard();
}

// Update selected count display
function updateSelectedCount() {
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.innerText = selectedEvents.size;
}

// Batch mark as complete
export async function batchMarkComplete() {
    if (selectedEvents.size === 0) {
        showAlert('請先選擇行程');
        return;
    }

    const currentUser = getAppCurrentUser();
    if (!currentUser) return;

    showConfirm(`確定要將 ${selectedEvents.size} 項行程標記為完成嗎？`, async () => {
        let successCount = 0;

        for (const eventId of selectedEvents) {
            try {
                const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
                await updateDoc(eventRef, { completedBy: arrayUnion(currentUser.id) });
                successCount++;
            } catch (err) {
                console.error('[BatchOps] Mark complete failed:', err);
            }
        }

        showAlert(`✅ 已完成 ${successCount} 項行程`);
        exitBatchMode();
    });
}

// Batch delete
export async function batchDelete() {
    if (selectedEvents.size === 0) {
        showAlert('請先選擇行程');
        return;
    }

    const currentUser = getAppCurrentUser();
    const events = globalEvents();

    // Check ownership
    const ownedEvents = [...selectedEvents].filter(id => {
        const event = events.find(e => e.id === id);
        return event && event.authorId === currentUser?.id;
    });

    if (ownedEvents.length === 0) {
        showAlert('您只能刪除自己建立的行程');
        return;
    }

    if (ownedEvents.length < selectedEvents.size) {
        showAlert(`注意：${selectedEvents.size - ownedEvents.length} 項行程不是您建立的，將不會刪除`);
    }

    showConfirm(`確定要刪除 ${ownedEvents.length} 項行程嗎？此操作無法復原。`, async () => {
        let successCount = 0;

        for (const eventId of ownedEvents) {
            const success = await deleteEvent(eventId);
            if (success) successCount++;
        }

        showAlert(`🗑️ 已刪除 ${successCount} 項行程`);
        exitBatchMode();
    });
}

// Batch export to iCal
export function batchExport() {
    if (selectedEvents.size === 0) {
        showAlert('請先選擇行程');
        return;
    }

    const events = globalEvents().filter(e => selectedEvents.has(e.id));

    if (window.exportEventsToICal) {
        // Use calendar-export module if available
        const icalContent = generateBatchICal(events);
        downloadICal(icalContent, 'selected_events.ics');
        showAlert(`📥 已匯出 ${events.length} 項行程`);
    } else {
        showAlert('匯出功能尚未載入');
    }
}

// Generate iCal for selected events
function generateBatchICal(events) {
    const header = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SMES//行政業務協調系統//ZH
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:選取的行程
X-WR-TIMEZONE:Asia/Taipei`;

    const footer = `END:VCALENDAR`;

    const eventStrings = events.map(e => {
        const [year, month, day] = e.date.split('-');
        const [hour, minute] = (e.time || '09:00').split(':');
        const startDate = `${year}${month}${day}T${hour}${minute}00`;
        const endHour = String(parseInt(hour) + 1).padStart(2, '0');
        const endDate = `${year}${month}${day}T${endHour}${minute}00`;
        const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

        return `BEGIN:VEVENT
UID:${e.id}@smes-calendar
DTSTAMP:${now}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${e.title}
DESCRIPTION:發起人：${e.authorName}
END:VEVENT`;
    }).join('\n');

    return `${header}\n${eventStrings}\n${footer}`;
}

// Download iCal file
function downloadICal(content, filename) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Export to window
window.enterBatchMode = enterBatchMode;
window.exitBatchMode = exitBatchMode;
window.batchMarkComplete = batchMarkComplete;
window.batchDelete = batchDelete;
window.batchExport = batchExport;
