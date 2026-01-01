// Department Configuration Module
// 處室/組別管理配置

export const DEPARTMENTS = {
    academic: {
        id: 'academic',
        name: '教務處',
        color: '#3498db', // 藍色
        icon: '📚',
        positions: [
            '教務主任',
            '教學組長',
            '設備組長',
            '註冊組長',
            '資訊組長',
            '閱推教師'
        ]
    },
    student: {
        id: 'student',
        name: '學務處',
        color: '#27ae60', // 綠色
        icon: '🎓',
        positions: [
            '學務主任',
            '訓育組長',
            '生教組長',
            '體育組長',
            '衛生組長',
            '護理師',
            '午餐秘書',
            '營養師'
        ]
    },
    general: {
        id: 'general',
        name: '總務處',
        color: '#e67e22', // 橙色
        icon: '🏢',
        positions: [
            '總務主任',
            '事務組長',
            '出納組長',
            '文書組長',
            '事務人員'
        ]
    },
    counseling: {
        id: 'counseling',
        name: '輔導室',
        color: '#9b59b6', // 紫色
        icon: '💜',
        positions: [
            '輔導主任',
            '輔導組長',
            '特教組長',
            '專輔教師',
            '資源班教師'
        ]
    }
};

/**
 * Get all departments as array
 */
export function getDepartmentList() {
    return Object.values(DEPARTMENTS);
}

/**
 * Get department by ID
 */
export function getDepartmentById(id) {
    return DEPARTMENTS[id] || null;
}

/**
 * Get department by position name
 */
export function getDepartmentByPosition(position) {
    for (const dept of Object.values(DEPARTMENTS)) {
        if (dept.positions.includes(position)) {
            return dept;
        }
    }
    return null;
}

/**
 * Get all positions as flat array
 */
export function getAllPositions() {
    const positions = [];
    for (const dept of Object.values(DEPARTMENTS)) {
        positions.push(...dept.positions);
    }
    return positions;
}

/**
 * Get department color by ID
 */
export function getDepartmentColor(deptId) {
    return DEPARTMENTS[deptId]?.color || '#636e72';
}

/**
 * Get department name by ID
 */
export function getDepartmentName(deptId) {
    return DEPARTMENTS[deptId]?.name || '未分類';
}

/**
 * Render department options for select element
 */
export function renderDepartmentOptions(selectedId = '') {
    let html = '<option value="">-- 請選擇處室 --</option>';
    for (const dept of Object.values(DEPARTMENTS)) {
        const selected = dept.id === selectedId ? 'selected' : '';
        html += `<option value="${dept.id}" ${selected}>${dept.icon} ${dept.name}</option>`;
    }
    return html;
}

/**
 * Render position options based on department
 */
export function renderPositionOptions(deptId, selectedPosition = '') {
    const dept = DEPARTMENTS[deptId];
    if (!dept) return '<option value="">-- 請先選擇處室 --</option>';

    let html = '<option value="">-- 請選擇職稱 --</option>';
    for (const pos of dept.positions) {
        const selected = pos === selectedPosition ? 'selected' : '';
        html += `<option value="${pos}" ${selected}>${pos}</option>`;
    }
    return html;
}
