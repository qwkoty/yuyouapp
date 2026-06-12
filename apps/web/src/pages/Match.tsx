import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { socket } from '../stores/socketStore';
import { MatchFilters } from '@yuyou/shared';
import { PROVINCES } from '../lib/cityData';
import { Heart, MapPin, SlidersHorizontal, X, Zap, Users, Clock, Shield, ChevronDown, Minus, Plus } from 'lucide-react';

export default function Match() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const setSession = useChatStore((s) => s.setSession);

  const [showFilters, setShowFilters] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState('');

  const [filters, setFilters] = useState<MatchFilters>({
    province: undefined,
    minAge: undefined,
    maxAge: undefined,
    gender: undefined,
  });
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const onMatchSuccess = (data: { sessionId: string; partner: any }) => {
      setIsMatching(false);
      setSession(data.sessionId, data.partner);
      navigate(`/chat/${data.sessionId}`);
    };

    const onMatchFailed = (data: { reason: string }) => {
      setIsMatching(false);
      setMatchError(data.reason);
    };

    const onMatchWaiting = () => {
      setMatchError('');
    };

    socket.on('match:success', onMatchSuccess);
    socket.on('match:failed', onMatchFailed);
    socket.on('match:waiting', onMatchWaiting);

    return () => {
      if (socket) {
        socket.off('match:success', onMatchSuccess);
        socket.off('match:failed', onMatchFailed);
        socket.off('match:waiting', onMatchWaiting);
      }
    };
  }, [navigate, setSession]);

  const handleMatch = useCallback(() => {
    if (!socket || !profile) return;
    setIsMatching(true);
    setMatchError('');

    const matchFilters: MatchFilters = {};
    if (filters.province && filters.province !== '不限') matchFilters.province = filters.province;
    if (filters.minAge) matchFilters.minAge = Number(filters.minAge);
    if (filters.maxAge) matchFilters.maxAge = Number(filters.maxAge);
    if (filters.gender) matchFilters.gender = filters.gender;

    socket.emit('match:request', matchFilters, (result) => {
      if (!result.success) {
        setIsMatching(false);
        setMatchError(result.error || '匹配失败');
      }
    });
  }, [profile, filters]);

  const handleCancel = useCallback(() => {
    if (!socket) return;
    socket.emit('match:cancel');
    setIsMatching(false);
  }, []);

  return (
    <div className="min-h-screen bg-surface-950 relative flex flex-col page-enter">
      {/* 背景光效 */}
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

              {/* 省份 - 简化下拉 */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-400 mb-2">地区</label>
                <button
                  type="button"
                  onClick={() => setShowProvinceDropdown(!showProvinceDropdown)}
                  className="w-full px-5 py-3.5 input-dark rounded-2xl text-white text-left font-medium flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    {filters.province || '不限地区'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showProvinceDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showProvinceDropdown && (
                  <div className="mt-1 p-2 card-elevated rounded-2xl grid grid-cols-3 gap-1 max-h-52 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                    <button
                      type="button"
                      onClick={() => { setFilters((f) => ({ ...f, province: undefined })); setShowProvinceDropdown(false); }}
                      className={`py-2.5 rounded-xl text-sm font-medium transition ${
                        !filters.province ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      不限
                    </button>
                    {PROVINCES.filter(p => p !== '不限').map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setFilters((f) => ({ ...f, province: p })); setShowProvinceDropdown(false); }}
                        className={`py-2.5 rounded-xl text-sm font-medium transition ${
                          filters.province === p ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 年龄范围 - 滑动式 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">最小年龄</label>
                  <div className="input-dark rounded-2xl p-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, minAge: f.minAge ? Math.max(18, f.minAge - 1) : 18 }))}
                      className="w-9 h-9 rounded-lg bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-lg font-bold text-white">{filters.minAge ?? '不限'}</span>
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, minAge: f.minAge ? Math.min(60, f.minAge + 1) : 18 }))}
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
                      onClick={() => setFilters((f) => ({ ...f, maxAge: f.maxAge ? Math.max(18, f.maxAge - 1) : 60 }))}
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

              {/* 性别 */}
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

        {/* 匹配中动画 */}
        {isMatching ? (
          <div className="flex flex-col items-center gap-8 animate-scale-in">
            <div className="relative">
              <div className="w-40 h-40 rounded-full bg-primary-500/[0.04] flex items-center justify-center animate-pulse-glow">
                <Heart className="w-20 h-20 text-primary-500 fill-primary-500 animate-float" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/15 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-primary-400/10 animate-ping" style={{ animationDelay: '0.5s' }} />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">正在寻找有缘人</p>
              <p className="text-sm text-gray-500 mt-2">匹配成功后将开启88秒深度交流</p>
            </div>
            <button
              onClick={handleCancel}
              className="px-8 py-3 rounded-2xl bg-surface-700/40 text-gray-400 hover:text-white hover:bg-surface-600/60 transition-all font-medium"
            >
              取消匹配
            </button>
          </div>
        ) : (
          <>
            {/* 个人资料卡片 */}
            {profile && (
              <div
                className="w-full card-elevated rounded-3xl p-5 mb-6 animate-slide-up cursor-pointer"
                onClick={() => navigate('/profile')}
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-600/5 flex items-center justify-center text-3xl border border-primary-500/15">
                    {profile.avatar}
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
            )}

            {/* 功能特色卡片 */}
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

            {/* 匹配按钮 */}
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

            {/* 筛选按钮 */}
            <button
              onClick={() => setShowFilters(true)}
              className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-700/20 text-gray-400 hover:text-white hover:bg-surface-700/40 transition-all"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-sm font-medium">筛选条件</span>
              {(filters.province || filters.minAge || filters.maxAge || filters.gender) && (
                <span className="w-2 h-2 rounded-full bg-primary-500" />
              )}
            </button>

            {matchError && (
              <div className="mt-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/15">
                <p className="text-sm text-red-400">{matchError}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
