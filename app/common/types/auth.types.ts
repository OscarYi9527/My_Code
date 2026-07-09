export interface User {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface RegisterRequest {
  invitationCode: string;
  username: string;
  password: string;
}

export interface RegisterResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export interface AuthError {
  error: string;
  message: string;
}
