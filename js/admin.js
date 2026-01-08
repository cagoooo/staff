// Admin Panel Module - User Management
import { globalUsers, getAppCurrentUser } from './firestore.js';
import { db, appId } from './firebase-config.js';
import { doc, updateDoc, deleteDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';

// Sorting state
let currentSortField = 'name';
let currentSortDirection = 'asc';

// Sort users by field
function sortUsers(users, field, direction) {
    const deptLabels = {
        'principal': '校長室',
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'teachers': '教師群',
        'kindergarten': '幼兒園'
    };

    return [...users].sort((a, b) => {
        let valA, valB;

        switch (field) {
            case 'name':
                valA = a.name || '';
                valB = b.name || '';
                break;
            case 'username':
                valA = a.username || a.email || '';
                valB = b.username || b.email || '';
                break;
            case 'department':
                valA = deptLabels[a.department] || a.department || '';
                valB = deptLabels[b.department] || b.department || '';
                break;
            case 'jobTitle':
                valA = a.jobTitle || '';
                valB = b.jobTitle || '';
                break;
            case 'role':
                valA = a.role === 'admin' ? '管理員' : '一般';
                valB = b.role === 'admin' ? '管理員' : '一般';
                break;
            case 'line':
                valA = a.lineUserId && a.lineNotifyEnabled ? 1 : 0;
                valB = b.lineUserId && b.lineNotifyEnabled ? 1 : 0;
                break;
            case 'status':
                valA = a.disabled ? 1 : 0;
                valB = b.disabled ? 1 : 0;
                break;
            default:
                valA = a.name || '';
                valB = b.name || '';
        }

        // Compare
        if (typeof valA === 'string') {
            const cmp = valA.localeCompare(valB, 'zh-TW');
            return direction === 'asc' ? cmp : -cmp;
        } else {
            const cmp = valA - valB;
            return direction === 'asc' ? cmp : -cmp;
        }
    });
}

// Handle column header click
window.sortAdminTable = function (field) {
    if (currentSortField === field) {
        // Toggle direction
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New field, default to ascending
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    renderAdminPanel();
};

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
    // 防禦性檢查：再次確認用戶是 admin
    if (!isAdmin()) {
        console.log('[Admin] injectAdminUI called but user is not admin, skipping...');
        return;
    }

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

    // Sort users
    const sortedUsers = sortUsers(users, currentSortField, currentSortDirection);

    // Get backup UI HTML
    const backupUI = window.getBackupUIHtml ? window.getBackupUIHtml() : '';

    // Sort indicator helper
    const sortIndicator = (field) => {
        if (currentSortField === field) {
            return currentSortDirection === 'asc' ? ' ▲' : ' ▼';
        }
        return ' ↕';
    };

    // Sortable header style
    const thStyle = `padding: 12px; text-align: left; cursor: pointer; user-select: none; transition: background 0.2s;`;
    const thHover = `onmouseover="this.style.background='#3d4a4f'" onmouseout="this.style.background=''"`;

    container.innerHTML = `
        ${backupUI}
        ${getAdminMobileStyles()}
        
        <style>
            .sortable-th:hover { background: #3d4a4f !important; }
            .sort-indicator { font-size: 14px; opacity: 0.7; margin-left: 4px; }
            .sort-indicator.active { opacity: 1; color: #6c5ce7; }
        </style>
        
        <!-- LINE 綁定狀態統計 -->
        ${renderLineBindStats(users)}
        
        <div class="content-card p-4 mb-4" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
                <h2 style="font-family: 'VT323', monospace; font-size: 28px;">👥 使用者管理</h2>
                <p style="font-family: 'VT323', monospace; font-size: 18px; color: #636e72;" class="mt-2">
                    共 ${users.length} 位使用者 | 排序：${getSortFieldLabel(currentSortField)} ${currentSortDirection === 'asc' ? '↑' : '↓'}
                </p>
            </div>
            <button onclick="showAddUserModal()" class="pixel-btn" style="background: #00b894; font-size: 18px;">
                ➕ 新增使用者
            </button>
        </div>
        
        <!-- Desktop Table View -->
        <div class="content-card p-4 admin-desktop-table">
            <div class="overflow-x-auto">
                <table style="width: 100%; border-collapse: collapse; font-family: 'VT323', monospace; font-size: 20px;">
                    <thead>
                        <tr style="background: #2d3436; color: white;">
                            <th class="sortable-th" style="${thStyle}" onclick="sortAdminTable('name')">
                                姓名<span class="sort-indicator ${currentSortField === 'name' ? 'active' : ''}">${sortIndicator('name')}</span>
                            </th>
                            <th class="sortable-th" style="${thStyle}" onclick="sortAdminTable('username')">
                                帳號<span class="sort-indicator ${currentSortField === 'username' ? 'active' : ''}">${sortIndicator('username')}</span>
                            </th>
                            <th class="sortable-th" style="${thStyle}" onclick="sortAdminTable('department')">
                                處室<span class="sort-indicator ${currentSortField === 'department' ? 'active' : ''}">${sortIndicator('department')}</span>
                            </th>
                            <th class="sortable-th" style="${thStyle}" onclick="sortAdminTable('jobTitle')">
                                職稱<span class="sort-indicator ${currentSortField === 'jobTitle' ? 'active' : ''}">${sortIndicator('jobTitle')}</span>
                            </th>
                            <th class="sortable-th" style="${thStyle}" onclick="sortAdminTable('role')">
                                角色<span class="sort-indicator ${currentSortField === 'role' ? 'active' : ''}">${sortIndicator('role')}</span>
                            </th>
                            <th class="sortable-th" style="${thStyle} text-align: center;" onclick="sortAdminTable('line')">
                                LINE<span class="sort-indicator ${currentSortField === 'line' ? 'active' : ''}">${sortIndicator('line')}</span>
                            </th>
                            <th class="sortable-th" style="${thStyle} text-align: center;" onclick="sortAdminTable('status')">
                                狀態<span class="sort-indicator ${currentSortField === 'status' ? 'active' : ''}">${sortIndicator('status')}</span>
                            </th>
                            <th style="padding: 12px; text-align: center;">操作</th>
                        </tr>
                    </thead>
                    <tbody id="user-list-tbody">
                        ${sortedUsers.map(u => renderUserRow(u)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Mobile Card View -->
        <div class="admin-mobile-cards">
            ${sortedUsers.map(u => renderUserCard(u)).join('')}
        </div>
    `;
}

// Helper: Get sort field label in Chinese
function getSortFieldLabel(field) {
    const labels = {
        'name': '姓名',
        'username': '帳號',
        'department': '處室',
        'jobTitle': '職稱',
        'role': '角色',
        'line': 'LINE',
        'status': '狀態'
    };
    return labels[field] || field;
}

// Mobile CSS styles for admin panel
function getAdminMobileStyles() {
    return `
        <style>
            /* Desktop: show table, hide cards */
            @media (min-width: 769px) {
                .admin-desktop-table { display: block; }
                .admin-mobile-cards { display: none; }
            }
            
            /* Mobile: hide table, show cards */
            @media (max-width: 768px) {
                .admin-desktop-table { display: none !important; }
                .admin-mobile-cards { display: block !important; }
            }
            
            .admin-mobile-cards {
                display: none;
            }
            
            .admin-user-card {
                background: white;
                border-radius: 12px;
                margin-bottom: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                overflow: hidden;
                border-left: 4px solid #6c5ce7;
            }
            
            .admin-user-card.disabled {
                opacity: 0.6;
                border-left-color: #e74c3c;
                background: #fff5f5;
            }
            
            .admin-user-card.admin-role {
                border-left-color: #f39c12;
            }
            
            .admin-user-card-header {
                background: #f8f9fa;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #e9ecef;
            }
            
            .admin-user-card-name {
                font-family: 'VT323', monospace;
                font-size: 22px;
                font-weight: bold;
            }
            
            .admin-user-card-badges {
                display: flex;
                gap: 6px;
            }
            
            .admin-user-card-badge {
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-family: 'VT323', monospace;
            }
            
            .admin-user-card-body {
                padding: 12px 16px;
            }
            
            .admin-user-card-row {
                display: flex;
                margin-bottom: 8px;
                font-family: 'VT323', monospace;
                font-size: 16px;
            }
            
            .admin-user-card-label {
                color: #636e72;
                width: 60px;
                flex-shrink: 0;
            }
            
            .admin-user-card-value {
                color: #2d3436;
                word-break: break-all;
            }
            
            .admin-user-card-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 12px 16px;
                background: #f8f9fa;
                border-top: 1px solid #e9ecef;
            }
            
            .admin-user-card-actions .pixel-btn {
                flex: 1;
                min-width: 70px;
                padding: 8px 12px !important;
                font-size: 14px !important;
            }
        </style>
    `;
}

// Render mobile user card
function renderUserCard(user) {
    const deptLabels = {
        'principal': '校長室',
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'teachers': '教師群',
        'kindergarten': '幼兒園'
    };

    const isDisabled = user.disabled === true;
    const isAdminUser = user.role === 'admin';
    const currentUser = getAppCurrentUser();
    const isSelf = user.id === currentUser?.id;
    const hasLine = user.lineUserId && user.lineNotifyEnabled;

    return `
        <div class="admin-user-card ${isDisabled ? 'disabled' : ''} ${isAdminUser ? 'admin-role' : ''}">
            <div class="admin-user-card-header">
                <span class="admin-user-card-name">${user.name || '未設定'}</span>
                <div class="admin-user-card-badges">
                    ${isAdminUser ? '<span class="admin-user-card-badge" style="background: #ffeaa7; color: #f39c12;">👑 管理員</span>' : ''}
                    ${hasLine ? '<span class="admin-user-card-badge" style="background: #d4edda; color: #00B900;">LINE</span>' : ''}
                    ${isDisabled ? '<span class="admin-user-card-badge" style="background: #f8d7da; color: #e74c3c;">停用</span>' :
            '<span class="admin-user-card-badge" style="background: #d4edda; color: #00b894;">啟用</span>'}
                </div>
            </div>
            <div class="admin-user-card-body">
                <div class="admin-user-card-row">
                    <span class="admin-user-card-label">帳號</span>
                    <span class="admin-user-card-value">${user.username || user.email || '--'}</span>
                </div>
                <div class="admin-user-card-row">
                    <span class="admin-user-card-label">處室</span>
                    <span class="admin-user-card-value">${deptLabels[user.department] || user.department || '--'}</span>
                </div>
                <div class="admin-user-card-row">
                    <span class="admin-user-card-label">職稱</span>
                    <span class="admin-user-card-value">${user.jobTitle || '--'}</span>
                </div>
            </div>
            ${!isSelf ? `
                <div class="admin-user-card-actions">
                    <button onclick="showEditUserModal('${user.id}')" class="pixel-btn" style="background: #6c5ce7;">
                        ✏️ 編輯
                    </button>
                    <button onclick="${isDisabled ? `enableUser('${user.id}')` : `disableUser('${user.id}')`}" 
                        class="pixel-btn" style="${isDisabled ? 'background: #00b894;' : 'background: #e17055;'}">
                        ${isDisabled ? '✅ 啟用' : '⛔ 停用'}
                    </button>
                    ${!isAdminUser ? `
                        <button onclick="promoteToAdmin('${user.id}')" class="pixel-btn" style="background: #f39c12;">
                            👑 設管理員
                        </button>
                    ` : ''}
                    <button onclick="deleteUser('${user.id}', '${user.name || user.username || ''}')" 
                        class="pixel-btn" style="background: #d63031;">
                        🗑️ 刪除
                    </button>
                </div>
            ` : '<div class="admin-user-card-actions"><span style="color:#888;font-family:VT323,monospace;">（這是您自己）</span></div>'}
        </div>
    `;
}

// Render a single user row
function renderUserRow(user) {
    const deptLabels = {
        'principal': '校長室',
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'teachers': '教師群'
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
                ${user.lineUserId && user.lineNotifyEnabled
            ? '<span style="color: #00B900;" title="已綁定 LINE">✅</span>'
            : '<span style="color: #b2bec3;" title="未綁定 LINE">➖</span>'}
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

            // 先找到使用者的 email（用於刪除 Firebase Auth）
            const users = globalUsers();
            const targetUser = users.find(u => u.id === userId);
            const userEmail = targetUser?.email || targetUser?.username;

            // 如果用戶是 Google 登入的，嘗試刪除 Firebase Auth 帳號
            if (targetUser?.authType === 'google' && userEmail) {
                try {
                    console.log('[Admin] Attempting to delete Firebase Auth for:', userEmail);

                    // 取得當前使用者的 ID Token
                    const idToken = await auth.currentUser?.getIdToken();
                    if (!idToken) {
                        throw new Error('無法取得認證 Token');
                    }

                    // 呼叫 Cloud Function 刪除 Auth 帳號
                    const response = await fetch('https://asia-east1-smes-e1dc3.cloudfunctions.net/deleteAuthUser', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`
                        },
                        body: JSON.stringify({ email: userEmail })
                    });

                    const result = await response.json();
                    if (result.success) {
                        console.log('[Admin] Firebase Auth account deleted:', result.message);
                    } else {
                        console.warn('[Admin] Firebase Auth deletion failed:', result.error);
                    }
                } catch (authErr) {
                    // Auth 刪除失敗不阻止 Firestore 刪除
                    console.warn('[Admin] Could not delete Firebase Auth account:', authErr.message);
                }
            }

            // 刪除 Firestore 中的使用者資料
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
            await deleteDoc(userRef);

            showAlert('已刪除使用者（包含登入帳號）');
            renderAdminPanel();
        } catch (err) {
            console.error('[Admin] Delete failed:', err);
            showAlert('刪除失敗：' + err.message);
        }
    });
}

// Show add user modal
function showAddUserModal() {
    removeModal();

    // Import department functions dynamically
    import('./departments.js').then(({ DEPARTMENTS, renderDepartmentOptions, renderPositionOptions }) => {
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
                        <select id="new-department" class="pixel-input" onchange="updateNewUserPositions()">
                            ${renderDepartmentOptions()}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="pixel-label">職稱</label>
                        <select id="new-jobtitle" class="pixel-input">
                            <option value="">-- 請先選擇處室 --</option>
                        </select>
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

        // Store renderPositionOptions for later use
        window._renderPositionOptions = renderPositionOptions;
    });
}

// Update position options when department changes (for add user modal)
function updateNewUserPositions() {
    const deptSelect = document.getElementById('new-department');
    const posSelect = document.getElementById('new-jobtitle');
    if (!deptSelect || !posSelect) return;

    const deptId = deptSelect.value;
    if (window._renderPositionOptions) {
        posSelect.innerHTML = window._renderPositionOptions(deptId);
    }
}
window.updateNewUserPositions = updateNewUserPositions;

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

    // Import department functions dynamically
    const { renderDepartmentOptions, renderPositionOptions } = await import('./departments.js');

    const modal = document.createElement('div');
    modal.id = 'admin-modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';

    modal.innerHTML = `
        <div class="content-card p-6" style="width: 90%; max-width: 450px; max-height: 90vh; overflow-y: auto;">
            <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">✏️ 編輯使用者</h3>
            <form id="admin-edit-user-form" data-user-id="${userId}">
                <div class="mb-3">
                    <label class="pixel-label">帳號</label>
                    <input type="text" class="pixel-input opacity-50" value="${user.username || user.email || ''}" disabled>
                </div>
                <div class="mb-3">
                    <label class="pixel-label">姓名 *</label>
                    <input type="text" id="admin-edit-name" class="pixel-input" required value="${user.name || ''}">
                </div>
                <div class="mb-3">
                    <label class="pixel-label">處室</label>
                    <select id="admin-edit-department" class="pixel-input" onchange="updateEditUserPositions()">
                        ${renderDepartmentOptions(user.department)}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="pixel-label">職稱</label>
                    <select id="admin-edit-jobtitle" class="pixel-input">
                        ${renderPositionOptions(user.department, user.jobTitle)}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="pixel-label">新密碼（留空不修改）</label>
                    <input type="password" id="admin-edit-password" class="pixel-input" placeholder="不修改請留空">
                </div>
                <div class="mb-4">
                    <label style="font-family: 'VT323', monospace; font-size: 18px;">
                        <input type="checkbox" id="admin-edit-is-admin" ${user.role === 'admin' ? 'checked' : ''}> 管理員權限
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
    modal.querySelector('#admin-edit-user-form').onsubmit = updateUserDetails;

    // Store renderPositionOptions for later use
    window._renderPositionOptions = renderPositionOptions;
}

// Update position options when department changes (for edit user modal)
function updateEditUserPositions() {
    const deptSelect = document.getElementById('admin-edit-department');
    const posSelect = document.getElementById('admin-edit-jobtitle');
    if (!deptSelect || !posSelect) return;

    const deptId = deptSelect.value;
    if (window._renderPositionOptions) {
        posSelect.innerHTML = window._renderPositionOptions(deptId);
    }
}
window.updateEditUserPositions = updateEditUserPositions;

// Update user details
async function updateUserDetails(e) {
    e.preventDefault();

    const userId = e.target.dataset.userId;
    const name = document.getElementById('admin-edit-name').value.trim();
    const department = document.getElementById('admin-edit-department').value;
    const jobTitle = document.getElementById('admin-edit-jobtitle').value.trim();
    const password = document.getElementById('admin-edit-password').value;
    const isAdmin = document.getElementById('admin-edit-is-admin').checked;

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

// Render LINE bind statistics section
function renderLineBindStats(users) {
    const deptLabels = {
        'principal': '校長室',
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'teachers': '教師群',
        'kindergarten': '幼兒園'
    };

    // Calculate stats
    const activeUsers = users.filter(u => !u.disabled);
    const boundUsers = activeUsers.filter(u => u.lineUserId && u.lineNotifyEnabled);
    const unboundUsers = activeUsers.filter(u => !u.lineUserId || !u.lineNotifyEnabled);
    const boundPercent = activeUsers.length > 0 ? Math.round((boundUsers.length / activeUsers.length) * 100) : 0;

    // Group by department
    const deptStats = {};
    activeUsers.forEach(u => {
        const dept = u.department || 'other';
        if (!deptStats[dept]) {
            deptStats[dept] = { bound: 0, total: 0 };
        }
        deptStats[dept].total++;
        if (u.lineUserId && u.lineNotifyEnabled) {
            deptStats[dept].bound++;
        }
    });

    // Generate department stats rows
    const deptRows = Object.entries(deptStats)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([dept, stats]) => {
            const pct = stats.total > 0 ? Math.round((stats.bound / stats.total) * 100) : 0;
            return `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 16px;">
                    <span>${deptLabels[dept] || '其他'}</span>
                    <span style="color: ${pct >= 80 ? '#00b894' : pct >= 50 ? '#fdcb6e' : '#e17055'};">
                        ${stats.bound}/${stats.total} (${pct}%)
                    </span>
                </div>
            `;
        }).join('');

    return `
        <div class="content-card p-4 mb-4" style="border-left: 4px solid #00B900;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
                <div style="flex: 1; min-width: 200px;">
                    <h3 style="font-family: 'VT323', monospace; font-size: 24px; color: #00B900; margin-bottom: 12px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#00B900" style="vertical-align: middle; margin-right: 8px;">
                            <path d="M12 2C6.48 2 2 5.58 2 10c0 2.12.87 4.04 2.3 5.48-.15.54-.8 2.75-1.3 3.52 0 0-.03.1.03.14.07.05.14.02.14.02 1.78-.26 3.25-1.11 4.09-1.67.91.24 1.87.39 2.86.39 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/>
                        </svg>
                        LINE 綁定狀態
                    </h3>
                    
                    <div style="display: flex; gap: 24px; margin-bottom: 16px;">
                        <div style="text-align: center;">
                            <div style="font-family: 'VT323', monospace; font-size: 36px; color: #00b894;">${boundUsers.length}</div>
                            <div style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72;">已綁定</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-family: 'VT323', monospace; font-size: 36px; color: #e17055;">${unboundUsers.length}</div>
                            <div style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72;">未綁定</div>
                        </div>
                    </div>
                    
                    <!-- Progress bar -->
                    <div style="background: #e9ecef; border-radius: 8px; height: 12px; overflow: hidden; margin-bottom: 8px;">
                        <div style="background: linear-gradient(90deg, #00b894, #00B900); width: ${boundPercent}%; height: 100%; border-radius: 8px; transition: width 0.3s;"></div>
                    </div>
                    <div style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72; text-align: center;">
                        綁定率 ${boundPercent}%
                    </div>
                </div>
                
                <div style="flex: 1; min-width: 180px;">
                    <h4 style="font-family: 'VT323', monospace; font-size: 18px; color: #333; margin-bottom: 8px;">📊 按處室統計</h4>
                    ${deptRows || '<div style="color: #888; font-size: 14px;">暫無資料</div>'}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                    <button onclick="sendLineBindInvite()" class="pixel-btn" style="background: #00B900; font-size: 16px; white-space: nowrap;">
                        📨 發送綁定邀請
                    </button>
                    <div style="font-family: 'VT323', monospace; font-size: 12px; color: #888; text-align: right; max-width: 150px;">
                        向未綁定的用戶發送 LINE 綁定邀請
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Send LINE bind invitation to unbound followers
async function sendLineBindInvite() {
    showConfirm(
        `確定要發送 LINE 綁定邀請嗎？\n\n將發送邀請給所有「已加入 LINE 官方帳號但尚未完成系統綁定」的追蹤者。`,
        async () => {
            try {
                // Get current user's ID token for authentication
                const { auth } = await import('./firebase-config.js');
                const idToken = await auth.currentUser?.getIdToken();
                if (!idToken) {
                    showAlert('❌ 請先登入');
                    return;
                }

                showAlert('📨 正在發送邀請...');

                const response = await fetch('https://asia-east1-smes-e1dc3.cloudfunctions.net/sendLineBindInvite', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({})
                });

                const result = await response.json();
                if (result.success) {
                    if (result.successCount === 0 && result.failCount === 0) {
                        showAlert(`🎉 ${result.message}`);
                    } else {
                        showAlert(`✅ 邀請發送完成！\n\n成功: ${result.successCount} 位\n失敗: ${result.failCount} 位`);
                    }
                } else {
                    showAlert('❌ 發送失敗：' + (result.error || '未知錯誤'));
                }
            } catch (err) {
                console.error('[Admin] Send invite failed:', err);
                showAlert('❌ 發送失敗：' + err.message);
            }
        }
    );
}

// Export to window
window.disableUser = disableUser;
window.enableUser = enableUser;
window.promoteToAdmin = promoteToAdmin;
window.deleteUser = deleteUser;
window.showAddUserModal = showAddUserModal;
window.showEditUserModal = showEditUserModal;
window.removeModal = removeModal;
window.sendLineBindInvite = sendLineBindInvite;
