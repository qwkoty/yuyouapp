import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary';
import { setUnauthorizedHandler, setTokenRefreshHandler } from './lib/apiClient';
import { startTokenRefreshScheduler } from './lib/jwtUtils';

// ⚡ 移除内联 loading：React 渲染后会自动替换 #root 内容
const loadingEl = document.getElementById('app-loading');
if (loadingEl) {
  loadingEl.classList.add('hide');
  setTimeout(() => loadingEl.remove(), 300);
}

// ⚡ 注册全局 401 处理：token 过期时清除并跳转登录
setUnauthorizedHandler(() => {
  localStorage.removeItem('yuyou-token');
  localStorage.removeItem('yuyou-user');
  // 避免在登录页重复跳转
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
});

// ⚡ 注册 token 刷新处理器
setTokenRefreshHandler(async () => {
  const token = localStorage.getItem('yuyou-token');
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.token : null;
  } catch {
    return null;
  }
});

// ⚡ 启动 token 自动续签调度器
startTokenRefreshScheduler();

// ⚡ 显式检查 #root，避免 null 断言崩溃
const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in DOM');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary fullScreen>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
