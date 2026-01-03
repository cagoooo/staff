// Backup and Restore Module - 資料備份與還原
import { db, appId } from './firebase-config.js';
import { collection, getDocs, setDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAppCurrentUser } from './firestore.js';
import { showAlert, showConfirm } from '../components/modal.js';

// Collections to backup
const BACKUP_COLLECTIONS = ['users', 'school_events', 'tags', 'event_templates', 'reminders'];

/**
 * Export all data to JSON
 */
export async function exportAllData() {
    const currentUser = getAppCurrentUser();
    if (currentUser?.role !== 'admin') {
        showAlert('需要管理員權限');
        return;
    }

    try {
        showAlert('正在匯出資料...');
        const backup = {
            exportDate: new Date().toISOString(),
            appId: appId,
            version: '3.4.1',
            collections: {}
        };

        for (const collectionName of BACKUP_COLLECTIONS) {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', collectionName);
            const snapshot = await getDocs(colRef);
            backup.collections[collectionName] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            console.log(`[Backup] Exported ${collectionName}: ${snapshot.docs.length} documents`);
        }

        // Download as JSON
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smes_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showAlert('✅ 資料匯出完成！');
    } catch (err) {
        console.error('[Backup] Export failed:', err);
        showAlert('匯出失敗：' + err.message);
    }
}

/**
 * Import data from JSON
 * @param {string} mode - 'merge' (keep existing) or 'replace' (delete existing)
 */
export async function importData(mode = 'merge') {
    const currentUser = getAppCurrentUser();
    if (currentUser?.role !== 'admin') {
        showAlert('需要管理員權限');
        return;
    }

    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const backup = JSON.parse(text);

            // Validate backup
            if (!backup.collections || !backup.version) {
                showAlert('無效的備份檔案格式');
                return;
            }

            const collectionCount = Object.keys(backup.collections).length;
            const docCount = Object.values(backup.collections).reduce((sum, docs) => sum + docs.length, 0);

            showConfirm(
                `確定要匯入備份資料嗎？\n\n` +
                `備份日期：${backup.exportDate?.split('T')[0] || '未知'}\n` +
                `資料集合：${collectionCount} 個\n` +
                `文件數量：${docCount} 筆\n` +
                `模式：${mode === 'replace' ? '覆蓋（刪除現有資料）' : '合併（保留現有資料）'}`,
                async () => {
                    await performImport(backup, mode);
                }
            );
        } catch (err) {
            console.error('[Backup] Parse failed:', err);
            showAlert('讀取備份檔案失敗：' + err.message);
        }
    };

    input.click();
}

/**
 * Perform the actual import
 */
async function performImport(backup, mode) {
    try {
        showAlert('正在匯入資料...');

        let imported = 0;
        let skipped = 0;

        for (const [collectionName, docs] of Object.entries(backup.collections)) {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', collectionName);

            // If replace mode, delete existing documents first
            if (mode === 'replace') {
                const existing = await getDocs(colRef);
                for (const existingDoc of existing.docs) {
                    await deleteDoc(existingDoc.ref);
                }
                console.log(`[Backup] Cleared ${collectionName}: ${existing.docs.length} documents`);
            }

            // Import documents
            for (const docData of docs) {
                const { id, ...data } = docData;
                try {
                    const docRef = doc(db, 'artifacts', appId, 'public', 'data', collectionName, id);
                    await setDoc(docRef, data, { merge: mode === 'merge' });
                    imported++;
                } catch (err) {
                    console.error(`[Backup] Failed to import ${collectionName}/${id}:`, err);
                    skipped++;
                }
            }
            console.log(`[Backup] Imported ${collectionName}: ${docs.length} documents`);
        }

        showAlert(`✅ 匯入完成！\n成功：${imported} 筆\n跳過：${skipped} 筆\n\n請重新整理頁面。`);
    } catch (err) {
        console.error('[Backup] Import failed:', err);
        showAlert('匯入失敗：' + err.message);
    }
}

/**
 * Render backup UI in admin panel
 */
export function renderBackupUI() {
    return `
        <div class="content-card p-4 mb-4">
            <h2 style="font-family: 'VT323', monospace; font-size: 28px; margin-bottom: 16px;">
                💾 資料備份與還原
            </h2>
            <p style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72; margin-bottom: 16px;">
                備份所有系統資料（使用者、行程、標籤、模板等）
            </p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Export -->
                <div class="p-4 border-2 rounded-lg" style="border-color: #00b894;">
                    <h3 style="font-family: 'VT323', monospace; font-size: 22px; color: #00b894; margin-bottom: 8px;">
                        📤 匯出備份
                    </h3>
                    <p style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72; margin-bottom: 12px;">
                        下載完整資料備份檔案 (JSON)
                    </p>
                    <button onclick="exportAllData()" class="pixel-btn pixel-btn-success w-full">
                        📥 立即匯出
                    </button>
                </div>
                
                <!-- Import -->
                <div class="p-4 border-2 rounded-lg" style="border-color: #6c5ce7;">
                    <h3 style="font-family: 'VT323', monospace; font-size: 22px; color: #6c5ce7; margin-bottom: 8px;">
                        📥 匯入還原
                    </h3>
                    <p style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72; margin-bottom: 12px;">
                        從備份檔案還原資料
                    </p>
                    <div class="flex gap-2">
                        <button onclick="importData('merge')" class="pixel-btn flex-1" style="background: #6c5ce7;">
                            📎 合併匯入
                        </button>
                        <button onclick="importData('replace')" class="pixel-btn flex-1" style="background: #e17055;">
                            🔄 覆蓋匯入
                        </button>
                    </div>
                    <p style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72; margin-top: 8px;">
                        ⚠️ 覆蓋匯入會刪除現有資料
                    </p>
                </div>
            </div>
        </div>
    `;
}

// Export to window
window.exportAllData = exportAllData;
window.importData = importData;
window.getBackupUIHtml = renderBackupUI;

export { renderBackupUI as getBackupUIHtml };
