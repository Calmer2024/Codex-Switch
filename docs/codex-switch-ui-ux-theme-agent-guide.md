# Codex Switch UI/UX 主题风格规范

面向 Agent 的复用指南，用于在其他产品中稳定复刻 Codex Switch 的界面气质、布局节奏、组件语言和交互手感。

## 1. 风格定义

Codex Switch 是一种“轻量桌面控制台”风格：白色画布、细线分区、高信息密度、柔和圆角、图标先行、文本克制、状态色精准。它更像一个安静可靠的本地工具，而不是营销页、游戏界面或重视觉品牌站。

核心关键词：

- 桌面工具感：固定工作区、左侧图标 rail、内部滚动，不让 body 自由滚动。
- 轻量控制台：大量数据、配置、状态和操作被压进可扫描卡片。
- 克制品牌感：蓝紫渐变只用于当前项、品牌标识和少数激活状态。
- 细密但不压迫：密度高，但靠留白、浅边框、小字号和低饱和背景保持呼吸。
- 状态可读：绿色、橙色、红色有明确语义，不作为装饰随机使用。

推荐设计拨盘：

```txt
DESIGN_VARIANCE: 4
MOTION_INTENSITY: 3
VISUAL_DENSITY: 8
```

适合复用到：配置管理器、开发工具、账号/密钥/环境切换器、本地桌面工具、轻量后台、资源库、插件管理、模型/Provider 管理、任务路由控制台。

不适合直接复用到：营销落地页、内容社区、沉浸式媒体页、儿童产品、强品牌电商、移动优先消费 App。

## 2. 主题 Token

优先使用 CSS 变量。Agent 开发其他产品时，先复制语义 token，再根据品牌替换少量 accent，避免在组件里散写颜色。

```css
:root {
  color-scheme: light;

  --page: #ffffff;
  --canvas: #ffffff;
  --subtle: #f7f8fa;
  --subtle-strong: #eef1f4;

  --text: #14171a;
  --muted: #80868f;
  --muted-strong: #5c626a;

  --line: #eceef2;
  --line-strong: #dfe3e8;

  --action: #17191d;
  --action-hover: #2a2d32;

  --ok: #2aa84a;
  --ok-soft: #eaf8ee;
  --warn: #c0673a;
  --warn-soft: #fff1e9;
  --danger: #c4362a;
  --danger-soft: #fff0ee;

  --focus: rgb(42 168 74 / 0.18);

  --brand-blue: #5577f2;
  --brand-violet: #7f5af0;
  --brand-gradient: linear-gradient(90deg, var(--brand-blue), var(--brand-violet));
}
```

颜色使用规则：

- 页面主背景保持白色或极浅灰，不做深色默认主题。
- 普通边框用 `--line`，强分割或选中边框用 `--line-strong`。
- 主操作按钮用近黑 `--action`，不要用品牌蓝紫铺满所有 CTA。
- 品牌蓝紫只用于当前状态、logo、active card 底部指示条、官方/内置状态。
- 成功、警告、危险必须绑定语义：可用/正常用绿色，需注意/未同步用橙色，失败/删除用红色。
- 用 `color-mix()` 生成标签背景时，背景推荐 8%-12% 色彩混入，文字推荐 72%-86% 色彩混入。

## 3. 字体与排版

当前风格使用 Google Sans 类几何无衬线作为拉丁字体，中文使用 Noto Sans SC / Microsoft YaHei UI。泛化时保持“圆润、低噪、无强品牌姿态”的无衬线。

```css
--latin-font: "Google Sans", "Google Sans Text", "Arial", sans-serif;
--cjk-font: "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;

body {
  font-family: var(--latin-font), var(--cjk-font);
  font-weight: 400;
  font-synthesis: none;
}
```

排版规则：

- 全局几乎只用 `font-weight: 400`。不要用粗黑标题撑层级。
- 字号层级小而清晰：页面标题 32px，区块标题 20-24px，面板标题 17px，正文/按钮 12-13px，辅助说明 10-12px。
- 大数字可以很大但仍保持 400 字重，例如 overview 指标数字 58px。
- `letter-spacing` 保持 0，避免 uppercase 宽字距带来的营销感。
- 文本默认单行截断，配置名、host、URL、标签和状态都要支持 `text-overflow: ellipsis`。
- 文案要功能化：用“配置库”“可用配置”“同步额度”“新建中转站配置”，避免“释放潜能”“无缝体验”等营销话术。

推荐字号表：

| 用途 | 字号 | 行高/说明 |
|---|---:|---|
| 顶层 view 标题 | 32px | line-height 1，weight 400 |
| 次级标题 | 20-24px | 用于卡片区标题、modal 标题 |
| 面板标题 | 17px | 搭配 12px 描述 |
| 卡片主标题 | 17px | 单行截断 |
| 表格/卡片正文 | 12-13px | 主体阅读密度 |
| 元信息 | 10-11px | Last updated、编号、辅助说明 |
| 指标大数字 | 58px | overview 统计，不加粗 |

## 4. 布局系统

Codex Switch 的基础布局是全屏桌面应用，而不是网页文档流。

### 4.1 App Shell

```css
.app-shell {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
}

body {
  min-width: 1280px;
  min-height: 100dvh;
  overflow: hidden;
}
```

规则：

- 左侧 rail 固定 72px，右侧 workspace 占满剩余空间。
- body 不滚动，具体内容在卡片网格、列表或面板内部滚动。
- 默认面向桌面，`min-width: 1280px` 是风格的一部分。不要强行做手机优先。
- 面板之间优先用 1px 分割线，不用大块阴影或厚重卡片。

### 4.2 左侧导航 Rail

Rail 是产品的主要骨架。

- 宽度：72px。
- 背景：`#fbfcfd`。
- 右边框：`1px solid --line`。
- 顶部 logo：40px。
- 导航按钮：34px 圆形，图标 18-19px。
- 间距：主导航 gap 14px，整体 rail gap 28px。
- active 状态：浅灰圆底 `#eef1f3` + 图标填充态。
- icon-only 按钮必须有 `title` 或 `aria-label`。

不要把 rail 做成带文字的侧边栏。Codex Switch 的感觉来自“窄、静、图标化”的工具 rail。

### 4.3 Workspace

Workspace 根据不同视图切换布局：

- 配置库：主区域卡片网格，占满 workspace。
- 工作台：顶部 overview 指标条 + status grid + 表单面板。
- 标签管理：左右分栏，左侧指标板，右侧洞察摘要。

分栏比例可复用：

```css
.profiles-view { grid-template-columns: minmax(0, 1fr) 380px; }
.tags-view { grid-template-columns: minmax(0, 1.12fr) minmax(340px, 0.88fr); }
```

泛化规则：

- 如果产品核心是“对象库”，使用配置库模式：header tools + tabs/filter + card grid。
- 如果产品核心是“当前系统状态”，使用工作台模式：大数字 + readiness/progress + status tiles。
- 如果产品核心是“分类/评分/健康度”，使用标签管理模式：左侧分组指标，右侧统计洞察。

## 5. 表面、边框、圆角与阴影

Codex Switch 的界面不是玻璃拟态，也不是重卡片拟态。它是“白色表面 + 细线 + 极浅阴影”。

圆角规则：

| 元素 | 圆角 |
|---|---:|
| Rail/icon button/pill | 999px |
| 主卡片 | 8px |
| 小 tile / URL 操作按钮 | 7-8px |
| 搜索框 / 主工具按钮 | 10-12px |
| Modal | 14px |
| 进度条 | 4-999px，依形态而定 |
| 代码/编号 chip | 5px |

阴影规则：

- 普通面板基本无阴影。
- 搜索框、工具按钮可用非常浅的阴影：`0 10px 24px rgb(17 18 24 / 0.04)`。
- 主按钮可用：`0 12px 24px rgb(17 18 24 / 0.11)`。
- Toast：`0 22px 58px rgb(17 18 24 / 0.16)`。
- Modal：`0 28px 90px rgb(17 18 24 / 0.22)`。
- 不使用纯黑大投影，不做悬浮卡片堆叠。

## 6. 组件规范

### 6.1 主按钮

主按钮是近黑实体按钮，圆角 10-11px，不使用品牌渐变。

```css
.primary-action {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--action);
  color: #ffffff;
}

.create-subscription-button {
  height: 44px;
  padding: 0 16px;
  border-radius: 10px;
  background: #111217;
  color: #ffffff;
  box-shadow: 0 12px 24px rgb(17 18 24 / 0.11);
}
```

规则：

- 主按钮文案短，2-5 个中文字符最佳，如“切换”“添加配置”“创建配置”。
- 主按钮可带图标。新增按钮图标可用橙色 `#ff8d55` 作为轻微强调。
- hover 时只轻微变暗和上浮，不做发光。
- active 时全局 `translateY(1px)`，体现按压感。

### 6.2 次级按钮

次级按钮是白底细边框。

```css
.secondary-action {
  border: 1px solid var(--line);
  background: #ffffff;
  color: var(--text);
}
```

hover：边框加深到 `--line-strong`，背景到 `--subtle`。

### 6.3 危险按钮

危险动作必须软红底，不要直接使用大面积红色实体按钮。

```css
.danger-action {
  border: 1px solid rgb(196 54 42 / 0.18);
  background: var(--danger-soft);
  color: var(--danger);
}
```

### 6.4 图标按钮

图标按钮是该风格最重要的操作形态。

- Rail 图标按钮：34x34，圆形。
- 卡片右上角操作：23x23，8px 圆角。
- URL 复制按钮：22x22，7px 圆角。
- 图标库优先使用 Phosphor Icons，常用尺寸 14/15/16/17/18/19/21px。
- active 导航图标使用 `weight="fill"`，非 active 使用 regular。

### 6.5 输入框

输入框使用 icon + input 的 shell 结构。

```css
.input-shell {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.input-shell:focus-within {
  border-color: rgb(42 168 74 / 0.42);
  box-shadow: 0 0 0 3px var(--focus);
}
```

规则：

- label 放在 input 上方，11-12px。
- placeholder 只做示例，不能替代 label。
- 表单密度紧凑，label 与输入框 gap 7px，字段之间 gap 12px 左右。
- 密钥字段使用眼睛图标切换可见性。

### 6.6 标签与状态 Badge

Badge 是胶囊形，图标 + 短文本。

- 高度：21-26px。
- 圆角：999px。
- 字号：10-12px。
- gap：4-6px。
- 不超过 2 个主标签，更多显示 `+N`。

状态语义：

- success：`#dcf8e4` / `#35bb59`
- warning：`#fff5d9` / `#d99a20`
- danger：`#ffeceb` / `#e05f55`
- active/current：品牌渐变或品牌蓝软底

### 6.7 配置卡片

配置卡片是 Codex Switch 的 signature component。

默认结构：

```txt
card
  top: avatar + name/host + tools
  mini tiles: auth + status
  url row: icon + endpoint + copy
  usage panel
  tag row
  footer: avatar/date + code
  actions
```

尺寸与布局：

- 卡片网格：4 列，gap 14px。
- 单卡最小宽度：248px 左右，实际常见 265px。
- 单卡最小高度：430px。
- 卡片圆角：8px。
- 卡片边框：`#e8e8eb`。
- 内边距：15px 14px 14px。
- 内部 gap：8px。

视觉规则：

- 卡片默认白底，hover 时只微弱改变边框和背景。
- active 卡片使用淡蓝紫背景渐变和品牌边框。
- 卡片底部使用 72x4px 的圆头短条表示 accent，不要加大面积彩色边框。
- 官方/内置卡片可用 `linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)`。
- 卡片内容必须可截断，不能因为 URL、名称或余额长文本撑破布局。

### 6.8 Provider Avatar

Provider avatar 是品牌感的次级来源。

- 圆形，内部用单字母。
- 背景由 provider color 与白色混合产生渐变。
- 可叠加少量几何高光：斜条、圆环、小点。
- 不依赖真实 logo 时，也要生成有识别度的色块头像。
- 不要使用默认用户头像或空白圆。

### 6.9 Progress 与 Meter

进度条有两类：

- overview readiness：44px 高，4px 圆角，多色水平渐变。
- 小 meter：5px 高，999px 圆角，用于额度/覆盖率。

规则：

- 大进度条用于全局健康度。
- 小进度条用于卡片内次级信息。
- 不要给每个列表项都加厚重进度条，避免变成杂乱 dashboard。

## 7. Modal、Toast 与 Overlay

### 7.1 Modal

```css
.modal-backdrop {
  background: rgb(16 17 22 / 0.36);
  backdrop-filter: blur(12px);
}

.relay-modal {
  width: min(590px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  border: 1px solid #ececef;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 28px 90px rgb(17 18 24 / 0.22);
}
```

规则：

- overlay 可以模糊背景，但 modal 本身保持实白，不做半透明玻璃。
- modal 标题上方可以有 11px 英文小标签，如 `Create relay`。
- modal 主标题 21px，weight 400。
- modal 表单比主页面稍紧凑，输入框 min-height 37px。
- footer actions 靠右，主次按钮高度 34px。

### 7.2 Toast

Toast 位于右下角。

- 宽度：`min(420px, calc(100vw - 56px))`。
- padding：14px。
- 圆角：12px。
- 阴影：`0 22px 58px rgb(17 18 24 / 0.16)`。
- 布局：状态图标 + title + detail + close。
- detail 单行截断。
- 进入动画：220ms，opacity + translateY(10px) + scale(0.98)。

## 8. 交互与动画

Codex Switch 的动效原则是“反馈明确，但不表演”。

默认 transition：

- 普通交互：150ms ease。
- 卡片/工具按钮：160-180ms ease。
- 不做长时长 ease-out 大幅位移。

现有动画：

```css
@keyframes card-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes tab-line-in {
  from { opacity: 0; transform: scaleX(0.4); }
  to { opacity: 1; transform: scaleX(1); }
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

规则：

- 卡片入场：`card-rise 360ms ease both`，可按序增加 35ms delay，最多前 6 张。
- Tab active underline：220ms scaleX。
- Toast：220ms 进入。
- Loading spinner：900ms linear infinite，只用于刷新/同步中的图标。
- hover 上浮最多 `translateY(-2px)`，普通按钮只变色。
- 全局 active 按压：`translateY(1px)`。
- 必须支持 `prefers-reduced-motion: reduce`，禁用卡片、tab 和高频按钮 transition。

## 9. 内容与信息架构

Codex Switch 的内容组织方式是“对象库 + 状态 + 操作”。

对象卡片应包含：

- 名称：短，可截断。
- 来源/host：辅助识别。
- 认证方式或关键字段。
- 当前状态。
- endpoint/路径/资源地址。
- 使用量/额度/健康度。
- 标签或分类。
- 更新时间或最后应用时间。
- 主要动作与少量辅助动作。

文案规则：

- 中文为主，英文只用于技术元信息，如 `Base URL`、`API Key`、`Last updated`、`OFFICIAL`。
- 每个按钮只表达一个动作：切换、测试、删除、连接余额、同步额度。
- 状态文字直接说明事实：当前使用、正常、未测试、余额待同步。
- 不写解释性长段落。说明文本通常 12px、1 行到 2 行。

## 10. 泛化到其他产品的方法

Agent 复用 Codex Switch 风格时，按以下映射操作：

1. 把“中转站配置”替换为目标产品的核心对象。
   例如：模型、环境变量、插件、账号、工作区、机器人、数据源、部署目标。

2. 保留三层骨架。
   左侧 rail 放 view 切换；主 workspace 放对象库；必要时增加 overview/status/tag insight。

3. 每张卡片保留 7 段信息密度。
   顶部 identity、2 个 mini tile、资源路径、usage/health、tags、footer meta、actions。

4. 把品牌色降级为 active accent。
   不要让新品牌色铺满页面。只替换 logo、active 边框、短条、官方/当前状态。

5. 把行业状态映射到语义色。
   绿色表示可用/成功，橙色表示待处理/警告，红色表示失败/危险，蓝紫表示品牌/当前。

6. 保持桌面密度。
   不要把卡片改成大留白 marketing card。Codex Switch 的特征是“能扫很多对象”。

## 11. 反模式

开发 Agent 必须避免：

- 把主背景改成深色、紫色渐变或大面积毛玻璃。
- 把左侧 rail 扩成带文字的宽 sidebar。
- 使用粗体层级，尤其是 600/700 的大标题。
- 使用 16px 以上正文导致密度下降。
- 用品牌渐变做所有按钮。
- 给每张卡片加大阴影或 16px 以上圆角。
- 把状态色作为装饰随机点缀。
- 在卡片内堆长段说明文。
- 让 body 滚动，导致桌面工具感消失。
- 忘记 icon-only 按钮的 title/aria-label。
- 使用多个图标库混搭。
- 做复杂 scroll 动画、视差、磁吸、拖拽跟随等营销页动效。
- 用假数据制造精确感，除非明确标注 mock 或来自真实数据。

## 12. Agent 实施清单

在其他产品中复用该风格时，完成前逐项检查：

- [ ] 使用 72px 左侧 icon rail。
- [ ] body 固定 100dvh，内容区域内部滚动。
- [ ] CSS 变量包含 page/canvas/subtle/text/muted/line/action/semantic/brand。
- [ ] 字体为 Google Sans 或同类几何无衬线，中文 fallback 合理。
- [ ] 全局字重基本为 400。
- [ ] 页面标题约 32px，卡片标题约 17px，正文 12-13px。
- [ ] 主操作按钮为近黑，不是品牌渐变。
- [ ] 次级按钮为白底细线。
- [ ] 删除/危险动作为 soft red。
- [ ] 卡片圆角 8px，modal 圆角 14px，pill 圆角 999px。
- [ ] 卡片网格能一次展示多个对象，gap 约 14px。
- [ ] active 卡片有品牌边框/淡背景/底部短条，而不是整卡高亮。
- [ ] 表单 label 在上方，placeholder 只做示例。
- [ ] focus ring 使用 soft green。
- [ ] modal 使用暗色 blur backdrop，modal 本体实白。
- [ ] 动画只使用 opacity/transform。
- [ ] 支持 `prefers-reduced-motion`。
- [ ] 图标来自同一套图标库，优先 Phosphor。
- [ ] 文案短、功能化、技术产品语气。

## 13. 最小实现蓝图

新产品如果要快速建立 Codex Switch 风格，可从这个结构开始：

```tsx
<main className="app-shell">
  <aside className="nav-rail" aria-label="工具导航">
    <div className="brand-mark" />
    <nav className="rail-nav">
      <button title="工作台" />
      <button title="资源库" className="active" />
      <button title="标签管理" />
    </nav>
    <div className="rail-bottom">
      <button title="打开目录" />
    </div>
  </aside>

  <section className="workspace">
    <section className="view-panel library-view">
      <header className="subscriptions-header">
        <div className="subscriptions-title-block">
          <h1>资源库</h1>
          <div className="subscription-tabs" />
        </div>
        <div className="subscriptions-tools">
          <button className="sync-usage-button">同步状态</button>
          <label className="subscription-search" />
          <button className="create-subscription-button">添加资源</button>
        </div>
      </header>

      <div className="subscription-card-grid">
        <article className="subscription-card active" />
        <article className="subscription-card" />
      </div>
    </section>
  </section>
</main>
```

这份蓝图只定义骨架。具体业务字段可以替换，但不要改变 rail、workspace、卡片密度、按钮语义和状态色系统。
