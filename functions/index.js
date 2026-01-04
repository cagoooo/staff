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
// Flex Message 模板 - 精美卡片式通知
// ============================================

const LINK_URL = "https://cagoooo.github.io/staff/";

/**
 * 新行程通知 - Flex Message
 */
function createEventFlexMessage(eventData) {
    return {
        type: "flex",
        altText: `📅 新行程：${eventData.title}`,
        contents: {
            type: "bubble",
            size: "kilo",
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
                                text: "📅",
                                size: "xl",
                                color: "#ffffff",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: "新行程通知",
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
                                        text: "👤 發起人",
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
                            label: "🔗 前往查看",
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
                                text: " 在評論中提及了您",
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
                            label: "💬 查看評論",
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
 * 評論編輯通知 - Flex Message
 */
function createCommentEditFlexMessage(authorName, eventTitle, contentPreview) {
    return {
        type: "flex",
        altText: `✏️ ${authorName} 編輯了提及您的評論`,
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
                                text: "評論已編輯",
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
                                text: " 編輯了提及您的評論",
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
 * 評論刪除通知 - Flex Message
 */
function createCommentDeleteFlexMessage(authorName, eventTitle, contentPreview) {
    return {
        type: "flex",
        altText: `🗑️ ${authorName} 刪除了提及您的評論`,
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
                                text: "評論已刪除",
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
                                text: " 刪除了提及您的評論",
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
 */
function createReminderFlexMessage(eventTitle, eventDate, eventTime) {
    return {
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
 * 行程更新通知 - Flex Message
 */
function createEventUpdateFlexMessage(eventData, changedFields) {
    // 生成變更摘要
    const changesList = [];
    if (changedFields.includes('title')) changesList.push('標題');
    if (changedFields.includes('date')) changesList.push('日期');
    if (changedFields.includes('time')) changesList.push('時間');
    if (changedFields.includes('targets')) changesList.push('指派對象');

    const changesText = changesList.length > 0
        ? `📝 已更新：${changesList.join('、')}`
        : '📝 內容已更新';

    return {
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
                            text: "📋 您的 LINE ID",
                            size: "sm",
                            color: "#888888",
                            margin: "lg"
                        },
                        {
                            type: "text",
                            text: "請長按下方訊息複製 ID",
                            size: "xs",
                            color: "#aaaaaa",
                            margin: "sm"
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
                            text: "👆 請複製上方 ID",
                            weight: "bold",
                            size: "md",
                            color: "#667eea"
                        },
                        {
                            type: "text",
                            text: "貼到系統的「帳號設定」→「LINE 通知」中完成綁定",
                            size: "sm",
                            color: "#666666",
                            wrap: true,
                            margin: "md"
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
                                text: "👆 請複製上方 ID",
                                weight: "bold",
                                size: "md",
                                color: "#00b894"
                            },
                            {
                                type: "text",
                                text: "貼到系統的「帳號設定」→「LINE 通知」中完成綁定",
                                size: "sm",
                                color: "#666666",
                                wrap: true,
                                margin: "md"
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
                                    label: "🔗 前往系統綁定",
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
                    createFeatureItem("💬", "評論互動", "在行程中留言討論，支援 @提及"),
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
                    createInfoRow("版本", "v2.0.0"),
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

                // 發送 LINE 通知 (使用精美 Flex Message)
                const message = createEventFlexMessage(eventData);

                await client.pushMessage(lineUserId, message);
                console.log(`LINE notification sent to ${targetId}`);
            } catch (err) {
                console.error(`Failed to notify ${targetId}:`, err);
            }
        }
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

        // 如果只是更新 completedBy, readBy, updatedAt 等狀態欄位，不發送通知
        const importantFields = ['title', 'date', 'time', 'targets', 'isPublic', 'announcementType', 'pinned'];
        const hasImportantChanges = importantFields.some(field =>
            JSON.stringify(beforeData[field]) !== JSON.stringify(afterData[field])
        );

        if (!hasImportantChanges) {
            console.log('No important changes detected, skipping notification');
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

                // 發送 LINE 通知 (使用精美 Flex Message)
                const message = createEventUpdateFlexMessage(afterData, changedFields);

                await client.pushMessage(lineUserId, message);
                console.log(`LINE update notification sent to ${targetId}`);
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

                await client.pushMessage(lineUserId, message);
                console.log(`LINE delete notification sent to ${targetId}`);
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

                await client.pushMessage(lineUserId, message);
                console.log(`LINE mention notification sent to ${mentionedId}`);
            } catch (err) {
                console.error(`Failed to notify mention ${mentionedId}:`, err);
            }
        }
    }
);

/**
 * 評論更新時通知新增的 @提及用戶
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

                // 發送 LINE 通知 (使用評論編輯的 Flex Message)
                const contentPreview = afterData.content.substring(0, 50) + (afterData.content.length > 50 ? "..." : "");
                const message = createCommentEditFlexMessage(afterData.authorName, eventTitle, contentPreview);

                await client.pushMessage(lineUserId, message);
                console.log(`LINE comment edit notification sent to ${mentionedId}`);
            } catch (err) {
                console.error(`Failed to notify mention ${mentionedId}:`, err);
            }
        }
    }
);

/**
 * 評論刪除時通知被 @提及的用戶
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

                // 發送 LINE 通知 (使用評論刪除的 Flex Message)
                const contentPreview = commentData.content.substring(0, 50) + (commentData.content.length > 50 ? "..." : "");
                const message = createCommentDeleteFlexMessage(commentData.authorName, eventTitle, contentPreview);

                await client.pushMessage(lineUserId, message);
                console.log(`LINE comment delete notification sent to ${mentionedId}`);
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
                    // 發送 LINE 通知 (使用精美 Flex Message)
                    const message = createReminderFlexMessage(reminder.eventTitle, reminder.eventDate, reminder.eventTime);

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
