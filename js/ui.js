// UI Rendering Module - With Department & Calendar
import { globalUsers, globalEvents, getAppCurrentUser, getCurrentSelectedTargets } from './firestore.js';
import { DEPARTMENTS, getDepartmentList, getDepartmentName, getDepartmentColor, renderDepartmentOptions, renderPositionOptions } from './departments.js';
import { renderTagBadges, eventMatchesTagFilter, renderTagFilters } from './tags.js';

// Calendar state
let currentCalendarDate = new Date();
let selectedCalendarDate = null;
let calendarDeptFilter = 'all';
let editorDeptFilter = 'all';

export function initAppUI() {
    document.getElementById('auth-container').classList.add('hidden-section');
    document.getElementById('main-app').classList.remove('hidden-section');
    updateSidebar();

    const now = new Date();
    document.getElementById('current-date').innerText =
        now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();

    // Initialize calendar
    currentCalendarDate = new Date();

    // Initialize department dropdowns
    initDepartmentDropdowns();

    switchTab('dashboard');
}

export function initDepartmentDropdowns() {
    // Registration form
    const regDept = document.getElementById('reg-department');
    if (regDept) {
        regDept.innerHTML = renderDepartmentOptions();
    }

    // Edit form
    const editDept = document.getElementById('edit-department');
    if (editDept) {
        const currentUser = getAppCurrentUser();
        editDept.innerHTML = renderDepartmentOptions(currentUser?.department || '');
        if (currentUser?.department) {
            updateEditPositionOptions();
        }
    }
}

export function updateSidebar() {
    const currentUser = getAppCurrentUser();
    if (currentUser) {
        document.getElementById('sidebar-name').innerText = currentUser.name;
        document.getElementById('sidebar-job').innerText = currentUser.jobTitle;
        document.getElementById('sidebar-avatar').innerText = currentUser.name.charAt(0);

        // Show department
        const deptEl = document.getElementById('sidebar-dept');
        if (deptEl && currentUser.department) {
            const deptName = getDepartmentName(currentUser.department);
            const deptColor = getDepartmentColor(currentUser.department);
            deptEl.innerText = deptName;
            deptEl.style.color = deptColor;
        }
    }
}

// ============================================
// Calendar Functions
// ============================================

export function renderCalendar() {
    const monthYear = document.getElementById('calendar-month-year');
    const daysContainer = document.getElementById('calendar-days');
    if (!monthYear || !daysContainer) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    monthYear.innerText = `${year}年${month + 1}月`;

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Get events for this month
    const events = globalEvents();
    const monthEvents = events.filter(e => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month;
    });

    // Build calendar grid
    let html = '';
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty" style="background: #f5f5f5; min-height: 60px;"></div>';
    }

    // Days
    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = monthEvents.filter(e => e.date === dateStr);

        // Filter by department if needed
        let filteredEvents = dayEvents;
        if (calendarDeptFilter !== 'all') {
            const users = globalUsers();
            filteredEvents = dayEvents.filter(e => {
                const author = users.find(u => u.id === e.authorId);
                return author?.department === calendarDeptFilter;
            });
        }

        const isToday = dateStr === todayStr;
        const isSelected = selectedCalendarDate === dateStr;
        const hasEvents = filteredEvents.length > 0;

        let cellClass = 'calendar-day';
        let cellStyle = 'background: white; min-height: 60px; padding: 4px; cursor: pointer; position: relative;';

        if (isToday) cellStyle += 'border: 3px solid #6c5ce7;';
        if (isSelected) cellStyle += 'background: #dfe6e9;';

        html += `<div class="${cellClass}" style="${cellStyle}" onclick="selectCalendarDate('${dateStr}')">`;
        html += `<div style="font-family: 'VT323', monospace; font-size: 18px; ${isToday ? 'color: #6c5ce7; font-weight: bold;' : ''}">${day}</div>`;

        // Event dots
        if (hasEvents) {
            html += '<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px;">';
            filteredEvents.slice(0, 3).forEach(evt => {
                const users = globalUsers();
                const author = users.find(u => u.id === evt.authorId);
                const color = getDepartmentColor(author?.department);
                html += `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};" title="${evt.title}"></div>`;
            });
            if (filteredEvents.length > 3) {
                html += `<span style="font-size: 10px;">+${filteredEvents.length - 3}</span>`;
            }
            html += '</div>';
        }
        html += '</div>';
    }

    daysContainer.innerHTML = html;
}

export function selectCalendarDate(dateStr) {
    selectedCalendarDate = dateStr;
    renderCalendar();
    renderDayEvents(dateStr);
}

export function renderDayEvents(dateStr) {
    const titleEl = document.getElementById('selected-day-title');
    const listEl = document.getElementById('day-events-list');
    if (!titleEl || !listEl) return;

    const [year, month, day] = dateStr.split('-');
    titleEl.innerText = `📋 ${month}月${parseInt(day)}日 行程`;

    const events = globalEvents();
    let dayEvents = events.filter(e => e.date === dateStr);

    // Apply department filter
    if (calendarDeptFilter !== 'all') {
        const users = globalUsers();
        dayEvents = dayEvents.filter(e => {
            const author = users.find(u => u.id === e.authorId);
            return author?.department === calendarDeptFilter;
        });
    }

    if (dayEvents.length === 0) {
        listEl.innerHTML = '<p class="text-gray-400 text-center py-4">當日無行程</p>';
        return;
    }

    listEl.innerHTML = '';
    dayEvents.sort((a, b) => a.time.localeCompare(b.time));

    dayEvents.forEach(evt => {
        const users = globalUsers();
        const author = users.find(u => u.id === evt.authorId);
        const deptColor = getDepartmentColor(author?.department);
        const deptName = getDepartmentName(author?.department);

        const div = document.createElement('div');
        div.className = 'p-3 border-l-4 bg-white mb-2';
        div.style.borderColor = deptColor;
        div.style.fontFamily = "'VT323', monospace";
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-lg">${evt.title}</h4>
                    <p class="text-sm text-gray-600">🕐 ${evt.time} | 👤 ${evt.authorName}</p>
                    <span style="font-size: 14px; color: ${deptColor};">${deptName}</span>
                </div>
                ${evt.isPublic ? '<span class="text-yellow-500">⭐</span>' : ''}
            </div>
        `;
        listEl.appendChild(div);
    });
}

export function prevMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

export function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

export function filterByDept(deptId) {
    calendarDeptFilter = deptId;

    // Update button states
    document.querySelectorAll('#dept-filter .dept-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.fontWeight = 'normal';
    });
    document.querySelector(`#dept-filter [data-dept="${deptId}"]`)?.classList.add('active');
    document.querySelector(`#dept-filter [data-dept="${deptId}"]`).style.fontWeight = 'bold';

    renderCalendar();
    if (selectedCalendarDate) {
        renderDayEvents(selectedCalendarDate);
    }
}

// ============================================
// Editor Functions with Department Filter
// ============================================

export function renderEditorOptions() {
    const listContainer = document.getElementById('target-selection-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const users = globalUsers();
    const selectedTargets = getCurrentSelectedTargets();

    // Filter users by department
    let filteredUsers = users;
    if (editorDeptFilter !== 'all') {
        filteredUsers = users.filter(u => u.department === editorDeptFilter);
    }

    if (filteredUsers.length === 0) {
        listContainer.innerHTML = '<div class="text-gray-400 text-sm p-2">此處室無人員</div>';
        return;
    }

    filteredUsers.forEach(u => {
        const isSelected = selectedTargets.includes(u.id);
        const deptColor = getDepartmentColor(u.department);
        const div = document.createElement('div');
        div.className = 'p-2 cursor-pointer transition flex justify-between items-center ' +
            (isSelected ? 'bg-purple-100 text-purple-800' : 'hover:bg-gray-200');
        div.style.fontFamily = "'VT323', monospace";
        div.style.fontSize = "18px";
        div.style.borderLeft = `4px solid ${deptColor}`;
        div.onclick = () => window.toggleTarget(u.id);
        div.innerHTML = '<span>' + u.name + ' (' + u.jobTitle + ')</span> ' + (isSelected ? '✓' : '○');
        listContainer.appendChild(div);
    });

    renderSelectedChips();
}

export function filterTargetsByDept(deptId) {
    editorDeptFilter = deptId;

    // Update button states
    document.querySelectorAll('#target-dept-filter .target-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'white';
    });
    const activeBtn = document.querySelector(`#target-dept-filter .target-filter-btn[onclick*="${deptId}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = '#e0e0e0';
    }

    renderEditorOptions();
}

// Enhance the add event form with new fields
function enhanceEditorForm() {
    const form = document.querySelector('#view-editor form');
    if (!form || form.dataset.enhanced) return;

    // Mark as enhanced to prevent duplicate injection
    form.dataset.enhanced = 'true';

    // Find the date/time grid and insert after it
    const dateTimeGrid = form.querySelector('.grid.grid-cols-2');
    if (!dateTimeGrid) return;

    // Create announcement type field
    const typeDiv = document.createElement('div');
    typeDiv.className = 'mb-4';
    typeDiv.innerHTML = `
        <label class="pixel-label">公告類型</label>
        <select id="evt-type" class="pixel-input">
            <option value="normal">📋 一般</option>
            <option value="important">⚡ 重要</option>
            <option value="urgent">🚨 緊急</option>
        </select>
    `;
    dateTimeGrid.insertAdjacentElement('afterend', typeDiv);

    // Create tags field
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'mb-4';
    tagsDiv.innerHTML = `
        <label class="pixel-label">🏷️ 標籤</label>
        <div id="add-event-tags-container" style="position: relative;"></div>
    `;
    typeDiv.insertAdjacentElement('afterend', tagsDiv);

    // Initialize tags selector
    if (window.setSelectedTags) window.setSelectedTags([]);
    if (window.renderTagSelectorForAdd) {
        window.renderTagSelectorForAdd('add-event-tags-container', []);
    }

    // Find and enhance the checkboxes section - add pinned option
    const publicCheckbox = document.querySelector('#evt-is-public');
    if (publicCheckbox) {
        const checkboxParent = publicCheckbox.closest('.flex');
        if (checkboxParent) {
            // Create file attachment field before checkboxes
            const attachDiv = document.createElement('div');
            attachDiv.className = 'mb-4';
            attachDiv.innerHTML = `
                <label class="pixel-label">📎 上傳附件</label>
                <input type="file" id="evt-file" class="pixel-input" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
                <p style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72; margin-top: 4px;">
                    支援：圖片、PDF、Word、Excel、TXT（最大 10MB）
                </p>
            `;
            checkboxParent.insertAdjacentElement('beforebegin', attachDiv);

            // Create pinned checkbox
            const pinnedDiv = document.createElement('div');
            pinnedDiv.className = 'flex items-center gap-3 mb-3';
            pinnedDiv.style.fontFamily = "'VT323', monospace";
            pinnedDiv.style.fontSize = '20px';
            pinnedDiv.innerHTML = `
                <input type="checkbox" id="evt-pinned" class="w-6 h-6">
                <label for="evt-pinned">📌 置頂公告</label>
            `;
            checkboxParent.insertAdjacentElement('afterend', pinnedDiv);

            // Update spacing for public checkbox
            checkboxParent.className = 'flex items-center gap-3 mb-3';
        }
    }

    console.log('[UI] Editor form enhanced with new fields');
}

function renderSelectedChips() {
    const chipContainer = document.getElementById('selected-targets-container');
    if (!chipContainer) return;

    chipContainer.innerHTML = '';
    const selectedTargets = getCurrentSelectedTargets();
    const users = globalUsers();

    if (selectedTargets.length === 0) {
        chipContainer.innerHTML = '<span class="text-gray-400">尚未選擇人員...</span>';
        return;
    }

    selectedTargets.forEach(uid => {
        const user = users.find(u => u.id === uid);
        if (!user) return;

        const deptColor = getDepartmentColor(user.department);
        const chip = document.createElement('div');
        chip.className = "px-3 py-1 text-sm flex items-center gap-2 border-2 cursor-pointer hover:opacity-70";
        chip.style.fontFamily = "'VT323', monospace";
        chip.style.borderColor = deptColor;
        chip.style.background = deptColor + '22';
        chip.onclick = () => window.toggleTarget(uid);
        chip.innerHTML = user.name + ' ✕';
        chipContainer.appendChild(chip);
    });
}

// ============================================
// Dashboard
// ============================================

// Announcement type configurations
const ANNOUNCEMENT_TYPES = {
    normal: { label: '一般', icon: '📋', bg: 'bg-gray-50', border: '#636e72' },
    important: { label: '重要', icon: '⚡', bg: 'bg-yellow-50', border: '#f39c12' },
    urgent: { label: '緊急', icon: '🚨', bg: 'bg-red-50', border: '#e74c3c' }
};

export function renderDashboard() {
    const listAnnounce = document.getElementById('announcement-list');
    const listImportant = document.getElementById('important-events-list');
    const events = globalEvents();
    const users = globalUsers();
    const currentUser = getAppCurrentUser();

    listAnnounce.innerHTML = '';
    listImportant.innerHTML = '';

    // Sort events: pinned first, then by urgency, then by date
    const sortedEvents = [...events].sort((a, b) => {
        // Pinned events first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;

        // Then by announcement type (urgent > important > normal)
        const typeOrder = { urgent: 0, important: 1, normal: 2 };
        const aType = typeOrder[a.announcementType] ?? 2;
        const bType = typeOrder[b.announcementType] ?? 2;
        if (aType !== bType) return aType - bType;

        // Then by date
        return new Date(a.date) - new Date(b.date);
    });

    if (sortedEvents.length === 0) {
        listAnnounce.innerHTML = '<p class="text-gray-400 text-center py-4">暫無資料</p>';
    }

    sortedEvents.slice(0, 15).forEach(evt => {
        const author = users.find(u => u.id === evt.authorId);
        const deptColor = getDepartmentColor(author?.department);
        const typeConfig = ANNOUNCEMENT_TYPES[evt.announcementType] || ANNOUNCEMENT_TYPES.normal;
        const isRead = evt.readBy?.includes(currentUser?.id);
        const isPinned = evt.pinned;

        const div = document.createElement('div');
        div.className = `p-3 border-l-4 ${typeConfig.bg} hover:brightness-95 transition cursor-pointer ${!isRead ? 'font-bold' : ''}`;
        div.style.fontFamily = "'VT323', monospace";
        div.style.borderColor = evt.announcementType === 'urgent' ? typeConfig.border :
            evt.announcementType === 'important' ? typeConfig.border : deptColor;
        div.dataset.eventId = evt.id;
        div.onclick = () => {
            markAsRead(evt.id);
            window.openEventModal && window.openEventModal(evt.id);
        };

        // Build announcement HTML
        const pinnedBadge = isPinned ? '<span style="color: #e74c3c; margin-right: 4px;">📌</span>' : '';
        const typeBadge = evt.announcementType && evt.announcementType !== 'normal'
            ? `<span style="background: ${typeConfig.border}22; color: ${typeConfig.border}; padding: 2px 6px; font-size: 14px; margin-right: 4px; white-space: nowrap; flex-shrink: 0;">${typeConfig.icon} ${typeConfig.label}</span>`
            : '';
        const unreadDot = !isRead ? '<span style="color: #e74c3c; margin-right: 4px;">●</span>' : '';
        const tagsBadges = renderTagBadges(evt.tags);

        div.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <h4 class="text-lg flex items-center flex-wrap gap-1">${unreadDot}${pinnedBadge}${typeBadge}<span class="break-words">${evt.title}</span></h4>
                <span class="text-sm bg-purple-200 px-2 py-1 shrink-0 whitespace-nowrap">${evt.date}</span>
            </div>
            <p class="text-sm text-gray-600 mt-1">發起人：${evt.authorName} | 時間：${evt.time || '--:--'}</p>
            ${tagsBadges ? `<div class="mt-1">${tagsBadges}</div>` : ''}
        `;
        listAnnounce.appendChild(div);
    });

    const publicEvents = sortedEvents.filter(e => e.isPublic);
    if (publicEvents.length === 0) {
        listImportant.innerHTML = '<p class="text-gray-400 text-center">無重要行事</p>';
    }

    publicEvents.forEach(evt => {
        const author = users.find(u => u.id === evt.authorId);
        const deptColor = getDepartmentColor(author?.department);

        const div = document.createElement('div');
        div.className = "flex items-center gap-3 p-2 border-b cursor-pointer hover:bg-gray-50";
        div.style.fontFamily = "'VT323', monospace";
        div.dataset.eventId = evt.id;
        div.onclick = () => window.openEventModal && window.openEventModal(evt.id);
        div.innerHTML = '<div style="background: ' + deptColor + '22; color: ' + deptColor + '; font-weight: bold; padding: 4px 8px; text-align: center; min-width: 60px;">' +
            evt.date.split('-')[1] + '/' + evt.date.split('-')[2] + '</div><div class="text-lg">' + evt.title + '</div>';
        listImportant.appendChild(div);
    });
}

// Mark event as read
async function markAsRead(eventId) {
    if (!window.markEventAsRead) return;
    try {
        await window.markEventAsRead(eventId);
    } catch (e) {
        console.log('[UI] markAsRead failed:', e);
    }
}

// ============================================
// Notifications
// ============================================

export function renderNotifications() {
    const list = document.getElementById('notification-list');
    const currentUser = getAppCurrentUser();
    const events = globalEvents();

    list.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    const myNotifs = events.filter(evt => {
        const isMine = evt.authorId === currentUser.id;
        const isForMe = evt.targets && evt.targets.includes(currentUser.id);
        const isDone = evt.completedBy && evt.completedBy.includes(currentUser.id);
        return (isMine || isForMe) && !isDone;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (myNotifs.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 py-10">目前沒有待辦事項</div>';
        return;
    }

    myNotifs.forEach(item => {
        let statusClass = "border-l-4 border-gray-300 bg-white";
        let statusText = "";

        if (item.date < todayStr) {
            statusClass = "border-l-4 border-gray-400 bg-gray-50 opacity-70";
            statusText = "[已過期]";
        } else if (item.date === todayStr) {
            statusClass = "border-l-4 border-green-500 bg-green-50 shadow-md";
            statusText = "[今日待辦]";
        } else {
            statusClass = "border-l-4 border-blue-400 bg-white";
            statusText = "[即將到來]";
        }

        const isAuthor = item.authorId === currentUser.id;
        const roleBadge = isAuthor ? '您建立的' : '指派給您';

        const div = document.createElement('div');
        div.className = 'p-4 ' + statusClass + ' flex justify-between items-center gap-4';
        div.style.fontFamily = "'VT323', monospace";
        div.innerHTML = '<div class="flex-1"><div class="mb-1 text-sm">' + statusText + ' | ' + roleBadge +
            '</div><h3 class="text-xl font-bold">' + item.title + '</h3><p class="text-sm text-gray-600">時間：' +
            item.date + ' ' + item.time + '</p></div><button onclick="handleMarkAsDone(\'' + item.id +
            '\')" class="pixel-btn pixel-btn-success">完成</button>';
        list.appendChild(div);
    });
}

export function updateNotificationBadge() {
    const currentUser = getAppCurrentUser();
    const events = globalEvents();
    const todayStr = new Date().toISOString().split('T')[0];

    const myNotifs = events.filter(evt => {
        const isMine = evt.authorId === currentUser.id;
        const isForMe = evt.targets && evt.targets.includes(currentUser.id);
        const isDone = evt.completedBy && evt.completedBy.includes(currentUser.id);
        return (isMine || isForMe) && !isDone;
    });

    const count = myNotifs.filter(n => n.date >= todayStr).length;
    const badge = document.getElementById('notif-badge');

    if (count > 0) {
        badge.innerText = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================
// Tab Switching
// ============================================

export function switchTab(tabName) {
    const currentUser = getAppCurrentUser();

    // Hide all views including admin
    ['dashboard', 'calendar', 'account', 'notifications', 'editor', 'stats', 'admin'].forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.classList.add('hidden-section');
    });
    document.getElementById('view-' + tabName)?.classList.remove('hidden-section');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const indexMap = { 'dashboard': 0, 'calendar': 1, 'account': 2, 'notifications': 3, 'editor': 4, 'stats': 5 };
    const btns = document.querySelectorAll('aside .nav-btn');
    if (btns[indexMap[tabName]]) btns[indexMap[tabName]].classList.add('active');

    const titles = {
        'dashboard': '主頁面',
        'calendar': '共用日曆',
        'account': '帳號設定',
        'notifications': '待辦與通知',
        'editor': '新增行程',
        'stats': '📊 統計儀表板'
    };
    document.getElementById('page-title').innerText = titles[tabName];

    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'calendar') renderCalendar();
    if (tabName === 'stats' && window.renderStats) window.renderStats();
    if (tabName === 'account' && currentUser) {
        document.getElementById('edit-department').innerHTML = renderDepartmentOptions(currentUser.department || '');
        setTimeout(() => {
            updateEditPositionOptions();
            document.getElementById('edit-jobTitle').value = currentUser.jobTitle;
        }, 0);
        document.getElementById('edit-name').value = currentUser.name;
        document.getElementById('edit-username').value = currentUser.username;

        // Render LINE settings
        const lineSettingsContainer = document.getElementById('line-settings-container');
        if (lineSettingsContainer && window.renderLineSettings) {
            lineSettingsContainer.innerHTML = window.renderLineSettings(currentUser);
        }
    }
    if (tabName === 'editor') {
        renderEditorOptions();
        enhanceEditorForm();
    }
    if (tabName === 'notifications') renderNotifications();
}

// Department dropdown helpers for registration
export function updatePositionOptions() {
    const deptSelect = document.getElementById('reg-department');
    const posSelect = document.getElementById('reg-jobTitle');
    if (!deptSelect || !posSelect) return;

    posSelect.innerHTML = renderPositionOptions(deptSelect.value);
}

export function updateEditPositionOptions() {
    const deptSelect = document.getElementById('edit-department');
    const posSelect = document.getElementById('edit-jobTitle');
    if (!deptSelect || !posSelect) return;

    const currentUser = getAppCurrentUser();
    posSelect.innerHTML = renderPositionOptions(deptSelect.value, currentUser?.jobTitle || '');
}

// Make available globally
window.initAppUI = initAppUI;
window.updateSidebar = updateSidebar;
window.renderDashboard = renderDashboard;
window.renderNotifications = renderNotifications;
window.renderEditorOptions = renderEditorOptions;
window.updateNotificationBadge = updateNotificationBadge;
window.switchTab = switchTab;
window.renderCalendar = renderCalendar;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.filterByDept = filterByDept;
window.filterTargetsByDept = filterTargetsByDept;
window.selectCalendarDate = selectCalendarDate;
window.updatePositionOptions = updatePositionOptions;
window.updateEditPositionOptions = updateEditPositionOptions;
window.initDepartmentDropdowns = initDepartmentDropdowns;
