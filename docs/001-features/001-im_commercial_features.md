# OpenIM 客户端增强功能变更设计文档 (001-im_commercial_features)

**时间**: 2026-05-23 19:18  
**作者**: Antigravity AI Coding Assistant  

本变更设计文档旨在分析和记录 `openim-electron-demo` 开源基础客户端与 OpenIM 官方/商业版参考客户端（如效果图所示）之间的核心功能差异，并规划一套在不考虑音视频通话的前提下，快速且完整复刻这些商业级核心功能的具体技术路线。

---

## 1. 核心变动功能清单

对比参考客户端与当前开源基础 Demo，我们需要在前端渲染进程中补齐以下 5 大核心功能模块：

| 模块名称 | 功能描述 | 核心 SDK 接口 / 前端机制 | 复杂度 |
| :--- | :--- | :--- | :--- |
| **1. 在线状态显示** | 聊天顶部 Header 显示 `• Web在线` / `• 离线` 及绿点状态指示器。 | `subscribeUsersStatus` / `onUserStatusChanged` | ⭐⭐ 简单 |
| **2. 聊天设置面板扩展** | 在右侧设置抽屉中增加“置顶”、“消息免打扰”、“阅后即焚开关”、“阅后即焚时间控制”、“清空聊天记录”。 | `pinConversation`, `setConversationRecvMessageOpt`, `setOneConversationPrivateChat`, `clearConversationAndDeleteAllMsg` | ⭐ 极简 |
| **3. 单聊消息已读未读** | 消息发送方在自己发送的气泡下方渲染 `已读` / `未读`。 | `markConversationMessageAsRead` / `onRecvC2CReadReceipt` | ⭐⭐ 简单 |
| **4. 阅后即焚倒计时销毁** | 开启后发送的私密消息在已读后触发倒计时（如 `30s`），并在归零时从本地数据库彻底擦除，UI 播放销毁效果。 | `setOneConversationBurnDuration` / 前端倒计时定时器 / `deleteMessageFromLocalStorage` | ⭐⭐⭐ 中等 |
| **5. 多媒体发送与渲染** | 输入框工具栏支持发送图片、视频、文件；消息气泡针对文件和视频进行定制渲染，不再渲染“暂不支持”。 | `createFileMessage`, `createVideoMessage` / 编写 `FileMessageRender`, `VideoMessageRender` | ⭐⭐ 较易 |
| **6. 消息右键/长按菜单** | 点击消息气泡弹出上下文操作菜单：转发、复制、多选、回复、撤回（伴随“你撤回了一条消息”提示）、删除。 | 前端 Menu 交互 / `revokeMessage` / `deleteMessageFromLocalStorage` | ⭐⭐⭐ 中等 |

---

## 2. 详细技术实现方案

### 2.1 用户在线状态 (Online Status)
*   **交互表现**：在单聊会话 Header 的好友昵称下方展示 `• Web在线`（绿色圆点）或 `• 离线`（灰色圆点）。
*   **技术路径**：
    1.  **订阅触发**：当进入单聊会话时，调用 `IMSDK.subscribeUsersStatus([userID])` 订阅该好友状态。在切离或关闭会话时，调用 `unsubscribeUsersStatus([userID])` 取消订阅。
    2.  **事件监听**：全局监听 `CbEvents.OnUserStatusChanged` 事件。当好友上线、下线或切换终端时，更新全局 Zustand Store (`useUserStore` / `useContactStore`)。
    3.  **UI 渲染**：[ChatHeader/index.tsx](file:///home/me/code/openim-electron-demo/src/pages/chat/queryChat/ChatHeader/index.tsx) 中根据 Store 中该用户的 `status` (1 为在线) 和 `platformIDs` (终端平台列表，如 `5` 代表 Web) 渲染绿点与文字。

### 2.2 聊天设置面板 (Conversation Settings)
*   **交互表现**：点击顶部设置按钮打开 Drawer，展示并可切换以下选项：
    *   **置顶**（Pin Switch）
    *   **消息免打扰**（DND Switch）
    *   **阅后即焚开关**（Private Chat Switch）
    *   **阅后即焚时间**（Duration Select，如 5s, 10s, 30s...）
    *   **清空聊天记录**（Clear Records Button）
*   **技术路径**：
    -   **置顶**：`IMSDK.pinConversation({ conversationID, isPinned })`。
    -   **免打扰**：`IMSDK.setConversationRecvMessageOpt({ conversationID, opt })`（其中 `opt=2` 为免打扰，`opt=0` 为正常）。
    -   **阅后即焚模式**：`IMSDK.setOneConversationPrivateChat({ conversationID, isPrivate })`。
    -   **阅后即焚时间**：`IMSDK.setOneConversationBurnDuration({ conversationID, burnDuration })`。
    -   **清空记录**：`IMSDK.clearConversationAndDeleteAllMsg(conversationID)`。

### 2.3 消息已读未读 (Message Read Receipts)
*   **交互表现**：单聊中，自己发送的消息，如果对方未读，消息下方显示蓝色 `未读`；对方已读后，更新为灰色 `已读`。
*   **技术路径**：
    1.  **接收方上报**：进入聊天窗口，或在聊天中收到新消息时，调用 `IMSDK.markConversationMessageAsRead(conversationID)`。
    2.  **发送方监听**：监听全局的 `CbEvents.OnRecvC2CReadReceipt` 回调，提取对方已读的消息 ID 列表，触发全局事件 `updateOneMessage` 更新对应消息的 `isRead` 为 `true`。
    3.  **UI 渲染**：在 [MessageSuffix.tsx](file:///home/me/code/openim-electron-demo/src/pages/chat/queryChat/MessageItem/MessageSuffix.tsx) 中判定 `message.sendID === selfID` 时，若 `isRead` 为真渲染 `已读`，否则渲染 `未读`。

### 2.4 阅后即焚倒计时销毁 (Burn-After-Reading)
*   **交互表现**：开启阅后即焚后，发送的消息右侧显示火花或沙漏图标。在消息被已读后，开始显示数字倒计时（如 `30s`, `29s`...）。倒计时归零时，消息淡出并彻底从本地擦除。
*   **技术路径**：
    1.  **触发时机**：当消息被标记为 `isRead === true` 并且消息带有 `attachedInfoElem.isPrivate = true` 标识时，前端组件启动 React Timer。
    2.  **倒计时安全保护**：私密消息内容区域禁用右键菜单、拖拽复制以及选中文本 (`user-select: none`)。
    3.  **物理抹除**：倒计时到 0 时，调用 `IMSDK.deleteMessageFromLocalStorage(message)` 从 SQLite/IndexedDB 本地库删除该条消息，同时在本地 React `messageList` 状态中将其滤除。
    4.  **离线恢复**：每次打开会话加载历史消息时，计算“已读时间”与当前时间的差值。如果早已超时，在后台静默调用物理删除，不予渲染，确保数据绝对安全。

### 2.5 多媒体发送与消息渲染 (Multimedia & Bubbles)
*   **交互表现**：点击输入框工具栏的文件、视频、图片按钮，可直接选择并发送；聊天气泡可以清晰展示文件名称、大小和下载链接，或视频缩略图和播放器。
*   **技术路径**：
    -   **图片**：`IMSDK.createImageMessage` + `IMSDK.sendMessage`。
    -   **视频**：`IMSDK.createVideoMessage` + `IMSDK.sendMessage`。
    -   **文件**：`IMSDK.createFileMessage` + `IMSDK.sendMessage`。
    -   **多媒体气泡**：新建 `FileMessageRender` (文件气泡) 和 `VideoMessageRender` (视频封面及 HTML5 Video 播放器) 组件，在 [MessageItem/index.tsx](file:///home/me/code/openim-electron-demo/src/pages/chat/queryChat/MessageItem/index.tsx) 的 `components` 映射表中完成注册，替换原有的 `CatchMessageRender` 占位渲染。

### 2.6 消息快捷操作菜单 (Context Menu)
*   **交互表现**：鼠标右键或长按消息气泡时，弹出一套精美的悬浮菜单：转发、复制、多选、回复、撤回、删除。
*   **技术路径**：
    -   **撤回**：调用 `IMSDK.revokeMessage(message)`。撤回成功后，触发全局 `CbEvents.OnNewRecvMessageRevoked` 监听，前端将消息的 `contentType` 修改为 `MessageType.RevokeMessage` 并更新，界面会自动渲染为 `“你 撤回了一条消息”`。
    -   **删除**：调用 `IMSDK.deleteMessageFromLocalStorage(message)` 并在前端状态中移除。
    -   **复制**：写入系统剪贴板。

---

## 3. 部署与验证规划

1.  **分步开发**：优先完成“在线状态”与“设置面板”；随后攻克“单聊已读”与“文件/视频渲染”；最后实现最复杂的“阅后即焚倒计时”与“消息操作菜单”。
2.  **Web 兼容性测试**：在容器中测试 IndexedDB 的物理擦除性能，确保强缓存配置下的 WASM 加载不会影响阅后即焚的即时删除响应。
