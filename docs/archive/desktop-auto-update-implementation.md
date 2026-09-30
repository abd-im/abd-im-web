# 桌面自动更新：实现与发布

目标为 Windows x64 NSIS EXE、macOS arm64 DMG 首装及 ZIP 更新。版本管理复用 chat 原有接口和数据库，下载与安装使用 `electron-updater 6.8.9` 的 generic provider。尚未生成正式签名安装包或完成真实跨版本安装；验收清单见 [实施计划](./desktop-auto-update-plan.md#真实平台验收)。

## 实现入口

| 仓库             | 主要文件                                                       | 职责                                                   |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| abd-im-web       | `electron/main/updateController.ts`、`updateManage.ts`         | 旧版本接口适配、generic feed、下载校验、IPC 和退出安装 |
| abd-im-web       | `src/components/AppUpdateBar.tsx`、`app-update.scss`           | 全局更新图标、紧凑详情、进度、稍后、重启和强制更新     |
| abd-im-web       | `src/hooks/useDesktopUpdates.ts`、`src/store/desktopUpdate.ts` | 单一订阅和带 revision 的状态快照                       |
| abd-im-web       | `src/utils/desktopTasks.ts`、`src/hooks/useDesktopDraft.ts`    | 通话、发送及上传退出保护，按用户和会话保存正文         |
| abd-im-admin-web | `src/features/releases/`                                       | 既有版本增删改和优先标记，不增加独立发布状态           |
| abd-im-chat      | 既有 `application/latest_version` 与版本增删改接口             | 保留原协议、查询排序及数据库结构                       |

不实现自定义安装器或差分算法。主进程固定 API 地址及下载 origin 允许列表，渲染进程不能提交任意 URL 或安装路径。

启动后约 10 秒检查，此后每 4 小时检查，系统恢复时按间隔补查；检查失败按 1 分钟起步、最多 15 分钟退避重试。普通更新自动下载且不自动打开详情；下载 100% 后仍等待库完成验证。

`autoInstallOnAppQuit=false` 用于先完成退出准备，再调用 `quitAndInstall(true, restart)`。点击重启后安装并重新打开，真正退出时安装且保持退出，隐藏托盘不安装。发送、上传或通话期间拒绝安装并提示稍后重试；保存失败或渲染进程 5 秒内无响应时恢复使用。

草稿保存正文，不持久化引用消息上下文或未提交的文件选择。当前进程内已校验候选包可以离线安装，不再检查或替换该候选；下次进程启动由更新库重新校验缓存，不提供自定义离线缓存安装入口。

## 现有接口与版本约定

构建配置指向 chat API 的 `POST /application/latest_version`，包含部署中的实际代理前缀。发送 `{ platform, version }`，读取原响应的 `data.version`，不发送架构或已下载发布 ID。

原服务按 `latest` 优先，再按记录 ID 降序返回一条记录，不按 SemVer 排序，也不使用请求中的版本进行大小比较。客户端只接受高于当前版本的规范稳定版本，跳过预发布和 `hot=true` 的记录。

- `windows` 对应 x64，后台安装包 URL 指向构建生成的 `_x64.exe`。
- `mac` 对应 arm64，后台安装包 URL 指向 `_arm64.dmg`，同目录必须有清单及 `_arm64.zip`。
- 主进程从安装包 URL 的父目录取得 feed，不新增 `arch` 或 `feedUrl` 数据库字段。
- 校验清单版本、产物架构、路径、SHA-512 格式和大小，完整文件校验由更新库完成。

无需部署新的 chat 版本接口、配置服务端下载允许列表或执行数据库索引迁移。原版 chat 版本服务即可配合此更新器使用。管理员登录取新 token、管理前端鉴权失败回登录页是独立修复，不影响版本协议。

## 正式构建

先设置 `package.json` 的新稳定 SemVer 版本，使用 Node 24.20+ 和锁文件安装。发布脚本通过 Vite 的 `loadEnv("production", ...)` 加载环境配置，支持变量展开，shell/CI 环境变量优先。更新地址直接配置在现有 `.env` 中；签名凭据放在被 Git 忽略的 `.env.production.local` 或构建环境中：

| 变量                            | 值                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `VITE_UPDATE_API_URL`           | 原 `/application/latest_version` 的完整 HTTPS 地址，含代理前缀                                               |
| `VITE_UPDATE_ORIGINS`           | 下载站 HTTPS origin，多个值以逗号分隔，不含路径或尾斜杠                                                      |
| `DESKTOP_UPDATE_BASE_URL`       | 下载根目录，例如 `https://downloads.your-domain.com/abd-im/`                                                 |
| `VITE_CHAT_URL`、`VITE_API_URL` | 既有业务及 IM HTTPS 服务地址                                                                                 |
| `VITE_WS_URL`                   | 既有 IM WSS 地址                                                                                             |
| `CSC_LINK`、`CSC_KEY_PASSWORD`  | 签名证书及密码；Windows 测试构建可不配置，配置后仍执行签名                                                     |
| Apple 公证凭据                  | `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；或完整 API Key 三项；或 `APPLE_KEYCHAIN_PROFILE` |

Windows 统一使用 `pnpm build:win`：读取环境配置、配置 generic 更新源、生成安装包和更新清单，再校验产物。构建不额外检查接口地址、HTTPS/WSS 或下载域名；客户端下载安装时仍执行安全校验。Windows 在 Windows 构建，Mac 在 macOS 构建。

需要临时覆盖文件中的配置时，Windows PowerShell 可在当前终端中使用 `$env:` 设置变量（替换为自己的真实地址，以下地址是占位示例）：

```powershell
$env:VITE_UPDATE_API_URL = "https://your-domain.com/chat-api/application/latest_version"
$env:VITE_UPDATE_ORIGINS = "https://your-domain.com"
$env:DESKTOP_UPDATE_BASE_URL = "https://your-domain.com/downloads/abd-im/"
$env:VITE_CHAT_URL = "https://your-domain.com/chat-api"
$env:VITE_API_URL = "https://your-domain.com/im-api"
$env:VITE_WS_URL = "wss://your-domain.com/your-websocket-path"
```

业务、IM 和 WebSocket 地址沿用实际部署配置。下载根目录 `DESKTOP_UPDATE_BASE_URL` 填完整 URL 并以 `/` 结尾，用于生成更新源地址。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check:electron
node --test scripts/verifyDesktopRelease.test.cjs
pnpm build:win
# macOS 上改用 pnpm build:mac:release
```

Windows 允许未签名构建，配置证书后仍执行签名，正式分发建议签名。未签名包可能出现 SmartScreen 警告和“未知发布者”提示；已启用发布者校验的客户端不能更新到未签名包。Mac 仍强制签名，要求公证凭据并执行 Developer ID 验证、`stapler validate` 和 `spctl --assess`，不使用 ad-hoc 兜底。Windows 保留原每机安装范围、应用身份和安装目录策略，可能出现 UAC。

`.github/workflows/desktop-release.yml` 仅手动触发构建并上传 workflow artifacts，不创建 GitHub Release、不上传下载站点、不调用业务版本接口。Variables 使用上述构建变量；Windows/Mac 签名 Secrets 分别为 `WIN_CSC_*`、`MAC_CSC_*`，Apple 凭据使用同名 Secrets。

## 上传产物

目录结构：

```text
/downloads/abd-im/windows/x64/1.0.1/latest.yml
/downloads/abd-im/mac/arm64/1.0.1/latest-mac.yml
```

每个目录包含清单列出的安装包、Mac ZIP/DMG 和构建生成的 blockmap。使用真实构建输出，不手写清单，不覆盖相同版本目录。

发布机需要 SSH 和 rsync，设置：

```sh
DESKTOP_UPLOAD_HOST=deploy@your-host
DESKTOP_UPLOAD_ROOT=/var/www/downloads/abd-im
DESKTOP_UPDATE_BASE_URL=https://downloads.your-domain.com/downloads/abd-im/
```

核实 SSH known_hosts 后执行：

```sh
pnpm release:verify release/ABD-IM/1.0.1 windows x64
pnpm release:upload release/ABD-IM/1.0.1 windows x64
# Mac 对应参数为 mac arm64
```

脚本先核对大小及 SHA-512，将完整目录上传到暂存位置再原子就位，最后输出安装包 URL。脚本不登记版本，不需要管理员 Token；仅上传产物不会让业务版本接口自动选中它。

下载站点需验证 HTTPS、200、Range 206、大小一致及缺失文件 404。管理后台 Nginx 模板对清单使用 `no-cache`，不存在的文件不回退 HTML。原版本查询使用 POST，代理不得缓存查询结果。

## 通过原管理页面发布

1. 完成隔离环境及真实平台验收，再打开原“应用版本”页面新增记录。
2. 平台填写 `windows` 或 `mac`，版本填写与安装包一致的规范稳定版本。
3. 安装包地址填写上传脚本输出的 HTTPS URL，填写更新说明。
4. 通常设置 `latest=true`、`hot=false`、`force=false`；需要强制更新时说明原因并显式开启。
5. 保存后用原 `latest_version` 确认返回的是预期记录，并由较低版本客户端验证。

保存记录即可能参与更新查询，没有独立的“校验并发布”按钮。`latest=false` 是低优先级，不代表草稿或暂停分发；不稳定的测试包不要登记到正式版本列表。

原接口只返回一条记录，不会寻找最高 SemVer；切换已有记录时须核对其他记录的优先标记。删除错误记录或调整优先标记只影响后续查询，不能撤回客户端已经下载的包，也不会自动降级。修复使用更高版本，不覆盖旧目录。

旧客户端仍使用原安装包 URL。尚未带更新器的版本需先手动安装一次新版本，无须另建无架构兼容记录。

## 验证与待验收

自动化验证范围包括旧接口适配、版本比较、目标架构及清单校验、下载状态机、主进程退出保护、产物校验和浏览器模拟更新交互。管理端验证原版本增删改流程及 token 失效回登录页。

客户端完整渲染层 `tsc --noEmit` 仍有原有 SDK 类型和组件错误；`check:electron` 独立检查主进程。浏览器测试不等价于原生升级成功。

上线前在 Windows x64 和 macOS arm64 完成低版本到高版本升级，验证签名、正常退出不重开、点击重启会重开、登录/聊天/配置/草稿保留、托盘、通话/附件/上传保护、离线候选包、包损坏、磁盘不足及权限错误。Mac 从 Applications 运行并检查 DMG 运行限制，Windows 检查 UAC 和原安装目录兼容。

尚未向真实站点上传安装包或修改生产版本数据。真实平台验收完成前，不标记正式自动更新已验收。
