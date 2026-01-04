// Event Modal Module - For viewing, editing, and deleting events
import { globalUsers, getAppCurrentUser, updateEvent, deleteEvent, getEventById } from './firestore.js';
import { showConfirm } from '../components/modal.js';
import { renderTagSelector, setSelectedTags, getSelectedTags, renderTagBadges, getAllTags } from './tags.js';
import { startCommentsListener, stopCommentsListener, renderCommentsSection } from './comments.js';
import { renderReminderSettings } from './reminders.js';

let currentEditingEventId = null;
let isEditMode = false;
let attachmentsToDelete = []; // Track attachments to delete

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
                        <div>
                            <label class="pixel-label">時間</label>
                            <input type="time" id="edit-evt-time" required class="pixel-input">
                        </div>
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
    document.getElementById('event-detail-title').innerText = event.title || '';
    document.getElementById('event-detail-date').innerText = event.date || '';
    document.getElementById('event-detail-time').innerText = event.time || '--:--';
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

    // Status
    const currentUser = getAppCurrentUser();
    const completed = event.completedBy?.includes(currentUser?.id);
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

    // Show/hide edit button based on ownership
    const isOwner = event.authorId === currentUser?.id;
    document.getElementById('btn-edit-event').style.display = isOwner ? 'block' : 'none';
    document.getElementById('btn-delete-event').style.display = isOwner ? 'block' : 'none';

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
    document.getElementById('edit-evt-is-public').checked = event.isPublic || false;
    document.getElementById('edit-evt-type').value = event.announcementType || 'normal';
    document.getElementById('edit-evt-pinned').checked = event.pinned || false;

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

    const data = {
        title: document.getElementById('edit-evt-title').value,
        date: document.getElementById('edit-evt-date').value,
        time: document.getElementById('edit-evt-time').value,
        isPublic: document.getElementById('edit-evt-is-public').checked,
        announcementType: document.getElementById('edit-evt-type').value,
        pinned: document.getElementById('edit-evt-pinned').checked,
        tags: getSelectedTags(),
        attachments: currentAttachments
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
