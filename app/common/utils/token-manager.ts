const ACCESS_TOKEN_KEY = 'access_token';
const EXPIRES_AT_KEY = 'token_expires_at';

let storage: Map<string, string> = new Map();

export function storeAccessToken(token: string, expiresIn: number): void {
  storage.set(ACCESS_TOKEN_KEY, token);
  storage.set(EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000));
}

export function getAccessToken(): string | null {
  return storage.get(ACCESS_TOKEN_KEY) || null;
}

export function getTokenExpiry(): number | null {
  const raw = storage.get(EXPIRES_AT_KEY);
  return raw ? Number(raw) : null;
}

export function isTokenExpired(): boolean {
  const expiry = getTokenExpiry();
  return expiry ? Date.now() >= expiry : true;
}

export function willExpireWithin(seconds: number): boolean {
  const expiry = getTokenExpiry();
  return expiry ? Date.now() + seconds * 1000 >= expiry : true;
}

export function clearTokens(): void {
  storage.delete(ACCESS_TOKEN_KEY);
  storage.delete(EXPIRES_AT_KEY);
}
