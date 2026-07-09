import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../../app/common/types/auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function verifyToken(token: string): User {
  const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & User;
  return { id: decoded.id, username: decoded.username, role: decoded.role };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: '缺少认证令牌' });
    return;
  }
  try {
    req.user = verifyToken(authHeader.split(' ')[1]);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: '令牌无效或已过期' });
  }
}
