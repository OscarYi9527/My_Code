# IPC Channels: 双模式 AI 编辑器

**Date**: 2026-06-28 | **Feature**: [spec.md](../spec.md)

Electron 主进程与渲染进程之间的 IPC 通道契约。所有通信使用 `ipcMain`/`ipcRenderer` 的 `invoke`/`handle` 模式（请求-响应），事件推送使用 `send`/`on` 模式。

## 通道命名规范

- 格式: `namespace:action`
- 小写短横线
- 主 → 渲染: `send` 单向推送
- 渲染 → 主: `invoke` 异步请求

## Channels

### auth:login

渲染进程请求登录。

```
Direction: renderer → main
Pattern: invoke
Request:
{
  username: string
  password: string
}
Response (success):
{
  accessToken: string
  expiresIn: number           // seconds
  user: {
    id: string
    username: string
    role: 'user' | 'admin'
  }
}
Response (error):
{
  error: 'invalid_credentials' | 'rate_limited' | 'server_error'
  message: string
}
```

### auth:register

渲染进程请求注册（需邀请码）。

```
Direction: renderer → main
Pattern: invoke
Request:
{
  invitationCode: string
  username: string
  password: string
}
Response (success): 同上 auth:login success
Response (error):
{
  error: 'invalid_code' | 'code_used' | 'code_expired' | 'username_taken'
  message: string
}
```

### auth:refresh

主进程自动调用，刷新即将过期的 access token。

```
Direction: main → server
Pattern: HTTP POST /api/auth/refresh
Request:
{
  refreshToken: string        // from encrypted store
}
Response:
{
  accessToken: string
  expiresIn: number
}
```

### auth:session-restored

主进程向渲染进程通知会话恢复结果。

```
Direction: main → renderer
Pattern: send
Payload:
{
  restored: boolean
  user?: { id, username, role }
  error?: string
}
```

### mode:switch

渲染进程请求切换模式。

```
Direction: renderer → main
Pattern: invoke
Request:
{
  mode: 'dev' | 'simple'
}
Response:
{
  success: boolean
  mode: 'dev' | 'simple'
}
Note: 主进程更新 window layout CSS 类，保存偏好到本地存储
```

### mode:get

渲染进程获取当前模式。

```
Direction: renderer → main
Pattern: invoke
Request: {}
Response:
{
  mode: 'dev' | 'simple'
}
```

### file:open

渲染进程请求在主进程中打开文件（用于文件树选择）。

```
Direction: renderer → main
Pattern: invoke
Request:
{
  filePath: string             // 绝对路径
  mode?: 'read' | 'edit'      // 简约模式默认 read
}
Response:
{
  content: string
  fileName: string
  language: string             // detected language id
}
```

### file:save

渲染进程请求保存文件内容。

```
Direction: renderer → main
Pattern: invoke
Request:
{
  filePath: string
  content: string
}
Response:
{
  success: boolean
  error?: string
}
```

### chat:send

渲染进程发送 AI 对话消息。

```
Direction: renderer → main → Codex Bridge
Pattern: invoke (streaming via chunk events)
Request:
{
  message: string
  conversationId?: string     // 继续已有对话
  contextFiles?: string[]     // 引用的文件路径列表
}
Response (initial):
{
  conversationId: string
}
```

### chat:chunk

主进程向渲染进程推送 AI 响应流片段（SSE）。

```
Direction: main → renderer
Pattern: send (stream)
Payload:
{
  conversationId: string
  chunk: string                // 增量文本
  done: boolean                // true = 流结束
}
```

### chat:open-file

AI 建议打开文件时，主进程通知渲染进程打开对应文件。

```
Direction: main → renderer
Pattern: send (stream)
Payload:
{
  filePath: string
  openInMode: 'simple-editor' | 'dev-editor'
}
```

### update:available

主进程向渲染进程推送新版本通知。

```
Direction: main → renderer
Pattern: send
Payload:
{
  version: string
  releaseNotes: string
  downloadUrl: string
}
```

### update:check

渲染进程主动检查更新（用户手动触发）。

```
Direction: renderer → main
Pattern: invoke
Request: {}
Response:
{
  hasUpdate: boolean
  version?: string
  releaseNotes?: string
  downloadUrl?: string
}
```

## 通道注册清单

| 通道名 | 模式 | 优先级 |
|--------|------|--------|
| auth:login | invoke | P1 |
| auth:register | invoke | P1 |
| auth:refresh | HTTP (内部) | P1 |
| auth:session-restored | send | P1 |
| mode:switch | invoke | P2 |
| mode:get | invoke | P2 |
| file:open | invoke | P1 |
| file:save | invoke | P2 |
| chat:send | invoke + stream | P1 |
| chat:chunk | send | P1 |
| chat:open-file | send | P2 |
| update:available | send | P3 |
| update:check | invoke | P3 |
