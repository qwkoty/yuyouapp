import { toast } from '../components/Toast';

const BASE_URL = '';

let onUnauthorized: (() => void) | null = null;
let onTokenRefresh: (() => Promise<string | null>) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export function setTokenRefreshHandler(handler: () => Promise<string | null>) {
  onTokenRefresh = handler;
}

interface RequestOptions extends RequestInit {
  silent?: boolean; // 不显示错误 toast
  retry?: boolean; // 401 时尝试刷新 token
  timeout?: number;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { silent, retry = true, timeout = 15000, ...init } = options;

  const token = localStorage.getItem('yuyou-token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // 超时控制
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  init.signal = controller.signal;

  let res: Response;
  try {
    res = await fetch(BASE_URL + endpoint, { ...init, headers });
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      if (!silent) toast.error('请求超时');
      throw new ApiError('请求超时', 0, null);
    }
    if (!silent) toast.error('网络错误');
    throw new ApiError('网络错误', 0, null);
  }
  clearTimeout(timer);

  // 401: token 过期，尝试刷新
  if (res.status === 401 && retry && onTokenRefresh) {
    const newToken = await onTokenRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(BASE_URL + endpoint, { ...init, headers });
    }
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应
  }

  if (!res.ok) {
    if (res.status === 401) {
      // token 真的失效了
      localStorage.removeItem('yuyou-token');
      localStorage.removeItem('yuyou-user');
      if (onUnauthorized) onUnauthorized();
    }
    if (!silent) {
      const msg = data?.error || `请求失败 (${res.status})`;
      toast.error(msg);
    }
    throw new ApiError(data?.error || '请求失败', res.status, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
