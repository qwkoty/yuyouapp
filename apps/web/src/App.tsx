import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useUserStore } from './stores/userStore';
import { useSocketStore } from './stores/socketStore';
import { socket } from './stores/socketStore';
import type { UserProfile } from '@yuyou/shared';
import Layout from './components/Layout';
import PageLoader from './components/PageLoader';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';

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

  useEffect(() => {
    connect();
  }, [connect]);

  // ⚡ 优化：不再阻塞首屏渲染。先用 zustand persist 恢复的 profile 立即渲染，
  // token 验证在后台异步进行，验证失败再跳转登录。
  useEffect(() => {
    const token = localStorage.getItem('yuyou-token');
    if (!token) return;

    // 后台验证 token，不阻塞渲染
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
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
            const tk = localStorage.getItem('yuyou-token');
            socket.emit('profile:update', {
              avatar: p.avatar, nickname: p.nickname, realName: p.realName,
              gender: p.gender, birthDate: p.birthDate, province: p.province,
              city: p.city, wechatId: p.wechatId, bio: p.bio, tags: p.tags,
              token: tk || undefined,
            } as any, () => {});
          }
        } else {
          localStorage.removeItem('yuyou-token');
          localStorage.removeItem('yuyou-user');
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        // 网络错误不清除 token，可能是临时网络问题
      });

    // ⚡ 组件卸载时清理，避免内存泄漏与 setState on unmounted
    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  // ⚡ 仅以 token 判断是否登录，避免 profile 残留导致错误跳转
  const hasToken = !!localStorage.getItem('yuyou-token');

  return (
    <ErrorBoundary>
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

          {/* ⚡ 404 兜底：未匹配路由统一回首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
