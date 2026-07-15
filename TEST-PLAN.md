# AI Editor MVP 测试计划

## 1. 构建面

每项 AI Editor UI 或运行时变更都必须覆盖两个构建面。

### 开发版

```powershell
Set-Location D:\AI_prejoct\My_code
npm run typecheck-client
npm run compile
.\scripts\code.bat `
  --user-data-dir D:\AI_prejoct\My_code\.tmp-codeoss-user-data `
  --extensions-dir D:\AI_prejoct\My_code\.tmp-codeoss-extensions `
  D:\AI_prejoct\My_code
```

### Windows 成品

```powershell
Set-Location D:\AI_prejoct\My_code
npm run core-ci
$env:Path = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64;' + $env:Path
npm run gulp vscode-win32-x64-min-ci
& 'D:\AI_prejoct\VSCode-win32-x64\Code - OSS.exe' `
  --user-data-dir D:\AI_prejoct\My_code\.verify-product-user-data `
  --extensions-dir D:\AI_prejoct\My_code\.verify-product-extensions `
  D:\AI_prejoct\My_code
```

不要同时复用同一个用户目录或扩展目录。验证结束只关闭本轮 Code 实例，不关闭共享
Proxy。

## 2. Proxy 前置检查

```powershell
Invoke-RestMethod http://127.0.0.1:47892/live
Invoke-RestMethod http://127.0.0.1:47892/ready
(Invoke-RestMethod http://127.0.0.1:47892/v1/models).data |
  Select-Object id, owned_by
```

期望：

- `/live` 返回 200；
- `/ready` 可区分 Ready 与未配置状态；
- 模型目录来自 Proxy 当前配置，不是 Code 静态模型列表；
- Code 退出后 `/live` 仍正常。

共享 Proxy 如需重启，必须先获得用户明确批准，然后只执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  D:\AI_prejoct\My_code\scripts\restart-ai-proxy.ps1
```

## 3. 手动功能用例

### TC-01 首次打开 AI Chat

1. 使用隔离用户目录启动 Code。
2. 确认 AI Chat 位于 Code 主窗口的 Editor Area，不打开独立 Agents Window。
3. 未发送消息前打开模型选择器。
4. 确认模型已来自 `/v1/models`，并存在“刷新模型目录”入口。
5. 确认无需 ChatGPT/Copilot 登录即可使用 External Local Proxy。

### TC-02 模型与真实对话

1. 选择一个 ChatGPT Subscription 模型，发送 `Reply only: OK`。
2. 确认原生流式回复完成。
3. 选择一个 DeepSeek、OpenAI API 或 Relay 模型重复验证。
4. 触发模型目录手动刷新，确认不会重启 Proxy。
5. 上游不可用时确认错误快速显示，不长期停留在 Working/Thinking。

### TC-03 中文输入

1. 聚焦 Chat 输入框。
2. 使用 Windows 中文输入法输入中文。
3. 确认系统候选框显示在输入光标附近。
4. 上屏、退格、换行和发送行为正常。

### TC-04 模式切换确认

1. 点击标题栏“切换 AI Editor 模式”。
2. 确认下拉项为“切换到开发模式”和“切换到简约模式”。
3. 选择目标模式，确认出现“是否切换到…模式？”。
4. 选择“否”，确认布局不变。
5. 再次选择并点击“确认”，确认布局完成切换。

### TC-05 开发模式

确认：

- 顶部菜单和标题栏可见；
- Activity Bar 可见；
- Explorer/Side Bar 可见；
- 文件编辑器、终端、调试和扩展入口保持原生能力；
- Codex Chat Editor 与文件标签可关闭、拖拽和分屏。

### TC-06 简约模式

确认：

- Activity Bar 隐藏；
- Explorer/Side Bar 保留；
- Panel 与 Auxiliary Bar 隐藏；
- Editor Area 保留并打开同一个 Codex 会话；
- 顶层菜单仅剩 `File`，其子菜单仅剩 `Open Folder...`；
- 切换期间 Console 不出现 editor disposed、pane activation 或布局并发错误。

### TC-07 会话恢复和历史任务

1. 新建至少两个 Codex 对话并分别发送消息。
2. 验证历史对话入口显示当前工作区任务及创建时间。
3. 验证切换、重命名、归档、恢复和删除。
4. 关闭并重新打开工作区，确认自动恢复最近使用的会话。
5. 在开发/简约模式之间切换，确认 Session URI 和历史内容不变。

### TC-08 权限基线

确认默认状态：

- 工作区内允许写入；
- 工作区外禁止写入；
- 网络默认关闭；
- 高风险命令和删除/覆盖大量文件需要确认；
- 高级设置可以收紧权限，但不能静默放宽到完全访问。

### TC-09 中断恢复

1. 在测试工作区预先准备 staged、unstaged 和 untracked 改动。
2. 让 AI 修改另一文件并执行可识别的工具。
3. 模拟 app-server/Proxy 中断。
4. 已确认未转发的 Turn 最多自动重试一次。
5. 已转发或不确定的 Turn 不自动重放，显示“检查状态并继续”。
6. 点击后确认新 Turn 先检查 `git status --short` 和聚焦 diff。
7. 确认预先存在的用户改动未被归因、覆盖或删除。

### TC-10 Proxy 生命周期

1. Proxy 已健康时启动 Code，确认复用现有 PID。
2. 关闭 Code，确认 Proxy 继续运行。
3. 在无 Proxy 的干净发布环境启动 Code，确认后台启动安装包内 Proxy。
4. 连续启动失败三次后确认 AI 会话暂停并显示修复提示。
5. 打开 Proxy 管理平台并完成配置后，确认 Code 可恢复为 Ready。

### TC-11 Windows 安装与升级

1. 分别构建 Windows 用户级和系统级 Inno Setup 安装器。
2. 使用用户级安装器安装到隔离目录，确认 Code、Codex Agent Host、简体中文语言包和
   `resources/app/ai-editor-proxy` 均存在。
3. 在安装目录的 Proxy 程序目录加入旧版本哨兵文件；在安装目录外的隔离
   `CODEX_PROXY_DATA_DIR` 写入配置、账号、API Key、统计和备份哨兵。
4. 用同一安装器重复安装模拟升级，确认旧程序哨兵被删除、捆绑 Proxy 清单仍校验通过。
5. 确认用户数据目录在首次安装、升级和卸载后的逐文件 SHA-256 均未变化。
6. 确认整个过程不停止或重启共享 `47892` Proxy。

## 4. 自动化回归

最低检查：

```powershell
npm run typecheck-client
.\scripts\test.bat --run src/vs/workbench/contrib/aiEditorMode/test/browser/aiEditorMode.contribution.test.ts
npm run compile
npm run core-ci
```

发布候选还应运行：

- Agent Host/Proxy 服务定向测试；
- Codex app-server RPC 与事件映射测试；
- 会话恢复、归档和删除测试；
- Git checkpoint 真实仓库集成测试；
- Windows 产品打包与 `product.json` checksum 校验；
- Windows 用户级/系统级安装器编译与隔离升级保留测试；
- 隔离 Electron UI 自动化。

Windows x64 发布候选统一阻断命令：

```powershell
npm run verify-ai-editor-windows-release -- `
  -RunResponseTests `
  -SubscriptionModel gpt-5.6-sol `
  -NonSubscriptionModel deepseek-v4-pro
```

该命令必须生成 `PASS` 的 JSON/Markdown 报告，并确认备用端口测试 Proxy 已清理、共享
`47892` Proxy 仍为 `ok`。正式用户级安装器还需安装到隔离目录后，以该安装目录再次
执行不带 `-RunResponseTests` 的干净首次启动验收。

## 5. 发布阻断条件

以下任一情况阻止发布：

- 安装包未包含 Proxy 干净运行时制品；
- 安装包从开发者个人目录复制账号、API Key、日志、统计或备份；
- 开发版和 Windows 成品行为不同步；
- 首次打开无法选择 Proxy 模型；
- AI Chat 依赖 ChatGPT/Copilot 登录；
- Code 退出会终止共享 Proxy；
- 502/409 等错误被无限自动重试；
- 模式切换导致 Chat 会话丢失或 Workbench editor disposal 错误；
- 产品 checksum 不匹配。
