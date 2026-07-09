import { User, LoginRequest, RegisterRequest, RefreshResponse } from '../types/auth.types';

export interface IAuthService {
  login(request: LoginRequest): Promise<{ accessToken: string; expiresIn: number; user: User }>;
  register(request: RegisterRequest): Promise<{ accessToken: string; expiresIn: number; user: User }>;
  refresh(): Promise<RefreshResponse>;
  logout(): Promise<void>;
  getSession(): Promise<{ user: User } | null>;
}
