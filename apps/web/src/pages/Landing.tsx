import { useNavigate } from 'react-router-dom';
import { Heart, Shield, MapPin, Clock, Users, MessageCircle, Sparkles, ArrowRight, CheckCircle2, Zap, Eye } from 'lucide-react';
import { useState } from 'react';

const FEATURES = [
  {
    icon: Clock,
    title: '88秒限时破冰',
    desc: '匹配成功后开启88秒倒计时，告别尬聊与冷场',
    color: 'from-amber-500/20 to-orange-500/10',
    iconColor: 'text-amber-400',
  },
  {
    icon: MapPin,
    title: '同城精准匹配',
    desc: '基于位置优先匹配同城市用户，线下相见更便利',
    color: 'from-emerald-500/20 to-teal-500/10',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Shield,
    title: '隐私保护',
    desc: '开启后隐藏地区、年龄等敏感信息，安心社交',
    color: 'from-blue-500/20 to-cyan-500/10',
    iconColor: 'text-blue-400',
  },
  {
    icon: MessageCircle,
    title: 'AI 智能体',
    desc: '配置你的 AI 智能体，帮你先聊一步',
    color: 'from-purple-500/20 to-pink-500/10',
    iconColor: 'text-purple-400',
  },
];

const STEPS = [
  { num: '01', title: '完善资料', desc: '设置头像、昵称、兴趣标签' },
  { num: '02', title: '一键匹配', desc: '系统为你推荐合适的同城用户' },
  { num: '03', title: '88秒破冰', desc: '限时聊天，告别开场白焦虑' },
  { num: '04', title: '加个微信', desc: '聊得来就互加微信延续缘分' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-surface-950 relative overflow-hidden">
      {/* 装饰背景 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-primary-500/[0.08] blur-3xl animate-pulse-soft" />
        <div className="absolute top-[20%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-pink-500/[0.06] blur-3xl animate-pulse-soft" style={{ animationDelay: '1.5s' }} />
        <div className="absolute bottom-[-10%] left-[20%] w-[30rem] h-[30rem] rounded-full bg-blue-500/[0.05] blur-3xl animate-pulse-soft" style={{ animationDelay: '3s' }} />
        {/* 网格纹理 */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative z-10">
        {/* 顶部导航 */}
        <nav className="px-5 md:px-12 py-5 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center font-black text-white text-lg">遇</div>
            <span className="font-bold text-white text-lg">遇友</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => navigate('/login?mode=guest')}
              className="px-3 md:px-4 py-2 text-sm text-gray-300 hover:text-white transition flex items-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden md:inline">游客预览</span>
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-4 md:px-5 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm font-medium hover:bg-white/[0.1] transition"
            >
              登录
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-4 md:px-5 py-2 rounded-xl btn-primary text-sm font-bold"
            >
              免费注册
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section className="px-5 md:px-12 pt-12 md:pt-20 pb-16 max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                限时破冰社交新方式
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-white leading-tight">
                遇见<span className="text-primary-400">心动</span>的<span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">那个人</span>
              </h1>
              <p className="text-base md:text-lg text-gray-300 leading-relaxed max-w-lg">
                88 秒破冰，同城匹配，AI 智能体先聊。告别尬聊与冷场，<br className="hidden md:inline" />
                遇见真正懂你的朋友。
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => navigate('/register')}
                  className="px-6 py-3.5 btn-primary rounded-2xl font-bold flex items-center gap-2 text-base shadow-xl shadow-primary-500/30"
                >
                  立即开始
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => navigate('/login?mode=guest')}
                  className="px-6 py-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white font-medium hover:bg-white/[0.08] transition"
                >
                  先逛逛看
                </button>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-400 pt-2">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary-400" />
                  <span>10,000+ 用户</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>真实社交</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>88 秒破冰</span>
                </div>
              </div>
            </div>

            {/* 右侧装饰卡片 */}
            <div className="relative hidden md:block">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-pink-500/10 rounded-3xl blur-2xl" />
              <div className="relative space-y-4">
                {/* 模拟匹配卡片 */}
                <div className="card-elevated rounded-3xl p-5 transform hover:scale-105 transition-transform duration-500">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg">林</div>
                    <div>
                      <h3 className="font-bold text-white">林小雨</h3>
                      <p className="text-sm text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> 北京 · 海淀区</p>
                    </div>
                    <div className="ml-auto">
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">在线</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300">喜欢摄影、旅行、撸猫，寻找同城有趣的灵魂 💫</p>
                </div>

                <div className="card-elevated rounded-3xl p-5 transform hover:scale-105 transition-transform duration-500 translate-x-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-xl font-bold text-white shadow-lg">陈</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white">陈宇航</h3>
                      <p className="text-xs text-gray-400">北京 · 朝阳区 · 25岁</p>
                    </div>
                    <Heart className="w-5 h-5 text-pink-400 animate-pulse-soft" />
                  </div>
                </div>

                <div className="card-elevated rounded-3xl p-4 transform hover:scale-105 transition-transform duration-500 -translate-x-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-bold text-white">A</div>
                      <div>
                        <p className="text-sm font-medium text-white">AI 智能体</p>
                        <p className="text-xs text-gray-400">已为你先聊 5 句</p>
                      </div>
                    </div>
                    <span className="text-xs text-primary-400 font-medium">查看 →</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 核心功能 */}
        <section className="px-5 md:px-12 py-16 max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">为什么选择 <span className="text-primary-400">遇友</span></h2>
            <p className="text-gray-400 max-w-2xl mx-auto">4 大核心功能，让社交更简单、更有趣、更安全</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredFeature(i)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  className={`relative card-elevated rounded-2xl p-6 transition-all duration-300 ${hoveredFeature === i ? 'scale-105 -translate-y-1' : ''}`}
                >
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${f.color} opacity-0 ${hoveredFeature === i ? 'opacity-100' : ''} transition-opacity`} />
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mb-4`}>
                      <Icon className={`w-6 h-6 ${f.iconColor}`} />
                    </div>
                    <h3 className="font-bold text-white mb-2">{f.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 玩法步骤 */}
        <section className="px-5 md:px-12 py-16 max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">3 步开启<span className="text-primary-400">缘分</span></h2>
            <p className="text-gray-400">简单 4 步，遇见有趣的人</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <div key={i} className="card-elevated rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute -top-4 -right-4 text-7xl font-black text-white/[0.03] select-none">{s.num}</div>
                <div className="relative">
                  <div className="text-3xl font-black text-primary-400/40 mb-2">{s.num}</div>
                  <h3 className="font-bold text-white text-lg mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-400">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 底部 CTA */}
        <section className="px-5 md:px-12 py-16 max-w-5xl mx-auto">
          <div className="relative card-elevated rounded-3xl p-8 md:p-12 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-pink-500/5" />
            <div className="relative text-center space-y-5">
              <h2 className="text-3xl md:text-4xl font-bold text-white">准备好遇见<span className="text-primary-400">有趣的灵魂</span>了吗？</h2>
              <p className="text-gray-300">注册即送 3 次免费匹配机会</p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  onClick={() => navigate('/register')}
                  className="px-8 py-4 btn-primary rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-primary-500/30"
                >
                  免费注册
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="px-8 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white font-medium hover:bg-white/[0.08] transition"
                >
                  已有账号？登录
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 底部协议 */}
        <footer className="px-5 md:px-12 py-8 max-w-7xl mx-auto border-t border-white/[0.04]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500">
            <p>© 2026 遇友 · 限时破冰社交</p>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/terms')} className="hover:text-white transition">服务条款</button>
              <button onClick={() => navigate('/privacy')} className="hover:text-white transition">隐私政策</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
