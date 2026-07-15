# AI Editor Windows 发布候选验收

`scripts/verify-ai-editor-windows-release.ps1` 是 Windows x64 发布候选的统一阻断脚本。
它只使用 loopback Proxy，不会停止或重启共享 `47892` Proxy。

## 默认验收

先完成 Proxy 制品、Code 成品和两个安装器构建，然后执行：

```powershell
Set-Location D:\AI_prejoct\My_code
npm run verify-ai-editor-windows-release
```

默认流程验证：

1. Windows 成品、用户级安装器和系统级安装器存在并生成 SHA-256。
2. `product.json` 中全部 Workbench checksum 与实际文件匹配。
3. 成品包含 Codex Agent Host、Codex JS/Windows x64 运行时、简体中文语言包和 Proxy。
4. Proxy `release-manifest.json` 的版本、平台、文件集合和逐文件 SHA-256 匹配。
5. 主产品 `ThirdPartyNotices.txt` 包含 Codex 声明；Proxy
   `ThirdPartyNotices.txt` 包含 `undici` 声明。
6. 已配置共享 Proxy 的 `/live`、`/ready`、`/v1/models` 和 `/admin` 正常。
7. 使用全新 Code 用户目录、全新 Proxy 数据目录和备用端口启动 Windows 成品：
   - Code 自动启动安装目录内 Proxy；
   - `/live` 和 `/admin` 可访问；
   - 未配置上游时 `/ready` 返回 `503 unavailable`，`/v1/models` 返回空目录；
   - 关闭 Code 后该备用端口 Proxy 继续存活；
   - 验证后只终止该备用测试 Proxy。

报告写入：

```text
.build/ai-editor-release/windows-x64-release-report.json
.build/ai-editor-release/windows-x64-release-report.md
```

JSON 报告包含 Code、Proxy、Codex 和语言包版本，成品/安装器 SHA-256，必需资源清单，
产品完整性结果、端点结果和干净首次启动结果。报告不记录账号、Token、API Key、请求
正文或完整模型回复。

## 真实 Responses API 验收

需要验证一个 ChatGPT Subscription 模型和一个非订阅模型时执行：

```powershell
npm run verify-ai-editor-windows-release -- -RunResponseTests
```

脚本默认从 `/v1/models` 自动选择：

- 第一项 `owned_by=chatgpt-sub` 的模型；
- 第一项非订阅模型，优先顺序为 DeepSeek、OpenAI API、Relay。

也可显式指定：

```powershell
npm run verify-ai-editor-windows-release -- `
  -RunResponseTests `
  -SubscriptionModel gpt-5.6-sol `
  -NonSubscriptionModel deepseek-v4-pro
```

测试只发送 `Reply only with OK.`，并在报告中保留状态码、耗时、路由响应头和最多
120 字符的输出预览。

## 可选参数

```text
-ProductRoot <path>              指定 Windows 解包成品目录
-UserSetupPath <path>            指定用户级安装器
-SystemSetupPath <path>          指定系统级安装器
-ConfiguredProxyBaseUrl <url>    指定已配置的 loopback Proxy
-ReportPath <path>               指定 JSON 报告位置
-SkipCleanStart                  只验证静态资源和已配置 Proxy
-KeepCleanStartArtifacts         保留干净首次启动的隔离目录和日志
```

任一必需资源缺失、许可证声明缺失、checksum 不匹配、端点异常或干净首次启动失败都会以
非零退出码阻止发布。
