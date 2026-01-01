// UI Rendering Module - Traditional Chinese
import { globalUsers, globalEvents, getAppCurrentUser, getCurrentSelectedTargets } from './firestore.js';

export function initAppUI() {
    document.getElementById('auth-container').classList.add('hidden-section');
    document.getElementById('main-app').classList.remove('hidden-section');
    updateSidebar();

    const now = new Date();
    document.getElementById('current-date').innerText =
        now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();

    switchTab('dashboard');
}

export function updateSidebar() {
    const currentUser = getAppCurrentUser();
    if (currentUser) {
        document.getElementById('sidebar-name').innerText = currentUser.name;
        document.getElementById('sidebar-job').innerText = currentUser.jobTitle;
        document.getElementById('sidebar-avatar').innerText = currentUser.name.charAt(0);
    }
}

export function renderEditorOptions() {
    const listContainer = document.getElementById('target-selection-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const users = globalUsers();
    const selectedTargets = getCurrentSelectedTargets();

    users.forEach(u => {
        const isSelected = selectedTargets.includes(u.id);
        const div = document.createElement('div');
        div.className = 'p-2 cursor-pointer transition flex justify-between items-center ' +
            (isSelected ? 'bg-purple-100 text-purple-800' : 'hover:bg-gray-200');
        div.style.fontFamily = "'VT323', monospace";
        div.style.fontSize = "18px";
        div.onclick = () => window.toggleTarget(u.id);
        div.innerHTML = '<span>' + u.name + ' (' + u.jobTitle + ')</span> ' + (isSelected ? 'V' : 'O');
        listContainer.appendChild(div);
    });

    renderSelectedChips();
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

        const chip = document.createElement('div');
        chip.className = "bg-purple-100 text-purple-800 px-3 py-1 text-sm flex items-center gap-2 border-2 border-purple-300 cursor-pointer hover:bg-red-100 hover:text-red-800";
        chip.style.fontFamily = "'VT323', monospace";
        chip.onclick = () => window.toggleTarget(uid);
        chip.innerHTML = user.name + ' X';
        chipContainer.appendChild(chip);
    });
}

export function renderDashboard() {
    const listAnnounce = document.getElementById('announcement-list');
    const listImportant = document.getElementById('important-events-list');
    const events = globalEvents();

    listAnnounce.innerHTML = '';
    listImportant.innerHTML = '';

    const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (sortedEvents.length === 0) {
        listAnnounce.innerHTML = '<p class="text-gray-400 text-center py-4">暫無資料</p>';
    }

    sortedEvents.forEach(evt => {
        const div = document.createElement('div');
        div.className = "p-3 border-l-4 border-purple-500 bg-purple-50 hover:bg-purple-100 transition";
        div.style.fontFamily = "'VT323', monospace";
        div.innerHTML = '<div class="flex justify-between"><h4 class="font-bold text-lg">' + evt.title +
            '</h4><span class="text-sm bg-purple-200 px-2 py-1">' + evt.date +
            '</span></div><p class="text-sm text-gray-600 mt-1">發起人：' + evt.authorName + ' | 時間：' + evt.time + '</p>';
        listAnnounce.appendChild(div);
    });

    const publicEvents = sortedEvents.filter(e => e.isPublic);
    if (publicEvents.length === 0) {
        listImportant.innerHTML = '<p class="text-gray-400 text-center">無重要行事</p>';
    }

    publicEvents.forEach(evt => {
        const div = document.createElement('div');
        div.className = "flex items-center gap-3 p-2 border-b";
        div.style.fontFamily = "'VT323', monospace";
        div.innerHTML = '<div class="bg-yellow-100 text-yellow-700 font-bold px-2 py-1 text-center min-w-[60px]">' +
            evt.date.split('-')[1] + '/' + evt.date.split('-')[2] + '</div><div class="text-lg">' + evt.title + '</div>';
        listImportant.appendChild(div);
    });
}

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

export function switchTab(tabName) {
    const currentUser = getAppCurrentUser();

    ['dashboard', 'account', 'notifications', 'editor'].forEach(v => {
        document.getElementById('view-' + v).classList.add('hidden-section');
    });
    document.getElementById('view-' + tabName).classList.remove('hidden-section');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const indexMap = { 'dashboard': 0, 'account': 1, 'notifications': 2, 'editor': 3 };
    const btns = document.querySelectorAll('aside .nav-btn');
    if (btns[indexMap[tabName]]) btns[indexMap[tabName]].classList.add('active');

    const titles = {
        'dashboard': '主頁面',
        'account': '帳號設定',
        'notifications': '待辦與通知',
        'editor': '新增行程'
    };
    document.getElementById('page-title').innerText = titles[tabName];

    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'account' && currentUser) {
        document.getElementById('edit-jobTitle').value = currentUser.jobTitle;
        document.getElementById('edit-name').value = currentUser.name;
        document.getElementById('edit-username').value = currentUser.username;
    }
    if (tabName === 'editor') renderEditorOptions();
    if (tabName === 'notifications') renderNotifications();
}

// Make available globally
window.initAppUI = initAppUI;
window.updateSidebar = updateSidebar;
window.renderDashboard = renderDashboard;
window.renderNotifications = renderNotifications;
window.renderEditorOptions = renderEditorOptions;
window.updateNotificationBadge = updateNotificationBadge;
window.switchTab = switchTab;
