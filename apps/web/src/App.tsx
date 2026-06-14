import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useUserStore } from './stores/userStore';
import { useSocketStore } from './stores/socketStore';
import { socket } from './stores/socketStore';
import type { UserProfile } from '@yuyou/shared';
import Landing from './pages/Landing';
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
import LegalDoc from './pages/LegalDoc';
import GuestPreview from './pages/GuestPreview';
import Layout from './components/Layout';
import PageLoader from './components/PageLoader';

function App() {
  const connect = useSocketStore((s) => s.connect);
  const profile = useUserStore((s) => s.profile);
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
          const p: UserProfile = {
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
          useUserStore.getState().setProfile(p);

          if (socket && socket.connected) {
            const token = localStorage.getItem('yuyou-token');
            const profileInput: any = {
              avatar: p.avatar,
              nickname: p.nickname,
              realName: p.realName,
              gender: p.gender,
              birthDate: p.birthDate,
              province: p.province,
              city: p.city,
              wechatId: p.wechatId,
              bio: p.bio,
              token: token || undefined,
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
        localStorage.removeItem('yuyou-token');
        localStorage.removeItem('yuyou-user');
      })
      .finally(() => setIsCheckingToken(false));
  }, []);

  if (isCheckingToken) {
    return <PageLoader />;
  }

  // 用 profile（zustand 响应式）+ token 双重判断，确保登录后能正确跳转
  const hasToken = !!(profile || localStorage.getItem('yuyou-token'));

  return (
    <Routes>
      <Route path="/" element={hasToken ? <Navigate to="/match" replace /> : <Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login defaultMode="register" />} />
      <Route path="/guest" element={<GuestPreview />} />
      <Route path="/terms" element={<LegalDoc type="terms" />} />
      <Route path="/privacy" element={<LegalDoc type="privacy" />} />

      <Route element={<Layout />}>
        <Route path="/profile" element={hasToken ? <ProfileSetup /> : <Navigate to="/login" replace />} />
        <Route path="/match" element={hasToken ? <Match /> : <Navigate to="/login" replace />} />
        <Route path="/chat/:sessionId" element={hasToken ? <Chat /> : <Navigate to="/login" replace />} />
        <Route path="/history" element={hasToken ? <History /> : <Navigate to="/login" replace />} />
        <Route path="/settings" element={hasToken ? <Settings /> : <Navigate to="/login" replace />} />
        <Route path="/agents" element={hasToken ? <AgentList /> : <Navigate to="/login" replace />} />
        <Route path="/agents/create" element={hasToken ? <AgentEdit /> : <Navigate to="/login" replace />} />
        <Route path="/agents/:id/edit" element={hasToken ? <AgentEdit /> : <Navigate to="/login" replace />} />
        <Route path="/agents/:id/chat" element={hasToken ? <AgentChat /> : <Navigate to="/login" replace />} />
        <Route path="/admin" element={<AdminAuth />} />
        <Route path="/admin/test" element={<AdminTest />} />
      </Route>
    </Routes>
  );
}

export default App;
