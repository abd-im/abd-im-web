# Web 消息表情反应方案

## 1. 技术决策

首期只为 Web 客户端增加消息表情反应。反应是关联到既有消息的独立记录，
不是一条新的聊天消息，也不修改原消息内容。

采用 Slack、Discord 等产品通用的数据模型：

- 同一用户对同一消息、同一种表情最多添加一次。
- 同一用户可对同一消息添加多种不同的允许表情。
- 服务端保存每个用户的反应记录，向客户端返回聚合摘要。
- 实时事件更新已加载消息的显示；刷新、历史翻页、重连或事件缺失后，仍以
  API 查询结果为事实源。

本方案不恢复已废弃的 `ReactionExtensions` API，而是用现有通用
`BusinessNotification` 通道传递轻量的实时更新事件。

## 2. 范围

### 包含

- 单聊和群聊中普通、已持久化的用户消息。
- 首期固定六种表情：`U+1F44D`、`U+2764 U+FE0F`、`U+1F602`、`U+1F62E`、
  `U+1F622`、`U+1F64F`。
- 添加、取消、聚合计数和当前用户是否已选择。
- 当前正在查看会话的用户可实时看到变化。
- 浏览器刷新、重连及历史消息翻页后恢复准确状态。
- Web UI、服务端 API、服务端持久化，以及对现有 Web 业务通知回调的使用。

### 不包含

- Electron、移动端、小程序或旧客户端的 UI 支持。
- 动态/自定义表情包、表情搜索、反应通知和查看反应用户列表。
- 已撤回消息、系统通知、仅在线消息、阅后即焚或私密消息的反应。
- 已注释 `ReactionExtensions` 类型和 API 的兼容适配。

输入框中的普通表情选择不属于本次工作。它已能将 Unicode 表情插入文本消息。
消息反应使用独立的固定选择器，以便服务端严格校验首期允许的表情集合。

## 3. 现有集成点

- Web 视图通过 `conversationID` 和 `clientMsgID` 标识消息；当前历史消息每页为
  20 条。
- API 网关已经使用 Web IM Token 鉴权，并暴露 `/msg/*` 路由。
- 服务端已支持 `BusinessNotification` 投递。SDK Core 将其转换为
  `OnRecvCustomBusinessMessage`，已安装的 Web SDK 已在运行时注册该回调。

通用 `/msg/send_business_notification` 接口仅允许管理员调用。Web 客户端绝不能
直接调用它；新增的反应服务只能在校验和提交反应记录后，于服务端内部发送业务
通知。

## 4. 数据模型

首期使用服务端现有的 MongoDB 建模和迁移机制，新增下列两个集合。字段表描述逻辑
模型，实际 BSON 字段与索引命名遵循服务端现有约定。

### `message_reactions`

| 字段              | 含义                               |
| ----------------- | ---------------------------------- |
| `conversation_id` | 原消息所在会话。                   |
| `client_msg_id`   | 原消息 ID。                        |
| `user_id`         | 添加反应的用户，从访问令牌中取得。 |
| `emoji`           | 一个允许使用的表情。               |
| `created_at`      | 创建时间，用于审计和排查。         |

约束与索引：

- 唯一键：`(conversation_id, client_msg_id, user_id, emoji)`。
- 聚合同种表情的查询索引：`(conversation_id, client_msg_id, emoji)`。
- 批量摘要查询索引：`(conversation_id, client_msg_id)`。

### `message_reaction_state`

| 字段                               | 含义                         |
| ---------------------------------- | ---------------------------- |
| `conversation_id`、`client_msg_id` | 原消息身份。                 |
| `version`                          | 每条消息单调递增的反应版本。 |
| `updated_at`                       | 最近一次变更时间。           |

每次实际添加或取消反应的存储操作须变更反应记录并递增 `version`。重复添加或
重复取消只返回当前状态，不递增 `version`，也不发布实时事件。最后一个反应被
取消后，仍保留状态记录，以便更高版本的空摘要能覆盖客户端的旧摘要。

首期沿用服务端现有 MongoDB 事务抽象处理反应明细和消息状态：replica set 部署下
使用多文档事务原子提交，standalone 部署下与现有好友、群组和会话存储一致，顺序
执行两个写操作。消息反应不额外提高整个服务的 MongoDB 部署要求；需要严格原子性
的生产环境仍建议使用 replica set。

服务端沿用现有 `database -> Redis cache -> controller` 分层。Redis 通过 RocksCache
分别缓存每条消息的公共计数摘要和当前用户的选择；实际 add/remove 后失效公共摘要
及操作者的选择缓存，未变化的幂等请求不清理缓存。缓存缺失时批量回源 MongoDB，
MongoDB 始终是事实源，不增加进程内 reaction LRU。

服务端拥有计数和版本的最终解释权。Web 客户端不得提交计数、目标参与者列表、
`user_id` 或版本号。

## 5. HTTP API

遵循现有网关已鉴权的 `POST /msg/*` 路由约定。所有响应使用标准 API 包装；以下
示例只展示 `data` 字段。

### 添加反应

`POST /msg/add_reaction`

```json
{
  "conversationID": "si_user-a_user-b",
  "clientMsgID": "msg-123",
  "emoji": "\ud83d\udc4d"
}
```

### 取消反应

`POST /msg/remove_reaction`

```json
{
  "conversationID": "si_user-a_user-b",
  "clientMsgID": "msg-123",
  "emoji": "\ud83d\udc4d"
}
```

添加和取消都必须是幂等操作。重复添加或重复取消应成功返回当前服务端权威摘要，
不能再次增减计数、递增版本或发送业务通知。

### 批量查询

`POST /msg/get_reaction_summaries`

```json
{
  "conversationID": "si_user-a_user-b",
  "clientMsgIDs": ["msg-123", "msg-124"]
}
```

单次最多查询 100 条消息。正常历史消息页面对本批已加载消息只发一个请求，
不得按消息逐条请求。

### 摘要响应

```json
{
  "summaries": [
    {
      "clientMsgID": "msg-123",
      "version": 7,
      "reactions": [
        { "emoji": "\ud83d\udc4d", "count": 3, "reactedByMe": true },
        { "emoji": "\ud83d\ude4f", "count": 1, "reactedByMe": false }
      ]
    }
  ]
}
```

`reactedByMe` 由已鉴权用户决定。服务端必须为每个有效请求的消息 ID 返回一个
摘要：从未有过反应的消息返回 `version: 0` 和空 `reactions`；状态记录存在但已无
任何反应的消息返回其当前版本和空 `reactions`。客户端因此可以将每个已加载消息的
摘要视为已知状态，而不是区分“无反应”和“服务端未返回”。

## 6. 服务端规则与实时事件

每次变更或查询前，服务端必须验证：

1. `conversationID` 和 `clientMsgID` 确实标识同一条已持久化消息。
2. 调用者有权读取该会话，即单聊参与者或当前群成员。
3. 原消息是允许反应的用户消息，且未撤回、删除、标记为私密或阅后即焚。
4. `emoji` 属于六种固定表情之一。

存储提交后，服务端以 best-effort 方式向单聊对端或群聊发送不计未读数、无离线
推送的 `BusinessNotification`。首期不使用 transactional outbox；通知失败只记录
指标，不回滚已经提交的反应，也不使反应 API 返回失败。事件是在线实时更新的加速
通道，不是事实源；投递失败、接收端离线或事件遗漏时，客户端通过摘要查询恢复正确
状态。

事件必须使用命名空间键：

```json
{
  "key": "message.reaction.updated",
  "data": {
    "conversationID": "si_user-a_user-b",
    "clientMsgID": "msg-123",
    "emoji": "\ud83d\udc4d",
    "action": "added",
    "actorUserID": "user-a",
    "count": 3,
    "version": 7
  }
}
```

事件中故意不携带 `reactedByMe`，因为同一个群通知会发送给具有不同选择状态的
用户。Web 仅在 `actorUserID` 等于当前用户 ID 时，推导自己的选择状态。

事件只用于加速更新，不是事实源：

- 忽略未加载会话或消息的事件。
- 忽略 `version` 不大于本地版本的事件。
- 仅直接应用版本恰好为下一个版本的事件。
- 发现版本跳跃时，将该消息标记为过期并重新查询摘要。
- 重连或加载历史消息时，批量查询当前已加载消息。

该规则确保重复投递、乱序投递和离线遗漏不会使计数永久错误。

## 7. Web 设计

### 数据流

1. 新增 `src/api/messageReaction.ts`，使用 `RUNTIME_API_URL` 和现有 IM Token
   Axios 工具。
2. 在聊天历史 Hook 旁新增 `useMessageReactions`。它为当前会话保存
   `Record<clientMsgID, MessageReactionSummary>`，批量加载摘要，并按
   `(clientMsgID, emoji)` 跟踪请求中的变更。
3. 初次加载历史消息或加载更早一页时，仅为新增的消息 ID 请求一次摘要；只合并
   版本更高的摘要。
4. 在 `useGlobalEvents` 中订阅 `OnRecvCustomBusinessMessage`，只解析
   `message.reaction.updated`，校验数据形状后发出本地反应更新事件。活动会话的
   Hook 消费该事件。
5. 在 `MessageItem` 的消息气泡下增加 `MessageReactionBar`。它只接收摘要和
   回调；各种消息渲染组件仍只负责渲染消息内容。

已安装 SDK 的事件枚举已包含 `OnRecvCustomBusinessMessage`，但其 TypeScript
事件数据映射需要补充一个 `unknown` 条目。SDK 默认会尝试解析 JSON，所以运行时
负载可能是字符串或已解析对象；Web 处理器必须先校验结构再使用。这只是 SDK JS
封装的类型补丁，不需要改动 SDK Core 或 WASM API。

### 交互

- 悬停消息时，在气泡旁展示仅图标的“添加反应”控件。
- 控件的 Popover 以稳定网格展示六种固定表情。
- 已有反应以表情和计数的胶囊按钮显示在气泡下方。
- 当前用户已选择的按钮展示选中状态；点击选中项取消，点击未选中的允许项添加。
- 请求期间只禁用对应的反应按钮，其他消息和表情仍可操作。
- 先乐观更新，再用 API 响应覆盖；失败时还原旧摘要，必要时重新查询该消息。
- 使用 Ant Design portal Popover，避免被消息列表的溢出容器裁切；反应按钮尺寸
  固定，计数变化不得导致消息列表跳动。

## 8. 安全、限制与可观测性

- 从 IM Token 推导当前用户，绝不接受请求体中的用户 ID。
- 限制单次批量查询最多 100 条；变更接口复用服务端现有 API/RPC 限流机制，
  不为消息反应新增独立限流器或硬编码阈值。
- 不向非当前会话参与者发送反应事件。
- 反应事件不得生成普通消息记录、会话未读数或移动端离线推送。
- 记录 API 延迟、变更失败、权限拒绝、批量大小、通知投递失败和版本跳跃后的
  重新查询次数。

## 9. 测试与验收标准

### 服务端

- 添加和取消在并发请求下保持幂等，不会重复计数；重复请求不递增版本，也不产生
  业务通知。
- 服务端拒绝伪造的会话/消息组合、非法表情、非成员和不允许反应的消息。
- 多用户反应的聚合正确，并返回请求用户自身的选择状态。
- 批量查询为每个有效请求的消息返回摘要；从未反应的消息返回 `version: 0` 和空列表。
- 每次有效变更只递增一次版本，并尝试发送一条不计未读、无离线推送的业务通知；
  通知失败不回滚变更或使 API 返回失败，刷新或批量查询仍返回正确状态。

### Web

- 两个已登录浏览器上下文无需刷新即可看到计数变化。
- 同一用户可添加、取消同种表情；快速双击不会遗留重复计数或错误的选中状态。
- 刷新、重连和加载更早的历史消息页后，仍显示相同的服务端权威摘要。
- 群事件只更新匹配的已加载消息；其他会话的事件不会影响当前视图。
- 加载 20 条历史消息只发起一次批量摘要请求，而不是 20 次。
- 窄窗口和右侧消息仍能完整显示选择器和反应按钮，无裁切或重叠。

## 10. 交付顺序与工期

1. 实现持久化、校验、三个 API 和业务事件发布。
2. 补充 Web SDK 事件类型，并实现 Web API 客户端。
3. 实现摘要状态、实时事件校正和批量加载。
4. 实现选择器、反应按钮和浏览器测试。

在仅 Web 客户端的范围内，预估为 3-5 人天：服务端数据/API/事件 1-2 天，
Web 状态/UI 1-2 天，集成与双浏览器验证约 1 天。该估算不包含兼容旧版或分阶段
降级方案。
