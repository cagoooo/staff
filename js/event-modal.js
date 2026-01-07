// Event Modal Module - For viewing, editing, and deleting events
import { globalUsers, getAppCurrentUser, updateEvent, deleteEvent, getEventById } from './firestore.js';
import { showConfirm } from '../components/modal.js';
import { renderTagSelector, setSelectedTags, getSelectedTags, renderTagBadges, getAllTags } from './tags.js';
import { startCommentsListener, stopCommentsListener, renderCommentsSection } from './comments.js';
import { renderReminderSettings } from './reminders.js';

let currentEditingEventId = null;
let isEditMode = false;
let attachmentsToDelete = []; // Track attachments to delete
let editSelectedTargets = []; // Track selected targets during edit

// Create and inject the modal HTML into the DOM
export function initEventModal() {
    const modalHTML = `
    <div id="event-modal" class="fixed inset-0 z-[50] bg-black bg-opacity-60 hidden-section flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
        <div class="bg-white w-full max-w-md border-4 border-gray-800 my-4 sm:my-8" style="box-shadow: 6px 6px 0 #2d3436;">
            <div class="p-3 sm:p-4 border-b-4 border-gray-800 flex justify-between items-center sticky top-0 z-10" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                <h3 id="event-modal-title" class="text-white" style="font-family: 'VT323', monospace; font-size: 24px;">📅 行程詳情</h3>
                <button onclick="closeEventModal()" class="text-white text-2xl hover:text-gray-300">&times;</button>
            </div>
            <div class="p-3 sm:p-4 max-h-[70vh] overflow-y-auto overflow-x-visible" id="event-modal-content" style="overflow: auto;">
                <!-- View Mode -->
                <div id="event-view-mode">
                    <div class="mb-3">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">標題</span>
                        <p id="event-detail-title" style="font-family: 'VT323', monospace; font-size: 22px; font-weight: bold;"></p>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">日期</span>
                            <p id="event-detail-date" style="font-family: 'VT323', monospace; font-size: 20px;"></p>
                        </div>
                        <div>
                            <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">時間</span>
                            <p id="event-detail-time" style="font-family: 'VT323', monospace; font-size: 20px;"></p>
                        </div>
                    </div>
                    <div class="mb-3 hidden-section" id="event-end-date-row">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">📆 結束日期 (跨日行程)</span>
                        <p id="event-detail-end-date" style="font-family: 'VT323', monospace; font-size: 20px; color: #6c5ce7;"></p>
                    </div>
                    <div class="mb-3">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">建立者</span>
                        <p id="event-detail-author" style="font-family: 'VT323', monospace; font-size: 20px;"></p>
                    </div>
                    <div class="mb-3">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">指派對象</span>
                        <div id="event-detail-targets" class="flex flex-wrap gap-1 mt-1"></div>
                    </div>
                    <div class="mb-3">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">狀態</span>
                        <p id="event-detail-status" style="font-family: 'VT323', monospace; font-size: 20px;"></p>
                    </div>
                    <div class="mb-3" id="event-attachments-view">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">📎 附件</span>
                        <div id="event-detail-attachments" class="mt-2 space-y-2"></div>
                    </div>
                    <div class="mb-3" id="event-tags-view">
                        <span class="text-gray-500" style="font-family: 'VT323', monospace; font-size: 16px;">🏷️ 標籤</span>
                        <div id="event-detail-tags" class="mt-1"></div>
                    </div>
                    <!-- Reminders Section -->
                    <div id="event-reminders-section"></div>
                    <!-- Comments Section -->
                    <div id="event-comments-section"></div>
                </div>
                <!-- Edit Mode -->
                <div id="event-edit-mode" class="hidden-section">
                    <div class="mb-3">
                        <label class="pixel-label">標題</label>
                        <input type="text" id="edit-evt-title" required class="pixel-input">
                    </div>
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label class="pixel-label">日期</label>
                            <input type="date" id="edit-evt-date" required class="pixel-input">
                        </div>
                        <div id="edit-time-field-container">
                            <label class="pixel-label">時間</label>
                            <input type="time" id="edit-evt-time" class="pixel-input">
                        </div>
                    </div>
                    <div class="flex items-center gap-3 mb-3" style="font-family: 'VT323', monospace; font-size: 20px;">
                        <input type="checkbox" id="edit-evt-all-day" class="w-5 h-5" onchange="toggleEditAllDay()">
                        <label for="edit-evt-all-day">🌅 全天行程（不指定時間）</label>
                    </div>
                    <div class="flex items-center gap-3 mb-3" style="font-family: 'VT323', monospace; font-size: 20px;">
                        <input type="checkbox" id="edit-evt-is-public" class="w-5 h-5">
                        <label for="edit-evt-is-public">⭐ 設為重要行事</label>
                    </div>
                    <div class="mb-3">
                        <label class="pixel-label">公告類型</label>
                        <select id="edit-evt-type" class="pixel-input">
                            <option value="normal">📋 一般</option>
                            <option value="important">⚡ 重要</option>
                            <option value="urgent">🚨 緊急</option>
                            <option value="meeting">🏛️ 會議</option>
                            <option value="training">📚 研習</option>
                            <option value="event">🎉 活動</option>
                            <option value="reminder">⏰ 提醒</option>
                            <option value="deadline">📅 截止日</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-3 mb-3" style="font-family: 'VT323', monospace; font-size: 20px;">
                        <input type="checkbox" id="edit-evt-pinned" class="w-5 h-5">
                        <label for="edit-evt-pinned">📌 置頂公告</label>
                    </div>
                    <div class="mb-3">
                        <label class="pixel-label">📎 上傳附件</label>
                        <input type="file" id="edit-evt-file" class="pixel-input" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
                        <p style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72; margin-top: 4px;">
                            支援：圖片、PDF、Word、Excel、TXT（最大 10MB）
                        </p>
                        <div id="edit-attachments-list" class="mt-2 space-y-1"></div>
                    </div>
                    <div class="mb-3">
                        <label class="pixel-label">🏷️ 標籤</label>
                        <div id="edit-event-tags-container" style="position: relative;"></div>
                    </div>
                    <div class="mb-3" id="edit-targets-section">
                        <label class="pixel-label">👥 通知人員（可編輯）</label>
                        <!-- 快速選取按鈕 -->
                        <div class="flex flex-wrap gap-2 mb-2">
                            <button type="button" onclick="editSelectAllTargets()"
                                class="pixel-btn"
                                style="font-size: 14px; padding: 4px 12px; background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%); border: 2px solid #6c5ce7; color: white;">
                                📢 通知全部
                            </button>
                            <button type="button" onclick="editClearAllTargets()"
                                class="pixel-btn pixel-btn-secondary"
                                style="font-size: 14px; padding: 4px 12px;">
                                🗑️ 清空
                            </button>
                        </div>
                        <!-- 已選擇人員 -->
                        <div id="edit-selected-targets"
                            class="flex flex-wrap gap-2 mb-2 p-3 border-2 border-dashed min-h-[50px] bg-white items-center"
                            style="font-family: 'VT323', monospace; font-size: 18px;">
                            <span class="text-gray-400">尚未選擇人員...</span>
                        </div>
                        <!-- 人員選擇列表 -->
                        <div class="border-2 h-32 overflow-y-auto bg-gray-50 p-2 space-y-1" id="edit-target-list">
                            <div class="text-gray-400 text-sm p-2">載入中...</div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Footer Buttons -->
            <div class="p-3 sm:p-4 border-t-2 border-gray-200 flex flex-wrap gap-2 sticky bottom-0 bg-white" id="event-modal-footer">
                <button onclick="toggleEventEditMode()" id="btn-edit-event" class="pixel-btn flex-1 min-w-[80px] text-sm sm:text-base">✏️ 編輯</button>
                <button onclick="confirmDeleteEvent()" id="btn-delete-event" class="pixel-btn flex-1 min-w-[80px] text-sm sm:text-base" style="background: #e17055;">🗑️ 刪除</button>
                <button onclick="saveEventEdit()" id="btn-save-event" class="pixel-btn pixel-btn-success flex-1 min-w-[80px] text-sm sm:text-base hidden-section">💾 儲存</button>
                <button onclick="cancelEventEdit()" id="btn-cancel-edit" class="pixel-btn pixel-btn-secondary flex-1 min-w-[80px] text-sm sm:text-base hidden-section">❌ 取消</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Open modal to show event details
export function openEventModal(eventId) {
    const event = getEventById(eventId);
    if (!event) return;

    currentEditingEventId = eventId;
    isEditMode = false;

    const modal = document.getElementById('event-modal');
    if (!modal) return;

    // Populate view mode
    const privateBadge = event.isPrivate ? '🔒 ' : '';
    document.getElementById('event-detail-title').innerText = privateBadge + (event.title || '');
    document.getElementById('event-detail-date').innerText = event.date || '';
    document.getElementById('event-detail-time').innerText = event.isAllDay ? '🌅 全天' : (event.time || '--:--');
    document.getElementById('event-detail-author').innerText = event.authorName || '未知';

    // Show end date for multi-day events
    const endDateRow = document.getElementById('event-end-date-row');
    const endDateField = document.getElementById('event-detail-end-date');
    if (event.endDate) {
        endDateRow.classList.remove('hidden-section');
        endDateField.innerText = event.endDate;
    } else {
        endDateRow.classList.add('hidden-section');
    }

    // Render targets
    const targetsContainer = document.getElementById('event-detail-targets');
    const users = globalUsers();
    if (event.targets && event.targets.length > 0) {
        targetsContainer.innerHTML = event.targets.map(tid => {
            const user = users.find(u => u.id === tid);
            return `<span style="background: #dfe6e9; padding: 2px 8px; border-radius: 4px; font-family: 'VT323', monospace; font-size: 16px;">${user ? user.name : '未知'}</span>`;
        }).join('');
    } else if (event.isPublic) {
        targetsContainer.innerHTML = '<span style="color: #6c5ce7; font-family: \'VT323\', monospace; font-size: 18px;">⭐ 公開行事</span>';
    } else {
        targetsContainer.innerHTML = '<span style="color: #636e72;">無</span>';
    }

    // Status - 建立者完成時全局顯示已完成
    const currentUser = getAppCurrentUser();
    const completed = event.isGloballyCompleted || event.completedBy?.includes(currentUser?.id);
    document.getElementById('event-detail-status').innerHTML = completed
        ? '<span style="color: #00b894;">✅ 已完成</span>'
        : '<span style="color: #fdcb6e;">⏳ 待處理</span>';

    // Render attachments
    const attachContainer = document.getElementById('event-detail-attachments');
    const attachViewSection = document.getElementById('event-attachments-view');
    if (event.attachments && event.attachments.length > 0) {
        attachViewSection.style.display = 'block';
        attachContainer.innerHTML = event.attachments.map(att => {
            const icon = window.getFileIcon ? window.getFileIcon(att.type) : '📎';
            const size = window.formatFileSize ? window.formatFileSize(att.size) : '';
            const isImage = att.type.startsWith('image/');
            return `
                <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">${icon}</span>
                    <div style="flex: 1; min-width: 0;">
                        <a href="${att.url}" target="_blank" style="font-family: 'VT323', monospace; font-size: 18px; color: #6c5ce7; text-decoration: none;">
                            ${att.name}
                        </a>
                        <div style="font-size: 14px; color: #636e72;">${size}</div>
                    </div>
                    ${isImage ? `<img src="${att.url}" style="max-width: 60px; max-height: 60px; border-radius: 4px;">` : ''}
                </div>
            `;
        }).join('');
    } else {
        attachViewSection.style.display = 'none';
    }

    // Render tags
    const tagsViewSection = document.getElementById('event-tags-view');
    const tagsContainer = document.getElementById('event-detail-tags');
    if (event.tags && event.tags.length > 0) {
        tagsViewSection.style.display = 'block';
        tagsContainer.innerHTML = renderTagBadges(event.tags);
    } else {
        tagsViewSection.style.display = 'none';
    }

    // Show/hide edit button based on ownership or admin role
    const isOwner = event.authorId === currentUser?.id;
    const isAdmin = currentUser?.role === 'admin';
    const canEditDelete = isOwner || isAdmin;
    document.getElementById('btn-edit-event').style.display = canEditDelete ? 'block' : 'none';
    document.getElementById('btn-delete-event').style.display = canEditDelete ? 'block' : 'none';

    // Reset to view mode
    document.getElementById('event-view-mode').classList.remove('hidden-section');
    document.getElementById('event-edit-mode').classList.add('hidden-section');
    document.getElementById('btn-edit-event').classList.remove('hidden-section');
    document.getElementById('btn-delete-event').classList.remove('hidden-section');
    document.getElementById('btn-save-event').classList.add('hidden-section');
    document.getElementById('btn-cancel-edit').classList.add('hidden-section');

    // Start comments listener for this event
    startCommentsListener(eventId);

    // Render reminders section
    const remindersContainer = document.getElementById('event-reminders-section');
    if (remindersContainer) {
        remindersContainer.innerHTML = renderReminderSettings(eventId);
    }

    modal.classList.remove('hidden-section');
}

// Close modal
export function closeEventModal() {
    document.getElementById('event-modal')?.classList.add('hidden-section');
    currentEditingEventId = null;
    isEditMode = false;

    // Stop comments listener
    stopCommentsListener();
}

// Toggle edit mode
export function toggleEventEditMode() {
    if (!currentEditingEventId) return;

    const event = getEventById(currentEditingEventId);
    if (!event) return;

    isEditMode = true;

    // Populate edit form
    document.getElementById('edit-evt-title').value = event.title || '';
    document.getElementById('edit-evt-date').value = event.date || '';
    document.getElementById('edit-evt-time').value = event.time || '';
    document.getElementById('edit-evt-all-day').checked = event.isAllDay || false;
    document.getElementById('edit-evt-is-public').checked = event.isPublic || false;
    document.getElementById('edit-evt-type').value = event.announcementType || 'normal';
    document.getElementById('edit-evt-pinned').checked = event.pinned || false;

    // Toggle time field visibility based on all-day setting
    const timeContainer = document.getElementById('edit-time-field-container');
    if (timeContainer) {
        timeContainer.style.display = event.isAllDay ? 'none' : 'block';
    }

    // Initialize tag selector with existing tags
    setSelectedTags(event.tags || []);
    renderTagSelector('edit-event-tags-container', event.tags || []);

    // Clear file input to prevent re-uploading
    const fileInput = document.getElementById('edit-evt-file');
    if (fileInput) {
        fileInput.value = '';
    }

    // Reset attachments to delete list
    attachmentsToDelete = [];

    // Show existing attachments with delete buttons
    const attachmentsList = document.getElementById('edit-attachments-list');
    if (attachmentsList) {
        if (event.attachments && event.attachments.length > 0) {
            attachmentsList.innerHTML = `
                <div style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72; margin-bottom: 4px;">現有附件：</div>
                ${event.attachments.map((att, index) => `
                    <div id="attachment-item-${index}" style="background: #e8f5e9; padding: 6px 10px; border-radius: 6px; font-family: 'VT323', monospace; font-size: 16px; color: #2e7d32; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
                            <span>✅</span>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${att.name}</span>
                        </div>
                        <button type="button" onclick="markAttachmentForDeletion(${index}, '${att.name}')" 
                            style="background: #e17055; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-family: 'VT323', monospace; font-size: 14px; cursor: pointer; flex-shrink: 0;"
                            title="刪除此附件">
                            🗑️ 刪除
                        </button>
                    </div>
                `).join('')}
            `;
        } else {
            attachmentsList.innerHTML = '';
        }
    }

    // Initialize edit targets with current event targets
    editSelectedTargets = event.targets ? [...event.targets] : [];
    renderEditTargetsList();
    renderEditSelectedTargets();

    // Switch UI
    document.getElementById('event-view-mode').classList.add('hidden-section');
    document.getElementById('event-edit-mode').classList.remove('hidden-section');
    document.getElementById('btn-edit-event').classList.add('hidden-section');
    document.getElementById('btn-delete-event').classList.add('hidden-section');
    document.getElementById('btn-save-event').classList.remove('hidden-section');
    document.getElementById('btn-cancel-edit').classList.remove('hidden-section');

    document.getElementById('event-modal-title').innerText = '✏️ 編輯行程';
}

// Cancel edit mode
export function cancelEventEdit() {
    isEditMode = false;

    document.getElementById('event-view-mode').classList.remove('hidden-section');
    document.getElementById('event-edit-mode').classList.add('hidden-section');
    document.getElementById('btn-edit-event').classList.remove('hidden-section');
    document.getElementById('btn-delete-event').classList.remove('hidden-section');
    document.getElementById('btn-save-event').classList.add('hidden-section');
    document.getElementById('btn-cancel-edit').classList.add('hidden-section');

    document.getElementById('event-modal-title').innerText = '📅 行程詳情';
}

// Save edited event
export async function saveEventEdit() {
    if (!currentEditingEventId) return;

    const event = getEventById(currentEditingEventId);
    let currentAttachments = event?.attachments || [];

    // Remove attachments marked for deletion
    if (attachmentsToDelete.length > 0) {
        currentAttachments = currentAttachments.filter((_, index) => !attachmentsToDelete.includes(index));
        console.log('[EventModal] Removed', attachmentsToDelete.length, 'attachments');
    }

    const isAllDay = document.getElementById('edit-evt-all-day')?.checked || false;

    const data = {
        title: document.getElementById('edit-evt-title').value,
        date: document.getElementById('edit-evt-date').value,
        time: isAllDay ? '' : document.getElementById('edit-evt-time').value,
        isAllDay: isAllDay,
        isPublic: document.getElementById('edit-evt-is-public').checked,
        announcementType: document.getElementById('edit-evt-type').value,
        pinned: document.getElementById('edit-evt-pinned').checked,
        tags: getSelectedTags(),
        attachments: currentAttachments,
        targets: editSelectedTargets // Include edited targets
    };

    // Handle file upload if selected
    const fileInput = document.getElementById('edit-evt-file');
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (window.uploadAttachment) {
            const attachment = await window.uploadAttachment(file, currentEditingEventId);
            if (attachment) {
                // Add new attachment to the list
                data.attachments = [...data.attachments, attachment];
            }
        }
    }

    const success = await updateEvent(currentEditingEventId, data);
    if (success) {
        attachmentsToDelete = []; // Reset
        closeEventModal();
    }
}

// Confirm and delete event
export function confirmDeleteEvent() {
    showConfirm('確定要刪除這個行程嗎？此操作無法復原。', async () => {
        const success = await deleteEvent(currentEditingEventId);
        if (success) {
            closeEventModal();
        }
    });
}

// Export to window for onclick handlers
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.toggleEventEditMode = toggleEventEditMode;
window.cancelEventEdit = cancelEventEdit;
window.saveEventEdit = saveEventEdit;
window.confirmDeleteEvent = confirmDeleteEvent;

// Toggle time field visibility in edit mode when all-day is checked
window.toggleEditAllDay = function () {
    const allDay = document.getElementById('edit-evt-all-day')?.checked;
    const timeContainer = document.getElementById('edit-time-field-container');
    if (timeContainer) {
        timeContainer.style.display = allDay ? 'none' : 'block';
        if (allDay) document.getElementById('edit-evt-time').value = '';
    }
};

// Mark attachment for deletion
window.markAttachmentForDeletion = function (index, name) {
    if (!attachmentsToDelete.includes(index)) {
        attachmentsToDelete.push(index);

        // Update UI to show deleted state
        const item = document.getElementById(`attachment-item-${index}`);
        if (item) {
            item.style.background = '#ffebee';
            item.style.color = '#c62828';
            item.style.textDecoration = 'line-through';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
                    <span>❌</span>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
                </div>
                <button type="button" onclick="undoAttachmentDeletion(${index}, '${name}')" 
                    style="background: #00b894; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-family: 'VT323', monospace; font-size: 14px; cursor: pointer; flex-shrink: 0;"
                    title="復原此附件">
                    ↩️ 復原
                </button>
            `;
        }

        console.log('[EventModal] Marked for deletion:', name);
    }
};

// Undo attachment deletion
window.undoAttachmentDeletion = function (index, name) {
    const idx = attachmentsToDelete.indexOf(index);
    if (idx > -1) {
        attachmentsToDelete.splice(idx, 1);

        // Update UI to show restored state
        const item = document.getElementById(`attachment-item-${index}`);
        if (item) {
            item.style.background = '#e8f5e9';
            item.style.color = '#2e7d32';
            item.style.textDecoration = 'none';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
                    <span>✅</span>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span>
                </div>
                <button type="button" onclick="markAttachmentForDeletion(${index}, '${name}')" 
                    style="background: #e17055; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-family: 'VT323', monospace; font-size: 14px; cursor: pointer; flex-shrink: 0;"
                    title="刪除此附件">
                    🗑️ 刪除
                </button>
            `;
        }

        console.log('[EventModal] Restored:', name);
    }
};

// ============================================
// Edit Mode Target Selection Functions
// ============================================

// Render the user list for target selection in edit mode
function renderEditTargetsList() {
    const container = document.getElementById('edit-target-list');
    if (!container) return;

    const users = globalUsers();
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm p-2">沒有可選擇的人員</div>';
        return;
    }

    container.innerHTML = users.map(user => {
        const isSelected = editSelectedTargets.includes(user.id);
        const bgColor = isSelected ? '#e0e7ff' : '#f9fafb';
        const borderColor = isSelected ? '#6c5ce7' : '#e5e7eb';
        return `
            <div onclick="toggleEditTarget('${user.id}')" 
                class="edit-target-item cursor-pointer p-2 rounded border-2 mb-1 flex items-center gap-2 transition-all"
                style="background: ${bgColor}; border-color: ${borderColor}; font-family: 'VT323', monospace; font-size: 16px;">
                <span style="font-size: 18px;">${isSelected ? '✅' : '⬜'}</span>
                <span>${user.name}</span>
                <span style="font-size: 14px; color: #888;">(${user.department || '--'})</span>
            </div>
        `;
    }).join('');
}

// Render selected targets chips in edit mode
function renderEditSelectedTargets() {
    const container = document.getElementById('edit-selected-targets');
    if (!container) return;

    const users = globalUsers();

    if (editSelectedTargets.length === 0) {
        container.innerHTML = '<span class="text-gray-400">尚未選擇人員...</span>';
        return;
    }

    container.innerHTML = editSelectedTargets.map(uid => {
        const user = users.find(u => u.id === uid);
        return `
            <span onclick="toggleEditTarget('${uid}')" 
                style="background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%); color: white; padding: 4px 12px; border-radius: 20px; font-family: 'VT323', monospace; font-size: 16px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                ${user ? user.name : '未知'}
                <span style="font-size: 14px;">❌</span>
            </span>
        `;
    }).join('');
}

// Toggle target selection in edit mode
window.toggleEditTarget = function (userId) {
    const index = editSelectedTargets.indexOf(userId);
    if (index > -1) {
        editSelectedTargets.splice(index, 1);
    } else {
        editSelectedTargets.push(userId);
    }
    renderEditTargetsList();
    renderEditSelectedTargets();
};

// Select all targets in edit mode
window.editSelectAllTargets = function () {
    const users = globalUsers();
    editSelectedTargets = users.map(u => u.id);
    renderEditTargetsList();
    renderEditSelectedTargets();
    console.log('[EventModal] Selected all', editSelectedTargets.length, 'targets');
};

// Clear all targets in edit mode
window.editClearAllTargets = function () {
    editSelectedTargets = [];
    renderEditTargetsList();
    renderEditSelectedTargets();
    console.log('[EventModal] Cleared all targets');
};
