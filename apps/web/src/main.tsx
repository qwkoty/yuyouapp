import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { setUnauthorizedHandler, setTokenRefreshHandler } from './lib/apiClient';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
