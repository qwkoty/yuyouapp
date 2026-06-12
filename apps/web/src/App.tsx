import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useUserStore } from './stores/userStore';
import { useSocketStore } from './stores/socketStore';
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

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            profile ? <Navigate to="/match" replace /> : <Navigate to="/profile" replace />
          }
        />
        <Route path="/profile" element={<ProfileSetup />} />
        <Route
          path="/match"
          element={profile ? <Match /> : <Navigate to="/profile" replace />}
        />
        <Route
          path="/chat/:sessionId"
          element={profile ? <Chat /> : <Navigate to="/profile" replace />}
        />
        <Route
          path="/history"
          element={profile ? <History /> : <Navigate to="/profile" replace />}
        />
        <Route
          path="/settings"
          element={profile ? <Settings /> : <Navigate to="/profile" replace />}
        />
        <Route path="/admin" element={<AdminAuth />} />
        <Route path="/admin/test" element={<AdminTest />} />
      </Route>
    </Routes>
  );
}

export default App;
