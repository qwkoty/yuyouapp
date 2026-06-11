import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { Heart, History, User } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);

  const isChat = location.pathname.startsWith('/chat');
  const showNav = profile && !isChat;

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-primary-600/3 rounded-full blur-3xl" />
      </div>

      <main className="flex-1 w-full relative z-10">
        <Outlet />
      </main>

      {showNav && (
        <nav className="glass border-t border-white/5 sticky bottom-0 z-50">
          <div className="w-full flex px-2">
            {[
              { path: '/match', icon: Heart, label: '匹配' },
              { path: '/history', icon: History, label: '历史' },
              { path: '/profile', icon: User, label: '我的' },
            ].map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex-1 flex flex-col items-center py-3 gap-1 transition-all duration-300 relative ${
                    isActive ? 'text-primary-400' : 'text-gray-600'
                  }`}
                >
                  {isActive && (
                    <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-500 rounded-full" />
                  )}
                  <item.icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
                  <span className="text-[11px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
