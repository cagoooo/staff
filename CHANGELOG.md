# 行政業務協調系統 - 版本紀錄

## 📋 系統資訊

| 項目 | 說明 |
|------|------|
| 專案名稱 | 行政業務協調系統 |
| 版本 | v3.1.0 |
| 更新日期 | 2026-01-02 |
| 部署網址 | https://cagoooo.github.io/staff/ |
| 技術棧 | HTML5, Tailwind CSS, Firebase (Auth, Firestore, Storage), ES Modules |
| Firebase 專案 | Blaze 方案 |

---

## ✅ 已完成功能

### 🎯 P0 - 核心功能

| 功能 | 說明 | 檔案 |
|------|------|------|
| 行程編輯/刪除 | 建立者可編輯、刪除前確認 | `event-modal.js` |
| 公告系統增強 | 一般/重要/緊急類型、置頂、已讀狀態 | `ui.js`, `firestore.js` |
| 搜尋功能 | 標題/建立者搜尋、日期篩選 | `search.js` |

### 📊 P1 - 進階功能

| 功能 | 說明 | 檔案 |
|------|------|------|
| 統計儀表板 | 本月統計、Chart.js 圖表 | `stats.js` |
| 通知提醒 | 瀏覽器推播、1天/1小時提醒 | `notification-system.js` |
| 使用者管理 | 管理員可停用/啟用帳號、設定角色 | `admin.js` |
| 檔案附件 | Firebase Storage 上傳/下載/預覽 | `storage.js` |

### 🎨 P2 - UI/UX 優化

| 功能 | 說明 | 檔案 |
|------|------|------|
| 深色模式 | 自動偵測 + 手動切換、儲存偏好 | `theme.js`, `dark-mode.css` |
| 動畫效果 | 頁面過場、列表動畫、按鈕回饋 | `animations.css` |

### 🔒 P3 - 安全性

| 功能 | 說明 | 檔案 |
|------|------|------|
| Firestore 規則 | 管理員權限、擁有者驗證、UID 文件 ID | `firestore.rules` |
| Google 登入修復 | Redirect 模式避免 COOP 錯誤 | `auth.js` |

### 🔥 高優先級新功能

| 功能 | 說明 | 檔案 |
|------|------|------|
| 行事曆匯出 | iCal 格式、Google Calendar 整合 | `calendar-export.js` |
| 批次操作 | 批次選取、標記完成、刪除、匯出 | `batch-operations.js` |
| 行程重複 | 每日/週/雙週/月重複建立 | `recurring-events.js` |

---

## 📁 專案結構

```
smes/
├── index.html              # 主頁面
├── firestore.rules         # Firestore 安全規則
├── CHANGELOG.md            # 版本紀錄
├── css/
│   ├── pixel-style.css     # 主要樣式
│   ├── mobile-fixes.css    # 行動裝置修正
│   ├── dark-mode.css       # 深色主題
│   └── animations.css      # 動畫效果
├── js/
│   ├── app.js              # 應用程式入口
│   ├── auth.js             # 認證邏輯 (含 Google Redirect)
│   ├── firestore.js        # 資料庫操作
│   ├── firebase-config.js  # Firebase 設定
│   ├── ui.js               # UI 渲染
│   ├── departments.js      # 處室設定
│   ├── crypto.js           # 密碼雜湊
│   ├── event-modal.js      # 行程詳情 Modal
│   ├── search.js           # 搜尋功能
│   ├── stats.js            # 統計儀表板
│   ├── notification-system.js  # 通知系統
│   ├── admin.js            # 管理後台
│   ├── storage.js          # 檔案附件
│   ├── theme.js            # 深色模式
│   ├── calendar-export.js  # 行事曆匯出
│   ├── batch-operations.js # 批次操作
│   └── recurring-events.js # 行程重複
└── components/
    └── modal.js            # Modal 元件
```

---

## 📝 Git Commits 紀錄 (2026-01-02)

| Commit | 說明 |
|--------|------|
| `19dc080` | 適配新 Firestore 規則 - UID 作為文件 ID、users 集合 |
| `d0da445` | 修復 Google 登入 COOP 問題 - Redirect 模式 |
| `a2b386e` | 高優先級功能 - 行事曆匯出、批次操作、行程重複 |
| `a815f97` | 文件更新 - CHANGELOG v3.0.0 |
| `96abed7` | P2/P3 - 深色模式、動畫、Firestore 規則增強 |
| `dd18d17` | P1 - 檔案附件 (Firebase Storage) |
| `b7ba0cb` | P1 - 通知系統、管理後台 |
| `47a1842` | P1 - 統計儀表板 (Chart.js) |

---

## 🚀 待開發功能

### 💡 中優先級

| 功能 | 說明 |
|------|------|
| 評論功能 | 行程下方討論區、@提及 |
| 標籤系統 | 自訂標籤、依標籤篩選 |
| 時間軸視圖 | 甘特圖、時間線展示 |
| 提醒自訂 | 自訂提醒時間、Email/LINE 通知 |

### 🌟 低優先級

| 功能 | 說明 |
|------|------|
| 多語言 | 英文版本 |
| 資料匯入/匯出 | Excel 匯入、JSON 備份 |
| 權限細分 | 只讀用戶、部門管理員 |
| API 整合 | REST API、Webhook |

### 🎨 UI 改進

| 功能 | 說明 |
|------|------|
| 自訂主題色 | 主題色選擇器 |
| PWA 增強 | 離線支援、推播優化 |
| 無障礙 | 鍵盤導航、螢幕閱讀器 |

---

## ⚠️ 重要注意事項

### Firestore 規則變更

1. **集合名稱**：`school_users` → `users`
2. **文件 ID**：必須等於 Firebase Auth UID
3. **現有用戶**：可能需要遷移資料或重新註冊

### Google 登入

- 使用 **Redirect 模式** 而非 Popup 模式
- 避免 COOP (Cross-Origin-Opener-Policy) 瀏覽器限制
- 登入時頁面會跳轉，這是正常行為

### 管理員設定

在 Firestore `users` 集合中，將用戶文件添加：
```
role: "admin"
```

---

## 🔧 開發環境

- **本地測試**：`npx -y http-server -p 8080 -o`
- **部署**：GitHub Pages (自動部署 main 分支)
- **Firebase Console**：https://console.firebase.google.com

---

下次見！繼續努力優化 💪
