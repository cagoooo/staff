// Firestore Database Operations Module - With Offline Caching
import { collection, addDoc, onSnapshot, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-config.js';
import { showAlert } from '../components/modal.js';
import { cacheUsers, cacheEvents, getCachedUsers, getCachedEvents, isOnline, registerNetworkHandlers } from './cache-manager.js';
import { getSession, saveSession } from './crypto.js';

let _globalUsers = [];
let _globalEvents = [];
let _appCurrentUser = getSession(); // Use session management
let _firestoreUser = null;
let _currentSelectedTargets = [];
let _checkLoadingComplete = () => { };

export function setFirestoreDeps(deps) {
    _checkLoadingComplete = deps.checkLoadingComplete;
}

export function globalUsers() { return _globalUsers; }
export function globalEvents() { return _globalEvents; }
export function getAppCurrentUser() { return _appCurrentUser; }
export function getCurrentSelectedTargets() { return _currentSelectedTargets; }

export function setAppCurrentUser(user) {
    _appCurrentUser = user;
    if (user) {
        saveSession(user); // Use session with expiry
    }
}

export function setCurrentSelectedTargets(targets) {
    _currentSelectedTargets = targets;
}

export function toggleTarget(uid) {
    if (_currentSelectedTargets.includes(uid)) {
        _currentSelectedTargets = _currentSelectedTargets.filter(id => id !== uid);
    } else {
        _currentSelectedTargets.push(uid);
    }
}

export function startDataListeners(user) {
    _firestoreUser = user;

    // Load cached data first for faster initial render
    if (!isOnline()) {
        console.log('[Firestore] Offline - loading from cache');
        _globalUsers = getCachedUsers();
        _globalEvents = getCachedEvents();
        _checkLoadingComplete();
        return;
    }

    if (!_firestoreUser || !db) {
        // Fallback to cache
        _globalUsers = getCachedUsers();
        _globalEvents = getCachedEvents();
        _checkLoadingComplete();
        return;
    }

    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_users');
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events');

    onSnapshot(usersRef, (snapshot) => {
        _globalUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        cacheUsers(_globalUsers); // Cache for offline

        if (_appCurrentUser) {
            const me = _globalUsers.find(u => u.username === _appCurrentUser.username);
            if (me) {
                _appCurrentUser = { ..._appCurrentUser, ...me };
                saveSession(_appCurrentUser);
                if (window.updateSidebar) window.updateSidebar();
            }

            const editorView = document.getElementById('view-editor');
            if (editorView && !editorView.classList.contains('hidden-section')) {
                if (window.renderEditorOptions) window.renderEditorOptions();
            }
        }
        _checkLoadingComplete();
    }, () => {
        // On error, load from cache
        _globalUsers = getCachedUsers();
        _checkLoadingComplete();
    });

    onSnapshot(eventsRef, (snapshot) => {
        _globalEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        cacheEvents(_globalEvents); // Cache for offline

        if (_appCurrentUser) {
            if (window.renderDashboard) window.renderDashboard();
            if (window.renderNotifications) window.renderNotifications();
            if (window.updateNotificationBadge) window.updateNotificationBadge();
        }
        _checkLoadingComplete();
    }, () => {
        // On error, load from cache
        _globalEvents = getCachedEvents();
        _checkLoadingComplete();
    });

    // Register network handlers for sync
    registerNetworkHandlers(
        () => {
            // Back online - refresh data
            console.log('[Firestore] Syncing after coming online');
            if (window.renderDashboard) window.renderDashboard();
        },
        () => {
            // Gone offline
            showAlert('您已離線，部分功能可能受限');
        }
    );
}

export async function handleFirebaseAddEvent(e) {
    e.preventDefault();

    if (!isOnline()) {
        showAlert('離線中無法新增行程，請稍後再試');
        return;
    }

    if (!_appCurrentUser || !db) return;

    const title = document.getElementById('evt-title').value;
    const date = document.getElementById('evt-date').value;
    const time = document.getElementById('evt-time').value;
    const isPublic = document.getElementById('evt-is-public').checked;
    const syncToCalendar = document.getElementById('evt-sync-calendar')?.checked || false;
    const targets = [..._currentSelectedTargets];
    const btn = document.getElementById('btn-add-event');

    btn.disabled = true;
    btn.innerText = "傳送中...";

    try {
        // Add to Firestore first
        const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events');
        await addDoc(eventsRef, {
            authorId: _appCurrentUser.id,
            authorName: _appCurrentUser.name,
            title,
            date,
            time,
            targets,
            isPublic,
            completedBy: [],
            createdAt: new Date().toISOString()
        });

        // Sync to Google Calendar if enabled and user is Google user
        if (syncToCalendar && _appCurrentUser.authType === 'google') {
            try {
                const { addToGoogleCalendar, hasCalendarAccess } = await import('./google-calendar.js');

                if (hasCalendarAccess()) {
                    await addToGoogleCalendar({
                        title,
                        date,
                        time,
                        authorName: _appCurrentUser.name
                    });
                    showAlert('行程已新增並同步至 Google 行事曆！');
                } else {
                    showAlert('行程已新增！（需重新以 Google 登入以同步行事曆）');
                }
            } catch (calErr) {
                console.error('[Calendar] Sync failed:', calErr);
                showAlert('行程已新增！（行事曆同步失敗：' + calErr.message + '）');
            }
        } else {
            showAlert('行程已新增！');
        }

        e.target.reset();
        _currentSelectedTargets = [];
        if (window.renderEditorOptions) window.renderEditorOptions();
        if (window.switchTab) window.switchTab('dashboard');
    } catch (err) {
        showAlert('失敗：' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "新增行程";
    }
}

export async function handleMarkAsDone(eventId) {
    if (!isOnline()) {
        showAlert('離線中無法操作');
        return;
    }

    window.showConfirm('標記為已完成？', async () => {
        try {
            const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
            await updateDoc(eventRef, { completedBy: arrayUnion(_appCurrentUser.id) });
        } catch (err) {
            showAlert('操作失敗');
        }
    });
}

export async function handleUpdateProfile(e) {
    e.preventDefault();

    if (!isOnline()) {
        showAlert('離線中無法更新資料');
        return;
    }

    if (!_appCurrentUser || !db) return;

    const newDept = document.getElementById('edit-department').value;
    const newJob = document.getElementById('edit-jobTitle').value;
    const newName = document.getElementById('edit-name').value;
    const newPass = document.getElementById('edit-password').value;

    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_users', _appCurrentUser.id);
        const updateData = { department: newDept, jobTitle: newJob, name: newName };

        if (newPass) {
            // Import hash function and hash new password
            const { hashPassword } = await import('./crypto.js');
            updateData.password = await hashPassword(newPass);
        }

        await updateDoc(userRef, updateData);
        showAlert('資料已更新！');
    } catch (err) {
        showAlert('更新失敗');
    }
}

window.handleFirebaseAddEvent = handleFirebaseAddEvent;
window.handleMarkAsDone = handleMarkAsDone;
window.handleUpdateProfile = handleUpdateProfile;
window.toggleTarget = (uid) => {
    toggleTarget(uid);
    if (window.renderEditorOptions) window.renderEditorOptions();
};
