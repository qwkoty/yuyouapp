import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { socket } from '../stores/socketStore';
import { MatchFilters } from '@yuyou/shared';
import { PROVINCES, PROVINCE_CITIES } from '../lib/cityData';
import { Heart, MapPin, SlidersHorizontal, X, Zap, Users, Clock, Shield, ChevronDown, Minus, Plus, Wifi } from 'lucide-react';
import api from '../lib/apiClient';
import { toast } from '../components/Toast';

const MATCH_TIMEOUT_MS = 30000; // 30 秒超时
const MATCH_TIMEOUT_WARNING_MS = 20000; // 20 秒提示

export default function Match() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const setSession = useChatStore((s) => s.setSession);

  const [showFilters, setShowFilters] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [matchedPartner, setMatchedPartner] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState(false);

  const [filters, setFilters] = useState<MatchFilters>(() => {
    try {
      const saved = localStorage.getItem('yuyou-match-filters');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      province: undefined,
      city: undefined,
      minAge: undefined,
      maxAge: undefined,
      gender: undefined,
    };
  });
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  useEffect(() => {
    localStorage.setItem('yuyou-match-filters', JSON.stringify(filters));
  }, [filters]);

  // 如果profile丢失，主动从API恢复
  useEffect(() => {
    if (profile || profileLoading) return;
    const token = localStorage.getItem('yuyou-token');
    if (!token) return;
    setProfileLoading(true);
    api.post<{ success: boolean; user?: any }>('/auth/verify-token', { token }, { silent: true })
      .then(data => {
        if (data.success && data.user) {
          const u = data.user;
          useUserStore.getState().setProfile({
            id: u.id,
            avatar: u.avatar || '',
            nickname: u.nickname || '',
            realName: u.realName || u.real_name || '',
            gender: u.gender || 'male',
            birthDate: u.birthDate || u.birth_date || '2000-01-01',
            age: u.age || 0,
            province: u.province || '',
            city: u.city || '',
            wechatId: u.wechatId || u.wechat_id || '',
            bio: u.bio || '',
            createdAt: u.createdAt ? new Date(u.createdAt).getTime() : (u.created_at ? new Date(u.created_at).getTime() : Date.now()),
          });
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [profile, profileLoading]);

  // 轮询在线人数
  useEffect(() => {
    let mounted = true;
    const fetchOnline = async () => {
      try {
        const data = await api.get<{ success: boolean; onlineCount: number }>('/stats/online', { silent: true, retry: false });
        if (mounted && data.success) setOnlineCount(data.onlineCount);
      } catch {}
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onMatchSuccess = (data: { sessionId: string; partner: any }) => {
      setIsMatching(false);
      setMatchedPartner(data.partner);
      setSession(data.sessionId, data.partner);
      setTimeoutWarning(false);
      setTimeout(() => {
        setMatchedPartner(null);
        navigate(`/chat/${data.sessionId}`);
      }, 2500);
    };

    const onMatchFailed = (data: { reason: string }) => {
      setIsMatching(false);
      setMatchError(data.reason);
      toast.warning(data.reason || '匹配失败');
    };

    const onMatchWaiting = () => {
      setMatchError('');
    };

    socket.on('match:success', onMatchSuccess);
    socket.on('match:failed', onMatchFailed);
    socket.on('match:waiting', onMatchWaiting);

    return () => {
      socket!.off('match:success', onMatchSuccess);
      socket!.off('match:failed', onMatchFailed);
      socket!.off('match:waiting', onMatchWaiting);
    };
  }, [navigate, setSession]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, []);

  const handleMatch = useCallback(() => {
    if (!socket || !socket.connected) {
      setMatchError('网络连接异常，请稍后重试');
      toast.error('网络连接异常');
      return;
    }
    if (!profile) {
      setMatchError('正在加载个人信息，请稍候');
      return;
    }

    const matchFilters: MatchFilters = {};
    if (filters.province && filters.province !== '不限') matchFilters.province = filters.province;
    if (filters.city && filters.city !== '不限') matchFilters.city = filters.city;
    if (filters.minAge !== undefined) matchFilters.minAge = filters.minAge;
    if (filters.maxAge !== undefined) matchFilters.maxAge = filters.maxAge;
    if (filters.gender) matchFilters.gender = filters.gender;

    setIsMatching(true);
    setMatchError('');
    setTimeoutWarning(false);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // 20 秒友好提示
    warningRef.current = setTimeout(() => {
      setTimeoutWarning(true);
    }, MATCH_TIMEOUT_WARNING_MS);

    // 30 秒超时
    timeoutRef.current = setTimeout(() => {
      setIsMatching(false);
      setTimeoutWarning(false);
      const msg = `当前在线人数较少（${onlineCount || 0}人），可以放宽筛选条件再试`;
      setMatchError(msg);
      toast.warning('匹配超时');
      if (socket) socket.emit('match:cancel');
    }, MATCH_TIMEOUT_MS);

    socket.emit('match:request', matchFilters, (result: any) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (warningRef.current) {
        clearTimeout(warningRef.current);
        warningRef.current = null;
      }
      if (!result.success) {
        setIsMatching(false);
        setMatchError(result.error || '匹配失败');
        toast.error(result.error || '匹配失败');
      }
    });
  }, [socket, profile, filters, onlineCount]);

  const handleCancel = useCallback(() => {
    if (!socket) return;
    socket.emit('match:cancel');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
    setIsMatching(false);
    setTimeoutWarning(false);
  }, [socket]);

  return (
    <div className="min-h-screen bg-surface-950 relative flex flex-col page-enter">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary-500/[0.02] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-8">
        {/* 顶部在线人数（始终显示） */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-700/20 border border-white/[0.04]">
          <Wifi className="w-3 h-3 text-emerald-400" />
          <span className="text-xs text-gray-400">{onlineCount} 在线</span>
        </div>

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
                      <span className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-500" />
                        {filters.province || '不限省份'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showProvinceDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showProvinceDropdown && (
                      <div className="mt-1 p-2 card-elevated rounded-2xl max-h-48 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                        <button
                          type="button"
                          onClick={() => { setFilters((f) => ({ ...f, province: undefined, city: undefined })); setShowProvinceDropdown(false); }}
                          className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${
                            !filters.province ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                          }`}
                        >
                          不限
                        </button>
                        {PROVINCES.filter(p => p !== '不限').map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => { setFilters((f) => ({ ...f, province: p, city: undefined })); setShowProvinceDropdown(false); }}
                            className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${
                              filters.province === p ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => filters.province && setShowCityDropdown(!showCityDropdown)}
                      disabled={!filters.province}
                      className="w-full px-4 py-3.5 input-dark rounded-2xl text-white text-left text-sm font-medium flex items-center justify-between disabled:opacity-40"
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-500" />
                        {filters.city || '不限城市'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showCityDropdown && filters.province && (
                      <div className="mt-1 p-2 card-elevated rounded-2xl max-h-48 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                        <button
                          type="button"
                          onClick={() => { setFilters((f) => ({ ...f, city: undefined })); setShowCityDropdown(false); }}
                          className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${
                            !filters.city ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                          }`}
                        >
                          不限
                        </button>
                        {PROVINCE_CITIES[filters.province]?.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => { setFilters((f) => ({ ...f, city: c })); setShowCityDropdown(false); }}
                            className={`w-full py-2.5 rounded-xl text-sm font-medium transition text-left px-3 ${
                              filters.city === c ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                            }`}
                          >
                            {c}
                          </button>
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
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, minAge: f.minAge ? Math.max(10, f.minAge - 1) : 10 }))}
                      className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-lg font-bold text-white">{filters.minAge ?? '不限'}</span>
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, minAge: f.minAge ? Math.min(60, f.minAge + 1) : 10 }))}
                      className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">最大年龄</label>
                  <div className="input-dark rounded-2xl p-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, maxAge: f.maxAge ? Math.max(10, f.maxAge - 1) : 60 }))}
                      className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-lg font-bold text-white">{filters.maxAge ?? '不限'}</span>
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, maxAge: f.maxAge ? Math.min(60, f.maxAge + 1) : 60 }))}
                      className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">性别</label>
                <div className="flex gap-3">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, gender: f.gender === g ? undefined : g }))}
                      className={`flex-1 py-3 rounded-2xl border font-semibold text-sm transition ${
                        filters.gender === g
                          ? 'bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/20'
                          : 'bg-surface-700/40 text-gray-400 border-white/[0.04]'
                      }`}
                    >
                      {g === 'male' ? '男' : '女'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowFilters(false)}
                className="w-full py-3.5 btn-primary rounded-2xl font-bold"
              >
                确定
              </button>
            </div>
          </div>
        )}

        {matchedPartner ? (
          <div className="fixed inset-0 bg-surface-950 z-50 flex flex-col items-center justify-center animate-scale-in">
            <style>{`
              @keyframes walkBounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
              }
              @keyframes walkLeft {
                0% { transform: translateX(-120px); }
                100% { transform: translateX(0px); }
              }
              @keyframes walkRight {
                0% { transform: translateX(120px); }
                100% { transform: translateX(0px); }
              }
              @keyframes heartPop {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.3); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
              .walk-left { animation: walkLeft 1.5s ease-in-out forwards; }
              .walk-right { animation: walkRight 1.5s ease-in-out forwards; }
              .body-bounce { animation: walkBounce 0.4s ease-in-out infinite; }
              .heart-pop { animation: heartPop 0.5s ease-out 1.5s both; }
            `}</style>
            <div className="relative w-80 h-40 mb-8">
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
              <p className="text-gray-400">
                你和 <span className="text-primary-400 font-bold">{matchedPartner.nickname}</span> 相遇了
              </p>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-500/10 border border-primary-500/15 mt-6">
              <Clock className="w-4 h-4 text-primary-400" />
              <span className="text-sm text-primary-300 font-medium">即将开始88秒限时聊天...</span>
            </div>
          </div>
        ) : isMatching ? (
          <div className="flex flex-col items-center gap-8 animate-scale-in">
            <div className="relative">
              <div className="w-40 h-40 rounded-full bg-primary-500/[0.04] flex items-center justify-center animate-breathe">
                <Heart className="w-20 h-20 text-primary-500 fill-primary-500 animate-float" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/15 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-primary-400/10 animate-ping" style={{ animationDelay: '0.5s' }} />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">正在寻找有缘人</p>
              <p className="text-sm text-gray-500 mt-2">匹配成功后将开启88秒深度交流</p>
            </div>
            {onlineCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-700/30 border border-white/[0.04]">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-gray-400">当前 <span className="text-white font-bold">{onlineCount}</span> 人在线</span>
              </div>
            )}
            {timeoutWarning && (
              <div className="px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs max-w-xs text-center">
                当前在线人数较少，可尝试放宽筛选条件
              </div>
            )}
            <button
              onClick={handleCancel}
              className="px-8 py-3 rounded-2xl bg-surface-700/40 text-gray-400 hover:text-white hover:bg-surface-600/60 transition-all font-medium"
            >
              取消匹配
            </button>
          </div>
        ) : (
          <>
            {profile ? (
              <div
                className="w-full card-elevated rounded-3xl p-5 mb-6 animate-slide-up cursor-pointer"
                onClick={() => navigate('/profile')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-600/5 flex items-center justify-center text-3xl border border-primary-500/15 overflow-hidden">
                    {profile.avatar.startsWith('data:') ? (
                      <img src={profile.avatar} alt="头像" className="w-full h-full object-cover" />
                    ) : (
                      profile.avatar
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-lg">{profile.nickname}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-300 border border-primary-500/15">
                        {profile.gender === 'male' ? '男' : '女'} · {profile.age}岁
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {profile.province} {profile.city}
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-500 -rotate-90" />
                </div>
              </div>
            ) : (
              <div className="w-full card-elevated rounded-3xl p-5 mb-6 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-surface-700/40" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-surface-700/40 rounded w-1/3" />
                    <div className="h-3 bg-surface-700/40 rounded w-1/2" />
                  </div>
                </div>
              </div>
            )}

            <div className="w-full grid grid-cols-3 gap-3 mb-8">
              <div className="card-elevated rounded-2xl p-3 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-primary-400" />
                </div>
                <span className="text-xs text-gray-400">88秒限时</span>
              </div>
              <div className="card-elevated rounded-2xl p-3 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-xs text-gray-400">隐私保护</span>
              </div>
              <div className="card-elevated rounded-2xl p-3 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-xs text-gray-400">同城匹配</span>
              </div>
            </div>

            <button
              onClick={handleMatch}
              className="relative w-56 h-56 rounded-full btn-primary flex flex-col items-center justify-center text-white hover:scale-105 active:scale-95 transition-all duration-300 animate-pulse-glow"
            >
              <Heart className="w-16 h-16 fill-white mb-3" />
              <span className="text-xl font-black tracking-wide">开始匹配</span>
              <div className="flex items-center gap-1 mt-2 opacity-80">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">88秒限时破冰</span>
              </div>
            </button>

            <button
              onClick={() => setShowFilters(true)}
              className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-700/20 text-gray-400 hover:text-white hover:bg-surface-700/40 transition-all"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-sm font-medium">筛选条件</span>
              {(filters.province || filters.city || filters.minAge || filters.maxAge || filters.gender) && (
                <span className="w-2 h-2 rounded-full bg-primary-500" />
              )}
            </button>

            {matchError && (
              <div className="mt-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/15 max-w-xs text-center">
                <p className="text-sm text-red-400">{matchError}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
