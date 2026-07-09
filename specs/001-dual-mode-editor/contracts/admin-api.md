# Admin API: 管理后台服务

**Date**: 2026-06-28 | **Feature**: [spec.md](../spec.md)

管理后台 REST API 契约。所有端点需 admin 角色。Base URL: `http://<server>:<port>/api/admin`

## 认证

所有请求需 Authorization header: `Bearer <accessToken>`，中间件验证 role='admin'。

---

## GET /dashboard

获取仪表盘聚合数据。

```
Response 200:
{
  totalUsers: number          // 注册用户总数
  activeUsersToday: number    // 今日活跃用户
  aiCallCount: {              // AI 调用统计
    today: number
    thisMonth: number
    total: number
  }
  tokenUsage: {
    totalIn: number
    totalOut: number
  }
  recentUsers: [{             // 最近注册用户
    username: string
    createdAt: datetime
  }]
}
```

## GET /users

分页查询用户列表。

```
Query Parameters:
  page?: number (default 1)
  limit?: number (default 20, max 100)
  role?: 'user' | 'admin'
  sort?: 'created_at' | 'username'

Response 200:
{
  data: [{
    id: string
    username: string
    role: string
    createdAt: datetime
    lastActiveAt: datetime
  }]
  pagination: {
    page: number
    limit: number
    total: number
  }
}
```

## GET /users/:id/usage

查询特定用户的用量详情。

```
Response 200:
{
  userId: string
  username: string
  totalCalls: number
  totalTokensIn: number
  totalTokensOut: number
  byModel: [{
    modelType: string
    count: number
    tokensIn: number
    tokensOut: number
  }]
  recentConversations: [{      // 最近对话摘要
    summary: string            // 前 50 字
    modelType: string
    timestamp: datetime
    tokenIn: number
    tokenOut: number
  }]
}
```

---

## POST /invitations

生成邀请码。

```
Request:
{
  count?: number              // 批量生成数量，默认 1，最大 50
  maxUses?: number            // 每码使用次数，默认 1
  expiresInDays?: number      // 有效期天数，NULL = 永不过期
}

Response 201:
{
  codes: [{
    code: string              // INV-XXXX-XXXX-XXXX
    maxUses: number
    expiresAt: datetime | null
  }]
}
```

## GET /invitations

查询邀请码列表。

```
Query Parameters:
  page?: number
  status?: 'active' | 'used' | 'expired'

Response 200:
{
  data: [{
    id: string
    code: string
    status: string
    maxUses: number
    usedCount: number
    expiresAt: datetime | null
    usedBy: { username: string } | null
    createdAt: datetime
  }]
  pagination: { page, limit, total }
}
```

---

## POST /versions

推送新版本。

```
Request:
{
  version: string             // SemVer, e.g. '1.2.0'
  releaseNotes: string
  downloadUrl: string
  platform: 'win32' | 'darwin'
}

Response 201:
{
  id: string
  version: string
  pushedAt: datetime
}
```

## GET /versions

查询版本推送历史。

```
Response 200:
{
  data: [{
    id: string
    version: string
    platform: string
    releaseNotes: string
    pushedAt: datetime
  }]
}
```

---

## GET /marketplace/submissions

查询 Skill 市场提交列表（待审核）。

```
Query Parameters:
  status?: 'pending' | 'approved' | 'rejected'

Response 200:
{
  data: [{
    id: string
    name: string
    version: string
    description: string
    author: { username: string }
    status: string
    createdAt: datetime
  }]
}
```

## POST /marketplace/submissions/:id/review

审核 Skill 提交。

```
Request:
{
  action: 'approve' | 'reject'
  reason?: string            // 拒绝原因
}

Response 200:
{
  success: true
  status: 'approved' | 'rejected'
}
```
