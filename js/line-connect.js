// LINE Connect Module - 前端 LINE 綁定功能
import { db, appId } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showAlert, showConfirm } from '../components/modal.js';
import { getAppCurrentUser } from './firestore.js';

// LINE 官方帳號資訊
const LINE_BOT_ID = "@行政業務協調系統";
const LINE_BOT_ADD_URL = "https://lin.ee/76AKi0Q";

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

    // 共用的「加入 LINE 官方帳號」按鈕（使用官方 LINE LOGO）
    const addLineButton = `
        <a href="${LINE_BOT_ADD_URL}" target="_blank" rel="noopener noreferrer"
            class="line-add-btn"
            style="
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background: linear-gradient(135deg, #00B900 0%, #00C300 50%, #00D000 100%);
                color: white;
                padding: 14px 24px;
                border-radius: 50px;
                font-family: 'VT323', monospace;
                font-size: 20px;
                font-weight: bold;
                text-decoration: none;
                border: none;
                box-shadow: 0 4px 15px rgba(0, 185, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
                transition: all 0.3s ease;
                cursor: pointer;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            "
            onmouseover="this.style.transform='translateY(-2px) scale(1.02)'; this.style.boxShadow='0 6px 20px rgba(0, 185, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)'"
            onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 4px 15px rgba(0, 185, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'"
        >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 5.58 2 10c0 2.12.87 4.04 2.3 5.48-.15.54-.8 2.75-1.3 3.52 0 0-.03.1.03.14.07.05.14.02.14.02 1.78-.26 3.25-1.11 4.09-1.67.91.24 1.87.39 2.86.39 5.52 0 10-3.58 10-8s-4.48-8-10-8zm-3 9.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5s.5.22.5.5v3.5h1.5c.28 0 .5.22.5.5zm2.5.5c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5s.5.22.5.5v4c0 .28-.22.5-.5.5zm5 0c-.21 0-.39-.13-.47-.32l-1.53-3.4v3.22c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5.21 0 .39.13.47.32l1.53 3.4V7.5c0-.28.22-.5.5-.5s.5.22.5.5v4c0 .28-.22.5-.5.5zm3.5-.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5h2c.28 0 .5.22.5.5s-.22.5-.5.5h-1.5v1h1.5c.28 0 .5.22.5.5s-.22.5-.5.5h-1.5v1h1.5c.28 0 .5.22.5.5z"/>
            </svg>
            加入 LINE 官方帳號
        </a>
    `;

    return `
        <div class="mt-6 pt-4 border-t-2 border-gray-200">
            <h3 style="font-family: 'VT323', monospace; font-size: 22px; margin-bottom: 16px;">
                📱 LINE 通知設定
            </h3>
            
            <!-- 醒目的加入 LINE 按鈕區塊 -->
            <div class="p-4 mb-4" style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-radius: 12px; border: 2px solid #81c784;">
                <p style="font-family: 'VT323', monospace; font-size: 16px; color: #2e7d32; margin-bottom: 12px; text-align: center;">
                    💬 加入官方 LINE 帳號，即時接收行程通知！
                </p>
                ${addLineButton}
            </div>
            
            ${isConnected ? `
                <div class="p-4 bg-green-50 border-2 border-green-300 mb-4" style="border-radius: 8px;">
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
                    ${notifyEnabled ? '<span style="color: #00b894;">✓ 通知已啟用</span>' : '<span style="color: #e17055;">⚠ 通知已關閉</span>'}
                </div>
                
                <button onclick="disconnectLineUI()" class="pixel-btn" 
                    style="background: #e17055; padding: 8px 16px; font-size: 14px;">
                    ❌ 取消綁定
                </button>
            ` : `
                <div class="p-4 bg-yellow-50 border-2 border-yellow-300 mb-4" style="border-radius: 8px;">
                    <p style="font-family: 'VT323', monospace; font-size: 16px; color: #f39c12;">
                        ⚠️ 尚未綁定 LINE 帳號
                    </p>
                </div>
                
                <div class="mb-4 p-4" style="background: #f8f9fa; border-radius: 8px;">
                    <p style="font-family: 'VT323', monospace; font-size: 16px; margin-bottom: 8px; color: #333;">
                        📋 綁定步驟：
                    </p>
                    <ol style="font-family: 'VT323', monospace; font-size: 16px; margin-left: 20px; list-style-type: decimal; color: #555;">
                        <li style="margin-bottom: 6px;">👆 點擊上方綠色按鈕加入官方帳號</li>
                        <li style="margin-bottom: 6px;">💬 在 LINE 中傳送「我的ID」</li>
                        <li style="margin-bottom: 6px;">📋 將收到的 ID 貼在下方</li>
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
