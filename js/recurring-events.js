// Recurring Events Module
import { addNewEvent, getAppCurrentUser } from './firestore.js';
import { showAlert, showConfirm } from '../components/modal.js';

// Recurrence patterns
const RECURRENCE = {
    NONE: 'none',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    BIWEEKLY: 'biweekly',
    MONTHLY: 'monthly'
};

// Initialize recurring events UI
export function initRecurringEvents() {
    console.log('[Recurring] Initializing...');

    // Wait for editor view to be available
    setTimeout(() => {
        injectRecurrenceUI();
    }, 1500);

    console.log('[Recurring] Module initialized');
}

// Inject recurrence options to event creation form
function injectRecurrenceUI() {
    const editorView = document.getElementById('view-editor');
    if (!editorView || document.getElementById('recurrence-section')) return;

    // Find the form in editor view
    const form = editorView.querySelector('form') || editorView.querySelector('.content-card');
    if (!form) return;

    // Find submit button to insert before it
    const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('.pixel-btn');
    if (!submitBtn) return;

    // Create recurrence section
    const section = document.createElement('div');
    section.id = 'recurrence-section';
    section.className = 'mb-4';
    section.innerHTML = `
        <label class="pixel-label">🔁 重複設定</label>
        <select id="event-recurrence" class="pixel-input">
            <option value="none">不重複</option>
            <option value="daily">每日</option>
            <option value="weekly">每週</option>
            <option value="biweekly">每兩週</option>
            <option value="monthly">每月</option>
        </select>
        <div id="recurrence-options" class="hidden-section mt-3">
            <label class="pixel-label">重複次數</label>
            <input type="number" id="recurrence-count" class="pixel-input" value="4" min="2" max="52" 
                style="width: 100px;">
            <span style="font-family: 'VT323', monospace; font-size: 18px; margin-left: 8px;">次</span>
        </div>
    `;

    submitBtn.parentNode.insertBefore(section, submitBtn);

    // Toggle recurrence options visibility
    document.getElementById('event-recurrence').onchange = (e) => {
        const options = document.getElementById('recurrence-options');
        if (e.target.value === 'none') {
            options.classList.add('hidden-section');
        } else {
            options.classList.remove('hidden-section');
        }
    };

    // Intercept form submission
    patchEventSubmission();
}

// Patch event submission to handle recurrence
function patchEventSubmission() {
    // Store original function
    const originalAddEvent = window.addNewEvent;

    // Override with recurrence handling
    window.addNewEventWithRecurrence = async function (eventData) {
        const recurrence = document.getElementById('event-recurrence')?.value || 'none';
        const count = parseInt(document.getElementById('recurrence-count')?.value || '1');

        if (recurrence === 'none' || count <= 1) {
            // Normal single event
            return originalAddEvent ? originalAddEvent(eventData) : addNewEvent(eventData);
        }

        // Create recurring events
        const events = generateRecurringDates(eventData, recurrence, count);

        showConfirm(`將建立 ${events.length} 個重複行程，確定要繼續嗎？`, async () => {
            let successCount = 0;

            for (const evt of events) {
                try {
                    await addNewEvent(evt);
                    successCount++;
                } catch (err) {
                    console.error('[Recurring] Create failed:', err);
                }
            }

            showAlert(`✅ 已建立 ${successCount} 個重複行程`);

            // Reset form
            document.getElementById('event-recurrence').value = 'none';
            document.getElementById('recurrence-options').classList.add('hidden-section');
        });

        return true;
    };
}

// Generate recurring event dates
function generateRecurringDates(baseEvent, pattern, count) {
    const events = [];
    const baseDate = new Date(baseEvent.date);

    for (let i = 0; i < count; i++) {
        const newDate = new Date(baseDate);

        switch (pattern) {
            case RECURRENCE.DAILY:
                newDate.setDate(baseDate.getDate() + i);
                break;
            case RECURRENCE.WEEKLY:
                newDate.setDate(baseDate.getDate() + (i * 7));
                break;
            case RECURRENCE.BIWEEKLY:
                newDate.setDate(baseDate.getDate() + (i * 14));
                break;
            case RECURRENCE.MONTHLY:
                newDate.setMonth(baseDate.getMonth() + i);
                break;
        }

        const dateStr = newDate.toISOString().slice(0, 10);

        events.push({
            ...baseEvent,
            date: dateStr,
            title: count > 1 ? `${baseEvent.title}` : baseEvent.title,
            recurrenceGroup: `${baseEvent.title}_${baseDate.getTime()}`,
            recurrenceIndex: i + 1,
            recurrenceTotal: count
        });
    }

    return events;
}

// Get recurrence pattern label
export function getRecurrenceLabel(pattern) {
    const labels = {
        [RECURRENCE.NONE]: '不重複',
        [RECURRENCE.DAILY]: '每日',
        [RECURRENCE.WEEKLY]: '每週',
        [RECURRENCE.BIWEEKLY]: '每兩週',
        [RECURRENCE.MONTHLY]: '每月'
    };
    return labels[pattern] || pattern;
}

// Export to window
window.RECURRENCE = RECURRENCE;
window.getRecurrenceLabel = getRecurrenceLabel;
