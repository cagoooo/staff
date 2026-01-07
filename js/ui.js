// UI Rendering Module - With Department & Calendar
import { globalUsers, globalEvents, getAppCurrentUser, getCurrentSelectedTargets } from './firestore.js';
import { DEPARTMENTS, getDepartmentList, getDepartmentName, getDepartmentColor, renderDepartmentOptions, renderPositionOptions } from './departments.js';
import { renderTagBadges, eventMatchesTagFilter, renderTagFilters } from './tags.js';
import { canViewEvent, filterVisibleEvents } from './visibility.js';

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

    // Get events for this month (including multi-day events, excluding deleted)
    // Apply visibility filter for private events
    const currentUser = getAppCurrentUser();
    const events = filterVisibleEvents(
        globalEvents().filter(e => !e.deletedAt),
        currentUser
    );
    const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const monthEvents = events.filter(e => {
        const eventStart = e.date;  // YYYY-MM-DD format
        const eventEnd = e.endDate || e.date;  // YYYY-MM-DD format
        // Check if event overlaps with this month
        return eventStart <= monthEndStr && eventEnd >= monthStartStr;
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

        // Get events for this day (including multi-day events)
        // Use string comparison to avoid timezone issues
        const dayEvents = monthEvents.filter(e => {
            const eventStart = e.date;  // YYYY-MM-DD format
            const eventEnd = e.endDate || e.date;  // YYYY-MM-DD format
            return dateStr >= eventStart && dateStr <= eventEnd;
        });

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
        let cellStyle = 'background: white; min-height: 80px; padding: 4px; cursor: pointer; position: relative; overflow: hidden;';

        if (isToday) cellStyle += 'border: 3px solid #6c5ce7; background: #f8f7ff;';
        if (isSelected) cellStyle += 'background: #dfe6e9;';
        if (hasEvents) cellStyle += 'background: linear-gradient(to bottom, white 30%, #f8f9fa 100%);';

        html += `<div class="${cellClass}" style="${cellStyle}" onclick="selectCalendarDate('${dateStr}')">`;
        html += `<div style="font-family: 'VT323', monospace; font-size: 18px; ${isToday ? 'color: #6c5ce7; font-weight: bold;' : ''}">${day}</div>`;

        // Event bars (more visible than dots)
        if (hasEvents) {
            html += '<div class="calendar-events" style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px; max-height: 52px; overflow: hidden;">';

            // Sort events by time
            const sortedDayEvents = [...filteredEvents].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

            sortedDayEvents.slice(0, 3).forEach(evt => {
                const users = globalUsers();
                const author = users.find(u => u.id === evt.authorId);
                const color = getDepartmentColor(author?.department);
                const isImportant = evt.isPublic;
                const isPinned = evt.pinned;
                const isMultiDay = !!evt.endDate;

                // Truncate title for display
                const shortTitle = evt.title.length > 8 ? evt.title.substring(0, 8) + '…' : evt.title;
                const prefix = isPinned ? '📌' : (isImportant ? '⭐' : (isMultiDay ? '📆' : ''));

                // Multi-day events have a gradient background
                const bgStyle = isMultiDay
                    ? `background: linear-gradient(90deg, ${color}33 0%, ${color}11 100%);`
                    : `background: ${color}22;`;

                html += `<div class="calendar-event-bar" style="
                    ${bgStyle}
                    border-left: 3px solid ${color};
                    padding: 1px 4px;
                    font-family: 'VT323', monospace;
                    font-size: 12px;
                    color: ${color};
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    border-radius: 2px;
                    ${isMultiDay ? 'font-weight: bold;' : ''}
                " title="${evt.title} - ${evt.time || '整天'}${isMultiDay ? ' (跨日至 ' + evt.endDate + ')' : ''}">${prefix}${shortTitle}</div>`;
            });

            if (filteredEvents.length > 3) {
                html += `<div style="font-family: 'VT323', monospace; font-size: 11px; color: #636e72; text-align: center;">+${filteredEvents.length - 3} 更多</div>`;
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

    // 平滑滾動到行程列表區塊，提升 UX 體驗
    const dayEventsSection = document.getElementById('selected-day-title');
    if (dayEventsSection) {
        setTimeout(() => {
            dayEventsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }, 100);
    }
}

export function renderDayEvents(dateStr) {
    const titleEl = document.getElementById('selected-day-title');
    const listEl = document.getElementById('day-events-list');
    if (!titleEl || !listEl) return;

    const [year, month, day] = dateStr.split('-');
    titleEl.innerText = `📋 ${month}月${parseInt(day)}日 行程`;

    const events = globalEvents();
    // Include multi-day events that span this date
    let dayEvents = events.filter(e => {
        const eventStart = e.date;  // YYYY-MM-DD format
        const eventEnd = e.endDate || e.date;  // YYYY-MM-DD format
        return dateStr >= eventStart && dateStr <= eventEnd;
    });

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
    dayEvents.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

    dayEvents.forEach(evt => {
        const users = globalUsers();
        const author = users.find(u => u.id === evt.authorId);
        const deptColor = getDepartmentColor(author?.department);
        const deptName = getDepartmentName(author?.department);

        // Check if this is a multi-day event
        const isMultiDay = !!evt.endDate;
        const multiDayBadge = isMultiDay ? `<span class="ml-2 px-2 py-0.5 rounded text-white text-xs" style="background: #6c5ce7;">📆 跨日至 ${evt.endDate}</span>` : '';

        const div = document.createElement('div');
        div.className = 'p-3 border-l-4 bg-white mb-2 cursor-pointer hover:bg-gray-50';
        div.style.borderColor = deptColor;
        div.style.fontFamily = "'VT323', monospace";
        div.onclick = () => window.openEventModal(evt.id);
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-lg">${evt.title}${multiDayBadge}</h4>
                    <p class="text-sm text-gray-600">🕐 ${evt.time || '全天'} | 👤 ${evt.authorName}</p>
                    <span style="font-size: 14px; color: ${deptColor};">${deptName}</span>
                </div>
                ${evt.isPublic ? '<span class="text-yellow-500">⭐</span>' : ''}
                ${isMultiDay ? '<span class="text-purple-500 text-xl">📆</span>' : ''}
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

// Search term for target filtering
let editorSearchTerm = '';

// Tag keywords mapping for search
const TAG_KEYWORDS = {
    '導師': ['班級導師', '幼兒園導師'],
    '科任': ['科任教師'],
    '組長': ['教學組長', '註冊組長', '設備組長', '生教組長', '訓育組長', '體育組長', '衛生組長', '事務組長', '出納組長', '文書組長', '資料組長', '輔導組長'],
    '主任': ['教務主任', '學務主任', '總務主任', '輔導主任'],
    '護理': ['護理師'],
    '代理': ['代理教師'],
    '幹事': ['幹事'],
    '校長': ['校長']
};

// Check if a job title matches a tag keyword
function matchesTagKeyword(jobTitle, searchTerm) {
    if (!jobTitle || !searchTerm) return false;
    const lowerSearch = searchTerm.toLowerCase();

    for (const [keyword, titles] of Object.entries(TAG_KEYWORDS)) {
        if (keyword.includes(lowerSearch)) {
            if (titles.some(t => jobTitle.includes(t))) return true;
        }
    }
    return false;
}

export function searchTargets(term) {
    editorSearchTerm = term;
    renderEditorOptions();
}

// Dynamically create search input before target selection list
function createSearchInput() {
    if (document.getElementById('target-search')) return;

    const targetDeptFilter = document.getElementById('target-dept-filter');
    if (!targetDeptFilter) return;

    const searchContainer = document.createElement('div');
    searchContainer.className = 'mb-2';
    searchContainer.innerHTML = `
        <input type="text" id="target-search" class="pixel-input" 
               placeholder="🔍 搜尋姓名或標籤 (導師、科任、組長...)"
               style="font-size: 16px; width: 100%;">
    `;

    // Insert after department filter
    targetDeptFilter.parentNode.insertBefore(searchContainer, targetDeptFilter.nextSibling);

    // Add event listener
    document.getElementById('target-search').addEventListener('input', (e) => {
        searchTargets(e.target.value);
    });
}

export function renderEditorOptions() {
    const listContainer = document.getElementById('target-selection-list');
    if (!listContainer) return;

    // Create search input if not exists
    createSearchInput();

    listContainer.innerHTML = '';
    const users = globalUsers();
    const selectedTargets = getCurrentSelectedTargets();

    // Filter users by department
    let filteredUsers = users;
    if (editorDeptFilter !== 'all') {
        filteredUsers = users.filter(u => u.department === editorDeptFilter);
    }

    // Apply search filter
    if (editorSearchTerm && editorSearchTerm.trim()) {
        const searchLower = editorSearchTerm.toLowerCase().trim();
        filteredUsers = filteredUsers.filter(u => {
            const nameMatch = u.name?.toLowerCase().includes(searchLower);
            const titleMatch = u.jobTitle?.toLowerCase().includes(searchLower);
            const tagMatch = matchesTagKeyword(u.jobTitle, searchLower);
            return nameMatch || titleMatch || tagMatch;
        });
    }

    if (filteredUsers.length === 0) {
        listContainer.innerHTML = '<div class="text-gray-400 text-sm p-2">無符合的人員</div>';
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

// Export search function to window
window.searchTargets = searchTargets;

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
            <option value="meeting">🏛️ 會議</option>
            <option value="training">📚 研習</option>
            <option value="event">🎉 活動</option>
            <option value="reminder">⏰ 提醒</option>
            <option value="deadline">📅 截止日</option>
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

            // Create private event checkbox
            const privateDiv = document.createElement('div');
            privateDiv.className = 'flex items-center gap-3 mb-3';
            privateDiv.style.fontFamily = "'VT323', monospace";
            privateDiv.style.fontSize = '20px';
            privateDiv.innerHTML = `
                <input type="checkbox" id="evt-private" class="w-6 h-6">
                <label for="evt-private" style="color: #9b59b6;">🔒 私人行程（僅建立者及被指派者可見）</label>
            `;
            pinnedDiv.insertAdjacentElement('afterend', privateDiv);

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

// Announcement type configurations - School administration specific
const ANNOUNCEMENT_TYPES = {
    normal: { label: '一般', icon: '📋', bg: 'bg-gray-50', border: '#636e72' },
    important: { label: '重要', icon: '⚡', bg: 'bg-yellow-50', border: '#f39c12' },
    urgent: { label: '緊急', icon: '🚨', bg: 'bg-red-50', border: '#e74c3c' },
    meeting: { label: '會議', icon: '🏛️', bg: 'bg-blue-50', border: '#3498db' },
    training: { label: '研習', icon: '📚', bg: 'bg-green-50', border: '#27ae60' },
    event: { label: '活動', icon: '🎉', bg: 'bg-purple-50', border: '#9b59b6' },
    reminder: { label: '提醒', icon: '⏰', bg: 'bg-orange-50', border: '#e67e22' },
    deadline: { label: '截止日', icon: '📅', bg: 'bg-pink-50', border: '#e84393' }
};

export function renderDashboard() {
    const listAnnounce = document.getElementById('announcement-list');
    const listImportant = document.getElementById('important-events-list');
    const listCompleted = document.getElementById('completed-events-list');
    const completedBadge = document.getElementById('completed-count-badge');
    const users = globalUsers();
    const currentUser = getAppCurrentUser();
    // Filter out deleted events and apply visibility filter for private events
    const events = filterVisibleEvents(
        globalEvents().filter(e => !e.deletedAt),
        currentUser
    );

    listAnnounce.innerHTML = '';
    listImportant.innerHTML = '';
    if (listCompleted) listCompleted.innerHTML = '';

    // 分離已完成和未完成的行程
    // 行程判斷為已完成的條件：建立者已全局完成 OR 當前用戶已標記完成
    const isEventCompleted = (evt) => evt.isGloballyCompleted || evt.completedBy?.includes(currentUser?.id);

    const completedEvents = events.filter(evt => isEventCompleted(evt));
    const pendingEvents = events.filter(evt => !isEventCompleted(evt));

    // Sort events: pinned first, then by urgency, then by date
    const sortedEvents = [...pendingEvents].sort((a, b) => {
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
        const privateBadge = evt.isPrivate ? '<span style="background: #9b59b622; color: #9b59b6; padding: 2px 6px; font-size: 14px; margin-right: 4px; white-space: nowrap; flex-shrink: 0;">🔒 私人</span>' : '';
        const typeBadge = evt.announcementType && evt.announcementType !== 'normal'
            ? `<span style="background: ${typeConfig.border}22; color: ${typeConfig.border}; padding: 2px 6px; font-size: 14px; margin-right: 4px; white-space: nowrap; flex-shrink: 0;">${typeConfig.icon} ${typeConfig.label}</span>`
            : '';
        const unreadDot = !isRead ? '<span style="color: #e74c3c; margin-right: 4px;">●</span>' : '';
        const tagsBadges = renderTagBadges(evt.tags);

        // Build smart time display
        let timeDisplay = evt.time || '--:--';
        if (evt.isAllDay) {
            timeDisplay = '🌅 全天';
        }
        if (evt.isMultiDay && evt.endDate) {
            timeDisplay = `📆 ${evt.date} ~ ${evt.endDate}`;
        }

        div.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <h4 class="text-lg flex items-center flex-wrap gap-1">${unreadDot}${pinnedBadge}${privateBadge}${typeBadge}<span class="break-words">${evt.title}</span></h4>
                <span class="text-sm bg-purple-200 px-2 py-1 shrink-0 whitespace-nowrap">${evt.date}</span>
            </div>
            <p class="text-sm text-gray-600 mt-1">發起人：${evt.authorName} | ${evt.isMultiDay ? '' : '時間：'}${timeDisplay}</p>
            ${tagsBadges ? `<div class="mt-1">${tagsBadges}</div>` : ''}
        `;
        listAnnounce.appendChild(div);
    });

    // Get public events (important events) and sort by date - 只顯示未完成的
    const publicEvents = sortedEvents
        .filter(e => e.isPublic)
        .sort((a, b) => a.date.localeCompare(b.date));
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

    // 渲染已完成歸檔區塊
    if (listCompleted && completedBadge) {
        completedBadge.textContent = completedEvents.length;

        if (completedEvents.length === 0) {
            listCompleted.innerHTML = '<p class="text-gray-400 text-center py-4">目前沒有已完成的行程</p>';
        } else {
            // Sort completed events by date (newest first)
            const sortedCompleted = [...completedEvents].sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );

            sortedCompleted.forEach(evt => {
                const author = users.find(u => u.id === evt.authorId);
                const deptColor = getDepartmentColor(author?.department);

                const div = document.createElement('div');
                div.className = "p-3 border-l-4 bg-gray-50 opacity-70 hover:opacity-100 transition cursor-pointer";
                div.style.fontFamily = "'VT323', monospace";
                div.style.borderColor = '#00b894';
                div.dataset.eventId = evt.id;
                div.onclick = () => window.openEventModal && window.openEventModal(evt.id);
                div.innerHTML = `
                    <div class="flex justify-between items-start gap-2">
                        <h4 class="text-lg flex items-center gap-1">
                            <span style="color: #00b894;">✅</span>
                            <span class="line-through text-gray-500">${evt.title}</span>
                        </h4>
                        <span class="text-sm bg-green-200 px-2 py-1 shrink-0 whitespace-nowrap">${evt.date}</span>
                    </div>
                    <p class="text-sm text-gray-500 mt-1">發起人：${evt.authorName} | 完成時間：已完成</p>
                `;
                listCompleted.appendChild(div);
            });
        }
    }
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
    // Filter out deleted events and apply visibility filter for private events
    const events = filterVisibleEvents(
        globalEvents().filter(e => !e.deletedAt),
        currentUser
    );

    list.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];
    const myNotifs = events.filter(evt => {
        const isMine = evt.authorId === currentUser.id;
        const isForMe = evt.targets && evt.targets.includes(currentUser.id);
        const isDone = evt.isGloballyCompleted || (evt.completedBy && evt.completedBy.includes(currentUser.id));
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
        const privateBadge = item.isPrivate ? '🔒 ' : '';

        const div = document.createElement('div');
        div.className = 'p-4 ' + statusClass + ' flex justify-between items-center gap-4';
        div.style.fontFamily = "'VT323', monospace";
        div.innerHTML = '<div class="flex-1"><div class="mb-1 text-sm">' + statusText + ' | ' + roleBadge +
            (item.isPrivate ? ' | <span style="color: #9b59b6;">🔒 私人</span>' : '') +
            '</div><h3 class="text-xl font-bold">' + privateBadge + item.title + '</h3><p class="text-sm text-gray-600">時間：' +
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
        const isDone = evt.isGloballyCompleted || (evt.completedBy && evt.completedBy.includes(currentUser.id));
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

    // Scroll to top of page (smooth animation)
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
        contentArea.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Also scroll main window for mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Hide all views including admin and trash
    ['dashboard', 'calendar', 'account', 'notifications', 'editor', 'stats', 'admin', 'trash'].forEach(v => {
        const el = document.getElementById('view-' + v);
        if (el) el.classList.add('hidden-section');
    });
    document.getElementById('view-' + tabName)?.classList.remove('hidden-section');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const indexMap = { 'dashboard': 0, 'calendar': 1, 'account': 2, 'notifications': 3, 'editor': 4, 'stats': 5 };
    const btns = document.querySelectorAll('aside .nav-btn');
    if (btns[indexMap[tabName]]) btns[indexMap[tabName]].classList.add('active');

    // Activate trash button if on trash tab
    if (tabName === 'trash') {
        const trashBtn = document.getElementById('nav-trash');
        if (trashBtn) trashBtn.classList.add('active');
    }

    const titles = {
        'dashboard': '主頁面',
        'calendar': '共用日曆',
        'account': '帳號設定',
        'notifications': '待辦與通知',
        'editor': '新增行程',
        'stats': '📊 統計儀表板',
        'trash': '🗑️ 回收站'
    };
    document.getElementById('page-title').innerText = titles[tabName] || tabName;

    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'calendar') renderCalendar();
    if (tabName === 'stats' && window.renderStats) window.renderStats();
    if (tabName === 'trash' && window.renderTrashList) window.renderTrashList();
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
