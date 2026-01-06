// Firestore Database Operations Module - With Offline Caching
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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

    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
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
    const isAllDay = document.getElementById('evt-all-day')?.checked || false;
    const isPublic = document.getElementById('evt-is-public').checked;
    const lineNotifyEnabled = document.getElementById('evt-line-notify')?.checked ?? true;
    const targets = [..._currentSelectedTargets];
    const btn = document.getElementById('btn-add-event');

    // New fields - date range support
    const isMultiDay = document.getElementById('evt-multi-day')?.checked || false;
    const endDate = isMultiDay ? document.getElementById('evt-end-date')?.value : null;
    const announcementType = document.getElementById('evt-type')?.value || 'normal';
    const pinned = document.getElementById('evt-pinned')?.checked || false;
    const tags = window._selectedEventTags || [];

    // Check for conflicts before proceeding
    if (window.checkConflicts && targets.length > 0) {
        const conflicts = window.checkConflicts(targets, date, time, endDate);
        if (conflicts.length > 0) {
            // Show conflict warning
            const container = document.querySelector('#view-editor .content-card');
            if (container && window.showConflictWarningInContainer) {
                window.showConflictWarningInContainer('view-editor', conflicts);
            }
        }
    }

    btn.disabled = true;
    btn.innerText = "傳送中...";

    try {
        // 預先生成文件 ID（用於附件上傳路徑）
        const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events');
        const newDocRef = doc(eventsRef); // 自動生成新的文件 ID
        const newEventId = newDocRef.id;

        // 先處理附件上傳（如果有的話）
        let attachments = [];
        const fileInput = document.getElementById('evt-file');
        if (fileInput && fileInput.files.length > 0 && window.uploadAttachment) {
            const file = fileInput.files[0];
            try {
                btn.innerText = "上傳附件中...";
                const attachment = await window.uploadAttachment(file, newEventId);
                if (attachment) {
                    attachments = [attachment];
                    console.log('[Firestore] Attachment uploaded for new event:', newEventId);
                }
            } catch (uploadErr) {
                console.error('[Firestore] Attachment upload failed:', uploadErr);
                // 繼續建立行程，只是沒有附件
            }
        }

        btn.innerText = "建立行程中...";

        // 準備行程資料（包含附件）
        const eventData = {
            authorId: _appCurrentUser.id,
            authorName: _appCurrentUser.name,
            title,
            date,
            endDate: endDate || null, // 結束日期（跨日行程）
            isMultiDay: isMultiDay, // 是否跨日
            isAllDay: isAllDay, // 是否全天行程（不指定時間）
            time: isAllDay ? '' : time, // 全天行程不需要時間
            targets,
            isPublic,
            announcementType,
            pinned,
            tags,
            lineNotifyEnabled, // LINE 提醒開關
            completedBy: [],
            readBy: [],
            attachments, // 附件（如果有的話，已經包含在初始資料中）
            createdAt: new Date().toISOString()
        };

        // 使用 setDoc 建立行程（使用預生成的 ID，包含附件資訊）
        await setDoc(newDocRef, eventData);

        // Show success message with LINE notify status
        if (lineNotifyEnabled) {
            showAlert('行程已新增！📲 已開啟 LINE 提醒通知');
        } else {
            showAlert('行程已新增！');
        }

        e.target.reset();
        // Explicitly clear file input to prevent re-upload on next event
        const fileInputEl = document.getElementById('evt-file');
        if (fileInputEl) fileInputEl.value = '';

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

    // 取得行程資料以檢查是否為建立者
    const event = _globalEvents.find(e => e.id === eventId);
    const isAuthor = event && event.authorId === _appCurrentUser?.id;

    window.showConfirm('標記為已完成？', async () => {
        try {
            const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);

            // 如果是建立者，設定 isGloballyCompleted，所有人都會看到已完成
            if (isAuthor) {
                await updateDoc(eventRef, {
                    completedBy: arrayUnion(_appCurrentUser.id),
                    isGloballyCompleted: true
                });
            } else {
                await updateDoc(eventRef, { completedBy: arrayUnion(_appCurrentUser.id) });
            }
        } catch (err) {
            showAlert('操作失敗');
        }
    });
}

// Mark as complete without confirmation dialog (for swipe gestures)
export async function markEventCompleteNoConfirm(eventId) {
    if (!isOnline()) {
        showAlert('離線中無法操作');
        return false;
    }

    if (!_appCurrentUser || !db) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);

        // 檢查是否為建立者
        const event = _globalEvents.find(e => e.id === eventId);
        const isAuthor = event && event.authorId === _appCurrentUser?.id;

        if (isAuthor) {
            await updateDoc(eventRef, {
                completedBy: arrayUnion(_appCurrentUser.id),
                isGloballyCompleted: true
            });
        } else {
            await updateDoc(eventRef, { completedBy: arrayUnion(_appCurrentUser.id) });
        }
        return true;
    } catch (err) {
        showAlert('操作失敗');
        return false;
    }
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
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', _appCurrentUser.id);
        const updateData = { department: newDept, jobTitle: newJob, name: newName };

        if (newPass) {
            // Import hash function and hash new password
            const { hashPassword } = await import('./crypto.js');
            updateData.password = await hashPassword(newPass);
        }

        await updateDoc(userRef, updateData);
        showAlert('資料已更新！');
    } catch (err) {
        console.error('[Firestore] Update profile failed:', err);
        console.error('[Firestore] User ID:', _appCurrentUser?.id);
        showAlert('更新失敗：' + err.message);
    }
}

// Update an existing event
export async function updateEvent(eventId, data) {
    if (!isOnline()) {
        showAlert('離線中無法更新行程');
        return false;
    }

    if (!_appCurrentUser || !db) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
        await updateDoc(eventRef, {
            ...data,
            updatedAt: new Date().toISOString()
        });
        showAlert('行程已更新！');
        return true;
    } catch (err) {
        showAlert('更新失敗：' + err.message);
        return false;
    }
}

// Soft delete an event (move to trash)
export async function deleteEvent(eventId) {
    if (!isOnline()) {
        showAlert('離線中無法刪除行程');
        return false;
    }

    if (!_appCurrentUser || !db) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
        await updateDoc(eventRef, {
            deletedAt: new Date().toISOString(),
            deletedBy: _appCurrentUser.id,
            deletedByName: _appCurrentUser.name
        });
        showAlert('行程已移至回收站！');
        return true;
    } catch (err) {
        showAlert('刪除失敗：' + err.message);
        return false;
    }
}

// Restore an event from trash
export async function restoreEvent(eventId) {
    if (!isOnline()) {
        showAlert('離線中無法復原行程');
        return false;
    }

    if (!_appCurrentUser || !db) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
        await updateDoc(eventRef, {
            deletedAt: null,
            deletedBy: null,
            deletedByName: null
        });
        showAlert('行程已復原！');
        return true;
    } catch (err) {
        showAlert('復原失敗：' + err.message);
        return false;
    }
}

// Permanently delete an event
export async function permanentlyDeleteEvent(eventId) {
    if (!isOnline()) {
        showAlert('離線中無法永久刪除');
        return false;
    }

    if (!_appCurrentUser || !db) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
        await deleteDoc(eventRef);
        showAlert('行程已永久刪除！');
        return true;
    } catch (err) {
        showAlert('刪除失敗：' + err.message);
        return false;
    }
}

// Get deleted events (trash)
export function getDeletedEvents() {
    return _globalEvents.filter(e => e.deletedAt);
}

// Get active events (not deleted)
export function getActiveEvents() {
    return _globalEvents.filter(e => !e.deletedAt);
}

// Get event by ID
export function getEventById(eventId) {
    return _globalEvents.find(e => e.id === eventId);
}

// Mark event as read
export async function markEventAsRead(eventId) {
    if (!isOnline() || !_appCurrentUser || !db) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
        await updateDoc(eventRef, { readBy: arrayUnion(_appCurrentUser.id) });
        return true;
    } catch (err) {
        console.log('[Firestore] Mark as read failed:', err);
        return false;
    }
}

// Toggle pin status
export async function toggleEventPin(eventId) {
    if (!isOnline() || !_appCurrentUser || !db) return false;

    const event = _globalEvents.find(e => e.id === eventId);
    if (!event) return false;

    try {
        const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId);
        await updateDoc(eventRef, { pinned: !event.pinned });
        showAlert(event.pinned ? '已取消置頂' : '已置頂');
        return true;
    } catch (err) {
        showAlert('操作失敗');
        return false;
    }
}

// Add new event programmatically (for recurring events)
export async function addNewEvent(eventData) {
    if (!isOnline()) {
        throw new Error('離線中無法新增行程');
    }

    if (!_appCurrentUser || !db) {
        throw new Error('用戶未登入或資料庫未連線');
    }

    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events');
    const docRef = await addDoc(eventsRef, {
        authorId: _appCurrentUser.id,
        authorName: _appCurrentUser.name,
        title: eventData.title,
        date: eventData.date,
        time: eventData.time || '09:00',
        targets: eventData.targets || [],
        isPublic: eventData.isPublic || false,
        completedBy: [],
        recurrenceGroup: eventData.recurrenceGroup || null,
        recurrenceIndex: eventData.recurrenceIndex || null,
        recurrenceTotal: eventData.recurrenceTotal || null,
        createdAt: new Date().toISOString()
    });

    return docRef.id;
}

window.handleFirebaseAddEvent = handleFirebaseAddEvent;
window.handleMarkAsDone = handleMarkAsDone;
window._markEventCompleteNoConfirm = markEventCompleteNoConfirm;
window.handleUpdateProfile = handleUpdateProfile;
window.updateEvent = updateEvent;
window.deleteEvent = deleteEvent;
window.restoreEvent = restoreEvent;
window.permanentlyDeleteEvent = permanentlyDeleteEvent;
window.getDeletedEvents = getDeletedEvents;
window.getActiveEvents = getActiveEvents;
window.getEventById = getEventById;
window.markEventAsRead = markEventAsRead;
window.toggleEventPin = toggleEventPin;
window.addNewEvent = addNewEvent;
window.toggleTarget = (uid) => {
    toggleTarget(uid);
    if (window.renderEditorOptions) window.renderEditorOptions();
};
