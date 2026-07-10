# AGENTS

## 项目定位

- 这是一个 Manifest V3 Chrome 扩展，不是 npm 工程，也没有构建步骤。
- `manifest.json` 是版本唯一来源；发布目录固定为 `dist/visual-qa-release/`。
- 运行态核心在 `visual-qa.js`、`service_worker.js`、`content-bridge.js`。

## 编辑规则

- 修改 `visual-qa.js` 的发布行为时，同步检查 `dist/visual-qa-release/visual-qa.js` 是否也要更新。
- 不要随意重构选择、测量、记录、草稿恢复、HTML 导出主链路；这几块都属于稳定区。
- `measureA / measureB` 是测量主状态机，非必要不要改它们的职责边界。
- selected panel 的标题和能力判断依赖 `buildSelectedCapabilities`，改文本态判断时要一起看 `isStableTextEditableTarget`、`getEditableTextValue`、`applyTextContentDraft`。
- 文本元素在内容被清空后，仍应保持原元素的文本编辑态；普通空 `div / card` 不能因此被误判成文本元素。

## 回归重点

- 选择模式下，清空文本不会让 selected panel 或文本输入框消失。
- 在空文本框重新输入内容时，写回的是原文本元素，不是新目标。
- 普通块元素不会因为无文本而进入文本编辑态。
- 宽高、字体、颜色、背景、描边、投影编辑链路不受文本态修复影响。
- `measureA / measureB`、AI 修改列表、记录抽屉、草稿恢复、HTML 导出保持正常。
- 双元素测量锁定后，结果工具条的记录和关闭操作保持可用；鼠标持续移动时按钮 hover 不应消失。

## 最低验证

```bash
node --check visual-qa.js
node --check service_worker.js
node --check content-bridge.js
node --check dist/visual-qa-release/visual-qa.js
```
