// Conflict Detection Module - 行程衝突偵測
import { globalEvents, globalUsers } from './firestore.js';

/**
 * Check for event conflicts
 * @param {string[]} targets - Target user IDs
 * @param {string} date - Start date (YYYY-MM-DD)
 * @param {string} time - Start time (HH:MM)
 * @param {string|null} endDate - End date for multi-day events
 * @param {string|null} excludeEventId - Event ID to exclude (for editing)
 * @returns {Object[]} Array of conflicts
 */
export function checkConflicts(targets, date, time, endDate = null, excludeEventId = null) {
    const events = globalEvents();
    const users = globalUsers();
    const conflicts = [];

    // Determine date range
    const startDate = new Date(date);
    const finalEndDate = endDate ? new Date(endDate) : new Date(date);

    // Get all dates in range
    const dateRange = [];
    for (let d = new Date(startDate); d <= finalEndDate; d.setDate(d.getDate() + 1)) {
        dateRange.push(d.toISOString().split('T')[0]);
    }

    // Check each target
    targets.forEach(targetId => {
        const user = users.find(u => u.id === targetId);
        const userName = user?.name || '未知用戶';

        // Find overlapping events for this user
        events.forEach(event => {
            if (excludeEventId && event.id === excludeEventId) return;
            if (!event.targets?.includes(targetId) && event.authorId !== targetId) return;

            // Get event date range
            const eventStartDate = event.date;
            const eventEndDate = event.endDate || event.date;
            const eventDates = [];
            for (let d = new Date(eventStartDate); d <= new Date(eventEndDate); d.setDate(d.getDate() + 1)) {
                eventDates.push(d.toISOString().split('T')[0]);
            }

            // Check for date overlap
            const hasDateOverlap = dateRange.some(d => eventDates.includes(d));
            if (!hasDateOverlap) return;

            // Check time conflict (same time on overlapping dates)
            if (event.time === time || !time || !event.time) {
                conflicts.push({
                    userId: targetId,
                    userName,
                    eventId: event.id,
                    eventTitle: event.title,
                    eventDate: event.date,
                    eventEndDate: event.endDate,
                    eventTime: event.time
                });
            }
        });
    });

    return conflicts;
}

/**
 * Render conflict warning UI
 * @param {Object[]} conflicts - Array of conflicts
 * @returns {HTMLElement|null} Warning element or null if no conflicts
 */
export function renderConflictWarning(conflicts) {
    if (!conflicts || conflicts.length === 0) return null;

    const warningDiv = document.createElement('div');
    warningDiv.className = 'conflict-warning';
    warningDiv.style.cssText = `
        background: #fff3cd;
        border: 2px solid #ffc107;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        font-family: 'VT323', monospace;
    `;

    const conflictList = conflicts.map(c =>
        `<li>⚠️ <strong>${c.userName}</strong> 在 ${c.eventDate}${c.eventEndDate && c.eventEndDate !== c.eventDate ? ' ~ ' + c.eventEndDate : ''} ${c.eventTime || ''} 有「${c.eventTitle}」</li>`
    ).join('');

    warningDiv.innerHTML = `
        <div style="font-size: 20px; color: #856404; margin-bottom: 8px;">⚠️ 發現時間衝突</div>
        <ul style="font-size: 16px; color: #856404; margin: 0; padding-left: 20px;">
            ${conflictList}
        </ul>
        <p style="font-size: 14px; color: #856404; margin-top: 8px; opacity: 0.8;">
            您仍可繼續建立行程，但請確認時間安排。
        </p>
    `;

    return warningDiv;
}

/**
 * Show conflict warning in a target container
 * @param {string} containerId - Container element ID
 * @param {Object[]} conflicts - Array of conflicts
 */
export function showConflictWarningInContainer(containerId, conflicts) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Remove existing warning
    const existing = container.querySelector('.conflict-warning');
    if (existing) existing.remove();

    // Add new warning if conflicts exist
    const warning = renderConflictWarning(conflicts);
    if (warning) {
        container.insertBefore(warning, container.firstChild);
    }
}

// Export to window
window.checkConflicts = checkConflicts;
window.showConflictWarningInContainer = showConflictWarningInContainer;
