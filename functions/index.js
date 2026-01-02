/**
 * LINE Messaging API Integration for 行政業務協調系統
 * Firebase Cloud Functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Client } = require("@line/bot-sdk");

// Initialize Firebase
initializeApp();
const db = getFirestore();

// App ID (same as frontend)
const APP_ID = "smes-school-admin-v2";

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

    // 發送歡迎訊息
    await client.pushMessage(userId, {
        type: "text",
        text: `歡迎加入行政業務協調系統通知！👋\n\n您的 LINE ID：\n${userId}\n\n請將此 ID 貼到系統的「帳號設定」→「LINE 通知」中完成綁定。`
    });

    console.log(`New follower: ${profile.displayName} (${userId})`);
}

/**
 * 處理文字訊息
 */
async function handleMessage(client, event) {
    const userId = event.source.userId;
    const text = event.message.text;

    if (text === "我的ID" || text === "id" || text === "ID") {
        await client.replyMessage(event.replyToken, {
            type: "text",
            text: `您的 LINE ID：\n${userId}\n\n請將此 ID 貼到系統的「帳號設定」→「LINE 通知」中完成綁定。`
        });
    } else if (text === "測試" || text === "test") {
        await client.replyMessage(event.replyToken, {
            type: "text",
            text: "✅ 連線正常！如果您已綁定系統帳號，將可以收到行程通知。"
        });
    } else {
        await client.replyMessage(event.replyToken, {
            type: "text",
            text: `📋 可用指令：\n• 輸入「我的ID」查詢 LINE ID\n• 輸入「測試」確認連線狀態`
        });
    }
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

        console.log(`New event created: ${eventId}`, eventData);

        // 取得被指派的用戶
        const targets = eventData.targets || [];
        if (targets.length === 0) return;

        // 查詢這些用戶的 LINE ID
        const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users`);

        for (const targetId of targets) {
            try {
                const userDoc = await usersRef.doc(targetId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知
                const message = {
                    type: "text",
                    text: `📅 新行程通知\n\n您被指派了一個新行程：\n「${eventData.title}」\n\n📆 日期：${eventData.date}\n⏰ 時間：${eventData.time || "--:--"}\n👤 發起人：${eventData.authorName}\n\n🔗 前往查看：https://cagoooo.github.io/staff/`
                };

                await client.pushMessage(lineUserId, message);
                console.log(`LINE notification sent to ${targetId}`);
            } catch (err) {
                console.error(`Failed to notify ${targetId}:`, err);
            }
        }
    }
);

/**
 * 新評論建立時通知被 @提及的用戶
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
            // 不要通知評論作者自己
            if (mentionedId === commentData.authorId) continue;

            try {
                const userDoc = await usersRef.doc(mentionedId).get();
                if (!userDoc.exists) continue;

                const userData = userDoc.data();
                const lineUserId = userData.lineUserId;
                const lineNotifyEnabled = userData.lineNotifyEnabled;

                if (!lineUserId || !lineNotifyEnabled) continue;

                // 發送 LINE 通知
                const contentPreview = commentData.content.substring(0, 50) + (commentData.content.length > 50 ? "..." : "");
                const message = {
                    type: "text",
                    text: `💬 有人提及您\n\n${commentData.authorName} 在「${eventTitle}」中提及了您：\n「${contentPreview}」\n\n🔗 前往查看：https://cagoooo.github.io/staff/`
                };

                await client.pushMessage(lineUserId, message);
                console.log(`LINE mention notification sent to ${mentionedId}`);
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
                    // 發送 LINE 通知
                    const message = {
                        type: "text",
                        text: `⏰ 行程提醒\n\n「${reminder.eventTitle}」即將開始\n\n📆 日期：${reminder.eventDate}\n⏰ 時間：${reminder.eventTime}\n\n🔗 前往查看：https://cagoooo.github.io/staff/`
                    };

                    await client.pushMessage(lineUserId, message);
                    console.log(`LINE reminder sent to ${reminder.userId}`);
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
