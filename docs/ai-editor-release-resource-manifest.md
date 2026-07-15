# AI Editor 发布资源清单

本文档是 Windows/macOS 产品打包的资源契约。构建和安装脚本必须从明确的源码/制品
来源组装这些资源，不得把开发者个人运行目录直接打入安装包。

## 1. Code-OSS 应用资源

| 资源 | Windows 目标 | macOS 目标 | 来源 |
| --- | --- | --- | --- |
| Workbench 产物 | `resources/app/out` | `Contents/Resources/app/out` | `out-vscode-min` |
| 产品配置 | `resources/app/product.json` | `Contents/Resources/app/product.json` | 打包阶段生成 |
| Node 运行时依赖 | `resources/app/node_modules.asar*` | `Contents/Resources/app/node_modules.asar*` | 根依赖打包 |
| 简体中文语言包 | `resources/app/extensions/vscode-language-pack-zh-hans` | 同应用资源目录 | 内置扩展 |
| Codex JS 启动器 | `resources/app/node_modules/@openai/codex` | 同应用资源目录 | 固定版本 npm 包 |
| Codex 原生运行时 | `@openai/codex-win32-<arch>` | `@openai/codex-darwin-<arch>` | 平台 npm 包 |

Codex 原生二进制必须保持 ASAR 解包，确保 Agent Host 可以直接执行。

## 2. Proxy 运行时制品

源码仓库：

```text
https://github.com/OscarYi9527/codex_proxy
```

建议目标：

```text
Windows: resources/app/ai-editor-proxy/
macOS:   Contents/Resources/app/ai-editor-proxy/
```

`AiEditorProxyMainService` 同时兼容应用资源同级的
`resources/ai-editor-proxy/`；发布管线应固定使用一个目标，不应在同一安装包重复放置。

### 必需内容

```text
ai-editor-proxy/
├─ src/**
├─ node_modules/**        # 仅生产依赖
├─ package.json
├─ package-lock.json
├─ LICENSE
├─ ThirdPartyNotices.txt  # Proxy 生产依赖的第三方声明
└─ release-manifest.json
```

`release-manifest.json` 至少包含：

```json
{
  "schemaVersion": 1,
  "name": "codex_proxy",
  "version": "<package version>",
  "commit": "<40-char git commit>",
  "builtAt": "<ISO-8601 UTC>",
  "platform": "win32-x64",
  "entryPoint": "src/server.js",
  "files": {
    "src/server.js": "<SHA-256 hex>"
  }
}
```

### 必须排除

```text
config*.json
.config-backups/**
.account-backups/**
*.log
.auth-debug.log
auth.json
stats*.json
provider-health*.json
route-decisions*.json
node_modules/.cache/**
.git/**
.github/**
tests/**
coverage/**
```

还必须排除任何 access token、refresh token、API Key、账号 ID、用户邮箱、请求正文、
提示词、文件内容和本机绝对路径。

## 3. 用户数据边界

安装包升级不得覆盖 Proxy 的可变用户数据。Proxy 的配置、凭据、统计和备份必须继续
存放在用户数据目录，而不是安装目录。

| 数据 | 安装/升级行为 |
| --- | --- |
| Proxy 程序文件 | 可替换；非后台升级前清除安装目录中的旧程序文件 |
| 上游配置和模型勾选 | 保留 |
| ChatGPT 账号与 API Key | 保留 |
| 本地统计和健康历史 | 保留 |
| 管理平台浏览器偏好 | 保留 |
| 运行日志 | 保留或按轮转策略清理，不进入安装包 |

## 4. 构建输入契约

Code 仓库和 Proxy 仓库是两个独立版本源。发布流水线需要：

1. checkout 固定的 Code commit；
2. checkout 固定的 `codex_proxy` commit；
3. 在隔离目录执行 Proxy 生产依赖安装和测试；
4. 依据本清单生成干净 Proxy 制品；
5. 将制品复制到 Code 产品资源目录；
6. 生成 checksum 和第三方许可证；
7. 在无预装 Proxy 的干净用户环境验证首次启动。

本地开发可通过 `VSCODE_AI_EDITOR_PROXY_ROOT` 指向 Proxy 源码验证自动启动，但该环境
变量不是发布安装架构，也不能作为安装包缺少 Proxy 制品的替代方案。

## 5. Windows 验收

- `Code - OSS.exe` 能在 Proxy 未运行时后台启动安装包内 `src/server.js`。
- Proxy 窗口隐藏，Code 退出后 Proxy 保持运行。
- `/live`、`/ready`、`/v1/models` 和真实 `/v1/responses` 请求通过。
- `product.json` 中全部 checksum 与产品文件匹配。
- 安装目录扫描不包含“必须排除”项和常见凭据格式。
- 用户级和系统级安装器在编译前重新校验捆绑 Proxy 的平台、文件集合和逐文件
  SHA-256。
- 重复安装会移除旧 Proxy 程序目录后写入新版本，但不读取、删除或覆盖安装目录外的
  `~/.claude/proxy`。

## 6. macOS 验收

- x64/arm64 对应 Codex 原生包正确。
- Proxy 能从 `.app` 内资源目录后台启动，不依赖开发者 shell 环境。
- 退出所有 Code 窗口后 Proxy 仍可服务其他 Codex 客户端。
- 签名、公证和升级后资源完整性不被破坏。

## 7. 当前状态（2026-07-15）

- Windows 成品已包含 Workbench、中文语言包和 Codex Agent Host 运行时。
- Windows 成品已包含
  `resources/app/ai-editor-proxy/src/server.js`、生产依赖和带逐文件 SHA-256 的
  `release-manifest.json`。
- 隔离产品实例已在备用端口从安装目录自动启动 Proxy；关闭 Code 后该 Proxy 继续
  存活，验证了共享服务生命周期。
- Proxy 程序目录与可写用户数据目录已分离，配置和凭据不写入安装目录。
- Windows 用户级和系统级 Inno Setup 安装器已生成；用户级安装器已通过隔离首次安装、
  重复安装和卸载测试。
- 重复安装会清除旧 Proxy 程序哨兵；配置、账号、API Key、统计和备份哨兵在安装、
  升级及卸载后的 SHA-256 均保持不变。
- Proxy 制品现在强制包含 `ThirdPartyNotices.txt`，当前声明生产依赖
  `undici 8.7.0` 的 MIT 许可证；主产品声明继续包含 Codex 的 Apache-2.0 许可证。
- Windows 发布验收会生成成品、两个安装器和必需资源的版本/SHA-256 清单，并同时验证
  已配置 Proxy 与空数据首次启动。
- G02/G03 Windows 安装升级及发布验收闭环已完成；发布流水线仍需加入固定 commit 的
  双仓库 checkout，macOS 制品和安装升级验证留待后续平台阶段。
