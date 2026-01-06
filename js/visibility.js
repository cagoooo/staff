/**
 * visibility.js - Event Visibility Control
 * 控制事件的可見性權限
 */

/**
 * 檢查用戶是否可以查看指定事件
 * @param {Object} event - 事件資料
 * @param {Object} currentUser - 當前使用者
 * @returns {boolean} - 是否可見
 */
export function canViewEvent(event, currentUser) {
    // 非私人行程所有人可見
    if (!event.isPrivate) return true;

    // 沒有登入使用者無法查看私人行程
    if (!currentUser) return false;

    // 管理員可以查看所有行程
    if (currentUser.role === 'admin') return true;

    // 建立者可以查看自己的行程
    if (event.authorId === currentUser.id) return true;

    // 被指派者可以查看
    if (event.targets?.includes(currentUser.id)) return true;

    // 其他人無法查看私人行程
    return false;
}

/**
 * 過濾事件列表，只保留用戶可見的事件
 * @param {Array} events - 事件列表
 * @param {Object} currentUser - 當前使用者
 * @returns {Array} - 過濾後的事件列表
 */
export function filterVisibleEvents(events, currentUser) {
    return events.filter(event => canViewEvent(event, currentUser));
}

// Export to window for global access
window.canViewEvent = canViewEvent;
window.filterVisibleEvents = filterVisibleEvents;
