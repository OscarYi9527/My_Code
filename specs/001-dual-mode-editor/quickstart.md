# Quickstart: 双模式 AI 编辑器

**Date**: 2026-06-28 | **Feature**: [spec.md](./spec.md)

本指南提供端到端验证场景，证明功能可正常运行。不含完整实现代码。

## 前置条件

1. Node.js 20+, npm 10+
2. Git + Code-OSS 源码（fork/clone 到本地）
3. Claude Code 已安装并配置（~/.claude/proxy/ 可用）
4. 项目依赖安装：`npm install`
5. 后台服务运行：`npm run server:dev`（localhost:3001）

## 场景 1: 用户注册与登录 (P1)

```bash
# 1. 管理员后台生成邀请码
curl -X POST http://localhost:3001/api/admin/invitations \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"count": 1, "maxUses": 1}'

# 保存返回的 code 值

# 2. 启动 Electron 客户端
npm start

# 验证:
# - 看到登录页面，有"使用邀请码注册"入口
# - 输入邀请码 + 用户名 + 密码 → 成功进入主界面
# - 无效邀请码 → 错误提示
# - 关闭重开 → 自动恢复登录
```

**预期结果**: 登录后进入开发模式，顶部有模式切换菜单。

## 场景 2: 开发模式基础操作 (P1)

```bash
# 在开发模式下:
# 1. 左侧文件树浏览项目文件
# 2. 点击 .ts 文件 → 编辑器打开，有语法高亮
# 3. Ctrl+` → 终端面板出现
# 4. 点击 AI 图标或 Ctrl+Shift+I → AI 对话框弹出
# 5. 点击编辑器区域 → AI 对话框不消失
```

**预期结果**: 完整的 VSCode-like 体验 + AI 对话框。

## 场景 3: 简约模式 (P1)

```bash
# 1. 从菜单中选择 "切换到简约模式"
# 2. 界面变为两栏: 文件树 (左) + AI 对话框 (右)
# 3. 点击文件 → 简易编辑器显示内容在右侧
# 4. 修改文件 → 保存成功
# 5. 在 AI 对话框输入: "这个项目有什么文件" → AI 回复
```

**预期结果**: 仅文件树 + AI 对话框可见，无编辑器/终端/菜单栏。

## 场景 4: 模式切换 (P2)

```bash
# 1. 开发模式下打开 AI 对话，发送一条消息
# 2. 切换到简约模式 → 对话保持
# 3. 简约模式下查看某文件
# 4. 切换回开发模式 → 该文件在编辑器中打开
```

**预期结果**: 切换在 1 秒内完成，对话和历史不丢失。

## 场景 5: AI 对话框增强交互 (P2)

```bash
# 1. 在 AI 对话框发送含代码块的问题
# 2. 回复有语法高亮
# 3. 引用一个文件: "帮我分析 src/main.ts"
# 4. AI 回复包含文件路径链接 → 点击 → 打开对应文件
# 5. 断网 → 发送消息 → 显示错误提示，已输入内容保留
```

**预期结果**: Markdown 渲染 + 代码高亮 + 文件链接可点击。

## 场景 6: 管理员仪表盘 (P3)

```bash
# 1. 打开 http://localhost:3001/admin
# 2. 用 admin 账户登录
# 3. 查看仪表盘: 用户数、活跃度、AI 调用量
# 4. 生成邀请码 → 复制码值
# 5. 推送版本 → 客户端收到更新通知
```

**预期结果**: Web 管理后台可正常访问和操作。

## 运行命令

```bash
# 开发环境
npm run server:dev       # 启动后台服务 (watch mode)
npm start                # 启动 Electron 客户端
npm run test             # 运行全部测试
npm run test:coverage    # 覆盖率报告

# 管理后台
open http://localhost:3001/admin

# 数据库 (SQLite)
# 位置: server/data/app.db
# 重置: rm server/data/app.db && npm run server:migrate
```

## 测试参考

- 单元测试配置: `jest.config.ts` (ts-jest)
- E2E 测试配置: `test/e2e/` (Spectron 或 Playwright Electron)
- 覆盖率阈值: 80% 行覆盖 (constitution Testing Protocol)
