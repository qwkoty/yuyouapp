import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { socket } from '../stores/socketStore';
import { MatchFilters } from '@yuyou/shared';
import { PROVINCES, PROVINCE_CITIES } from '../lib/cityData';
import { Heart, MapPin, SlidersHorizontal, X, Zap, Users, Clock, Shield, ChevronDown, Minus, Plus, RefreshCw } from 'lucide-react';
import { toast } from '../components/Toast';

const FEATURE_TOOLTIPS = {
  '88秒': '匹配成功后开启88秒倒计时聊天，超时自动结束',
  '隐私': '开启后隐藏你的地区、年龄等敏感信息',
  '同城': '优先匹配和你同城市的用户，线下相见更便利',
};

export default function Match() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const setSession = useChatStore((s) => s.setSession);

  const [showFilters, setShowFilters] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [matchedPartner, setMatchedPartner] = useState<any>(null);
  const [matchElapsed, setMatchElapsed] = useState(0);
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);

  const [filters, setFilters] = useState<MatchFilters>(() => {
    try {
      const saved = localStorage.getItem('yuyou-match-filters');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { province: undefined, city: undefined, minAge: undefined, maxAge: undefined, gender: undefined };
  });
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  useEffect(() => {
    localStorage.setItem('yuyou-match-filters', JSON.stringify(filters));
  }, [filters]);

  // 恢复 profile
  useEffect(() => {
    if (profile) return;
    const token = localStorage.getItem('yuyou-token');
    if (!token) return;
    fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.user) {
          const u = data.user;
          useUserStore.getState().setProfile({
            id: u.id, avatar: u.avatar || '', nickname: u.nickname || '',
            realName: u.real_name || u.realName || '', gender: u.gender || 'male',
            birthDate: u.birth_date || u.birthDate || '2000-01-01', age: u.age || 0,
            province: u.province || '', city: u.city || '',
            wechatId: u.wechat_id || u.wechatId || '', bio: u.bio || '',
            createdAt: u.created_at ? new Date(u.created_at).getTime() : Date.now(),
          });
        }
      })
      .catch(() => {});
  }, [profile]);

  useEffect(() => {
    if (!socket) return;

    const onMatchSuccess = (data: { sessionId: string; partner: any }) => {
      setIsMatching(false);
      setMatchedPartner(data.partner);
      setSession(data.sessionId, data.partner);
      setTimeout(() => { setMatchedPartner(null); navigate(`/chat/${data.sessionId}`); }, 2500);
    };

    const onMatchFailed = (data: { reason: string }) => {
      setIsMatching(false);
      setMatchError(data.reason);
    };

    const onMatchWaiting = () => { setMatchError(''); };

    socket.on('match:success', onMatchSuccess);
    socket.on('match:failed', onMatchFailed);
    socket.on('match:waiting', onMatchWaiting);

    const onAdminStats = (data: { onlineCount: number }) => setOnlineCount(data.onlineCount);
    socket.on('admin:stats', onAdminStats);

    // 连接成功后立即请求一次，并每10秒轮询
    const requestStats = () => socket!.emit('admin:get_stats');
    requestStats();
    const statsInterval = setInterval(requestStats, 10000);

    return () => {
      socket!.off('match:success', onMatchSuccess);
      socket!.off('match:failed', onMatchFailed);
      socket!.off('match:waiting', onMatchWaiting);
      socket!.off('admin:stats', onAdminStats);
      clearInterval(statsInterval);
    };
  }, [navigate, setSession]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleMatch = useCallback(() => {
    if (!socket || !socket.connected) { setMatchError('网络连接异常，请稍后重试'); return; }
    if (!profile) { setMatchError('正在加载个人信息，请稍候'); return; }

    const matchFilters: MatchFilters = {};
    if (filters.province && filters.province !== '不限') matchFilters.province = filters.province;
    if (filters.city && filters.city !== '不限') matchFilters.city = filters.city;
    if (filters.minAge !== undefined) matchFilters.minAge = filters.minAge;
    if (filters.maxAge !== undefined) matchFilters.maxAge = filters.maxAge;
    if (filters.gender) matchFilters.gender = filters.gender;

    setIsMatching(true);
    setMatchError('');
    setMatchElapsed(0);

    // 倒计时
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setMatchElapsed((prev) => prev + 1);
    }, 1000);

    // 30秒超时
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsMatching(false);
      setMatchError('当前没有合适的用户，试试调整筛选条件');
    }, 30000);

    socket.emit('match:request', matchFilters, (result) => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (!result.success) {
        setIsMatching(false);
        setMatchError(result.error || '匹配失败');
      }
    });
  }, [socket, profile, filters]);

  const handleCancel = useCallback(() => {
    if (!socket) return;
    socket.emit('match:cancel');
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setIsMatching(false);
  }, [socket]);

  const handleRetry = () => {
    setMatchError('');
    handleMatch();
  };

  const filterCount = [filters.province, filters.city, filters.minAge, filters.maxAge, filters.gender].filter(Boolean).length;
  const estimatedWait = Math.max(0, 15 - matchElapsed);

  return (
    <div className="min-h-screen bg-surface-950 relative flex flex-col page-enter">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary-500/[0.02] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-8">
        {/* 筛选面板 */}
        {showFilters && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end" onClick={() => setShowFilters(false)}>
            <div className="bg-surface-800 w-full rounded-t-3xl p-5 pb-28 space-y-5 border-t border-white/[0.04] animate-slide-up max-h-[85vh] overflow-y-auto scrollbar-hide" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-white">匹配筛选</h3>
                <button onClick={() => setShowFilters(false)} className="w-8 h-8 rounded-full bg-surface-700/50 flex items-center justify-center text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-400">地区</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowProvinceDropdown(!showProvinceDropdown); setShowCityDropdown(false); }}
                      className="w-full px-4 py-3.5 input-dark rounded-2xl text-white text-left text-sm font-medium flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-gray-500" />{filters.province || '不限省份'}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showProvinceDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showProvinceDropdown && (
                      <div className="mt-1 p-2 card-elevated rounded-2xl max-h-48 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                        <button type="button" onClick={() => { setFilters((f) => ({ ...f, province: undefined, city: undefined })); setShowProvinceDropdown(false); }} className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${!filters.province ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'}`}>不限</button>
                        {PROVINCES.filter(p => p !== '不限').map((p) => (
                          <button key={p} type="button" onClick={() => { setFilters((f) => ({ ...f, province: p, city: undefined })); setShowProvinceDropdown(false); }} className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${filters.province === p ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'}`}>{p}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => filters.province && setShowCityDropdown(!showCityDropdown)} disabled={!filters.province} className="w-full px-4 py-3.5 input-dark rounded-2xl text-white text-left text-sm font-medium flex items-center justify-between disabled:opacity-40">
                      <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-gray-500" />{filters.city || '不限城市'}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showCityDropdown && filters.province && (
                      <div className="mt-1 p-2 card-elevated rounded-2xl max-h-48 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                        <button type="button" onClick={() => { setFilters((f) => ({ ...f, city: undefined })); setShowCityDropdown(false); }} className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${!filters.city ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'}`}>不限</button>
                        {PROVINCE_CITIES[filters.province]?.map((c) => (
                          <button key={c} type="button" onClick={() => { setFilters((f) => ({ ...f, city: c })); setShowCityDropdown(false); }} className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${filters.city === c ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'}`}>{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">最小年龄</label>
                  <div className="input-dark rounded-2xl p-3 flex items-center justify-between">
                    <button type="button" onClick={() => setFilters((f) => ({ ...f, minAge: f.minAge ? Math.max(10, f.minAge - 1) : 10 }))} className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"><Minus className="w-4 h-4" /></button>
                    <span className="text-lg font-bold text-white">{filters.minAge ?? '不限'}</span>
                    <button type="button" onClick={() => setFilters((f) => ({ ...f, minAge: f.minAge ? Math.min(60, f.minAge + 1) : 10 }))} className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">最大年龄</label>
                  <div className="input-dark rounded-2xl p-3 flex items-center justify-between">
                    <button type="button" onClick={() => setFilters((f) => ({ ...f, maxAge: f.maxAge ? Math.max(10, f.maxAge - 1) : 60 }))} className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"><Minus className="w-4 h-4" /></button>
                    <span className="text-lg font-bold text-white">{filters.maxAge ?? '不限'}</span>
                    <button type="button" onClick={() => setFilters((f) => ({ ...f, maxAge: f.maxAge ? Math.min(60, f.maxAge + 1) : 60 }))} className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">性别</label>
                <div className="flex gap-3">
                  {(['male', 'female'] as const).map((g) => (
                    <button key={g} type="button" onClick={() => setFilters((f) => ({ ...f, gender: f.gender === g ? undefined : g }))} className={`flex-1 py-3 rounded-2xl border font-semibold text-sm transition ${filters.gender === g ? 'bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/20' : 'bg-surface-700/40 text-gray-400 border-white/[0.04]'}`}>
                      {g === 'male' ? '男' : '女'}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setShowFilters(false)} className="w-full py-3.5 btn-primary rounded-2xl font-bold">确定</button>
            </div>
          </div>
        )}

        {/* 匹配成功过渡页 */}
        {matchedPartner ? (
          <div className="fixed inset-0 bg-surface-950 z-50 flex flex-col items-center justify-center animate-scale-in">
            <style>{`
              @keyframes walkBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
              @keyframes walkLeft { 0% { transform: translateX(-120px); } 100% { transform: translateX(0px); } }
              @keyframes walkRight { 0% { transform: translateX(120px); } 100% { transform: translateX(0px); } }
              @keyframes heartPop { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
              .walk-left { animation: walkLeft 1.5s ease-in-out forwards; }
              .walk-right { animation: walkRight 1.5s ease-in-out forwards; }
              .body-bounce { animation: walkBounce 0.4s ease-in-out infinite; }
              .heart-pop { animation: heartPop 0.5s ease-out 1.5s both; }
            `}</style>

            <div className="relative w-80 h-40 mb-8">
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="walk-left absolute bottom-1 left-1/2 -translate-x-1/2">
                <div className="body-bounce flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-400 border-2 border-blue-300 shadow-lg shadow-blue-500/20" />
                  <div className="w-5 h-7 bg-blue-400 rounded-sm mt-0.5" />
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-7 bg-blue-500 rounded-full" />
                    <div className="w-1.5 h-7 bg-blue-500 rounded-full" />
                  </div>
                </div>
              </div>
              <div className="walk-right absolute bottom-1 left-1/2 -translate-x-1/2">
                <div className="body-bounce flex flex-col items-center" style={{ animationDelay: '0.1s' }}>
                  <div className={`w-8 h-8 rounded-full border-2 shadow-lg ${matchedPartner.gender === 'female' ? 'bg-pink-400 border-pink-300 shadow-pink-500/20' : 'bg-blue-400 border-blue-300 shadow-blue-500/20'}`} />
                  <div className={`w-5 h-7 rounded-sm mt-0.5 ${matchedPartner.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`} />
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-7 bg-blue-500 rounded-full" />
                    <div className="w-1.5 h-7 bg-blue-500 rounded-full" />
                  </div>
                </div>
              </div>
              <div className="heart-pop absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4">
                <Heart className="w-8 h-8 text-pink-400 fill-pink-400" />
              </div>
            </div>

            <div className="text-center space-y-3">
              <h2 className="text-2xl font-black text-white">匹配成功！</h2>
              <p className="text-gray-300">你和 <span className="text-primary-400 font-bold">{matchedPartner.nickname}</span> 相遇了</p>
            </div>

            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-500/10 border border-primary-500/15 mt-6">
              <Clock className="w-4 h-4 text-primary-400" />
              <span className="text-sm text-primary-300 font-medium">即将开始88秒限时聊天...</span>
            </div>
          </div>
        ) : isMatching ? (
          <div className="flex flex-col items-center gap-6 animate-scale-in w-full max-w-sm">
            <div className="relative">
              <div className="w-40 h-40 rounded-full bg-primary-500/[0.04] flex items-center justify-center animate-pulse-glow">
                <Heart className="w-20 h-20 text-primary-500 fill-primary-500 animate-float" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/15 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-primary-400/10 animate-ping" style={{ animationDelay: '0.5s' }} />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">正在寻找有缘人</p>
              <p className="text-sm text-gray-400 mt-2">
                {estimatedWait > 0 ? `预计等待 ${estimatedWait} 秒` : '继续等待中...'}
              </p>
            </div>

            {/* 等待进度条 */}
            <div className="w-full max-w-xs">
              <div className="h-1.5 rounded-full bg-surface-700/30 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-pink-500 transition-all duration-1000"
                  style={{ width: `${Math.min(100, (matchElapsed / 30) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs text-gray-500">
                <span>{matchElapsed}s</span>
                <span>30s</span>
              </div>
            </div>

            {onlineCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-700/30 border border-white/[0.04]">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-gray-400">当前 <span className="text-white font-bold">{onlineCount}</span> 人在线</span>
              </div>
            )}

            <button onClick={handleCancel} className="px-8 py-3 rounded-2xl bg-surface-700/40 text-gray-400 hover:text-white hover:bg-surface-600/60 transition-all font-medium">
              取消匹配
            </button>
          </div>
        ) : (
          <>
            {/* 个人资料卡片 */}
            {profile && (
              <div className="w-full card-elevated rounded-3xl p-5 mb-6 animate-slide-up cursor-pointer" onClick={() => navigate('/profile')}>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-600/5 flex items-center justify-center text-3xl border border-primary-500/15 overflow-hidden">
                    {profile.avatar.startsWith('data:') ? <img src={profile.avatar} alt="头像" className="w-full h-full object-cover" /> : profile.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-lg">{profile.nickname}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-300 border border-primary-500/15">
                        {profile.gender === 'male' ? '男' : '女'} · {profile.age}岁
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-400 mt-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {profile.province} {profile.city}
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-500 -rotate-90" />
                </div>
              </div>
            )}

            {/* 功能特色卡片 - 升级带tooltip */}
            <div className="w-full grid grid-cols-3 gap-3 mb-6">
              {[
                { key: '88秒', icon: Clock, label: '88秒限时', color: 'amber' },
                { key: '隐私', icon: Shield, label: '隐私保护', color: 'emerald' },
                { key: '同城', icon: Users, label: '同城匹配', color: 'blue' },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.key}
                    onMouseEnter={() => setHoveredTip(f.key)}
                    onMouseLeave={() => setHoveredTip(null)}
                    onClick={() => toast.info(FEATURE_TOOLTIPS[f.key as keyof typeof FEATURE_TOOLTIPS])}
                    className="card-elevated rounded-2xl p-3 flex flex-col items-center text-center cursor-pointer relative"
                  >
                    <div className={`w-9 h-9 rounded-xl bg-${f.color}-500/10 flex items-center justify-center mb-2`}>
                      <Icon className={`w-4 h-4 text-${f.color}-400`} />
                    </div>
                    <span className="text-xs text-gray-300">{f.label}</span>
                    {hoveredTip === f.key && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-xs text-gray-200 whitespace-nowrap z-20 max-w-[200px]">
                        {FEATURE_TOOLTIPS[f.key as keyof typeof FEATURE_TOOLTIPS]}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-2 h-2 rotate-45 bg-surface-900 border-r border-b border-white/10" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 匹配按钮 + 筛选按钮（放一起） */}
            <div className="flex items-center gap-4">
              {/* 筛选按钮（移到匹配按钮旁边） */}
              <button
                onClick={() => setShowFilters(true)}
                className="relative w-14 h-14 rounded-2xl bg-surface-700/30 border border-white/[0.04] text-gray-300 hover:text-white hover:bg-surface-600/50 transition-all flex flex-col items-center justify-center gap-0.5"
              >
                <SlidersHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">筛选</span>
                {filterCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {filterCount}
                  </span>
                )}
              </button>

              <button
                onClick={handleMatch}
                className="relative w-52 h-52 rounded-full btn-primary flex flex-col items-center justify-center text-white hover:scale-105 active:scale-95 transition-all duration-300 animate-pulse-glow"
              >
                <Heart className="w-16 h-16 fill-white mb-3" />
                <span className="text-xl font-black tracking-wide">开始匹配</span>
                <div className="flex items-center gap-1 mt-2 opacity-80">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">88秒限时破冰</span>
                </div>
              </button>

              {/* 在线人数 */}
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex flex-col items-center justify-center">
                <div className="flex items-center gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-black">{onlineCount}</span>
                </div>
                <span className="text-[10px] opacity-80">在线</span>
              </div>
            </div>

            {matchError && (
              <div className="mt-6 px-5 py-4 rounded-2xl bg-red-500/10 border border-red-500/15 space-y-2 max-w-sm w-full">
                <p className="text-sm text-red-400">{matchError}</p>
                <button
                  onClick={handleRetry}
                  className="w-full py-2 rounded-xl bg-red-500/15 text-red-300 hover:bg-red-500/25 transition text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  重新匹配
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
