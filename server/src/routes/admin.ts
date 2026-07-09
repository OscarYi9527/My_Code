import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth-middleware';
import { adminMiddleware } from '../middleware/admin-middleware';
import { createInvitation } from '../services/auth-service';

const router = Router();
router.use(authMiddleware as unknown as Router);
router.use(adminMiddleware as unknown as Router);

let dashStats = { totalUsers: 1, activeUsersToday: 0, aiCallsToday: 0, aiCallsMonth: 0, aiCallsTotal: 0, tokenIn: 0, tokenOut: 0 };
const versionList: { id: string; version: string; platform: string; releaseNotes: string; pushedAt: string }[] = [];
const submissions: { id: string; name: string; version: string; description: string; author: string; status: string; createdAt: string }[] = [];

router.get('/dashboard', (_req: Request, res: Response): void => {
  res.json({
    totalUsers: dashStats.totalUsers,
    activeUsersToday: dashStats.activeUsersToday,
    aiCallCount: { today: dashStats.aiCallsToday, thisMonth: dashStats.aiCallsMonth, total: dashStats.aiCallsTotal },
    tokenUsage: { totalIn: dashStats.tokenIn, totalOut: dashStats.tokenOut },
    recentUsers: [{ username: 'admin', createdAt: new Date().toISOString() }],
  });
});

router.get('/users', (req: Request, res: Response): void => {
  const page = Number(req.query.page) || 1;
  res.json({ data: [], pagination: { page, limit: 20, total: dashStats.totalUsers } });
});

router.get('/users/:id/usage', (req: Request, res: Response): void => {
  res.json({ userId: req.params.id, username: '', totalCalls: 0, totalTokensIn: 0, totalTokensOut: 0, byModel: [], recentConversations: [] });
});

router.post('/invitations', (req: AuthenticatedRequest, res: Response): void => {
  const { count = 1, maxUses = 1, expiresInDays } = req.body;
  const codes: { code: string; maxUses: number; expiresAt: string | null }[] = [];
  for (let i = 0; i < Math.min(count, 50); i++) {
    const code = createInvitation(maxUses, expiresInDays || null);
    codes.push({ code, maxUses, expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null });
  }
  res.status(201).json({ codes });
});

router.get('/invitations', (req: Request, res: Response): void => {
  res.json({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
});

router.post('/versions', (req: AuthenticatedRequest, res: Response): void => {
  const { version, releaseNotes, downloadUrl, platform } = req.body;
  const id = 'v-' + Date.now();
  const now = new Date().toISOString();
  versionList.push({ id, version, platform: platform || 'win32', releaseNotes, pushedAt: now });
  res.status(201).json({ id, version, pushedAt: now });
});

router.get('/versions', (_req: Request, res: Response): void => {
  res.json({ data: versionList });
});

router.get('/marketplace/submissions', (req: Request, res: Response): void => {
  const status = req.query.status as string;
  const filtered = status ? submissions.filter((s) => s.status === status) : submissions;
  res.json({ data: filtered });
});

router.post('/marketplace/submissions/:id/review', (req: Request, res: Response): void => {
  const { action, reason } = req.body;
  const sub = submissions.find((s) => s.id === req.params.id);
  if (!sub) { res.status(404).json({ error: 'not_found' }); return; }
  sub.status = action === 'approve' ? 'approved' : 'rejected';
  res.json({ success: true, status: sub.status });
});

export { router as adminRoutes };
