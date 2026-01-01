// Search Module - For searching events and announcements
import { globalEvents, globalUsers } from './firestore.js';
import { getDepartmentName } from './departments.js';

let searchQuery = '';
let searchDateFrom = '';
let searchDateTo = '';
let searchResults = [];

// Initialize search UI
export function initSearch() {
    const searchHTML = `
    <div id="search-container" class="hidden-section fixed inset-0 z-[55] bg-black bg-opacity-60 flex items-start justify-center pt-20 p-4">
        <div class="bg-white w-full max-w-lg border-4 border-gray-800" style="box-shadow: 6px 6px 0 #2d3436;">
            <div class="p-4 border-b-2 border-gray-200 flex items-center gap-3">
                <i class="fas fa-search text-gray-400"></i>
                <input type="text" id="search-input" placeholder="搜尋行程、公告..." 
                    class="flex-1 pixel-input" style="border: none; box-shadow: none; padding: 8px 0;"
                    oninput="handleSearchInput(event)">
                <button onclick="closeSearch()" class="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
            </div>
            <div class="p-4 border-b border-gray-100">
                <div class="flex gap-2 items-center" style="font-family: 'VT323', monospace; font-size: 16px;">
                    <label>日期範圍：</label>
                    <input type="date" id="search-date-from" class="pixel-input" style="padding: 4px 8px; width: auto;" onchange="handleDateFilter()">
                    <span>至</span>
                    <input type="date" id="search-date-to" class="pixel-input" style="padding: 4px 8px; width: auto;" onchange="handleDateFilter()">
                    <button onclick="clearDateFilter()" class="text-purple-600 hover:text-purple-800">清除</button>
                </div>
            </div>
            <div id="search-results" class="max-h-96 overflow-y-auto p-2">
                <p class="text-gray-400 text-center py-8" style="font-family: 'VT323', monospace; font-size: 20px;">
                    輸入關鍵字開始搜尋...
                </p>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', searchHTML);
}

// Open search modal
export function openSearch() {
    const container = document.getElementById('search-container');
    if (container) {
        container.classList.remove('hidden-section');
        document.getElementById('search-input')?.focus();
    }
}

// Close search modal
export function closeSearch() {
    const container = document.getElementById('search-container');
    if (container) {
        container.classList.add('hidden-section');
        document.getElementById('search-input').value = '';
        searchQuery = '';
        searchDateFrom = '';
        searchDateTo = '';
    }
}

// Handle search input
export function handleSearchInput(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    performSearch();
}

// Handle date filter change
export function handleDateFilter() {
    searchDateFrom = document.getElementById('search-date-from')?.value || '';
    searchDateTo = document.getElementById('search-date-to')?.value || '';
    performSearch();
}

// Clear date filter
export function clearDateFilter() {
    document.getElementById('search-date-from').value = '';
    document.getElementById('search-date-to').value = '';
    searchDateFrom = '';
    searchDateTo = '';
    performSearch();
}

// Perform search
function performSearch() {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    const events = globalEvents();
    const users = globalUsers();

    // Filter events
    let filtered = events.filter(evt => {
        // Text search
        if (searchQuery) {
            const matchTitle = evt.title?.toLowerCase().includes(searchQuery);
            const matchAuthor = evt.authorName?.toLowerCase().includes(searchQuery);
            if (!matchTitle && !matchAuthor) return false;
        }

        // Date range
        if (searchDateFrom && evt.date < searchDateFrom) return false;
        if (searchDateTo && evt.date > searchDateTo) return false;

        return true;
    });

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Render results
    if (!searchQuery && !searchDateFrom && !searchDateTo) {
        resultsContainer.innerHTML = `
            <p class="text-gray-400 text-center py-8" style="font-family: 'VT323', monospace; font-size: 20px;">
                輸入關鍵字開始搜尋...
            </p>`;
        return;
    }

    if (filtered.length === 0) {
        resultsContainer.innerHTML = `
            <p class="text-gray-400 text-center py-8" style="font-family: 'VT323', monospace; font-size: 20px;">
                😢 找不到符合的結果
            </p>`;
        return;
    }

    resultsContainer.innerHTML = `
        <p class="text-gray-500 px-2 mb-2" style="font-family: 'VT323', monospace; font-size: 16px;">
            找到 ${filtered.length} 筆結果
        </p>`;

    filtered.slice(0, 20).forEach(evt => {
        const div = document.createElement('div');
        div.className = "p-3 border-b hover:bg-purple-50 cursor-pointer transition";
        div.style.fontFamily = "'VT323', monospace";
        div.onclick = () => {
            closeSearch();
            if (window.openEventModal) window.openEventModal(evt.id);
        };

        const statusIcon = evt.isPublic ? '⭐' : '📋';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-lg font-bold">${statusIcon} ${evt.title}</span>
                    <p class="text-sm text-gray-500">
                        ${evt.date} ${evt.time || ''} · ${evt.authorName || '未知'}
                    </p>
                </div>
            </div>`;
        resultsContainer.appendChild(div);
    });
}

// Export to window
window.openSearch = openSearch;
window.closeSearch = closeSearch;
window.handleSearchInput = handleSearchInput;
window.handleDateFilter = handleDateFilter;
window.clearDateFilter = clearDateFilter;
