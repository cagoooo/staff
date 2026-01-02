// Theme Manager Module - Dark Mode Support

// Theme constants
const THEME_KEY = 'smes_theme';
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    AUTO: 'auto'
};

let currentTheme = THEMES.AUTO;

// Initialize theme system
export function initTheme() {
    console.log('[Theme] Initializing...');

    // Load CSS if not already loaded
    loadDarkModeCSS();

    // Load saved preference
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
        currentTheme = savedTheme;
        applyTheme(savedTheme);
    }

    // Inject theme toggle button
    injectThemeToggle();

    console.log('[Theme] Initialized with theme:', currentTheme);
}

// Load dark mode and animation CSS dynamically
function loadDarkModeCSS() {
    // Load dark mode CSS
    if (!document.querySelector('link[href*="dark-mode.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/dark-mode.css';
        document.head.appendChild(link);
    }
    // Load animations CSS
    if (!document.querySelector('link[href*="animations.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/animations.css';
        document.head.appendChild(link);
    }
}

// Apply theme to document
function applyTheme(theme) {
    const html = document.documentElement;

    if (theme === THEMES.AUTO) {
        html.removeAttribute('data-theme');
    } else {
        html.setAttribute('data-theme', theme);
    }

    // Update toggle button icon
    updateToggleIcon(theme);
}

// Inject theme toggle button
function injectThemeToggle() {
    if (document.getElementById('theme-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.title = '切換深色/淺色模式';
    btn.onclick = toggleTheme;

    updateToggleIcon(currentTheme, btn);

    document.body.appendChild(btn);
}

// Update toggle button icon
function updateToggleIcon(theme, btn = null) {
    const button = btn || document.getElementById('theme-toggle');
    if (!button) return;

    const isDark = theme === THEMES.DARK ||
        (theme === THEMES.AUTO && window.matchMedia('(prefers-color-scheme: dark)').matches);

    button.innerHTML = isDark ? '☀️' : '🌙';
}

// Toggle between themes
export function toggleTheme() {
    // Cycle: auto -> light -> dark -> auto
    if (currentTheme === THEMES.AUTO) {
        currentTheme = THEMES.LIGHT;
    } else if (currentTheme === THEMES.LIGHT) {
        currentTheme = THEMES.DARK;
    } else {
        currentTheme = THEMES.AUTO;
    }

    // Save preference
    localStorage.setItem(THEME_KEY, currentTheme);

    // Apply theme
    applyTheme(currentTheme);

    // Show notification
    const themeNames = {
        [THEMES.LIGHT]: '☀️ 淺色模式',
        [THEMES.DARK]: '🌙 深色模式',
        [THEMES.AUTO]: '🔄 自動模式'
    };

    showThemeToast(themeNames[currentTheme]);
}

// Show theme change toast
function showThemeToast(message) {
    // Remove existing toast
    const existing = document.getElementById('theme-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'theme-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: var(--pixel-bg-card);
        color: var(--pixel-text-dark);
        padding: 12px 20px;
        border: 3px solid #2d3436;
        box-shadow: 3px 3px 0 #2d3436;
        font-family: 'VT323', monospace;
        font-size: 20px;
        z-index: 200;
        animation: slideInRight 0.3s ease;
    `;
    toast.innerText = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Add toast animations to head
function addToastAnimations() {
    if (document.getElementById('theme-animations')) return;

    const style = document.createElement('style');
    style.id = 'theme-animations';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Initialize on load
addToastAnimations();

// Export to window
window.toggleTheme = toggleTheme;
