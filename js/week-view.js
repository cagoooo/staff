// Week View Module - Weekly Calendar View for Events
import { globalEvents, getAppCurrentUser } from './firestore.js';
import { renderTagBadges } from './tags.js';

// Week view state
let currentWeekStart = getMonday(new Date());

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Initialize week view
export function initWeekView() {
    console.log('[WeekView] Initializing...');
    // Add week view toggle to calendar
    addWeekViewToggle();
    console.log('[WeekView] Module initialized');
}

// Add toggle buttons to calendar header
function addWeekViewToggle() {
    setTimeout(() => {
        const calendarNav = document.getElementById('calendar-nav-container');
        if (!calendarNav || document.getElementById('view-mode-btns')) return;

        const toggleContainer = document.createElement('div');
        toggleContainer.id = 'view-mode-btns';
        toggleContainer.className = 'flex gap-1';
        toggleContainer.innerHTML = `
            <button id="btn-month-view" onclick="switchCalendarView('month')" 
                class="pixel-btn" style="padding: 6px 12px; font-size: 14px; background: #2d3436;">
                📅 月
            </button>
            <button id="btn-week-view" onclick="switchCalendarView('week')" 
                class="pixel-btn" style="padding: 6px 12px; font-size: 14px; background: #636e72;">
                📆 週
            </button>
        `;

        // Insert after h2
        const h2 = calendarNav.querySelector('h2');
        if (h2) {
            h2.after(toggleContainer);
        }
    }, 500);
}

// Switch between month and week view
window.switchCalendarView = function (mode) {
    const monthBtn = document.getElementById('btn-month-view');
    const weekBtn = document.getElementById('btn-week-view');
    const calendarGrid = document.querySelector('.calendar-grid');
    const calendarDays = document.getElementById('calendar-days');
    const weekViewContainer = document.getElementById('week-view-container');

    if (mode === 'month') {
        // Show month view
        if (monthBtn) monthBtn.style.background = '#2d3436';
        if (weekBtn) weekBtn.style.background = '#636e72';
        if (calendarGrid) calendarGrid.style.display = 'grid';
        if (calendarDays) calendarDays.style.display = 'grid';
        if (weekViewContainer) weekViewContainer.style.display = 'none';

        window._calendarViewMode = 'month';
    } else {
        // Show week view
        if (monthBtn) monthBtn.style.background = '#636e72';
        if (weekBtn) weekBtn.style.background = '#2d3436';
        if (calendarGrid) calendarGrid.style.display = 'none';
        if (calendarDays) calendarDays.style.display = 'none';

        // Create or show week view
        if (!weekViewContainer) {
            createWeekViewContainer();
        } else {
            weekViewContainer.style.display = 'block';
        }

        window._calendarViewMode = 'week';
        renderWeekView();
    }
};

// Create week view container
function createWeekViewContainer() {
    const calendarCard = document.querySelector('#view-calendar .content-card');
    if (!calendarCard) return;

    const container = document.createElement('div');
    container.id = 'week-view-container';
    container.innerHTML = `
        <style>
            .week-view-grid {
                display: grid;
                grid-template-columns: 60px repeat(7, 1fr);
                gap: 1px;
                background: #dfe6e9;
                border: 2px solid #2d3436;
            }
            .week-header-cell {
                background: #2d3436;
                color: white;
                padding: 10px 5px;
                text-align: center;
                font-family: 'VT323', monospace;
                font-size: 14px;
            }
            .week-header-cell.today {
                background: #6c5ce7;
            }
            .week-time-cell {
                background: #f8f9fa;
                padding: 5px;
                font-size: 12px;
                color: #636e72;
                text-align: center;
                font-family: 'VT323', monospace;
                border-right: 2px solid #dfe6e9;
                height: 60px;
            }
            .week-day-cell {
                background: white;
                min-height: 60px;
                padding: 2px;
                position: relative;
                vertical-align: top;
            }
            .week-day-cell:hover {
                background: #f8f9fa;
            }
            .week-event-item {
                background: #667eea;
                color: white;
                padding: 3px 5px;
                border-radius: 4px;
                font-size: 11px;
                margin-bottom: 2px;
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .week-event-item.important {
                background: #e17055;
            }
            .week-event-item.completed {
                opacity: 0.6;
                text-decoration: line-through;
            }
            .week-nav {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            .week-nav-label {
                font-family: 'VT323', monospace;
                font-size: 20px;
                min-width: 180px;
                text-align: center;
            }
            .week-all-day-row {
                background: #f0f0f0;
                min-height: 40px;
                padding: 3px;
            }
            
            /* ========== MOBILE RWD STYLES ========== */
            @media (max-width: 768px) {
                .week-nav {
                    gap: 6px;
                }
                .week-nav .pixel-btn {
                    padding: 6px 8px !important;
                    font-size: 12px !important;
                }
                .week-nav-label {
                    font-size: 16px;
                    min-width: 140px;
                    order: -1;
                    width: 100%;
                }
                
                /* Mobile: Vertical card layout instead of grid */
                .week-view-grid {
                    display: none !important;
                }
                .week-mobile-view {
                    display: block !important;
                }
            }
            
            @media (min-width: 769px) {
                .week-mobile-view {
                    display: none !important;
                }
            }
            
            /* Mobile card styles */
            .week-mobile-view {
                display: none;
            }
            .week-mobile-day {
                background: white;
                border-radius: 8px;
                margin-bottom: 12px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .week-mobile-day.today {
                border: 3px solid #6c5ce7;
            }
            .week-mobile-day-header {
                background: #2d3436;
                color: white;
                padding: 12px 16px;
                font-family: 'VT323', monospace;
                font-size: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .week-mobile-day.today .week-mobile-day-header {
                background: #6c5ce7;
            }
            .week-mobile-day-content {
                padding: 12px;
            }
            .week-mobile-event {
                background: #f8f9fa;
                border-left: 4px solid #667eea;
                padding: 10px 12px;
                margin-bottom: 8px;
                border-radius: 0 6px 6px 0;
                cursor: pointer;
                transition: background 0.2s;
            }
            .week-mobile-event:hover {
                background: #e9ecef;
            }
            .week-mobile-event.important {
                border-left-color: #e17055;
                background: #fff5f5;
            }
            .week-mobile-event.completed {
                opacity: 0.6;
                border-left-color: #00b894;
            }
            .week-mobile-event-time {
                font-size: 14px;
                color: #636e72;
                font-weight: bold;
            }
            .week-mobile-event-title {
                font-family: 'VT323', monospace;
                font-size: 18px;
                margin-top: 4px;
            }
            .week-mobile-event-title.completed {
                text-decoration: line-through;
                color: #888;
            }
            .week-mobile-empty {
                text-align: center;
                padding: 20px;
                color: #aaa;
                font-family: 'VT323', monospace;
                font-size: 16px;
            }
            .week-mobile-day-badge {
                background: rgba(255,255,255,0.2);
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 14px;
            }
        </style>
        <div class="week-nav">
            <button onclick="prevWeek()" class="pixel-btn" style="padding: 6px 10px;">◀ 上週</button>
            <span class="week-nav-label" id="week-label">2026年1月 第1週</span>
            <button onclick="nextWeek()" class="pixel-btn" style="padding: 6px 10px;">下週 ▶</button>
            <button onclick="goToThisWeek()" class="pixel-btn" style="padding: 6px 10px; background: #00b894;">📅 本週</button>
        </div>
        <div id="week-grid"></div>
    `;

    // Insert after calendar-days
    const calendarDays = document.getElementById('calendar-days');
    if (calendarDays) {
        calendarDays.after(container);
    } else {
        calendarCard.appendChild(container);
    }
}

// Render week view
function renderWeekView() {
    const weekGrid = document.getElementById('week-grid');
    const weekLabel = document.getElementById('week-label');
    if (!weekGrid) return;

    // Filter out deleted events
    const events = globalEvents().filter(e => !e.deletedAt);
    const currentUser = getAppCurrentUser();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate week dates
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart);
        d.setDate(currentWeekStart.getDate() + i);
        weekDates.push(d);
    }

    // Update week label
    const weekEnd = weekDates[6];
    const weekNum = getWeekNumber(currentWeekStart);
    if (weekLabel) {
        weekLabel.textContent = `${currentWeekStart.getFullYear()}年${currentWeekStart.getMonth() + 1}月 第${weekNum}週`;
    }

    // Filter events for this week
    const weekStart = formatDate(currentWeekStart);
    const weekEndStr = formatDate(weekEnd);

    const weekEvents = events.filter(e => {
        return e.date >= weekStart && e.date <= weekEndStr;
    });

    // Group events by date and time
    const eventsByDateTime = {};
    weekEvents.forEach(e => {
        const key = e.date;
        if (!eventsByDateTime[key]) {
            eventsByDateTime[key] = { allDay: [], timed: [] };
        }
        if (e.isAllDay) {
            eventsByDateTime[key].allDay.push(e);
        } else {
            eventsByDateTime[key].timed.push(e);
        }
    });

    // Build grid HTML
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

    let html = '<div class="week-view-grid">';

    // Header row
    html += '<div class="week-header-cell"></div>';
    weekDates.forEach((date, i) => {
        const isToday = date.getTime() === today.getTime();
        html += `<div class="week-header-cell ${isToday ? 'today' : ''}">
            ${weekDays[date.getDay()]}<br>
            <span style="font-size: 18px;">${date.getDate()}</span>
        </div>`;
    });

    // All-day row
    html += '<div class="week-time-cell" style="height: auto; padding: 10px 0;">全天</div>';
    weekDates.forEach(date => {
        const dateStr = formatDate(date);
        const dayEvents = eventsByDateTime[dateStr]?.allDay || [];
        html += `<div class="week-day-cell week-all-day-row" onclick="selectDate('${dateStr}')">`;
        dayEvents.slice(0, 3).forEach(e => {
            const isImportant = e.isPublic || e.announcementType === 'important' || e.announcementType === 'urgent';
            const isCompleted = e.completedBy?.includes(currentUser?.id);
            html += `<div class="week-event-item ${isImportant ? 'important' : ''} ${isCompleted ? 'completed' : ''}" 
                onclick="event.stopPropagation(); openEventModal && openEventModal('${e.id}')" 
                title="${e.title}">
                🌅 ${e.title.substring(0, 10)}${e.title.length > 10 ? '...' : ''}
            </div>`;
        });
        if (dayEvents.length > 3) {
            html += `<div style="font-size: 10px; color: #888;">+${dayEvents.length - 3} 項</div>`;
        }
        html += '</div>';
    });

    // Time rows
    hours.forEach(hour => {
        const hourStr = String(hour).padStart(2, '0');
        html += `<div class="week-time-cell">${hourStr}:00</div>`;

        weekDates.forEach(date => {
            const dateStr = formatDate(date);
            const dayEvents = eventsByDateTime[dateStr]?.timed || [];
            const hourEvents = dayEvents.filter(e => {
                const eventHour = parseInt((e.time || '00:00').split(':')[0]);
                return eventHour === hour;
            });

            html += `<div class="week-day-cell" onclick="selectDate('${dateStr}')">`;
            hourEvents.slice(0, 2).forEach(e => {
                const isImportant = e.isPublic || e.announcementType === 'important' || e.announcementType === 'urgent';
                const isCompleted = e.completedBy?.includes(currentUser?.id);
                html += `<div class="week-event-item ${isImportant ? 'important' : ''} ${isCompleted ? 'completed' : ''}" 
                    onclick="event.stopPropagation(); openEventModal && openEventModal('${e.id}')" 
                    title="${e.time} - ${e.title}">
                    ${e.time} ${e.title.substring(0, 8)}${e.title.length > 8 ? '...' : ''}
                </div>`;
            });
            if (hourEvents.length > 2) {
                html += `<div style="font-size: 10px; color: #888;">+${hourEvents.length - 2}</div>`;
            }
            html += '</div>';
        });
    });

    html += '</div>';

    // ========== Mobile View HTML ==========
    let mobileHtml = '<div class="week-mobile-view">';
    const weekDayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

    weekDates.forEach(date => {
        const dateStr = formatDate(date);
        const isToday = date.getTime() === today.getTime();
        const dayAllEvents = eventsByDateTime[dateStr]?.allDay || [];
        const dayTimedEvents = eventsByDateTime[dateStr]?.timed || [];
        const allDayEvents = [...dayAllEvents, ...dayTimedEvents].sort((a, b) =>
            (a.time || '00:00').localeCompare(b.time || '00:00')
        );

        mobileHtml += `
            <div class="week-mobile-day ${isToday ? 'today' : ''}">
                <div class="week-mobile-day-header">
                    <span>${weekDayNames[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}</span>
                    ${isToday ? '<span class="week-mobile-day-badge">今天</span>' : ''}
                    ${allDayEvents.length > 0 ? `<span class="week-mobile-day-badge">${allDayEvents.length} 項</span>` : ''}
                </div>
                <div class="week-mobile-day-content">
        `;

        if (allDayEvents.length === 0) {
            mobileHtml += '<div class="week-mobile-empty">📭 無行程</div>';
        } else {
            allDayEvents.forEach(e => {
                const isImportant = e.isPublic || e.announcementType === 'important' || e.announcementType === 'urgent';
                const isCompleted = e.completedBy?.includes(currentUser?.id);
                const timeDisplay = e.isAllDay ? '🌅 全天' : `🕐 ${e.time}`;

                mobileHtml += `
                    <div class="week-mobile-event ${isImportant ? 'important' : ''} ${isCompleted ? 'completed' : ''}"
                         onclick="openEventModal && openEventModal('${e.id}')">
                        <div class="week-mobile-event-time">${timeDisplay}</div>
                        <div class="week-mobile-event-title ${isCompleted ? 'completed' : ''}">${e.title}</div>
                    </div>
                `;
            });
        }

        mobileHtml += '</div></div>';
    });

    mobileHtml += '</div>';

    weekGrid.innerHTML = html + mobileHtml;
}

// Navigate weeks
window.prevWeek = function () {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderWeekView();
};

window.nextWeek = function () {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderWeekView();
};

window.goToThisWeek = function () {
    currentWeekStart = getMonday(new Date());
    renderWeekView();
};

// Helper: Format date as YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper: Get week number
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Export functions
export { renderWeekView };
window.renderWeekView = renderWeekView;
