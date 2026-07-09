# Workbench 定制地图：双模式 AI Editor

本文档用于把当前产品目标落到 Code-OSS / VS Code 原生 Workbench 的扩展点上。原则是：保留 VS Code 已成熟的 Explorer、Editor Part、Tabs、Split、Drag & Drop、命令、菜单、快捷键和布局服务，只新增产品模式、简约布局控制与基于 Codex 插件的 AI Chat Editor。

## 1. 总体路线

- 不再把 `D:\AI_prejoct\My_code\electron-app` 作为产品主线；它只作为交互原型参考。
- 产品代码应进入 `D:\AI_prejoct\My_code\src\vs\workbench` 下的原生 Workbench 层。
- 第一阶段只做低风险贡献点：命令 + 持久化状态 + 通知，验证贡献链路正确。
- 第二阶段再抽象服务并接入布局控制，避免一开始修改核心布局代码。

## 2. 关键目录与用途

| 目录/文件 | 用途 | 本项目用法 |
| --- | --- | --- |
| `D:\AI_prejoct\My_code\src\vs\workbench\workbench.common.main.ts` | Workbench 公共贡献入口 | import 新增 contribution，使桌面/Web 公共 workbench 可加载双模式能力 |
| `D:\AI_prejoct\My_code\src\vs\workbench\contrib\*` | 功能贡献层 | 新增 `aiEditorMode` contribution，注册命令、菜单、后续 AI Editor |
| `D:\AI_prejoct\My_code\src\vs\workbench\services\*` | Workbench 服务层 | 后续新增 `aiEditorMode` 服务，提供 `dev/simple` 状态与事件 |
| `D:\AI_prejoct\My_code\src\vs\workbench\services\layout\browser\layoutService.ts` | Workbench Part 显隐、尺寸、布局服务 | 简约模式通过公开服务/API 控制 Activity Bar、Panel、Side Bar 等，不直接操作 DOM |
| `D:\AI_prejoct\My_code\src\vs\workbench\browser\parts\editor\*` | Editor Part、Tabs、Groups、拖拽、分屏 | AI Chat 应作为 Editor 打开，复用原生标签、拖拽、关闭、分屏 |
| `D:\AI_prejoct\My_code\src\vs\workbench\common\editor\editorInput.ts` | EditorInput 基类 | 后续实现 AI Chat EditorInput |
| `D:\AI_prejoct\My_code\src\vs\workbench\browser\parts\editor\editorPane.ts` | EditorPane 基类 | 后续实现 AI Chat EditorPane |
| `D:\AI_prejoct\My_code\src\vs\workbench\common\views.ts` | ViewContainer/ViewPane 注册模型 | 如果 AI 作为侧边栏/面板视图时使用；当前优先 EditorInput |
| `D:\AI_prejoct\My_code\src\vs\platform\actions\common\actions.ts` | 命令/菜单/Action2 | 注册 `AI Editor: Toggle Simple Mode` 等命令 |
| `D:\AI_prejoct\My_code\src\vs\platform\storage\common\storage.ts` | StorageScope/StorageTarget | 持久化当前产品模式 |
| `D:\AI_prejoct\My_code\src\vs\platform\notification\common\notification.ts` | 通知服务 | 切换模式后给用户反馈 |

## 3. 双模式服务设计

推荐新增服务目录：

```text
D:\AI_prejoct\My_code\src\vs\workbench\services\aiEditorMode\common\aiEditorMode.ts
D:\AI_prejoct\My_code\src\vs\workbench\services\aiEditorMode\browser\aiEditorModeService.ts
```

服务职责：

- 当前模式：`dev | simple`。
- 从 `IStorageService` 读取/写入模式。
- 暴露 `onDidChangeMode` 事件。
- 暴露 `getMode()`、`setMode(mode)`、`toggleMode()`。
- 不直接控制 DOM；布局变更由单独 contribution 监听模式变化后调用 Workbench 服务完成。

第一步为了降低风险，可先在 contribution 内直接用 `IStorageService` 做最小命令验证；验证通过后再抽服务。

## 4. 命令与菜单入口

使用 `registerAction2` 注册命令。模式切换命令：

```text
aiEditor.toggleSimpleMode
```

用户可在 Command Palette 中搜索：

```text
AI Editor: Toggle Simple Mode
```

实现位置建议：

```text
D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiEditorMode\browser\aiEditorMode.contribution.ts
```

命令行为：

1. 读取 storage 中的当前模式。
2. `dev -> simple` 或 `simple -> dev`。
3. 写回 storage。
4. 显示本地化通知。

## 5. AI Chat 表面选择（Codex 插件）

### 推荐：EditorInput + EditorPane

原因：用户明确要求 AI 对话窗口和文件窗口“是一类窗口”，并且当前产品要求 AI 对话由 Codex 插件承载，可以互相叠加、拖拽、关闭、左右分屏。这些能力都属于 VS Code Editor Part，而不是普通 DOM 面板。

后续实现路径：

```text
D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiChatEditor\common\aiChatEditorInput.ts
D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiChatEditor\browser\aiChatEditorPane.ts
D:\AI_prejoct\My_code\src\vs\workbench\contrib\aiChatEditor\browser\aiChatEditor.contribution.ts
```

打开 AI Chat 时使用 `IEditorService.openEditor(...)`，不要直接调用 `IEditorGroupsService.activeGroup.openEditor(...)`。

### 备选：ViewPane / ViewContainer

如果后续需要一个类似 VS Code Chat 侧边栏的常驻面板，可以注册 ViewContainer/ViewPane。但它不适合作为“和文件标签同类”的主实现。

## 6. 简约模式布局控制

简约模式不应重写 Workbench，而应组合已有能力：

- 保留 Explorer 对应的 Side Bar。
- 保留 Editor Part。
- 隐藏或弱化 Activity Bar、Panel、Status Bar、Debug/Extensions/Search 等高级入口。
- AI Chat Editor 可以自动打开并 pin；但不要破坏用户手动关闭/分屏/拖拽。

需要调研和调用的服务/命令：

- `IWorkbenchLayoutService`：控制 parts 显隐、布局。
- `IEditorService`：打开 AI Chat Editor。
- `IViewsService` / ViewContainer registry：必要时显示 Explorer。
- `IStorageService`：持久化模式。
- Context Key：后续可用 `aiEditorMode == simple` 控制菜单/视图可见性。

## 7. 后台与登录接入边界

后台服务仍保留在：

```text
D:\AI_prejoct\My_code\server
```

Workbench 侧不应存储用户具体业务数据或完整对话，只存：

- 登录凭证/刷新 token。
- 模式偏好。
- 必要的计量/版本/skill 市场元数据。

AI 对话能力来源应从“旧的 Claude Code 插件/代理方案”调整为“Codex 插件/本地能力”。后续设计需优先研究 Codex 插件在 VS Code / Code-OSS 中的接入边界、会话持久化、命令桥接和文件上下文传递方式。

登录不要频繁触发：后续应使用安全存储 + refresh token 静默续期，首次失败或 refresh 失效时再展示登录。

## 8. 命名约定（Codex 对齐）

为避免后续继续混入旧的 Claude 命名，后续新增或重构时统一采用下列命名：

- 服务/桥接：
  - `codex-bridge.ts`
  - `codexChatService.ts`
  - `ICodexClient`
- 目录/模块：
  - `codex`
  - `codexChat`
  - `codexBridge`
- 文档表述：
  - 使用“Codex 插件”“Codex 本地能力”“Codex 桥接”
  - 不再新增 “Claude proxy / Claude Code bridge” 表述

说明：

- 现有仓库如果仍存在 `claude-*` 的历史文件名，视为遗留实现名，不代表最新产品方向。
- 后续代码层重构时，优先把新增代码按 `Codex` 体系命名；历史文件是否批量重命名，可作为单独整理任务执行。

## 9. 分阶段验收

1. 原生命令可用：Command Palette 能执行 `AI Editor: Toggle Simple Mode`，并显示模式切换通知。
2. 服务化：模式状态有服务、事件、持久化、测试。
3. 简约布局：切换后保留 Explorer + Editor Part，隐藏高级入口。
4. AI Chat Editor：AI Chat 以 Editor Tab 打开，支持拖拽、关闭、分屏。
5. 登录/后台：首次登录、静默续期、管理员后台、版本更新、skill 市场。
