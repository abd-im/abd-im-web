# ABD-IM Agent API：权衡方案

状态：待权衡

本文件用于记录结合 ABD-IM 原生 Agent Account、现有 SDK/msg_gateway 和实现成本后确定的
最终方案，目前仅占位。

对照基线：[Telegram Bot API 照搬方案](./agent-api-telegram-plan.md)。

子方案：[Secretary Agent 功能规格](./secretary-agent-spec.md)和
[Secretary Agent 实施计划](./secretary-agent-plan.md)。

> agent是独立用户有独立的 im 账户，有用户所具备的一切功能，包括查看聊天记录，创建群聊，邀请用户等。



### agent 工作区 对话

一个会话使用新建一个二人群组的形式，因此可以通过conversationid表示这次会话

### 流式消息

目前已有实现可用，优先级降低。

### 用户与agent对话

用户与agent的单聊即可。服务端只维护conversationID, 至于conversationID 与 codex/外部agent 的sessionid的映射，已在abd-im-cli由客户端维护。

已实现。

### 群组中的agent

agent有自己的账号，直接加入群组即可，首期只回复@agent，发给agent上文10条消息，并且agent可以通过 abdim tools 自行查找agent所属的聊天记录补全上下文。

### 代用户回复 最高优先级

agent接入用户的账号，监听用户收到的消息，并通过用户的账号回复，ai回复消息需要有ai表示。就像知己替用户回复一样。

### 输入框建议调用等临时调用

如果想要效果好，必须在带用户回复的基础上实现，只有获取用户的上下文才能针对性地回答问题，而不是僵硬的ai回复。

使用不持久化的消息，附带最近聊天记录，agent可以通过tool主动查询用户聊天上下文补全知识。


### 后期暂定可变预期

agent有用户所属，agent就像用户的朋友，用户可以约束agent能跟别人聊什么。


### Use Story

1. user1 在agent workspace 分析方案完成。把上述内容总结成一篇文档发送给 user2
2. 六点，user1要下班了。user1设置为托管模式，并附带一条指令“只回答工作相关的事实”。user2 问他，这个agent服务在哪？ ai answers.
3.
