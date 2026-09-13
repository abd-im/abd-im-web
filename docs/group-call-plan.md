# 单聊与群聊通话

Web 和 Electron 使用同一个 `CallProvider`、`CallSession` 与 LiveKit Room。Chat 管业务权限，
LiveKit 管房间、连接、Metadata 和媒体。客户端不维护第二套服务端状态。

## 接口契约

```ts
type Call = {
  target: { type: 1 | 3; id: string };
  participantCount: number;
};
```

| 接口              | 用途                          |
| ----------------- | ----------------------------- |
| `start(target)`   | 创建或取得会话房间，返回 Call |
| `join(target)`    | 校验权限并返回 LiveKit auth   |
| `leave(target)`   | 结束单聊或离开群通话          |
| `status(targets)` | 批量读取会话摘要              |

Join 不返回 Call。调用方继续使用发起、邀请或 Status 返回的 Call。`call.invited` 只发给被叫，
所以不需要在 Call 中保存发起人。群聊摘要只显示 LiveKit 返回的人数，不请求用户预览。

## 单聊

1. 主叫申请麦克风后调用 Start。
2. Start 返回场次后，主叫立即调用 Join 并连接 LiveKit。
3. 被叫收到 `call.invited` 后调用 Status，确认会话房间仍存在。
4. 被叫点击接听后申请设备、调用 Join 并连接同一房间。
5. 主叫通过 LiveKit `ParticipantConnected` 事件得知被叫已经连接。
6. 任一方挂断调用 Leave，Chat 删除房间；LiveKit 断开双方。

取得 Token 不等于接通。客户端只维护展示和连接阶段，服务端通话数据不保存状态字段。

主叫等待 60 秒仍无人接听时，客户端调用 Leave 结束单聊。进程退出或尚未连入时遗留的空房
由 LiveKit `EmptyTimeout` 回收；LiveKit 随后发送 `room_finished` 通知 Chat。

## 群聊

1. Start 创建或取得群当前场次。
2. 发起者和其他成员都通过 Join 取得 Token。
3. 群头通话条和会话列表通过 Status 的 `participantCount` 展示人数。
4. 会内人员、静音、摄像头和轨道直接读取 LiveKit 客户端事件。
5. Leave 只移除本人。发起者没有结束全群通话的特殊权限。
6. 人数为 0 时隐藏通话条；LiveKit 回收空房后，Chat 通过 `room_finished` 结束场次。

Join 每次检查当前群状态和成员资格。LiveKit 执行最终人数上限，客户端不依赖 Join 前的人数
快照判断是否满员。

## 客户端状态

通话默认只打开麦克风，连接后可以手动打开摄像头。`CallSession` 同时只允许一个本地尝试：

- `checking`：申请设备或等待接口。
- `incoming`：展示单聊来电，尚未申请设备。
- `outgoing`：主叫等待被叫连接。
- `connecting`：已取得凭证，正在连接 LiveKit。
- `connected`：媒体已发布。
- `disconnected`：LiveKit 最终断开，可由用户主动重入。

切换页面和收起通话窗不销毁 Room。取消、退出、登出、设备失败及迟到的异步结果都必须释放
本地 Track 和 Room。断线不自动反复获取 Token；用户点击重试时调用 Join。

## 通知与查询

通知只有两个事件：

- `call.invited`：只发给单聊被叫。
- `call.changed`：提示相关会话摘要失效。

通知载荷只读取 `target`。客户端不从通知直接更新人数或结束状态，而是合并短时间内
的事件后调用 Status。前台每 15 秒轮询作为漏通知补偿；查询失败保留旧摘要并标记 stale。

## UI

- 单聊使用呼叫/来电窗口。
- 群聊使用群头入口、人数条、会话列表人数和全局通话坞。
- 通话默认开麦、关摄像头；用户可以在通话坞切换设备状态。
- 视频每页最多 9 人，只订阅当前页视频；所有远端音频持续订阅。
- 单聊和群聊之间切换时先确认并退出当前通话。

## 验证

```bash
npx vitest run src/features/call/session.test.ts --threads=false
npx eslint src/features/call
npm run build:web
npm run check:electron
npx playwright test e2e/calls.spec.ts --workers=1 --reporter=line
```

单元测试覆盖设备和连接迟到、忙线、取消、主动重入、麦克风发布失败、状态查询竞争和音视频订阅。
Playwright 只验证 UI 流程；真实 LiveKit、TURN、跨网络和多设备行为需要部署环境联调。
