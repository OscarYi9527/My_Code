# AI Editor MVP 分支集成与版本治理

更新时间：2026-07-21

## 当前结论

本轮集成已经完成，不再只是候选状态：

```text
PR:           https://github.com/OscarYi9527/My_Code/pull/5
MVP merge:    52c772966c35b51e4b80497455592a2b44dbba3e
local report: .build/ai-editor-preproduction-closure/20260720T214621Z/closure-report.md
result:       24 PASS / 3 external BLOCKED / 0 FAIL
GitHub CI:    5/5 success
```

三个 `BLOCKED` 分别是账号仍处于 `password_change_required`、缺少真实 macOS
运行机、生产采购/备案/安全资源尚未就绪；不存在源码、构建、测试、Windows 打包、
PA UI 或仓库同步失败。共享 `47892` 全程保持 PID `32260` 且选定哈希未变化。

MVP 基线：

```text
origin/codex/account-gateway-mvp
```

本轮集成分支：

```text
codex/mvp-pa-creator-integration
```

PA Creator 来源：

```text
origin/feature/pa-creator-p1
465d95c447cd4eb716715fd682206c2c8a49fa77
```

PA Creator 分支从旧基线 `750de0517` 开发，比当前 MVP 少 28 个提交。因此不能用
PA 分支覆盖 MVP，也不能把 MVP 重置到 PA 分支；正确方式是以当前 MVP 为基线创建集成
分支，再用 merge commit 合入 PA 的唯一功能提交。

## 远端分支审计

2026-07-21 执行 `git fetch --all --prune --tags` 后，GitHub 远端只有 8 个引用：

| 分支 | 相对 MVP | 处理 |
| --- | --- | --- |
| `origin/codex/account-gateway-mvp` | 当前基线 | 保留为 MVP 合并目标 |
| `origin/feature/pa-creator-p1` | 落后 28、独有 1 | 本轮合入 |
| `origin/main` | 已完全包含于 MVP | 不重复合并 |
| `origin` | 与 `origin/main` 相同 | 不重复合并 |
| `origin/dependabot/.../setup-node-7` | 工作流依赖提交 | 不与产品功能混合，单独 PR |
| `origin/dependabot/.../upload-artifact-7` | 工作流依赖提交 | 不与产品功能混合，单独 PR |
| `origin/dependabot/.../cache-6` | 工作流依赖提交 | 不与产品功能混合，单独 PR |
| `origin/dependabot/.../checkout-7` | 工作流依赖提交 | 不与产品功能混合，单独 PR |

本机的 `refs/agents/.../checkpoints/...` 是 Codex 会话检查点，不是产品分支。它们只保存
会话基线或 Turn checkpoint，禁止作为 MVP 功能分支合并。

因此本轮没有发现第二个尚未进入 MVP 的产品 Bug 修复分支。历史 `main` 和已删除功能
分支中的有效修复已经位于 `codex/account-gateway-mvp` 的 70 个新增提交中。

PR #5 合并后已重新验证包含关系：`origin/main`、
`origin/feature/pa-creator-p1` 和 `origin/codex/mvp-pa-creator-integration`
均为 MVP 基线祖先。当前仅四个 Dependabot 工作流依赖分支未合入；它们必须分别
升级和验证，不能为了“分支少”而批量混入产品 MVP。

## MVP 最新版本的定义

“最新”不是把所有分支无条件合并，而是同时满足：

1. 当前 MVP 包含 `main`；
2. 每个待发布产品分支的独有提交都被分类；
3. Bug 修复和产品功能通过 PR 合入；
4. Dependabot、实验分支和会话 checkpoint 不混入产品功能提交；
5. 开发版 `out` 与 Windows 成品 `out-vscode-min` 来自同一个集成 SHA；
6. 自动闭环中所有可执行门禁为 `PASS`；
7. 云采购、生产批准、macOS 和三网络验收等不可伪造条件保持 `BLOCKED`。

## 后续固定流程

每次准备 MVP 更新时：

```powershell
git fetch --all --prune --tags
git switch codex/account-gateway-mvp
git pull --ff-only
git switch -c codex/mvp-integration-<日期或功能>
```

然后逐个审计候选分支：

```powershell
git rev-list --left-right --count `
  origin/codex/account-gateway-mvp...origin/<候选分支>

git log --oneline `
  origin/codex/account-gateway-mvp..origin/<候选分支>

git diff --stat `
  origin/codex/account-gateway-mvp...origin/<候选分支>
```

只合入已经确认属于 MVP 的独有提交：

```powershell
git merge --no-ff origin/<候选分支>
```

禁止：

- `reset --hard` 到功能分支；
- 强制推送；
- 将全部分支批量 merge；
- 合并 `refs/agents`；
- 用旧功能分支覆盖较新的账号、Proxy、会话或产品构建修复。

## 发布门禁

集成分支推送后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  D:\AI_prejoct\My_code\scripts\verify-ai-editor-preproduction-closure.ps1 `
  -GatewayOrigin <当前预发布 HTTPS Gateway>
```

PA Creator 额外自动验证：

- PA/Registry/Publication/Runtime 定向 Electron 测试；
- 开发版 PA Plaza 和九 AA Creator CDP 验证；
- Windows 成品 PA Plaza 和 Creator CDP 验证；
- 首次强制确认后从 AA-01 前进；
- 截图、JSON、Markdown 和共享 Proxy 不变量证据。

只有自动报告 `FAIL=0` 才允许创建合并到 MVP 基线的 PR。`BLOCKED` 只允许来自已明确
记录的外部条件，不能来自构建、单测、产品打包或 PA UI。
