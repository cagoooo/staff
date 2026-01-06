// Swipe Gestures Module - Touch gesture support for event items
// Left swipe = Complete, Right swipe = Delete

let _swipeEnabled = true;
let _activeSwipeElement = null;

// Swipe threshold in pixels
const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 120;

/**
 * Initialize swipe gestures
 */
export function initSwipeGestures() {
    console.log('[Swipe] Initializing...');

    // Only enable on touch devices
    if (!('ontouchstart' in window)) {
        console.log('[Swipe] Not a touch device, skipping');
        return;
    }

    // Add CSS styles
    addSwipeStyles();

    // Use event delegation on the content area
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
        contentArea.addEventListener('touchstart', handleTouchStart, { passive: true });
        contentArea.addEventListener('touchmove', handleTouchMove, { passive: false });
        contentArea.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    console.log('[Swipe] Module initialized');
}

/**
 * Add swipe CSS styles dynamically
 */
function addSwipeStyles() {
    if (document.getElementById('swipe-styles')) return;

    const style = document.createElement('style');
    style.id = 'swipe-styles';
    style.textContent = `
        .swipeable-item {
            position: relative;
            overflow: hidden;
            touch-action: pan-y;
        }

        .swipe-action-bg {
            position: absolute;
            top: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            padding: 0 20px;
            font-family: 'VT323', monospace;
            font-size: 18px;
            font-weight: bold;
            color: white;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .swipe-action-left {
            right: 0;
            background: linear-gradient(90deg, transparent, #00b894);
            justify-content: flex-end;
        }

        .swipe-action-right {
            left: 0;
            background: linear-gradient(-90deg, transparent, #e17055);
            justify-content: flex-start;
        }

        .swipe-action-bg.visible {
            opacity: 1;
        }

        .swipe-content {
            position: relative;
            background: inherit;
            z-index: 1;
            transition: transform 0.2s ease-out;
        }

        .swipe-content.swiping {
            transition: none;
        }

        .swipe-hint {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-family: 'VT323', monospace;
            font-size: 16px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        }

        .swipe-hint.show {
            opacity: 1;
        }

        @keyframes swipeComplete {
            0% { transform: translateX(0); opacity: 1; }
            100% { transform: translateX(-100%); opacity: 0; }
        }

        @keyframes swipeDelete {
            0% { transform: translateX(0); opacity: 1; }
            100% { transform: translateX(100%); opacity: 0; }
        }

        .swipe-complete-animation {
            animation: swipeComplete 0.3s ease-out forwards;
        }

        .swipe-delete-animation {
            animation: swipeDelete 0.3s ease-out forwards;
        }
    `;
    document.head.appendChild(style);
}

// Touch state
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let isSwiping = false;
let swipeDirection = null;

/**
 * Handle touch start
 */
function handleTouchStart(e) {
    if (!_swipeEnabled) return;

    const target = e.target.closest('.event-item, .important-event-item');
    if (!target) return;

    // Check if item has event ID
    const eventId = target.dataset.eventId;
    if (!eventId) return;

    // Store touch start position
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchCurrentX = touchStartX;
    isSwiping = false;
    swipeDirection = null;

    _activeSwipeElement = target;

    // Wrap content if not already wrapped
    ensureSwipeStructure(target);
}

/**
 * Handle touch move
 */
function handleTouchMove(e) {
    if (!_activeSwipeElement) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // Determine if this is a horizontal or vertical swipe
    if (!isSwiping) {
        if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
            isSwiping = true;
            swipeDirection = deltaX > 0 ? 'right' : 'left';
            e.preventDefault(); // Prevent scroll
        } else if (Math.abs(deltaY) > 10) {
            // Vertical scroll - cancel swipe
            resetSwipe();
            return;
        }
    }

    if (isSwiping) {
        e.preventDefault();
        touchCurrentX = touch.clientX;

        // Clamp the swipe distance
        let clampedDelta = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));

        // Apply transform
        const content = _activeSwipeElement.querySelector('.swipe-content');
        if (content) {
            content.classList.add('swiping');
            content.style.transform = `translateX(${clampedDelta}px)`;
        }

        // Show action backgrounds
        const leftBg = _activeSwipeElement.querySelector('.swipe-action-left');
        const rightBg = _activeSwipeElement.querySelector('.swipe-action-right');

        if (deltaX < -20 && leftBg) {
            leftBg.classList.add('visible');
            if (rightBg) rightBg.classList.remove('visible');
        } else if (deltaX > 20 && rightBg) {
            rightBg.classList.add('visible');
            if (leftBg) leftBg.classList.remove('visible');
        } else {
            if (leftBg) leftBg.classList.remove('visible');
            if (rightBg) rightBg.classList.remove('visible');
        }
    }
}

/**
 * Handle touch end
 */
function handleTouchEnd(e) {
    if (!_activeSwipeElement || !isSwiping) {
        resetSwipe();
        return;
    }

    const deltaX = touchCurrentX - touchStartX;
    const eventId = _activeSwipeElement.dataset.eventId;

    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
        if (deltaX < 0) {
            // Left swipe - Complete
            triggerComplete(eventId, _activeSwipeElement);
        } else {
            // Right swipe - Delete
            triggerDelete(eventId, _activeSwipeElement);
        }
    } else {
        // Snap back
        resetSwipe();
    }
}

/**
 * Ensure element has swipe structure
 */
function ensureSwipeStructure(element) {
    if (element.querySelector('.swipe-content')) return;

    element.classList.add('swipeable-item');

    // Wrap existing content
    const content = document.createElement('div');
    content.className = 'swipe-content';
    while (element.firstChild) {
        content.appendChild(element.firstChild);
    }
    element.appendChild(content);

    // Add action backgrounds
    const leftBg = document.createElement('div');
    leftBg.className = 'swipe-action-bg swipe-action-left';
    leftBg.innerHTML = '✅ 完成';

    const rightBg = document.createElement('div');
    rightBg.className = 'swipe-action-bg swipe-action-right';
    rightBg.innerHTML = '🗑️ 刪除';

    element.insertBefore(rightBg, element.firstChild);
    element.insertBefore(leftBg, element.firstChild);
}

/**
 * Reset swipe state
 */
function resetSwipe() {
    if (_activeSwipeElement) {
        const content = _activeSwipeElement.querySelector('.swipe-content');
        if (content) {
            content.classList.remove('swiping');
            content.style.transform = '';
        }

        const leftBg = _activeSwipeElement.querySelector('.swipe-action-left');
        const rightBg = _activeSwipeElement.querySelector('.swipe-action-right');
        if (leftBg) leftBg.classList.remove('visible');
        if (rightBg) rightBg.classList.remove('visible');
    }

    _activeSwipeElement = null;
    isSwiping = false;
    swipeDirection = null;
}

/**
 * Trigger complete action
 */
function triggerComplete(eventId, element) {
    console.log('[Swipe] Complete triggered for:', eventId);

    // Add animation class
    element.classList.add('swipe-complete-animation');

    // Show hint
    showSwipeHint('✅ 已標記完成');

    // Call the global complete function (same as handleMarkAsDone but without confirm)
    setTimeout(async () => {
        if (window._markEventCompleteNoConfirm) {
            await window._markEventCompleteNoConfirm(eventId);
        }
        resetSwipe();
        element.classList.remove('swipe-complete-animation');
    }, 300);
}

/**
 * Trigger delete action
 */
function triggerDelete(eventId, element) {
    console.log('[Swipe] Delete triggered for:', eventId);

    // Show confirmation
    if (window.showConfirm) {
        window.showConfirm('確定要刪除這個行程嗎？', () => {
            // Add animation class
            element.classList.add('swipe-delete-animation');

            showSwipeHint('🗑️ 已刪除');

            setTimeout(async () => {
                if (window.deleteEvent) {
                    await window.deleteEvent(eventId);
                }
                resetSwipe();
            }, 300);
        }, () => {
            // Cancelled - snap back
            resetSwipe();
        });
    } else {
        resetSwipe();
    }
}

/**
 * Show swipe hint toast
 */
function showSwipeHint(message) {
    let hint = document.querySelector('.swipe-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'swipe-hint';
        document.body.appendChild(hint);
    }

    hint.textContent = message;
    hint.classList.add('show');

    setTimeout(() => {
        hint.classList.remove('show');
    }, 2000);
}

/**
 * Enable/disable swipe gestures
 */
export function setSwipeEnabled(enabled) {
    _swipeEnabled = enabled;
}

// Export
window.setSwipeEnabled = setSwipeEnabled;
