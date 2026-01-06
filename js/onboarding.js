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
        target: null
    },
    {
        id: 'sidebar',
        type: 'highlight',
        icon: '📋',
        title: '側邊選單',
        content: '點擊左上角「☰」可開啟選單，<br>切換不同功能頁面。',
        target: '#hamburger-btn',
        position: 'right'
    },
    {
        id: 'dashboard',
        type: 'highlight',
        icon: '🏠',
        title: '主頁面',
        content: '這裡顯示最新公告和重要行事，<br>讓您快速掌握今日重點！',
        target: '#view-dashboard',
        position: 'center'
    },
    {
        id: 'calendar',
        type: 'info',
        icon: '📅',
        title: '共用日曆',
        content: '在「共用日曆」頁面可查看<br>所有處室的行程安排，<br>支援月視圖和週視圖！',
        target: null
    },
    {
        id: 'add-event',
        type: 'info',
        icon: '➕',
        title: '新增行程',
        content: '點擊「新增行程」建立行事，<br>可設定通知人員和 LINE 提醒！<br><br>📱 手機端有浮動「+」按鈕喔！',
        target: null
    },
    {
        id: 'line',
        type: 'info',
        icon: '💚',
        title: 'LINE 通知',
        content: '綁定 LINE 帳號後，<br>新行程和被 @提及 時<br>會即時收到通知！<br><br>👉 請至「帳號設定」頁面綁定',
        target: null
    },
    {
        id: 'complete',
        type: 'complete',
        icon: '🎉',
        title: '教學完成！',
        content: '您已了解基本功能！<br>有任何問題歡迎詢問～<br><br>祝您使用愉快！ 🚀',
        target: null
    }
];

let currentStep = 0;
let overlayEl = null;
let highlightEl = null;
let cardEl = null;

/**
 * Check if onboarding should be shown
 */
export function shouldShowOnboarding() {
    return localStorage.getItem(ONBOARDING_KEY) !== 'true';
}

/**
 * Mark onboarding as completed
 */
function completeOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    hideOnboarding();
}

/**
 * Start the onboarding tutorial
 */
export function startOnboarding() {
    if (!shouldShowOnboarding()) {
        console.log('[Onboarding] Already completed, skipping');
        return;
    }

    console.log('[Onboarding] Starting tutorial');
    currentStep = 0;
    createOnboardingElements();
    showStep(currentStep);
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
        cardHTML += `<button class="onboarding-btn onboarding-btn-skip" onclick="window.skipOnboarding()">跳過</button>`;
        cardHTML += `<button class="onboarding-btn onboarding-btn-next" onclick="window.nextOnboardingStep()">開始導覽 →</button>`;
    } else if (isLast) {
        cardHTML += `<button class="onboarding-btn onboarding-btn-prev" onclick="window.prevOnboardingStep()">← 上一步</button>`;
        cardHTML += `<button class="onboarding-btn onboarding-btn-finish" onclick="window.finishOnboarding()">開始使用！</button>`;
    } else {
        cardHTML += `<button class="onboarding-btn onboarding-btn-prev" onclick="window.prevOnboardingStep()">← 上一步</button>`;
        cardHTML += `<button class="onboarding-btn onboarding-btn-next" onclick="window.nextOnboardingStep()">下一步 →</button>`;
    }
    cardHTML += '</div>';

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
 */
function positionCard(step) {
    const cardWidth = 320;
    const padding = 20;
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
    };

    let top, left;

    if (step.target && step.type === 'highlight') {
        const targetEl = document.querySelector(step.target);
        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();

            // Try to position below the target
            top = rect.bottom + 20;
            left = Math.max(padding, Math.min(rect.left, viewport.width - cardWidth - padding));

            // If not enough space below, position above
            if (top + 200 > viewport.height) {
                top = rect.top - 220;
            }
        }
    } else {
        // Center in viewport
        top = (viewport.height - 300) / 2;
        left = (viewport.width - Math.min(cardWidth, viewport.width - 40)) / 2;
    }

    cardEl.style.top = `${Math.max(padding, top)}px`;
    cardEl.style.left = `${left}px`;
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
 * Skip onboarding
 */
function skipOnboarding() {
    completeOnboarding();
}

/**
 * Finish onboarding
 */
function finishOnboarding() {
    completeOnboarding();
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
window.skipOnboarding = skipOnboarding;
window.finishOnboarding = finishOnboarding;
window.startOnboarding = startOnboarding;
window.resetOnboarding = resetOnboarding;

export { startOnboarding as default };
