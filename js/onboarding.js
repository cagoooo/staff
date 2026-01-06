// Onboarding Tutorial Module
// 新手引導教學 - 首次登入互動式導覽

const ONBOARDING_KEY = 'smes_onboarding_completed';

// Tutorial steps configuration
const ONBOARDING_STEPS = [
    {
        id: 'welcome',
        type: 'welcome',
        icon: '🎮',
        title: '歡迎使用！',
        content: '這是行政業務協調系統！<br>讓我帶您快速認識主要功能～',
        target: null,
        openSidebar: false
    },
    {
        id: 'sidebar',
        type: 'highlight',
        icon: '📋',
        title: '側邊選單',
        content: '這是功能選單，<br>可以切換不同頁面。<br><br>📱 手機端請點左上「☰」開啟',
        target: '#sidebar',
        position: 'right',
        openSidebar: true
    },
    {
        id: 'nav-dashboard',
        type: 'highlight',
        icon: '🏠',
        title: '主頁面',
        content: '點擊這裡回到主頁面，<br>查看最新公告和重要行事！',
        target: '.nav-btn.active',
        position: 'right',
        openSidebar: true
    },
    {
        id: 'nav-calendar',
        type: 'highlight',
        icon: '📅',
        title: '共用日曆',
        content: '點擊這裡查看日曆，<br>所有處室的行程一目瞭然！<br>支援月視圖和週視圖 📆',
        target: 'button[onclick="switchTab(\'calendar\')"]',
        position: 'right',
        openSidebar: true
    },
    {
        id: 'nav-add-event',
        type: 'highlight',
        icon: '➕',
        title: '新增行程',
        content: '點擊這裡新增行程！<br>可設定通知人員和 LINE 提醒<br><br>📱 手機端也有浮動「+」按鈕',
        target: 'button[onclick="switchTab(\'editor\')"]',
        position: 'right',
        openSidebar: true
    },
    {
        id: 'nav-account',
        type: 'highlight',
        icon: '⚙️',
        title: '帳號設定',
        content: '點擊這裡進行帳號設定，<br>包括綁定 LINE 通知！<br><br>💚 綁定後可收到即時通知',
        target: 'button[onclick="switchTab(\'account\')"]',
        position: 'right',
        openSidebar: true
    },
    {
        id: 'complete',
        type: 'complete',
        icon: '🎉',
        title: '導覽完成！',
        content: '您已了解基本功能！<br>有任何問題歡迎詢問～<br><br>祝您使用愉快！ 🚀',
        target: null,
        openSidebar: false
    }
];

let currentStep = 0;
let overlayEl = null;
let highlightEl = null;
let cardEl = null;
let sidebarWasOpen = false;

/**
 * Check if onboarding should be shown
 */
export function shouldShowOnboarding() {
    return localStorage.getItem(ONBOARDING_KEY) !== 'true';
}

/**
 * Mark onboarding as completed - ONLY when user explicitly chooses to
 */
function markOnboardingComplete() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    console.log('[Onboarding] User confirmed familiarity, marked complete');
}

/**
 * Just hide onboarding without marking complete
 */
function justHideOnboarding() {
    closeSidebarIfNeeded();
    hideOnboarding();
}

/**
 * Start the onboarding tutorial
 */
export function startOnboarding() {
    if (!shouldShowOnboarding()) {
        console.log('[Onboarding] Already marked as completed, skipping');
        return;
    }

    console.log('[Onboarding] Starting tutorial');
    currentStep = 0;

    // Remember initial sidebar state
    const sidebar = document.getElementById('sidebar');
    sidebarWasOpen = sidebar?.classList.contains('open') || false;

    createOnboardingElements();
    showStep(currentStep);
}

/**
 * Open sidebar for highlighting menu items (mobile support)
 */
function openSidebarForStep() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar && !sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
    }
}

/**
 * Close sidebar if we opened it
 */
function closeSidebarIfNeeded() {
    if (!sidebarWasOpen) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }
}

/**
 * Create DOM elements for onboarding
 */
function createOnboardingElements() {
    // Remove any existing elements
    hideOnboarding();

    // Create overlay
    overlayEl = document.createElement('div');
    overlayEl.className = 'onboarding-overlay';
    overlayEl.id = 'onboarding-overlay';
    document.body.appendChild(overlayEl);

    // Create highlight element
    highlightEl = document.createElement('div');
    highlightEl.className = 'onboarding-highlight';
    highlightEl.id = 'onboarding-highlight';
    highlightEl.style.display = 'none';
    document.body.appendChild(highlightEl);

    // Create card
    cardEl = document.createElement('div');
    cardEl.className = 'onboarding-card';
    cardEl.id = 'onboarding-card';
    document.body.appendChild(cardEl);

    // Activate overlay with slight delay for animation
    setTimeout(() => {
        overlayEl.classList.add('active');
    }, 50);
}

/**
 * Show a specific step
 */
function showStep(stepIndex) {
    const step = ONBOARDING_STEPS[stepIndex];
    if (!step) return;

    currentStep = stepIndex;

    // Open/close sidebar based on step requirement
    if (step.openSidebar) {
        openSidebarForStep();
        // Wait for sidebar animation before positioning
        setTimeout(() => updateHighlightAndCard(step, stepIndex), 250);
    } else {
        closeSidebarIfNeeded();
        setTimeout(() => updateHighlightAndCard(step, stepIndex), 100);
    }
}

/**
 * Update highlight position and card content
 */
function updateHighlightAndCard(step, stepIndex) {
    // Update highlight if there's a target
    if (step.target && step.type === 'highlight') {
        const targetEl = document.querySelector(step.target);
        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            highlightEl.style.display = 'block';
            highlightEl.style.top = `${rect.top - 8}px`;
            highlightEl.style.left = `${rect.left - 8}px`;
            highlightEl.style.width = `${rect.width + 16}px`;
            highlightEl.style.height = `${rect.height + 16}px`;
        }
    } else {
        highlightEl.style.display = 'none';
    }

    // Build card content
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

    let cardHTML = '';

    if (step.type === 'welcome') {
        cardHTML = `
            <div class="onboarding-welcome">
                <div class="onboarding-welcome-icon">${step.icon}</div>
                <h3 class="onboarding-card-title">${step.title}</h3>
                <p class="onboarding-card-content">${step.content}</p>
            </div>
        `;
    } else if (step.type === 'complete') {
        cardHTML = `
            <div class="onboarding-welcome">
                <div class="onboarding-welcome-icon">${step.icon}</div>
                <h3 class="onboarding-card-title">${step.title}</h3>
                <p class="onboarding-card-content">${step.content}</p>
            </div>
        `;
    } else {
        cardHTML = `
            <div class="onboarding-card-header">
                <span class="onboarding-card-icon">${step.icon}</span>
                <h3 class="onboarding-card-title">${step.title}</h3>
            </div>
            <p class="onboarding-card-content">${step.content}</p>
        `;
    }

    // Progress dots
    cardHTML += '<div class="onboarding-progress">';
    for (let i = 0; i < ONBOARDING_STEPS.length; i++) {
        const dotClass = i === stepIndex ? 'active' : (i < stepIndex ? 'completed' : '');
        cardHTML += `<div class="onboarding-dot ${dotClass}"></div>`;
    }
    cardHTML += '</div>';

    // Navigation buttons
    cardHTML += '<div class="onboarding-nav">';
    if (isFirst) {
        cardHTML += `<button class="onboarding-btn onboarding-btn-skip" onclick="window.skipOnboardingTemp()">稍後再看</button>`;
        cardHTML += `<button class="onboarding-btn onboarding-btn-next" onclick="window.nextOnboardingStep()">開始導覽 →</button>`;
    } else if (isLast) {
        cardHTML += `<button class="onboarding-btn onboarding-btn-prev" onclick="window.prevOnboardingStep()">← 上一步</button>`;
        cardHTML += `<button class="onboarding-btn onboarding-btn-finish" onclick="window.finishOnboardingPermanent()">✅ 我已熟悉了</button>`;
    } else {
        cardHTML += `<button class="onboarding-btn onboarding-btn-prev" onclick="window.prevOnboardingStep()">← 上一步</button>`;
        cardHTML += `<button class="onboarding-btn onboarding-btn-next" onclick="window.nextOnboardingStep()">下一步 →</button>`;
    }
    cardHTML += '</div>';

    // Add "never show again" option at the bottom for non-last steps
    if (!isLast) {
        cardHTML += `<div class="onboarding-skip-forever" onclick="window.finishOnboardingPermanent()">
            <span style="font-size: 14px; color: #636e72; cursor: pointer;">不再顯示此教學</span>
        </div>`;
    }

    // Update card
    cardEl.innerHTML = cardHTML;

    // Position card
    positionCard(step);

    // Animate in
    cardEl.classList.remove('active');
    setTimeout(() => {
        cardEl.classList.add('active');
    }, 50);
}

/**
 * Position the card relative to highlight or center
 * On mobile (<768px), CSS handles positioning - card is fixed at bottom
 */
function positionCard(step) {
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
    };

    // On mobile, CSS handles card positioning (fixed at bottom)
    if (viewport.width < 768) {
        cardEl.style.top = '';
        cardEl.style.left = '';
        return;
    }

    // Desktop positioning
    const cardWidth = 320;
    const padding = 20;
    let top, left;

    if (step.target && step.type === 'highlight') {
        const targetEl = document.querySelector(step.target);
        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();

            // Desktop: position to the right of target
            top = rect.top;
            left = rect.right + 20;

            // If not enough space on right, position below
            if (left + cardWidth > viewport.width - padding) {
                top = rect.bottom + 20;
                left = Math.max(padding, rect.left);
            }

            // Ensure card is visible vertically
            if (top + 250 > viewport.height) {
                top = Math.max(padding, viewport.height - 280);
            }
        }
    } else {
        // Center in viewport
        top = (viewport.height - 300) / 2;
        left = (viewport.width - Math.min(cardWidth, viewport.width - 40)) / 2;
    }

    cardEl.style.top = `${Math.max(padding, top)}px`;
    cardEl.style.left = `${Math.max(padding, left)}px`;
}

/**
 * Go to next step
 */
function nextStep() {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
        showStep(currentStep + 1);
    }
}

/**
 * Go to previous step
 */
function prevStep() {
    if (currentStep > 0) {
        showStep(currentStep - 1);
    }
}

/**
 * Skip onboarding temporarily (will show again next time)
 */
function skipOnboardingTemp() {
    console.log('[Onboarding] User chose to skip temporarily');
    justHideOnboarding();
}

/**
 * Finish onboarding permanently (user confirmed familiarity)
 */
function finishOnboardingPermanent() {
    markOnboardingComplete();
    closeSidebarIfNeeded();
    hideOnboarding();
}

/**
 * Hide and clean up onboarding elements
 */
function hideOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    const highlight = document.getElementById('onboarding-highlight');
    const card = document.getElementById('onboarding-card');

    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
    if (highlight) highlight.remove();
    if (card) {
        card.classList.remove('active');
        setTimeout(() => card.remove(), 300);
    }

    overlayEl = null;
    highlightEl = null;
    cardEl = null;
}

/**
 * Reset onboarding (for testing)
 */
export function resetOnboarding() {
    localStorage.removeItem(ONBOARDING_KEY);
    console.log('[Onboarding] Reset, will show on next login');
}

// Expose functions to window for onclick handlers
window.nextOnboardingStep = nextStep;
window.prevOnboardingStep = prevStep;
window.skipOnboardingTemp = skipOnboardingTemp;
window.finishOnboardingPermanent = finishOnboardingPermanent;
window.startOnboarding = startOnboarding;
window.resetOnboarding = resetOnboarding;

export { startOnboarding as default };
