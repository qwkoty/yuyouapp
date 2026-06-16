import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useUserStore } from './stores/userStore';
import { useSocketStore } from './stores/socketStore';
import { socket } from './stores/socketStore';
import type { UserProfile } from '@yuyou/shared';
import Layout from './components/Layout';
import PageLoader from './components/PageLoader';

// ⚡ 懒加载所有页面，按需加载减小首屏体积
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const ProfileSetup = lazy(() => import('./pages/ProfileSetup'));
const Match = lazy(() => import('./pages/Match'));
const Chat = lazy(() => import('./pages/Chat'));
const History = lazy(() => import('./pages/History'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminAuth = lazy(() => import('./pages/AdminAuth'));
const AdminTest = lazy(() => import('./pages/AdminTest'));
const ServerStatus = lazy(() => import('./pages/ServerStatus'));
const DatabaseStatus = lazy(() => import('./pages/DatabaseStatus'));
const AgentList = lazy(() => import('./pages/AgentList'));
const AgentEdit = lazy(() => import('./pages/AgentEdit'));
const AgentChat = lazy(() => import('./pages/AgentChat'));
const LegalDoc = lazy(() => import('./pages/LegalDoc'));
const GuestPreview = lazy(() => import('./pages/GuestPreview'));

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

    // ⚡ 优化：超时 3 秒后自动放行，避免网络慢时白屏太久
    const timeoutId = setTimeout(() => setIsCheckingToken(false), 3000);

    fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId);
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
            tags: u.tags || [],
            blockedUsers: u.blocked_users || u.blockedUsers || [],
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
              tags: p.tags,
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
        clearTimeout(timeoutId);
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
    <Suspense fallback={<PageLoader />}>
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
          <Route path="/admin/server" element={<ServerStatus />} />
          <Route path="/admin/database" element={<DatabaseStatus />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
