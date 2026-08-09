<p align="center">
  <img src="./docs/images/abd_im_github_avatar-1.png" alt="ABD IM" width="112" />
</p>

<h1 align="center">ABD IM Web</h1>

<p align="center">
  Web client for ABD IM, with messaging, AI-assisted conversations, and a local Agent workspace.
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

## Interface

### Messaging and AI hosting

AI hosting lets a configured Agent handle selected one-to-one conversations while keeping replies in the original conversation.

<p align="center">
  <img src="./docs/images/ai-hosting.png" alt="ABD IM messaging and AI hosting" width="100%" />
</p>

### Agent workspace

The Agent workspace provides dedicated conversations for working with a locally connected Agent.

<p align="center">
  <img src="./docs/images/agent-workspace.png" alt="ABD IM Agent workspace" width="100%" />
</p>

## Features

- Private and group messaging, contacts, message history, search, forwarding, reactions, and read receipts.
- AI hosting for selected private conversations, with per-conversation instructions.
- A dedicated Agent workspace with streamed responses and tool activity.

AI features require the companion [ABD IM CLI](https://github.com/abd-im/abd-im-cli). Messaging requires compatible ABD IM server and business services.

## Related repositories

- [abd-im-cli](https://github.com/abd-im/abd-im-cli): connects a local Agent to ABD IM.
- [abd-im-server](https://github.com/abd-im/abd-im-server): IM server.
- [abd-im-chat](https://github.com/abd-im/abd-im-chat): account and business APIs.
- [abd-im-sdk-core](https://github.com/abd-im/abd-im-sdk-core): cross-platform IM SDK core.
- [abd-im-sdk-js-wasm](https://github.com/abd-im/abd-im-sdk-js-wasm): browser SDK.

## Development

### Requirements

- Node.js 18.12 or later
- pnpm
- Running ABD IM server and business API services

### Configure endpoints

Create `.env.local` and point the client to your deployment:

```dotenv
VITE_WS_URL=ws://127.0.0.1:10001
VITE_API_URL=http://127.0.0.1:10002
VITE_CHAT_URL=http://127.0.0.1:10008
```

Use `wss://` and `https://` endpoints when deploying behind TLS.

### Run the web client

```bash
git clone https://github.com/abd-im/abd-im-web.git
cd abd-im-web
pnpm install
pnpm dev:web
```

The development server listens on `http://localhost:5173` by default.

### Build

```bash
pnpm build:web
```

## Upstream and attribution

ABD IM Web is a modified derivative of this [OpenIM upstream project](https://github.com/openimsdk/openim-electron-demo). It is maintained independently by ABD IM contributors and is not affiliated with, endorsed by, or an official distribution of OpenIMSDK.

OpenIM and OpenIMSDK names and trademarks belong to their respective owners. Dependency names and upstream links are retained where needed for technical and attribution purposes. See [NOTICE](./NOTICE) for details.

## License

This repository is licensed under the [GNU Affero General Public License v3.0](./LICENSE). Source distributions and network deployments must comply with the applicable AGPLv3 terms.
