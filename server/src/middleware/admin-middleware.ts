import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth-middleware';

export function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'forbidden', message: '需要管理员权限' });
    return;
  }
  next();
}
