// Statistics Dashboard Module
import { globalEvents, globalUsers, getAppCurrentUser } from './firestore.js';

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

    // Department distribution
    const deptCounts = {};
    monthEvents.forEach(e => {
        const author = users.find(u => u.id === e.authorId);
        const dept = author?.department || 'other';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });

    // My events
    const myEvents = monthEvents.filter(e =>
        e.targets?.includes(currentUser?.id) || e.authorId === currentUser?.id
    );
    const myCompleted = myEvents.filter(e => e.completedBy?.includes(currentUser?.id)).length;
    const myRate = myEvents.length > 0 ? Math.round((myCompleted / myEvents.length) * 100) : 0;

    // Render HTML
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="content-card p-4 text-center">
                <div style="font-size: 48px; color: #6c5ce7;">📋</div>
                <div style="font-family: 'VT323', monospace; font-size: 36px; font-weight: bold;">${totalEvents}</div>
                <div style="font-family: 'VT323', monospace; font-size: 20px; color: #636e72;">本月行程總數</div>
            </div>
            <div class="content-card p-4 text-center">
                <div style="font-size: 48px; color: #00b894;">✅</div>
                <div style="font-family: 'VT323', monospace; font-size: 36px; font-weight: bold;">${completedEvents}</div>
                <div style="font-family: 'VT323', monospace; font-size: 20px; color: #636e72;">已完成</div>
            </div>
            <div class="content-card p-4 text-center">
                <div style="font-size: 48px; color: #fdcb6e;">⏳</div>
                <div style="font-family: 'VT323', monospace; font-size: 36px; font-weight: bold;">${pendingEvents}</div>
                <div style="font-family: 'VT323', monospace; font-size: 20px; color: #636e72;">待處理</div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="content-card p-4">
                <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">📊 各處室工作量</h3>
                <canvas id="dept-chart" height="200"></canvas>
            </div>
            <div class="content-card p-4">
                <h3 style="font-family: 'VT323', monospace; font-size: 24px; margin-bottom: 16px;">🎯 個人完成率</h3>
                <div class="flex items-center justify-center" style="min-height: 200px;">
                    <div class="text-center">
                        <div style="font-family: 'VT323', monospace; font-size: 72px; font-weight: bold; color: ${myRate >= 80 ? '#00b894' : myRate >= 50 ? '#fdcb6e' : '#e17055'};">${myRate}%</div>
                        <div style="font-family: 'VT323', monospace; font-size: 20px; color: #636e72;">${myCompleted}/${myEvents.length} 項任務</div>
                        <div class="mt-4" style="font-family: 'VT323', monospace; font-size: 18px;">
                            ${myRate >= 80 ? '🏆 太棒了！繼續保持！' : myRate >= 50 ? '💪 加油！還有一些待完成！' : '📌 還有許多任務等著你！'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Render department chart
    renderDeptChart(deptCounts);
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
        'academic': '教務處',
        'student': '學務處',
        'general': '總務處',
        'counseling': '輔導室',
        'principal': '校長室',
        'other': '其他'
    };

    const deptColors = {
        'academic': '#3498db',
        'student': '#27ae60',
        'general': '#e67e22',
        'counseling': '#9b59b6',
        'principal': '#e74c3c',
        'other': '#636e72'
    };

    const labels = Object.keys(deptCounts).map(k => deptLabels[k] || k);
    const data = Object.values(deptCounts);
    const colors = Object.keys(deptCounts).map(k => deptColors[k] || '#636e72');

    statsCharts.dept = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: "'VT323', monospace", size: 16 }
                    }
                }
            }
        }
    });
}

// Export to window
window.renderStats = renderStats;
