/**
 * LINE Messaging API Integration for 行政業務協調系統
 * Firebase Cloud Functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { Client } = require("@line/bot-sdk");

// Initialize Firebase
initializeApp();
const db = getFirestore();

// App ID (same as frontend)
const APP_ID = "default-app-id";

// Lazy-loaded LINE Client
let lineClient = null;

function getLineClient() {
    if (!lineClient) {
        lineClient = new Client({
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
            channelSecret: process.env.LINE_CHANNEL_SECRET,
        });
    }
    return lineClient;
}

// ============================================
// LINE API Retry Helper - 指數退避重試機制
// ============================================

/**
 * 延遲函數
 * @param {number} ms - 延遲毫秒數
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// LINE API 使用統計設定
// ============================================

// 管理者 LINE User ID（接收 API 使用報告）
const ADMIN_LINE_USER_ID = "U183cfa1b66a53246764ed6ea9362d461";

// LINE 中用量方案每月免費訊息額度
const MONTHLY_MESSAGE_QUOTA = 3000;

// 警告閾值（達到此比例時發送警告）
const WARNING_THRESHOLD = 0.8; // 80%

/**
 * 更新 LINE API 使用統計
 * @param {boolean} success - 是否發送成功
 * @param {string} errorCode - 錯誤代碼（如有）
 */
async function updateLineApiStats(success, errorCode = null) {
    try {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const statsRef = db.collection(`artifacts/${APP_ID}/public/data/line_api_stats`);

        // 更新每日統計
        const dailyDocRef = statsRef.doc(`daily_${dateStr}`);
        const dailyDoc = await dailyDocRef.get();

        if (dailyDoc.exists) {
            const data = dailyDoc.data();
            await dailyDocRef.update({
                totalSent: (data.totalSent || 0) + (success ? 1 : 0),
                totalFailed: (data.totalFailed || 0) + (success ? 0 : 1),
                lastUpdated: now.toISOString(),
                ...(errorCode && { [`errors.${errorCode}`]: (data.errors?.[errorCode] || 0) + 1 })
            });
        } else {
            await dailyDocRef.set({
                date: dateStr,
                month: monthStr,
                totalSent: success ? 1 : 0,
                totalFailed: success ? 0 : 1,
                errors: errorCode ? { [errorCode]: 1 } : {},
                createdAt: now.toISOString(),
                lastUpdated: now.toISOString()
            });
        }

        // 更新每月統計
        const monthlyDocRef = statsRef.doc(`monthly_${monthStr}`);
        const monthlyDoc = await monthlyDocRef.get();

        if (monthlyDoc.exists) {
            const data = monthlyDoc.data();
            const newTotal = (data.totalSent || 0) + (success ? 1 : 0);
            await monthlyDocRef.update({
                totalSent: newTotal,
                totalFailed: (data.totalFailed || 0) + (success ? 0 : 1),
                lastUpdated: now.toISOString()
            });

            // 檢查是否需要發送警告
            if (success && newTotal === Math.floor(MONTHLY_MESSAGE_QUOTA * WARNING_THRESHOLD)) {
                await sendQuotaWarning(newTotal);
            }
        } else {
            await monthlyDocRef.set({
                month: monthStr,
                totalSent: success ? 1 : 0,
                totalFailed: success ? 0 : 1,
                quota: MONTHLY_MESSAGE_QUOTA,
                createdAt: now.toISOString(),
                lastUpdated: now.toISOString()
            });
        }
    } catch (err) {
        // 統計更新失敗不應影響主流程
        console.error('[LINE Stats] Failed to update stats:', err.message);
    }
}

/**
 * 發送額度警告給管理者
 */
async function sendQuotaWarning(currentCount) {
    try {
        const client = getLineClient();
        const percentage = Math.round((currentCount / MONTHLY_MESSAGE_QUOTA) * 100);

        const message = {
            type: 'flex',
            altText: `⚠️ LINE 訊息額度警告 - 已使用 ${percentage}%`,
            contents: {
                type: 'bubble',
                size: 'kilo',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#fdcb6e',
                    paddingAll: '15px',
                    contents: [
                        { type: 'text', text: '⚠️ 額度警告', color: '#2d3436', weight: 'bold', size: 'lg', align: 'center' }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '15px',
                    spacing: 'md',
                    contents: [
                        { type: 'text', text: `本月已發送 ${currentCount} 則訊息`, size: 'md', weight: 'bold', align: 'center' },
                        { type: 'text', text: `已達到 ${percentage}% 額度`, size: 'sm', color: '#e17055', align: 'center' },
                        { type: 'separator', margin: 'md' },
                        { type: 'text', text: `剩餘額度：${MONTHLY_MESSAGE_QUOTA - currentCount} 則`, size: 'sm', color: '#636e72', align: 'center' },
                        { type: 'text', text: '請注意控制訊息發送量', size: 'xs', color: '#888888', align: 'center', margin: 'md' }
                    ]
                }
            }
        };

        await client.pushMessage(ADMIN_LINE_USER_ID, message);
        console.log('[LINE Stats] Quota warning sent to admin');
    } catch (err) {
        console.error('[LINE Stats] Failed to send quota warning:', err.message);
    }
}

/**
 * 從 LINE 官方 API 獲取實際發送統計
 * @param {string} dateStr - 日期字串 YYYYMMDD 格式
 * @returns {Object} - { push, reply, broadcast, success }
 */
async function getLineApiDeliveryStats(dateStr) {
    try {
        const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!channelAccessToken) {
            console.error('[LINE Stats] No channel access token available');
            return { push: 0, reply: 0, broadcast: 0, success: false };
        }

        // 使用 node-fetch 或內建 fetch
        const fetch = require('node-fetch');

        // 獲取 Push 訊息統計
        const pushResponse = await fetch(`https://api.line.me/v2/bot/message/delivery/push?date=${dateStr}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${channelAccessToken}`
            }
        });

        let pushCount = 0;
        if (pushResponse.ok) {
            const pushData = await pushResponse.json();
            pushCount = pushData.success || 0;
            console.log(`[LINE Stats] Push messages on ${dateStr}: ${pushCount}`);
        } else {
            console.error(`[LINE Stats] Failed to get push stats: ${pushResponse.status}`);
        }

        // 獲取 Reply 訊息統計
        const replyResponse = await fetch(`https://api.line.me/v2/bot/message/delivery/reply?date=${dateStr}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${channelAccessToken}`
            }
        });

        let replyCount = 0;
        if (replyResponse.ok) {
            const replyData = await replyResponse.json();
            replyCount = replyData.success || 0;
            console.log(`[LINE Stats] Reply messages on ${dateStr}: ${replyCount}`);
        }

        // 獲取 Broadcast 訊息統計
        const broadcastResponse = await fetch(`https://api.line.me/v2/bot/message/delivery/broadcast?date=${dateStr}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${channelAccessToken}`
            }
        });

        let broadcastCount = 0;
        if (broadcastResponse.ok) {
            const broadcastData = await broadcastResponse.json();
            broadcastCount = broadcastData.success || 0;
            console.log(`[LINE Stats] Broadcast messages on ${dateStr}: ${broadcastCount}`);
        }

        return {
            push: pushCount,
            reply: replyCount,
            broadcast: broadcastCount,
            total: pushCount + replyCount + broadcastCount,
            success: true
        };
    } catch (err) {
        console.error('[LINE Stats] Error fetching LINE API stats:', err.message);
        return { push: 0, reply: 0, broadcast: 0, total: 0, success: false };
    }
}

/**
 * 獲取本月累計 LINE 統計 (從 LINE 官方 API)
 * @returns {Object} - { push, reply, broadcast, total, success }
 */
async function getMonthlyLineApiStats() {
    const now = new Date();
    const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

    const year = taiwanTime.getFullYear();
    const month = taiwanTime.getMonth() + 1;
    const today = taiwanTime.getDate();

    let totalPush = 0;
    let totalReply = 0;
    let totalBroadcast = 0;

    // 遍歷本月每一天
    for (let day = 1; day <= today; day++) {
        const dateStr = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
        const stats = await getLineApiDeliveryStats(dateStr);
        if (stats.success) {
            totalPush += stats.push;
            totalReply += stats.reply;
            totalBroadcast += stats.broadcast;
        }
        // 避免速率限制，加入小延遲
        await sleep(50);
    }

    return {
        push: totalPush,
        reply: totalReply,
        broadcast: totalBroadcast,
        total: totalPush + totalReply + totalBroadcast,
        success: true
    };
}

/**
 * 帶有指數退避的 LINE pushMessage 重試函數
 * @param {Client} client - LINE Bot SDK Client
 * @param {string} lineUserId - LINE User ID
 * @param {Object} message - 要發送的訊息
 * @param {number} maxRetries - 最大重試次數 (預設 3)
 * @param {number} baseDelay - 基礎延遲毫秒數 (預設 1000)
 * @returns {Promise<Object>} - LINE API 回應
 */
async function pushMessageWithRetry(client, lineUserId, message, maxRetries = 3, baseDelay = 1000) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await client.pushMessage(lineUserId, message);
            // 統計成功發送
            updateLineApiStats(true).catch(() => { });
            return result;
        } catch (error) {
            lastError = error;

            // 檢查是否為 429 Too Many Requests 錯誤
            const statusCode = error?.response?.status || error?.status || error?.statusCode;

            if (statusCode === 429) {
                if (attempt < maxRetries) {
                    // 計算指數退避延遲時間: baseDelay * 2^attempt + 隨機抖動
                    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
                    console.log(`[LINE Retry] Rate limited (429). Attempt ${attempt + 1}/${maxRetries + 1}. Waiting ${Math.round(delay)}ms before retry...`);
                    await sleep(delay);
                    continue;
                }
                console.error(`[LINE Retry] Max retries exceeded for 429 error. Giving up.`);
                // 統計 429 失敗
                updateLineApiStats(false, '429').catch(() => { });
            } else if (statusCode === 400) {
                // 400 錯誤通常是 LINE User ID 無效，不需要重試
                console.error(`[LINE Retry] Bad request (400) - likely invalid LINE User ID. Not retrying.`);
                // 統計 400 失敗
                updateLineApiStats(false, '400').catch(() => { });
                throw error;
            } else {
                // 其他錯誤，記錄並重試一次
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.log(`[LINE Retry] Error (${statusCode}). Attempt ${attempt + 1}/${maxRetries + 1}. Waiting ${Math.round(delay)}ms...`);
                    await sleep(delay);
                    continue;
                }
                // 統計其他錯誤
                updateLineApiStats(false, String(statusCode || 'unknown')).catch(() => { });
            }

            throw error;
        }
    }

    throw lastError;
}

/**
 * 批次發送 LINE 訊息並自動節流（避免觸發速率限制）
 * @param {Client} client - LINE Bot SDK Client
 * @param {Array} recipients - 收件人陣列 [{lineUserId, message}]
 * @param {number} delayBetweenMessages - 訊息間延遲毫秒數 (預設 100)
 */
async function pushMessagesBatch(client, recipients, delayBetweenMessages = 100) {
    const results = [];

    for (let i = 0; i < recipients.length; i++) {
        const { lineUserId, message, targetId } = recipients[i];

        try {
            await pushMessageWithRetry(client, lineUserId, message);
            results.push({ targetId, success: true });
            console.log(`[LINE Batch] Sent to ${targetId} (${i + 1}/${recipients.length})`);
        } catch (error) {
            results.push({ targetId, success: false, error: error.message });
            console.error(`[LINE Batch] Failed to send to ${targetId}:`, error.message);
        }

        // 在訊息之間加入延遲，避免觸發速率限制
        if (i < recipients.length - 1) {
            await sleep(delayBetweenMessages);
        }
    }

    return results;
}

// ============================================
// Flex Message 模板 - 精美卡片式通知
// ============================================

const LINK_URL = "https://cagoooo.github.io/staff/";

/**
 * 公告類型設定
 */
const ANNOUNCEMENT_TYPES = {
    'normal': { icon: '📋', label: '一般', color: '#667eea', headerBg: '#667eea' },
    'important': { icon: '⚡', label: '重要', color: '#e17055', headerBg: '#e17055' },
    'urgent': { icon: '🚨', label: '緊急', color: '#d63031', headerBg: '#d63031' }
};

// ============================================
// Quick Reply 工具函數
// ============================================

/**
 * 建立 Quick Reply 按鈕 (發送訊息類型)
 */
function createQuickReplyItem(label, text) {
    return {
        type: "action",
        action: {
            type: "message",
            label: label,
            text: text
        }
    };
}

/**
 * 建立 Quick Reply 按鈕 (URI 類型)
 */
function createQuickReplyUriItem(label, uri) {
    return {
        type: "action",
        action: {
            type: "uri",
            label: label,
            uri: uri
        }
    };
}

/**
 * 建立新行程通知的 Quick Reply
 * @param {string} eventId - 行程 ID
 * @param {Array} attachments - 附件陣列 (可選)
 */
function createEventQuickReply(eventId, attachments = []) {
    const items = [
        createQuickReplyItem("✅ 收到", `收到 ${eventId}`),
        createQuickReplyItem("⏰ 設定提醒", `提醒 ${eventId}`),
        createQuickReplyUriItem("📍 前往查看", LINK_URL)
    ];

    // 如果有附件，加入附件連結按鈕 (最多顯示第一個附件)
    if (attachments && attachments.length > 0) {
        const firstAttachment = attachments[0];
        if (firstAttachment.url) {
            items.push(createQuickReplyUriItem("📎 查看附件", firstAttachment.url));
        }
    }

    return { items };
}

/**
 * 建立行程更新通知的 Quick Reply
 * @param {string} eventId - 行程 ID
 * @param {Array} attachments - 附件陣列 (可選)
 */
function createEventUpdateQuickReply(eventId, attachments = []) {
    const items = [
        createQuickReplyItem("✅ 收到", `收到 ${eventId}`),
        createQuickReplyUriItem("📍 查看詳情", LINK_URL)
    ];

    // 如果有附件，加入附件連結按鈕
    if (attachments && attachments.length > 0) {
        const firstAttachment = attachments[0];
        if (firstAttachment.url) {
            items.push(createQuickReplyUriItem("📎 查看附件", firstAttachment.url));
        }
    }

    return { items };
}

/**
 * 建立提醒通知的 Quick Reply
 */
function createReminderQuickReply(eventId) {
    return {
        items: [
            createQuickReplyItem("✅ 標記完成", `完成 ${eventId}`),
            createQuickReplyItem("🔔 延後30分鐘", `延後 ${eventId}`),
            createQuickReplyUriItem("📍 查看詳情", LINK_URL)
        ]
    };
}

/**
 * 建立 @提及通知的 Quick Reply
 */
function createMentionQuickReply() {
    return {
        items: [
            createQuickReplyUriItem("📍 查看留言", LINK_URL)
        ]
    };
}

/**
 * 行程完成通知 - Flex Message
 * @param {Object} eventData - 行程資料
 * @param {string} completedByName - 完成者名稱
 */
function createCompletionFlexMessage(eventData, completedByName) {
    return {
        type: "flex",
        altText: `✅ 行程已完成：${eventData.title}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#00b894",
                paddingAll: "15px",
                contents: [
                    {
                        type: "text",
                        text: "✅ 行程已完成",
                        color: "#ffffff",
                        weight: "bold",
                        size: "lg"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: eventData.title,
                        weight: "bold",
                        size: "lg",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "📅 日期",
                                color: "#636e72",
                                size: "sm",
                                flex: 2
                            },
                            {
                                type: "text",
                                text: eventData.date || "未指定",
                                size: "sm",
                                flex: 4,
                                wrap: true
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "👤 完成者",
                                color: "#636e72",
                                size: "sm",
                                flex: 2
                            },
                            {
                                type: "text",
                                text: completedByName,
                                size: "sm",
                                flex: 4,
                                color: "#00b894",
                                weight: "bold"
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "⏰ 完成時間",
                                color: "#636e72",
                                size: "sm",
                                flex: 2
                            },
                            {
                                type: "text",
                                text: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
                                size: "sm",
                                flex: 4
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "10px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 查看詳情",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#00b894",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 新行程通知 - Flex Message (支援公告類型和附件)
 * @param {Object} eventData - 行程資料
 * @param {string} eventId - 行程 ID (用於 Quick Reply)
 */
function createEventFlexMessage(eventData, eventId = null) {
    // 取得公告類型設定
    const typeConfig = ANNOUNCEMENT_TYPES[eventData.announcementType] || ANNOUNCEMENT_TYPES['normal'];

    // 附件資訊
    const attachments = eventData.attachments || [];
    const hasAttachments = attachments.length > 0;

    // 判斷是否為跨日行程 (確保 endDate 不是空字串)
    const isMultiDay = eventData.endDate && eventData.endDate.trim() !== '' && eventData.endDate !== eventData.date;

    // 建立日期顯示
    let dateDisplay = eventData.date || '未指定';
    let dateLabel = "📆 日期";

    if (isMultiDay) {
        // 跨日行程顯示區間
        dateLabel = "📆 期程";
        dateDisplay = `${eventData.date} → ${eventData.endDate}`;
    }

    console.log('[LINE] Event date info:', { date: eventData.date, endDate: eventData.endDate, isMultiDay });

    // 建立 body 內容的 info box
    const infoContents = [
        {
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "text", text: dateLabel, size: "sm", color: "#888888", flex: 2 },
                { type: "text", text: dateDisplay, size: "sm", color: isMultiDay ? "#6c5ce7" : "#333333", flex: 3, weight: "bold", wrap: true }
            ]
        }
    ];

    // 如果是跨日行程，加入跨日標記
    if (isMultiDay) {
        infoContents.push({
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "filler" },
                { type: "text", text: "📅 跨日行程", size: "xs", color: "#6c5ce7", flex: 3 }
            ]
        });
    }

    // 加入其他資訊 (處理全天行程)
    const timeDisplay = eventData.isAllDay ? "🌅 全天" : (eventData.time || "--:--");
    infoContents.push(
        {
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "text", text: "⏰ 時間", size: "sm", color: "#888888", flex: 2 },
                { type: "text", text: timeDisplay, size: "sm", color: "#333333", flex: 3, weight: "bold" }
            ]
        },
        {
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "text", text: "👤 發起人", size: "sm", color: "#888888", flex: 2 },
                { type: "text", text: eventData.authorName, size: "sm", color: "#333333", flex: 3, weight: "bold" }
            ]
        },
        {
            type: "box",
            layout: "horizontal",
            contents: [
                { type: "text", text: "🏷️ 類型", size: "sm", color: "#888888", flex: 2 },
                { type: "text", text: `${typeConfig.icon} ${typeConfig.label}`, size: "sm", color: typeConfig.color, flex: 3, weight: "bold" }
            ]
        }
    );

    const bodyContents = [
        {
            type: "text",
            text: eventData.title,
            weight: "bold",
            size: "lg",
            wrap: true,
            color: "#333333"
        },
        {
            type: "separator",
            margin: "md"
        },
        {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: infoContents
        }
    ];

    // 如果有附件，加入附件資訊
    if (hasAttachments) {
        bodyContents.push({
            type: "box",
            layout: "vertical",
            margin: "lg",
            backgroundColor: "#f0f8ff",
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
                {
                    type: "text",
                    text: `📎 附件 (${attachments.length} 個)`,
                    size: "sm",
                    color: "#3498db",
                    weight: "bold"
                },
                {
                    type: "text",
                    text: attachments.slice(0, 3).map(a => a.name).join('、') + (attachments.length > 3 ? '...' : ''),
                    size: "xs",
                    color: "#666666",
                    wrap: true,
                    margin: "sm"
                }
            ]
        });
    }

    const message = {
        type: "flex",
        altText: `${typeConfig.icon} ${typeConfig.label}行程：${eventData.title}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: typeConfig.headerBg,
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: typeConfig.icon,
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: `${typeConfig.label === '一般' ? '新' : typeConfig.label}行程通知`,
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: bodyContents
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 前往查看",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: typeConfig.color,
                        height: "sm"
                    }
                ]
            }
        }
    };

    // 加入 Quick Reply 按鈕 (包含附件連結)
    if (eventId) {
        message.quickReply = createEventQuickReply(eventId, attachments);
    }

    return message;
}

/**
 * @提及通知 - Flex Message
 */
function createMentionFlexMessage(authorName, eventTitle, contentPreview) {
    return {
        type: "flex",
        altText: `💬 ${authorName} 提及了您`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#00b894",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "💬",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "有人提及您",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: authorName,
                                weight: "bold",
                                size: "md",
                                color: "#00b894"
                            },
                            {
                                type: "text",
                                text: " 在留言中提及了您",
                                size: "md",
                                color: "#333333"
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        backgroundColor: "#f8f9fa",
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        margin: "md",
                        contents: [
                            {
                                type: "text",
                                text: `📋 ${eventTitle}`,
                                size: "sm",
                                color: "#667eea",
                                weight: "bold"
                            },
                            {
                                type: "text",
                                text: `「${contentPreview}」`,
                                size: "sm",
                                color: "#666666",
                                wrap: true,
                                margin: "sm"
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "💬 查看留言",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#00b894",
                        height: "sm"
                    }
                ]
            }
        }
        // Quick Reply 暫時停用 (調試中)
        // quickReply: createMentionQuickReply()
    };
}

/**
 * 留言編輯通知 - Flex Message
 */
function createCommentEditFlexMessage(authorName, eventTitle, contentPreview) {
    return {
        type: "flex",
        altText: `✏️ ${authorName} 編輯了提及您的留言`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#e17055",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "✏️",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "留言已編輯",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: authorName,
                                weight: "bold",
                                size: "md",
                                color: "#e17055"
                            },
                            {
                                type: "text",
                                text: " 編輯了提及您的留言",
                                size: "md",
                                color: "#333333"
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        backgroundColor: "#fff5f3",
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        margin: "md",
                        contents: [
                            {
                                type: "text",
                                text: `📋 ${eventTitle}`,
                                size: "sm",
                                color: "#667eea",
                                weight: "bold"
                            },
                            {
                                type: "text",
                                text: `「${contentPreview}」`,
                                size: "sm",
                                color: "#666666",
                                wrap: true,
                                margin: "sm"
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "💬 查看更新內容",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#e17055",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 留言刪除通知 - Flex Message
 */
function createCommentDeleteFlexMessage(authorName, eventTitle, contentPreview) {
    return {
        type: "flex",
        altText: `🗑️ ${authorName} 刪除了提及您的留言`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#d63031",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "🗑️",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "留言已刪除",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: authorName,
                                weight: "bold",
                                size: "md",
                                color: "#d63031"
                            },
                            {
                                type: "text",
                                text: " 刪除了提及您的留言",
                                size: "md",
                                color: "#333333"
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        backgroundColor: "#fff5f5",
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        margin: "md",
                        contents: [
                            {
                                type: "text",
                                text: `📋 ${eventTitle}`,
                                size: "sm",
                                color: "#667eea",
                                weight: "bold"
                            },
                            {
                                type: "text",
                                text: `「${contentPreview}」`,
                                size: "sm",
                                color: "#999999",
                                wrap: true,
                                margin: "sm",
                                decoration: "line-through"
                            }
                        ]
                    }
                ]
            }
        }
    };
}

/**
 * 提醒通知 - Flex Message
 * @param {string} eventTitle - 行程標題
 * @param {string} eventDate - 行程日期
 * @param {string} eventTime - 行程時間
 * @param {string} eventId - 行程 ID (用於 Quick Reply)
 */
function createReminderFlexMessage(eventTitle, eventDate, eventTime, eventId = null) {
    const message = {
        type: "flex",
        altText: `⏰ 提醒：${eventTitle}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#e17055",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "⏰",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "行程提醒",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: "📢 即將開始",
                        size: "sm",
                        color: "#e17055",
                        weight: "bold"
                    },
                    {
                        type: "text",
                        text: eventTitle,
                        weight: "bold",
                        size: "lg",
                        wrap: true,
                        color: "#333333",
                        margin: "sm"
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        margin: "md",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📆 日期",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventDate,
                                        size: "sm",
                                        color: "#333333",
                                        flex: 3,
                                        weight: "bold"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "⏰ 時間",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventTime,
                                        size: "sm",
                                        color: "#e17055",
                                        flex: 3,
                                        weight: "bold"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "📋 查看詳情",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#e17055",
                        height: "sm"
                    }
                ]
            }
        }
    };

    // Quick Reply 暫時停用 (調試中)
    // if (eventId) {
    //     message.quickReply = createReminderQuickReply(eventId);
    // }

    return message;
}

/**
 * 提醒設定確認 - Flex Message
 */
function createReminderSetFlexMessage(eventTitle, eventDate, eventTime, minutesBefore) {
    const reminderLabel = getMinutesLabel(minutesBefore);
    return {
        type: "flex",
        altText: `🔔 已設定提醒：${eventTitle}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#00b894",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "🔔",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "提醒已設定",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: `📋 ${eventTitle}`,
                        weight: "bold",
                        size: "md",
                        wrap: true
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        backgroundColor: "#f0fff4",
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        contents: [
                            {
                                type: "text",
                                text: `📅 ${eventDate} ${eventTime}`,
                                size: "sm",
                                color: "#333333"
                            },
                            {
                                type: "text",
                                text: `⏰ 將於 ${reminderLabel} 提醒您`,
                                size: "sm",
                                color: "#00b894",
                                weight: "bold",
                                margin: "sm"
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "📋 查看行程",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#00b894",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 提醒刪除確認 - Flex Message
 */
function createReminderDeleteFlexMessage(eventTitle, minutesBefore) {
    const reminderLabel = getMinutesLabel(minutesBefore);
    return {
        type: "flex",
        altText: `🔕 已取消提醒：${eventTitle}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#636e72",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "🔕",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "提醒已取消",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: `📋 ${eventTitle}`,
                        weight: "bold",
                        size: "md",
                        wrap: true
                    },
                    {
                        type: "text",
                        text: `已取消 ${reminderLabel} 的提醒`,
                        size: "sm",
                        color: "#636e72"
                    }
                ]
            }
        }
    };
}

/**
 * 轉換分鐘數為文字標籤
 */
function getMinutesLabel(minutes) {
    const presets = {
        5: '5 分鐘前',
        15: '15 分鐘前',
        30: '30 分鐘前',
        60: '1 小時前',
        120: '2 小時前',
        1440: '1 天前',
        2880: '2 天前',
        10080: '1 週前'
    };
    return presets[minutes] || `${minutes} 分鐘前`;
}

/**
 * LINE 同步狀態通知 - Flex Message
 */
function createSyncStatusFlexMessage(enabled) {
    const config = enabled
        ? {
            icon: '🔗',
            title: '同步已開啟',
            color: '#00b894',
            message: '瀏覽器推播行程提醒時，將同時發送 LINE 訊息給您'
        }
        : {
            icon: '🔌',
            title: '同步已關閉',
            color: '#636e72',
            message: '已停止同步瀏覽器推播提醒至 LINE'
        };

    return {
        type: "flex",
        altText: `${config.icon} LINE 提醒同步${enabled ? '已開啟' : '已關閉'}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: config.color,
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: config.icon,
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: config.title,
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: "📲 LINE 提醒同步",
                        weight: "bold",
                        size: "md"
                    },
                    {
                        type: "text",
                        text: config.message,
                        size: "sm",
                        color: "#636e72",
                        wrap: true
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        margin: "lg",
                        contents: [
                            {
                                type: "text",
                                text: "🖥️ 瀏覽器",
                                size: "sm",
                                color: "#667eea"
                            },
                            {
                                type: "text",
                                text: enabled ? "⟷" : "✕",
                                size: "sm",
                                color: config.color,
                                align: "center"
                            },
                            {
                                type: "text",
                                text: "📱 LINE",
                                size: "sm",
                                color: "#00b894",
                                align: "end"
                            }
                        ]
                    }
                ]
            }
        }
    };
}

/**
 * 行程更新通知 - Flex Message
 * @param {Object} eventData - 行程資料
 * @param {Array} changedFields - 變更的欄位
 * @param {string} eventId - 行程 ID (用於 Quick Reply)
 */
function createEventUpdateFlexMessage(eventData, changedFields, eventId = null) {
    // 生成變更摘要
    const changesList = [];
    if (changedFields.includes('title')) changesList.push('標題');
    if (changedFields.includes('date')) changesList.push('日期');
    if (changedFields.includes('time')) changesList.push('時間');
    if (changedFields.includes('targets')) changesList.push('指派對象');
    if (changedFields.includes('attachments')) changesList.push('附件');

    const changesText = changesList.length > 0
        ? `📝 已更新：${changesList.join('、')}`
        : '📝 內容已更新';

    const message = {
        type: "flex",
        altText: `✏️ 行程更新：${eventData.title}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#fdcb6e",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "✏️",
                                size: "xl",
                                color: "#333333",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "行程更新通知",
                                color: "#333333",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: eventData.title,
                        weight: "bold",
                        size: "lg",
                        wrap: true,
                        color: "#333333"
                    },
                    {
                        type: "text",
                        text: changesText,
                        size: "sm",
                        color: "#e17055",
                        weight: "bold",
                        margin: "sm"
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        margin: "md",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📆 日期",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventData.date,
                                        size: "sm",
                                        color: "#333333",
                                        flex: 3,
                                        weight: "bold"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "⏰ 時間",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventData.time || "--:--",
                                        size: "sm",
                                        color: "#333333",
                                        flex: 3,
                                        weight: "bold"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "👤 更新者",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventData.authorName,
                                        size: "sm",
                                        color: "#333333",
                                        flex: 3,
                                        weight: "bold"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 查看最新內容",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#fdcb6e",
                        height: "sm"
                    }
                ]
            }
        }
    };

    // 加入 Quick Reply 按鈕 (包含附件連結)
    if (eventId) {
        const attachments = eventData.attachments || [];
        message.quickReply = createEventUpdateQuickReply(eventId, attachments);
    }

    return message;
}

/**
 * 行程刪除通知 - Flex Message
 */
function createEventDeleteFlexMessage(eventData) {
    return {
        type: "flex",
        altText: `🗑️ 行程已刪除：${eventData.title}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#d63031",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "🗑️",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "行程已刪除",
                                color: "#ffffff",
                                size: "lg",
                                weight: "bold",
                                margin: "md",
                                flex: 1
                            }
                        ],
                        alignItems: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: eventData.title,
                        weight: "bold",
                        size: "md",
                        color: "#d63031",
                        decoration: "line-through",
                        wrap: true
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        backgroundColor: "#fff5f5",
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📅 日期",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventData.date,
                                        size: "sm",
                                        color: "#999999",
                                        flex: 3,
                                        decoration: "line-through"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                margin: "sm",
                                contents: [
                                    {
                                        type: "text",
                                        text: "⏰ 時間",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventData.time || "--:--",
                                        size: "sm",
                                        color: "#999999",
                                        flex: 3,
                                        decoration: "line-through"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                margin: "sm",
                                contents: [
                                    {
                                        type: "text",
                                        text: "👤 刪除者",
                                        size: "sm",
                                        color: "#888888",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: eventData.authorName || "未知",
                                        size: "sm",
                                        color: "#d63031",
                                        flex: 3,
                                        weight: "bold"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    };
}

/**
 * LINE Webhook - 處理用戶訊息和加入好友事件
 */
exports.lineWebhook = onRequest(
    {
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (req, res) => {
        if (req.method !== "POST") {
            return res.status(405).send("Method Not Allowed");
        }

        const events = req.body.events || [];
        const client = getLineClient();

        for (const event of events) {
            try {
                if (event.type === "follow") {
                    // 用戶加入好友
                    await handleFollow(client, event);
                } else if (event.type === "message" && event.message.type === "text") {
                    // 處理文字訊息
                    await handleMessage(client, event);
                }
            } catch (err) {
                console.error("Event handling error:", err);
            }
        }

        res.status(200).send("OK");
    }
);

/**
 * 處理用戶加入好友
 */
async function handleFollow(client, event) {
    const userId = event.source.userId;

    // 取得用戶 profile
    const profile = await client.getProfile(userId);

    // 發送歡迎訊息（精美卡片 + 純文字 ID 方便複製）
    await client.pushMessage(userId, [
        // 歡迎卡片
        {
            type: "flex",
            altText: "歡迎加入行政業務協調系統！",
            contents: {
                type: "bubble",
                size: "kilo",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#667eea",
                    paddingAll: "20px",
                    contents: [
                        {
                            type: "text",
                            text: "🎉 歡迎加入！",
                            color: "#ffffff",
                            size: "xl",
                            weight: "bold",
                            align: "center"
                        }
                    ]
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "20px",
                    spacing: "md",
                    contents: [
                        {
                            type: "text",
                            text: "行政業務協調系統通知",
                            weight: "bold",
                            size: "lg",
                            color: "#333333",
                            align: "center"
                        },
                        {
                            type: "separator",
                            margin: "lg"
                        },
                        {
                            type: "text",
                            text: "📋 您的 LINE 綁定代碼",
                            size: "sm",
                            color: "#888888",
                            margin: "lg"
                        },
                        {
                            type: "text",
                            text: "⚠️ 這不是登入帳號！請按下方步驟操作",
                            size: "xs",
                            color: "#e17055",
                            margin: "sm",
                            weight: "bold"
                        }
                    ]
                }
            }
        },
        // 純文字 ID（方便長按複製）
        {
            type: "text",
            text: userId
        },
        // 說明卡片
        {
            type: "flex",
            altText: "綁定說明",
            contents: {
                type: "bubble",
                size: "kilo",
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "15px",
                    backgroundColor: "#f8f9fa",
                    contents: [
                        {
                            type: "text",
                            text: "📝 綁定步驟",
                            weight: "bold",
                            size: "md",
                            color: "#667eea"
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "md",
                            spacing: "sm",
                            contents: [
                                {
                                    type: "text",
                                    text: "1️⃣ 點下方按鈕開啟系統",
                                    size: "sm",
                                    color: "#333333"
                                },
                                {
                                    type: "text",
                                    text: "2️⃣ 用 Email 註冊或登入",
                                    size: "sm",
                                    color: "#333333"
                                },
                                {
                                    type: "text",
                                    text: "3️⃣ 進入「帳號設定」→「LINE 通知」",
                                    size: "sm",
                                    color: "#333333"
                                },
                                {
                                    type: "text",
                                    text: "4️⃣ 長按複製上方代碼並貼上",
                                    size: "sm",
                                    color: "#333333"
                                }
                            ]
                        }
                    ]
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "12px",
                    contents: [
                        {
                            type: "button",
                            action: {
                                type: "uri",
                                label: "🔗 開啟系統註冊/登入",
                                uri: LINK_URL
                            },
                            style: "primary",
                            color: "#667eea",
                            height: "sm"
                        }
                    ]
                }
            }
        }
    ]);

    console.log(`New follower: ${profile.displayName} (${userId})`);
}

/**
 * 處理文字訊息
 */
async function handleMessage(client, event) {
    const userId = event.source.userId;
    const text = event.message.text.trim().toLowerCase();
    const originalText = event.message.text.trim();

    // 指令對照表
    const cmdMyId = ['我的id', 'id', 'myid', '我的ＩＤ'];
    const cmdTest = ['測試', 'test'];
    const cmdMenu = ['選單', '目錄', 'menu', '主選單'];
    const cmdHelp = ['幫助', '說明', 'help', '?', '？'];
    const cmdFeatures = ['功能', 'features', '功能介紹'];
    const cmdToday = ['今日', 'today', '今日行程'];
    const cmdAbout = ['關於', 'about', '系統資訊'];

    // 取得用戶資料（如果已綁定）
    const getUserData = async () => {
        try {
            const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);
            const snapshot = await usersRef.where('lineUserId', '==', userId).limit(1).get();
            if (!snapshot.empty) {
                return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
        } catch (e) {
            console.error('[LINE] Failed to get user data:', e);
        }
        return null;
    };

    // ================== Quick Reply 指令處理 ==================

    // 收到 {eventId} - 確認收到行程通知
    if (originalText.startsWith('收到 ')) {
        const eventId = originalText.substring(3).trim();
        const userData = await getUserData();

        if (!userData) {
            await client.replyMessage(event.replyToken, createNotBoundFlex());
            return;
        }

        try {
            // 更新行程的已讀狀態
            const eventRef = db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`);
            const eventDoc = await eventRef.get();

            if (eventDoc.exists) {
                const eventData = eventDoc.data();
                const readBy = eventData.readBy || [];
                if (!readBy.includes(userData.id)) {
                    await eventRef.update({
                        readBy: [...readBy, userData.id]
                    });
                }

                // 回覆用戶確認訊息
                await client.replyMessage(event.replyToken, {
                    type: "flex",
                    altText: "✅ 已確認收到",
                    contents: {
                        type: "bubble",
                        size: "kilo",
                        body: {
                            type: "box",
                            layout: "vertical",
                            paddingAll: "20px",
                            contents: [
                                { type: "text", text: "✅ 已確認收到", weight: "bold", size: "lg", color: "#00b894", align: "center" },
                                { type: "text", text: `行程：${eventData.title}`, size: "sm", color: "#666666", align: "center", margin: "md", wrap: true }
                            ]
                        }
                    }
                });

                // 通知建立者有人已收到訊息（排除建立者自己）
                if (eventData.authorId && eventData.authorId !== userData.id) {
                    try {
                        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);
                        const authorDoc = await usersRef.doc(eventData.authorId).get();

                        if (authorDoc.exists) {
                            const authorData = authorDoc.data();
                            const authorLineId = authorData.lineUserId;
                            const authorNotifyEnabled = authorData.lineNotifyEnabled;

                            if (authorLineId && authorNotifyEnabled) {
                                await client.pushMessage(authorLineId, {
                                    type: "flex",
                                    altText: `📬 ${userData.name} 已收到：${eventData.title}`,
                                    contents: {
                                        type: "bubble",
                                        size: "kilo",
                                        header: {
                                            type: "box",
                                            layout: "vertical",
                                            backgroundColor: "#00cec9",
                                            paddingAll: "12px",
                                            contents: [
                                                { type: "text", text: "📬 已讀回報", color: "#ffffff", weight: "bold", size: "md" }
                                            ]
                                        },
                                        body: {
                                            type: "box",
                                            layout: "vertical",
                                            paddingAll: "15px",
                                            spacing: "sm",
                                            contents: [
                                                { type: "text", text: eventData.title, weight: "bold", size: "md", wrap: true },
                                                { type: "separator", margin: "md" },
                                                {
                                                    type: "box",
                                                    layout: "horizontal",
                                                    margin: "md",
                                                    contents: [
                                                        { type: "text", text: "👤 收到者", color: "#636e72", size: "sm", flex: 2 },
                                                        { type: "text", text: userData.name, size: "sm", flex: 3, color: "#00b894", weight: "bold" }
                                                    ]
                                                },
                                                {
                                                    type: "box",
                                                    layout: "horizontal",
                                                    contents: [
                                                        { type: "text", text: "⏰ 時間", color: "#636e72", size: "sm", flex: 2 },
                                                        { type: "text", text: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }), size: "sm", flex: 3 }
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                });
                                console.log(`[LINE] Receipt notification sent to author ${eventData.authorId}`);
                            }
                        }
                    } catch (notifyErr) {
                        console.error('[LINE] Failed to notify author:', notifyErr);
                        // 不影響主流程，只記錄錯誤
                    }
                }
            } else {
                await client.replyMessage(event.replyToken, { type: "text", text: "❌ 找不到該行程" });
            }
        } catch (e) {
            console.error('[LINE] 收到指令處理失敗:', e);
            await client.replyMessage(event.replyToken, { type: "text", text: "❌ 處理失敗，請稍後再試" });
        }
        return;
    }

    // 提醒 {eventId} - 設定 15 分鐘前提醒
    if (originalText.startsWith('提醒 ')) {
        const eventId = originalText.substring(3).trim();
        const userData = await getUserData();

        if (!userData) {
            await client.replyMessage(event.replyToken, createNotBoundFlex());
            return;
        }

        try {
            const eventRef = db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`);
            const eventDoc = await eventRef.get();

            if (eventDoc.exists) {
                const eventData = eventDoc.data();
                const eventDateTime = new Date(`${eventData.date}T${eventData.time || '09:00'}:00`);
                const reminderTime = new Date(eventDateTime.getTime() - 15 * 60 * 1000); // 15 分鐘前

                // 建立提醒
                await db.collection(`artifacts/${APP_ID}/public/data/reminders`).add({
                    userId: userData.id,
                    eventId: eventId,
                    eventTitle: eventData.title,
                    eventDate: eventData.date,
                    eventTime: eventData.time || '09:00',
                    reminderTime: reminderTime.toISOString(),
                    minutesBefore: 15,
                    triggered: false,
                    createdAt: new Date().toISOString()
                });

                await client.replyMessage(event.replyToken, createReminderSetFlexMessage(
                    eventData.title,
                    eventData.date,
                    eventData.time || '09:00',
                    15
                ));
            } else {
                await client.replyMessage(event.replyToken, { type: "text", text: "❌ 找不到該行程" });
            }
        } catch (e) {
            console.error('[LINE] 提醒指令處理失敗:', e);
            await client.replyMessage(event.replyToken, { type: "text", text: "❌ 設定提醒失敗，請稍後再試" });
        }
        return;
    }

    // 完成 {eventId} - 標記行程完成
    if (originalText.startsWith('完成 ')) {
        const eventId = originalText.substring(3).trim();
        const userData = await getUserData();

        if (!userData) {
            await client.replyMessage(event.replyToken, createNotBoundFlex());
            return;
        }

        try {
            const eventRef = db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`);
            const eventDoc = await eventRef.get();

            if (eventDoc.exists) {
                const eventData = eventDoc.data();
                const completedBy = eventData.completedBy || [];
                if (!completedBy.includes(userData.id)) {
                    await eventRef.update({
                        completedBy: [...completedBy, userData.id]
                    });
                }

                await client.replyMessage(event.replyToken, {
                    type: "flex",
                    altText: "✅ 已標記完成",
                    contents: {
                        type: "bubble",
                        size: "kilo",
                        body: {
                            type: "box",
                            layout: "vertical",
                            paddingAll: "20px",
                            contents: [
                                { type: "text", text: "✅ 已標記完成", weight: "bold", size: "lg", color: "#00b894", align: "center" },
                                { type: "text", text: `行程：${eventData.title}`, size: "sm", color: "#666666", align: "center", margin: "md", wrap: true },
                                { type: "text", text: "🎉 做得好！", size: "sm", color: "#888888", align: "center", margin: "sm" }
                            ]
                        }
                    }
                });
            } else {
                await client.replyMessage(event.replyToken, { type: "text", text: "❌ 找不到該行程" });
            }
        } catch (e) {
            console.error('[LINE] 完成指令處理失敗:', e);
            await client.replyMessage(event.replyToken, { type: "text", text: "❌ 標記完成失敗，請稍後再試" });
        }
        return;
    }

    // 延後 {eventId} - 延後 30 分鐘提醒
    if (originalText.startsWith('延後 ')) {
        const eventId = originalText.substring(3).trim();
        const userData = await getUserData();

        if (!userData) {
            await client.replyMessage(event.replyToken, createNotBoundFlex());
            return;
        }

        try {
            const eventRef = db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`);
            const eventDoc = await eventRef.get();

            if (eventDoc.exists) {
                const eventData = eventDoc.data();
                const now = new Date();
                const reminderTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 分鐘後

                // 建立延後提醒
                await db.collection(`artifacts/${APP_ID}/public/data/reminders`).add({
                    userId: userData.id,
                    eventId: eventId,
                    eventTitle: eventData.title,
                    eventDate: eventData.date,
                    eventTime: eventData.time || '09:00',
                    reminderTime: reminderTime.toISOString(),
                    minutesBefore: -30, // 負數表示已過期但延後
                    triggered: false,
                    isDelayed: true,
                    createdAt: new Date().toISOString()
                });

                await client.replyMessage(event.replyToken, {
                    type: "flex",
                    altText: "🔔 已延後提醒",
                    contents: {
                        type: "bubble",
                        size: "kilo",
                        body: {
                            type: "box",
                            layout: "vertical",
                            paddingAll: "20px",
                            contents: [
                                { type: "text", text: "🔔 已延後提醒", weight: "bold", size: "lg", color: "#fdcb6e", align: "center" },
                                { type: "text", text: `行程：${eventData.title}`, size: "sm", color: "#666666", align: "center", margin: "md", wrap: true },
                                { type: "text", text: "將於 30 分鐘後再次提醒您", size: "sm", color: "#888888", align: "center", margin: "sm" }
                            ]
                        }
                    }
                });
            } else {
                await client.replyMessage(event.replyToken, { type: "text", text: "❌ 找不到該行程" });
            }
        } catch (e) {
            console.error('[LINE] 延後指令處理失敗:', e);
            await client.replyMessage(event.replyToken, { type: "text", text: "❌ 延後提醒失敗，請稍後再試" });
        }
        return;
    }

    // ================== 選單 ==================
    if (cmdMenu.includes(text)) {
        await client.replyMessage(event.replyToken, createMainMenuFlex());
        return;
    }

    // ================== 幫助/說明 ==================
    if (cmdHelp.includes(text)) {
        await client.replyMessage(event.replyToken, createHelpFlex());
        return;
    }

    // ================== 功能介紹 ==================
    if (cmdFeatures.includes(text)) {
        await client.replyMessage(event.replyToken, createFeaturesFlex());
        return;
    }

    // ================== 今日行程 ==================
    if (cmdToday.includes(text)) {
        const userData = await getUserData();
        if (!userData) {
            await client.replyMessage(event.replyToken, createNotBoundFlex());
            return;
        }
        const todayEvents = await getTodayEvents(userData.id);
        await client.replyMessage(event.replyToken, createTodayEventsFlex(todayEvents));
        return;
    }

    // ================== 關於系統 ==================
    if (cmdAbout.includes(text)) {
        await client.replyMessage(event.replyToken, createAboutFlex());
        return;
    }

    // ================== 我的ID ==================
    if (cmdMyId.includes(text)) {
        // 發送精美卡片 + 純文字 ID（方便複製）
        await client.replyMessage(event.replyToken, [
            // 說明卡片
            {
                type: "flex",
                altText: "您的 LINE ID",
                contents: {
                    type: "bubble",
                    size: "kilo",
                    header: {
                        type: "box",
                        layout: "vertical",
                        backgroundColor: "#00b894",
                        paddingAll: "15px",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "📋",
                                        size: "xl",
                                        color: "#ffffff",
                                        flex: 0
                                    },
                                    {
                                        type: "text",
                                        text: "您的 LINE ID",
                                        color: "#ffffff",
                                        size: "lg",
                                        weight: "bold",
                                        margin: "md",
                                        flex: 1
                                    }
                                ],
                                alignItems: "center"
                            }
                        ]
                    },
                    body: {
                        type: "box",
                        layout: "vertical",
                        paddingAll: "15px",
                        contents: [
                            {
                                type: "text",
                                text: "👇 長按下方訊息複製 ID",
                                size: "sm",
                                color: "#666666",
                                align: "center"
                            }
                        ]
                    }
                }
            },
            // 純文字 ID（方便長按複製）
            {
                type: "text",
                text: userId
            },
            // 綁定說明卡片
            {
                type: "flex",
                altText: "綁定說明",
                contents: {
                    type: "bubble",
                    size: "kilo",
                    body: {
                        type: "box",
                        layout: "vertical",
                        paddingAll: "15px",
                        backgroundColor: "#f8f9fa",
                        contents: [
                            {
                                type: "text",
                                text: "📝 綁定步驟",
                                weight: "bold",
                                size: "md",
                                color: "#00b894"
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                margin: "md",
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "text",
                                        text: "1️⃣ 點下方按鈕開啟系統",
                                        size: "sm",
                                        color: "#333333"
                                    },
                                    {
                                        type: "text",
                                        text: "2️⃣ 用 Email 註冊或登入",
                                        size: "sm",
                                        color: "#333333"
                                    },
                                    {
                                        type: "text",
                                        text: "3️⃣ 進入「帳號設定」→「LINE 通知」",
                                        size: "sm",
                                        color: "#333333"
                                    },
                                    {
                                        type: "text",
                                        text: "4️⃣ 長按複製上方代碼並貼上",
                                        size: "sm",
                                        color: "#333333"
                                    }
                                ]
                            },
                            {
                                type: "text",
                                text: "⚠️ 這不是登入帳號，請勿貼到登入頁面",
                                size: "xs",
                                color: "#e17055",
                                wrap: true,
                                margin: "md",
                                weight: "bold"
                            }
                        ]
                    },
                    footer: {
                        type: "box",
                        layout: "vertical",
                        paddingAll: "12px",
                        contents: [
                            {
                                type: "button",
                                action: {
                                    type: "uri",
                                    label: "🔗 開啟系統註冊/登入",
                                    uri: LINK_URL
                                },
                                style: "primary",
                                color: "#00b894",
                                height: "sm"
                            }
                        ]
                    }
                }
            }
        ]);
    } else if (cmdTest.includes(text)) {
        // 測試成功的精美卡片
        await client.replyMessage(event.replyToken, {
            type: "flex",
            altText: "✅ 連線正常！",
            contents: {
                type: "bubble",
                size: "kilo",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#00b894",
                    paddingAll: "20px",
                    contents: [
                        {
                            type: "text",
                            text: "✅ 連線正常！",
                            color: "#ffffff",
                            size: "xl",
                            weight: "bold",
                            align: "center"
                        }
                    ]
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "20px",
                    spacing: "md",
                    contents: [
                        {
                            type: "box",
                            layout: "vertical",
                            spacing: "sm",
                            contents: [
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "🔗 連線狀態",
                                            size: "sm",
                                            color: "#888888",
                                            flex: 2
                                        },
                                        {
                                            type: "text",
                                            text: "正常",
                                            size: "sm",
                                            color: "#00b894",
                                            flex: 2,
                                            weight: "bold"
                                        }
                                    ]
                                },
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        {
                                            type: "text",
                                            text: "📱 Webhook",
                                            size: "sm",
                                            color: "#888888",
                                            flex: 2
                                        },
                                        {
                                            type: "text",
                                            text: "運作中",
                                            size: "sm",
                                            color: "#00b894",
                                            flex: 2,
                                            weight: "bold"
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            type: "separator",
                            margin: "lg"
                        },
                        {
                            type: "text",
                            text: "如果您已綁定系統帳號，將可以收到行程通知。",
                            size: "sm",
                            color: "#666666",
                            wrap: true,
                            margin: "lg"
                        }
                    ]
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "12px",
                    contents: [
                        {
                            type: "button",
                            action: {
                                type: "uri",
                                label: "🔗 前往系統",
                                uri: LINK_URL
                            },
                            style: "primary",
                            color: "#00b894",
                            height: "sm"
                        }
                    ]
                }
            }
        });
    } else {
        // 指令說明的精美卡片
        await client.replyMessage(event.replyToken, {
            type: "flex",
            altText: "可用指令說明",
            contents: {
                type: "bubble",
                size: "kilo",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#6c5ce7",
                    paddingAll: "15px",
                    contents: [
                        {
                            type: "box",
                            layout: "horizontal",
                            contents: [
                                {
                                    type: "text",
                                    text: "📋",
                                    size: "xl",
                                    color: "#ffffff",
                                    flex: 0
                                },
                                {
                                    type: "text",
                                    text: "可用指令",
                                    color: "#ffffff",
                                    size: "lg",
                                    weight: "bold",
                                    margin: "md",
                                    flex: 1
                                }
                            ],
                            alignItems: "center"
                        }
                    ]
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "15px",
                    spacing: "md",
                    contents: [
                        {
                            type: "box",
                            layout: "horizontal",
                            contents: [
                                {
                                    type: "text",
                                    text: "📝 我的ID",
                                    size: "md",
                                    color: "#333333",
                                    weight: "bold",
                                    flex: 2
                                },
                                {
                                    type: "text",
                                    text: "查詢 LINE ID",
                                    size: "sm",
                                    color: "#666666",
                                    flex: 3
                                }
                            ]
                        },
                        {
                            type: "box",
                            layout: "horizontal",
                            contents: [
                                {
                                    type: "text",
                                    text: "🔍 測試",
                                    size: "md",
                                    color: "#333333",
                                    weight: "bold",
                                    flex: 2
                                },
                                {
                                    type: "text",
                                    text: "確認連線狀態",
                                    size: "sm",
                                    color: "#666666",
                                    flex: 3
                                }
                            ]
                        }
                    ]
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "12px",
                    contents: [
                        {
                            type: "button",
                            action: {
                                type: "uri",
                                label: "🔗 前往系統",
                                uri: LINK_URL
                            },
                            style: "primary",
                            color: "#6c5ce7",
                            height: "sm"
                        }
                    ]
                }
            }
        });
    }
}

// ================== 輔助函數：Flex Message 創建 ==================

/**
 * 主選單 Flex Message
 */
function createMainMenuFlex() {
    return {
        type: "flex",
        altText: "📋 主選單",
        contents: {
            type: "bubble",
            size: "mega",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#667eea",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "🏫 行政業務協調系統",
                        color: "#ffffff",
                        size: "lg",
                        weight: "bold",
                        align: "center"
                    },
                    {
                        type: "text",
                        text: "LINE 通知服務選單",
                        color: "#ddd6fe",
                        size: "sm",
                        align: "center",
                        margin: "sm"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: "📝 輸入以下指令使用功能：",
                        size: "sm",
                        color: "#666666",
                        margin: "md"
                    },
                    { type: "separator", margin: "md" },
                    createMenuItemBox("📋", "我的ID", "查詢您的 LINE ID"),
                    createMenuItemBox("✅", "測試", "確認連線狀態"),
                    createMenuItemBox("📅", "今日", "查看今日行程"),
                    createMenuItemBox("💡", "功能", "系統功能介紹"),
                    createMenuItemBox("❓", "幫助", "使用說明"),
                    createMenuItemBox("ℹ️", "關於", "關於本系統")
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 開啟系統網頁",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#667eea",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 選單項目 Box
 */
function createMenuItemBox(icon, cmd, desc) {
    return {
        type: "box",
        layout: "horizontal",
        margin: "md",
        contents: [
            {
                type: "text",
                text: icon,
                size: "lg",
                flex: 0
            },
            {
                type: "box",
                layout: "vertical",
                margin: "md",
                flex: 1,
                contents: [
                    {
                        type: "text",
                        text: cmd,
                        size: "md",
                        weight: "bold",
                        color: "#333333"
                    },
                    {
                        type: "text",
                        text: desc,
                        size: "xs",
                        color: "#888888"
                    }
                ]
            }
        ]
    };
}

/**
 * 幫助說明 Flex Message
 */
function createHelpFlex() {
    return {
        type: "flex",
        altText: "❓ 使用說明",
        contents: {
            type: "bubble",
            size: "mega",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#00b894",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "❓ 使用說明",
                        color: "#ffffff",
                        size: "xl",
                        weight: "bold",
                        align: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                spacing: "lg",
                contents: [
                    {
                        type: "text",
                        text: "📌 如何綁定帳號？",
                        weight: "bold",
                        color: "#333333",
                        size: "md"
                    },
                    {
                        type: "text",
                        text: "1. 輸入「我的ID」取得 LINE ID\n2. 複製 ID\n3. 前往網頁系統「帳號設定」\n4. 貼上 ID 完成綁定",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    { type: "separator" },
                    {
                        type: "text",
                        text: "📌 如何接收通知？",
                        weight: "bold",
                        color: "#333333",
                        size: "md"
                    },
                    {
                        type: "text",
                        text: "綁定帳號後，當有新行程指派給您、有人 @提及您、或設定的提醒時間到達時，系統會自動發送 LINE 通知。",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    { type: "separator" },
                    {
                        type: "text",
                        text: "📌 可用指令一覽",
                        weight: "bold",
                        color: "#333333",
                        size: "md"
                    },
                    {
                        type: "text",
                        text: "• 選單 - 顯示主選單\n• 我的ID - 查詢 LINE ID\n• 測試 - 確認連線\n• 今日 - 今日行程\n• 功能 - 功能介紹\n• 關於 - 系統資訊",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 前往系統",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#00b894",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 功能介紹 Flex Message
 */
function createFeaturesFlex() {
    return {
        type: "flex",
        altText: "💡 功能介紹",
        contents: {
            type: "bubble",
            size: "mega",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#fdcb6e",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "💡 系統功能介紹",
                        color: "#333333",
                        size: "xl",
                        weight: "bold",
                        align: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "md",
                contents: [
                    createFeatureItem("📅", "行程管理", "新增、編輯、刪除行程，設定日期時間"),
                    createFeatureItem("👥", "人員指派", "將行程指派給特定處室或人員"),
                    createFeatureItem("🔔", "LINE 通知", "即時推播新行程、提醒、@提及"),
                    createFeatureItem("💬", "留言互動", "在行程中留言討論，支援 @提及"),
                    createFeatureItem("⏰", "智慧提醒", "自訂提醒時間，到點自動通知"),
                    createFeatureItem("📊", "統計報表", "查看行程完成率、處室分析"),
                    createFeatureItem("🗓️", "共用日曆", "所有成員共享行程日曆")
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 立即體驗",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#fdcb6e",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

function createFeatureItem(icon, title, desc) {
    return {
        type: "box",
        layout: "horizontal",
        contents: [
            { type: "text", text: icon, size: "lg", flex: 0 },
            {
                type: "box",
                layout: "vertical",
                margin: "md",
                flex: 1,
                contents: [
                    { type: "text", text: title, weight: "bold", size: "sm", color: "#333333" },
                    { type: "text", text: desc, size: "xs", color: "#888888", wrap: true }
                ]
            }
        ]
    };
}

/**
 * 關於系統 Flex Message
 */
function createAboutFlex() {
    return {
        type: "flex",
        altText: "ℹ️ 關於系統",
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#6c5ce7",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "🏫 行政業務協調系統",
                        color: "#ffffff",
                        size: "lg",
                        weight: "bold",
                        align: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                spacing: "md",
                contents: [
                    createInfoRow("版本", "v3.12.5"),
                    createInfoRow("開發", "石門國小"),
                    createInfoRow("技術", "Firebase + LINE API"),
                    { type: "separator", margin: "lg" },
                    {
                        type: "text",
                        text: "本系統旨在提升學校行政業務協調效率，透過即時通知讓團隊成員掌握最新動態。",
                        size: "xs",
                        color: "#888888",
                        wrap: true,
                        margin: "lg"
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 前往系統",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#6c5ce7",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

function createInfoRow(label, value) {
    return {
        type: "box",
        layout: "horizontal",
        contents: [
            { type: "text", text: label, size: "sm", color: "#888888", flex: 2 },
            { type: "text", text: value, size: "sm", color: "#333333", weight: "bold", flex: 3 }
        ]
    };
}

/**
 * 未綁定帳號提示
 */
function createNotBoundFlex() {
    return {
        type: "flex",
        altText: "⚠️ 尚未綁定帳號",
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#e17055",
                paddingAll: "15px",
                contents: [
                    {
                        type: "text",
                        text: "⚠️ 尚未綁定帳號",
                        color: "#ffffff",
                        size: "lg",
                        weight: "bold",
                        align: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "此功能需要先綁定系統帳號才能使用。",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    {
                        type: "text",
                        text: "👉 請輸入「幫助」查看綁定步驟",
                        size: "sm",
                        color: "#667eea",
                        wrap: true,
                        margin: "lg",
                        weight: "bold"
                    }
                ]
            }
        }
    };
}

/**
 * 查詢今日行程
 */
async function getTodayEvents(userId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const events = [];

    try {
        const eventsRef = db.collection(`artifacts/${APP_ID}/public/data/school_events`);
        const snapshot = await eventsRef.where('date', '==', today).get();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            // 只顯示指派給該用戶的行程或公開行程
            if (data.targets?.includes(userId) || data.isPublic) {
                events.push({ id: doc.id, ...data });
            }
        }
    } catch (e) {
        console.error('[LINE] Failed to get today events:', e);
    }

    return events;
}

/**
 * 今日行程 Flex Message
 */
function createTodayEventsFlex(events) {
    const today = new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });

    if (events.length === 0) {
        return {
            type: "flex",
            altText: "📅 今日行程",
            contents: {
                type: "bubble",
                size: "kilo",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#00b894",
                    paddingAll: "15px",
                    contents: [
                        { type: "text", text: "📅 今日行程", color: "#ffffff", size: "lg", weight: "bold", align: "center" },
                        { type: "text", text: today, color: "#dfe6e9", size: "sm", align: "center", margin: "sm" }
                    ]
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "20px",
                    contents: [
                        {
                            type: "text",
                            text: "🎉 今天沒有待辦行程！",
                            size: "md",
                            color: "#333333",
                            align: "center"
                        },
                        {
                            type: "text",
                            text: "好好休息或規劃新任務吧～",
                            size: "sm",
                            color: "#888888",
                            align: "center",
                            margin: "md"
                        }
                    ]
                }
            }
        };
    }

    // 有行程時，最多顯示 5 筆
    const displayEvents = events.slice(0, 5);
    const eventBoxes = displayEvents.map(evt => ({
        type: "box",
        layout: "horizontal",
        margin: "md",
        contents: [
            {
                type: "text",
                text: evt.time || "全天",
                size: "sm",
                color: "#667eea",
                flex: 0,
                weight: "bold"
            },
            {
                type: "text",
                text: evt.title,
                size: "sm",
                color: "#333333",
                flex: 1,
                margin: "md",
                wrap: true
            }
        ]
    }));

    return {
        type: "flex",
        altText: `📅 今日行程 (${events.length} 項)`,
        contents: {
            type: "bubble",
            size: "mega",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#667eea",
                paddingAll: "15px",
                contents: [
                    { type: "text", text: "📅 今日行程", color: "#ffffff", size: "lg", weight: "bold", align: "center" },
                    { type: "text", text: today, color: "#dfe6e9", size: "sm", align: "center", margin: "sm" },
                    { type: "text", text: `共 ${events.length} 項行程`, color: "#dfe6e9", size: "xs", align: "center", margin: "xs" }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "sm",
                contents: eventBoxes
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 查看完整行程",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#667eea",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 用戶資料更新時，同步更新相關行程的 authorName
 * 同時處理 LINE 綁定/取消綁定的通知
 */
exports.onUserUpdate = onDocumentUpdated(
    {
        document: `artifacts/${APP_ID}/public/data/users/{userId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();
        const userId = event.params.userId;

        // ========== 處理 LINE 綁定狀態變更 ==========
        const beforeLineId = beforeData.lineUserId || null;
        const afterLineId = afterData.lineUserId || null;

        // 新綁定 LINE (之前沒有 lineUserId，現在有了)
        if (!beforeLineId && afterLineId) {
            console.log(`[UserUpdate] User ${userId} bound LINE account: ${afterLineId}`);
            try {
                const client = getLineClient();
                await client.pushMessage(afterLineId, createLineBindSuccessMessage(afterData.name || '用戶'));
                console.log(`[UserUpdate] Sent LINE bind success notification to ${afterLineId}`);
            } catch (err) {
                console.error(`[UserUpdate] Failed to send LINE bind notification:`, err);
            }
        }

        // 取消綁定 LINE (之前有 lineUserId，現在沒有了)
        if (beforeLineId && !afterLineId) {
            console.log(`[UserUpdate] User ${userId} unbound LINE account: ${beforeLineId}`);
            try {
                const client = getLineClient();
                await client.pushMessage(beforeLineId, createLineUnbindMessage(beforeData.name || '用戶'));
                console.log(`[UserUpdate] Sent LINE unbind notification to ${beforeLineId}`);
            } catch (err) {
                console.error(`[UserUpdate] Failed to send LINE unbind notification:`, err);
            }
        }

        // ========== 處理名稱變更（原有邏輯）==========
        // 檢查名稱是否有變更
        if (beforeData.name === afterData.name) {
            return; // 名稱沒變，不需要更新
        }

        const newName = afterData.name;
        console.log(`[UserUpdate] User ${userId} name changed from "${beforeData.name}" to "${newName}"`);

        try {
            // 查詢該用戶建立的所有行程
            const eventsRef = db.collection(`artifacts/${APP_ID}/public/data/school_events`);
            const snapshot = await eventsRef.where('authorId', '==', userId).get();

            if (snapshot.empty) {
                console.log(`[UserUpdate] No events found for user ${userId}`);
                return;
            }

            // 批次更新所有行程的 authorName
            const batch = db.batch();
            let updateCount = 0;

            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { authorName: newName });
                updateCount++;
            });

            await batch.commit();
            console.log(`[UserUpdate] Updated ${updateCount} events with new author name`);
        } catch (err) {
            console.error(`[UserUpdate] Failed to update events for user ${userId}:`, err);
        }
    }
);

/**
 * LINE 綁定成功通知訊息
 */
function createLineBindSuccessMessage(userName) {
    return {
        type: "flex",
        altText: "🎉 LINE 綁定成功！",
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#00b894",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "🎉 綁定成功！",
                        color: "#ffffff",
                        size: "xl",
                        weight: "bold",
                        align: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: `${userName}，您好！`,
                        weight: "bold",
                        size: "md",
                        color: "#333333"
                    },
                    {
                        type: "text",
                        text: "您已成功綁定 LINE 通知服務",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "lg"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "✅ 新行程通知",
                                size: "sm",
                                color: "#00b894"
                            },
                            {
                                type: "text",
                                text: "✅ 行程異動提醒",
                                size: "sm",
                                color: "#00b894"
                            },
                            {
                                type: "text",
                                text: "✅ 留言通知",
                                size: "sm",
                                color: "#00b894"
                            },
                            {
                                type: "text",
                                text: "✅ 每日/每週摘要",
                                size: "sm",
                                color: "#00b894"
                            }
                        ]
                    },
                    {
                        type: "text",
                        text: "從現在開始，您將在 LINE 收到重要通知！",
                        size: "xs",
                        color: "#888888",
                        wrap: true,
                        margin: "lg"
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 開啟系統",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#00b894",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * LINE 取消綁定通知訊息
 */
function createLineUnbindMessage(userName) {
    return {
        type: "flex",
        altText: "📭 LINE 綁定已取消",
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#fdcb6e",
                paddingAll: "20px",
                contents: [
                    {
                        type: "text",
                        text: "📭 綁定已取消",
                        color: "#333333",
                        size: "xl",
                        weight: "bold",
                        align: "center"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: `${userName}，您好`,
                        weight: "bold",
                        size: "md",
                        color: "#333333"
                    },
                    {
                        type: "text",
                        text: "您的 LINE 通知綁定已取消",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "lg"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        backgroundColor: "#fff5f5",
                        cornerRadius: "8px",
                        paddingAll: "12px",
                        contents: [
                            {
                                type: "text",
                                text: "⚠️ 取消綁定後您將無法收到：",
                                size: "sm",
                                color: "#e17055",
                                weight: "bold"
                            },
                            {
                                type: "text",
                                text: "• 新行程指派通知\n• 行程異動提醒\n• 留言通知\n• 每日/每週摘要",
                                size: "xs",
                                color: "#666666",
                                wrap: true,
                                margin: "sm"
                            }
                        ]
                    },
                    {
                        type: "text",
                        text: "如需重新啟用通知，請至系統「帳號設定」重新綁定 LINE",
                        size: "xs",
                        color: "#888888",
                        wrap: true,
                        margin: "lg"
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "🔗 重新綁定",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#667eea",
                        height: "sm"
                    }
                ]
            }
        }
    };
}

/**
 * 新行程建立時通知被指派的用戶
 */
exports.onEventCreate = onDocumentCreated(
    {
        document: `artifacts/${APP_ID}/public/data/school_events/{eventId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const eventData = event.data.data();
        const eventId = event.params.eventId;
        const client = getLineClient();

        console.log(`[onEventCreate] New event created: ${eventId}`, eventData);

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        let allRecipients = [];

        // 🔒 重要：私人行程只能通知被指派者和建立者，優先檢查 isPrivate
        if (eventData.isPrivate) {
            // 私人行程：只通知被指派的用戶 + 建立者（不管 isPublic 設定）
            const targets = eventData.targets || [];
            const authorId = eventData.authorId;
            allRecipients = [...new Set([...targets, authorId].filter(Boolean))];
            console.log(`[LINE] Private event detected, will only notify ${allRecipients.length} specified users`);
        } else if (eventData.isPublic) {
            // 公開行程（非私人）：通知所有用戶
            console.log(`[LINE] Public event detected, will notify all users`);

            try {
                const allUsersSnapshot = await usersRef.get();
                allRecipients = allUsersSnapshot.docs.map(doc => doc.id);
                console.log(`[LINE] Found ${allRecipients.length} total users`);
            } catch (err) {
                console.error('[LINE] Failed to get all users:', err);
                return;
            }
        } else {
            // 非公開、非私人行程：通知被指派的用戶 + 建立者本人
            const targets = eventData.targets || [];
            const authorId = eventData.authorId;

            // 合併 targets 和 authorId（使用 Set 去除重複）
            allRecipients = [...new Set([...targets, authorId].filter(Boolean))];
            console.log(`[LINE] Regular event, will notify ${allRecipients.length} assigned users`);
        }

        if (allRecipients.length === 0) return;

        console.log(`[LINE] Will notify ${allRecipients.length} users with retry mechanism`);

        // 建立通知訊息
        const message = createEventFlexMessage(eventData, eventId);

        // 收集要發送的收件人並過濾出有效的 LINE 用戶
        const validRecipients = [];

        for (const targetId of allRecipients) {
            try {
                const userDoc = await usersRef.doc(targetId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                validRecipients.push({
                    targetId,
                    lineUserId,
                    message
                });
            } catch (err) {
                console.error(`[LINE] Failed to get user ${targetId}:`, err);
            }
        }

        if (validRecipients.length === 0) {
            console.log('[LINE] No valid recipients with LINE enabled');
            return;
        }

        console.log(`[LINE] Sending to ${validRecipients.length} LINE users with batch mode`);

        // 使用批次發送機制（包含自動節流和重試）
        const results = await pushMessagesBatch(client, validRecipients, 150);

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        console.log(`[LINE] Batch send complete: ${successCount} success, ${failCount} failed`);
    }
);

/**
 * 行程更新時通知被指派的用戶
 */
exports.onEventUpdate = onDocumentUpdated(
    {
        document: `artifacts/${APP_ID}/public/data/school_events/{eventId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();
        const eventId = event.params.eventId;
        const client = getLineClient();

        console.log(`Event updated: ${eventId}`);

        // 檢查哪些欄位有變更
        const changedFields = [];
        if (beforeData.title !== afterData.title) changedFields.push('title');
        if (beforeData.date !== afterData.date) changedFields.push('date');
        if (beforeData.time !== afterData.time) changedFields.push('time');
        if (JSON.stringify(beforeData.targets) !== JSON.stringify(afterData.targets)) changedFields.push('targets');
        if (JSON.stringify(beforeData.attachments) !== JSON.stringify(afterData.attachments)) changedFields.push('attachments');
        if (JSON.stringify(beforeData.completedBy) !== JSON.stringify(afterData.completedBy)) changedFields.push('completedBy');

        // ====================
        // 復原通知邏輯：行程從回收站復原
        // ====================
        const wasDeleted = !!beforeData.deletedAt;
        const isNowRestored = !afterData.deletedAt;

        if (wasDeleted && isNowRestored) {
            console.log(`[LINE] Event restored: ${eventId}`);

            const allTargets = [...new Set([
                afterData.authorId,
                ...(afterData.targets || [])
            ].filter(Boolean))];

            const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

            for (const targetId of allTargets) {
                try {
                    const userDoc = await usersRef.doc(targetId).get();
                    if (!userDoc.exists) continue;

                    const userData = userDoc.data();
                    if (!userData.lineUserId || !userData.lineNotifyEnabled) continue;

                    const message = {
                        type: 'flex',
                        altText: `↩️ 行程已復原：${afterData.title}`,
                        contents: {
                            type: 'bubble',
                            size: 'kilo',
                            header: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [{
                                    type: 'text',
                                    text: '↩️ 行程已復原',
                                    weight: 'bold',
                                    color: '#00b894',
                                    size: 'lg'
                                }],
                                backgroundColor: '#e8f8f5'
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    { type: 'text', text: afterData.title, weight: 'bold', size: 'md', wrap: true },
                                    { type: 'text', text: `📅 ${afterData.date} ${afterData.time || '全天'}`, size: 'sm', color: '#636e72', margin: 'md' },
                                    { type: 'text', text: `👤 發起人：${afterData.authorName}`, size: 'sm', color: '#636e72', margin: 'sm' }
                                ]
                            }
                        }
                    };

                    await pushMessageWithRetry(client, userData.lineUserId, message);
                    console.log(`[LINE] Restore notification sent to ${targetId}`);
                } catch (err) {
                    console.error(`Failed to notify ${targetId} about restore:`, err);
                }
            }
            return;
        }

        // ====================
        // 軟刪除通知邏輯：管理員刪除行程（移到回收站）
        // ====================
        const wasNotDeleted = !beforeData.deletedAt;
        const isNowDeleted = !!afterData.deletedAt;

        if (wasNotDeleted && isNowDeleted) {
            console.log(`[LINE] Event soft deleted: ${eventId}`);

            // 通知建立者和被指派的對象（排除刪除者本人，避免重複通知）
            const deletedBy = afterData.deletedBy;
            const allTargets = [...new Set([
                afterData.authorId,
                ...(afterData.targets || [])
            ].filter(id => id && id !== deletedBy))];

            if (allTargets.length === 0) {
                console.log('[LINE] No targets to notify about deletion (deleter is the only target)');
                return;
            }

            const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);
            const deleterName = afterData.deletedByName || '管理員';

            console.log(`[LINE] Deletion targets (author: ${afterData.authorId}, targets: ${JSON.stringify(afterData.targets)}, deletedBy: ${deletedBy})`);
            console.log(`[LINE] Final notification targets: ${JSON.stringify(allTargets)}`);

            for (const targetId of allTargets) {
                try {
                    const userDoc = await usersRef.doc(targetId).get();
                    if (!userDoc.exists) {
                        console.log(`[LINE] User ${targetId} not found in database`);
                        continue;
                    }

                    const userData = userDoc.data();
                    console.log(`[LINE] User ${targetId} - lineUserId: ${!!userData.lineUserId}, lineNotifyEnabled: ${userData.lineNotifyEnabled}`);
                    if (!userData.lineUserId || !userData.lineNotifyEnabled) {
                        console.log(`[LINE] Skipping ${targetId} - no LINE binding or disabled`);
                        continue;
                    }

                    const message = {
                        type: 'flex',
                        altText: `🗑️ 行程已刪除：${afterData.title}`,
                        contents: {
                            type: 'bubble',
                            size: 'kilo',
                            header: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [{
                                    type: 'text',
                                    text: '🗑️ 行程已刪除',
                                    weight: 'bold',
                                    color: '#e17055',
                                    size: 'lg'
                                }],
                                backgroundColor: '#ffeef0'
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    { type: 'text', text: afterData.title, weight: 'bold', size: 'md', wrap: true },
                                    { type: 'text', text: `📅 ${afterData.date} ${afterData.time || '全天'}`, size: 'sm', color: '#636e72', margin: 'md' },
                                    { type: 'text', text: `🗑️ 刪除者：${deleterName}`, size: 'sm', color: '#e17055', margin: 'sm' },
                                    { type: 'text', text: '💡 30天內可從回收站復原', size: 'xs', color: '#999', margin: 'md' }
                                ]
                            }
                        }
                    };

                    await pushMessageWithRetry(client, userData.lineUserId, message);
                    console.log(`[LINE] Deletion notification sent to ${targetId}`);
                } catch (err) {
                    console.error(`Failed to notify ${targetId} about deletion:`, err);
                }
            }
            return;
        }

        // ====================
        // 完成通知邏輯：檢測是否有新用戶標記完成
        // ====================
        const beforeCompletedBy = beforeData.completedBy || [];
        const afterCompletedBy = afterData.completedBy || [];
        const newlyCompleted = afterCompletedBy.filter(id => !beforeCompletedBy.includes(id));

        if (newlyCompleted.length > 0) {
            console.log(`[LINE] Completion detected by: ${newlyCompleted.join(', ')}`);

            // 查詢完成者的名稱
            const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

            for (const completerId of newlyCompleted) {
                try {
                    // 獲取完成者名稱
                    const completerDoc = await usersRef.doc(completerId).get();
                    const completerName = completerDoc.exists ? completerDoc.data().name : '用戶';

                    // 通知對象：發起人 + 所有被指派的用戶 + 完成者自己
                    const notifyTargets = [...new Set([
                        afterData.authorId,
                        ...(afterData.targets || []),
                        completerId  // 完成者自己也收到確認通知
                    ].filter(Boolean))];

                    console.log(`[LINE] Will notify ${notifyTargets.length} users about completion`);

                    // 發送完成通知
                    for (const targetId of notifyTargets) {
                        try {
                            const userDoc = await usersRef.doc(targetId).get();
                            if (!userDoc.exists) continue;

                            const userData = userDoc.data();
                            const lineUserId = userData.lineUserId;
                            const lineNotifyEnabled = userData.lineNotifyEnabled;

                            if (!lineUserId || !lineNotifyEnabled) continue;

                            const message = createCompletionFlexMessage(afterData, completerName);
                            await pushMessageWithRetry(client, lineUserId, message);
                            console.log(`[LINE] Completion notification sent to ${targetId}`);
                        } catch (err) {
                            console.error(`Failed to notify ${targetId} about completion:`, err);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to process completion by ${completerId}:`, err);
                }
            }

            // 完成通知已發送，不需要再發送更新通知
            return;
        }

        // ====================
        // 一般更新通知邏輯
        // ====================

        // 如果只是更新 completedBy, readBy, updatedAt 等狀態欄位，不發送通知
        const importantFields = ['title', 'date', 'time', 'targets', 'isPublic', 'isPrivate', 'announcementType', 'pinned', 'attachments'];
        const hasImportantChanges = importantFields.some(field =>
            JSON.stringify(beforeData[field]) !== JSON.stringify(afterData[field])
        );

        if (!hasImportantChanges) {
            console.log('No important changes detected, skipping notification');
            return;
        }

        // 特殊情況：如果只有附件變更，且是從無附件變成有附件（新建行程後的初始附件上傳）
        // 這種情況不應該發送「更新通知」，因為 onCreate 已經發送過通知了
        const onlyAttachmentChanged = changedFields.length === 1 && changedFields[0] === 'attachments';
        const beforeAttachments = beforeData.attachments || [];
        const afterAttachments = afterData.attachments || [];
        const isInitialAttachmentUpload = onlyAttachmentChanged &&
            beforeAttachments.length === 0 &&
            afterAttachments.length > 0;

        if (isInitialAttachmentUpload) {
            console.log('Initial attachment upload detected (new event), skipping update notification');
            return;
        }

        // 取得被指派的用戶（包含更新前後的目標）+ 建立者
        const allTargets = [...new Set([
            ...(beforeData.targets || []),
            ...(afterData.targets || []),
            afterData.authorId  // 同時通知建立者
        ].filter(Boolean))];
        if (allTargets.length === 0) return;

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        for (const targetId of allTargets) {
            try {
                const userDoc = await usersRef.doc(targetId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知 (使用精美 Flex Message 含 Quick Reply)
                const message = createEventUpdateFlexMessage(afterData, changedFields, eventId);

                await pushMessageWithRetry(client, lineUserId, message);
                console.log(`[LINE] Update notification sent to ${targetId}`);
            } catch (err) {
                console.error(`Failed to notify ${targetId}:`, err);
            }
        }
    }
);

/**
 * 行程刪除時通知建立者和被指派的用戶
 */
exports.onEventDelete = onDocumentDeleted(
    {
        document: `artifacts/${APP_ID}/public/data/school_events/{eventId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const eventData = event.data.data();
        const eventId = event.params.eventId;
        const client = getLineClient();

        console.log(`Event deleted: ${eventId}`, eventData);

        // 取得被指派的用戶 + 建立者
        const allTargets = [...new Set([
            ...(eventData.targets || []),
            eventData.authorId
        ].filter(Boolean))];

        if (allTargets.length === 0) return;

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        for (const targetId of allTargets) {
            try {
                const userDoc = await usersRef.doc(targetId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知 (使用行程刪除的 Flex Message)
                const message = createEventDeleteFlexMessage(eventData);

                await pushMessageWithRetry(client, lineUserId, message);
                console.log(`[LINE] Delete notification sent to ${targetId}`);
            } catch (err) {
                console.error(`Failed to notify ${targetId}:`, err);
            }
        }
    }
);

/**
 * 新留言建立時通知被 @提及的用戶
 */
exports.onCommentCreate = onDocumentCreated(
    {
        document: `artifacts/${APP_ID}/public/data/school_events/{eventId}/comments/{commentId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const commentData = event.data.data();
        const eventId = event.params.eventId;
        const client = getLineClient();

        console.log(`New comment on event ${eventId}:`, commentData);

        // 取得被 @提及的用戶
        const mentions = commentData.mentions || [];
        if (mentions.length === 0) return;

        // 取得事件標題
        const eventDoc = await db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`).get();
        const eventTitle = eventDoc.exists ? eventDoc.data().title : "未知行程";

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        for (const mentionedId of mentions) {
            // 允許使用者 @自己也能收到 LINE 通知（方便測試和自我提醒）
            // if (mentionedId === commentData.authorId) continue;

            try {
                const userDoc = await usersRef.doc(mentionedId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知 (使用精美 Flex Message)
                const contentPreview = commentData.content.substring(0, 50) + (commentData.content.length > 50 ? "..." : "");
                const message = createMentionFlexMessage(commentData.authorName, eventTitle, contentPreview);

                await pushMessageWithRetry(client, lineUserId, message);
                console.log(`[LINE] Mention notification sent to ${mentionedId}`);
            } catch (err) {
                console.error(`Failed to notify mention ${mentionedId}:`, err);
            }
        }
    }
);

/**
 * 留言更新時通知新增的 @提及用戶
 */
exports.onCommentUpdate = onDocumentUpdated(
    {
        document: `artifacts/${APP_ID}/public/data/school_events/{eventId}/comments/{commentId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();
        const eventId = event.params.eventId;
        const client = getLineClient();

        console.log(`Comment updated on event ${eventId}`);

        // 取得更新後的 mentions (通知所有被提及的用戶)
        const mentions = afterData.mentions || [];

        if (mentions.length === 0) {
            console.log('No mentions in updated comment');
            return;
        }

        console.log(`Mentions in updated comment:`, mentions);

        // 取得事件標題
        const eventDoc = await db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`).get();
        const eventTitle = eventDoc.exists ? eventDoc.data().title : "未知行程";

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        for (const mentionedId of mentions) {
            // 允許使用者 @自己也能收到 LINE 通知
            // if (mentionedId === afterData.authorId) continue;

            try {
                const userDoc = await usersRef.doc(mentionedId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知 (使用留言編輯的 Flex Message)
                const contentPreview = afterData.content.substring(0, 50) + (afterData.content.length > 50 ? "..." : "");
                const message = createCommentEditFlexMessage(afterData.authorName, eventTitle, contentPreview);

                await pushMessageWithRetry(client, lineUserId, message);
                console.log(`[LINE] Comment edit notification sent to ${mentionedId}`);
            } catch (err) {
                console.error(`Failed to notify mention ${mentionedId}:`, err);
            }
        }
    }
);

/**
 * 留言刪除時通知被 @提及的用戶
 */
exports.onCommentDelete = onDocumentDeleted(
    {
        document: `artifacts/${APP_ID}/public/data/school_events/{eventId}/comments/{commentId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const commentData = event.data.data();
        const eventId = event.params.eventId;
        const client = getLineClient();

        console.log(`Comment deleted on event ${eventId}:`, commentData);

        // 取得被 @提及的用戶
        const mentions = commentData.mentions || [];
        if (mentions.length === 0) return;

        // 取得事件標題
        const eventDoc = await db.doc(`artifacts/${APP_ID}/public/data/school_events/${eventId}`).get();
        const eventTitle = eventDoc.exists ? eventDoc.data().title : "未知行程";

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        for (const mentionedId of mentions) {
            try {
                const userDoc = await usersRef.doc(mentionedId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知 (使用留言刪除的 Flex Message)
                const contentPreview = commentData.content.substring(0, 50) + (commentData.content.length > 50 ? "..." : "");
                const message = createCommentDeleteFlexMessage(commentData.authorName, eventTitle, contentPreview);

                await pushMessageWithRetry(client, lineUserId, message);
                console.log(`[LINE] Comment delete notification sent to ${mentionedId}`);
            } catch (err) {
                console.error(`Failed to notify mention ${mentionedId}:`, err);
            }
        }
    }
);

/**
 * 定時檢查提醒並發送 LINE 通知 (每分鐘執行)
 */
exports.checkReminders = onSchedule(
    {
        schedule: "every 1 minutes",
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async () => {
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        const client = getLineClient();

        console.log(`Checking reminders at ${now.toISOString()}`);

        // 查詢未觸發且時間已到的提醒
        const remindersRef = db.collection(`artifacts/${APP_ID}/public/data/reminders`);
        const snapshot = await remindersRef
            .where("triggered", "==", false)
            .where("reminderTime", "<=", now.toISOString())
            .where("reminderTime", ">=", twoMinutesAgo.toISOString())
            .get();

        console.log(`Found ${snapshot.size} reminders to process`);

        for (const doc of snapshot.docs) {
            const reminder = doc.data();

            try {
                // 取得用戶的 LINE ID
                const userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${reminder.userId}`).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (lineUserId && lineNotifyEnabled) {
                    // 發送 LINE 通知 (使用精美 Flex Message 含 Quick Reply)
                    const message = createReminderFlexMessage(reminder.eventTitle, reminder.eventDate, reminder.eventTime, reminder.eventId);

                    await pushMessageWithRetry(client, lineUserId, message);
                    console.log(`[LINE] Reminder sent to ${reminder.userId}`);
                }

                // 標記為已觸發
                await doc.ref.update({ triggered: true, lineNotified: true });
            } catch (err) {
                console.error(`Failed to process reminder ${doc.id}:`, err);
            }
        }
    }
);

/**
 * 手動發送 LINE 通知的 HTTP 端點 (用於測試)
 */
exports.sendLineNotify = onRequest(
    {
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (req, res) => {
        // 需要認證
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).send("Unauthorized");
        }

        const { lineUserId, message } = req.body;

        if (!lineUserId || !message) {
            return res.status(400).send("Missing lineUserId or message");
        }

        try {
            const client = getLineClient();
            await client.pushMessage(lineUserId, {
                type: "text",
                text: message
            });
            res.status(200).json({ success: true });
        } catch (err) {
            console.error("Send LINE notify error:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    }
);

// ============================================
// Delete Firebase Auth User
// 刪除使用者的 Firebase Authentication 帳號
// ============================================
exports.deleteAuthUser = onRequest(
    {
        cors: true,
        region: "asia-east1"
    },
    async (req, res) => {
        // 需要認證 - 只有管理員可以呼叫
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const { email, uid } = req.body;

        if (!email && !uid) {
            return res.status(400).json({
                success: false,
                error: "Missing email or uid"
            });
        }

        try {
            const auth = getAuth();
            let userRecord;

            // 根據 email 或 uid 找到使用者
            if (uid) {
                userRecord = await auth.getUser(uid);
            } else if (email) {
                userRecord = await auth.getUserByEmail(email);
            }

            if (!userRecord) {
                return res.status(404).json({
                    success: false,
                    error: "User not found in Firebase Auth"
                });
            }

            // 刪除 Firebase Auth 帳號
            await auth.deleteUser(userRecord.uid);
            console.log(`[Admin] Deleted auth user: ${userRecord.uid} (${email || uid})`);

            res.status(200).json({
                success: true,
                message: `Auth user deleted: ${userRecord.uid}`
            });
        } catch (err) {
            console.error("[Admin] Delete auth user error:", err);

            // 如果找不到使用者，回傳成功（可能已經被刪除了）
            if (err.code === "auth/user-not-found") {
                return res.status(200).json({
                    success: true,
                    message: "User already deleted or not found"
                });
            }

            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

/**
 * 新增提醒時通知用戶確認
 */
exports.onReminderCreate = onDocumentCreated(
    {
        document: `artifacts/${APP_ID}/public/data/reminders/{reminderId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const reminderData = event.data.data();
        const reminderId = event.params.reminderId;
        const client = getLineClient();

        console.log(`Reminder created: ${reminderId}`, reminderData);

        try {
            // 取得用戶的 LINE ID
            const userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${reminderData.userId}`).get();
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            const lineUserId = userData.lineUserId;
            const lineNotifyEnabled = userData.lineNotifyEnabled;

            if (!lineUserId || !lineNotifyEnabled) return;

            // 發送 LINE 通知 (提醒設定確認)
            const message = createReminderSetFlexMessage(
                reminderData.eventTitle,
                reminderData.eventDate,
                reminderData.eventTime,
                reminderData.minutesBefore
            );

            await client.pushMessage(lineUserId, message);
            console.log(`LINE reminder set confirmation sent to ${reminderData.userId}`);
        } catch (err) {
            console.error(`Failed to send reminder set confirmation:`, err);
        }
    }
);

/**
 * 刪除提醒時通知用戶確認
 */
exports.onReminderDelete = onDocumentDeleted(
    {
        document: `artifacts/${APP_ID}/public/data/reminders/{reminderId}`,
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        const reminderData = event.data.data();
        const reminderId = event.params.reminderId;
        const client = getLineClient();

        console.log(`Reminder deleted: ${reminderId}`, reminderData);

        // 如果提醒已經觸發過，不發送刪除通知
        if (reminderData.triggered) {
            console.log('Reminder was already triggered, skipping delete notification');
            return;
        }

        try {
            // 取得用戶的 LINE ID
            const userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${reminderData.userId}`).get();
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            const lineUserId = userData.lineUserId;
            const lineNotifyEnabled = userData.lineNotifyEnabled;

            if (!lineUserId || !lineNotifyEnabled) return;

            // 發送 LINE 通知 (提醒刪除確認)
            const message = createReminderDeleteFlexMessage(
                reminderData.eventTitle,
                reminderData.minutesBefore
            );

            await client.pushMessage(lineUserId, message);
            console.log(`LINE reminder delete confirmation sent to ${reminderData.userId}`);
        } catch (err) {
            console.error(`Failed to send reminder delete confirmation:`, err);
        }
    }
);

/**
 * 通知使用者 LINE 提醒同步狀態變更
 */
exports.notifySyncStatus = onRequest(
    {
        region: "asia-east1",
        cors: true,
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (req, res) => {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const { userId, enabled } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        try {
            const client = getLineClient();

            // 取得使用者的 LINE ID
            const userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${userId}`).get();
            if (!userDoc.exists) {
                return res.status(404).json({ error: 'User not found' });
            }

            const userData = userDoc.data();
            const lineUserId = userData.lineUserId;
            const lineNotifyEnabled = userData.lineNotifyEnabled;

            if (!lineUserId) {
                return res.status(400).json({ error: 'User has not linked LINE account' });
            }

            if (!lineNotifyEnabled) {
                return res.status(400).json({ error: 'LINE notifications are disabled' });
            }

            // 發送同步狀態通知
            const message = createSyncStatusFlexMessage(enabled);
            await client.pushMessage(lineUserId, message);

            console.log(`LINE sync status notification sent to ${userId}: ${enabled ? 'enabled' : 'disabled'}`);
            return res.status(200).json({ success: true, message: 'Notification sent' });
        } catch (err) {
            console.error('Failed to send sync status notification:', err);
            return res.status(500).json({ error: err.message });
        }
    }
);

// ============================================
// 每日行程摘要通知 (Daily Summary)
// ============================================

/**
 * 建立每日行程摘要 Flex Message
 * @param {string} userName - 使用者名稱
 * @param {string} dateStr - 日期字串
 * @param {Array} events - 當日行程陣列
 */
function createDailySummaryFlexMessage(userName, dateStr, events) {
    // 將日期轉為易讀格式
    const date = new Date(dateStr + 'T00:00:00+08:00');
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const displayDate = `${date.getMonth() + 1}/${date.getDate()} (${weekDays[date.getDay()]})`;

    // 排序行程 (全天優先，然後按時間)
    const sortedEvents = [...events].sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (a.time || '00:00').localeCompare(b.time || '00:00');
    });

    // 統計
    const totalCount = events.length;
    const importantCount = events.filter(e => e.isPublic || e.announcementType === 'important' || e.announcementType === 'urgent').length;

    // 建立行程列表 (最多顯示 5 項)
    const eventItems = sortedEvents.slice(0, 5).map((event, index) => {
        const timeDisplay = event.isAllDay ? '🌅 全天' : `⏰ ${event.time || '--:--'}`;
        const isImportant = event.isPublic || event.announcementType === 'important' || event.announcementType === 'urgent';
        const titlePrefix = isImportant ? '⭐ ' : '';

        return {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
                {
                    type: "text",
                    text: timeDisplay,
                    size: "xs",
                    color: "#888888",
                    flex: 2
                },
                {
                    type: "text",
                    text: titlePrefix + (event.title.length > 18 ? event.title.substring(0, 18) + '...' : event.title),
                    size: "sm",
                    color: isImportant ? "#e17055" : "#333333",
                    flex: 5,
                    wrap: true,
                    weight: isImportant ? "bold" : "regular"
                }
            ]
        };
    });

    // 如果超過 5 項，加入提示
    if (events.length > 5) {
        eventItems.push({
            type: "text",
            text: `... 還有 ${events.length - 5} 項行程`,
            size: "xs",
            color: "#888888",
            margin: "sm",
            align: "end"
        });
    }

    // 空的行程列表
    if (events.length === 0) {
        eventItems.push({
            type: "text",
            text: "🎉 今天沒有排定的行程！",
            size: "sm",
            color: "#00b894",
            align: "center"
        });
    }

    return {
        type: "flex",
        altText: `📅 ${displayDate} 行程摘要 (${totalCount} 項)`,
        contents: {
            type: "bubble",
            size: "mega",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#667eea",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "☀️",
                                size: "xl",
                                flex: 0
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                margin: "md",
                                contents: [
                                    {
                                        type: "text",
                                        text: "每日行程摘要",
                                        color: "#ffffff",
                                        size: "lg",
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: `${userName}，早安！`,
                                        color: "#ffffffcc",
                                        size: "sm"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "lg",
                contents: [
                    // 日期與統計
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                contents: [
                                    {
                                        type: "text",
                                        text: displayDate,
                                        size: "xl",
                                        weight: "bold",
                                        color: "#333333"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                flex: 1,
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "box",
                                        layout: "vertical",
                                        backgroundColor: "#667eea20",
                                        cornerRadius: "8px",
                                        paddingAll: "8px",
                                        alignItems: "center",
                                        contents: [
                                            {
                                                type: "text",
                                                text: String(totalCount),
                                                size: "xl",
                                                weight: "bold",
                                                color: "#667eea"
                                            },
                                            {
                                                type: "text",
                                                text: "總計",
                                                size: "xs",
                                                color: "#667eea"
                                            }
                                        ]
                                    },
                                    {
                                        type: "box",
                                        layout: "vertical",
                                        backgroundColor: importantCount > 0 ? "#e1705520" : "#00b89420",
                                        cornerRadius: "8px",
                                        paddingAll: "8px",
                                        alignItems: "center",
                                        contents: [
                                            {
                                                type: "text",
                                                text: String(importantCount),
                                                size: "xl",
                                                weight: "bold",
                                                color: importantCount > 0 ? "#e17055" : "#00b894"
                                            },
                                            {
                                                type: "text",
                                                text: "重要",
                                                size: "xs",
                                                color: importantCount > 0 ? "#e17055" : "#00b894"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    // 分隔線
                    {
                        type: "separator"
                    },
                    // 行程列表
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        contents: eventItems
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "📅 查看完整行程",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#667eea",
                        height: "sm"
                    }
                ]
            }
        },
        quickReply: {
            items: [
                createQuickReplyUriItem("📅 前往查看", LINK_URL)
            ]
        }
    };
}

/**
 * 每日行程摘要 - 排程函數
 * 每天早上 8:00 (台灣時間) 發送當日行程摘要給有行程的使用者
 */
exports.dailySummaryNotification = onSchedule(
    {
        schedule: "0 8 * * *", // 每天 08:00 執行
        timeZone: "Asia/Taipei",
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        console.log('[Daily Summary] Starting daily summary notification...');

        const client = getLineClient();

        // 取得今日日期 (台灣時間)
        const now = new Date();
        const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
        const year = taiwanTime.getFullYear();
        const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
        const day = String(taiwanTime.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        console.log(`[Daily Summary] Date: ${todayStr}`);

        try {
            // 1. 取得所有使用者
            const usersSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/users`).get();
            const users = [];
            usersSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.lineUserId && data.lineNotifyEnabled) {
                    users.push({ id: doc.id, ...data });
                }
            });

            console.log(`[Daily Summary] Found ${users.length} users with LINE notifications enabled`);

            if (users.length === 0) {
                console.log('[Daily Summary] No users to notify');
                return;
            }

            // 2. 取得今日所有行程
            const eventsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/events`)
                .where('date', '==', todayStr)
                .get();

            const todayEvents = [];
            eventsSnapshot.forEach(doc => {
                todayEvents.push({ id: doc.id, ...doc.data() });
            });

            // 也取得跨日行程 (endDate >= today && date <= today)
            const multiDaySnapshot = await db.collection(`artifacts/${APP_ID}/public/data/events`)
                .where('endDate', '>=', todayStr)
                .get();

            multiDaySnapshot.forEach(doc => {
                const data = doc.data();
                // 確保行程開始日期 <= 今天，且尚未被加入
                if (data.date <= todayStr && !todayEvents.find(e => e.id === doc.id)) {
                    todayEvents.push({ id: doc.id, ...data });
                }
            });

            console.log(`[Daily Summary] Found ${todayEvents.length} events for today`);

            // 3. 對每個使用者，篩選出與他相關的行程並發送通知
            let sentCount = 0;

            for (const user of users) {
                try {
                    // 篩選與此使用者相關的行程
                    const userEvents = todayEvents.filter(event => {
                        // 使用者是 target 或是 author
                        const isTarget = event.targets && event.targets.includes(user.id);
                        const isAuthor = event.authorId === user.id;
                        return isTarget || isAuthor;
                    });

                    // 如果沒有相關行程，跳過此使用者
                    if (userEvents.length === 0) {
                        continue;
                    }

                    console.log(`[Daily Summary] Sending ${userEvents.length} events to user ${user.name || user.id}`);

                    // 建立並發送每日摘要訊息
                    const message = createDailySummaryFlexMessage(
                        user.name || '使用者',
                        todayStr,
                        userEvents
                    );

                    await client.pushMessage(user.lineUserId, message);
                    sentCount++;

                    // 避免 API 限流，每次發送後等待 100ms
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (userErr) {
                    console.error(`[Daily Summary] Failed to notify user ${user.id}:`, userErr.message);
                }
            }

            console.log(`[Daily Summary] Completed! Sent ${sentCount} notifications`);

        } catch (err) {
            console.error('[Daily Summary] Error:', err);
            throw err;
        }
    }
);

/**
 * 手動觸發每日摘要 (用於測試)
 */
exports.triggerDailySummary = onRequest(
    {
        region: "asia-east1",
        cors: true,
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (req, res) => {
        console.log('[Daily Summary] Manual trigger started...');

        const client = getLineClient();
        const { userId, testDate } = req.query;

        // 使用測試日期或今日日期
        let targetDate;
        if (testDate) {
            targetDate = testDate;
        } else {
            const now = new Date();
            const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
            const year = taiwanTime.getFullYear();
            const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
            const day = String(taiwanTime.getDate()).padStart(2, '0');
            targetDate = `${year}-${month}-${day}`;
        }

        console.log(`[Daily Summary] Target date: ${targetDate}`);

        try {
            // 如果指定了 userId，只發送給該使用者
            if (userId) {
                let userDoc;
                let userData;
                let internalUserId = userId;

                // 檢查是否為 LINE User ID (以 U 開頭)
                if (userId.startsWith('U') && userId.length > 30) {
                    // 用 LINE User ID 查詢使用者
                    const usersSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/users`)
                        .where('lineUserId', '==', userId)
                        .limit(1)
                        .get();

                    if (usersSnapshot.empty) {
                        return res.status(404).json({
                            error: 'User not found with this LINE User ID',
                            hint: 'Make sure you have linked your LINE account in the app'
                        });
                    }

                    userDoc = usersSnapshot.docs[0];
                    userData = userDoc.data();
                    internalUserId = userDoc.id;
                } else {
                    // 用內部 userId 查詢
                    userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${userId}`).get();
                    if (!userDoc.exists) {
                        return res.status(404).json({ error: 'User not found' });
                    }
                    userData = userDoc.data();
                }

                if (!userData.lineUserId) {
                    return res.status(400).json({ error: 'User has not linked LINE account' });
                }

                // 取得該使用者的今日行程
                const eventsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/events`)
                    .where('date', '==', targetDate)
                    .get();

                const userEvents = [];
                eventsSnapshot.forEach(doc => {
                    const data = doc.data();
                    const isTarget = data.targets && data.targets.includes(internalUserId);
                    const isAuthor = data.authorId === internalUserId;
                    if (isTarget || isAuthor) {
                        userEvents.push({ id: doc.id, ...data });
                    }
                });

                // 發送摘要
                const message = createDailySummaryFlexMessage(
                    userData.name || '使用者',
                    targetDate,
                    userEvents
                );

                await client.pushMessage(userData.lineUserId, message);

                return res.status(200).json({
                    success: true,
                    date: targetDate,
                    eventsCount: userEvents.length,
                    message: `Daily summary sent to ${userData.name || userId}`
                });
            } else {
                return res.status(400).json({
                    error: 'Please specify userId query parameter for testing',
                    example: '/triggerDailySummary?userId=xxx&testDate=2026-01-05'
                });
            }
        } catch (err) {
            console.error('[Daily Summary] Manual trigger error:', err);
            return res.status(500).json({ error: err.message });
        }
    }
);

// ============================================
// 週報提醒通知 (Weekly Summary)
// ============================================

/**
 * 建立週報摘要 Flex Message
 * @param {string} userName - 使用者名稱
 * @param {string} weekStartStr - 週一日期
 * @param {string} weekEndStr - 週日日期
 * @param {Array} events - 本週行程陣列
 */
function createWeeklySummaryFlexMessage(userName, weekStartStr, weekEndStr, events) {
    // 格式化日期顯示
    const startDate = new Date(weekStartStr + 'T00:00:00+08:00');
    const endDate = new Date(weekEndStr + 'T00:00:00+08:00');
    const displayPeriod = `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`;

    // 按日期分組
    const eventsByDate = {};
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    events.forEach(e => {
        if (!eventsByDate[e.date]) {
            eventsByDate[e.date] = [];
        }
        eventsByDate[e.date].push(e);
    });

    // 統計
    const totalCount = events.length;
    const importantCount = events.filter(e => e.isPublic || e.announcementType === 'important' || e.announcementType === 'urgent').length;

    // 建立每日行程列表 (最多顯示 7 天各 2 項)
    const dayItems = [];
    const sortedDates = Object.keys(eventsByDate).sort();

    sortedDates.slice(0, 5).forEach(dateStr => {
        const dayEvents = eventsByDate[dateStr];
        const date = new Date(dateStr + 'T00:00:00+08:00');
        const dayLabel = `${date.getMonth() + 1}/${date.getDate()} (${weekDays[date.getDay()]})`;

        dayItems.push({
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
                {
                    type: "text",
                    text: dayLabel,
                    size: "sm",
                    color: "#667eea",
                    weight: "bold"
                },
                ...dayEvents.slice(0, 2).map(event => ({
                    type: "text",
                    text: (event.isPublic ? "⭐ " : "• ") +
                        (event.title.length > 20 ? event.title.substring(0, 20) + '...' : event.title),
                    size: "xs",
                    color: event.isPublic ? "#e17055" : "#333333",
                    wrap: true
                })),
                ...(dayEvents.length > 2 ? [{
                    type: "text",
                    text: `  +${dayEvents.length - 2} 項...`,
                    size: "xs",
                    color: "#888888"
                }] : [])
            ]
        });
    });

    if (sortedDates.length > 5) {
        dayItems.push({
            type: "text",
            text: `還有 ${sortedDates.length - 5} 天有行程...`,
            size: "xs",
            color: "#888888",
            margin: "sm"
        });
    }

    // 空的行程列表
    if (events.length === 0) {
        dayItems.push({
            type: "text",
            text: "🎉 本週沒有排定的行程！",
            size: "sm",
            color: "#00b894",
            align: "center"
        });
    }

    return {
        type: "flex",
        altText: `📆 本週行程總覽 (${displayPeriod}) - ${totalCount} 項`,
        contents: {
            type: "bubble",
            size: "mega",
            header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#0984e3",
                paddingAll: "15px",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "📆",
                                size: "xl",
                                flex: 0
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                margin: "md",
                                contents: [
                                    {
                                        type: "text",
                                        text: "本週行程總覽",
                                        color: "#ffffff",
                                        size: "lg",
                                        weight: "bold"
                                    },
                                    {
                                        type: "text",
                                        text: `${userName}，週一愉快！`,
                                        color: "#ffffffcc",
                                        size: "sm"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "15px",
                spacing: "lg",
                contents: [
                    // 期間與統計
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                contents: [
                                    {
                                        type: "text",
                                        text: displayPeriod,
                                        size: "lg",
                                        weight: "bold",
                                        color: "#333333"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                flex: 1,
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "box",
                                        layout: "vertical",
                                        backgroundColor: "#0984e320",
                                        cornerRadius: "8px",
                                        paddingAll: "8px",
                                        alignItems: "center",
                                        contents: [
                                            {
                                                type: "text",
                                                text: String(totalCount),
                                                size: "xl",
                                                weight: "bold",
                                                color: "#0984e3"
                                            },
                                            {
                                                type: "text",
                                                text: "總計",
                                                size: "xs",
                                                color: "#0984e3"
                                            }
                                        ]
                                    },
                                    {
                                        type: "box",
                                        layout: "vertical",
                                        backgroundColor: importantCount > 0 ? "#e1705520" : "#00b89420",
                                        cornerRadius: "8px",
                                        paddingAll: "8px",
                                        alignItems: "center",
                                        contents: [
                                            {
                                                type: "text",
                                                text: String(importantCount),
                                                size: "xl",
                                                weight: "bold",
                                                color: importantCount > 0 ? "#e17055" : "#00b894"
                                            },
                                            {
                                                type: "text",
                                                text: "重要",
                                                size: "xs",
                                                color: importantCount > 0 ? "#e17055" : "#00b894"
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    // 分隔線
                    {
                        type: "separator"
                    },
                    // 行程列表
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "md",
                        contents: dayItems
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: "📅 查看完整行程",
                            uri: LINK_URL
                        },
                        style: "primary",
                        color: "#0984e3",
                        height: "sm"
                    }
                ]
            }
        },
        quickReply: {
            items: [
                createQuickReplyUriItem("📅 前往查看", LINK_URL)
            ]
        }
    };
}

/**
 * 週報提醒 - 排程函數
 * 每週一早上 8:00 (台灣時間) 發送本週行程總覽
 */
exports.weeklySummaryNotification = onSchedule(
    {
        schedule: "0 8 * * 1", // 每週一 08:00 執行
        timeZone: "Asia/Taipei",
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        console.log('[Weekly Summary] Starting weekly summary notification...');

        const client = getLineClient();

        // 取得本週一和週日的日期 (台灣時間)
        const now = new Date();
        const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

        // 本週一 (今天)
        const monday = new Date(taiwanTime);
        const mondayStr = formatDate(monday);

        // 本週日
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const sundayStr = formatDate(sunday);

        console.log(`[Weekly Summary] Week: ${mondayStr} - ${sundayStr}`);

        function formatDate(d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        try {
            // 1. 取得所有使用者
            const usersSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/users`).get();
            const users = [];
            usersSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.lineUserId && data.lineNotifyEnabled) {
                    users.push({ id: doc.id, ...data });
                }
            });

            console.log(`[Weekly Summary] Found ${users.length} users with LINE notifications enabled`);

            if (users.length === 0) {
                console.log('[Weekly Summary] No users to notify');
                return;
            }

            // 2. 取得本週所有行程
            const eventsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/events`)
                .where('date', '>=', mondayStr)
                .where('date', '<=', sundayStr)
                .get();

            const weekEvents = [];
            eventsSnapshot.forEach(doc => {
                weekEvents.push({ id: doc.id, ...doc.data() });
            });

            console.log(`[Weekly Summary] Found ${weekEvents.length} events for this week`);

            // 3. 對每個使用者，篩選出與他相關的行程並發送通知
            let sentCount = 0;

            for (const user of users) {
                try {
                    // 篩選與此使用者相關的行程
                    const userEvents = weekEvents.filter(event => {
                        const isTarget = event.targets && event.targets.includes(user.id);
                        const isAuthor = event.authorId === user.id;
                        return isTarget || isAuthor;
                    });

                    // 如果沒有相關行程，跳過此使用者
                    if (userEvents.length === 0) {
                        continue;
                    }

                    console.log(`[Weekly Summary] Sending ${userEvents.length} events to user ${user.name || user.id}`);

                    // 建立並發送週報摘要訊息
                    const message = createWeeklySummaryFlexMessage(
                        user.name || '使用者',
                        mondayStr,
                        sundayStr,
                        userEvents
                    );

                    await client.pushMessage(user.lineUserId, message);
                    sentCount++;

                    // 避免 API 限流
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (userErr) {
                    console.error(`[Weekly Summary] Failed to notify user ${user.id}:`, userErr.message);
                }
            }

            console.log(`[Weekly Summary] Completed! Sent ${sentCount} notifications`);

        } catch (err) {
            console.error('[Weekly Summary] Error:', err);
            throw err;
        }
    }
);

/**
 * 手動觸發週報 (用於測試)
 */
exports.triggerWeeklySummary = onRequest(
    {
        region: "asia-east1",
        cors: true,
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (req, res) => {
        console.log('[Weekly Summary] Manual trigger started...');

        const client = getLineClient();
        const { userId } = req.query;

        // 計算本週日期範圍
        const now = new Date();
        const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

        // 找到本週一
        const dayOfWeek = taiwanTime.getDay();
        const monday = new Date(taiwanTime);
        monday.setDate(taiwanTime.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

        // 本週日
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        function formatDate(d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const mondayStr = formatDate(monday);
        const sundayStr = formatDate(sunday);

        console.log(`[Weekly Summary] Week: ${mondayStr} - ${sundayStr}`);

        try {
            if (userId) {
                let userDoc;
                let userData;
                let internalUserId = userId;

                // 檢查是否為 LINE User ID
                if (userId.startsWith('U') && userId.length > 30) {
                    const usersSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/users`)
                        .where('lineUserId', '==', userId)
                        .limit(1)
                        .get();

                    if (usersSnapshot.empty) {
                        return res.status(404).json({ error: 'User not found with this LINE User ID' });
                    }

                    userDoc = usersSnapshot.docs[0];
                    userData = userDoc.data();
                    internalUserId = userDoc.id;
                } else {
                    userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${userId}`).get();
                    if (!userDoc.exists) {
                        return res.status(404).json({ error: 'User not found' });
                    }
                    userData = userDoc.data();
                }

                if (!userData.lineUserId) {
                    return res.status(400).json({ error: 'User has not linked LINE account' });
                }

                // 取得本週行程
                const eventsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/events`)
                    .where('date', '>=', mondayStr)
                    .where('date', '<=', sundayStr)
                    .get();

                const userEvents = [];
                eventsSnapshot.forEach(doc => {
                    const data = doc.data();
                    const isTarget = data.targets && data.targets.includes(internalUserId);
                    const isAuthor = data.authorId === internalUserId;
                    if (isTarget || isAuthor) {
                        userEvents.push({ id: doc.id, ...data });
                    }
                });

                // 發送週報
                const message = createWeeklySummaryFlexMessage(
                    userData.name || '使用者',
                    mondayStr,
                    sundayStr,
                    userEvents
                );

                await client.pushMessage(userData.lineUserId, message);

                return res.status(200).json({
                    success: true,
                    week: `${mondayStr} - ${sundayStr}`,
                    eventsCount: userEvents.length,
                    message: `Weekly summary sent to ${userData.name || userId}`
                });
            } else {
                return res.status(400).json({
                    error: 'Please specify userId query parameter',
                    example: '/triggerWeeklySummary?userId=xxx'
                });
            }
        } catch (err) {
            console.error('[Weekly Summary] Manual trigger error:', err);
            return res.status(500).json({ error: err.message });
        }
    }
);

// ============================================
// iCal 訂閱 (Calendar Subscription)
// ============================================

/**
 * 產生 iCal 格式的行程
 * @param {Object} event - 行程資料
 * @returns {string} - iCal VEVENT 格式
 */
function generateICalEvent(event) {
    const uid = `${event.id}@smes-calendar`;
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

    // 解析日期和時間
    const [year, month, day] = event.date.split('-');
    const [hour, minute] = (event.time || '09:00').split(':');

    // 格式化 iCal 日期 (YYYYMMDDTHHMMSS)
    const startDate = `${year}${month}${day}T${hour}${minute}00`;

    // 結束時間 (預設 1 小時後)
    let endDate;
    if (event.isAllDay) {
        // 全天行程
        endDate = startDate;
    } else {
        const endHour = String(parseInt(hour) + 1).padStart(2, '0');
        endDate = `${year}${month}${day}T${endHour}${minute}00`;
    }

    // 跳脫特殊字元
    const escapeIcal = (str) => str ? str.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n') : '';

    return `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${escapeIcal(event.title)}
DESCRIPTION:發起人：${escapeIcal(event.authorName || '')}
STATUS:${event.isGloballyCompleted ? 'COMPLETED' : 'CONFIRMED'}
END:VEVENT`;
}

/**
 * 產生完整的 iCal 檔案內容
 * @param {Array} events - 行程陣列
 * @returns {string} - iCal 檔案內容
 */
function generateICalFile(events) {
    const header = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SMES//行政業務協調系統//ZH
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:行政業務協調系統
X-WR-TIMEZONE:Asia/Taipei`;

    const footer = `END:VCALENDAR`;

    const eventStrings = events.map(e => generateICalEvent(e)).join('\n');

    return `${header}\n${eventStrings}\n${footer}`;
}

/**
 * iCal 訂閱端點
 * GET /ical?userId=xxx - 取得使用者相關行程的 iCal 訂閱
 */
exports.getICalFeed = onRequest(
    {
        region: "asia-east1",
        cors: true
    },
    async (req, res) => {
        console.log('[iCal Feed] Request received');

        const { userId, token } = req.query;

        if (!userId) {
            return res.status(400).json({
                error: 'Missing userId parameter',
                usage: '/getICalFeed?userId=YOUR_USER_ID'
            });
        }

        try {
            // 驗證使用者存在
            const userDoc = await db.doc(`artifacts/${APP_ID}/public/data/users/${userId}`).get();
            if (!userDoc.exists) {
                return res.status(404).json({ error: 'User not found' });
            }

            const userData = userDoc.data();

            // 取得所有行程 (未來 3 個月)
            const now = new Date();
            const threeMonthsLater = new Date(now);
            threeMonthsLater.setMonth(now.getMonth() + 3);

            const todayStr = now.toISOString().slice(0, 10);
            const futureStr = threeMonthsLater.toISOString().slice(0, 10);

            const eventsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/school_events`)
                .where('date', '>=', todayStr)
                .where('date', '<=', futureStr)
                .get();

            // 篩選與使用者相關的行程
            const userEvents = [];
            eventsSnapshot.forEach(doc => {
                const event = { id: doc.id, ...doc.data() };
                const isTarget = event.targets && event.targets.includes(userId);
                const isAuthor = event.authorId === userId;
                const isPublic = event.isPublic; // 重要公告所有人可見

                if (isTarget || isAuthor || isPublic) {
                    userEvents.push(event);
                }
            });

            console.log(`[iCal Feed] Found ${userEvents.length} events for user ${userData.name || userId}`);

            // 產生 iCal 內容
            const icalContent = generateICalFile(userEvents);

            // 設定 Content-Type 為 text/calendar
            res.set('Content-Type', 'text/calendar; charset=utf-8');
            res.set('Content-Disposition', 'inline; filename="smes-calendar.ics"');
            res.set('Cache-Control', 'public, max-age=300'); // 快取 5 分鐘

            return res.status(200).send(icalContent);

        } catch (err) {
            console.error('[iCal Feed] Error:', err);
            return res.status(500).json({ error: err.message });
        }
    }
);

// ============================================
// LINE API 使用統計報告
// ============================================

/**
 * 建立 LINE API 使用統計 Flex Message
 */
function createLineApiStatsFlexMessage(dailyStats, monthlyStats, dateStr, monthStr) {
    const monthlyUsed = monthlyStats?.totalSent || 0;
    const monthlyFailed = monthlyStats?.totalFailed || 0;
    const monthlyQuota = MONTHLY_MESSAGE_QUOTA;
    const percentage = Math.round((monthlyUsed / monthlyQuota) * 100);
    const remaining = monthlyQuota - monthlyUsed;

    const dailyUsed = dailyStats?.totalSent || 0;
    const dailyFailed = dailyStats?.totalFailed || 0;

    // 根據使用率決定顏色
    let statusColor = '#00b894'; // 綠色
    let statusIcon = '✅';
    if (percentage >= 80) {
        statusColor = '#d63031'; // 紅色
        statusIcon = '🚨';
    } else if (percentage >= 60) {
        statusColor = '#fdcb6e'; // 黃色
        statusIcon = '⚠️';
    }

    return {
        type: 'flex',
        altText: `📊 LINE API 每日報告 - ${dateStr}`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#6c5ce7',
                paddingAll: '15px',
                contents: [
                    { type: 'text', text: '📊 LINE API 使用報告', color: '#ffffff', weight: 'bold', size: 'lg', align: 'center' },
                    { type: 'text', text: dateStr, color: '#dfe6e9', size: 'sm', align: 'center', margin: 'sm' }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '15px',
                spacing: 'lg',
                contents: [
                    // 今日統計
                    {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'text', text: '📅 今日統計', weight: 'bold', size: 'md', color: '#2d3436' },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: '成功發送', size: 'sm', color: '#636e72', flex: 2 },
                                    { type: 'text', text: `${dailyUsed} 則`, size: 'sm', color: '#00b894', weight: 'bold', flex: 1, align: 'end' }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: '發送失敗', size: 'sm', color: '#636e72', flex: 2 },
                                    { type: 'text', text: `${dailyFailed} 則`, size: 'sm', color: dailyFailed > 0 ? '#d63031' : '#636e72', weight: 'bold', flex: 1, align: 'end' }
                                ]
                            }
                        ]
                    },
                    { type: 'separator' },
                    // 本月統計
                    {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            { type: 'text', text: `📆 ${monthStr} 月統計`, weight: 'bold', size: 'md', color: '#2d3436' },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: '已使用', size: 'sm', color: '#636e72', flex: 2 },
                                    { type: 'text', text: `${monthlyUsed} / ${monthlyQuota} 則`, size: 'sm', color: statusColor, weight: 'bold', flex: 2, align: 'end' }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: '使用率', size: 'sm', color: '#636e72', flex: 2 },
                                    { type: 'text', text: `${statusIcon} ${percentage}%`, size: 'sm', color: statusColor, weight: 'bold', flex: 1, align: 'end' }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: '剩餘額度', size: 'sm', color: '#636e72', flex: 2 },
                                    { type: 'text', text: `${remaining} 則`, size: 'sm', color: '#636e72', weight: 'bold', flex: 1, align: 'end' }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: '失敗總計', size: 'sm', color: '#636e72', flex: 2 },
                                    { type: 'text', text: `${monthlyFailed} 則`, size: 'sm', color: monthlyFailed > 0 ? '#d63031' : '#636e72', weight: 'bold', flex: 1, align: 'end' }
                                ]
                            }
                        ]
                    },
                    // 進度條
                    {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'xs',
                        contents: [
                            {
                                type: 'box',
                                layout: 'vertical',
                                height: '8px',
                                backgroundColor: '#dfe6e9',
                                cornerRadius: '4px',
                                contents: [
                                    {
                                        type: 'box',
                                        layout: 'vertical',
                                        height: '8px',
                                        width: `${Math.min(percentage, 100)}%`,
                                        backgroundColor: statusColor,
                                        cornerRadius: '4px',
                                        contents: []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '10px',
                contents: [
                    { type: 'text', text: '🏫 行政業務協調系統', size: 'xs', color: '#888888', align: 'center' }
                ]
            }
        }
    };
}

/**
 * LINE API 每日報告 - 排程函數
 * 每天早上 9:00 (台灣時間) 發送前一日統計給管理者
 */
exports.lineApiDailyReport = onSchedule(
    {
        schedule: "0 9 * * *", // 每天 09:00 執行
        timeZone: "Asia/Taipei",
        region: "asia-east1",
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (event) => {
        console.log('[LINE Stats] Starting daily report...');

        try {
            const client = getLineClient();

            // 取得昨日日期
            const now = new Date();
            const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
            taiwanTime.setDate(taiwanTime.getDate() - 1); // 昨天

            const year = taiwanTime.getFullYear();
            const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
            const day = String(taiwanTime.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const monthStr = `${year}-${month}`;

            console.log(`[LINE Stats] Generating report for ${dateStr}`);

            // 讀取統計資料
            const statsRef = db.collection(`artifacts/${APP_ID}/public/data/line_api_stats`);

            const dailyDoc = await statsRef.doc(`daily_${dateStr}`).get();
            const monthlyDoc = await statsRef.doc(`monthly_${monthStr}`).get();

            const dailyStats = dailyDoc.exists ? dailyDoc.data() : null;
            const monthlyStats = monthlyDoc.exists ? monthlyDoc.data() : null;

            // 建立報告訊息
            const message = createLineApiStatsFlexMessage(dailyStats, monthlyStats, dateStr, month);

            // 發送給管理者
            await client.pushMessage(ADMIN_LINE_USER_ID, message);
            console.log('[LINE Stats] Daily report sent to admin');

        } catch (err) {
            console.error('[LINE Stats] Daily report error:', err);
        }
    }
);

/**
 * 手動觸發 LINE API 報告 (測試用)
 */
exports.triggerLineApiReport = onRequest(
    {
        region: "asia-east1",
        cors: true,
        secrets: ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]
    },
    async (req, res) => {
        console.log('[LINE Stats] Manual trigger started...');

        try {
            const client = getLineClient();
            const { date } = req.query;

            // 使用指定日期或今日
            let targetDate;
            if (date) {
                targetDate = date;
            } else {
                const now = new Date();
                const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
                const year = taiwanTime.getFullYear();
                const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
                const day = String(taiwanTime.getDate()).padStart(2, '0');
                targetDate = `${year}-${month}-${day}`;
            }

            const monthStr = targetDate.substring(0, 7);
            console.log(`[LINE Stats] Generating report for ${targetDate}`);

            // 讀取統計資料
            const statsRef = db.collection(`artifacts/${APP_ID}/public/data/line_api_stats`);

            const dailyDoc = await statsRef.doc(`daily_${targetDate}`).get();
            const monthlyDoc = await statsRef.doc(`monthly_${monthStr}`).get();

            const dailyStats = dailyDoc.exists ? dailyDoc.data() : null;
            const monthlyStats = monthlyDoc.exists ? monthlyDoc.data() : null;

            // 獲取 LINE 官方 API 的本月統計
            console.log('[LINE Stats] Fetching official LINE API statistics...');
            const officialMonthlyStats = await getMonthlyLineApiStats();
            console.log('[LINE Stats] Official monthly stats:', officialMonthlyStats);

            // 獲取今日官方統計
            const todayStr = targetDate.replace(/-/g, '');
            const officialDailyStats = await getLineApiDeliveryStats(todayStr);
            console.log('[LINE Stats] Official daily stats:', officialDailyStats);

            // 使用官方 API 數據來建立報告
            const officialMonthlyUsed = officialMonthlyStats.total || 0;
            const officialDailyUsed = officialDailyStats.total || 0;
            const monthlyQuota = MONTHLY_MESSAGE_QUOTA;
            const percentage = Math.round((officialMonthlyUsed / monthlyQuota) * 100);
            const remaining = monthlyQuota - officialMonthlyUsed;

            // 根據使用率決定顏色
            let statusColor = '#00b894';
            let statusIcon = '✅';
            if (percentage >= 80) {
                statusColor = '#d63031';
                statusIcon = '🚨';
            } else if (percentage >= 60) {
                statusColor = '#fdcb6e';
                statusIcon = '⚠️';
            }

            // 建立包含官方 API 數據的報告訊息
            const message = {
                type: 'flex',
                altText: `📊 LINE API 使用報告 - ${targetDate}`,
                contents: {
                    type: 'bubble',
                    size: 'mega',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: '#6c5ce7',
                        paddingAll: '15px',
                        contents: [
                            { type: 'text', text: '📊 LINE API 使用報告', color: '#ffffff', weight: 'bold', size: 'lg', align: 'center' },
                            { type: 'text', text: `(官方 API 數據)`, color: '#dfe6e9', size: 'xs', align: 'center', margin: 'xs' },
                            { type: 'text', text: targetDate, color: '#dfe6e9', size: 'sm', align: 'center', margin: 'sm' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '15px',
                        spacing: 'lg',
                        contents: [
                            // 今日統計 (官方 API)
                            {
                                type: 'box',
                                layout: 'vertical',
                                spacing: 'sm',
                                contents: [
                                    { type: 'text', text: '📅 今日統計', weight: 'bold', size: 'md', color: '#2d3436' },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: 'Push 訊息', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${officialDailyStats.push} 則`, size: 'sm', color: '#00b894', weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: 'Reply 訊息', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${officialDailyStats.reply} 則`, size: 'sm', color: '#0984e3', weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: '今日總計', size: 'sm', color: '#2d3436', weight: 'bold', flex: 2 },
                                            { type: 'text', text: `${officialDailyUsed} 則`, size: 'sm', color: '#2d3436', weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    }
                                ]
                            },
                            { type: 'separator' },
                            // 本月統計 (官方 API)
                            {
                                type: 'box',
                                layout: 'vertical',
                                spacing: 'sm',
                                contents: [
                                    { type: 'text', text: `📆 ${monthStr.split('-')[1]} 月統計`, weight: 'bold', size: 'md', color: '#2d3436' },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: 'Push 訊息', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${officialMonthlyStats.push} 則`, size: 'sm', color: '#00b894', weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: 'Reply 訊息', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${officialMonthlyStats.reply} 則`, size: 'sm', color: '#0984e3', weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: '已使用總計', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${officialMonthlyUsed} / ${monthlyQuota} 則`, size: 'sm', color: statusColor, weight: 'bold', flex: 2, align: 'end' }
                                        ]
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: '使用率', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${statusIcon} ${percentage}%`, size: 'sm', color: statusColor, weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            { type: 'text', text: '剩餘額度', size: 'sm', color: '#636e72', flex: 2 },
                                            { type: 'text', text: `${remaining} 則`, size: 'sm', color: '#636e72', weight: 'bold', flex: 1, align: 'end' }
                                        ]
                                    }
                                ]
                            },
                            // 進度條
                            {
                                type: 'box',
                                layout: 'vertical',
                                spacing: 'xs',
                                margin: 'md',
                                contents: [
                                    {
                                        type: 'box',
                                        layout: 'vertical',
                                        height: '8px',
                                        backgroundColor: '#dfe6e9',
                                        cornerRadius: '4px',
                                        contents: [
                                            {
                                                type: 'box',
                                                layout: 'vertical',
                                                height: '8px',
                                                width: `${Math.min(percentage, 100)}%`,
                                                backgroundColor: statusColor,
                                                cornerRadius: '4px',
                                                contents: []
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '10px',
                        contents: [
                            { type: 'text', text: '🏫 行政業務協調系統', size: 'xs', color: '#888888', align: 'center' }
                        ]
                    }
                }
            };

            // 發送給管理者
            await client.pushMessage(ADMIN_LINE_USER_ID, message);

            return res.status(200).json({
                success: true,
                date: targetDate,
                officialStats: {
                    daily: officialDailyStats,
                    monthly: officialMonthlyStats
                },
                internalStats: {
                    daily: dailyStats,
                    monthly: monthlyStats
                },
                summary: {
                    monthlyUsed: officialMonthlyUsed,
                    quota: monthlyQuota,
                    percentage: percentage,
                    remaining: remaining
                },
                message: 'Report sent to admin'
            });

        } catch (err) {
            console.error('[LINE Stats] Manual trigger error:', err);
            return res.status(500).json({ error: err.message });
        }
    }
);
