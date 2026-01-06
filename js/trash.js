// Trash Module - Recycle bin functionality
import { showConfirm } from '../components/modal.js';
import { getAppCurrentUser, getDeletedEvents } from './firestore.js';
import { getDepartmentColor, getDepartmentName } from './departments.js';

/**
 * Initialize trash module
 */
export function initTrash() {
    console.log('[Trash] Initializing...');

    // Add trash menu item to sidebar if not exists
    addTrashMenuItem();

    console.log('[Trash] Module initialized');
}

/**
 * Add trash menu item to sidebar
 */
function addTrashMenuItem() {
    const sidebar = document.querySelector('aside .flex.flex-col.gap-2');
    if (!sidebar) return;

    // Check if already exists
    if (document.getElementById('nav-trash')) return;

    // Find the stats button and add after it
    const statsBtn = sidebar.querySelector('[onclick*="stats"]');
    if (statsBtn) {
        const trashBtn = document.createElement('button');
        trashBtn.id = 'nav-trash';
        trashBtn.className = 'nav-btn flex items-center gap-3 p-3 text-left hover:bg-purple-100 transition';
        trashBtn.onclick = () => window.switchTab('trash');
        trashBtn.innerHTML = `
            <span class="text-xl">🗑️</span>
            <span class="font-medium">回收站</span>
        `;
        statsBtn.insertAdjacentElement('afterend', trashBtn);
    }

    // Create trash view container
    createTrashView();
}

/**
 * Create trash view in content area
 */
function createTrashView() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    // Check if already exists
    if (document.getElementById('view-trash')) return;

    const trashView = document.createElement('div');
    trashView.id = 'view-trash';
    trashView.className = 'hidden-section';
    trashView.innerHTML = `
        <div class="content-card">
            <div class="flex items-center justify-between mb-4">
                <h2 style="font-family: 'VT323', monospace; font-size: 28px;">
                    🗑️ 回收站
                </h2>
                <button onclick="emptyTrash()" class="pixel-btn" style="background: #e17055; font-size: 14px;">
                    🗑️ 清空回收站
                </button>
            </div>
            <p style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72; margin-bottom: 16px;">
                已刪除的行程會在 30 天後自動永久刪除
            </p>
            <div id="trash-list"></div>
        </div>
    `;
    contentArea.appendChild(trashView);
}

/**
 * Render trash list
 */
export function renderTrashList() {
    const container = document.getElementById('trash-list');
    if (!container) return;

    const deletedEvents = getDeletedEvents();
    const currentUser = getAppCurrentUser();

    if (deletedEvents.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10" style="font-family: 'VT323', monospace;">
                <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                <div style="font-size: 20px; color: #636e72;">回收站是空的</div>
            </div>
        `;
        return;
    }

    // Sort by deletedAt (newest first)
    const sorted = [...deletedEvents].sort((a, b) =>
        new Date(b.deletedAt) - new Date(a.deletedAt)
    );

    container.innerHTML = sorted.map(evt => {
        const deptColor = getDepartmentColor(evt.authorDepartment);
        const deletedDate = new Date(evt.deletedAt).toLocaleDateString('zh-TW');
        const daysLeft = 30 - Math.floor((Date.now() - new Date(evt.deletedAt)) / (1000 * 60 * 60 * 24));
        const isOwner = evt.authorId === currentUser?.id || currentUser?.role === 'admin';

        return `
            <div class="trash-item p-4 mb-3 border-l-4 bg-gray-50" 
                 style="border-color: ${deptColor}; font-family: 'VT323', monospace;">
                <div class="flex justify-between items-start gap-3">
                    <div class="flex-1">
                        <h4 class="text-lg font-bold text-gray-600">${evt.title}</h4>
                        <p class="text-sm text-gray-500">
                            原日期：${evt.date} ${evt.time || '全天'} | 發起人：${evt.authorName}
                        </p>
                        <p class="text-sm text-gray-400 mt-1">
                            刪除於 ${deletedDate} | 
                            <span style="color: ${daysLeft <= 7 ? '#e17055' : '#636e72'}">
                                ${daysLeft > 0 ? `${daysLeft} 天後永久刪除` : '即將永久刪除'}
                            </span>
                        </p>
                    </div>
                    ${isOwner ? `
                        <div class="flex gap-2">
                            <button onclick="handleRestoreEvent('${evt.id}')" 
                                class="pixel-btn" style="background: #00b894; font-size: 14px; padding: 6px 12px;">
                                ↩️ 復原
                            </button>
                            <button onclick="handlePermanentDelete('${evt.id}')" 
                                class="pixel-btn" style="background: #e17055; font-size: 14px; padding: 6px 12px;">
                                ❌ 永久刪除
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Handle restore event
 */
window.handleRestoreEvent = async function (eventId) {
    if (window.restoreEvent) {
        const success = await window.restoreEvent(eventId);
        if (success) {
            renderTrashList();
        }
    }
};

/**
 * Handle permanent delete
 */
window.handlePermanentDelete = function (eventId) {
    showConfirm('確定要永久刪除這個行程嗎？此操作無法復原！', async () => {
        if (window.permanentlyDeleteEvent) {
            const success = await window.permanentlyDeleteEvent(eventId);
            if (success) {
                renderTrashList();
            }
        }
    });
};

/**
 * Empty trash
 */
window.emptyTrash = function () {
    const deletedEvents = getDeletedEvents();
    if (deletedEvents.length === 0) return;

    showConfirm(`確定要永久刪除回收站中的 ${deletedEvents.length} 個行程嗎？此操作無法復原！`, async () => {
        for (const evt of deletedEvents) {
            if (window.permanentlyDeleteEvent) {
                await window.permanentlyDeleteEvent(evt.id);
            }
        }
        renderTrashList();
    });
};

// Make render function available globally
window.renderTrashList = renderTrashList;
