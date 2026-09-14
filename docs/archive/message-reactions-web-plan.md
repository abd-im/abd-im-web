# 消息 Reaction 方案

## 1. 目标

- Reaction 在线变化实时展示；离线期间的变化在重连后批量拉取最终摘要。
- Web 缓存 Reaction，重新进入会话时不重复查询已经同步的数据。
- 支持计数、当前用户是否点过，以及悬停查看完整 Reaction 用户列表。
- 重复、乱序或缺失事件可以通过版本和批量查询恢复。

Reaction 是消息的附属状态，不修改消息正文。旧 `ReactionExtensions` 不恢复，残留的
`LocalChatLogReactionExtensions` 模型和相关废弃代码直接删除，不做兼容或数据迁移；
新功能使用独立模型。

## 2. 服务端

继续使用现有两张集合：

```text
message_reactions
  conversation_id, seq, user_id, emoji, created_at
  UNIQUE(conversation_id, seq, user_id, emoji)

message_reaction_state
  conversation_id, seq, version, updated_at
  UNIQUE(conversation_id, seq)
```

本轮不修改集合结构，也不迁移已有 Reaction 数据。

`message_reactions` 保存用户明细，用于聚合计数、查询当前用户是否点过和返回完整用户
列表。`message_reaction_state` 只保存单调递增版本；最后一个 Reaction 被取消后仍保留
版本，保证空状态能覆盖旧缓存。

添加和取消沿用现有 MongoDB transaction 和 Redis 缓存失效逻辑。重复添加或取消不
递增版本、不发送通知。

保留现有接口：

- `AddReaction`：幂等添加并返回当前用户的完整摘要。
- `RemoveReaction`：幂等取消并返回当前用户的完整摘要。
- `GetReactionSummaries`：按会话批量查询最多 100 条消息，返回
  `emoji/count/reactedByMe/userIDs/version`。`userIDs` 包含该表情的全部用户，客户端无需在
  悬停时再次查询。

允许的 Reaction 固定为 `👍`、`👎`、`😄`、`🎉`、`😕`、`❤️`、`🚀`、`👀`，服务端按
Unicode 精确校验，不接受列表外的表情。

所有接口从 IM Token 获取用户身份，并验证会话成员、消息归属、消息状态和允许的
emoji。

## 3. 在线通知与离线恢复

Reaction 继续使用现有 `BusinessNotification` 和默认 `NewOptions()` 做在线推送；当前实现
已经不设置 history/persistent、不写入 `n_*`、不计未读，也不触发离线推送，本轮不修改
这段通知配置。撤回、删除等必须逐项同步的消息状态仍沿用持久化 `n_*`，不受本方案影响。

事件保持轻量增量格式：

```json
{
  "key": "message.reaction.updated",
  "data": {
    "conversationID": "...",
    "seq": 123,
    "emoji": "👍",
    "action": "added",
    "actorUserID": "user-a",
    "count": 15,
    "version": 7
  }
}
```

事件不重复发送完整用户列表。SDK 对连续事件按照 `actorUserID + action` 增删本地
`userIDs`，并用服务端 `count` 校验结果；操作者是当前用户时同步更新 `reactedByMe`。

- `version <= local.version`：忽略重复或旧事件。
- `version == local.version + 1`：直接更新对应 emoji。
- 版本跳跃、本地没有有效缓存，或更新后 `userIDs.length != count`：标记 stale，批量查询
  权威摘要。

Web 在内存中为每次连接维护一个 Reaction 校验周期。首次启动或断线重连时先显示本地
缓存，再为当前可见消息批量获取一次权威摘要；其他会话和更早的消息在本周期第一次显示时
再批量校验。同一批消息在连接稳定期间不重复查询，SDK 不需要持久化这个周期状态。

因此离线期间同一消息即使发生 1000 次 Reaction 变化，客户端也只拉取一次最终摘要，
不会补放 1000 个中间事件。在线通知失败同样由下一次批量校验修复，不新增 outbox。

## 4. SDK 与 Web

SDK Core 新增独立本地表：

```text
local_message_reactions
  conversation_id, seq, version, reactions, stale
  PRIMARY KEY(conversation_id, seq)
```

`reactions` 缓存 `emoji/count/reactedByMe/userIDs`。SDK 在上抛业务通知前按版本更新
缓存，并暴露：

```text
GetMessageReactionSummaries(conversationID, seqs)
SetMessageReactionSummaries(conversationID, summaries)
```

Native、WASM/IndexedDB 和 JS SDK 补齐同一模型与 API。SDK 数据库按登录账号隔离；消息
或会话从本地删除时同步删除 Reaction 缓存。

Web 加载消息时先读 SDK 缓存；遇到 miss/stale，或消息在当前连接周期尚未校验时，调用
批量摘要接口。添加和取消继续乐观更新，API 返回后使用权威摘要覆盖。后台刷新期间继续
显示缓存，不阻塞消息。

Web 收到摘要后立即通过现有用户资料缓存解析 `userIDs`，缺少的资料在消息加载阶段合并
批量补查，悬停处理器不发网络请求。消息下方使用 GitHub 风格的 `emoji + count` 按钮；
当前用户点过的按钮使用明确的选中背景、边框和文字色。悬停显示完整用户名称，人数较多时
在限高浮层内滚动。

添加 Reaction 的选择器只展示上述 8 个表情。消息已有某个 Reaction 时点击按钮直接添加
或取消，不再打开选择器。

## 5. 改动范围

- `abd-im-protocol`：在现有 `MessageReaction` 增加完整 `userIDs` 并重新生成 protobuf；通知
  类型不变。
- `abd-im-server`：修改八个表情的白名单、摘要聚合及 protobuf 转换；数据库集合和在线
  通知配置不变。
- `abd-im-sdk-core`：删除废弃的 `LocalChatLogReactionExtensions`，新增本地 Reaction 表、
  事件归并、stale 处理和缓存 API。
- `abd-im-sdk-js-wasm`：增加 IndexedDB 表、worker 方法、类型和 SDK API。
- `abd-im-web`：缓存优先加载、连接周期批量校验、用户资料预取和 GitHub 风格交互。

本轮不增加 outbox、Reaction 持久化通知、`GetReactionUsers` 分页接口或新的服务端集合。

## 6. 验收标准

- 并发及重复添加/取消不会产生重复记录、负计数或错误版本。
- 客户端离线期间同一消息发生大量 Reaction，重连后只查询一次最终摘要且状态正确。
- 重复、乱序和版本缺口最终与批量摘要一致。
- 当前用户的 `reactedByMe` 不会被其他用户的事件覆盖。
- 选择器只出现约定的 8 个表情，列表外的表情会被服务端拒绝。
- 消息行显示 Reaction 表情和计数，当前用户点过的按钮具有明确选中状态。
- 悬停显示完整用户列表且不产生网络请求；新增或取消后本地名单正确更新。
- 同一连接周期内重复进入已校验会话不请求 Reaction；每批 20 条首次显示的消息最多发起
  一次批量请求。
