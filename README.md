# PixelAudit 视觉走查助手

一个基于 Chrome Extension Manifest V3 的网页视觉走查工具，用来在页面上直接查看尺寸、字体、颜色、间距，并记录问题、恢复草稿、导出 HTML 报告。

## 当前版本

- 扩展名称：`PixelAudit 视觉走查助手`
- 版本号：`1.1.0`
- 发布目录：`dist/visual-qa-release/`

## 快速使用

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 打开“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 优先选择稳定发布目录 `dist/visual-qa-release/`；只有本地开发时才加载仓库根目录。
5. 在目标页面点击扩展图标，注入 `content-bridge.js` 与 `visual-qa.js`。

如果出现 `Cannot load extension with file or directory name _metadata`：

- 说明你加载了错误的目录，通常是 `.crx` 解压目录，或带有 `_metadata` / `__MACOSX` 的外层目录。
- 不要加载 zip 文件本身，也不要加载解压 `.crx` 后得到的目录。
- 请重新选择纯目录 `dist/visual-qa-release/`，或先运行 `node scripts/sync_release.js` 重建发布目录后再加载。

## 核心能力

- 选择模式：查看当前元素信息，编辑已开放的样式字段。
- 测量模式：查看单元素尺寸、结构间距和双元素测量关系。
- 记录能力：支持元素记录、区域记录、备注维护、记录抽屉查看。
- 草稿恢复：页面刷新或重新打开后恢复记录与 AI 修改列表。
- HTML 导出：导出当前记录为可打开的 HTML 报告，并可在报告内逐条勾选完成状态。

## 主要文件

- `visual-qa.js`：主注入脚本，包含选择、测量、面板编辑、记录和导出主逻辑。
- `service_worker.js`：扩展后台脚本，负责注入、草稿存储、截图和下载。
- `content-bridge.js`：页面与扩展之间的桥接层。
- `manifest.json`：扩展入口和版本唯一来源。
- `dist/visual-qa-release/`：当前稳定版发布目录。

## 验证命令

```bash
node scripts/sync_release.js
node --check visual-qa.js
node --check service_worker.js
node --check content-bridge.js
node --check dist/visual-qa-release/visual-qa.js
```

## 文档索引

- [AGENTS.md](./AGENTS.md)：给后续 AI / Agent 的项目约束与回归重点。
- [docs/handoff.md](./docs/handoff.md)：当前稳定态、关键链路和近期注意事项。
- [稳定版回归清单.md](./稳定版回归清单.md)：手工回归清单。
- [稳定版基线说明.md](./稳定版基线说明.md)：当前稳定版边界。
- [CHANGELOG.md](./CHANGELOG.md)：对外变更摘要。
- `交接文档.md`：历史交接沉淀，信息完整但较长，优先把新增共识补进上面的精简文档。
