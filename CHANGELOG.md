# Changelog

## Unreleased - 2026-04-07

### 交接摘要
- 已把顶部“测量”模式接管成 `select` 下的独立子态，避免打开右侧编辑框。
- 单元素 `single` 态已做稳，并收紧为“leaf-like / container-like”两类，只在元素自身明显是结构容器时才展示同组结构。
- 已移除 single 态里的绿色父容器框，0 值和 1px 噪声标签也已过滤。
- 双元素 `hover preview` / `pinned pair` 仍未开始，当前代码只停在 Step 2。

### 当前代码状态
- 非测量模式行为保持不变。
- 选择模式现有 `selected A + hover target` 主链路未改。
- `renderSelectedPanel`、`resolvePrimaryMeasure`、`addPrimaryMeasureGuides` 未改。
- 记录、抽屉、导出、草稿恢复未改。

### 已完成范围
- Step 1: 顶部测量入口接管、模式边界收口、`Esc` 清理测量态。
- Step 2: 单元素结构测量的基础实现和收口，包含 leaf-like / container-like 区分、padding/content 表达、gap/首尾空间展示和 fallback。

### 下一步
- 继续前先确认 Step 2 的视觉与结构判断是否符合预期。
- 若确认，再进入 Step 3 的双元素交互和渲染心智改造。

## 1.0.0 - 2026-03-27

这是 `视觉走查助手` 的首个正式发布基线。

### 核心能力
- 元素高亮与实时信息面板
- 冻结模式与间距引导
- 双元素测距
- 冻结态样式临时编辑与一键清除
- 面板固定、拖拽、收起/展开
- 快捷键：`M`、`F`、`C`、`R`、`P`、`B`、`Esc`

### 已知边界
- 默认按单页主框架工作，不额外扩展 iframe 兼容
- 测量与样式读取基于浏览器计算结果，复杂布局下可能与视觉感知存在差异
- 当前无持久化存储，刷新页面后状态会重置

### 发布说明
- `manifest.json` 以 `1.0.0` 作为唯一版本源
- 本版本保持现有功能边界，不再把当前修复继续向外扩展为新能力
