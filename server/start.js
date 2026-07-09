// Production server — mirrors all app/server/ routes in vanilla JS
// Usage: node server/start.js
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

app.use(express.json());
app.use(cookieParser());

// In-memory store
const users = new Map();
const invitations = new Map();
const refreshTokens = new Map();
const versionList = [];
const submissions = [];

// Seed admin
users.set('admin', { id: 'admin-001', username: 'admin', password: 'admin123', role: 'admin' });

// ======================== AUTH ========================
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized', message: '缺少认证令牌' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'unauthorized', message: '令牌无效或已过期' }); }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden', message: '需要管理员权限' });
  next();
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'invalid_request', message: '缺少用户名或密码' });
  const user = users.get(username);
  if (!user || user.password !== password) return res.status(401).json({ error: 'invalid_credentials', message: '用户名或密码错误' });
  const at = signToken(user);
  const rt = 'rt_' + crypto.randomBytes(32).toString('hex');
  refreshTokens.set(rt, { userId: user.id, username: user.username, role: user.role, exp: Date.now() + 30*86400000 });
  res.cookie('refreshToken', rt, { httpOnly: true, sameSite: 'strict', maxAge: 30*24*60*60*1000 });
  res.json({ accessToken: at, expiresIn: 900, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/api/auth/register', (req, res) => {
  const { invitationCode, username, password } = req.body;
  if (!invitationCode || !username || !password) return res.status(400).json({ error: 'invalid_request', message: '缺少必要字段' });
  if (username.length < 3) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'weak_password', message: '密码至少8字符含字母和数字' });
  const inv = invitations.get(invitationCode);
  if (!inv || inv.usedCount >= inv.maxUses) return res.status(400).json({ error: 'invalid_code', message: '邀请码无效或已过期' });
  if (users.has(username)) return res.status(400).json({ error: 'username_taken', message: '用户名已被占用' });
  inv.usedCount++;
  const user = { id: 'u-' + crypto.randomBytes(4).toString('hex'), username, password, role: 'user' };
  users.set(username, user);
  const at = signToken(user);
  const rt = 'rt_' + crypto.randomBytes(32).toString('hex');
  refreshTokens.set(rt, { userId: user.id, username: user.username, role: user.role, exp: Date.now() + 30*86400000 });
  res.cookie('refreshToken', rt, { httpOnly: true, sameSite: 'strict', maxAge: 30*24*60*60*1000 });
  res.status(201).json({ accessToken: at, expiresIn: 900, user: { id: user.id, username: user.username, role: user.role } });
});

app.post('/api/auth/refresh', (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) return res.status(401).json({ error: 'invalid_refresh_token' });
  const s = refreshTokens.get(rt);
  if (!s || Date.now() >= s.exp) { refreshTokens.delete(rt); return res.status(401).json({ error: 'invalid_refresh_token' }); }
  res.json({ accessToken: signToken({ id: s.userId, username: s.username, role: s.role }), expiresIn: 900 });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (rt) refreshTokens.delete(rt);
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

// ======================== ADMIN ========================
app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, (_req, res) => {
  res.json({
    totalUsers: users.size,
    activeUsersToday: 0,
    aiCallCount: { today: 0, thisMonth: 0, total: 0 },
    tokenUsage: { totalIn: 0, totalOut: 0 },
    recentUsers: [{ username: 'admin', createdAt: new Date().toISOString() }],
  });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const page = Number(req.query.page) || 1;
  res.json({ data: [], pagination: { page, limit: 20, total: users.size } });
});

app.get('/api/admin/users/:id/usage', authMiddleware, adminMiddleware, (req, res) => {
  res.json({ userId: req.params.id, username: '', totalCalls: 0, totalTokensIn: 0, totalTokensOut: 0, byModel: [], recentConversations: [] });
});

app.post('/api/admin/invitations', authMiddleware, adminMiddleware, (req, res) => {
  const cnt = Math.min(req.body.count || 1, 50);
  const mu = req.body.maxUses || 1;
  const days = req.body.expiresInDays;
  const codes = [];
  for (let i = 0; i < cnt; i++) {
    const code = 'INV-' + Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 6).toUpperCase()).join('-');
    invitations.set(code, { maxUses: mu, usedCount: 0, expiresAt: days ? Date.now() + days*86400000 : null, createdAt: new Date().toISOString() });
    codes.push({ code, maxUses: mu, expiresAt: days ? new Date(Date.now()+days*86400000).toISOString() : null });
  }
  res.status(201).json({ codes });
});

app.get('/api/admin/invitations', authMiddleware, adminMiddleware, (_req, res) => {
  const data = [];
  for (const [code, inv] of invitations) {
    let status = 'active';
    if (inv.usedCount >= inv.maxUses) status = 'used';
    if (inv.expiresAt && Date.now() > inv.expiresAt) status = 'expired';
    data.push({ code, status, usedCount: inv.usedCount, maxUses: inv.maxUses, expiresAt: inv.expiresAt, createdAt: inv.createdAt });
  }
  res.json({ data, pagination: { page: 1, limit: 20, total: data.length } });
});

app.post('/api/admin/versions', authMiddleware, adminMiddleware, (req, res) => {
  const { version, releaseNotes, downloadUrl, platform } = req.body;
  const v = { id: 'v-' + Date.now(), version, platform: platform || 'win32', releaseNotes, pushedAt: new Date().toISOString() };
  versionList.push(v);
  res.status(201).json(v);
});

app.get('/api/admin/versions', authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ data: versionList });
});

app.get('/api/admin/marketplace/submissions', authMiddleware, adminMiddleware, (req, res) => {
  const s = req.query.status;
  res.json({ data: s ? submissions.filter(x => x.status === s) : submissions });
});

app.post('/api/admin/marketplace/submissions/:id/review', authMiddleware, adminMiddleware, (req, res) => {
  const sub = submissions.find(x => x.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'not_found' });
  sub.status = req.body.action === 'approve' ? 'approved' : 'rejected';
  res.json({ success: true, status: sub.status });
});

app.get('/api/update/check', (_req, res) => {
  const latest = versionList[versionList.length - 1];
  res.json(latest ? { hasUpdate: true, version: latest.version, releaseNotes: latest.releaseNotes, downloadUrl: '' } : { hasUpdate: false });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Static admin web
app.use('/admin', express.static(path.join(__dirname, 'admin-web')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin/dashboard.html`);
});
