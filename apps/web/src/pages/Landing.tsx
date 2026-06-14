import { useNavigate } from 'react-router-dom';
import { Heart, Zap, MapPin, MessageCircle, Eye } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-950 relative overflow-hidden flex flex-col">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-primary-500/[0.08] blur-3xl animate-pulse-soft" />
        <div className="absolute top-[20%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-pink-500/[0.06] blur-3xl animate-pulse-soft" style={{ animationDelay: '1.5s' }} />
        <div className="absolute bottom-[-10%] left-[20%] w-[30rem] h-[30rem] rounded-full bg-blue-500/[0.05] blur-3xl animate-pulse-soft" style={{ animationDelay: '3s' }} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* 顶部导航 */}
        <nav className="px-5 md:px-12 py-5 flex items-center justify-between max-w-7xl mx-auto w-full">
          <button
            onClick={() => navigate('/guest')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition"
          >
            <Eye className="w-4 h-4" />
            <span>预览</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#0a0a0a] border border-white/[0.06] flex items-center justify-center font-black text-lg overflow-hidden">
              <span className="bg-gradient-to-b from-purple-400 to-pink-400 bg-clip-text text-transparent">Y</span>
              <span className="text-white/90 -ml-0.5">Y</span>
            </div>
            <span className="font-bold text-white text-lg">遇友</span>
          </div>
          <div className="w-12" />
        </nav>

        {/* 主内容 */}
        <main className="flex-1 flex items-center justify-center px-5 md:px-12">
          <div className="text-center space-y-8 max-w-lg">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-black text-white leading-tight">
                遇见<span className="text-primary-400">心动</span>的那个人
              </h1>
              <p className="text-base md:text-lg text-gray-300 leading-relaxed">
                88秒破冰 · 同城匹配 · AI智能体先聊
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-3.5 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white font-medium hover:bg-white/[0.1] transition text-base"
              >
                登录
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-8 py-3.5 btn-primary rounded-2xl font-bold text-base shadow-xl shadow-primary-500/30 flex items-center justify-center gap-2"
              >
                <Heart className="w-5 h-5" />
                免费注册
              </button>
            </div>

            {/* 简要特性 */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400 pt-6">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>88秒限时破冰</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>同城精准匹配</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-purple-400" />
                <span>AI帮你先聊</span>
              </div>
            </div>
          </div>
        </main>

        {/* 底部 */}
        <footer className="px-5 md:px-12 py-6 max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-center text-xs text-gray-600">
            <p>© 2026 遇友 · 限时破冰社交</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
