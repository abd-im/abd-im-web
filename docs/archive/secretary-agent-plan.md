# 实施计划：ABD-IM Secretary Agent

**日期**：2026-08-09 | **规格**：[secretary-agent-spec.md](./secretary-agent-spec.md)

## 新增数据

`openim-chat` 只新增一个 MongoDB 集合：

```text
business_connection
  id: string
  owner_user_id: string
  chat_management:
    - conversation_id: string
      instruction: string
      history_access_enabled: bool
      hosting_enabled: bool
  created_at: datetime
  updated_at: datetime
```

索引：

- unique `{owner_user_id: 1}`
- unique `{id: 1}`

Agent 继续读取 Owner 现有的 `ex.agent.userID`，不新增 Agent 字段，不在 Connection 中保存 Agent ID。
不新增其他业务表。

## 新增接口

接口都在 `openim-chat`：

| 接口                                                     | 用途                    |
| -------------------------------------------------------- | ----------------------- |
| `POST /agent/business_connection/get`                    | 查询 Owner 的完整配置   |
| `POST /agent/business_connection/update_chat_management` | 批量更新会话配置        |
| `POST /agent/business/send_message`                      | Agent 以 Owner 身份回复 |

`update_chat_management` 请求：

```text
items[]
  conversation_id
  history_access_enabled?
  hosting_enabled?
  instruction?
```

未传字段保持原值，`instruction: ""` 表示清除。设置页批量提交
`history_access_enabled`；私聊页提交 `hosting_enabled` 和 `instruction`。

`send_message` 请求：

```text
business_connection_id
conversation_id
trigger_message_id
text
reply_to_message_id?
```

## 复用接口

| 现有接口                               | 用途                                      |
| -------------------------------------- | ----------------------------------------- |
| `callbackAfterMsgSaveDBCommand`        | 消息实际写入 Mongo 后通知 `openim-chat`   |
| `POST /msg/pull_msg_by_seq`            | 按触发消息 seq 拉取同会话最近 10 条       |
| `POST /msg/send_business_notification` | 把 Business 更新发送给当前 Agent          |
| `POST /msg/send_simple_msg`            | 以 Owner 身份进入普通消息持久化和推送链路 |

不再使用 `callbackAfterSendSingleMsgCommand` 触发 Secretary。它在消息进入 MQ 后触发，不能保证消息已经写入
Mongo。

`send_simple_msg` 保持现状，继续自动生成 `ClientMsgID`。Business 发送沿用现有 operationID、Redis
发送状态查询和 Kafka 消费去重，不增加新的幂等实现。`openim-chat` 只在现有 `ex` 中写入 `abdAgent`
作为展示元数据，Server 不增加额外校验。

`abdAgent`：

```text
mode: business
businessConnectionID
agentID
agentName
```

## 函数调用图

### 配置

```text
abd-im-web
  -> [新增] Api.UpdateChatManagement
  -> [新增] BusinessConnectionService.UpdateChatManagement
  -> [新增] BusinessConnectionDatabase.BatchUpsertChatManagement
```

### 接收

```text
abd-im-server
  -> [现有] OnlineHistoryMongoConsumerHandler.webhookAfterMsgSaveDB
  -> callbackAfterMsgSaveDBCommand

openim-chat
  -> [新增] bot.Api.AfterMsgSaveDB
  -> [新增] BusinessConnectionService.MatchHosting
  -> [复用] /msg/pull_msg_by_seq 拉取 seq-9 ... seq
  -> [复用] /msg/send_business_notification

abd-im-cli
  -> [复用] Business listener
  -> [复用] events.Ledger.RecordCallback(update_id)
  -> [复用] daemon.Inbound.Process
  -> [复用] run.Manager / Provider.Start
```

### 回复

```text
Provider: business.send_message
  -> [新增] openim-chat Api.SendBusinessMessage
  -> [新增] BusinessConnectionService.AuthorizeSend
     校验当前 Agent、托管状态、trigger_message_id 和 24 小时窗口
  -> [复用] /msg/send_simple_msg
  -> [复用] abd-im-server SendMsg 持久化与推送
```

## 分仓库改动

### `openim-chat`

- 新增 BusinessConnection 文档、索引、读写方法和三个 API。
- 新增 `AfterMsgSaveDB` callback 路由。
- `imapi.Caller` 增加现有拉消息、BusinessNotification API 的薄封装。
- 发送时复用现有 `SendSimpleMsg`，并传入包含 `abdAgent` 的 `ex`。

### `abd-im-server`

- 部署配置把现有 `AfterMsgSaveDB` webhook 指向 `openim-chat`，callback 结构不变。
- 不修改 Server 代码，不新增 RPC，不修改消息存储和推送流程。

### `abd-im-cli`

- 注册 Business listener，并转换为现有入站事件。
- Provider 输入增加最近 10 条和会话指令。
- 增加 `business.send_message` 工具；其余复用 ledger、Inbound、run.Manager 和 Provider。

### `abd-im-web`

- 设置页和私聊页接入同一个 `update_chat_management`。
- 群聊只提交 `history_access_enabled`，不显示托管按钮。
- 展示消息 `ex.abdAgent` 中的 Agent 归属。

### 无需修改

- `protocol`：现有 `MsgData` 已有 `Ex`。
- `abd-im-sdk-core`：现有 Business listener 通过离线重放测试后直接复用。
- 消息数据库：继续保存现有消息，不新增 Business 消息表。
