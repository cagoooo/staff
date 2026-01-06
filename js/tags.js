// Tags Module - Tag Management for Events
import { db, appId } from './firebase-config.js';
import { collection, doc, getDocs, addDoc, deleteDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';
import { getAppCurrentUser } from './firestore.js';

// Global tags list
let _globalTags = [];
let _tagsUnsubscribe = null;

// Predefined tag colors
const TAG_COLORS = [
    '#6c5ce7', // Purple
    '#00b894', // Green
    '#e17055', // Orange
    '#0984e3', // Blue
    '#fd79a8', // Pink
    '#fdcb6e', // Yellow
    '#d63031', // Red
    '#00cec9', // Cyan
    '#636e72', // Gray
    '#2d3436'  // Dark
];

// Get tags collection reference
function getTagsRef() {
    return collection(db, 'artifacts', appId, 'public', 'data', 'tags');
}

// Initialize tags module
export function initTags() {
    console.log('[Tags] Initializing...');
    startTagsListener();
    console.log('[Tags] Module initialized');
}

// Start real-time tags listener
function startTagsListener() {
    if (_tagsUnsubscribe) _tagsUnsubscribe();

    const tagsRef = getTagsRef();
    _tagsUnsubscribe = onSnapshot(tagsRef, (snapshot) => {
        _globalTags = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log('[Tags] Loaded', _globalTags.length, 'tags');

        // Trigger UI update if needed
        if (window.renderTagFilters) window.renderTagFilters();
    }, (error) => {
        console.error('[Tags] Listener error:', error);
    });
}

// Get all tags
export function getAllTags() {
    return _globalTags;
}

// Add new tag
export async function addTag(name, color = null) {
    const user = getAppCurrentUser();
    if (!user) {
        showAlert('請先登入');
        return null;
    }

    // Check if tag already exists
    const existing = _globalTags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        showAlert('標籤已存在');
        return existing;
    }

    // Auto-assign color if not provided
    if (!color) {
        const usedColors = _globalTags.map(t => t.color);
        color = TAG_COLORS.find(c => !usedColors.includes(c)) || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    }

    try {
        const tagsRef = getTagsRef();
        const docRef = await addDoc(tagsRef, {
            name,
            color,
            createdBy: user.id,
            createdAt: new Date().toISOString()
        });
        console.log('[Tags] Added tag:', name);
        return { id: docRef.id, name, color };
    } catch (err) {
        console.error('[Tags] Add failed:', err);
        showAlert('新增標籤失敗：' + err.message);
        return null;
    }
}

// Delete tag (admin only)
export async function deleteTag(tagId) {
    const user = getAppCurrentUser();
    if (!user || user.role !== 'admin') {
        showAlert('只有管理員可以刪除標籤');
        return false;
    }

    try {
        const tagRef = doc(db, 'artifacts', appId, 'public', 'data', 'tags', tagId);
        await deleteDoc(tagRef);
        console.log('[Tags] Deleted tag:', tagId);
        return true;
    } catch (err) {
        console.error('[Tags] Delete failed:', err);
        showAlert('刪除標籤失敗：' + err.message);
        return false;
    }
}

// Update tag
export async function updateTag(tagId, data) {
    const user = getAppCurrentUser();
    if (!user || user.role !== 'admin') {
        showAlert('只有管理員可以編輯標籤');
        return false;
    }

    try {
        const tagRef = doc(db, 'artifacts', appId, 'public', 'data', 'tags', tagId);
        await updateDoc(tagRef, data);
        console.log('[Tags] Updated tag:', tagId);
        return true;
    } catch (err) {
        console.error('[Tags] Update failed:', err);
        showAlert('更新標籤失敗：' + err.message);
        return false;
    }
}

// Render tag selector for event editing
export function renderTagSelector(containerId, selectedTags = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tags = getAllTags();

    container.innerHTML = `
        <div class="tag-selector">
            <div class="selected-tags mb-2" id="selected-tags-display">
                ${selectedTags.map(tagName => {
        const tag = tags.find(t => t.name === tagName);
        const color = tag?.color || '#636e72';
        return `
                        <span class="tag-badge" style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; margin-right: 4px; display: inline-flex; align-items: center; font-size: 14px;">
                            ${tagName}
                            <button type="button" onclick="removeTagFromSelection('${tagName}')" style="background: none; border: none; color: white; margin-left: 4px; cursor: pointer;">×</button>
                        </span>
                    `;
    }).join('')}
            </div>
            <div class="tag-dropdown">
                <input type="text" id="tag-search-input" class="pixel-input" placeholder="搜尋或新增標籤..." style="font-size: 14px; padding: 6px;">
                <div id="tag-dropdown-list" class="hidden-section" style="position: absolute; background: white; border: 2px solid #2d3436; max-height: 200px; overflow-y: auto; z-index: 100; width: 100%;">
                    ${tags.map(tag => `
                        <div class="tag-option" data-tag-id="${tag.id}" style="padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px;"
                            onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                            <div onclick="addTagToSelection('${tag.name}')" style="flex: 1; display: flex; align-items: center; gap: 8px;">
                                <span onclick="event.stopPropagation(); showTagColorPicker('${tag.id}', '${tag.color}')" 
                                    style="width: 16px; height: 16px; border-radius: 50%; background: ${tag.color}; cursor: pointer; border: 2px solid white; box-shadow: 0 0 0 1px #ccc;" 
                                    title="點擊更換顏色"></span>
                                ${tag.name}
                            </div>
                            <button type="button" onclick="event.stopPropagation(); confirmDeleteTag('${tag.id}', '${tag.name}')" 
                                style="background: none; border: none; color: #d63031; cursor: pointer; padding: 2px 6px; font-size: 12px;"
                                title="刪除此標籤">🗑️</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Setup search functionality
    const input = container.querySelector('#tag-search-input');
    const dropdown = container.querySelector('#tag-dropdown-list');

    input.addEventListener('focus', () => {
        dropdown.classList.remove('hidden-section');
    });

    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.add('hidden-section'), 200);
    });

    input.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const filtered = tags.filter(t => t.name.toLowerCase().includes(search));

        dropdown.innerHTML = filtered.map(tag => `
            <div class="tag-option" style="padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px;"
                onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                <div onclick="addTagToSelection('${tag.name}')" style="flex: 1; display: flex; align-items: center; gap: 8px;">
                    <span style="width: 12px; height: 12px; border-radius: 50%; background: ${tag.color};"></span>
                    ${tag.name}
                </div>
                <button type="button" onclick="event.stopPropagation(); confirmDeleteTag('${tag.id}', '${tag.name}')" 
                    style="background: none; border: none; color: #d63031; cursor: pointer; padding: 2px 6px; font-size: 12px;"
                    title="刪除此標籤">🗑️</button>
            </div>
        `).join('');

        // Add "create new" option if search doesn't match
        if (search && !tags.some(t => t.name.toLowerCase() === search)) {
            dropdown.innerHTML += `
                <div class="tag-option" onclick="showNewTagColorPicker('${e.target.value.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" 
                    style="padding: 8px; cursor: pointer; color: #00b894; font-weight: bold;"
                    onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                    ➕ 新增「${e.target.value}」(點擊選擇顏色)
                </div>
            `;
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            if (value) {
                createAndAddTag(value);
                input.value = '';
            }
        }
    });
}

// Get selected tags from the selector
export function getSelectedTags() {
    return window._selectedEventTags || [];
}

// Set selected tags
export function setSelectedTags(tags) {
    window._selectedEventTags = tags || [];
}

// Render tag filter buttons in UI
export function renderTagFilters(containerId = 'tag-filters') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tags = getAllTags();
    const activeFilter = window._activeTagFilter || null;

    container.innerHTML = `
        <button onclick="filterByTag(null)" class="pixel-btn" 
            style="padding: 4px 12px; font-size: 14px; margin: 2px; ${!activeFilter ? 'background: #2d3436;' : 'background: #636e72;'}">
            全部
        </button>
        ${tags.map(tag => `
            <button onclick="filterByTag('${tag.name}')" class="pixel-btn" 
                style="padding: 4px 12px; font-size: 14px; margin: 2px; background: ${activeFilter === tag.name ? tag.color : '#636e72'};">
                🏷️ ${tag.name}
            </button>
        `).join('')}
    `;
}

// Filter events by tag
export function filterByTag(tagName) {
    window._activeTagFilter = tagName;
    console.log('[Tags] Filtering by:', tagName || 'all');

    // Re-render the UI with filter
    if (window.renderEvents) {
        window.renderEvents();
    }

    // Update filter buttons
    renderTagFilters();
}

// Check if event matches current filter
export function eventMatchesTagFilter(event) {
    const filter = window._activeTagFilter;
    if (!filter) return true;

    return event.tags && event.tags.includes(filter);
}

// Render tag badges for an event
export function renderTagBadges(tags = []) {
    if (!tags || tags.length === 0) return '';

    const allTags = getAllTags();

    return tags.map(tagName => {
        const tag = allTags.find(t => t.name === tagName);
        const color = tag?.color || '#636e72';
        return `<span style="background: ${color}; color: white; padding: 1px 6px; border-radius: 3px; font-size: 12px; margin-right: 3px;">${tagName}</span>`;
    }).join('');
}

// Window exports for inline event handlers
window._selectedEventTags = [];

window.addTagToSelection = function (tagName) {
    if (!window._selectedEventTags.includes(tagName)) {
        window._selectedEventTags.push(tagName);
        updateSelectedTagsDisplay();
    }
};

window.removeTagFromSelection = function (tagName) {
    window._selectedEventTags = window._selectedEventTags.filter(t => t !== tagName);
    updateSelectedTagsDisplay();
};

window.createAndAddTag = async function (tagName) {
    const newTag = await addTag(tagName);
    if (newTag) {
        // Immediately add to local cache if not already there (for instant UI update)
        if (!_globalTags.find(t => t.id === newTag.id)) {
            _globalTags.push(newTag);
        }
        window.addTagToSelection(newTag.name);
        // Force re-render the selected tags display with correct color
        updateSelectedTagsDisplay();
        document.getElementById('tag-search-input').value = '';

        // Also update the dropdown list to include the new tag
        const dropdown = document.getElementById('tag-dropdown-list');
        if (dropdown) {
            // Re-render dropdown with all tags including the new one
            const tags = getAllTags();
            dropdown.innerHTML = tags.map(tag => `
                <div class="tag-option" style="padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px;"
                    onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                    <div onclick="addTagToSelection('${tag.name}')" style="flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span style="width: 12px; height: 12px; border-radius: 50%; background: ${tag.color};"></span>
                        ${tag.name}
                    </div>
                    <button type="button" onclick="event.stopPropagation(); confirmDeleteTag('${tag.id}', '${tag.name}')" 
                        style="background: none; border: none; color: #d63031; cursor: pointer; padding: 2px 6px; font-size: 12px;"
                        title="刪除此標籤">🗑️</button>
                </div>
            `).join('');
        }
    }
};

window.filterByTag = filterByTag;
window.renderTagFilters = renderTagFilters;
window.setSelectedTags = setSelectedTags;

// Render tag selector for add event form
window.renderTagSelectorForAdd = function (containerId, selectedTags = []) {
    setSelectedTags(selectedTags);
    renderTagSelector(containerId, selectedTags);
};

function updateSelectedTagsDisplay() {
    const display = document.getElementById('selected-tags-display');
    if (!display) return;

    const tags = getAllTags();
    display.innerHTML = window._selectedEventTags.map(tagName => {
        const tag = tags.find(t => t.name === tagName);
        const color = tag?.color || '#636e72';
        return `
            <span class="tag-badge" style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; margin-right: 4px; display: inline-flex; align-items: center; font-size: 14px;">
                ${tagName}
                <button type="button" onclick="removeTagFromSelection('${tagName}')" style="background: none; border: none; color: white; margin-left: 4px; cursor: pointer;">×</button>
            </span>
        `;
    }).join('');
}

// 確認刪除標籤
window.confirmDeleteTag = function (tagId, tagName) {
    showConfirm(`確定要刪除標籤「${tagName}」嗎？\n此操作無法復原。`, async () => {
        const success = await deleteTag(tagId);
        if (success) {
            // 從已選標籤中移除
            window._selectedEventTags = window._selectedEventTags.filter(t => t !== tagName);
            updateSelectedTagsDisplay();

            // 直接從 DOM 移除該標籤選項 (透過 data-tag-id 屬性)
            document.querySelectorAll(`[data-tag-id="${tagId}"]`).forEach(el => el.remove());

            // 備用：透過 tag name 移除
            document.querySelectorAll('.tag-option').forEach(option => {
                const nameDiv = option.querySelector('div');
                if (nameDiv && nameDiv.textContent.trim() === tagName) {
                    option.remove();
                }
            });

            showAlert(`標籤「${tagName}」已刪除`);
        }
    });
};

// 將 renderTagSelector 導出到 window
window.renderTagSelector = renderTagSelector;

// ============================================
// 標籤顏色選擇器
// ============================================

/**
 * 顯示標籤顏色選擇器 (編輯現有標籤)
 */
window.showTagColorPicker = function (tagId, currentColor) {
    // 移除現有的顏色選擇器
    closeTagColorPicker();

    const tag = _globalTags.find(t => t.id === tagId);
    if (!tag) return;

    const pickerHtml = `
        <div id="tag-color-picker" style="
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; border-radius: 12px; padding: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000;
            min-width: 280px; font-family: 'VT323', monospace;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 20px;">🎨 選擇標籤顏色</h3>
                <button onclick="closeTagColorPicker()" style="background: none; border: none; font-size: 20px; cursor: pointer;">✕</button>
            </div>
            <p style="margin: 0 0 12px; color: #636e72;">標籤: ${tag.name}</p>
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px;">
                ${TAG_COLORS.map(color => `
                    <div onclick="updateTagColor('${tagId}', '${color}')" 
                        style="width: 40px; height: 40px; border-radius: 50%; background: ${color}; 
                        cursor: pointer; border: 3px solid ${color === currentColor ? '#2d3436' : 'transparent'};
                        transition: transform 0.2s;"
                        onmouseover="this.style.transform='scale(1.15)'" 
                        onmouseout="this.style.transform='scale(1)'">
                    </div>
                `).join('')}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="color: #636e72;">自訂:</label>
                <input type="color" id="custom-tag-color" value="${currentColor}" 
                    style="width: 60px; height: 36px; border: none; cursor: pointer;">
                <button onclick="updateTagColor('${tagId}', document.getElementById('custom-tag-color').value)"
                    style="background: #6c5ce7; color: white; border: none; border-radius: 8px; 
                    padding: 8px 16px; cursor: pointer; font-family: inherit;">
                    套用
                </button>
            </div>
        </div>
        <div id="tag-color-picker-overlay" onclick="closeTagColorPicker()" 
            style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
            background: rgba(0,0,0,0.4); z-index: 9999;"></div>
    `;

    document.body.insertAdjacentHTML('beforeend', pickerHtml);
};

/**
 * 顯示新增標籤的顏色選擇器
 */
window.showNewTagColorPicker = function (tagName) {
    // 移除現有的顏色選擇器
    closeTagColorPicker();

    // 自動選擇一個未使用的顏色
    const usedColors = _globalTags.map(t => t.color);
    const defaultColor = TAG_COLORS.find(c => !usedColors.includes(c)) || TAG_COLORS[0];

    const pickerHtml = `
        <div id="tag-color-picker" style="
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; border-radius: 12px; padding: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000;
            min-width: 280px; font-family: 'VT323', monospace;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 20px;">🏷️ 新增標籤</h3>
                <button onclick="closeTagColorPicker()" style="background: none; border: none; font-size: 20px; cursor: pointer;">✕</button>
            </div>
            <p style="margin: 0 0 12px; font-size: 18px; font-weight: bold;">「${tagName}」</p>
            <p style="margin: 0 0 12px; color: #636e72; font-size: 14px;">請選擇標籤顏色:</p>
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px;">
                ${TAG_COLORS.map((color, index) => `
                    <div onclick="createTagWithColor('${tagName.replace(/'/g, "\\'")}', '${color}')" 
                        style="width: 40px; height: 40px; border-radius: 50%; background: ${color}; 
                        cursor: pointer; border: 3px solid ${index === 0 ? '#2d3436' : 'transparent'};
                        transition: transform 0.2s;"
                        onmouseover="this.style.transform='scale(1.15)'" 
                        onmouseout="this.style.transform='scale(1)'">
                    </div>
                `).join('')}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="color: #636e72;">自訂:</label>
                <input type="color" id="custom-new-tag-color" value="${defaultColor}" 
                    style="width: 60px; height: 36px; border: none; cursor: pointer;">
                <button onclick="createTagWithColor('${tagName.replace(/'/g, "\\'")}', document.getElementById('custom-new-tag-color').value)"
                    style="background: #00b894; color: white; border: none; border-radius: 8px; 
                    padding: 8px 16px; cursor: pointer; font-family: inherit;">
                    建立標籤
                </button>
            </div>
        </div>
        <div id="tag-color-picker-overlay" onclick="closeTagColorPicker()" 
            style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
            background: rgba(0,0,0,0.4); z-index: 9999;"></div>
    `;

    document.body.insertAdjacentHTML('beforeend', pickerHtml);
};

/**
 * 關閉顏色選擇器
 */
window.closeTagColorPicker = function () {
    const picker = document.getElementById('tag-color-picker');
    const overlay = document.getElementById('tag-color-picker-overlay');
    if (picker) picker.remove();
    if (overlay) overlay.remove();
};

function closeTagColorPicker() {
    window.closeTagColorPicker();
}

/**
 * 更新標籤顏色
 */
window.updateTagColor = async function (tagId, newColor) {
    const success = await updateTag(tagId, { color: newColor });
    if (success) {
        // 更新本地快取
        const tag = _globalTags.find(t => t.id === tagId);
        if (tag) tag.color = newColor;

        // 更新顯示
        updateSelectedTagsDisplay();
        if (window.renderTagFilters) window.renderTagFilters();

        // 關閉選擇器
        closeTagColorPicker();

        // 重新渲染下拉選單
        const container = document.querySelector('.tag-selector');
        if (container) {
            const selectedTags = window._selectedEventTags || [];
            renderTagSelector('event-tags' in document.getElementById ? 'event-tags' : container.parentElement.id, selectedTags);
        }
    }
};

/**
 * 建立指定顏色的新標籤
 */
window.createTagWithColor = async function (tagName, color) {
    const newTag = await addTag(tagName, color);
    if (newTag) {
        // 立即加入本地快取
        if (!_globalTags.find(t => t.id === newTag.id)) {
            _globalTags.push(newTag);
        }

        // 加入選擇
        window.addTagToSelection(newTag.name);

        // 清空搜尋框
        const searchInput = document.getElementById('tag-search-input');
        if (searchInput) searchInput.value = '';

        // 關閉選擇器
        closeTagColorPicker();

        // 更新顯示
        updateSelectedTagsDisplay();
    }
};

// 導出 TAG_COLORS 供其他模組使用
export { TAG_COLORS };
