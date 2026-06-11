import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { socket } from '../stores/socketStore';
import { MatchFilters } from '@yuyou/shared';
import { Heart, MapPin, SlidersHorizontal, X, Settings, LogOut, Zap } from 'lucide-react';

const PROVINCES = [
  '不限', '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆', '台湾',
];

export default function Match() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
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

  const handleLogout = () => {
    setProfile(undefined as any);
    localStorage.removeItem('yuyou-user');
    navigate('/profile');
  };

  const ageOptions = Array.from({ length: 43 }, (_, i) => i + 18);

  return (
    <div className="min-h-screen bg-surface-900 relative flex flex-col">
      {/* 背景光效 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary-500/3 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-8">
        {/* 筛选面板 */}
        {showFilters && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end">
            <div className="bg-surface-800 w-full rounded-t-3xl p-5 space-y-5 border-t border-white/5 animate-slide-up">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-white">匹配筛选</h3>
                <button onClick={() => setShowFilters(false)} className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">地区</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROVINCES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, province: p === '不限' ? undefined : p }))}
                      className={`py-2.5 rounded-xl text-sm font-medium transition ${
                        (filters.province || '不限') === p
                          ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'
                          : 'bg-surface-700/50 text-gray-400 hover:bg-surface-600'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-3">最小年龄</label>
                  <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto scrollbar-hide">
                    <button
                      onClick={() => setFilters((f) => ({ ...f, minAge: undefined }))}
                      className={`py-2 rounded-lg text-xs font-medium transition ${
                        !filters.minAge ? 'bg-primary-500 text-white' : 'bg-surface-700/50 text-gray-400 hover:bg-surface-600'
                      }`}
                    >
                      不限
                    </button>
                    {ageOptions.map((a) => (
                      <button
                        key={a}
                        onClick={() => setFilters((f) => ({ ...f, minAge: a }))}
                        className={`py-2 rounded-lg text-xs font-medium transition ${
                          filters.minAge === a ? 'bg-primary-500 text-white' : 'bg-surface-700/50 text-gray-400 hover:bg-surface-600'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-3">最大年龄</label>
                  <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto scrollbar-hide">
                    <button
                      onClick={() => setFilters((f) => ({ ...f, maxAge: undefined }))}
                      className={`py-2 rounded-lg text-xs font-medium transition ${
                        !filters.maxAge ? 'bg-primary-500 text-white' : 'bg-surface-700/50 text-gray-400 hover:bg-surface-600'
                      }`}
                    >
                      不限
                    </button>
                    {ageOptions.map((a) => (
                      <button
                        key={a}
                        onClick={() => setFilters((f) => ({ ...f, maxAge: a }))}
                        className={`py-2 rounded-lg text-xs font-medium transition ${
                          filters.maxAge === a ? 'bg-primary-500 text-white' : 'bg-surface-700/50 text-gray-400 hover:bg-surface-600'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">性别</label>
                <div className="flex gap-3">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, gender: f.gender === g ? undefined : g }))}
                      className={`flex-1 py-3 rounded-2xl border font-semibold text-sm transition ${
                        filters.gender === g
                          ? 'bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/20'
                          : 'bg-surface-700/50 text-gray-400 border-white/5'
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
              <div className="w-40 h-40 rounded-full bg-primary-500/5 flex items-center justify-center animate-pulse-glow">
                <Heart className="w-20 h-20 text-primary-500 fill-primary-500 animate-float" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary-500/20 animate-ping" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">正在寻找有缘人</p>
              <p className="text-sm text-gray-500 mt-2">匹配成功后将开启88秒深度交流</p>
            </div>
            <button
              onClick={handleCancel}
              className="px-8 py-3 rounded-2xl bg-surface-700/50 text-gray-400 hover:text-white hover:bg-surface-600 transition-all font-medium"
            >
              取消匹配
            </button>
          </div>
        ) : (
          <>
            {/* 个人资料卡片 */}
            {profile && (
              <div className="w-full card-elevated rounded-3xl p-5 mb-8 animate-slide-up">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center text-3xl border border-primary-500/20">
                    {profile.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-lg">{profile.nickname}</span>
                      <span className="tag-red text-xs px-2.5 py-0.5 rounded-full font-medium">
                        {profile.gender === 'male' ? '男' : '女'} · {profile.age}岁
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {profile.province} {profile.city}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate('/settings')}
                      className="p-2.5 rounded-xl bg-surface-700/50 text-gray-400 hover:text-white hover:bg-surface-600 transition-all"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleLogout}
                      className="p-2.5 rounded-xl bg-surface-700/50 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

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
              className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition-all"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-sm font-medium">筛选条件</span>
              {(filters.province || filters.minAge || filters.maxAge || filters.gender) && (
                <span className="w-2 h-2 rounded-full bg-primary-500" />
              )}
            </button>

            {matchError && (
              <div className="mt-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{matchError}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
