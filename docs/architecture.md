# OpenIM Electron Demo 项目架构文档

## 1. 项目概览
`openim-electron-demo` 是一个基于 Electron 开发的跨平台桌面即时通讯客户端示例项目。它集成了 OpenIM SDK，展示了如何在桌面端实现即时通讯的核心功能，包括会话管理、消息收发、联系人管理等。

## 2. 技术栈
- **核心框架**: [Electron](https://www.electronjs.org/)
- **前端框架**: [React](https://reactjs.org/) (Hooks)
- **构建工具**: [Vite](https://vitejs.dev/)
- **编程语言**: [TypeScript](https://www.typescriptlang.org/)
- **样式处理**: [Tailwind CSS](https://tailwindcss.com/), [Ant Design](https://ant.design/)
- **状态管理**: [Zustand](https://github.com/pmndrs/zustand)
- **国际化**: [i18next](https://www.i18next.com/)
- **SDK**: [@openim/electron-client-sdk](https://github.com/openimsdk/open-im-sdk-electron)

## 3. 目录结构
项目采用了主进程与渲染进程分离的标准架构，并支持企业级 Web 部署，主要目录说明如下：

```text
├── .github/workflows/      # GitHub Actions 工作流 (自动化 CI/CD 打包)
├── deployments/            # 企业级 Web 部署文件 (多阶段 Docker, Nginx, Hook 脚本)
├── electron/               # Electron 主进程代码
│   ├── main/               # 主进程逻辑
│   │   ├── appManage.ts    # 应用生命周期管理
│   │   ├── index.ts        # 主进程入口
│   │   ├── ipcHandlerManage.ts # IPC 通信处理
│   │   ├── menuManage.ts   # 原生菜单管理
│   │   ├── trayManage.ts   # 系统托盘管理
│   │   ├── windowManage.ts # 窗口创建与管理
│   │   └── storeManage.ts  # 主进程持久化存储 (electron-store)
│   ├── preload/            # 预加载脚本 (Preload scripts)
│   └── utils/              # 主进程工具函数
├── src/                    # 渲染进程代码 (React 前端)
│   ├── api/                # 业务 API 请求
│   ├── components/         # 公用 UI 组件
│   ├── constants/          # 常量定义 (如 IM 消息类型)
│   ├── hooks/              # 自定义 React Hooks
│   ├── layout/             # 页面布局组件
│   ├── pages/              # 业务页面 (聊天、联系人、登录等)
│   ├── store/              # Zustand 状态仓库
│   ├── utils/              # 渲染进程工具函数
│   ├── App.tsx             # 根组件
│   └── main.tsx            # 渲染进程入口
├── docs/                   # 项目文档
├── public/                 # 静态资源 (WASM 文件、图标等)
├── package.json            # 项目依赖与脚本
└── vite.config.ts          # Vite 配置
```

## 4. 核心架构设计

### 4.1 主进程 (Main Process)
主进程负责系统的原生交互和窗口生命周期。为了保持代码整洁，主进程逻辑被划分为多个 Manager：
- **WindowManage**: 使用单例或工厂模式管理主窗口及其他辅助窗口。
- **IpcHandlerManage**: 集中处理来自渲染进程的 `ipcRenderer.invoke` 请求，如窗口最小化、清除缓存、持久化配置读写等。
- **AppManage**: 处理应用启动锁（单实例）、全局变量初始化及应用退出逻辑。

### 4.2 渲染进程 (Renderer Process)
渲染进程是标准单页应用 (SPA)，负责 UI 渲染：
- **路由**: 使用 `react-router-dom` 进行页面导航。
- **状态管理**: Zustand 被用于管理用户信息、会话列表和联系人数据。与 Redux 相比，Zustand 更轻量且更符合 React Hooks 的使用习惯。
- **SDK 集成**: 通过 `@openim/electron-client-sdk` 的 `getWithRenderProcess` 在渲染进程中直接初始化 SDK。

### 4.3 进程间通信 (IPC)
项目在 `electron/constants` 中定义了统一的 IPC 通信常量，确保主进程和渲染进程之间的调用一致性。
- **渲染进程到主进程**: 通过 `window.electronAPI.ipcInvoke` 调用预定义的处理函数。
- **主进程到渲染进程**: 用于通知状态变化（如更新可用、网络状态变化）。

## 5. OpenIM SDK 集成实现
本项目集成了 OpenIM 的桌面端专用 SDK。

### 5.1 初始化
在 `src/layout/MainContentWrap.tsx` 中，SDK 通过以下方式初始化：
```typescript
const { instance } = getWithRenderProcess({
  wasmConfig: {
    coreWasmPath: "./openIM.wasm",
    sqlWasmPath: `/sql-wasm.wasm`,
  },
});
export const IMSDK = instance;
```
这种方式结合了 WASM 的跨平台能力与 Electron 的原生特性，能够提供高性能的本地数据库支持和消息处理。

### 5.2 数据流向
1. **SDK 事件监听**: 在全局 Layout 中通过 SDK 提供的监听器（Listener）接收新消息、连接状态等。
2. **状态更新**: 监听到事件后，更新对应的 Zustand Store。
3. **UI 响应**: React 组件通过订阅 Store 自动更新界面。

## 6. 开发与构建

### 6.1 开发模式
根据目标运行环境，选择对应的启动命令：
* **桌面端 (Electron)**: 使用 `npm run dev` 启动。Vite 负责渲染进程热更新，`vite-plugin-electron` 监控并重启主进程。
* **网页端 (Web)**: 使用 `npm run dev:web` 启动。此时会跳过 Electron 进程，使用本地 `Vite Proxy` 服务端代理解决开发跨域问题。

### 6.2 打包发布
* **桌面端 (Electron)**: 使用 `electron-builder` 打包，支持生成 Windows (exe), macOS (dmg), Linux (AppImage) 等包。
* **网页端 (Web)**:
  * **本地打包**: 运行 `npm run build:web` 编译生成静态资源（`/dist`）。
  * **容器化打包**: 在项目根目录下运行 `docker build -f deployments/Dockerfile -t <image-name> .` 进行多阶段打包。

## 7. 国际化 (i18n)
支持多语言切换。在桌面端，主进程和渲染进程共享 i18n 资源并通过 IPC 保持设置一致。在网页端，使用标准浏览器语言包管理。

## 8. 双模与容器化部署架构设计

### 8.1 容器性能调优 (SPA 路由与 WASM 缓存)
子配置文件 `deployments/nginx.conf` 针对即时通讯 Web 特性做了深度定制：
* **SPA 路由回退**：配置 `try_files $uri $uri/ /index.html;` 彻底解决 HTML5 History 路由模式下直接刷新页面导致 `404` 错误的问题。
* **WASM 高效缓存**：显式配置 `.wasm` 文件的 MIME 类型为 `application/wasm` 并配合高达 1 年的强缓存 Header，避免用户浏览器重复下载高达 35MB 的 `openIM.wasm` 库，大幅提升冷启动性能。
