import { Router, Request, Response } from 'express';
import { login, register, verifyAndRefresh, revokeRefreshToken } from '../services/auth-service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth-middleware';

const router = Router();

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body;
  if (!username || !password) { res.status(400).json({ error: 'invalid_request', message: '缺少用户名或密码' }); return; }
  const result = login(username, password);
  if (!result) { res.status(401).json({ error: 'invalid_credentials', message: '用户名或密码错误' }); return; }
  res.cookie('refreshToken', result.refreshToken, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user });
});

router.post('/register', (req: Request, res: Response): void => {
  const { invitationCode, username, password } = req.body;
  if (!invitationCode || !username || !password) { res.status(400).json({ error: 'invalid_request', message: '缺少必要字段' }); return; }
  if (username.length < 3) { res.status(400).json({ error: 'invalid_username', message: '用户名须为3-32字符' }); return; }
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { res.status(400).json({ error: 'weak_password', message: '密码至少8字符，须含字母和数字' }); return; }
  const result = register(invitationCode, username);
  if ('error' in result) { res.status(400).json(result); return; }
  res.cookie('refreshToken', result.refreshToken, { httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.status(201).json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user });
});

router.post('/refresh', (req: Request, res: Response): void => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) { res.status(401).json({ error: 'invalid_refresh_token', message: '登录已过期' }); return; }
  const result = verifyAndRefresh(refreshToken);
  if (!result) { res.status(401).json({ error: 'invalid_refresh_token', message: '登录已过期' }); return; }
  res.json(result);
});

router.post('/logout', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) revokeRefreshToken(refreshToken);
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ id: req.user!.id, username: req.user!.username, role: req.user!.role });
});

export { router as authRoutes };
