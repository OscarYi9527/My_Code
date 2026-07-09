# Data Model: 双模式 AI 编辑器

**Date**: 2026-06-28
**Feature**: [spec.md](./spec.md)

## Entity Relationship

```
UserAccount (1) ────< UsageRecord (N)
     │
     ├────< UserPreference (1)
     │
     └────< AI_Conversation (N)  [local storage, not in server DB]

InvitationCode (N) ────> created_by AdminAccount (1)
     │
     └──── used_by UserAccount (1, nullable)

VersionUpdate (N) ────> pushed_by AdminAccount (1)
SkillPublication (N) ────> reviewed_by AdminAccount (1)
```

## Entities

### UserAccount (用户账户) — Server DB

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | 自动生成 |
| username | string(32) | UNIQUE, NOT NULL | 登录用户名 |
| password_hash | string(60) | NOT NULL | bcrypt 哈希 |
| role | enum('user','admin') | NOT NULL, DEFAULT 'user' | 角色标记 |
| created_at | datetime | NOT NULL, DEFAULT now() | |
| updated_at | datetime | NOT NULL | |

Validation rules:
- username: 3-32 字符，仅字母/数字/下划线/短横线
- password: 最少 8 字符，至少包含一个字母和一个数字
- role: 管理员由后台直接创建，不经过邀请码流程

State transitions:
- `user` → `admin` (由另一位管理员提升)
- 账户无删除（软删除可选 v2）

### InvitationCode (邀请码) — Server DB

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| code | string(24) | UNIQUE, NOT NULL | 格式: INV-XXXX-XXXX-XXXX |
| status | enum('active','used','expired') | NOT NULL, DEFAULT 'active' | |
| max_uses | integer | NOT NULL, DEFAULT 1 | |
| used_count | integer | NOT NULL, DEFAULT 0 | |
| expires_at | datetime | NULLABLE | NULL = 永不过期 |
| created_by | UUID | FK → UserAccount.id | 创建该码的管理员 |
| used_by | UUID | FK → UserAccount.id, NULLABLE | 使用该码的用户 |
| created_at | datetime | NOT NULL | |
| used_at | datetime | NULLABLE | |

Validation rules:
- code 唯一，全局不可重复
- status = 'active' 且 expires_at > now() 且 used_count < max_uses → 可用
- used_by 仅在 status = 'used' 时非空

State transitions:
```
active ──used──▶ used
  │
  └──expired──▶ expired (cron check or query-time filtering)
```

### UsageRecord (用量记录) — Server DB

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → UserAccount.id, NOT NULL | |
| model_type | string(32) | NOT NULL | e.g. 'claude-haiku-4-5' |
| call_count | integer | NOT NULL, DEFAULT 1 | 聚合后可合并记录 |
| token_in | integer | NOT NULL, DEFAULT 0 | |
| token_out | integer | NOT NULL, DEFAULT 0 | |
| conversation_summary | string(50) | NULLABLE | 对话前 50 字摘要 |
| timestamp | datetime | NOT NULL, DEFAULT now() | |

Validation rules:
- conversation_summary: 不超过 50 字符
- 不存储完整对话内容（宪法 + FR-015 约束）

### UserPreference (用户偏好) — Client Local Storage

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| default_mode | enum('dev','simple') | NOT NULL, DEFAULT 'dev' | 启动时默认模式 |
| theme | enum('dark','light') | NOT NULL, DEFAULT 'dark' | |
| sidebar_visible | boolean | NOT NULL, DEFAULT true | 文件树可见 |
| last_project_path | string | NULLABLE | 上次打开的项目路径 |
| updated_at | datetime | NOT NULL | |

Note: 存储在客户端本地（Electron electron-store），不同步到服务器

### AI_Conversation (AI 对话) — Client Local (Claude Code managed)

完整对话历史和上下文由 Claude Code 本地存储机制管理。客户端通过 Claude 接口读写，不自行实现持久化。

客户端仅暂存当前会话的引用 ID 以关联 UsageRecord。

### SkillPublication (Skill 发布) — Server DB

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| name | string(64) | NOT NULL | |
| version | string(16) | NOT NULL | SemVer |
| description | text | NOT NULL | |
| author_id | UUID | FK → UserAccount.id | 提交者 |
| package_url | string(512) | NOT NULL | 下载地址 |
| status | enum('pending','approved','rejected') | NOT NULL, DEFAULT 'pending' | |
| reviewed_by | UUID | FK → UserAccount.id, NULLABLE | |
| created_at | datetime | NOT NULL | |
| reviewed_at | datetime | NULLABLE | |

### VersionUpdate (版本更新) — Server DB

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| version | string(16) | UNIQUE, NOT NULL | 如 '1.2.0' |
| release_notes | text | NOT NULL | 更新日志 |
| download_url | string(512) | NOT NULL | 安装包地址 |
| platform | enum('win32','darwin') | NOT NULL | |
| pushed_by | UUID | FK → UserAccount.id | |
| pushed_at | datetime | NOT NULL, DEFAULT now() | |

## Storage Summary

| Entity | Storage | Access |
|--------|---------|--------|
| UserAccount | Server SQLite | Auth Service |
| InvitationCode | Server SQLite | Admin API |
| UsageRecord | Server SQLite | Metrics Service |
| UserPreference | Client electron-store | Main Process |
| AI_Conversation | Claude Code ~/.claude/projects/ | Claude Proxy |
| SkillPublication | Server SQLite | Marketplace API |
| VersionUpdate | Server SQLite | Update API |
