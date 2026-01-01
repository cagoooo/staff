// Firestore Database Operations Module - Traditional Chinese
import { collection, addDoc, onSnapshot, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-config.js';
import { showAlert } from '../components/modal.js';

let _globalUsers = [];
let _globalEvents = [];
let _appCurrentUser = JSON.parse(sessionStorage.getItem('app_current_user')) || null;
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
        sessionStorage.setItem('app_current_user', JSON.stringify(user));
    } else {
        sessionStorage.removeItem('app_current_user');
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
    if (!_firestoreUser || !db) return;

    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_users');
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events');

    onSnapshot(usersRef, (snapshot) => {
        _globalUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (_appCurrentUser) {
            const me = _globalUsers.find(u => u.username === _appCurrentUser.username);
            if (me) {
                _appCurrentUser = { ..._appCurrentUser, ...me };
                sessionStorage.setItem('app_current_user', JSON.stringify(_appCurrentUser));
                if (window.updateSidebar) window.updateSidebar();
            }

            const editorView = document.getElementById('view-editor');
            if (editorView && !editorView.classList.contains('hidden-section')) {
                if (window.renderEditorOptions) window.renderEditorOptions();
            }
        }
        _checkLoadingComplete();
    }, () => _checkLoadingComplete());

    onSnapshot(eventsRef, (snapshot) => {
        _globalEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (_appCurrentUser) {
            if (window.renderDashboard) window.renderDashboard();
            if (window.renderNotifications) window.renderNotifications();
            if (window.updateNotificationBadge) window.updateNotificationBadge();
        }
        _checkLoadingComplete();
    }, () => _checkLoadingComplete());
}

export async function handleFirebaseAddEvent(e) {
    e.preventDefault();
    if (!_appCurrentUser || !db) return;

    const title = document.getElementById('evt-title').value;
    const date = document.getElementById('evt-date').value;
    const time = document.getElementById('evt-time').value;
    const isPublic = document.getElementById('evt-is-public').checked;
    const targets = [..._currentSelectedTargets];
    const btn = document.getElementById('btn-add-event');

    btn.disabled = true;
    btn.innerText = "傳送中...";

    try {
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

        showAlert('行程已新增！');
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
    if (!_appCurrentUser || !db) return;

    const newJob = document.getElementById('edit-jobTitle').value;
    const newName = document.getElementById('edit-name').value;
    const newPass = document.getElementById('edit-password').value;

    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_users', _appCurrentUser.id);
        const updateData = { jobTitle: newJob, name: newName };
        if (newPass) updateData.password = newPass;
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
