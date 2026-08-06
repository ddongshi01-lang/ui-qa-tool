# PixelAudit 插件功能说明（供程序/Agent 理解）

## 1. 文档目标

这份文档不是面向最终用户，而是面向另一个程序、Agent 或自动化系统。

目标是让外部程序快速理解这个 Chrome 扩展：

- 它是什么
- 它注入后会在页面上做什么
- 它有哪些模式、状态和主要交互
- 它会保存什么数据
- 它有哪些稳定能力和明确限制

本文基于当前仓库实现整理，版本以 [`manifest.json`](/Users/dongshide/Documents/ui-qa-tool/manifest.json:1) 为准，当前为 `1.1.0`。

## 2. 插件定位

`PixelAudit 视觉走查助手` 是一个 Manifest V3 Chrome 扩展，用于在网页上进行视觉走查。

它的核心用途不是抓取业务数据，也不是自动化测试执行器，而是：

- 在页面中选择元素
- 查看元素视觉属性
- 对部分样式做临时编辑
- 做尺寸/间距测量
- 记录元素或区域问题
- 保存走查草稿
- 导出 HTML 走查报告
- 维护一份“AI 修改列表”作为本次页面改动记录

## 3. 运行架构

插件由 3 个核心文件组成：

- [`service_worker.js`](/Users/dongshide/Documents/ui-qa-tool/service_worker.js:1)：后台脚本，负责注入、草稿存储、截图、HTML 下载、扩展图标状态。
- [`content-bridge.js`](/Users/dongshide/Documents/ui-qa-tool/content-bridge.js:1)：页面和扩展后台之间的桥接层。
- [`visual-qa.js`](/Users/dongshide/Documents/ui-qa-tool/visual-qa.js:1)：主运行时，负责页面内 UI、模式切换、选择、测量、记录、导出等全部主逻辑。

整体通信关系如下：

1. 用户点击扩展图标。
2. `service_worker.js` 向当前 tab 注入 `content-bridge.js` 和 `visual-qa.js`。
3. `visual-qa.js` 在页面中创建顶部工具栏、悬浮面板、测量层、记录弹层、抽屉等 UI。
4. `visual-qa.js` 通过 `window.postMessage` 调用 `content-bridge.js`。
5. `content-bridge.js` 再通过 `chrome.runtime.sendMessage` 请求 `service_worker.js`。
6. `service_worker.js` 提供存储、截图、下载、图标资源 URL 等扩展能力。

可以把它理解成：

- 页面内交互层：`visual-qa.js`
- 页面到扩展的消息桥：`content-bridge.js`
- 扩展权限能力层：`service_worker.js`

## 4. 后台可提供的动作

`service_worker.js` 当前对运行时开放的主要动作如下：

- `load-draft`：加载当前页面草稿
- `save-draft`：保存当前页面草稿
- `clear-draft`：清空当前页面草稿
- `capture-visible-tab`：截取当前可见页面
- `export-html`：把 HTML 内容下载为文件
- `get-topbar-icon-urls`：返回顶部工具栏图标 URL
- `get-floating-icon-urls`：返回浮窗图标 URL
- `get-ai-change-icon-urls`：返回 AI 修改列表图标 URL
- `set-plugin-state`：同步扩展图标的开关状态

这些动作不是公共网络 API，而是插件内部消息协议。

## 5. 页面内主能力

### 5.1 选择模式

选择模式是插件默认主模式。

用户点击页面元素后，插件会：

- 锁定该元素为当前选中元素
- 显示 selected panel
- 展示元素属性摘要和可编辑字段
- 在允许的字段上直接做临时样式修改

selected panel 的标题会根据能力判断区分为：

- `文本`：当前元素被识别为文本可编辑目标
- `元素`：普通元素

### 5.2 测量模式

测量模式用于视觉尺寸和间距辅助。

主状态机有两个关键选区：

- `measureA`
- `measureB`

可理解为：

- A 是首个锁定参考元素
- B 是当前对比元素

它支持两类测量：

- 单元素测量：宽高、内外间距等
- 双元素测量：元素之间距离

双元素锁定且存在有效距离时，会显示结果工具条：

- `记录`：以当前 A/B 间距创建测量记录
- `关闭测量`：清空 A/B，但保持测量模式

该工具条在测量摘要未变化时复用既有按钮节点，保证鼠标移动期间 hover 反馈稳定。

该模式属于稳定主链路，不应轻易改职责边界。

### 5.3 样式编辑

当前插件支持在 selected panel 中对一部分样式做临时编辑。根据现有实现，主要包括：

- 文本内容
- 字体族
- 字重
- 字号
- 行高
- 文本颜色
- 宽高
- 透明度
- 背景色
- 圆角
- padding / margin
- 描边（以运行时效果模拟）
- 阴影（以运行时效果模拟）

这里的“编辑”主要是直接改页面运行时 DOM / inline style，用于走查和对比，不是写回源代码。

### 5.4 记录能力

插件支持三种记录：

- 元素记录
- 区域记录
- 测量记录（从锁定的 A/B 测量结果创建）

记录链路大致是：

1. 进入记录相关入口
2. 选中元素，或者拖拽一个区域
3. 生成 pending record
4. 自动截图
5. 用户补充分类和备注
6. 保存进当前页面 draft

记录可以在抽屉中查看、编辑备注、删除、预览。

### 5.5 草稿恢复

插件支持当前页面的记录草稿恢复。

页面刷新或重新进入后，可以恢复：

- 当前页面的记录列表
- 记录相关元数据

这是通过 `service_worker.js + chrome.storage.local` 完成的。

### 5.6 HTML 导出

插件支持把当前记录导出为 HTML 报告。

导出结果包含：

- 页面标题
- 页面 URL
- 导出时间
- 记录总数
- 每条问题记录的截图
- 每条问题记录的备注
- 每条问题记录的修改摘要（如存在）
- 每条问题记录的“已完成”复选框

在导出的报告中勾选“已完成”后：

- 卡片保留白底，仅边框变绿
- “已完成”按钮变为绿色实心状态
- 截图与详情降低视觉权重

完成态只存在于当前打开的 HTML 页面，不写回插件草稿，也不会在重新打开文件后保留。

导出是直接在后台构造 HTML 字符串并通过下载能力落盘，不依赖构建流程或服务端。

### 5.7 AI 修改列表

插件内部维护一份“AI 修改列表”，它不是 AI 执行器，而是一份页面修改记录。

它的用途更接近：

- 记录当前页面被插件临时改动过哪些元素
- 记录每个属性从什么值改成了什么值
- 支持恢复、复制、删除、定位

重要特征：

- 这是“变更记录系统”，不是“自动应用历史 patch 的重放系统”
- 恢复草稿后不会自动把历史 `patch.to` 全量回放到页面
- 变更记录和正式记录抽屉是两条并行能力

## 6. 主要模式与交互入口

顶部工具栏是主要入口，当前核心动作包括：

- `选择`
- `测量`
- `记录元素`
- `AI 修改`
- `更多`
- `记录抽屉`
- `收起/展开`

快捷键包括：

- `V`：选择模式
- `C`：测量模式
- `O`：记录元素
- `R`：记录区域
- `M`：打开记录抽屉
- `Esc`：关闭当前子状态、退出局部交互、清理测量/弹层等

注意：

- `Esc` 不只是“关闭面板”，而是一个分层兜底退出键
- 它会根据当前子状态优先关闭记录弹层、分类菜单、预览、区域选择、测量态等

## 7. 运行时重要状态

另一个程序如果要理解交互逻辑，应该重点关注这些运行时状态概念：

- `state.v12.mode`
- `state.measureA`
- `state.measureB`
- `state.hoveredEl`
- `selected element`
- `panelCollapsed`
- `panelPinned`
- `panelManualPosition`
- `state.v12.pendingRecord`
- `state.v12.drawerOpen`
- `state.v12.recordPopoverOpen`
- `state.v12.regionSelection`
- `state.v12.draft`
- `state.v12.changeDraft`

可以把它们理解成 4 组状态：

1. 页面选择状态
2. 测量状态
3. 记录状态
4. 草稿/变更持久化状态

## 8. 数据模型（简化理解版）

### 8.1 记录草稿 draft

当前页面 draft 至少包含这些信息：

```js
{
  draftId,
  pageKey,
  pageUrl,
  pageTitle,
  createdAt,
  updatedAt,
  version,
  records: []
}
```

其中：

- `pageKey` 基本等于当前 URL 去掉 hash
- `records` 是当前页面的问题记录列表

### 8.2 AI 修改草稿 changeDraft

AI 修改列表的草稿大致结构如下：

```js
{
  draftId,
  pageKey,
  pageUrl,
  pageTitle,
  viewport,
  createdAt,
  updatedAt,
  version,
  changes: [
    {
      id,
      targetName,
      targetHint,
      selector,
      selectorPath,
      textHint,
      rect,
      scroll,
      patches: [
        { id, prop, from, to, createdAt, updatedAt }
      ]
    }
  ]
}
```

这个结构的核心意义是：

- `change item` 对应一个页面目标
- `patch` 对应一个属性改动

## 9. 文本编辑识别规则

这是当前插件一个很关键、也很容易被误解的逻辑。

插件不是“只要元素有文字就可编辑”，也不是“只要内容为空就不是文本元素”。

当前稳定规则依赖这几个函数：

- `isStableTextEditableTarget`
- `getEditableTextValue`
- `applyTextContentDraft`
- `buildSelectedCapabilities`

实际语义是：

- `input / textarea` 天然属于文本可编辑目标
- 对普通 DOM，只有在“稳定满足文本节点结构”时才算文本可编辑
- 一旦一个元素已被稳定识别为文本目标，即使文本被清空，也要尽量保持它的文本编辑态
- 但普通空 `div / card` 不能因此被误判成文本元素

这条规则是当前版本的明确回归重点。

外部程序应避免做出以下错误推断：

- “元素没有文本了，所以它已经不是文本元素”
- “任何空容器都可以重新输入文本”

正确理解是：

- “曾经被稳定识别为文本目标的元素，在内容清空后仍可能保持文本编辑资格”

## 10. 记录与截图逻辑

记录功能不是单纯保存元素引用，它通常还会关联截图信息。

大致流程：

1. 创建 pending record
2. 请求后台 `capture-visible-tab`
3. 根据元素或区域计算 focus rect / shot rect
4. 生成缩略图或导出图
5. 保存到 draft record

因此记录能力同时依赖：

- 页面内目标定位
- 可见区域截图
- 记录草稿持久化

## 11. 存储方式

插件当前至少使用两种本地存储：

### 11.1 `chrome.storage.local`

用于保存页面记录草稿：

- key 前缀：`vqa:draft:`

### 11.2 `window.localStorage`

用于保存 AI 修改列表草稿：

- key 前缀：`visual-qa:ai-change-draft:`

因此外部程序应该区分：

- 正式记录草稿
- AI 修改列表草稿

它们不是同一个存储系统。

## 12. 明确边界与限制

### 12.1 这是运行时走查工具，不是源码编辑器

插件对页面的改动主要发生在当前运行时 DOM 上，目标是走查、比较、记录，而不是修改项目源代码。

### 12.2 不是通用自动化框架

虽然它能选择元素、截图、记录状态，但当前定位不是 Playwright/Puppeteer 那类自动化测试引擎。

### 12.3 不是任意元素都能当文本编辑目标

文本态识别是收紧过的，必须遵守稳定识别规则。

### 12.4 不建议大改稳定主链路

以下区域在当前项目语境里属于稳定区：

- 选择模式主流程
- selected panel 编辑主流程
- 测量模式主状态机
- 记录抽屉与记录保存
- 草稿恢复
- HTML 导出

### 12.5 发布目录是固定的

这是无构建流程项目，稳定发布目录固定为：

- `dist/visual-qa-release/`

## 13. 如果另一个程序要“理解这个插件”，推荐这样建模

推荐把这个插件抽象成下面 6 个能力模块：

1. `Injector`
说明：把桥接脚本和主脚本注入到当前页面。

2. `Inspector`
说明：负责 hover、选择元素、显示 selected panel、编辑已开放属性。

3. `MeasurementEngine`
说明：负责 `measureA / measureB`、单元素测量、双元素测量、间距引导线。

4. `RecordSystem`
说明：负责元素记录、区域记录、截图、备注、抽屉、预览。

5. `DraftPersistence`
说明：负责页面记录草稿的加载、保存、清空与恢复。

6. `ChangeDraftSystem`
说明：负责页面临时样式改动的记录、恢复、删除和复制提示词相关能力。

## 14. 给 Agent 的最短结论

如果另一个程序只需要一个简版理解，可以直接使用下面这段：

> PixelAudit 是一个注入到网页内运行的 Chrome 视觉走查扩展。它提供元素选择、样式查看与临时编辑、尺寸/间距测量、元素/区域记录、草稿恢复、AI 修改列表和 HTML 导出。运行结构为 `visual-qa.js` 页面内主逻辑 + `content-bridge.js` 消息桥 + `service_worker.js` 后台存储/截图/下载。核心稳定链路是选择、测量、记录、草稿恢复和 HTML 导出。文本元素识别是收紧过的：曾经稳定识别为文本目标的元素，在内容清空后仍需保持文本编辑态，但普通空容器不能被误判为文本元素。
