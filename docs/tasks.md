---
description: "Task list for Web message reactions"
---

# Tasks: Web 消息表情反应

**Input**: `abd-im-web/docs/message-reactions-web-plan.md`

**Repositories**: `abd-im-protocol`、`abd-im-server`、`abd-im-sdk-js-wasm`、`abd-im-web`

**Tests**: 设计方案第 9 节明确要求服务端、SDK、Web 和双浏览器测试，因此本清单包含测试任务。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可与同阶段其他任务并行，且不修改相同文件。
- **[Story]**: `US1` 幂等添加/取消、`US2` 权威摘要、`US3` 实时同步、`US4` Web 交互。
- 路径均以对应仓库根目录为基准，并在任务中标明仓库。

## Phase 1: Contracts And Shared Types

**Purpose**: 先固定跨仓库协议和 SDK 事件类型，解除 Server 与 Web 的编译依赖。

- [x] T001 [US1] 在 `abd-im-protocol/msg/msg.proto` 定义 reaction、summary、add/remove 请求响应，并向 `msg` service 增加 `AddReaction`、`RemoveReaction` RPC。
- [x] T002 [US2] 在 `abd-im-protocol/msg/msg.proto` 定义批量摘要请求响应，并向 `msg` service 增加 `GetReactionSummaries` RPC，限制语义为单会话最多 100 条消息。
- [x] T003 [US1] 运行 Protocol Go 代码生成，更新 `abd-im-protocol/msg/msg.pb.go` 与 `abd-im-protocol/msg/msg_grpc.pb.go`，运行 `go test ./msg`。
- [x] T004 [P] [US3] 在 `abd-im-sdk-js-wasm/src/types/eventData.ts` 增加 `OnRecvCustomBusinessMessage: unknown` 映射，由 Web 校验字符串或已解析对象，并运行 `pnpm typecheck` 与 `pnpm build`。

**Checkpoint**: Protocol 可供 Server 通过临时 Go workspace 使用；SDK 类型补丁可供 Web 本地 link 验证。

---

## Phase 2: Server Foundation

**Purpose**: 建立 MongoDB 存储、索引和消息访问校验；这是所有用户故事的阻塞项。

- [x] T005 [US1] 先在 `abd-im-server/pkg/common/storage/database/mgo/reaction_test.go` 编写反应唯一性、重复 add/remove 不变更版本、事务回滚测试。
- [x] T006 [US2] 在 `abd-im-server/pkg/common/storage/database/mgo/reaction_test.go` 编写多用户聚合、`reactedByMe`、空摘要 `version: 0` 和批量查询测试。
- [x] T007 [US1] 在 `abd-im-server/pkg/common/storage/model/reaction.go` 定义 `message_reactions` 与 `message_reaction_state` MongoDB 模型。
- [x] T008 [US1] 在 `abd-im-server/pkg/common/storage/database/mgo/reaction.go` 创建两个集合及唯一/聚合/批量索引，并由 `controller/reaction.go` 编排事务 add/remove。
- [x] T009 [US2] 实现单会话最多 100 条消息的权威摘要聚合查询，并按现有 RocksCache 模式分别缓存公共摘要和用户选择。
- [x] T010 [US1] 在 `abd-im-server/internal/rpc/msg/server.go` 按 `Mongo -> Redis cache -> controller` 注入 reaction database，并沿用现有 MongoDB 事务抽象，不增加启动模式限制。
- [x] T011 [P] [US1] 在 `abd-im-server/config/mongodb.yml` 与相关开发/测试部署文件中提供可执行事务的 replica set 配置，用于严格事务验证。

**Checkpoint**: 存储层在并发和重复请求下保持幂等；replica set 集成测试覆盖事务回滚。

---

## Phase 3: User Story 1 - 添加与取消反应 (Priority: P1)

**Goal**: 已鉴权用户可以对允许的消息幂等添加或取消六种固定表情。

**Independent Test**: 同一用户重复添加或取消同一表情，摘要不重复计数、版本不递增、事件不重复发送。

### Tests

- [x] T012 [US1] 先在 `abd-im-server/internal/rpc/msg/reaction_test.go` 编写非法 emoji、伪造 conversation/message 组合、非成员、已撤回和不允许消息类型的拒绝测试。
- [x] T013 [US1] 在 `abd-im-server/internal/api/msg_reaction_test.go` 增加 `/msg/add_reaction` 与 `/msg/remove_reaction` 鉴权和响应契约测试。

### Implementation

- [x] T014 [US1] 在 `abd-im-server/internal/rpc/msg/reaction.go` 实现消息存在性、消息类型、单聊参与者与当前群成员校验，并调用事务存储。
- [x] T015 [US1] 在 `abd-im-server/internal/api/msg.go` 增加 add/remove HTTP handlers，从 IM Token 上下文取得用户 ID，不接收请求体 `userID`。
- [x] T016 [US1] 在 `abd-im-server/internal/api/router.go` 注册 `POST /msg/add_reaction` 和 `POST /msg/remove_reaction`。

**Checkpoint**: US1 可通过 HTTP 独立调用并通过权限与幂等测试。

---

## Phase 4: User Story 2 - 批量权威摘要 (Priority: P1)

**Goal**: Web 一次请求获得当前会话最多 100 条消息的服务端权威反应摘要。

**Independent Test**: 查询 20 条历史消息只发一个请求，响应覆盖全部有效 ID；从未反应的消息返回 `version: 0` 和空列表。

### Tests

- [x] T017 [US2] 在 `abd-im-server/internal/rpc/msg/reaction_test.go` 增加批量大小、跨会话消息 ID、非成员和空摘要测试。
- [x] T018 [US2] 在 `abd-im-server/internal/api/msg_reaction_test.go` 增加 `/msg/get_reaction_summaries` 响应契约测试。

### Implementation

- [x] T019 [US2] 在 `abd-im-server/internal/rpc/msg/reaction.go` 实现批量消息校验与当前用户摘要查询。
- [x] T020 [US2] 在 `abd-im-server/internal/api/msg.go` 和 `abd-im-server/internal/api/router.go` 增加 `POST /msg/get_reaction_summaries`。
- [x] T021 [P] [US2] 在 `abd-im-web/src/api/messageReaction.ts` 定义请求、摘要类型和三个使用现有 IM Token Axios 工具的 API 方法。

**Checkpoint**: US2 以 HTTP 查询结果作为事实源，不依赖实时通知。

---

## Phase 5: User Story 3 - 实时同步与校正 (Priority: P2)

**Goal**: 已打开相同会话的 Web 客户端实时看到反应变化，漏事件后自动回查恢复。

**Independent Test**: 重复、乱序和版本跳跃事件不会产生永久错误；通知失败不影响已提交 API 结果。

### Tests

- [x] T022 [US3] 在 `abd-im-server/internal/rpc/msg/reaction_test.go` 验证仅有效变更发布一次 `message.reaction.updated`，通知失败不回滚反应。
- [x] T023 [P] [US3] 在 `abd-im-web/e2e/message-reaction-state.spec.ts` 增加 reducer 测试，覆盖重复、下一版本、版本跳跃和当前用户推导。

### Implementation

- [x] T024 [US3] 在 `abd-im-server/internal/rpc/msg/reaction.go` 事务提交后 best-effort 发送不持久化、不计未读、无离线推送的 `BusinessNotification`。
- [x] T025 [US3] 在 `abd-im-web/src/layout/useGlobalEvents.tsx` 注册并释放 `OnRecvCustomBusinessMessage`，校验 `message.reaction.updated` 数据后发布本地事件。
- [x] T026 [US3] 在 `abd-im-web/src/pages/chat/queryChat/useMessageReactions.ts` 实现按会话的摘要状态、版本合并、跳跃回查和 `(clientMsgID, emoji)` 请求中状态。

**Checkpoint**: US3 的通知只负责加速；刷新、重连和回查可恢复权威状态。

---

## Phase 6: User Story 4 - Web 反应交互 (Priority: P2)

**Goal**: 用户可从消息旁固定六表情选择器添加反应，并从气泡下方按钮取消或添加已有反应。

**Independent Test**: 桌面和窄窗口均无遮挡；快速双击不会留下错误计数；Electron 构建不展示首期 Web-only 功能。

### Tests

- [x] T027 [P] [US4] 为 `abd-im-web/src/pages/chat/queryChat/MessageItem/MessageReactionBar.tsx` 增加组件交互测试。
- [x] T028 [US4] 在 `abd-im-web/e2e/message-reactions.spec.ts` 增加两个浏览器上下文的实时变化、刷新恢复、摘要批量请求和窄窗口 Popover 测试。

### Implementation

- [x] T029 [P] [US4] 在 `abd-im-web/src/pages/chat/queryChat/MessageItem/MessageReactionBar.tsx` 与 `message-item.module.scss` 实现固定六表情 Popover、反应条、选中态和稳定尺寸。
- [x] T030 [US4] 在 `abd-im-web/src/pages/chat/queryChat/MessageItem/index.tsx` 接入反应条和添加控件，只对允许的已持久化用户消息显示。
- [x] T031 [US4] 在 `abd-im-web/src/pages/chat/queryChat/ChatContent.tsx` 或相邻会话容器接入 `useMessageReactions`，初始、翻页和重连时仅批量加载新增消息 ID。
- [x] T032 [US4] 使用现有构建目标判断限制功能只在 Web 显示，避免 Electron 共享组件意外启用。

**Checkpoint**: US4 在 Web 中完成添加、取消、实时更新和恢复闭环。

---

## Phase 7: Integration And Release

- [ ] T033 发布新的 `abd-im-protocol` 版本，并在 `abd-im-server/go.mod`、`go.sum` 升级依赖；发布前使用临时 `go.work` 联调，不提交本地 `replace`。
- [ ] T034 [P] 发布新的 `@abd-im/wasm-client-sdk` patch 版本，并在 `abd-im-web/package.json`、`pnpm-lock.yaml` 升级依赖；发布前使用本地 link 验证，不提交 `link:`。
- [x] T035 在 `abd-im-server` 运行 reaction 定向测试和 `go test ./internal/api ./internal/rpc/msg ./pkg/common/storage/controller ./pkg/common/storage/cache/redis ./pkg/common/storage/database/mgo`，并在本地 replica set 运行真实事务集成用例。
- [ ] T036 [P] 在 `abd-im-web` 运行 `pnpm lint`、`pnpm build:web` 和 reaction 组件测试。
- [ ] T037 在 replica set 测试环境运行 `abd-im-web/e2e/message-reactions.spec.ts`，记录两个浏览器上下文的结果。
- [x] T038 核对 `abd-im-sdk-core`、`abd-im-cli` 和其他客户端无代码修改，并用 `git diff --check` 检查四个目标仓库。

## Dependencies & Execution Order

- T001-T003 阻塞 Server RPC 编译；T004 阻塞 Web 对业务通知回调的无类型绕过接入。
- T005-T011 阻塞所有 Server 用户故事。
- US1 与 US2 共用 reaction repository，完成 Foundation 后按 T014-T016、T019-T020 顺序落地。
- US3 依赖 US1 的有效变更结果和 US2 的回查接口。
- US4 可在 HTTP 类型确定后与 Server 实现并行，但 E2E 必须等待 US1-US3 完成。
- T033、T034 是正式依赖升级关卡；发布前只允许临时 workspace/link，不提交机器相关路径。

## Parallel Execution

- Protocol T001-T003、SDK T004、Server T005-T011、Web T021/T023/T027/T029 可由不同开发者并行。
- Server 与 Web 不修改相同仓库文件，可在协议字段名固定后并行。
- T035 与 T036 可并行；T037 必须在两者成功且 replica set 环境可用后执行。

## Completion Criteria

- 三个 HTTP API、三个 gRPC RPC、两集合存储和三个索引均已实现并通过测试；replica set 下覆盖事务回滚。
- 重复 add/remove 不变更计数或版本，通知失败不回滚。
- 批量摘要覆盖全部有效消息，空状态为 `version: 0`。
- Web 可添加、取消、实时同步并在刷新、重连、翻页或事件跳跃后恢复。
- 正式提交不包含本地 `replace`、`link:`、生成缓存或无关格式化修改。
