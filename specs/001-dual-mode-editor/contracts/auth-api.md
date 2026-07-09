# Auth API: 后台认证服务

**Date**: 2026-06-28 | **Feature**: [spec.md](../spec.md)

后台服务器认证相关 REST API 契约。Base URL: `http://<server>:<port>/api/auth`

## POST /login

验证用户凭据并返回 token pair。

```
Request:
Content-Type: application/json
{
  username: string            // 3-32 chars, alphanum + _-
  password: string            // min 8 chars
}

Response 200:
{
  accessToken: string         // JWT, 15min TTL
  refreshToken: string        // opaque token, 30d TTL
  expiresIn: 900              // seconds
  user: {
    id: string
    username: string
    role: 'user' | 'admin'
  }
}

Response 401:
{
  error: 'invalid_credentials'
  message: '用户名或密码错误'
}

Response 429:
{
  error: 'rate_limited'
  message: '登录尝试过于频繁，请稍后再试'
  retryAfter: 60             // seconds
}
```

## POST /register

使用邀请码注册新账户。

```
Request:
Content-Type: application/json
{
  invitationCode: string     // format: INV-XXXX-XXXX-XXXX
  username: string           // 3-32 chars
  password: string           // min 8 chars
}

Response 201: 同 /login 200

Response 400:
{
  error: 'invalid_code' | 'code_used' | 'code_expired' | 'username_taken'
  message: string
}
```

## POST /refresh

使用 refresh token 获取新的 access token。

```
Request:
Content-Type: application/json
Cookie: refreshToken=<token>  // httpOnly cookie, set at login/register

Response 200:
{
  accessToken: string
  expiresIn: 900
}

Response 401:
{
  error: 'invalid_refresh_token'
  message: '登录已过期，请重新登录'
}
```

## POST /logout

使 refresh token 失效。

```
Request:
Content-Type: application/json
Cookie: refreshToken=<token>
Authorization: Bearer <accessToken>

Response 200:
{
  success: true
}
```

## GET /me

获取当前用户信息。

```
Request:
Authorization: Bearer <accessToken>

Response 200:
{
  id: string
  username: string
  role: 'user' | 'admin'
}

Response 401:
{
  error: 'unauthorized'
}
```

## 认证流程

```text
1. 用户打开应用 → 检查本地 token store
   ├── access token 有效 → 自动恢复会话
   └── access token 过期 → 尝试 /refresh
       ├── refresh 成功 → 新 access token
       └── refresh 失败 → 显示登录页

2. 用户在活跃使用中 → 渲染进程定时检查（每 10 分钟）
   └── access token 将在 5 分钟内过期 → 主进程静默 /refresh

3. 管理员创建时 → 后台直接写入 UserAccount 表，role='admin'
```
