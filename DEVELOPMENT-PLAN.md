# Code-OSS 魔改开发计划

## 当前结论

本项目最终目标不是维护 `electron-app/` 手写原型，而是在 Code-OSS / VS Code 原生 workbench 上做定制：保留 VS Code 的 Explorer、Editor Part、Tabs、Layout、Terminal、Extensions 等成熟能力，只新增双模式入口、简约模式布局和基于 Codex 插件的 AI 对话能力。

## 阶段 0：冻结原型

- `electron-app/` 仅保留为交互验证原型。
- 不再继续在 `electron-app/renderer/app.js` 上补 VS Code 级能力。
- 原型中可复用的产品结论：
  - AI 对话应与文件标签同属 Editor Area。
  - 简约模式需要保留文件树和 AI/文件查看编辑区域。
  - 标签需要支持关闭、拖拽排序。
  - 视图尺寸需要可拖动。

## 阶段 1：Code-OSS 构建环境恢复

目标：根目录 Code-OSS 能完成依赖安装、编译并启动。

任务：
1. 修复 `npm install` 失败问题，重点处理 `@vscode/spdlog`、`@vscode/sqlite3` native module。
2. 确认 Windows 构建前置条件：Python、Visual Studio Build Tools、MSVC、Windows SDK、node-gyp。
3. 使用项目 `.nvmrc` 对齐 Node 版本。
4. 成功执行：
   - `npm install --legacy-peer-deps`
   - `npm run compile-client`
   - `scripts\code.bat` 或等价启动命令

验收：能打开原生 VS Code / Code-OSS workbench。

## 阶段 2：定位 Workbench 定制点

目标：只改 VS Code 原生 workbench，不重写基础 UI。

重点目录：

```text
src/vs/workbench/browser/
src/vs/workbench/contrib/
src/vs/workbench/services/
src/vs/code/
```

需要调研：
- LayoutService / WorkbenchLayout
- Activity Bar / Sidebar / Panel / Editor Part
- ViewContainer / ViewPane / Composite
- EditorInput / EditorPane
- Commands / Menus / Keybindings

产出：`docs/workbench-customization-map.md`，记录具体改造入口。

## 阶段 3：新增产品模式服务

目标：在 VS Code 内建立 `dev` / `simple` 模式状态，而不是通过外部 Electron UI 控制。

计划新增：

```text
src/vs/workbench/services/aiEditorMode/
```

能力：
- 当前模式：`dev | simple`
- 模式切换命令
- 状态持久化到 VS Code storage
- 菜单/命令面板入口

验收：在原生 VS Code 中可通过命令切换模式，并持久保存。

## 阶段 4：实现简约模式布局

目标：复用 VS Code 原生 Explorer 与 Editor Area，隐藏非必要区域。

简约模式行为：
- 保留 Explorer / 文件树。
- 保留 Editor Area。
- 隐藏 Activity Bar 非核心入口、Terminal、Debug、Extensions 等高级开发入口。
- AI Chat 作为 Editor Tab 或 View，与文件标签同一区域。

验收：用户切换到简约模式后，界面只保留文件树 + AI/文件编辑区域，且 VS Code 原生标签、拖拽、关闭、分屏能力仍可用。

## 阶段 5：Codex AI 对话集成

目标：在 VS Code 原生 Editor/View 系统中接入 Codex 插件能力，并复用其本地能力边界与会话机制。

计划：
- 新增 AI Chat contribution。
- AI Chat 可作为 Editor Tab 打开。
- 支持文件上下文。
- 支持流式输出。
- 优先复用 Codex 插件/本地能力的已有会话与存储机制，不自行存完整对话。

验收：AI Chat 可以和文件标签并列、可拖拽、可关闭、可分屏。

## 阶段 6：后台服务接入

目标：将已有 `server/` 认证、邀请码、管理后台接到原生 workbench。

任务：
- 登录状态与 VS Code 启动流程集成。
- 静默续期。
- 管理后台保留 Web 服务。
- UsageRecord / VersionUpdate / SkillPublication 数据模型补齐。

验收：首次启动要求登录，之后长期保持登录；管理员可生成邀请码、查看统计、推送版本。

## 阶段 7：测试与发布准备

任务：
- TypeScript typecheck。
- Workbench 单元测试。
- Electron smoke test。
- 后台 API 测试。
- Windows/macOS 启动验证。

验收：核心路径可跑通：登录 → 打开项目 → 开发模式 → 简约模式 → AI Chat → 文件上下文 → 管理后台。
