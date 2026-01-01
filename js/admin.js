// Admin Panel Module - User Management
import { globalUsers, getAppCurrentUser } from './firestore.js';
import { db, appId } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';

// Check if current user is admin
function isAdmin() {
    const user = getAppCurrentUser();
    return user?.role === 'admin';
}

// Initialize admin panel
export function initAdmin() {
    console.log('[Admin] Initializing...');

    // Wait for user data to load
    setTimeout(() => {
        const currentUser = getAppCurrentUser();
        if (!currentUser) return;

        // Only inject for admins
        if (currentUser.role === 'admin') {
            injectAdminUI();
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
        <div class="content-card p-4 mb-4">
            <h2 style="font-family: 'VT323', monospace; font-size: 28px;">👥 使用者管理</h2>
            <p style="font-family: 'VT323', monospace; font-size: 18px; color: #636e72;" class="mt-2">
                共 ${users.length} 位使用者
            </p>
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
                    <button onclick="${isDisabled ? `enableUser('${user.id}')` : `disableUser('${user.id}')`}" 
                        class="pixel-btn" style="padding: 4px 8px; font-size: 16px; ${isDisabled ? 'background: #00b894;' : 'background: #e17055;'}">
                        ${isDisabled ? '啟用' : '停用'}
                    </button>
                    ${!isAdminUser ? `
                        <button onclick="promoteToAdmin('${user.id}')" 
                            class="pixel-btn" style="padding: 4px 8px; font-size: 16px; background: #f39c12; margin-left: 4px;">
                            設為管理員
                        </button>
                    ` : ''}
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

// Export to window
window.disableUser = disableUser;
window.enableUser = enableUser;
window.promoteToAdmin = promoteToAdmin;
