// Event Templates Module - 行程模板功能
import { db, appId } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAppCurrentUser } from './firestore.js';
import { showAlert, showConfirm } from '../components/modal.js';

let _templates = [];

/**
 * Get all templates
 */
export function getTemplates() {
    return _templates;
}

/**
 * Load templates from Firestore
 */
export async function loadTemplates() {
    try {
        const templatesRef = collection(db, 'artifacts', appId, 'public', 'data', 'event_templates');
        const snapshot = await getDocs(templatesRef);
        _templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('[Templates] Loaded:', _templates.length);
        return _templates;
    } catch (err) {
        console.error('[Templates] Load failed:', err);
        return [];
    }
}

/**
 * Save current event as template
 * @param {Object} eventData - Event data to save as template
 */
export async function saveAsTemplate(eventData) {
    const currentUser = getAppCurrentUser();
    if (!currentUser) {
        showAlert('請先登入');
        return null;
    }

    try {
        const templateData = {
            title: eventData.title,
            time: eventData.time,
            isMultiDay: eventData.isMultiDay || false,
            durationDays: eventData.durationDays || 1, // For multi-day events
            targets: eventData.targets || [],
            tags: eventData.tags || [],
            announcementType: eventData.announcementType || 'normal',
            pinned: eventData.pinned || false,
            isPublic: eventData.isPublic || false,
            lineNotifyEnabled: eventData.lineNotifyEnabled ?? true,
            createdBy: currentUser.id,
            createdByName: currentUser.name,
            createdAt: new Date().toISOString()
        };

        const templatesRef = collection(db, 'artifacts', appId, 'public', 'data', 'event_templates');
        const docRef = await addDoc(templatesRef, templateData);

        _templates.push({ id: docRef.id, ...templateData });
        console.log('[Templates] Saved:', docRef.id);
        showAlert('已儲存為模板！');

        return docRef.id;
    } catch (err) {
        console.error('[Templates] Save failed:', err);
        showAlert('儲存模板失敗：' + err.message);
        return null;
    }
}

/**
 * Delete a template
 * @param {string} templateId - Template ID to delete
 */
export async function deleteTemplate(templateId) {
    showConfirm('確定要刪除此模板嗎？', async () => {
        try {
            const templateRef = doc(db, 'artifacts', appId, 'public', 'data', 'event_templates', templateId);
            await deleteDoc(templateRef);
            _templates = _templates.filter(t => t.id !== templateId);
            showAlert('模板已刪除');
            renderTemplateList();
        } catch (err) {
            console.error('[Templates] Delete failed:', err);
            showAlert('刪除失敗：' + err.message);
        }
    });
}

/**
 * Apply template to the event form
 * @param {string} templateId - Template ID to apply
 */
export function applyTemplate(templateId) {
    const template = _templates.find(t => t.id === templateId);
    if (!template) return;

    // Fill in form fields
    const titleInput = document.getElementById('evt-title');
    const timeInput = document.getElementById('evt-time');
    const multiDayCheckbox = document.getElementById('evt-multi-day');
    const publicCheckbox = document.getElementById('evt-is-public');
    const lineNotifyCheckbox = document.getElementById('evt-line-notify');

    if (titleInput) titleInput.value = template.title || '';
    if (timeInput) timeInput.value = template.time || '';
    if (multiDayCheckbox && template.isMultiDay) {
        multiDayCheckbox.checked = true;
        toggleEndDate();
    }
    if (publicCheckbox) publicCheckbox.checked = template.isPublic || false;
    if (lineNotifyCheckbox) lineNotifyCheckbox.checked = template.lineNotifyEnabled ?? true;

    // Select targets
    if (template.targets && template.targets.length > 0 && window.setCurrentSelectedTargets) {
        window.setCurrentSelectedTargets(template.targets);
        if (window.renderEditorOptions) window.renderEditorOptions();
    }

    // Hide template selector
    const selector = document.getElementById('template-selector');
    if (selector) selector.classList.add('hidden-section');

    showAlert(`已套用模板「${template.title}」`);
}

/**
 * Render template list in the editor
 */
export function renderTemplateList() {
    const container = document.getElementById('template-list');
    if (!container) return;

    if (_templates.length === 0) {
        container.innerHTML = '<p style="color: #636e72; font-size: 16px;">目前沒有模板</p>';
        return;
    }

    container.innerHTML = _templates.map(t => `
        <div class="template-item flex items-center justify-between p-2 bg-gray-50 rounded mb-2" 
             style="font-family: 'VT323', monospace;">
            <div class="flex-1">
                <span style="font-size: 18px; cursor: pointer;" onclick="applyTemplate('${t.id}')">
                    📋 ${t.title}
                </span>
                <span style="font-size: 14px; color: #636e72; margin-left: 8px;">
                    ${t.time || ''} ${t.isMultiDay ? '(跨日)' : ''}
                </span>
            </div>
            <button onclick="deleteTemplate('${t.id}')" class="pixel-btn" 
                style="padding: 2px 8px; font-size: 14px; background: #e17055;">🗑️</button>
        </div>
    `).join('');
}

// toggleTemplateSelector is now defined after initTemplates to support on-demand loading

/**
 * Toggle end date field visibility
 */
export function toggleEndDate() {
    const checkbox = document.getElementById('evt-multi-day');
    const container = document.getElementById('end-date-container');
    const endDateInput = document.getElementById('evt-end-date');
    const startDateInput = document.getElementById('evt-date');

    if (!checkbox || !container) return;

    if (checkbox.checked) {
        container.classList.remove('hidden-section');
        // Set minimum end date to start date
        if (endDateInput && startDateInput) {
            endDateInput.min = startDateInput.value;
            if (!endDateInput.value || endDateInput.value < startDateInput.value) {
                // Default to 1 day after start
                const nextDay = new Date(startDateInput.value);
                nextDay.setDate(nextDay.getDate() + 1);
                endDateInput.value = nextDay.toISOString().split('T')[0];
            }
        }
    } else {
        container.classList.add('hidden-section');
    }
}

/**
 * Inject template UI into the editor
 */
export function injectTemplateUI() {
    const editorView = document.getElementById('view-editor');
    if (!editorView || document.getElementById('template-section')) return;

    const form = editorView.querySelector('form');
    if (!form) return;

    const templateSection = document.createElement('div');
    templateSection.id = 'template-section';
    templateSection.className = 'mb-4';
    templateSection.innerHTML = `
        <div class="flex items-center gap-2 mb-2">
            <button type="button" onclick="toggleTemplateSelector()" class="pixel-btn" 
                style="font-size: 16px; padding: 6px 12px;">
                📋 從模板建立
            </button>
            <button type="button" onclick="saveCurrentAsTemplate()" class="pixel-btn" 
                style="font-size: 16px; padding: 6px 12px; background: #6c5ce7;">
                💾 儲存為模板
            </button>
        </div>
        <div id="template-selector" class="hidden-section border-2 border-dashed p-3 bg-gray-50 rounded">
            <h4 style="font-family: 'VT323', monospace; font-size: 18px; margin-bottom: 8px;">選擇模板：</h4>
            <div id="template-list"></div>
        </div>
    `;

    // Insert at the beginning of the form
    form.insertBefore(templateSection, form.firstChild);
}

/**
 * Save current form data as template
 */
export async function saveCurrentAsTemplate() {
    const title = document.getElementById('evt-title')?.value;
    const time = document.getElementById('evt-time')?.value;
    const isMultiDay = document.getElementById('evt-multi-day')?.checked || false;
    const isPublic = document.getElementById('evt-is-public')?.checked || false;
    const lineNotifyEnabled = document.getElementById('evt-line-notify')?.checked ?? true;
    const targets = window.getCurrentSelectedTargets ? window.getCurrentSelectedTargets() : [];

    if (!title) {
        showAlert('請先輸入行程名稱');
        return;
    }

    await saveAsTemplate({
        title,
        time,
        isMultiDay,
        isPublic,
        lineNotifyEnabled,
        targets
    });
}

// Initialize
export function initTemplates() {
    // Don't load templates immediately - wait until user is authenticated
    // Templates will be loaded when user first opens the template selector

    // Inject UI after a short delay (UI can be shown, just not templates list)
    setTimeout(() => {
        injectTemplateUI();
    }, 1000);

    console.log('[Templates] Module initialized (templates will load on demand)');
}

// Load templates on demand when selector is opened
export function toggleTemplateSelector() {
    const selector = document.getElementById('template-selector');
    if (!selector) return;

    if (selector.classList.contains('hidden-section')) {
        selector.classList.remove('hidden-section');
        // Load templates if not already loaded
        if (_templates.length === 0) {
            const currentUser = getAppCurrentUser();
            if (currentUser) {
                loadTemplates().then(() => renderTemplateList());
            } else {
                document.getElementById('template-list').innerHTML =
                    '<p style="color: #e17055; font-size: 16px;">請先登入後再使用模板功能</p>';
            }
        } else {
            renderTemplateList();
        }
    } else {
        selector.classList.add('hidden-section');
    }
}

// Export to window
window.toggleTemplateSelector = toggleTemplateSelector;
window.applyTemplate = applyTemplate;
window.deleteTemplate = deleteTemplate;
window.saveCurrentAsTemplate = saveCurrentAsTemplate;
window.toggleEndDate = toggleEndDate;
