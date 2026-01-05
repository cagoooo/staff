// Statistics Dashboard Module - Enhanced Version
import { globalEvents, globalUsers, getAppCurrentUser } from './firestore.js';
import { DEPARTMENTS } from './departments.js';

let statsCharts = {};

// Initialize Stats - inject Chart.js CDN and UI elements
export function initStats() {
    console.log('[Stats] Initializing...');

    // Load Chart.js CDN
    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        document.head.appendChild(script);
    }

    // Inject sidebar button (after "新增行程" button)
    const nav = document.querySelector('#sidebar nav');
    if (nav && !document.getElementById('nav-stats')) {
        const statsBtn = document.createElement('button');
        statsBtn.id = 'nav-stats';
        statsBtn.className = 'nav-btn w-full';
        statsBtn.onclick = () => window.switchTab && window.switchTab('stats');
        statsBtn.innerHTML = '<i class="fas fa-chart-pie"></i> 統計儀表板';
        nav.appendChild(statsBtn);
    }

    // Inject stats view container
    const contentArea = document.getElementById('content-area');
    if (contentArea && !document.getElementById('view-stats')) {
        const statsView = document.createElement('div');
        statsView.id = 'view-stats';
        statsView.className = 'hidden-section';
        statsView.innerHTML = '<div id="stats-container"></div>';
        contentArea.appendChild(statsView);
    }

    console.log('[Stats] Module initialized');
}

// Render statistics dashboard
export function renderStats() {
    const container = document.getElementById('stats-container');
    if (!container) return;

    const events = globalEvents();
    const users = globalUsers();
    const currentUser = getAppCurrentUser();
    const now = new Date();

    // Calculate current month range
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Filter events for current month
    const monthEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate >= monthStart && eventDate <= monthEnd;
    });

    // Calculate statistics
    const totalEvents = monthEvents.length;
    const completedEvents = monthEvents.filter(e =>
        e.completedBy?.includes(currentUser?.id)
    ).length;
    const pendingEvents = totalEvents - completedEvents;
    const completionRate = totalEvents > 0 ? Math.round((completedEvents / totalEvents) * 100) : 0;

    // Upcoming events (next 7 days) - sorted by date and time
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate >= now && eventDate <= next7Days;
    }).sort((a, b) => {
        // Sort by date first, then by time
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.time || '00:00').localeCompare(b.time || '00:00');
    });

    // Overdue events (past but not completed)
    const overdueEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate < now &&
            (e.targets?.includes(currentUser?.id) || e.authorId === currentUser?.id) &&
            !e.completedBy?.includes(currentUser?.id);
    });

    // Department distribution (by target users, not just author)
    const deptCounts = {};
    monthEvents.forEach(e => {
        // Count by target users' departments
        if (e.targets && e.targets.length > 0) {
            e.targets.forEach(targetId => {
                const targetUser = users.find(u => u.id === targetId);
                if (targetUser && targetUser.department) {
                    const dept = targetUser.department;
                    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
                }
            });
        } else {
            // If no targets, use author's department
            const author = users.find(u => u.id === e.authorId);
            const dept = author?.department || 'other';
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        }
    });

    // Weekly trend (2 weeks ago, last week, current week, next week)
    const weeklyData = [];
    const weekLabels = ['兩週前', '上週', '本週', '下週'];

    // Get the start of current week (Sunday)
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - now.getDay());
    currentWeekStart.setHours(0, 0, 0, 0);

    for (let i = -2; i <= 1; i++) {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(currentWeekStart.getDate() + (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekEvents = events.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate >= weekStart && eventDate <= weekEnd;
        });
        weeklyData.push({
            label: weekLabels[i + 2],
            count: weekEvents.length
        });
    }

    // My events
    const myEvents = monthEvents.filter(e =>
        e.targets?.includes(currentUser?.id) || e.authorId === currentUser?.id
    );
    const myCompleted = myEvents.filter(e => e.completedBy?.includes(currentUser?.id)).length;
    const myRate = myEvents.length > 0 ? Math.round((myCompleted / myEvents.length) * 100) : 0;

    // Most active users
    const userEventCounts = {};
    monthEvents.forEach(e => {
        if (e.authorId) {
            userEventCounts[e.authorId] = (userEventCounts[e.authorId] || 0) + 1;
        }
    });
    const topCreators = Object.entries(userEventCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([userId, count]) => {
            const user = users.find(u => u.id === userId);
            // Use authorName from any event as fallback
            const eventByUser = monthEvents.find(e => e.authorId === userId);
            const displayName = user?.name || eventByUser?.authorName || userId;
            return { name: displayName, count };
        });

    // Important events count
    const importantEvents = monthEvents.filter(e => e.isPublic).length;

    // Render HTML with RWD grid
    container.innerHTML = `
        <style>
            .stats-grid { display: grid; gap: 16px; }
            .stats-card { 
                background: white; 
                border-radius: 12px; 
                padding: 16px; 
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .stats-card-clickable {
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .stats-card-clickable:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .stats-card-clickable:active {
                transform: translateY(0);
            }
            .stats-number { 
                font-family: 'VT323', monospace; 
                font-size: 36px; 
                font-weight: bold;
            }
            .stats-label { 
                font-family: 'VT323', monospace; 
                font-size: 16px; 
                color: #636e72;
            }
            .stats-icon { font-size: 36px; }
            @media (min-width: 768px) {
                .stats-grid-4 { grid-template-columns: repeat(4, 1fr); }
                .stats-grid-3 { grid-template-columns: repeat(3, 1fr); }
                .stats-grid-2 { grid-template-columns: repeat(2, 1fr); }
            }
            @media (max-width: 767px) {
                .stats-grid-4, .stats-grid-3 { grid-template-columns: repeat(2, 1fr); }
                .stats-number { font-size: 28px; }
                .stats-icon { font-size: 28px; }
            }
            /* Stats Detail Modal */
            .stats-detail-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
            }
            .stats-detail-content {
                background: white;
                border-radius: 16px;
                max-width: 600px;
                width: 100%;
                max-height: 80vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .stats-detail-header {
                padding: 16px 20px;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .stats-detail-title {
                font-family: 'VT323', monospace;
                font-size: 24px;
                font-weight: bold;
            }
            .stats-detail-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 8px;
            }
            .stats-detail-close:hover {
                background: #f0f0f0;
            }
            .stats-detail-body {
                padding: 16px 20px;
                overflow-y: auto;
                flex: 1;
            }
            .stats-event-item {
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 8px;
                border-left: 4px solid #6c5ce7;
                background: #f8f9fa;
                cursor: pointer;
                transition: background 0.2s;
            }
            .stats-event-item:hover {
                background: #e9ecef;
            }
            .stats-event-title {
                font-family: 'VT323', monospace;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 4px;
            }
            .stats-event-meta {
                font-size: 14px;
                color: #636e72;
            }
            .stats-empty {
                text-align: center;
                padding: 40px;
                color: #636e72;
                font-family: 'VT323', monospace;
                font-size: 18px;
            }
            /* Dark mode support */
            [data-theme="dark"] .stats-detail-content {
                background: #1f1f3d;
                color: #f0f0f0;
            }
            [data-theme="dark"] .stats-detail-header {
                border-color: #4d4d7a;
            }
            [data-theme="dark"] .stats-detail-close:hover {
                background: #3a3a5a;
            }
            [data-theme="dark"] .stats-event-item {
                background: #2a2a4a;
            }
            [data-theme="dark"] .stats-event-item:hover {
                background: #3a3a5a;
            }
            [data-theme="dark"] .stats-event-meta {
                color: #b0b0d0;
            }
        </style>
        
        <!-- Overview Cards -->
        <div class="stats-grid stats-grid-4 mb-4">
            <div class="stats-card stats-card-clickable text-center" data-type="total" title="點擊查看詳細">
                <div class="stats-icon" style="color: #6c5ce7;">📋</div>
                <div class="stats-number">${totalEvents}</div>
                <div class="stats-label">本月行程總數</div>
            </div>
            <div class="stats-card stats-card-clickable text-center" data-type="completed" title="點擊查看詳細">
                <div class="stats-icon" style="color: #00b894;">✅</div>
                <div class="stats-number">${completedEvents}</div>
                <div class="stats-label">已完成</div>
            </div>
            <div class="stats-card stats-card-clickable text-center" data-type="pending" title="點擊查看詳細">
                <div class="stats-icon" style="color: #fdcb6e;">⏳</div>
                <div class="stats-number">${pendingEvents}</div>
                <div class="stats-label">待處理</div>
            </div>
            <div class="stats-card stats-card-clickable text-center" data-type="important" title="點擊查看詳細">
                <div class="stats-icon" style="color: #e74c3c;">⭐</div>
                <div class="stats-number">${importantEvents}</div>
                <div class="stats-label">重要行事</div>
            </div>
        </div>

        <!-- Alert Cards -->
        <div class="stats-grid stats-grid-2 mb-4">
            <div class="stats-card" style="border-left: 4px solid #0984e3;">
                <h3 style="font-family: 'VT323', monospace; font-size: 20px; color: #0984e3; margin-bottom: 12px;">
                    📅 近7日即將到來 (${upcomingEvents.length})
                </h3>
                <div style="max-height: 120px; overflow-y: auto;">
                    ${upcomingEvents.length > 0 ? upcomingEvents.slice(0, 5).map(e => `
                        <div style="font-family: 'VT323', monospace; font-size: 16px; padding: 4px 0; border-bottom: 1px solid #eee;">
                            📌 ${e.date.substring(5)} ${e.time || ''} - ${e.title.substring(0, 20)}${e.title.length > 20 ? '...' : ''}
                        </div>
                    `).join('') : '<p style="color: #636e72; font-family: VT323, monospace;">沒有即將到來的行程</p>'}
                </div>
            </div>
            <div class="stats-card" style="border-left: 4px solid ${overdueEvents.length > 0 ? '#e17055' : '#00b894'};">
                <h3 style="font-family: 'VT323', monospace; font-size: 20px; color: ${overdueEvents.length > 0 ? '#e17055' : '#00b894'}; margin-bottom: 12px;">
                    ${overdueEvents.length > 0 ? '⚠️' : '✅'} 逾期未完成 (${overdueEvents.length})
                </h3>
                <div style="max-height: 120px; overflow-y: auto;">
                    ${overdueEvents.length > 0 ? overdueEvents.slice(0, 5).map(e => `
                        <div style="font-family: 'VT323', monospace; font-size: 16px; padding: 4px 0; border-bottom: 1px solid #eee; color: #e17055;">
                            ❌ ${e.date} - ${e.title.substring(0, 20)}${e.title.length > 20 ? '...' : ''}
                        </div>
                    `).join('') : '<p style="color: #00b894; font-family: VT323, monospace;">🎉 太棒了！沒有逾期行程</p>'}
                </div>
            </div>
        </div>
        
        <!-- Charts Row -->
        <div class="stats-grid stats-grid-2 mb-4">
            <div class="stats-card">
                <h3 style="font-family: 'VT323', monospace; font-size: 22px; margin-bottom: 16px;">📊 各處室工作量分布</h3>
                <div style="height: 280px; position: relative;">
                    <canvas id="dept-chart"></canvas>
                </div>
            </div>
            <div class="stats-card">
                <h3 style="font-family: 'VT323', monospace; font-size: 22px; margin-bottom: 16px;">📈 近4週行程趨勢</h3>
                <div style="height: 280px; position: relative;">
                    <canvas id="trend-chart"></canvas>
                </div>
            </div>
        </div>

        <!-- Personal Stats & Top Creators -->
        <div class="stats-grid stats-grid-2 mb-4">
            <div class="stats-card">
                <h3 style="font-family: 'VT323', monospace; font-size: 22px; margin-bottom: 16px;">🎯 我的完成率</h3>
                <div class="flex items-center justify-center" style="min-height: 180px;">
                    <div class="text-center">
                        <div style="font-family: 'VT323', monospace; font-size: 64px; font-weight: bold; color: ${myRate >= 80 ? '#00b894' : myRate >= 50 ? '#fdcb6e' : '#e17055'};">${myRate}%</div>
                        <div style="font-family: 'VT323', monospace; font-size: 20px; color: #636e72;">${myCompleted}/${myEvents.length} 項任務</div>
                        <div class="mt-3" style="font-family: 'VT323', monospace; font-size: 18px;">
                            ${myRate >= 80 ? '🏆 太棒了！繼續保持！' : myRate >= 50 ? '💪 加油！還有一些待完成！' : '📌 還有許多任務等著你！'}
                        </div>
                    </div>
                </div>
            </div>
            <div class="stats-card">
                <h3 style="font-family: 'VT323', monospace; font-size: 22px; margin-bottom: 16px;">👑 本月活躍排行</h3>
                <div style="font-family: 'VT323', monospace;">
                    ${topCreators.length > 0 ? topCreators.map((u, i) => `
                        <div style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee;">
                            <span style="font-size: 24px; margin-right: 12px;">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                            <span style="flex: 1; font-size: 18px;">${u.name}</span>
                            <span style="font-size: 20px; color: #6c5ce7; font-weight: bold;">${u.count} 筆</span>
                        </div>
                    `).join('') : '<p style="color: #636e72;">本月尚無資料</p>'}
                </div>
            </div>
        </div>

        <!-- User Count -->
        <div class="stats-card text-center">
            <div style="font-family: 'VT323', monospace; font-size: 20px; color: #636e72;">
                👥 系統共有 <strong style="color: #6c5ce7; font-size: 24px;">${users.length}</strong> 位使用者
            </div>
        </div>
    `;

    // Store event data for click handlers
    window._statsEventData = {
        monthEvents: monthEvents,
        completedEventsList: monthEvents.filter(e => e.completedBy?.includes(currentUser?.id)),
        pendingEventsList: monthEvents.filter(e => !e.completedBy?.includes(currentUser?.id)),
        importantEventsList: monthEvents.filter(e => e.isPublic),
        currentUser: currentUser
    };

    // Render charts with delay to ensure canvas is ready
    setTimeout(() => {
        renderDeptChart(deptCounts);
        renderTrendChart(weeklyData);
    }, 100);

    // Bind click events for stats cards
    setTimeout(() => {
        bindStatsCardClickEvents();
    }, 50);
}

// Render department distribution chart
function renderDeptChart(deptCounts) {
    const canvas = document.getElementById('dept-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Destroy existing chart
    if (statsCharts.dept) {
        statsCharts.dept.destroy();
    }

    const deptLabels = {
        'principal': '校長室',
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'teachers': '教師群',
        'other': '其他'
    };

    const deptColors = {
        'principal': '#e74c3c',
        'academic': '#3498db',
        'student': '#27ae60',
        'general': '#e67e22',
        'counseling': '#9b59b6',
        'teachers': '#00b894',
        'other': '#636e72'
    };

    // Only include departments with data
    const filteredDepts = Object.keys(deptCounts).filter(k => deptCounts[k] > 0);
    const labels = filteredDepts.map(k => deptLabels[k] || k);
    const data = filteredDepts.map(k => deptCounts[k]);
    const colors = filteredDepts.map(k => deptColors[k] || '#636e72');

    if (data.length === 0) {
        canvas.parentElement.innerHTML += '<p style="text-align: center; color: #636e72; font-family: VT323, monospace;">本月尚無行程資料</p>';
        return;
    }

    statsCharts.dept = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: "'VT323', monospace", size: 14 },
                        padding: 12
                    }
                }
            }
        }
    });
}

// Render weekly trend chart
function renderTrendChart(weeklyData) {
    const canvas = document.getElementById('trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Destroy existing chart
    if (statsCharts.trend) {
        statsCharts.trend.destroy();
    }

    statsCharts.trend = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: weeklyData.map(w => w.label),
            datasets: [{
                label: '行程數量',
                data: weeklyData.map(w => w.count),
                backgroundColor: ['#6c5ce7', '#a29bfe', '#74b9ff', '#0984e3'],
                borderRadius: 8,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { family: "'VT323', monospace", size: 14 },
                        stepSize: 1
                    }
                },
                x: {
                    ticks: {
                        font: { family: "'VT323', monospace", size: 14 }
                    }
                }
            }
        }
    });
}

// Bind click events for stats cards
function bindStatsCardClickEvents() {
    const clickableCards = document.querySelectorAll('.stats-card-clickable');
    clickableCards.forEach(card => {
        card.addEventListener('click', () => {
            const type = card.dataset.type;
            if (type) {
                showStatsDetailModal(type);
            }
        });
    });
}

// Show stats detail modal
function showStatsDetailModal(type) {
    const data = window._statsEventData;
    if (!data) return;

    let events = [];
    let title = '';
    let icon = '';
    let borderColor = '#6c5ce7';

    switch (type) {
        case 'total':
            events = data.monthEvents;
            title = '📋 本月行程總數';
            borderColor = '#6c5ce7';
            break;
        case 'completed':
            events = data.completedEventsList;
            title = '✅ 已完成行程';
            borderColor = '#00b894';
            break;
        case 'pending':
            events = data.pendingEventsList;
            title = '⏳ 待處理行程';
            borderColor = '#fdcb6e';
            break;
        case 'important':
            events = data.importantEventsList;
            title = '⭐ 重要行事';
            borderColor = '#e74c3c';
            break;
    }

    // Sort events by date
    events = [...events].sort((a, b) => a.date.localeCompare(b.date));

    // Generate event list HTML
    const eventsHtml = events.length > 0 ? events.map(e => `
        <div class="stats-event-item" style="border-left-color: ${borderColor};" data-event-id="${e.id}" onclick="window.openEventModal && window.openEventModal('${e.id}'); closeStatsDetailModal();">
            <div class="stats-event-title">${e.title}</div>
            <div class="stats-event-meta">
                📅 ${e.date} ${e.time ? '⏰ ' + e.time : '🌅 全天'} 
                ${e.authorName ? '| 👤 ' + e.authorName : ''}
            </div>
        </div>
    `).join('') : `<div class="stats-empty">📭 沒有符合的行程</div>`;

    // Create modal HTML
    const modalHtml = `
        <div class="stats-detail-modal" id="stats-detail-modal" onclick="if(event.target === this) closeStatsDetailModal();">
            <div class="stats-detail-content">
                <div class="stats-detail-header">
                    <div class="stats-detail-title">${title} (${events.length})</div>
                    <button class="stats-detail-close" onclick="closeStatsDetailModal();">✕</button>
                </div>
                <div class="stats-detail-body">
                    ${eventsHtml}
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    closeStatsDetailModal();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

// Close stats detail modal
function closeStatsDetailModal() {
    const modal = document.getElementById('stats-detail-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// Export closeStatsDetailModal to window for onclick handlers
window.closeStatsDetailModal = closeStatsDetailModal;

// Export to window
window.renderStats = renderStats;
