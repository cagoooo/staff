// Comments Module - Event Discussion & @Mentions
import { db, appId } from './firebase-config.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';
import { getAppCurrentUser, globalUsers } from './firestore.js';

// Current event comments
let _currentEventComments = [];
let _commentsUnsubscribe = null;
let _currentCommentEventId = null;

// Initialize comments module
export function initComments() {
    console.log('[Comments] Initializing...');
    console.log('[Comments] Module initialized');
}

// Start listening to comments for an event
export function startCommentsListener(eventId) {
    if (_commentsUnsubscribe) {
        _commentsUnsubscribe();
    }

    _currentCommentEventId = eventId;
    _currentEventComments = [];

    const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    _commentsUnsubscribe = onSnapshot(q, (snapshot) => {
        _currentEventComments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log('[Comments] Loaded', _currentEventComments.length, 'comments for event:', eventId);
        renderCommentsSection();
    }, (error) => {
        console.error('[Comments] Listener error:', error);
    });
}

// Stop listening to comments
export function stopCommentsListener() {
    if (_commentsUnsubscribe) {
        _commentsUnsubscribe();
        _commentsUnsubscribe = null;
    }
    _currentEventComments = [];
    _currentCommentEventId = null;
}

// Add a new comment
export async function addComment(eventId, content) {
    const user = getAppCurrentUser();
    if (!user) {
        showAlert('請先登入');
        return null;
    }

    if (!content.trim()) {
        showAlert('請輸入評論內容');
        return null;
    }

    // Extract @mentions
    const mentions = extractMentions(content);

    try {
        const commentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId, 'comments');
        const docRef = await addDoc(commentsRef, {
            content: content.trim(),
            authorId: user.id,
            authorName: user.name,
            mentions,
            createdAt: new Date().toISOString(),
            editedAt: null
        });

        console.log('[Comments] Added comment:', docRef.id);

        // Notify mentioned users
        if (mentions.length > 0) {
            notifyMentionedUsers(eventId, mentions, content, user.name);
        }

        return docRef.id;
    } catch (err) {
        console.error('[Comments] Add failed:', err);
        showAlert('新增評論失敗：' + err.message);
        return null;
    }
}

// Edit a comment
export async function editComment(eventId, commentId, newContent) {
    const user = getAppCurrentUser();
    const comment = _currentEventComments.find(c => c.id === commentId);

    if (!comment || comment.authorId !== user?.id) {
        showAlert('您只能編輯自己的評論');
        return false;
    }

    try {
        const commentRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId, 'comments', commentId);
        await updateDoc(commentRef, {
            content: newContent.trim(),
            mentions: extractMentions(newContent),
            editedAt: new Date().toISOString()
        });

        console.log('[Comments] Edited comment:', commentId);
        return true;
    } catch (err) {
        console.error('[Comments] Edit failed:', err);
        showAlert('編輯評論失敗：' + err.message);
        return false;
    }
}

// Delete a comment
export async function deleteComment(eventId, commentId) {
    const user = getAppCurrentUser();
    const comment = _currentEventComments.find(c => c.id === commentId);

    if (!comment || (comment.authorId !== user?.id && user?.role !== 'admin')) {
        showAlert('您只能刪除自己的評論');
        return false;
    }

    try {
        const commentRef = doc(db, 'artifacts', appId, 'public', 'data', 'school_events', eventId, 'comments', commentId);
        await deleteDoc(commentRef);

        console.log('[Comments] Deleted comment:', commentId);
        return true;
    } catch (err) {
        console.error('[Comments] Delete failed:', err);
        showAlert('刪除評論失敗：' + err.message);
        return false;
    }
}

// Extract @mentions from content
function extractMentions(content) {
    const users = globalUsers();
    const mentions = [];

    // Match @username patterns
    const mentionRegex = /@(\S+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        const mentionName = match[1];

        // Check for @all
        if (mentionName === '全體' || mentionName === 'all') {
            return users.map(u => u.id); // Return all user IDs
        }

        // Find matching user
        const user = users.find(u =>
            u.name === mentionName ||
            u.username === mentionName ||
            u.name.includes(mentionName)
        );

        if (user && !mentions.includes(user.id)) {
            mentions.push(user.id);
        }
    }

    return mentions;
}

// Notify mentioned users (browser notification)
function notifyMentionedUsers(eventId, mentionedUserIds, content, authorName) {
    const currentUser = getAppCurrentUser();

    // Only notify if browser notifications are enabled
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }

    // Don't self-notify
    mentionedUserIds = mentionedUserIds.filter(id => id !== currentUser?.id);

    if (mentionedUserIds.length > 0) {
        console.log('[Comments] Would notify users:', mentionedUserIds);
        // Note: Browser notifications only work for the current user
        // For other users, they would see the mention when they open the event
    }
}

// Render comments section in the event modal
export function renderCommentsSection() {
    const container = document.getElementById('event-comments-section');
    if (!container) return;

    const user = getAppCurrentUser();
    const users = globalUsers();

    container.innerHTML = `
        <div class="mt-4 pt-4 border-t-2 border-gray-200">
            <h4 style="font-family: 'VT323', monospace; font-size: 20px; margin-bottom: 12px;">
                💬 評論 (${_currentEventComments.length})
            </h4>
            
            <!-- Comment Input -->
            <div class="mb-4">
                <div style="position: relative;">
                    <textarea id="comment-input" class="pixel-input" 
                        placeholder="輸入評論... (輸入 @ 可提及其他人)"
                        style="width: 100%; min-height: 60px; resize: vertical; font-size: 16px;"></textarea>
                    <div id="mention-suggestions" class="hidden-section"
                        style="position: absolute; bottom: 100%; left: 0; right: 0; background: white; border: 2px solid #2d3436; max-height: 150px; overflow-y: auto; z-index: 100;">
                    </div>
                </div>
                <button onclick="submitComment()" class="pixel-btn pixel-btn-success mt-2" style="padding: 6px 16px;">
                    📤 發送
                </button>
            </div>
            
            <!-- Comments List -->
            <div id="comments-list" class="space-y-3">
                ${_currentEventComments.length === 0 ?
            '<p class="text-gray-400 text-center py-4" style="font-family: \'VT323\', monospace;">還沒有評論，來說點什麼吧！</p>' :
            _currentEventComments.map(comment => renderComment(comment, user, users)).join('')
        }
            </div>
        </div>
    `;

    // Setup mention autocomplete
    setupMentionAutocomplete();
}

// Render a single comment
function renderComment(comment, currentUser, users) {
    const isOwner = comment.authorId === currentUser?.id;
    const isAdmin = currentUser?.role === 'admin';
    const canEdit = isOwner;
    const canDelete = isOwner || isAdmin;

    const createdDate = new Date(comment.createdAt);
    const timeStr = createdDate.toLocaleDateString('zh-TW') + ' ' + createdDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const editedTag = comment.editedAt ? ' (已編輯)' : '';

    // Highlight mentions in content
    let displayContent = escapeHtml(comment.content);
    displayContent = displayContent.replace(/@(\S+)/g, '<span style="color: #6c5ce7; font-weight: bold;">@$1</span>');

    return `
        <div class="comment-item p-3 bg-gray-50 border-l-4" style="border-color: ${isOwner ? '#6c5ce7' : '#dfe6e9'}; font-family: 'VT323', monospace;">
            <div class="flex justify-between items-start">
                <div>
                    <span style="font-size: 18px; font-weight: bold; color: #2d3436;">${escapeHtml(comment.authorName)}</span>
                    <span style="font-size: 14px; color: #636e72; margin-left: 8px;">${timeStr}${editedTag}</span>
                </div>
                ${(canEdit || canDelete) ? `
                    <div class="flex gap-2">
                        ${canEdit ? `<button onclick="editCommentPrompt('${comment.id}')" style="font-size: 14px; cursor: pointer; background: none; border: none; color: #0984e3;">✏️</button>` : ''}
                        ${canDelete ? `<button onclick="deleteCommentConfirm('${comment.id}')" style="font-size: 14px; cursor: pointer; background: none; border: none; color: #e17055;">🗑️</button>` : ''}
                    </div>
                ` : ''}
            </div>
            <p style="font-size: 18px; margin-top: 8px; line-height: 1.4;">${displayContent}</p>
        </div>
    `;
}

// Setup mention autocomplete
function setupMentionAutocomplete() {
    const input = document.getElementById('comment-input');
    const suggestions = document.getElementById('mention-suggestions');
    if (!input || !suggestions) return;

    input.addEventListener('input', (e) => {
        // 每次輸入時動態獲取最新的用戶列表
        const users = globalUsers();

        const text = e.target.value;
        const cursorPos = e.target.selectionStart;

        // Find if we're typing a mention
        const beforeCursor = text.substring(0, cursorPos);
        const mentionMatch = beforeCursor.match(/@(\S*)$/);

        if (mentionMatch) {
            const searchTerm = mentionMatch[1].toLowerCase();
            const filtered = users.filter(u =>
                u.name && (
                    u.name.toLowerCase().includes(searchTerm) ||
                    (u.username && u.username.toLowerCase().includes(searchTerm))
                )
            ).slice(0, 10); // 增加顯示數量到 10 個

            if (filtered.length > 0 || searchTerm === '') {
                suggestions.classList.remove('hidden-section');
                suggestions.innerHTML = `
                    <div onclick="insertMention('全體')" 
                        style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 16px;"
                        onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                        <span style="font-size: 18px;">📢</span> @全體
                    </div>
                    ${filtered.map(u => `
                        <div onclick="insertMention('${u.name}')" 
                            style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 16px;"
                            onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                            <span style="width: 24px; height: 24px; border-radius: 50%; background: #6c5ce7; color: white; display: flex; align-items: center; justify-content: center; font-size: 14px;">${u.name.charAt(0)}</span>
                            ${u.name} <span style="color: #636e72; font-size: 14px;">(${u.jobTitle || ''})</span>
                        </div>
                    `).join('')}
                `;
            } else {
                suggestions.classList.add('hidden-section');
            }
        } else {
            suggestions.classList.add('hidden-section');
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => suggestions.classList.add('hidden-section'), 200);
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Window exports for inline handlers
window.submitComment = async function () {
    if (!_currentCommentEventId) return;

    const input = document.getElementById('comment-input');
    if (!input) return;

    const content = input.value;
    const result = await addComment(_currentCommentEventId, content);

    if (result) {
        input.value = '';
    }
};

window.insertMention = function (name) {
    const input = document.getElementById('comment-input');
    if (!input) return;

    const text = input.value;
    const cursorPos = input.selectionStart;
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);

    // Replace the @partial with @fullname
    const newBefore = beforeCursor.replace(/@\S*$/, '@' + name + ' ');
    input.value = newBefore + afterCursor;
    input.focus();
    input.setSelectionRange(newBefore.length, newBefore.length);

    document.getElementById('mention-suggestions')?.classList.add('hidden-section');
};

window.editCommentPrompt = function (commentId) {
    const comment = _currentEventComments.find(c => c.id === commentId);
    if (!comment) {
        showAlert('找不到評論');
        return;
    }

    // 創建編輯 Modal
    const modal = document.createElement('div');
    modal.id = 'edit-comment-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px;';

    modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 100%; max-width: 450px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
            <div style="padding: 16px; border-bottom: 2px solid #dfe6e9;">
                <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin: 0; color: #2d3436;">✏️ 編輯評論</h3>
            </div>
            <div style="padding: 16px;">
                <textarea id="edit-comment-content" class="pixel-input" 
                    style="width: 100%; min-height: 100px; resize: vertical; font-size: 16px; font-family: 'VT323', monospace;">${comment.content.replace(/"/g, '&quot;')}</textarea>
            </div>
            <div style="padding: 16px; border-top: 2px solid #dfe6e9; display: flex; gap: 12px; justify-content: flex-end;">
                <button onclick="closeEditCommentModal()" class="pixel-btn pixel-btn-secondary" style="padding: 8px 20px;">
                    取消
                </button>
                <button onclick="saveEditComment('${commentId}')" class="pixel-btn pixel-btn-success" style="padding: 8px 20px;">
                    💾 儲存
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 聚焦到文字框並移動游標到最後
    setTimeout(() => {
        const textarea = document.getElementById('edit-comment-content');
        if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
    }, 100);
};

window.closeEditCommentModal = function () {
    const modal = document.getElementById('edit-comment-modal');
    if (modal) modal.remove();
};

window.saveEditComment = async function (commentId) {
    const textarea = document.getElementById('edit-comment-content');
    if (!textarea) return;

    const newContent = textarea.value.trim();
    if (!newContent) {
        showAlert('評論內容不能為空');
        return;
    }

    const success = await editComment(_currentCommentEventId, commentId, newContent);
    if (success) {
        closeEditCommentModal();
        showAlert('評論已更新！');
    }
};

window.deleteCommentConfirm = function (commentId) {
    showConfirm('確定要刪除這則評論嗎？', async () => {
        const success = await deleteComment(_currentCommentEventId, commentId);
        if (success) {
            showAlert('評論已刪除！');
        }
    });
};

export { _currentEventComments as currentEventComments };
