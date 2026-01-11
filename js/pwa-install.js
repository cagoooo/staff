// PWA Install Prompt Module
// Shows install prompt to add website to home screen

const PWA_DISMISSED_KEY = 'smes_pwa_dismissed';
const PWA_DISMISS_DAYS = 30; // Show again after 30 days

/**
 * Initialize PWA install prompt module
 */
export function initPwaInstall() {
    // Skip if already in standalone mode (installed)
    if (isPwaMode()) {
        console.log('[PWA] Running in standalone mode');
        return;
    }

    // Listen for Android beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('[PWA] beforeinstallprompt fired');
        e.preventDefault();
        window.deferredPrompt = e;
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed successfully');
        window.deferredPrompt = null;
        hideInstallPrompt();
    });

    // Auto show install prompt after 3 seconds
    setTimeout(() => {
        showInstallPrompt();
    }, 3000);
}

/**
 * Check if running in PWA standalone mode
 */
function isPwaMode() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

/**
 * Check if user has dismissed the prompt
 */
function isDismissed() {
    const dismissed = localStorage.getItem(PWA_DISMISSED_KEY);
    if (!dismissed) return false;

    const dismissedDate = new Date(parseInt(dismissed));
    const now = new Date();
    const daysDiff = (now - dismissedDate) / (1000 * 60 * 60 * 24);

    return daysDiff < PWA_DISMISS_DAYS;
}

/**
 * Record user's dismiss choice
 */
function setDismissed() {
    localStorage.setItem(PWA_DISMISSED_KEY, Date.now().toString());
}

/**
 * Detect device platform
 */
function detectPlatform() {
    const ua = navigator.userAgent;

    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
        return 'ios';
    }
    if (/android/i.test(ua)) {
        return 'android';
    }
    return 'desktop';
}

/**
 * Show install guide prompt
 */
export function showInstallPrompt() {
    // Skip if already installed or dismissed
    if (isPwaMode() || isDismissed()) {
        return;
    }

    const platform = detectPlatform();

    // Don't show on desktop
    if (platform === 'desktop') {
        return;
    }

    // Create Modal
    const modal = document.createElement('div');
    modal.id = 'pwa-install-modal';
    modal.className = 'pwa-install-overlay';
    modal.innerHTML = getPlatformContent(platform);

    document.body.appendChild(modal);

    // Bind events
    document.getElementById('pwa-install-close')?.addEventListener('click', () => {
        hideInstallPrompt();
    });

    document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => {
        setDismissed();
        hideInstallPrompt();
    });

    // Android native install button
    document.getElementById('pwa-install-native')?.addEventListener('click', async () => {
        if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            const result = await window.deferredPrompt.userChoice;
            console.log('[PWA] User choice:', result.outcome);
            window.deferredPrompt = null;
            hideInstallPrompt();
        }
    });
}

/**
 * Hide install guide prompt
 */
function hideInstallPrompt() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    }
}

/**
 * Get platform-specific content
 */
function getPlatformContent(platform) {
    if (platform === 'ios') {
        return `
            <div class="pwa-install-modal">
                <div class="pwa-install-header">
                    <span class="pwa-install-icon">📱</span>
                    <h3>加入主畫面</h3>
                    <button id="pwa-install-close" class="pwa-install-close">✕</button>
                </div>
                <p class="pwa-install-desc">將「行政協調系統」加到主畫面，使用起來就像 App 一樣方便！</p>
                <div class="pwa-install-steps">
                    <div class="pwa-step">
                        <div class="pwa-step-num">1</div>
                        <div class="pwa-step-content">
                            <span class="pwa-step-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 5l-1.42 1.42-1.59-1.59V16h-2V4.83L9.41 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V10c0-1.1.9-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .9 2 2z"/>
                                </svg>
                            </span>
                            點擊底部的「分享」按鈕
                        </div>
                    </div>
                    <div class="pwa-step">
                        <div class="pwa-step-num">2</div>
                        <div class="pwa-step-content">
                            <span class="pwa-step-icon">📋</span>
                            向下滑動，找到「加到主畫面」
                        </div>
                    </div>
                    <div class="pwa-step">
                        <div class="pwa-step-num">3</div>
                        <div class="pwa-step-content">
                            <span class="pwa-step-icon">✓</span>
                            點擊右上角「新增」確認
                        </div>
                    </div>
                </div>
                <div class="pwa-install-footer">
                    <button id="pwa-install-dismiss" class="pwa-btn-dismiss">不再顯示</button>
                </div>
            </div>
        `;
    } else {
        // Android
        const hasNativePrompt = !!window.deferredPrompt;
        return `
            <div class="pwa-install-modal">
                <div class="pwa-install-header">
                    <span class="pwa-install-icon">📱</span>
                    <h3>加入主畫面</h3>
                    <button id="pwa-install-close" class="pwa-install-close">✕</button>
                </div>
                <p class="pwa-install-desc">將「行政協調系統」加到主畫面，使用起來就像 App 一樣方便！</p>
                ${hasNativePrompt ? `
                    <button id="pwa-install-native" class="pwa-btn-install">
                        📲 立即安裝到主畫面
                    </button>
                    <p class="pwa-install-or">- 或手動操作 -</p>
                ` : ''}
                <div class="pwa-install-steps">
                    <div class="pwa-step">
                        <div class="pwa-step-num">1</div>
                        <div class="pwa-step-content">
                            <span class="pwa-step-icon">⋮</span>
                            點擊右上角選單按鈕
                        </div>
                    </div>
                    <div class="pwa-step">
                        <div class="pwa-step-num">2</div>
                        <div class="pwa-step-content">
                            <span class="pwa-step-icon">📋</span>
                            選擇「新增至主畫面」
                        </div>
                    </div>
                    <div class="pwa-step">
                        <div class="pwa-step-num">3</div>
                        <div class="pwa-step-content">
                            <span class="pwa-step-icon">✓</span>
                            點擊「新增」確認
                        </div>
                    </div>
                </div>
                <div class="pwa-install-footer">
                    <button id="pwa-install-dismiss" class="pwa-btn-dismiss">不再顯示</button>
                </div>
            </div>
        `;
    }
}

// Expose for manual trigger
window.showPwaInstallPrompt = showInstallPrompt;
