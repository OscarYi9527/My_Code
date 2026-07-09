import jwt from 'jsonwebtoken';
import { User, LoginResponse, RegisterResponse } from '../../../app/common/types/auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_TOKEN_TTL = 900;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;

const users = new Map<string, { id: string; username: string; passwordHash: string; role: 'user' | 'admin' }>();
const invitations = new Map<string, { maxUses: number; usedCount: number; expiresAt: number | null }>();
const refreshTokens = new Map<string, { userId: string; username: string; role: string; expiresAt: number }>();

// Seed admin account
users.set('admin', { id: 'admin-001', username: 'admin', passwordHash: 'admin-hash-placeholder', role: 'admin' });

function generateAccessToken(user: User): string {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function createTokens(user: User): { accessToken: string; refreshToken: string; expiresIn: number } {
  const accessToken = generateAccessToken(user);
  const refreshToken = 'rt_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  refreshTokens.set(refreshToken, { userId: user.id, username: user.username, role: user.role, expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000 });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL };
}

export function login(username: string, _password: string): LoginResponse | null {
  const user = users.get(username);
  if (!user) return null;
  const u: User = { id: user.id, username: user.username, role: user.role };
  return { ...createTokens(u), user: u };
}

export function register(invitationCode: string, username: string): RegisterResponse | { error: string; message: string } {
  const inv = invitations.get(invitationCode);
  if (!inv || inv.usedCount >= inv.maxUses || (inv.expiresAt && Date.now() > inv.expiresAt)) {
    return { error: 'invalid_code', message: '邀请码无效或已过期' };
  }
  if (users.has(username)) return { error: 'username_taken', message: '用户名已被占用' };

  const id = 'u-' + Math.random().toString(36).slice(2);
  users.set(username, { id, username, passwordHash: 'hash', role: 'user' });
  inv.usedCount++;
  const u: User = { id, username, role: 'user' };
  return { ...createTokens(u), user: u };
}

export function verifyAndRefresh(refreshToken: string): { accessToken: string; expiresIn: number } | null {
  const stored = refreshTokens.get(refreshToken);
  if (!stored || Date.now() >= stored.expiresAt) { refreshTokens.delete(refreshToken); return null; }
  return { accessToken: generateAccessToken({ id: stored.userId, username: stored.username, role: stored.role as 'user' | 'admin' }), expiresIn: ACCESS_TOKEN_TTL };
}

export function revokeRefreshToken(token: string): void { refreshTokens.delete(token); }

export function createInvitation(maxUses: number = 1, expiresInDays: number | null = null): string {
  const code = 'INV-' + Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 6).toUpperCase()).join('-');
  invitations.set(code, { maxUses, usedCount: 0, expiresAt: expiresInDays ? Date.now() + expiresInDays * 86400000 : null });
  return code;
}
