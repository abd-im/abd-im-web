# Linear/Multica 风格 UI 重构设计方案 (Design Spec)

**分支**: `feat/ui-redesign` | **目标**: 将 `abd-im-web` 的样式全量替换为 OKLCH + 5层 Surface 架构的高质感界面

---

## 1. 核心设计 Token 定义 (`src/styles/tokens.css`)

统一采用 **OKLCH 色彩空间**（H ≈ 285.8 冷灰调），无缝支持日夜模式切换：

```css
:root {
    color-scheme: light;
    /* 5层 Surface 深度 */
    --app-shell: oklch(0.964 0.001 286.37);      /* Layer 0: 最外层外壳 */
    --page-canvas: oklch(0.988 0 0);             /* Layer 1: 会话/聊天主画布 */
    --surface: oklch(1 0 0);                    /* Layer 2: 内容卡片/气泡 */
    --surface-hover: oklch(0.967 0.001 286.37);   /* Layer 3: Hover 悬停 */
    --surface-selected: oklch(0.950 0.002 286.37);/* Layer 3: 选中态 */
    --surface-raised: oklch(1 0 0);             /* Layer 4: 浮动 Modal/菜单 */
    --surface-border: oklch(0.920 0.004 286.32); /* 微边框 */

    /* 文本阶梯 (WCAG AA 4.5:1 / 3:1) */
    --foreground: oklch(0.141 0.005 285.82);      /* 主文字 */
    --muted-foreground: oklch(0.505 0.016 285.93);/* 辅助说明文字 (4.5:1) */
    --faint-foreground: oklch(0.606 0.016 285.93);/* 非文本图标/箭头 (3:1) */
    --brand: oklch(0.550 0.160 255.00);           /* 主题品牌蓝 */

    /* 阴影体系 */
    --surface-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 1px 1px rgb(15 23 42 / 0.03);
    --floating-shadow: 0 16px 40px rgb(15 23 42 / 0.14), 0 3px 10px rgb(15 23 42 / 0.08);

    /* 字号与行高 */
    --text-micro: 11px;     --text-micro--lh: 15px;
    --text-caption: 12px;   --text-caption--lh: 16px;
    --text-label: 13px;     --text-label--lh: 18px;
    --text-body: 14px;      --text-body--lh: 20px;
    --text-body-lg: 15px;   --text-body-lg--lh: 22px;
    --text-title-sm: 16px;  --text-title-sm--lh: 24px;
}

.dark {
    color-scheme: dark;
    --app-shell: oklch(0.155 0.005 285.82);
    --page-canvas: oklch(0.180 0.005 285.82);
    --surface: oklch(0.210 0.006 285.88);
    --surface-hover: oklch(0.274 0.006 286.03);
    --surface-selected: oklch(0.300 0.006 286.03);
    --surface-raised: oklch(0.235 0.007 285.88);
    --surface-border: oklch(1 0 0 / 10%);

    --foreground: oklch(0.985 0 0);
    --muted-foreground: oklch(0.705 0.015 286.06);
    --faint-foreground: oklch(0.600 0.015 286.06);
    --brand: oklch(0.650 0.160 255.00);

    --surface-shadow: 0 1px 2px rgb(0 0 0 / 0.20), 0 1px 1px rgb(0 0 0 / 0.16);
    --floating-shadow: 0 20px 48px rgb(0 0 0 / 0.46), 0 4px 12px rgb(0 0 0 / 0.28);
}
```

---

## 2. Tailwind 配置扩展 (`tailwind.config.js`)

将 CSS 变量映射为 Tailwind 工具类，开发时直接使用语义化类名：

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        'app-shell': 'var(--app-shell)',
        'page-canvas': 'var(--page-canvas)',
        'surface': 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-selected': 'var(--surface-selected)',
        'surface-raised': 'var(--surface-raised)',
        'surface-border': 'var(--surface-border)',
        'foreground': 'var(--foreground)',
        'muted-foreground': 'var(--muted-foreground)',
        'faint-foreground': 'var(--faint-foreground)',
        'brand': 'var(--brand)',
      },
      boxShadow: {
        'surface': 'var(--surface-shadow)',
        'floating': 'var(--floating-shadow)',
      }
    }
  }
}
```

---

## 3. 核心组件样式映射表

| 组件 | 目标文件 | 替换前样式 | 替换后语义化类名 |
| :--- | :--- | :--- | :--- |
| **主导航栏** | `LeftNavBar/index.tsx` | `#1e293b`, `bg-slate-800` | `bg-app-shell border-r border-surface-border` |
| **导航项 Hover**| `LeftNavBar/index.tsx` | `hover:bg-slate-700` | `hover:bg-surface-hover rounded-md` |
| **会话侧边栏** | `ConversationSider/` | `bg-white`, `#f5f5f5` | `bg-page-canvas` |
| **会话选中态** | `ConversationSider/` | `bg-blue-50`, `#e6f7ff` | `bg-surface-selected text-foreground` |
| **聊天主视口** | `queryChat/index.tsx` | `bg-[#f0f2f5]` | `bg-page-canvas` |
| **对方消息气泡**| `MessageItem/index.tsx` | `bg-white border` | `bg-surface shadow-surface text-foreground` |
| **己方消息气泡**| `MessageItem/index.tsx` | `bg-[#95ec69]` (微信绿) | `bg-brand text-white shadow-surface` |
| **弹窗 Modal** | `DraggableModalWrap/` | `bg-white shadow-lg` | `bg-surface-raised shadow-floating rounded-xl` |
