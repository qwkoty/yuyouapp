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

// 标记错误已 toast 过，避免 catch 块重复弹窗
interface ToastedError extends Error {
  _toasted?: boolean;
}

async function request<T>(method: string, url: string, body?: any, opts: RequestOptions = {}, _retryCount = 0): Promise<T> {
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
      // 限制最多刷新重试 1 次，防止死循环
      if (tokenRefreshHandler && _retryCount < 1) {
        const newToken = await tokenRefreshHandler();
        if (newToken) {
          localStorage.setItem('yuyou-token', newToken);
          return request<T>(method, url, body, opts, _retryCount + 1);
        }
      }
      if (unauthorizedHandler) unauthorizedHandler();
      const err: ToastedError = new Error('登录已过期，请重新登录');
      err._toasted = true;
      if (!opts.silent) toast.error(err.message);
      throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message || `请求失败 (${res.status})`;
      const err: ToastedError = new Error(msg);
      err._toasted = true;
      if (!opts.silent) toast.error(msg);
      throw err;
    }
    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const abortErr: ToastedError = new Error('请求超时');
      abortErr._toasted = true;
      if (!opts.silent) toast.error('请求超时，请重试');
      throw abortErr;
    }
    // 已 toast 过的错误（来自上方 throw）不再重复弹窗
    if (!opts.silent && err.message && !err._toasted) {
      toast.error(err.message);
    }
    throw err;
  }
}

const api = {
  get: <T>(url: string, opts?: RequestOptions) => request<T>('GET', url, undefined, opts),
  post: <T>(url: string, body?: any, opts?: RequestOptions) => request<T>('POST', url, body, opts),
  put: <T>(url: string, body?: any, opts?: RequestOptions) => request<T>('PUT', url, body, opts),
  delete: <T>(url: string, body?: any, opts?: RequestOptions) => request<T>('DELETE', url, body, opts),
};

export default api;
