// LINE Connect Module - 前端 LINE 綁定功能
import { db, appId } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';
import { getAppCurrentUser } from './firestore.js';

// LINE 官方帳號資訊
const LINE_BOT_ID = "@行政業務協調系統";
const LINE_BOT_ADD_URL = "https://line.me/R/ti/p/@行政協調";

// Initialize LINE connect module
export function initLineConnect() {
    console.log('[LINE] Connect module initialized');
}

// Save LINE User ID to user profile
export async function saveLineUserId(lineUserId) {
    const user = getAppCurrentUser();
    if (!user) {
        showAlert('請先登入');
        return false;
    }

    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id);
        await updateDoc(userRef, {
            lineUserId: lineUserId,
            lineNotifyEnabled: true,
            lineConnectedAt: new Date().toISOString()
        });

        showAlert('✅ LINE 通知已綁定成功！');
        console.log('[LINE] User ID saved:', lineUserId);
        return true;
    } catch (err) {
        console.error('[LINE] Save failed:', err);
        showAlert('儲存 LINE ID 失敗：' + err.message);
        return false;
    }
}

// Toggle LINE notifications
export async function toggleLineNotify(enabled) {
    const user = getAppCurrentUser();
    if (!user) return false;

    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id);
        await updateDoc(userRef, {
            lineNotifyEnabled: enabled
        });

        showAlert(enabled ? '✅ LINE 通知已開啟' : '❌ LINE 通知已關閉');
        return true;
    } catch (err) {
        console.error('[LINE] Toggle failed:', err);
        showAlert('更新失敗：' + err.message);
        return false;
    }
}

// Disconnect LINE
export async function disconnectLine() {
    const user = getAppCurrentUser();
    if (!user) return false;

    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id);
        await updateDoc(userRef, {
            lineUserId: null,
            lineNotifyEnabled: false,
            lineConnectedAt: null
        });

        showAlert('已取消 LINE 綁定');
        return true;
    } catch (err) {
        console.error('[LINE] Disconnect failed:', err);
        showAlert('取消綁定失敗：' + err.message);
        return false;
    }
}

// Render LINE settings UI
export function renderLineSettings(user) {
    const isConnected = !!user.lineUserId;
    const notifyEnabled = user.lineNotifyEnabled || false;

    return `
        <div class="mt-6 pt-4 border-t-2 border-gray-200">
            <h3 style="font-family: 'VT323', monospace; font-size: 22px; margin-bottom: 16px;">
                📱 LINE 通知設定
            </h3>
            
            ${isConnected ? `
                <div class="p-4 bg-green-50 border-2 border-green-300 mb-4">
                    <p style="font-family: 'VT323', monospace; font-size: 18px; color: #00b894;">
                        ✅ 已綁定 LINE 帳號
                    </p>
                    <p style="font-family: 'VT323', monospace; font-size: 14px; color: #636e72; margin-top: 4px;">
                        LINE ID: ${user.lineUserId.substring(0, 10)}...
                    </p>
                </div>
                
                <div class="flex items-center gap-3 mb-4" style="font-family: 'VT323', monospace; font-size: 18px;">
                    <input type="checkbox" id="line-notify-toggle" class="w-5 h-5" 
                        ${notifyEnabled ? 'checked' : ''} 
                        onchange="toggleLineNotifyUI(this.checked)">
                    <label for="line-notify-toggle">接收 LINE 通知</label>
                </div>
                
                <button onclick="disconnectLineUI()" class="pixel-btn" 
                    style="background: #e17055; padding: 8px 16px; font-size: 14px;">
                    ❌ 取消綁定
                </button>
            ` : `
                <div class="p-4 bg-gray-50 border-2 border-gray-300 mb-4">
                    <p style="font-family: 'VT323', monospace; font-size: 16px; color: #636e72;">
                        尚未綁定 LINE 帳號
                    </p>
                </div>
                
                <div class="mb-4">
                    <p style="font-family: 'VT323', monospace; font-size: 16px; margin-bottom: 8px;">
                        📋 綁定步驟：
                    </p>
                    <ol style="font-family: 'VT323', monospace; font-size: 16px; margin-left: 20px; list-style-type: decimal;">
                        <li style="margin-bottom: 4px;">加入官方 LINE 帳號為好友</li>
                        <li style="margin-bottom: 4px;">在 LINE 中傳送「我的ID」</li>
                        <li style="margin-bottom: 4px;">將收到的 ID 貼在下方</li>
                    </ol>
                </div>
                
                <div class="mb-4">
                    <label class="pixel-label">您的 LINE User ID</label>
                    <input type="text" id="line-user-id-input" class="pixel-input" 
                        placeholder="U1234567890abcdef..."
                        style="font-size: 14px;">
                </div>
                
                <button onclick="saveLineUserIdUI()" class="pixel-btn pixel-btn-success" 
                    style="padding: 8px 16px; font-size: 14px;">
                    ✅ 綁定 LINE
                </button>
            `}
        </div>
    `;
}

// Window exports for inline handlers
window.saveLineUserIdUI = async function () {
    const input = document.getElementById('line-user-id-input');
    if (!input || !input.value.trim()) {
        showAlert('請輸入 LINE User ID');
        return;
    }

    const lineUserId = input.value.trim();

    // Validate format (LINE User IDs start with 'U' and are 33 characters)
    if (!lineUserId.startsWith('U') || lineUserId.length !== 33) {
        showAlert('LINE User ID 格式不正確\n\n正確格式：U 開頭，共 33 個字元');
        return;
    }

    const success = await saveLineUserId(lineUserId);
    if (success) {
        if (window.switchTab) window.switchTab('account');
    }
};

window.toggleLineNotifyUI = async function (enabled) {
    await toggleLineNotify(enabled);
};

window.disconnectLineUI = function () {
    showConfirm('確定要取消 LINE 綁定嗎？', async () => {
        const success = await disconnectLine();
        if (success && window.switchTab) {
            window.switchTab('account');
        }
    });
};

window.renderLineSettings = renderLineSettings;

export { LINE_BOT_ID, LINE_BOT_ADD_URL };
