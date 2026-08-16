# ABD IM Web Runtime Architecture

本文描述浏览器版 `abd-im-web`、`@abd-im/wasm-client-sdk`、`abd-im-sdk-core` 和
`abd-im-server` 如何组成一个完整的运行时。理解事件时不能只看其中一个仓库：Web
负责界面状态，JS SDK 负责 JavaScript/WASM 桥接，SDK Core 负责 IM 业务、本地数据和
同步，Server 才是远端权威数据源。

本文重点描述 `BUILD_TARGET=web` 的 WASM 路径。Electron 保留相似的上层 API，但通过
preload 和 Electron main process 调用原生 SDK，不经过本文图中的 Go WASM 边界。

## 核心架构总图

图中所有线条和标识均只使用 ASCII 字符。向下的实线主要表示命令调用，向上的实线
主要表示回调事件，左右分支表示网络和本地持久化。

```text
+==================================================================================================================+
|                                            BROWSER / RENDERER                                                    |
|                                                                                                                  |
|  +------------------------------------------ ABD-IM-WEB ------------------------------------------------------+  |
|  |                                                                                                            |  |
|  |  +----------------------+       commands        +-----------------------+                                  |  |
|  |  | React pages/hooks    | --------------------> | IMSDK singleton       |                                  |  |
|  |  |                      |                       | MainContentWrap.tsx   |                                  |  |
|  |  | EditSelfInfo         | <-------------------- | Promise result        |                                  |  |
|  |  | ChatFooter           |     resolve/reject    +----------+------------+                                  |  |
|  |  | HistoryMessageList   |                                  |                                               |  |
|  |  +----------+-----------+                                  | SDK methods                                   |  |
|  |             ^                                              v                                               |  |
|  |             |                                   +----------+-----------+                                   |  |
|  |             |  CbEvents                         | useGlobalEvents      |                                   |  |
|  |             +-----------------------------------+ IMSDK.on/off         |                                   |  |
|  |                                                 +----------+-----------+                                   |  |
|  |                                                            |                                               |  |
|  |               +---------------------+      +---------------+------------------+                            |  |
|  |               | Zustand stores      | <--- | event handlers                   |                            |  |
|  |               | user/contact/conv   |      | self/friend/group/message/sync   |                            |  |
|  |               +---------------------+      +---------------+------------------+                            |  |
|  |                                                            | emit                                          |  |
|  |                                                            v                                               |  |
|  |               +---------------------+      +---------------+------------------+                            |  |
|  |               | React local state   | <--- | Web mitt emitter                 |                            |  |
|  |               | loaded messageList  |      | UPDATE_MSG_SENDER/PUSH_NEW_MSG   |                            |  |
|  |               +---------------------+      +----------------------------------+                            |  |
|  +------------------------------------------------------------------------------------------------------------+  |
|                                                                                                                  |
|  +--------------------------------------- WASM-CLIENT-SDK (JAVASCRIPT) ---------------------------------------+  |
|  |                                                                                                            |  |
|  |  +----------------------+      +-------------------------+      +---------------------------------------+  |  |
|  |  | getSDK singleton     | ---> | SDK extends Emitter     | ---> | public typed API from index.d.ts      |  |  |
|  |  +----------------------+      +------+-------+----------+      +---------------------------------------+  |  |
|  |                                       |       ^                                                            |  |
|  |                              _invoker |       | emit(parsed.event, parsed)                                 |  |
|  |                                       v       |                                                            |  |
|  |  +----------------------+      +------+-------+----------+      +---------------------------------------+  |  |
|  |  | WASM loader          | ---> | window.<api> functions  |      | window.commonEventFunc(callback)      |  |  |
|  |  | wasm_exec.js + Go    |      | setSelfInfo/login/etc   |      | JSON parse + event dispatch           |  |  |
|  |  | openIM.wasm          |      +-----------+-------------+      +-------------------+-------------------+  |  |
|  |  +----------------------+                  |                                        ^                      |  |
|  |                                            | Promise                                | event JSON           |  |
|  |                                            v                                        |                      |  |
|  |  +----------------------+      +-----------+-------------+                          |                      |  |
|  |  | DB API on window     | <--- | Go calls JS DB methods  |                          |                      |  |
|  |  | initDB/get/update... |      | through syscall/js      |                          |                      |  |
|  |  +----------+-----------+      +-------------------------+                          |                      |  |
|  |             | RPC                                                                   |                      |  |
|  |             v                                                                       |                      |  |
|  |  +----------------------+      +-------------------------+                          |                      |  |
|  |  | database Web Worker  | ---> | sql.js / SQLite         | ---> IndexedDB           |                      |  |
|  |  | rpc-shooter bridge   |      | absurd-sql backend      |      persistence         |                      |  |
|  |  +----------------------+      +-------------------------+                          |                      |  |
|  +--------------------------------------------+----------------------------------------+----------------------+  |
|                                               | JS/WASM ABI                            ^                         |
+===============================================+========================================+=========================+
                                                |                                        |
                                                v                                        |
+===============================================+========================================+=========================+
|                                      ABD-IM-SDK-CORE (GO, GOOS=js GOARCH=wasm)                                   |
|                                                                                                                  |
|  +----------------------------------------- WASM ADAPTERS ----------------------------------------------------+  |
|  |                                                                                                            |  |
|  |  cmd/main.registerFunc                                                                                     |  |
|  |  js.Global().Set("login", "setSelfInfo", "sendMessage", ...)                                               |  |
|  |             |                                                                                              |  |
|  |             v                                                                                              |  |
|  |  wasm_wrapper.Wrapper* ---> event_listener.Caller ---> PromiseHandler.resolve/reject ----------------------+--+
|  |                                                                                                            |  |
|  |  FriendCallback/UserCallback/GroupCallback <--- EventData <--- string listener callbacks                   |  |
|  |             |                                                                                              |  |
|  |             +--- SetEvent("On...") + SetData(JSON) + SendMessage() ----------------------------------------+--+
|  +-------------+----------------------------------------------------------------------------------------------+  |
|                ^                                                                                                 |
|                | listener interface                                                                              |
|  +-------------+------------------------------ OPEN_IM_SDK FACADE --------------------------------------------+  |
|  |                                                                                                            |  |
|  |  open_im_sdk.SetSelfInfo/Login/...                 open_im_sdk.SetFriendListener/...                       |  |
|  |             |                                                  |                                           |  |
|  |             v                                                  v                                           |  |
|  |  call()/messageCall()                                  UserContext listener slots                          |  |
|  |             |                                                  |                                           |  |
|  |             v                                                  v                                           |  |
|  |  UserContext.User/Relation/Group/Conversation          setListener() during login                          |  |
|  +-------------+--------------------------------------------------+-------------------------------------------+  |
|                |                                                  ^                                              |
|                v                                                  |                                              |
|  +-------------+-------------------------- CORE DOMAIN -----------+-------------------------------------------+  |
|  |                                                                                                            |  |
|  |  +------------+  +------------+  +------------+  +---------------+  +-----------------------------------+  |  |
|  |  | User       |  | Relation   |  | Group      |  | Conversation  |  | Interaction                       |  |  |
|  |  | self/cache |  | friend     |  | member     |  | msg/history   |  | LongConnMgr + MsgSyncer           |  |  |
|  |  +-----+------+  +-----+------+  +-----+------+  +-------+-------+  +-----------------+-----------------+  |  |
|  |        |               |               |                 ^                            |                    |  |
|  |        +---------------+---------------+-----------------+----------------------------+                    |  |
|  |                                conversationEventQueue                                                      |  |
|  |                         CmdNotification/CmdUpdateMessage/CmdSyncData                                       |  |
|  |                                                                                                            |  |
|  |  +----------------------+      +-------------------------+      +---------------------------------------+  |  |
|  |  | VersionSynchronizer  | ---> | generic Syncer          | ---> | WithInsert/Update/Delete              |  |  |
|  |  | incremental/full     |      | compare server/local    |      | WithNotice -> listener callback       |  |  |
|  |  +----------------------+      +-------------------------+      +-------------------+-------------------+  |  |
|  |                                                                                     |                      |  |
|  |  +----------------------------------------- CALLBACK TYPE ADAPTER ------------------+----------------------+  |
|  |  | OnFriendshipListenerSdk.OnFriendInfoChanged(LocalFriend)                                                |  |
|  |  |   -> callback_go_sdk.go serializes LocalFriend                                                          |  |
|  |  |   -> OnFriendshipListener.OnFriendInfoChanged(string)                                                   |  |
|  |  |   -> current listener is wasm FriendCallback                                                            |  |
|  |  +---------------------------------------------------------------------------------------------------------+  |
|  +-----------------------------------+---------------------------------------------------+--------------------+  |
|                                      |                                                   |                       |
|                         local DB API |                                      network API  |                       |
|                                      v                                                   v                       |
|  +-----------------------------------+----------------+      +---------------------------+--------------------+  |
|  | pkg/db IndexDB + wasm/indexdb + exec.Exec          |      | pkg/network.ApiPost + LongConnMgr WebSocket    |  |
|  | Go method name -> window DB method -> JS Worker    |      | HTTP request/response + push/max-seq/pull      |  |
|  +----------------------------------------------------+      +---------------------------+--------------------+  |
+================================================================================================+=================+
                                                                                                 | HTTP / WebSocket
                                                                                                 v
+================================================================================================+=================+
|                                                ABD-IM-SERVER                                                     |
|                                                                                                                  |
|  +----------------------+      +-------------------------+      +---------------------------------------------+  |
|  | API / WS gateway     | ---> | user/relation/group/msg | ---> | MongoDB + Redis/cache                       |  |
|  | auth + operationID   |      | RPC services            |      | users/friends/groups/messages/version logs  |  |
|  +----------+-----------+      +------------+------------+      +---------------------------------------------+  |
|             |                               |                                                                    |
|             | normal message                | profile/relation/group change                                      |
|             v                               v                                                                    |
|  +----------+-----------+      +------------+------------+      +---------------------------------------------+  |
|  | message persistence  | ---> | notification messages   | ---> | durable version logs                        |  |
|  | seq and offline data |      | real-time WS wakeup     |      | incremental sync or full-sync fallback      |  |
|  +----------------------+      +-------------------------+      +---------------------------------------------+  |
|                                         |                                                                        |
|                                         +---------------- WebSocket push ----------------------------------------+
+==================================================================================================================+
```

## 先建立正确的运行时模型

这不是一个“React 调 HTTP 接口、拿到 JSON 后渲染”的普通后台系统。浏览器里还运行着一套
完整的 IM 客户端：它维护长连接、同步消息、保存本地数据库，并在断线重连后补齐数据。
React 只是这套客户端的界面。

```text
ordinary web application:
React -> HTTP API -> Server -> JSON -> React

this IM application:
React -> JS SDK -> Go WASM SDK Core -> local database
                                  -> HTTP/WebSocket -> Server
```

### 四层分别拥有哪部分状态

| 层       | 它真正负责的事情                                             | 数据能保存多久           |
| -------- | ------------------------------------------------------------ | ------------------------ |
| Web      | 页面交互、Zustand、组件自己的 React state                    | 页面或应用进程存活期间   |
| JS SDK   | TypeScript API、Promise、事件分发、WASM 和数据库 Worker 桥接 | 当前 JavaScript 运行期间 |
| SDK Core | IM 业务、长连接、消息同步、版本同步和本地数据模型            | 内存加浏览器本地数据库   |
| Server   | 用户、好友、群、消息、通知、序列号和版本日志的权威数据       | 服务端持久化             |

后文反复出现的几个词含义如下：

- **权威数据**：发生冲突时以它为准的数据，例如 Server User。
- **本地投影**：为了让客户端快速展示而保存的服务端数据副本，例如 `LocalFriend`。投影可以暂时
  落后，但同步完成后应与服务端收敛。
- **消息快照**：消息发送时记录的昵称和头像。它描述“发送当时是谁”，不要求永远等于当前资料。
- **通知**：告诉客户端“某类数据变了”，主要用于立即唤醒同步，不一定携带完整的最终数据。
- **版本**：描述好友列表、群成员列表等数据集合已经变化到哪一步，用于拉取增量。
- **消息序列号 `seq`**：描述消息流已经收到哪一条，用于发现并补拉漏掉的消息或通知。

### 总图中的线怎么读

| 图形      | 含义                                   |
| --------- | -------------------------------------- |
| `=`       | Browser、SDK Core、Server 等系统级边界 |
| `-`       | 系统内部模块边界                       |
| `--->`    | 调用、写入或消息发送                   |
| `<---`    | 返回值或反向数据流                     |
| `v` / `^` | 请求向下进入底层，或事件向上返回 UI    |
| `+`       | 框角、分支或边框交点；实际方向仍看箭头 |

Web 和 JS SDK 都在 Browser 内，二者之间只是 JavaScript 调用。JS SDK 与 SDK Core 之间才是
JavaScript/WASM 边界：左侧路径把 API 调用送入 Go，右侧路径把 Go 事件送回 JavaScript。
SDK Core 底部又分成两路：左边访问浏览器本地数据库，右边连接 Server。

一次业务变化通常会走四种回路：

| 回路           | 解决的问题                                         |
| -------------- | -------------------------------------------------- |
| API + Promise  | 告诉调用页面“这次命令成功还是失败”                 |
| SDK event      | 告诉 Web“SDK 本地状态已经发生变化”                 |
| Local database | 让刷新页面或短暂离线后仍能读取消息、好友和同步进度 |
| Offline sync   | 补回断网期间漏掉的数据，并让本地投影重新追上服务端 |

Promise 和事件不能相互替代。`setSelfInfo()` 成功，只能证明修改命令执行成功；页面还要等资料同步
事件来更新各份 UI 状态。反过来，收到事件也不代表 React 中所有旧数组会被自动重写。

发布包中的 `lib/index.d.ts` 只是 JS SDK 的 TypeScript 说明书，不是函数体。对应源码位于
`abd-im-sdk-js-wasm/src/sdk/index.ts`；它构建为 `lib/index.es.js` 后安装进 Web 的
`node_modules`。运行时再从这里进入 WASM wrapper、`open_im_sdk`，最后到 SDK Core 的
`internal` 业务实现。

## 为什么需要两套事件系统

以“Alice 已经打开和 Bob 的聊天窗口，此时 Bob 修改昵称”为例。浏览器中至少有三份互相
独立的数据：

```text
SDK local database: LocalFriend and LocalChatLog
Web application state: Zustand friend profile
Page local state: HistoryMessageList.loadState.messageList
```

SDK Core 可以更新第一类 SDK 本地数据库记录，但它不能直接修改后两类 Web 内存状态，更不能
取得某个 React 组件里的 `setLoadState`。Zustand 中的 Bob 已更新，也不会自动改写消息对象中
已经复制进去的 `senderNickname`。因此变化要接力传递两次：

```text
first relay: cross the SDK boundary

SDK Core OnFriendInfoChanged
  -> WASM EventData
  -> JS SDK CbEvents.OnFriendInfoChanged
  -> useGlobalEvents.friednInfoChangeHandler

second relay: stay inside the Web application

useGlobalEvents
  -> update Zustand friend
  -> mitt.emit("UPDATE_MSG_SENDER", profile)
  -> useHistoryMessageList listener
  -> setLoadState(newMessageList)
  -> React rerender
```

第一套 `CbEvents` 的职责是把变化从 Go SDK 送进 Web。第二套 `mitt` 的职责是把变化继续送到
持有独立页面 state 的组件。历史消息列表不是“只属于第二套事件”，而是完整地经过两套事件
串联后才更新。

本地数据库也不会主动驱动 React。即使 SDK Core 已把 `LocalChatLog` 中的昵称改成新值，当前
页面内存中的旧数组仍然存在；只有重新查询历史消息，或者通过 `mitt` 创建新数组并调用
`setLoadState`，屏幕才会变化。

## 为什么回调接口有两层

SDK Core 内部希望传递 Go 强类型对象，这样 `Relation` 可以直接使用 `LocalFriend` 的字段。
但是 Web、Flutter、React Native 等外部绑定无法共享 Go 对象，更适合接收 JSON 字符串。因此
项目故意定义了两层同名回调：

| 层                 | 参数                               | 使用者              |
| ------------------ | ---------------------------------- | ------------------- |
| SDK 内部强类型接口 | `OnFriendInfoChanged(LocalFriend)` | `internal/relation` |
| 跨语言绑定接口     | `OnFriendInfoChanged(string)`      | WASM 等平台绑定     |

`callback_go_sdk.go` 位于二者中间，只负责把 `LocalFriend` 序列化成 JSON。它不是浏览器事件
发布器；真正把 JSON 送到 JavaScript 的，是 WASM 构建中的 `FriendCallback`：

```text
Relation detects a changed LocalFriend
  -> typed OnFriendInfoChanged(LocalFriend)
  -> callback_go_sdk serializes it
  -> binding OnFriendInfoChanged(string)
  -> wasm FriendCallback builds EventData
  -> commonEventFunc receives JSON in JavaScript
```

登录时，WASM wrapper 先创建 `FriendCallback`，放进 `UserContext` 的监听器槽位；领域对象保存
的是一个 getter，需要回调时再从槽位取得当前监听器。这样监听器被重新设置后，`Relation`
不会继续调用过期实例。对应的源码定位链是：

```text
WrapperInitLogin.Login
  -> SetAllListener
  -> open_im_sdk.SetFriendListener(FriendCallback)
  -> UserContext.friendshipListener = FriendCallback
  -> UserContext.setListener
  -> Relation.SetListener(listener getter)
  -> NewOnFriendshipListenerSdk(getter)
```

`FriendCallback` 的实现带有 `//go:build js && wasm`。IDE 如果按本机目标索引 Go 项目，
Go to implementation 会把它排除；需要让 SDK Core 的索引目标使用 `GOOS=js`、
`GOARCH=wasm`。

## 从启动到资料同步

### 1. 加载、注册和登录

用户打开页面时，`getSDK()` 返回的是统一的 IMSDK 实例，但 SDK 还不能立刻处理业务请求。
浏览器必须先准备好三个运行条件：

1. 数据库 Worker 已启动，后续本地查询不会占用 React 主线程。
2. `openIM.wasm` 已下载并运行，Go 的 `main()` 已把 API 注册到 `window`。
3. Web 已注册 SDK 事件监听器，确保登录过程中产生的连接和同步事件不会无人接收。

`IMSDK.login()` 内部会等待 Worker 和 WASM 初始化 Promise，所以页面不必自己轮询
“WASM 是否加载完成”。登录成功也不只是服务端验证 token：SDK Core 还会建立
`UserContext`、注入各领域监听器，并启动 `LongConnMgr` 和 `MsgSyncer`。从这一刻开始，
浏览器才成为一个能够收推送、补消息和维护本地库的 IM 客户端。

启动阶段的职责可以概括为：

| 阶段         | 完成的事情                                     | 没完成会怎样                       |
| ------------ | ---------------------------------------------- | ---------------------------------- |
| JS SDK 构造  | 创建 Worker、数据库 API 和 WASM 加载任务       | 调用找不到数据库或 `window` Go API |
| Web 监听注册 | 订阅连接、资料、消息和同步事件                 | 事件发生了，但页面没有处理者       |
| SDK 登录     | 设置绑定层监听器、创建用户上下文、启动同步组件 | 只能调用外壳 API，不能正常收发同步 |

下面的链用于定位启动代码，不需要靠记住每个函数来理解机制：

```text
MainContentWrap module
  -> getSDK({ coreWasmPath, sqlWasmPath })
  -> SDK constructor
     -> initWorker()
     -> initDatabaseAPI()
     -> initializeWasm()
        -> new Go()
        -> WebAssembly.instantiateStreaming(openIM.wasm)
        -> go.run(instance)
        -> wasm/cmd/main.main
        -> registerFunc()
        -> js.Global().Set(...)

useGlobalEvent mount
  -> loginCheck()
  -> setIMListener()
     -> IMSDK.on(CbEvents.*, handler)
  -> loginCheck async continuation
  -> IMSDK.login(params)
     -> wait workerPromise
     -> wait wasmInitializedPromise
     -> window.commonEventFunc(jsCallback)
     -> window.initSDK(operationID, configJSON)
     -> window.login(operationID, userID, token)
     -> WrapperInitLogin.Login
        -> SetAllListener()
        -> open_im_sdk.Set*Listener(...)
        -> open_im_sdk.Login
        -> UserContext.login
        -> UserContext.setListener
        -> Relation.SetListener / User.SetListener / Group.SetListener
        -> start LongConnMgr and MsgSyncer
```

当前 Web 在同一个 effect 中启动 `loginCheck()`，随后执行 `setIMListener()`。由于
`loginCheck()` 内部先异步读取存储，实际登录通常晚于监听注册。不过代码维护时仍应保持一个
明确规则：**先注册监听器，再调用登录**。否则初始化速度或存储实现变化后，可能出现只在
冷启动偶发的丢事件问题。

### 2. 普通 API 的 Promise 路径

以 Alice 把昵称从 `Alice` 改成 `Alice Chen` 为例。页面调用 `setSelfInfo()` 后，命令需要跨过
JavaScript/WASM 边界，由 SDK Core 发 HTTP 请求给 Server。Server 成功写入权威用户资料后，
结果沿原路返回，最终 resolve JavaScript Promise。

这个 Promise 回答的是：

> Server 是否接受并完成了这次修改命令？

它不回答“好友本地库是否已同步”“历史消息是否已换成新昵称”或“其他设备是否已经更新”。
这些属于后续状态同步，由 SDK 事件负责。页面可以在 Promise 成功后关闭编辑弹窗或显示操作
成功，但资料展示仍应以同步事件带回的数据为准。

源码定位链如下：

```text
EditSelfInfo
  -> IMSDK.setSelfInfo({ nickname })
  -> SDK._invoker("setSelfInfo", window.setSelfInfo, args)
  -> window.setSelfInfo(operationID, JSON)
  -> WrapperUser.SetSelfInfo
  -> event_listener.NewCaller(...).AsyncCallWithCallback()
  -> open_im_sdk.SetSelfInfo
  -> call(..., IMUserContext.User().SetSelfInfo, ...)
  -> internal/user.User.SetSelfInfo
  -> updateUserInfo
  -> api.UpdateUserInfoEx.Execute
  -> network.ApiPost("/user/update_user_info_ex")
  -> server user service
  -> BaseCallback.OnSuccess/OnError
  -> PromiseHandler.resolve/reject
  -> JS Promise resolve/reject
  -> Web mutation onSuccess/onError
```

`operationID` 是这条命令的链路追踪 ID。它贯穿 JS SDK、WASM wrapper、SDK Core context
和 HTTP header。当页面提示成功但 SDK 日志异常时，可以用同一个 `operationID` 把一次调用
在四层中的日志串起来，而不必只凭时间猜测哪些日志属于同一请求。

### 3. 自己资料更新事件

修改命令成功后，SDK Core 不直接把请求参数当成最终资料写入所有位置。它会重新从 Server
获取登录用户资料，再与 `LocalUser` 比较。这样即使 Server 做了字段规范化、回调修改或权限
过滤，本地保存的仍是服务端最终结果，而不是客户端提交前的猜测。

同步过程分三步：

1. **取得最终值**：`SyncLoginUserInfo` 从 Server 拉取当前用户，再读取本地 `LocalUser`。
2. **更新 SDK 投影**：Syncer 发现字段变化后，先写本地用户表，再更新会话和本地消息的展示
   字段。
3. **通知 Web**：`OnSelfInfoUpdated` 穿过 WASM 边界，Web 再更新 Zustand 和当前页面已经
   加载的消息数组。

因此“本人资料”至少会影响以下几份数据：

| 数据                                 | 为什么要更新                             |
| ------------------------------------ | ---------------------------------------- |
| Server User                          | 全局权威资料                             |
| SDK `LocalUser`                      | 本机后续查询使用的当前资料               |
| SDK `LocalConversation/LocalChatLog` | 会话列表和历史消息的本地展示投影         |
| Web Zustand                          | 头像、个人资料页等应用级 UI              |
| React `messageList`                  | 当前已经加载、不会自动重新查询的消息对象 |

SDK Core 内部的源码定位链是：

```text
internal/user.User.SetSelfInfo
  -> updateUserInfo
  -> SyncLoginUserInfo
  -> GetSingleUserFromServer
  -> GetLoginUser from local DB
  -> userSyncer.Sync(server, local)
  -> WithUpdate
     -> UpdateLoginUser in local DB
  -> WithNotice(Update)
     -> OnSelfInfoUpdated(JSON)
     -> DispatchUpdateConversation
     -> DispatchUpdateMessage
        -> Conversation.Work(CmdUpdateMessage)
        -> doUpdateMessage
        -> update sender profile in local chat logs
```

Web 收到的不是 HTTP Promise，而是“SDK 本地资料已经变化”的事件：

```text
UserCallback.OnSelfInfoUpdated
  -> EventData.SetEvent("OnSelfInfoUpdated")
  -> EventData.SetData(userJSON)
  -> EventData.SendMessage
  -> JS commonEventFunc callback
  -> JSON.parse
  -> SDK.emit(CbEvents.OnSelfInfoUpdated, event)
  -> useGlobalEvents.selfUpdateHandler
  -> updateSelfInfo(data)
  -> updateMessageSender(data) for current single conversation
  -> mitt UPDATE_MSG_SENDER
  -> useHistoryMessageList.setLoadState
```

Server 还会发送 `UserInfoUpdatedNotification`，用于唤醒同一账号的其他在线设备。其他设备
收到通知后也执行 `SyncLoginUserInfo`，从而拉到同一份权威资料。发起修改的设备可能既主动
同步一次，又收到服务端通知；这不会导致 UI 无限重复更新，因为 Syncer 会比较 Server 和
Local，字段没有变化时不会再次产生 Update 回调。

这里还有一个群聊例外：`selfUpdateHandler` 只直接刷新当前单聊消息。群聊显示的是群成员资料，
可能存在独立群昵称，不能用全局昵称直接覆盖；群聊更新由后面的群成员同步负责。

### 4. 好友资料在线更新

假设 Alice 和 Bob 是好友，Alice 当前在线，Bob 修改了昵称。Server 不能只更新 Bob 的用户表，
因为 Alice 的客户端还保存着一份 Bob 的 `LocalFriend`。Server 会找到所有把 Bob 当作好友的
owner，并分别把这些 owner 的好友列表版本加一。这里的 **owner** 就是“这份好友列表属于谁”；
Alice 的好友列表版本与另一个好友 Carol 的版本彼此独立。

Server 随后给 Alice 发送 `FriendInfoUpdatedNotification`。这条通知主要表达“Bob 相关的好友
资料变了”，不是让客户端直接把通知内容写入好友表。Alice 的 SDK 收到它后，带着本地好友
版本请求增量接口，Server 才返回最新的 Bob 好友对象。这样在线通知和离线补偿最终使用同一
套同步逻辑，不会形成两套资料合并规则。

从业务角度看，完整过程是：

1. Bob 的权威用户资料更新。
2. Server 把 Alice 的好友列表版本加一，并记录“Bob，Update”。
3. 通知唤醒 Alice 的 SDK。
4. Alice 请求“从我的本地版本之后，好友列表发生了什么变化”。
5. SDK 先更新 `LocalFriend`，再发布 `OnFriendInfoChanged`。
6. SDK 同时更新本地会话和消息展示字段；Web 更新 Zustand 与已加载的消息数组。

下面是对应的服务端和客户端源码定位链：

```text
Server user profile update
  -> userServer.NotificationUserInfoUpdate
  -> relation.NotificationUserInfoUpdate
  -> FindFriendUserIDs(changedUserID)
  -> for each friend owner:
     -> OwnerIncrVersion(ownerID, changedUserID, Update)
     -> FriendInfoUpdatedNotification(changedUserID, ownerID)
  -> notification message / WebSocket push

SDK Core LongConnMgr
  -> doPushMsg
  -> MsgSyncer
  -> DispatchNotification
  -> Conversation.Work(CmdNotification)
  -> doNotificationManager
  -> Relation.DoNotification
  -> case FriendInfoUpdatedNotification
  -> IncrSyncFriends
  -> GetIncrementalFriends(localVersion)
  -> VersionSynchronizer.IncrementalSync
  -> friendSyncer.Sync(server, local)
  -> WithUpdate(UpdateFriend in local DB)
  -> WithNotice(Update)
     +-> friendshipListener.OnFriendInfoChanged(LocalFriend)
     |   -> callback_go_sdk adapter
     |   -> FriendCallback.OnFriendInfoChanged(string)
     |   -> EventData.SendMessage
     |   -> JS SDK emit(OnFriendInfoChanged)
     |   -> Web friednInfoChangeHandler
     |   -> contactStore.updateFriend
     |   -> mitt UPDATE_MSG_SENDER for current single conversation
     |
     +-> DispatchUpdateConversation
     +-> DispatchUpdateMessage
         -> Conversation.Work(CmdUpdateMessage)
         -> UpdateMsgSenderFaceURLAndSenderNickname
         -> local chat log DB
```

`friendSyncer.Sync` 有一个重要顺序：先执行 `WithUpdate` 写本地好友表，成功后才执行
`WithNotice`。所以 Web 收到 `OnFriendInfoChanged` 时，再调用 SDK 查询好友，应该已经能读到
新资料。

但这不意味着所有展示副本在同一条语句里同时变化。`WithNotice` 中又分别执行 Web 回调、
`DispatchUpdateConversation` 和 `DispatchUpdateMessage`：它们更新的是 Web 内存、会话投影和
本地消息表。三者是独立副本，只是最终使用同一份服务端资料收敛。

### 5. 好友资料离线后补偿

继续使用上面的例子，但这次 Bob 改昵称时 Alice 不在线。WebSocket 连接已经断开，所以 Alice
不可能在当时收到实时推送。系统仍然不会丢失这次变化，因为 Server 保存了两种持久化进度：

| 进度                 | 记录什么                         | 用来补什么                              |
| -------------------- | -------------------------------- | --------------------------------------- |
| 通知消息的 `seq`     | Alice 的通知消息流已经走到第几条 | 找回断线期间漏收的通知                  |
| Alice 的好友列表版本 | Alice 的好友集合已经变化到第几版 | 找回好友数据本身的 Insert/Update/Delete |

假设 Alice 离线前的本地好友版本是 17：

```text
Alice local friend version = 17

Bob changes nickname while Alice is offline
Server friend version for Alice = 18
Server version log for Alice = { friend: Bob, action: Update, version: 18 }

Alice reconnects with local version 17
Server returns Bob in Update and new version 18
SDK updates LocalFriend, then saves local version 18
```

这里有两道互相补充的保险：

1. **消息补拉**：`MsgSyncer` 比较服务端最大 `seq` 与本地已同步 `seq`。发现中间有缺口，就把
   漏掉的 `FriendInfoUpdatedNotification` 拉回来；处理通知时触发好友增量同步。
2. **登录/重连主动同步**：`Conversation.syncData` 不等待某一条通知，直接调用
   `IncrSyncFriendsWithLock`。即使通知处理异常，只要本地好友版本落后，仍能拉到变化。

两条路径的作用都是触发同步，最后都会进入同一个 `GetIncrementalFriends(localVersion)`。
对应源码定位链是：

```text
Server while client offline
  -> update authoritative user profile
  -> increment per-owner friend version
  -> append version-log element
  -> persist notification message and seq

Client reconnect/login
  +-> MsgSyncer compares max seq and pulls missed notifications
  |   -> FriendInfoUpdatedNotification
  |   -> IncrSyncFriends
  |
  +-> Conversation.syncData
      -> Relation.IncrSyncFriendsWithLock

Both paths converge at:
  -> GetIncrementalFriends(localVersion)
  -> friendSyncer.Sync
  -> OnFriendInfoChanged
  -> JS SDK event
  -> Web handler
```

`LocalVersionSync` 不只保存数字版本，还保存 `VersionID` 和已知好友 ID 列表。`VersionID`
用来判断客户端和服务端是否仍在同一条版本链上，ID 列表用于合并新增、删除和全量校验。
增量数据成功写入本地库后，SDK 才把本地版本推进到服务端返回的新版本；同步中途失败不会
假装已经完成。

版本日志不会无限保存。如果 Alice 离线太久，Server 已无法从版本 17 连续算出所有变化，
增量响应会标记 `Full`。SDK 随即执行 `friendSyncer.FullSync`，重新获取完整好友集合并重建本地
投影。这比返回一个不完整增量更昂贵，但能恢复正确状态。

因此这套设计的可靠性不依赖“那一刻 WebSocket 必须在线”。WebSocket 决定变化能否立即出现，
`seq` 和版本同步决定客户端最终能否恢复正确。最后发给 Web 的 `OnFriendInfoChanged` 是同步
成功后的结果通知，不是离线数据的唯一载体。

### 6. 历史消息读取与发送者资料

一条消息里保存 `senderNickname` 和 `senderFaceUrl`，并不表示这些字段只有一份。发送后至少
存在三种语义不同的数据：

| 数据                              | 含义                                       |
| --------------------------------- | ------------------------------------------ |
| Server Message 中的发送者字段     | 发送时快照，用于离线展示并避免每次关联查询 |
| SDK `LocalChatLog` 中的发送者字段 | 当前客户端的展示投影，可以随资料同步而更新 |
| React `loadState.messageList`     | 本次查询后已经加载到页面内存中的消息对象   |

服务端历史消息保留旧昵称可以是有意的快照语义；聊天界面希望显示当前昵称，则由 SDK 本地展示投影
处理。SDK 读取历史消息时，不只是原样返回消息表，还会根据当前会话资料补全发送者显示值：单聊
使用本人 `LocalUser` 和对方 `LocalConversation`，群聊使用对应的 `LocalGroupMember`。

首次加载历史消息的源码定位链如下：

```text
useHistoryMessageList
  -> IMSDK.getAdvancedHistoryMessageList
  -> JS _invoker
  -> WASM WrapperConMsg
  -> open_im_sdk
  -> Conversation.GetAdvancedHistoryMessageList
  -> local chat-log DB
  -> faceURLAndNicknameHandle
     +-> singleHandle: self LocalUser + peer LocalConversation
     +-> groupHandle: LocalGroupMember
  -> Promise returns MessageItem[]
  -> React loadState.messageList
```

问题出现在“消息已经加载到页面以后”。这时下面三份数据互相独立：

```text
SDK local database message
Zustand friend profile
HistoryMessageList loadState.messageList
```

修改 SDK 本地数据库，不会主动修改已经存在的 JavaScript 数组；更新 Zustand 中的好友资料，
也不会重写数组内每条消息复制的 `senderNickname`。React 不会监视 IndexedDB 的行变化，更
不会猜测应该重新执行一次历史消息查询。

因此资料事件进入 Web 后，还要通过第二套 `mitt` 事件精确通知历史消息 Hook：

```text
SDK profile event
  -> useGlobalEvents
  -> updateMessageSender(profile)
  -> mitt.emit("UPDATE_MSG_SENDER", profile)
  -> updateHistoryMessageSender(oldMessageList, profile)
  -> return old array if unchanged
  -> return new array and changed message objects if changed
  -> React rerender
```

这两套事件是串联关系：SDK `CbEvents` 先把变化跨过 WASM 边界送到 `useGlobalEvents`，Web
`mitt` 再把变化送到持有独立 `messageList` 的组件。缺少前一段，Web 不知道 SDK 有变化；
缺少后一段，Zustand 虽然是新的，已加载消息仍然是旧对象。

`updateHistoryMessageSender` 使用不可变更新：

- 没有消息匹配时，返回原数组，避免无意义渲染。
- 有消息变化时，创建新数组，并只为变化的消息创建新对象。
- `messageList === preState.messageList` 比较的是数组引用，用来判断是否真的创建了新状态；
  这段代码不会偷偷修改旧数组内部的值。

### 7. 群成员昵称和头像更新

群聊比单聊多一层资料。Bob 的全局昵称可能是 `Bob`，在“研发群”里设置为 `后端 Bob`，在
另一个群里仍使用全局昵称。因此 `(groupID, userID)` 对应的 `GroupMember` 必须保存群级字段，
不能只凭 `userID` 查询全局 User。

群成员字段采用“覆盖值 + 空值继承”规则：

```text
Group member display profile

group-specific nickname != ""  -> use group-specific nickname
group-specific nickname == ""  -> use global user nickname

group-specific faceURL != ""    -> use group-specific faceURL
group-specific faceURL == ""    -> use global user faceURL
```

这意味着 GroupMember 中存一份昵称和头像不是简单的无条件复制：

- 非空值表示这个群自己的覆盖，用户修改全局昵称时不能改掉它。
- 空值表示没有群级覆盖，读取时由 `PopulateGroupMember` 用全局 User 补齐。
- 昵称和头像分别判断；可以群昵称自定义、头像仍继承全局资料。

当 Bob 修改全局昵称时，Group Service 会查找 Bob 所在的群。若某个群成员记录的昵称或头像
仍有空字段，该群依赖全局资料，需要增加群成员版本并发送通知；如果两个字段都有群级值，
全局变化不会影响该群的显示，也就不需要为这次变化同步它。

客户端收到通知后，不是把全局 User 直接覆盖到所有群消息，而是同步这个群的
`LocalGroupMember`，再使用最终合成后的群成员资料更新消息。源码定位链如下：

```text
GroupMemberInfoSetNotification
  -> Group incremental member sync
  -> groupMemberSyncer.WithUpdate
  -> groupMemberSyncer.WithNotice(Update)
     -> OnGroupMemberInfoChanged
     -> DispatchUpdateMessage for this group and user
     -> DispatchUpdateConversation latest-message projection
  -> JS SDK OnGroupMemberInfoChanged
  -> Web groupMemberInfoChangedHandler
  -> mitt UPDATE_MSG_SENDER only for current group
```

Web 的 `groupMemberInfoChangedHandler` 还会检查事件的 `groupID`。只有事件属于当前打开的群，
才用它更新当前 `messageList`；相同用户在其他群可能有完全不同的显示资料。

所以 `selfUpdateHandler` 只直接刷新当前单聊是有意的，不是漏写了群聊分支。群聊必须等待
对应群的 `OnGroupMemberInfoChanged`。否则 Alice 修改全局昵称时，Web 会错误覆盖 Alice 在
各个群里单独设置的群昵称。

## 消息发送主链

用户点击发送后，聊天气泡通常会立即出现，而不是等待一次网络往返。这是因为发送过程采用
“Web 先乐观显示、SDK 本地落库、Server 最后确认”的状态机。

`createTextMessage()` 只创建消息对象，此时消息还没有发送。Web 的 `useSendMessage` 先补齐
发送者和会话字段，把状态设为 `Sending`，并通过 `PUSH_NEW_MSG` 将它插入当前页面数组，所以
气泡会立即出现；随后才调用 `IMSDK.sendMessage()`。SDK 把同一消息以 `Sending` 写入
`LocalChatLog` 和发送记录，然后上传附件（如果有）、请求 Server，并根据响应补上
`serverMsgID`、服务端时间和最终状态。

| 阶段                     | 消息状态  | 用户看到什么                   |
| ------------------------ | --------- | ------------------------------ |
| 创建消息对象             | 尚未发送  | 还没有正式气泡                 |
| Web 乐观插入页面数组     | `Sending` | 气泡立即出现                   |
| SDK 写本地库并请求服务端 | `Sending` | 可在延迟后显示发送中状态       |
| Server 确认              | `Success` | Web 用返回消息替换发送中的对象 |
| 上传或网络失败           | `Failed`  | Web 更新原消息并提供重试入口   |

Web 乐观插入保证点击后立即有反馈；SDK 本地落库则保证会话和消息状态不只存在于当前 React
数组。`IMSDK.sendMessage()` resolve 后，Web 通过 `UPDATE_ONE_MSG` 用 SDK 返回的完整消息更新
同一个 `clientMsgID`；reject 时把原对象改为 `Failed`。这两个分支都是更新同一消息，不是再
插入一条新消息。

源码定位链如下：

```text
ChatFooter
  -> IMSDK.createTextMessage
  -> local message object
  -> IMSDK.sendMessage
  -> JS _invoker
  -> WrapperConMsg.SendMessage
  -> open_im_sdk.SendMessage
  -> Conversation.SendMessage
  -> send task queue
  -> Conversation.sendMessage
     -> validate IDs and options
     -> insert local chat log as Sending
     -> insert local sending-message record
     -> DispatchUpdateConversation
     -> upload media if required
     -> sendMessageToServer
     -> LongConnMgr.SendReqWaitResp
     -> update local message status/time/serverMsgID
     -> SendMsgCallBack progress/success/error
  -> JS Promise/event
  -> Web updateOneMessage/pushNewMessage
```

接收端也不是 WebSocket 一到就直接渲染。`MsgSyncer` 先按 `seq` 判断消息是否连续；有缺口时先
补拉，再交给 `Conversation` 持久化。只有本地处理完成后，SDK 才发布
`OnRecvNewMessage/OnRecvNewMessages` 给 Web：

```text
WebSocket push or pulled message
  -> LongConnMgr
  -> MsgSyncer checks seq continuity
  -> Conversation writes LocalChatLog and updates conversation
  -> OnRecvNewMessage event
  -> useGlobalEvents
  -> Web mitt PUSH_NEW_MSG
  -> React messageList
```

因此 WebSocket 推送是消息到达客户端的入口，不是 UI 的直接数据源。本地消息表和会话先完成
更新，Web 收到的是“可以展示这条消息了”的结果事件。

## 本地数据库的跨语言回路

SDK Core 的业务代码是 Go，但浏览器不能像桌面程序一样让 Go 打开一个 SQLite 文件。真正
能够使用浏览器存储和 Web Worker 的是 JavaScript。因此这里出现了一条看似反方向的调用：
Go 业务层需要查数据库时，反过来调用 JS SDK 注册在 `window` 上的方法。

各组件的分工是：

| 组件                | 作用                                         |
| ------------------- | -------------------------------------------- |
| Go DB interface     | 让领域代码像调用普通 Go 数据库一样读写       |
| `wasm/exec.Exec`    | 把 Go 方法名和参数转换成 JavaScript 调用     |
| JS database API     | 把调用封装成发往 Worker 的 RPC               |
| database Web Worker | 在后台线程执行 SQL，避免阻塞 React 主线程    |
| sql.js / absurd-sql | 在浏览器里提供 SQLite 行为和分页存储桥       |
| IndexedDB           | 真正持久保存数据库页，刷新页面后数据仍然存在 |

例如 `Relation` 查询好友时，看起来只是调用 Go 的 `GetAllFriendList`；运行到 Web 版本的数据库
实现后，调用会跨回 JavaScript，Worker 执行 SQL，再把 JSON 结果返回 Go channel。领域层不需要
为浏览器单独重写一套好友同步算法。

源码定位链如下：

```text
Go domain method
  -> db_interface.DataBase
  -> pkg/db.IndexDB or wasm/indexdb method
  -> wasm/exec.Exec(args)
  -> runtime.Caller finds Go method name
  -> js.Global().Call(lowerCamelMethodName, args)
  -> JS window method from registeMethodOnWindow
  -> rpc.invoke(method, args)
  -> database Web Worker
  -> sql.js / SQLite
  -> absurd-sql backend
  -> IndexedDB
  -> JSON result
  -> JS Promise then/catch
  -> Go channel resumes
```

`runtime.Caller` 用当前 Go 方法名推导要调用的 lowerCamelCase JavaScript 方法，所以 Go 和 JS
数据库 API 的命名本身也是一份跨语言契约。新增或重命名数据库方法时，只改 Go 接口而没有
同步 JS Worker 方法，会在运行时表现为找不到 `window` 方法或 RPC handler。

本地数据库保存消息、会话、好友、群成员以及 `LocalVersionSync` 等数据。它使 SDK 能快速
打开会话、离线读取历史，并在重连时知道从哪个版本和 `seq` 继续同步。但它不是 React 的
响应式 store：数据库行被修改后，页面仍需 SDK 事件或主动查询才能看到变化。

这也解释了为什么 JS SDK 不是一层薄声明：它既是 WASM 上层 API，也是 Go SDK Core 在浏览器
中的数据库宿主环境。

## 一致性模型

这里的“最终一致”不是一句抽象术语，它表示一次变化不会通过一个跨 Server、WASM、IndexedDB
和 React 的大事务同时提交。每层先完成自己的工作，再通过通知和版本同步让下游副本逐步追上。
短时间内看到不同值是允许的，但每份副本都有明确的更新者和最终语义。

| 副本                                       | 它表达的含义               | 谁负责更新                         |
| ------------------------------------------ | -------------------------- | ---------------------------------- |
| Server User                                | 全局权威资料               | 用户资料 API                       |
| Server GroupMember                         | 群级覆盖；空值表示继承     | 群成员 API 和 Group Service        |
| Server Message                             | 发送时快照                 | 消息发送时写入，通常不追随资料变化 |
| SDK LocalUser/LocalFriend/LocalGroupMember | 当前客户端的资料投影       | 增量或全量 Syncer                  |
| SDK LocalChatLog                           | 当前客户端的消息展示投影   | `DispatchUpdateMessage`            |
| Web Zustand                                | 应用级 UI 状态             | `CbEvents` handler                 |
| React `messageList`                        | 当前页面已经加载的消息对象 | Web `mitt` 和 React state 更新     |

以 Bob 改昵称为例，正确结果不是“数据库里所有 Bob 字符串立刻完全相同”，而是：

1. Server User 立即成为新昵称，它是权威值。
2. Server Message 可以继续保留旧昵称，因为它是发送时快照。
3. Alice 下次在线同步后，`LocalFriend` 和本地展示投影变成新昵称。
4. Alice 当前正打开聊天时，Web 事件把已加载消息改成新昵称；没有打开时，下次查询会从最新
   本地投影补全。
5. 群聊只有在群成员字段继承全局值时才变化；显式群昵称继续保留。

版本同步还有一个关键安全性：SDK 在本地数据更新成功后才推进 `LocalVersionSync`。如果写库
或 Syncer 中途失败，本地版本仍落后，下次连接可以再次请求同一段变化，而不是出现“版本已
前进但数据没写进去”的永久缺口。

判断资料显示 bug 时，第一步不应直接问“事件有没有触发”，而应先问：

1. 错的是 Server 权威值，还是某个客户端投影？
2. 如果只错当前页面，SDK 本地库是否已经正确？
3. 这份副本的更新者是谁：同步器、`CbEvents`、Web `mitt`，还是重新查询？
4. 旧值是错误，还是消息快照或群级覆盖的预期语义？

## 排查顺序

不要从最底层函数开始盲目打断点。先观察错误停在哪一层，再检查这一层与下一层之间的边界。

| 现象                                | 优先怀疑的边界                                 |
| ----------------------------------- | ---------------------------------------------- |
| API 直接失败或 Promise 一直不结束   | Web -> JS SDK -> WASM wrapper                  |
| Server 已修改，SDK 本地查询仍是旧值 | 通知/重连 -> 版本接口 -> Syncer                |
| SDK 本地查询正确，Zustand 还是旧值  | WASM callback -> JS `CbEvents`                 |
| Zustand 正确，当前聊天消息仍是旧值  | `useGlobalEvents` -> Web `mitt` -> React state |
| 在线立即更新，离线重连后不更新      | `seq` 补拉、`LocalVersionSync`、full sync      |
| 只在群聊显示错误                    | 全局资料与 `LocalGroupMember` 的优先级         |

### 页面不更新时

先在 Web 直接调用 SDK 查询对应好友或群成员：

- 如果查询结果也是旧的，问题在 SDK 同步之前，不要先改 React。
- 如果查询结果是新的，说明 Server 和 SDK 投影已经正确，继续检查 `CbEvents` 与页面 state。
- 如果 Zustand 是新的但消息仍旧，检查组件是否持有自己的 `messageList`，以及
  `UPDATE_MSG_SENDER` 的 `userID/groupID` 是否匹配当前会话。

然后沿事件边界逐层确认，每一层都要找到明确证据：

1. `WithUpdate` 是否成功写入 `LocalFriend` 或 `LocalGroupMember`。
2. `WithNotice` 是否调用相应的 Go listener。
3. WASM `EventData.SendMessage` 是否把正确的事件名和 JSON 送到 `commonEventFunc`。
4. JS SDK 的 `parsed.event` 是否等于 Web 注册的 `CbEvents` 枚举值。
5. `useGlobalEvents` handler 是否更新 Zustand，并发布对应 `mitt` 事件。
6. HistoryMessageList 是否仍挂载、是否收到事件、不可变更新是否返回了新数组。

### 只在离线后出错时

这类问题不能只检查断线时有没有 WebSocket。应该分别验证两条补偿路径：

1. **通知消息路径**：Server 最大 `seq` 是否大于本地值，`MsgSyncer` 是否拉回缺失通知。
2. **版本同步路径**：Server 好友/群成员版本是否增加，`LocalVersionSync` 是否落后，增量接口
   是否返回了正确的 Insert/Update/Delete。
3. **全量兜底**：版本日志无法连续增量时，响应是否标记 `Full`，`FullSyncer` 是否完成。
4. **版本提交时机**：本地数据写入失败时，本地版本不应被提前推进。

### 单聊正确、群聊错误时

先确定用户在该群是否设置了群昵称或群头像。非空群级值本来就不应跟随全局资料；空值才继承
User。然后检查事件的 `groupID`，不能只按 `userID` 更新所有群里的消息。

最后再使用日志串联具体函数。API 命令用同一个 `operationID` 贯穿 Web、WASM、SDK Core 和
Server；同步问题同时记录本地版本、服务端版本、`VersionID`、通知 `seq`、`userID` 和
`groupID`。这些字段比单纯打印“handler called”更能说明变化在哪一层丢失。

## 关键源码索引

下面的列表用于在理解机制后定位实现，不建议从第一项开始逐文件阅读。先根据现象判断问题属于
Web、JS SDK、SDK Core 还是 Server，再从对应层的入口沿本文给出的源码定位链向下追踪。

Web：

- [`src/layout/MainContentWrap.tsx`](../src/layout/MainContentWrap.tsx)：创建 IMSDK 单例。
- [`src/layout/useGlobalEvents.tsx`](../src/layout/useGlobalEvents.tsx)：登录、SDK 事件注册和 Web 状态分发。
- [`src/pages/common/UserCardModal/EditSelfInfo.tsx`](../src/pages/common/UserCardModal/EditSelfInfo.tsx)：`setSelfInfo` 调用入口。
- [`src/pages/chat/queryChat/useHistoryMessageList.tsx`](../src/pages/chat/queryChat/useHistoryMessageList.tsx)：历史消息和页面内存事件。
- [`src/utils/events.ts`](../src/utils/events.ts)：Web 内部 `mitt` 总线。

JS SDK：

- [`src/index.ts`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/src/index.ts)：npm 包源码入口，导出 `getSDK`、事件枚举和公开类型。
- [`src/sdk/index.ts`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/src/sdk/index.ts)：`SDK`、`_invoker`、公开 API、登录及 `commonEventFunc` 事件分发的实际实现。
- [`src/sdk/initialize.ts`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/src/sdk/initialize.ts)：下载、缓存并运行 `openIM.wasm`。
- [`src/utils/emitter.ts`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/src/utils/emitter.ts)：JS SDK 的 `on`、`off`、`emit` 事件总线。
- [`src/api/index.ts`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/src/api/index.ts)：创建数据库 Worker，并把供 Go WASM 反向调用的数据库方法注册到 `window`。
- [`src/api/worker.ts`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/src/api/worker.ts)：数据库 Worker 入口和 RPC handler 注册。
- [`rollup.config.js`](https://github.com/abd-im/abd-im-sdk-js-wasm/blob/main/rollup.config.js)：说明源码如何生成 `lib/index.es.js`、`lib/index.d.ts` 和 Worker 构建产物。

Web 中的 `node_modules/@abd-im/wasm-client-sdk/lib/*` 是上述源码的发布产物，适合核对“当前
安装版本实际运行了什么”，但不适合作为在线架构文档的主要源码链接：路径受 pnpm 布局和
依赖版本影响，打包后的单文件也丢失了源码目录结构。

SDK Core：

- [`wasm/cmd/main.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/wasm/cmd/main.go)：将 Go 函数注册到 `window`。
- [`wasm/wasm_wrapper/wasm_init_login.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/wasm/wasm_wrapper/wasm_init_login.go)：登录和监听器注入。
- [`wasm/event_listener/listener.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/wasm/event_listener/listener.go)：WASM 事件接口的实际实现。
- [`wasm/event_listener/callback_writer.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/wasm/event_listener/callback_writer.go)：Promise 与全局事件回写。
- [`open_im_sdk/userRelated.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/open_im_sdk/userRelated.go)：`UserContext`、监听器槽位及登录时的领域注入。
- [`open_im_sdk_callback/callback_client.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/open_im_sdk_callback/callback_client.go)：面向绑定层的 JSON 字符串监听器接口。
- [`open_im_sdk_callback/callback_go_sdk.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/open_im_sdk_callback/callback_go_sdk.go)：强类型对象到 JSON 字符串的适配层。
- [`internal/relation/relation.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/internal/relation/relation.go)：好友 Syncer 和 `OnFriendInfoChanged` 的直接调用点。
- [`internal/relation/incremental_sync.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/internal/relation/incremental_sync.go)：好友版本增量同步。
- [`internal/group/group.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/internal/group/group.go)：群和群成员 Syncer。
- [`internal/conversation_msg/notification.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/internal/conversation_msg/notification.go)：通知分派、资料变更后的消息表更新和登录后同步。
- [`pkg/db/db_js.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/pkg/db/db_js.go)：浏览器本地数据库实现入口。
- [`wasm/exec/executor.go`](https://github.com/abd-im/abd-im-sdk-core/blob/main/wasm/exec/executor.go)：Go 反向调用 JavaScript 数据库 API。

Server：

- [`internal/rpc/user/user.go`](https://github.com/abd-im/abd-im-server/blob/main/internal/rpc/user/user.go)：用户资料更新和后续通知入口。
- [`internal/rpc/relation/sync.go`](https://github.com/abd-im/abd-im-server/blob/main/internal/rpc/relation/sync.go)：好友版本增加和增量接口。
- [`internal/rpc/group/group.go`](https://github.com/abd-im/abd-im-server/blob/main/internal/rpc/group/group.go)：全局资料变化后的群成员版本处理。
- [`pkg/common/storage/database/mgo/version_log.go`](https://github.com/abd-im/abd-im-server/blob/main/pkg/common/storage/database/mgo/version_log.go)：持久化版本日志。
