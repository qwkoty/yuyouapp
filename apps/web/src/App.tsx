import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUserStore } from './stores/userStore';
import { useSocketStore } from './stores/socketStore';
import type { UserProfile } from '@yuyou/shared';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import Match from './pages/Match';
import Chat from './pages/Chat';
import History from './pages/History';
import Settings from './pages/Settings';
import AdminAuth from './pages/AdminAuth';
import AdminTest from './pages/AdminTest';
import Layout from './components/Layout';

function App() {
  const profile = useUserStore((s) => s.profile);
  const connect = useSocketStore((s) => s.connect);
  const [isCheckingToken, setIsCheckingToken] = useState(true);

  useEffect(() => {
    connect();
  }, [connect]);

  // 检查token有效性
  useEffect(() => {
    const token = localStorage.getItem('yuyou-token');
    if (!token) {
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
            realName: u.real_name || u.realName || '',
            gender: u.gender || 'male',
            birthDate: u.birth_date || u.birthDate || '2000-01-01',
            age: u.age || 0,
            province: u.province || '',
            city: u.city || '',
            wechatId: u.wechat_id || u.wechatId || '',
            bio: u.bio || '',
            createdAt: u.created_at ? new Date(u.created_at).getTime() : Date.now(),
          };
          useUserStore.getState().setProfile(profile);
        } else {
          localStorage.removeItem('yuyou-token');
          localStorage.removeItem('yuyou-user');
        }
      })
      .catch(() => {
        localStorage.removeItem('yuyou-token');
        localStorage.removeItem('yuyou-user');
      })
      .finally(() => setIsCheckingToken(false));
  }, []);

  if (isCheckingToken) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const hasToken = localStorage.getItem('yuyou-token');

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            hasToken && profile ? <Navigate to="/match" replace /> : <Navigate to="/login" replace />
          }
        />
        <Route path="/login" element={<Login />} />
        <Route
          path="/profile"
          element={hasToken ? <ProfileSetup /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/match"
          element={hasToken && profile ? <Match /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/chat/:sessionId"
          element={hasToken && profile ? <Chat /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/history"
          element={hasToken && profile ? <History /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/settings"
          element={hasToken && profile ? <Settings /> : <Navigate to="/login" replace />}
        />
        <Route path="/admin" element={<AdminAuth />} />
        <Route path="/admin/test" element={<AdminTest />} />
      </Route>
    </Routes>
  );
}

export default App;