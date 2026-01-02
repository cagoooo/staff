// Admin Panel Module - User Management
import { globalUsers, getAppCurrentUser } from './firestore.js';
import { db, appId } from './firebase-config.js';
import { doc, updateDoc, deleteDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';

// Check if current user is admin
function isAdmin() {
    const user = getAppCurrentUser();
    return user?.role === 'admin';
}

// Initialize admin panel
export function initAdmin() {
    console.log('[Admin] Initializing...');

    // Check for admin role multiple times as user data may load async
    const checkAdmin = () => {
        const currentUser = getAppCurrentUser();
        console.log('[Admin] Checking user role:', currentUser?.role, 'User:', currentUser?.email || currentUser?.username);

        if (!currentUser) {
            console.log('[Admin] No user found yet, will retry...');
            return false;
        }

        if (currentUser.role === 'admin') {
            console.log('[Admin] Admin user detected, injecting UI...');
            injectAdminUI();
            return true;
        } else {
            console.log('[Admin] User is not admin, role:', currentUser.role);
            return false;
        }
    };

    // Initial check after 2 seconds
    setTimeout(() => {
        if (!checkAdmin()) {
            // Retry after 4 more seconds in case data loaded slowly
            setTimeout(checkAdmin, 4000);
        }
    }, 2000);

    console.log('[Admin] Module initialized');
}

// Inject admin UI elements
function injectAdminUI() {
    // Inject sidebar button
    const nav = document.querySelector('#sidebar nav');
    if (nav && !document.getElementById('nav-admin')) {
        const adminBtn = document.createElement('button');
        adminBtn.id = 'nav-admin';
        adminBtn.className = 'nav-btn w-full';
        adminBtn.style.color = '#f39c12';
        adminBtn.onclick = () => window.switchTab && window.switchTab('admin');
        adminBtn.innerHTML = '<i class="fas fa-crown"></i> 管理後台';
        nav.appendChild(adminBtn);
    }

    // Inject admin view
    const contentArea = document.getElementById('content-area');
    if (contentArea && !document.getElementById('view-admin')) {
        const adminView = document.createElement('div');
        adminView.id = 'view-admin';
        adminView.className = 'hidden-section';
        adminView.innerHTML = '<div id="admin-container"></div>';
        contentArea.appendChild(adminView);
    }

    // Add admin to switchTab
    patchSwitchTab();
}

// Patch switchTab to support admin
function patchSwitchTab() {
    const originalSwitchTab = window.switchTab;
    window.switchTab = function (tabName) {
        // Handle admin tab
        if (tabName === 'admin') {
            if (!isAdmin()) {
                showAlert('您沒有管理員權限');
                return;
            }

            // Hide all views
            ['dashboard', 'calendar', 'account', 'notifications', 'editor', 'stats', 'admin'].forEach(v => {
                document.getElementById('view-' + v)?.classList.add('hidden-section');
            });
            document.getElementById('view-admin')?.classList.remove('hidden-section');
            document.getElementById('page-title').innerText = '👑 管理後台';

            // Render admin panel
            renderAdminPanel();
            return;
        }

        // Call original for other tabs
        if (originalSwitchTab) originalSwitchTab(tabName);
    };
}

// Render admin panel
export function renderAdminPanel() {
    const container = document.getElementById('admin-container');
    if (!container) return;

    const users = globalUsers();

    container.innerHTML = `
        <div class="content-card p-4 mb-4" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h2 style="font-family: 'VT323', monospace; font-size: 28px;">👥 使用者管理</h2>
                <p style="font-family: 'VT323', monospace; font-size: 18px; color: #636e72;" class="mt-2">
                    共 ${users.length} 位使用者
                </p>
            </div>
            <button onclick="showAddUserModal()" class="pixel-btn" style="background: #00b894; font-size: 18px;">
                ➕ 新增使用者
            </button>
        </div>
        
        <div class="content-card p-4">
            <div class="overflow-x-auto">
                <table style="width: 100%; border-collapse: collapse; font-family: 'VT323', monospace; font-size: 20px;">
                    <thead>
                        <tr style="background: #2d3436; color: white;">
                            <th style="padding: 12px; text-align: left;">姓名</th>
                            <th style="padding: 12px; text-align: left;">帳號</th>
                            <th style="padding: 12px; text-align: left;">處室</th>
                            <th style="padding: 12px; text-align: left;">職稱</th>
                            <th style="padding: 12px; text-align: left;">角色</th>
                            <th style="padding: 12px; text-align: center;">狀態</th>
                            <th style="padding: 12px; text-align: center;">操作</th>
                        </tr>
                    </thead>
                    <tbody id="user-list-tbody">
                        ${users.map(u => renderUserRow(u)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Render a single user row
function renderUserRow(user) {
    const deptLabels = {
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'principal': '校長室'
    };

    const isDisabled = user.disabled === true;
    const isAdminUser = user.role === 'admin';
    const currentUser = getAppCurrentUser();
    const isSelf = user.id === currentUser?.id;

    return `
        <tr style="border-bottom: 1px solid #dfe6e9; ${isDisabled ? 'opacity: 0.5; background: #ffeaa7;' : ''}">
            <td style="padding: 12px;">${user.name || '未設定'}</td>
            <td style="padding: 12px;">${user.username || user.email || '--'}</td>
            <td style="padding: 12px;">${deptLabels[user.department] || user.department || '--'}</td>
            <td style="padding: 12px;">${user.jobTitle || '--'}</td>
            <td style="padding: 12px;">
                <span style="color: ${isAdminUser ? '#f39c12' : '#636e72'};">
                    ${isAdminUser ? '👑 管理員' : '👤 一般'}
                </span>
            </td>
            <td style="padding: 12px; text-align: center;">
                ${isDisabled ? '<span style="color: #e74c3c;">⛔ 停用</span>' : '<span style="color: #00b894;">✅ 啟用</span>'}
            </td>
            <td style="padding: 12px; text-align: center;">
                ${isSelf ? '<span style="color: #636e72;">--</span>' : `
                    <button onclick="showEditUserModal('${user.id}')" 
                        class="pixel-btn" style="padding: 4px 8px; font-size: 16px; background: #6c5ce7;">
                        ✏️ 編輯
                    </button>
                    <button onclick="${isDisabled ? `enableUser('${user.id}')` : `disableUser('${user.id}')`}" 
                        class="pixel-btn" style="padding: 4px 8px; font-size: 16px; margin-left: 4px; ${isDisabled ? 'background: #00b894;' : 'background: #e17055;'}">
                        ${isDisabled ? '啟用' : '停用'}
                    </button>
                    ${!isAdminUser ? `
                        <button onclick="promoteToAdmin('${user.id}')" 
                            class="pixel-btn" style="padding: 4px 8px; font-size: 16px; background: #f39c12; margin-left: 4px;">
                            👑
                        </button>
                    ` : ''}
                    <button onclick="deleteUser('${user.id}', '${user.name || user.username || ''}')" 
                        class="pixel-btn" style="padding: 4px 8px; font-size: 16px; background: #d63031; margin-left: 4px;">
                        🗑️
                    </button>
                `}
            </td>
        </tr>
    `;
}

// Disable user
async function disableUser(userId) {
    showConfirm('確定要停用此使用者嗎？停用後該使用者將無法登入。', async () => {
        try {
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
            await updateDoc(userRef, { disabled: true });
            showAlert('已停用使用者');
            renderAdminPanel();
        } catch (err) {
            showAlert('操作失敗：' + err.message);
        }
    });
}

// Enable user
async function enableUser(userId) {
    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
        await updateDoc(userRef, { disabled: false });
        showAlert('已啟用使用者');
        renderAdminPanel();
    } catch (err) {
        showAlert('操作失敗：' + err.message);
    }
}

// Promote to admin
async function promoteToAdmin(userId) {
    showConfirm('確定要將此使用者設為管理員嗎？管理員可以管理所有使用者。', async () => {
        try {
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
            await updateDoc(userRef, { role: 'admin' });
            showAlert('已設為管理員');
            renderAdminPanel();
        } catch (err) {
            showAlert('操作失敗：' + err.message);
        }
    });
}

// Delete user
async function deleteUser(userId, userName) {
    showConfirm(`確定要刪除使用者「${userName}」嗎？此操作無法復原！`, async () => {
        try {
            // Debug: Check current auth state
            const { auth } = await import('./firebase-config.js');
            console.log('[Admin] Delete user - Target userId:', userId);
            console.log('[Admin] Delete user - Firebase Auth UID:', auth.currentUser?.uid);
            console.log('[Admin] Delete user - App current user ID:', getAppCurrentUser()?.id);

            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
            await deleteDoc(userRef);
            showAlert('已刪除使用者');
            renderAdminPanel();
        } catch (err) {
            console.error('[Admin] Delete failed:', err);
            showAlert('刪除失敗：' + err.message);
        }
    });
}

// Department options
const DEPARTMENTS = [
    { value: 'principal', label: '校長室' },
    { value: 'academic', label: '教務處' },
    { value: 'student', label: '學務處' },
    { value: 'general', label: '總務處' },
    { value: 'counseling', label: '輔導室' }
];

// Show add user modal
function showAddUserModal() {
    removeModal();

    const modal = document.createElement('div');
    modal.id = 'admin-modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';

    modal.innerHTML = `
        <div class="content-card p-6" style="width: 90%; max-width: 450px; max-height: 90vh; overflow-y: auto;">
            <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">➕ 新增使用者</h3>
            <form id="add-user-form">
                <div class="mb-3">
                    <label class="pixel-label">帳號 *</label>
                    <input type="text" id="new-username" class="pixel-input" required placeholder="登入用帳號">
                </div>
                <div class="mb-3">
                    <label class="pixel-label">密碼 *</label>
                    <input type="password" id="new-password" class="pixel-input" required placeholder="登入密碼">
                </div>
                <div class="mb-3">
                    <label class="pixel-label">姓名 *</label>
                    <input type="text" id="new-name" class="pixel-input" required placeholder="真實姓名">
                </div>
                <div class="mb-3">
                    <label class="pixel-label">處室</label>
                    <select id="new-department" class="pixel-input">
                        ${DEPARTMENTS.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="pixel-label">職稱</label>
                    <input type="text" id="new-jobtitle" class="pixel-input" placeholder="如：組長、幹事">
                </div>
                <div class="mb-4">
                    <label style="font-family: 'VT323', monospace; font-size: 18px;">
                        <input type="checkbox" id="new-is-admin"> 設為管理員
                    </label>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button type="submit" class="pixel-btn" style="flex: 1; background: #00b894;">確定新增</button>
                    <button type="button" onclick="removeModal()" class="pixel-btn" style="flex: 1; background: #636e72;">取消</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#add-user-form').onsubmit = addNewUser;
}

// Add new user
async function addNewUser(e) {
    e.preventDefault();

    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const name = document.getElementById('new-name').value.trim();
    const department = document.getElementById('new-department').value;
    const jobTitle = document.getElementById('new-jobtitle').value.trim();
    const isAdmin = document.getElementById('new-is-admin').checked;

    if (!username || !password || !name) {
        showAlert('請填寫必要欄位');
        return;
    }

    try {
        // Generate a unique ID for the user
        const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);

        // Hash password
        const { hashPassword } = await import('./crypto.js');
        const hashedPassword = await hashPassword(password);

        await setDoc(userRef, {
            username,
            password: hashedPassword,
            name,
            department,
            jobTitle: jobTitle || '待設定',
            role: isAdmin ? 'admin' : 'user',
            disabled: false,
            createdAt: new Date().toISOString(),
            authType: 'password'
        });

        removeModal();
        showAlert('使用者新增成功！');
        renderAdminPanel();
    } catch (err) {
        showAlert('新增失敗：' + err.message);
    }
}

// Show edit user modal
async function showEditUserModal(userId) {
    const users = globalUsers();
    const user = users.find(u => u.id === userId);
    if (!user) {
        showAlert('找不到使用者');
        return;
    }

    removeModal();

    const modal = document.createElement('div');
    modal.id = 'admin-modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';

    modal.innerHTML = `
        <div class="content-card p-6" style="width: 90%; max-width: 450px; max-height: 90vh; overflow-y: auto;">
            <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">✏️ 編輯使用者</h3>
            <form id="edit-user-form" data-user-id="${userId}">
                <div class="mb-3">
                    <label class="pixel-label">帳號</label>
                    <input type="text" class="pixel-input opacity-50" value="${user.username || user.email || ''}" disabled>
                </div>
                <div class="mb-3">
                    <label class="pixel-label">姓名 *</label>
                    <input type="text" id="edit-name" class="pixel-input" required value="${user.name || ''}">
                </div>
                <div class="mb-3">
                    <label class="pixel-label">處室</label>
                    <select id="edit-department" class="pixel-input">
                        ${DEPARTMENTS.map(d => `<option value="${d.value}" ${d.value === user.department ? 'selected' : ''}>${d.label}</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="pixel-label">職稱</label>
                    <input type="text" id="edit-jobtitle" class="pixel-input" value="${user.jobTitle || ''}">
                </div>
                <div class="mb-3">
                    <label class="pixel-label">新密碼（留空不修改）</label>
                    <input type="password" id="edit-password" class="pixel-input" placeholder="不修改請留空">
                </div>
                <div class="mb-4">
                    <label style="font-family: 'VT323', monospace; font-size: 18px;">
                        <input type="checkbox" id="edit-is-admin" ${user.role === 'admin' ? 'checked' : ''}> 管理員權限
                    </label>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button type="submit" class="pixel-btn" style="flex: 1; background: #6c5ce7;">儲存變更</button>
                    <button type="button" onclick="removeModal()" class="pixel-btn" style="flex: 1; background: #636e72;">取消</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#edit-user-form').onsubmit = updateUserDetails;
}

// Update user details
async function updateUserDetails(e) {
    e.preventDefault();

    const userId = e.target.dataset.userId;
    const name = document.getElementById('edit-name').value.trim();
    const department = document.getElementById('edit-department').value;
    const jobTitle = document.getElementById('edit-jobtitle').value.trim();
    const password = document.getElementById('edit-password').value;
    const isAdmin = document.getElementById('edit-is-admin').checked;

    if (!name) {
        showAlert('請填寫姓名');
        return;
    }

    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
        const updateData = {
            name,
            department,
            jobTitle: jobTitle || '待設定',
            role: isAdmin ? 'admin' : 'user'
        };

        if (password) {
            const { hashPassword } = await import('./crypto.js');
            updateData.password = await hashPassword(password);
        }

        await updateDoc(userRef, updateData);

        removeModal();
        showAlert('使用者資料已更新！');
        renderAdminPanel();
    } catch (err) {
        showAlert('更新失敗：' + err.message);
    }
}

// Remove modal
function removeModal() {
    document.getElementById('admin-modal-overlay')?.remove();
}

// Export to window
window.disableUser = disableUser;
window.enableUser = enableUser;
window.promoteToAdmin = promoteToAdmin;
window.deleteUser = deleteUser;
window.showAddUserModal = showAddUserModal;
window.showEditUserModal = showEditUserModal;
window.removeModal = removeModal;
