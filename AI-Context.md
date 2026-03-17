# UI-QA-Tool 交接文档

## 已完成的功能
- 在页面内注入定位层和浮动面板，永远跟踪鼠标并在当前元素周围绘制高亮、间距测量、测距线（参见 `visual-qa.js:528` 和 `visual-qa.js:575` 处的 `highlight`/`spacingLayer`/`measureLayer` 的创建与渲染）。
- Tooltip 面板（`visual-qa.js:555`）展示尺寸、字体、间距与样式数据，冻结后还会变成可编辑的输入框并支持颜色拾取 + 增减按钮，数据由 `renderTooltip`/`renderMeasureSection` 生成（`visual-qa.js:809`、`visual-qa.js:790`）。
- 定义了配色、热键与输入状态对象（`visual-qa.js:8` 的 `CONFIG` 和 `visual-qa.js:44` 的 `state`），并通过 `refresh` + `schedule`（`visual-qa.js:893`、`visual-qa.js:923`）把 DOM 更新绑定到 `requestAnimationFrame`，保证只要面板活跃就可以持续追踪 hoverf/freeze 目标。
- 面板通过浮动按钮、固定/冻结/测距/清除快捷按钮来控制，所有交互事件都在初始化阶段统一监听（`visual-qa.js:1097` 及其前后执行的事件绑定，`visual-qa.js:894` 的初始调用保证默认打开状态）。
- 扩展通过 `manifest.json:1` 声明 `activeTab` 与 `scripting` 权限，`service_worker.js:1` 通过 `chrome.scripting.executeScript` 把 `visual-qa.js` 注入主世界或隔离世界，用户点击扩展图标即可启动工具。
- `scripts/capture_store_shots.js:1` 提供一个 Playwright 脚本，自动打开常见站点、接受 Cookie、注入 `visual-qa.js`、演示 hover/freeeze/测距/固定等状态并保存截图，可以直接拿来补齐 `store-listing/README.md:1` 里说明的“1-5 张功能截图”。

## 核心逻辑要点
- `state` 保存当前 hover 元素、冻结元素、测距点、面板位置、拖拽状态等（`visual-qa.js:44`）；`CONFIG` 定义颜色、z-index 与 hotkey（`visual-qa.js:8`），所有计算都在本地运行，未接入任何后端。
- `refresh` 在 `requestAnimationFrame` 里从 `fromPoint` 拿到当前元素、重新更新高亮/测距/间距层以及按钮文本（`visual-qa.js:893`）；`schedule` 只在上一帧完成后才再次注册，避免重复渲染（`visual-qa.js:923`）。
- 鼠标移动、点击、快捷键、面板输入与浮动按钮拖拽都通过各自 handler 驱动：`onMouseMove`/`onClick`/`onKeyDown`/`onPanelInput` 分别更新 `state`，最后调用 `schedule()` 触发一次 `refresh`（`visual-qa.js:848` 这一段里可以看到完整的事件序列逻辑）。
- `renderTooltip` 集中负责拼接 HTML 片段（包括 `rowEditable`、`rowBoxEditable`）并在冻结状态下暴露 CSS 编辑入口，`applyStyle`/`clearEditedStyles`（`visual-qa.js:201` 等）直接修改 `state.frozenEl` 的 inline style，同时通过 `state.editedProps` 跟踪并可以一键还原。

## 资源与上下游
- `store-listing/listing-zh.md` 已写好中文营销文案与权限/隐私解释，只差实际截图（`store-listing/README.md:1` 指出了需要补 1-5 张 1280x800/640x400 的功能界面）。
- `store-listing/privacy-policy.md` 可作为上线的隐私说明或备用文案，目前还未托管；如果有自主站点需要再挂载并填入 URL。

## 下一步待办
1. **补齐 Store Listing 截图**：`store-listing/README.md:1` 仍在提醒我们需要 1-5 张实际运行时的界面截图（悬停高亮、冻结 spacing、测距模式、面板固定），可以用 `scripts/capture_store_shots.js:1` 现成脚本跑一遍并把输出放到 `store-listing/screenshots`，然后把路径填进 `listing-zh.md` 提到的审批流程。
2. **测量/间距信息导出**：当前 `renderMeasureSection` 只会把计算结果渲染成文字（`visual-qa.js:790`），QA 还不能一键复制或导出；后续可以加一个“复制”按钮或监听 `Ctrl+C`，把 `m.horizontal`/`m.vertical` 与 `boxText` 直接写到剪贴板以便写报告或录入 Bug。
3. **封装/发布流程**：虽然本地有 `visual-qa.js` 与 `service_worker.js`，但还没更新 `visual-qa-extension.zip` 的打包版本；在更新脚本后要重新打包（确保 `manifest.json:1`、`service_worker.js:1`、`visual-qa.js` 同步）并验证 Chrome Store 的自动解压版与脚本一致。
4. **截图脚本的容错升级**：`scripts/capture_store_shots.js:1` 目前只尝试固定几种“同意”按钮，一旦目标网页切换 cookie 弹层点击逻辑可能失败，建议把那段逻辑搬到可配置数组/超时 retry，或者做成 CLI 参数以便下次跑新的站点时更稳。
5. **补充文档/用户指南**：目前只有 Store Listing 和这份交接文档，下次可以写个 `README.md` 简要说明键位、如何“冻结/测距/清除/固定”，避免新人摸索 `CONFIG.hotkeys`（`visual-qa.js:8`）去猜。
