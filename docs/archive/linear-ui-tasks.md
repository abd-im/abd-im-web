# Linear/Multica 风格 UI 重构 Task 任务清单

**依据设计文档**: [linear-ui-design-spec.md](file:///home/me/code/abd-im-web/docs/linear-ui-design-spec.md)  
**分支**: `feat/ui-redesign`  

---

## 📌 标注说明
- **`[P]`**: **并行任务 (Parallel)**。修改独立的组件文件，无相互代码依赖。
- **`[Spec §X]`**: 对应设计文档中的具体章节编号。

---

## Phase 1: 基础设施配置 (Foundational - 顺序执行)

> ⚠️ **阻塞项**：必须先完成 T001 和 T002，为后续组件样式提供 `var(--tokens)` 与 Tailwind 类名支持。

- [ ] **T001 [Spec §1]** 创建 OKLCH 规范文件 `src/styles/tokens.css`  
  - **实现步骤**: 复制 Spec §1 中的 `:root` 与 `.dark` OKLCH 变量定义（5层 Surface、WCAG 对比度阶梯、字号与阴影）。  
  - **交付目标**: 生成 `src/styles/tokens.css`。

- [ ] **T002 [Spec §2]** 扩展 Tailwind 主题与全局 CSS 挂载  
  - **依赖**: T001  
  - **实现步骤**:
    1. 在 `tailwind.config.js` 的 `theme.extend.colors` 和 `boxShadow` 中写入 Spec §2 的映射代码。
    2. 在 `src/index.scss` 顶部引入 `@import './styles/tokens.css';`。  
  - **交付目标**: 项目中可以使用 `bg-app-shell`、`bg-surface`、`text-muted-foreground` 等 Tailwind 类名。

---

## Phase 2: 核心组件样式重构 (Component Refactoring - 🔥 全部 [P] 可并行)

> ✨ **并行说明**：T003 ~ T008 修改的文件完全独立，Phase 1 完成后可 **多路并行执行**。

- [ ] **T003 [P] [Spec §3]** 重构主导航栏 `LeftNavBar`  
  - **目标文件**: `src/layout/LeftNavBar/index.tsx` & `left-nav-bar.module.scss`  
  - **重构要求**: 替换硬编码颜色为 `bg-app-shell` 与 `border-surface-border`；Hover 态使用 `hover:bg-surface-hover`。

- [ ] **T004 [P] [Spec §3]** 重构会话侧边栏 `ConversationSider`  
  - **目标文件**: `src/pages/chat/ConversationSider/index.tsx` & `index.module.scss`  
  - **重构要求**: 背景替换为 `bg-page-canvas`；选中项替换为 `bg-surface-selected`；未读数与次要文字使用 `text-muted-foreground`。

- [ ] **T005 [P] [Spec §3]** 重构聊天主视口与 Header (`ChatArea` & `ChatHeader`)  
  - **目标文件**: `src/pages/chat/queryChat/index.tsx` & `ChatHeader/index.tsx`  
  - **重构要求**: 主视口背景替换为 `bg-page-canvas`；Header 采用 `bg-surface` 加 `border-b border-surface-border`。

- [ ] **T006 [P] [Spec §3]** 重构消息气泡 `MessageItem`  
  - **目标文件**: `src/pages/chat/queryChat/MessageItem/index.tsx`  
  - **重构要求**: 对方气泡设为 `bg-surface shadow-surface`；己方气泡设为 `bg-brand text-white shadow-surface`；时间戳设为 `text-micro text-muted-foreground`。

- [ ] **T007 [P] [Spec §3]** 重构输入框与工具栏 `ChatFooter`  
  - **目标文件**: `src/pages/chat/queryChat/ChatFooter/index.tsx` & `SendActionBar/index.tsx`  
  - **重构要求**: 输入框采用 `bg-surface rounded-lg`；工具栏图标 Hover 设为 `hover:bg-surface-hover`。

- [ ] **T008 [P] [Spec §3]** 重构通用模态框 `DraggableModalWrap` & 用户卡片 `UserCardModal`  
  - **目标文件**: `src/components/DraggableModalWrap/index.tsx` & `src/pages/common/UserCardModal/index.tsx`  
  - **重构要求**: Modal 容器统一设为 `bg-surface-raised shadow-floating rounded-xl`；遮罩层使用微透明黑。

---

## Phase 3: 深色模式与最终编译 (Dark Mode & Build Verification)

- [ ] **T009** 全局深色模式 (`.dark`) 适配与打包编译验证  
  - **依赖**: T003 ~ T008  
  - **实现步骤**:
    1. 在 `html` 上切换 `.dark` 标签，验证全站背景与文字平滑变暗无失真。
    2. 运行 `pnpm build` / `npm run build` 确保无 TypeScript 或 SCSS 打包错误。
