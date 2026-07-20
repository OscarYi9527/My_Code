# AI Editor 自动验证闭环

更新时间：2026-07-21

## 目标

将原来依赖 Oscar 逐项点击、观察日志和手工记录的预发布验收，收口为一个可重复执行的自动门禁。门禁输出三种结果：

- `PASS`：本次要求的技术门禁全部通过，且没有外部前置条件；
- `BLOCKED`：已执行的技术门禁没有回归，但账号状态、云资源、备案、生产批准、macOS 运行机或被明确跳过的门禁仍未满足；
- `FAIL`：代码、构建、产品、真实 UI、真实模型链路或运行时隔离出现回归。

`BLOCKED` 不是测试失败，也不能被伪装成 `PASS`。

## 一条命令

当前公网预发布拓扑的完整 Windows 闭环：

```powershell
Set-Location 'D:\AI_prejoct\My_code'

powershell -NoProfile -ExecutionPolicy Bypass -File `
  .\scripts\verify-ai-editor-preproduction-closure.ps1 `
  -ProxyRepository 'D:\AI_prejoct\codex_proxy-provider-worker' `
  -ProductRoot 'D:\AI_prejoct\VSCode-win32-x64' `
  -GatewayOrigin 'https://hour-hosts-sega-troy.trycloudflare.com' `
  -EdgeDataRoot 'D:\AI_prejoct\codex_proxy-provider-worker\.ai-editor-dev\public-preview-client' `
  -EdgeNonceFile 'D:\AI_prejoct\codex_proxy-provider-worker\.ai-editor-dev\public-preview-client\edge-local-nonce.secret'
```

也可以使用：

```powershell
npm run verify-ai-editor-preproduction-closure -- `
  -GatewayOrigin 'https://hour-hosts-sega-troy.trycloudflare.com'
```

Quick Tunnel 地址变化后必须传入新地址。脚本不会猜测或写入一个虚假的 Gateway。

## 自动执行内容

1. 记录共享 Proxy `47892` 的 PID、`/live`、程序哈希和选定数据哈希。
2. 拉取两个仓库的远端引用，检查工作区干净且当前 HEAD 与 upstream 一致。
3. 对两个仓库执行高置信度密钥扫描；报告只记录规则名和文件路径，不记录命中的正文。
4. 通过仓库生命周期脚本临时释放预发布 Edge，执行服务器 `npm run release:check`，再按原数据目录和 Gateway 地址恢复 Edge。
5. 执行 Code 开发构建 `npm run compile`。
6. 执行 AI Editor Account、Proxy Electron 定向测试和合同测试。
7. 执行 `npm run core-ci` 和 Windows 产品打包，更新 `D:\AI_prejoct\VSCode-win32-x64`。
8. 执行 Windows 成品 checksum、依赖、干净启动和 Proxy 生命周期验证。
9. 通过 CDP 自动启动隔离 Code，检查真实账号状态和固定管理路由。
10. 查询安全账号状态；仅当状态为 `ready` 时发送真实 SSE Turn。`password_change_required` 等状态返回 `BLOCKED`，不会误发请求。
11. 生成一份生产决策副本，自动填入两个仓库的 commit 和本轮技术门禁结果，再执行生产预检。
12. 结束时重新检查共享 Proxy 不变量，并确认预发布 Edge 已恢复。

真实 SSE 验证器已支持“本机 Edge `47921` → 外部 HTTPS Gateway”的预发布拓扑。它不会在报告中保存 Prompt、回复、nonce、ticket、Token 或账号凭据。

## 证据位置

每次执行生成独立目录：

```text
D:\AI_prejoct\My_code\.build\ai-editor-preproduction-closure\<UTC 时间>\
```

主要文件：

- `closure-report.json`：机器可读总报告；
- `closure-report.md`：人员可读总报告；
- `logs\`：脱敏后的步骤日志；
- `artifacts\`：Windows、真实 UI、真实 SSE 和生产预检子报告；
- `.build\ai-editor-preproduction-closure\latest.json` / `latest.md`：最近一次结果。

退出码：

- `0`：`PASS`
- `1`：`FAIL`
- `2`：`BLOCKED`

CI 或本地调度器应分别处理三个退出码，不能把 `2` 当成代码回归，也不能把它转成发布成功。

## 可替代人工的部分

| 原人工动作 | 自动替代 |
| --- | --- |
| 打开开发版、查看账号提示 | CDP 启动隔离 Code 并读取安全状态文案 |
| 点击“修改密码”、确认页面 | CDP 检查固定 `/admin#security` 管理路由 |
| 看模型是否可用 | Edge `/v1/models` 真实目录检查 |
| 手工发一条消息 | 账号为 `ready` 时自动执行 SSE Turn 并等待 `response.completed` |
| 比较两个版本是否同步 | 自动构建开发版和 Windows 成品并校验 checksum |
| 担心测试影响共享 Proxy | 前后比较 PID、健康状态和哈希 |
| 手工汇总测试结果 | 自动生成 JSON、Markdown 和脱敏日志证据 |

## 不能伪造的人工或外部条件

以下事项可由脚本检查结果，但不能在本机上“模拟完成”：

1. 云厂商、地区、KMS、PostgreSQL 和对象存储的采购与授权；
2. ICP 备案、正式域名、证书和 WAF 的真实生效；
3. 生产发布和安全批准；
4. 真实 macOS Keychain、签名、安装和运行验收；
5. T138 的 72 小时、三张独立网络、20 次 SSE 和 30 分钟连接验收。

T138 后续应由 Windows 主机、国内云探针和独立移动网络探针定时上报同一证据格式。三张真实网络尚未接入前，结果必须保持 `BLOCKED`。

## 安全边界

- 脚本永不停止或重启共享 Proxy `47892`。
- 预发布 Edge 只通过 `codex_proxy` 仓库的 `start-ai-editor-dev.ps1` / `stop-ai-editor-dev.ps1` 管理。
- nonce 只从指定文件读取，不进入命令行、JSON、Markdown或最终日志。
- 原始命令日志在写入证据前执行脱敏，随后删除。
- 报告不保存邮箱、Prompt、AI 回复、API Key、Token、数据库 URL、证书正文或 Provider 凭据。
- macOS、生产云和三网络验收缺失时保持 `BLOCKED`，不会为了完成任务清单而伪造通过。
