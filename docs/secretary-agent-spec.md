# 功能规格：ABD-IM Secretary Agent

**功能分支**：`[TBD-secretary-agent]`

**创建日期**：2026-08-09

**状态**：草稿

## 功能

### 1. 私聊托管

Owner 在现有账号设置中选择一个普通用户作为 Agent，再在具体私聊中开启或关闭托管。每个托管私聊
可以保存一句回复指令。

联系人消息先走普通消息链路完成持久化和推送，再由 after-save callback 通知 Agent。Agent 运行现有
Provider，并通过 Business 发送接口以 Owner 身份回复；消息同时保留具体 Agent 归属。

- 未开启托管的消息不触发 Agent。
- Provider 失败、超时或返回空内容时不发送兜底消息，也不影响原消息。
- 关闭托管时保留指令；显式清空才删除指令。
- V1 只托管私聊；群聊继续使用现有 `@Agent`。

### 2. 聊天记录访问

设置页提供聊天记录访问列表，支持全选、全不选以及逐项选择单聊或群聊。它与私聊托管是两个独立
设置：

```text
history_access_enabled  # 设置页修改
hosting_enabled         # 私聊页面修改
effective_can_read = history_access_enabled || hosting_enabled
```

开启托管时，Agent 可以读取当前私聊最近 10 条消息，但不得改写 `history_access_enabled`。关闭托管
后，设置页仍显示原来保存的聊天记录访问选择。

V1 不实现 Agent 主动调用的历史、搜索、单条消息查询、Context API 或本地同步。自动托管更新固定附带
当前私聊最近 10 条消息；群聊可以保存 `history_access_enabled`，但不能开启 `hosting_enabled`。

### 3. Agent 身份

Agent 使用 Owner 资料中现有的 `ex.agent.userID`，不新增 Agent 模型、资格字段或
`secretary_enabled`。Business API 不接收 Agent ID。

Server 每次处理 callback 或 Business 方法时读取当前 Agent。更换或清除 Agent 不改写 Owner 已保存的
会话配置；旧 Agent 的新请求立即失效，新 Agent 按现有配置接手后续任务。

### 4. Business 更新与回复

托管私聊的新入站文本通过现有 SDK Business listener 发送给 CLI：

- 更新具有稳定 `update_id`，允许重复投递；CLI 跨重启去重。
- Agent 短暂离线后可以恢复更新。
- 更新不创建 Agent 可见聊天、未读数或会话预览。
- Owner、当前 Business Agent 或其他 Agent 发送的消息不触发自动回复。
- `business_message` 包含 Connection ID、当前会话指令和该私聊最近 10 条消息。消息按时间正序排列，
  包含本次触发消息；不足 10 条时附带全部已有消息。

CLI 复用现有 Provider 和逐会话运行管理器。Provider 只能在当前仍托管且过去 24 小时内活跃的触发
私聊中调用文本 `sendMessage`。Server 重新校验当前 Agent、Connection、会话托管状态、消息归属和
普通通信规则。发送复用现有 operationID、Redis 发送状态和 Kafka 消费去重机制。

## 验收

1. 已托管私聊的一条入站文本只启动一次逻辑任务，最多产生一次 Owner 身份回复。
2. 设置页只修改 `history_access_enabled`；私聊页面只修改 `hosting_enabled` 和指令，二者互不覆盖。
3. `history_access_enabled=false` 的私聊开启托管后可以读取最近 10 条并处理当前消息；关闭后恢复为不
   可访问状态。
4. 群聊可以保存聊天记录访问选择，但不能托管或由 Agent 代发。
5. 更换 Agent 后旧 Agent 立即失去权限，新 Agent 使用原有会话配置；清除 Agent 后不产生新任务。
6. Agent 离线重连和 CLI 重启不会丢失或重复执行已经承诺的更新。
7. Business 回复在实时、历史、搜索和离线同步中都显示 Owner 发送者及 Agent 归属。
8. 现有 Agent 私聊、普通私聊、群聊 `@Agent`、Provider 和普通 SDK 发送保持不变。

## 实施前提

- 现有 BusinessNotification 必须通过离线重放、稳定 ID 和无可见聊天状态测试；失败时暂停实现，不在
  V1 增加第二张业务表。
- Agent IM token 的签发、安全存储、刷新和吊销沿用现有机制。

## 参考资料

- [Telegram Secretary Bots](https://core.telegram.org/bots/features#secretary-bots)
- [Telegram Bot API: BusinessConnection](https://core.telegram.org/bots/api#businessconnection)
- [Telegram Connected Business Bots](https://core.telegram.org/api/bots/connected-business-bots)
