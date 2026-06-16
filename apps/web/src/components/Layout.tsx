import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { Heart, History, User, Bot } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);

  // ⚡ 修复：AgentChat 路由 /agents/:id/chat 也是全屏聊天，需隐藏底部导航
  const isChat = location.pathname.startsWith('/chat') ||
    /^\/agents\/[^/]+\/chat$/.test(location.pathname);
  const showNav = profile && !isChat;

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-primary-600/[0.02] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-primary-700/[0.02] rounded-full blur-[80px]" />
      </div>

      <main className="flex-1 w-full relative z-10">
        <Outlet />
      </main>

      {showNav && (
        <nav className="glass border-t border-white/[0.04] sticky bottom-0 z-50 safe-bottom">
          <div className="w-full flex px-1">
            {[
              { path: '/match', icon: Heart, label: '匹配' },
              { path: '/agents', icon: Bot, label: '智能体' },
              { path: '/history', icon: History, label: '历史' },
              { path: '/profile', icon: User, label: '我的' },
            ].map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-all duration-300 relative ${
                    isActive ? 'text-primary-400' : 'text-gray-600'
                  }`}
                >
                  {isActive && (
                    <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-transparent via-primary-500 to-transparent rounded-full" />
                  )}
                  <item.icon className={`w-[22px] h-[22px] transition-all duration-300 ${isActive ? 'scale-110' : ''}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
