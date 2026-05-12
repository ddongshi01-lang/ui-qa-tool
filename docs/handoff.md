# 当前交接

## 项目现状

- 当前稳定版本为 `1.0.6`。
- 代码主入口仍然集中在单文件 `visual-qa.js`，没有拆模块和构建流程。
- 发布目录固定为 `dist/visual-qa-release/`，发布内容与根目录源码应保持一致。

## 主链路

- `service_worker.js` 负责点击扩展图标后的脚本注入、草稿存储、截图与下载。
- `content-bridge.js` 负责页面与扩展运行态之间的数据桥接。
- `visual-qa.js` 负责 hover、selected panel、measure、记录、AI 修改列表和 HTML 导出。

## 稳定区

- 选择模式主流程
- selected panel 编辑主流程
- 测量模式主状态机
- 记录抽屉与记录保存
- 草稿恢复
- HTML 导出

这些区域默认按“局部修复优先”处理，不建议没有明确收益就做结构性重写。

## 近期新增约束

### 文本编辑态保持

- 文本元素被选中后，即使把文本内容清空，selected panel 仍要保留文本输入框。
- 当前元素仍应保持选中高亮或可编辑状态。
- 在空文本框重新输入内容时，仍要写回原来的文本元素。
- 这个保持逻辑只适用于“先前已被稳定识别为文本可编辑”的元素，不能把普通空 `div / card` 误识别成文本元素。

### 相关函数

- `isStableTextEditableTarget`
- `getEditableTextValue`
- `applyTextContentDraft`
- `buildSelectedCapabilities`
- `renderSelectedPanel`

## 回归建议

- 先跑 [稳定版回归清单.md](../稳定版回归清单.md)。
- 涉及文本态时，重点回归“清空文本后继续编辑”和“普通块元素不误判”。
- 任何触达 `measureA / measureB`、记录抽屉、AI 修改列表的修改，都要做手工回归。
