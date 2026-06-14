// JWT 工具 - 自动续签
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 距离过期 1 天时续签

interface JWTPayload {
  userId: string;
  phone: string;
  exp: number;
  iat: number;
}

function parseToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

export function getTokenExpiry(token: string): number | null {
  const payload = parseToken(token);
  return payload?.exp ? payload.exp * 1000 : null;
}

export function shouldRefreshToken(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (!exp) return false;
  return Date.now() > exp - REFRESH_THRESHOLD_MS;
}

export function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (!exp) return true;
  return Date.now() > exp;
}

// 刷新 token
let refreshing: Promise<string | null> | null = null;

export async function refreshToken(): Promise<string | null> {
  // 防止并发刷新
  if (refreshing) return refreshing;

  const currentToken = localStorage.getItem('yuyou-token');
  if (!currentToken) return null;

  refreshing = (async () => {
    try {
      const res = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('yuyou-token', data.token);
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

// 启动定时检查
let timer: number | null = null;

export function startTokenRefreshScheduler() {
  if (timer) return;
  const check = () => {
    const token = localStorage.getItem('yuyou-token');
    if (token && shouldRefreshToken(token)) {
      refreshToken();
    }
  };
  // 启动时检查一次
  check();
  // 每 10 分钟检查一次
  timer = window.setInterval(check, 10 * 60 * 1000);
}

export function stopTokenRefreshScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
