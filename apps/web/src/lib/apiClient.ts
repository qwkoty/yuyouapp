import { toast } from '../components/Toast';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

let unauthorizedHandler: (() => void) | null = null;
let tokenRefreshHandler: (() => Promise<string | null>) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export function setTokenRefreshHandler(handler: () => Promise<string | null>) {
  tokenRefreshHandler = handler;
}

interface RequestOptions {
  silent?: boolean;
  timeout?: number;
}

async function request<T>(method: string, url: string, body?: any, opts: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem('yuyou-token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeout || 30000);

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      if (tokenRefreshHandler) {
        const newToken = await tokenRefreshHandler();
        if (newToken) {
          localStorage.setItem('yuyou-token', newToken);
          return request(method, url, body, opts);
        }
      }
      if (unauthorizedHandler) unauthorizedHandler();
      throw new Error('登录已过期，请重新登录');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message || `请求失败 (${res.status})`;
      if (!opts.silent) toast.error(msg);
      throw new Error(msg);
    }
    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      if (!opts.silent) toast.error('请求超时，请重试');
      throw new Error('请求超时');
    }
    if (!opts.silent && err.message) toast.error(err.message);
    throw err;
  }
}

const api = {
  get: <T>(url: string, opts?: RequestOptions) => request<T>('GET', url, undefined, opts),
  post: <T>(url: string, body?: any, opts?: RequestOptions) => request<T>('POST', url, body, opts),
  put: <T>(url: string, body?: any, opts?: RequestOptions) => request<T>('PUT', url, body, opts),
  delete: <T>(url: string, opts?: RequestOptions) => request<T>('DELETE', url, undefined, opts),
};

export default api;
