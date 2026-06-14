import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUserStore } from './stores/userStore';
import { useSocketStore } from './stores/socketStore';
import { socket } from './stores/socketStore';
import type { UserProfile, UserProfileInput } from '@yuyou/shared';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import Match from './pages/Match';
import Chat from './pages/Chat';
import History from './pages/History';
import Settings from './pages/Settings';
import AdminAuth from './pages/AdminAuth';
import AdminTest from './pages/AdminTest';
import AgentList from './pages/AgentList';
import AgentEdit from './pages/AgentEdit';
import AgentChat from './pages/AgentChat';
import Layout from './components/Layout';
import { ToastContainer } from './components/Toast';
import { setUnauthorizedHandler, setTokenRefreshHandler } from './lib/apiClient';
import { refreshToken, startTokenRefreshScheduler, stopTokenRefreshScheduler, isTokenExpired } from './lib/jwtUtils';

function App() {
  const connect = useSocketStore((s) => s.connect);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const navigate = useNavigate();

  // 设置 API 客户端的全局处理器
  useEffect(() => {
    setTokenRefreshHandler(async () => {
      const token = localStorage.getItem('yuyou-token');
      if (!token || isTokenExpired(token)) return null;
      return await refreshToken();
    });

    setUnauthorizedHandler(() => {
      localStorage.removeItem('yuyou-token');
      localStorage.removeItem('yuyou-user');
      useUserStore.getState().setProfile(null);
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    connect();
    startTokenRefreshScheduler();
    return () => stopTokenRefreshScheduler();
  }, [connect]);

  // 检查token有效性
  useEffect(() => {
    const token = localStorage.getItem('yuyou-token');
    if (!token) {
      setIsCheckingToken(false);
      return;
    }

    if (isTokenExpired(token)) {
      localStorage.removeItem('yuyou-token');
      localStorage.removeItem('yuyou-user');
      setIsCheckingToken(false);
      return;
    }

    fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          const u = data.user;
          const profile: UserProfile = {
            id: u.id,
            avatar: u.avatar || '',
            nickname: u.nickname || '',
            realName: u.realName || u.real_name || '',
            gender: u.gender || 'male',
            birthDate: u.birthDate || u.birth_date || '2000-01-01',
            age: u.age || 0,
            province: u.province || '',
            city: u.city || '',
            wechatId: u.wechatId || u.wechat_id || '',
            bio: u.bio || '',
            createdAt: u.createdAt ? new Date(u.createdAt).getTime() : (u.created_at ? new Date(u.created_at).getTime() : Date.now()),
          };
          useUserStore.getState().setProfile(profile);

          if (socket && socket.connected) {
            const profileInput: UserProfileInput = {
              avatar: profile.avatar,
              nickname: profile.nickname,
              realName: profile.realName,
              gender: profile.gender,
              birthDate: profile.birthDate,
              province: profile.province,
              city: profile.city,
              wechatId: profile.wechatId,
              bio: profile.bio,
            };
            socket.emit('profile:update', profileInput, (result) => {
              console.log('[App] profile:update:', result.success ? '成功' : result.error);
            });
          }
        } else {
          localStorage.removeItem('yuyou-token');
          localStorage.removeItem('yuyou-user');
        }
      })
      .catch(() => {
        // 静默失败，可能是网络问题
      })
      .finally(() => setIsCheckingToken(false));
  }, []);

  if (isCheckingToken) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasToken = localStorage.getItem('yuyou-token');

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              hasToken ? <Navigate to="/match" replace /> : <Navigate to="/login" replace />
            }
          />
          <Route path="/login" element={<Login />} />
          <Route
            path="/profile"
            element={hasToken ? <ProfileSetup /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/match"
            element={hasToken ? <Match /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/chat/:sessionId"
            element={hasToken ? <Chat /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/history"
            element={hasToken ? <History /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/settings"
            element={hasToken ? <Settings /> : <Navigate to="/login" replace />}
          />
          <Route path="/agents" element={hasToken ? <AgentList /> : <Navigate to="/login" replace />} />
          <Route path="/agents/create" element={hasToken ? <AgentEdit /> : <Navigate to="/login" replace />} />
          <Route path="/agents/:id/edit" element={hasToken ? <AgentEdit /> : <Navigate to="/login" replace />} />
          <Route path="/agents/:id/chat" element={hasToken ? <AgentChat /> : <Navigate to="/login" replace />} />
          <Route path="/admin" element={<AdminAuth />} />
          <Route path="/admin/test" element={<AdminTest />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
