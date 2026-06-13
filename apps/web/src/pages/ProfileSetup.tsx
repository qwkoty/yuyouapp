import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { useSocketStore } from '../stores/socketStore';
import { UserProfileInput } from '@yuyou/shared';
import { PROVINCES, PROVINCE_CITIES } from '../lib/cityData';
import { Settings, LogOut, Sparkles, MapPin, ChevronDown, Check, Camera, ImagePlus } from 'lucide-react';

const EMOJI_AVATARS = ['👤', '😊', '😎', '🥰', '😏', '🤗', '😇', '🤩', '🥳', '😇', '🦊', '🐰', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐧', '🦄', '🐝', '🦋', '🐱', '🐭', '🐹', '🐶', '🐺', '🐴', '🦅', '🦉'];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS_31 = Array.from({ length: 31 }, (_, i) => i + 1);
const DAYS_30 = Array.from({ length: 30 }, (_, i) => i + 1);
const DAYS_29 = Array.from({ length: 29 }, (_, i) => i + 1);

function getDaysInMonth(month: number, year: number): number[] {
  if ([1, 3, 5, 7, 8, 10, 12].includes(month)) return DAYS_31;
  if ([4, 6, 9, 11].includes(month)) return DAYS_30;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  return isLeap ? DAYS_29 : Array.from({ length: 28 }, (_, i) => i + 1);
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const updateProfile = useUserStore((s) => s.updateProfile);
  const existingProfile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const currentYear = new Date().getFullYear();
  const [birthYear, setBirthYear] = useState(existingProfile?.birthDate ? parseInt(existingProfile.birthDate.split('-')[0]) : currentYear - 20);
  const [birthMonth, setBirthMonth] = useState(existingProfile?.birthDate ? parseInt(existingProfile.birthDate.split('-')[1]) : 1);
  const [birthDay, setBirthDay] = useState(existingProfile?.birthDate ? parseInt(existingProfile.birthDate.split('-')[2]) : 1);

  const [form, setForm] = useState<UserProfileInput>({
    avatar: existingProfile?.avatar || EMOJI_AVATARS[0],
    nickname: existingProfile?.nickname || '',
    realName: '',
    gender: existingProfile?.gender || 'male',
    birthDate: existingProfile?.birthDate || `${currentYear - 20}-01-01`,
    province: existingProfile?.province || PROVINCES[0],
    city: existingProfile?.city || '',
    wechatId: existingProfile?.wechatId || '',
    bio: '',
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showProvincePicker, setShowProvincePicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 图片上传：压缩后转为base64存储
  const handleImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('图片不能超过5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 压缩到200x200
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // 居中裁切
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        setForm((f) => ({ ...f, avatar: base64 }));
        setShowAvatarPicker(false);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  // 自动保存：防抖500ms
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const autoSave = useCallback(async (currentForm: UserProfileInput) => {
    // 首次渲染不保存
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // 昵称至少2个字符才保存
    if (!currentForm.nickname.trim() || currentForm.nickname.trim().length < 2) return;
    if (!currentForm.city.trim()) return;

    setSaveStatus('saving');
    try {
      await updateProfile(currentForm);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      // 静默失败，不打扰用户
      setSaveStatus('idle');
    }
  }, [updateProfile]);

  // 监听form变化，自动保存
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      autoSave(form);
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, autoSave]);

  // 省份变化时自动选择第一个城市
  useEffect(() => {
    const cities = PROVINCE_CITIES[form.province] || [];
    if (cities.length > 0 && !cities.includes(form.city)) {
      setForm((f) => ({ ...f, city: cities[0] }));
    }
  }, [form.province]);

  useEffect(() => {
    const y = birthYear;
    const m = String(birthMonth).padStart(2, '0');
    const d = String(birthDay).padStart(2, '0');
    setForm((f) => ({ ...f, birthDate: `${y}-${m}-${d}` }));
  }, [birthYear, birthMonth, birthDay]);

  const age = currentYear - birthYear;
  const currentCities = PROVINCE_CITIES[form.province] || [];

  // 首次创建：点击"开始遇友"按钮
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.nickname.trim() || form.nickname.length < 2 || form.nickname.length > 16) {
      setError('昵称需2-16个字符');
      return;
    }
    if (!form.city.trim()) {
      setError('请选择所在城市');
      return;
    }

    setSaveStatus('saving');
    try {
      await updateProfile(form);
      setSaveStatus('saved');
      navigate('/match');
    } catch (err: any) {
      setError(err.message || '保存失败');
      setSaveStatus('idle');
    }
  };

  const handleLogout = () => {
    const { disconnect } = useSocketStore.getState();
    disconnect();
    setProfile(null);
    localStorage.removeItem('yuyou-user');
    localStorage.removeItem('yuyou-token');
    navigate('/login');
  };

  const yearList = Array.from({ length: 100 }, (_, i) => currentYear - 10 - i);

  return (
    <div className="min-h-screen bg-surface-950 relative page-enter">
      <div className="absolute top-0 left-0 right-0 h-56 bg-gradient-to-b from-primary-500/[0.04] to-transparent pointer-events-none" />
      
      <div className="relative z-10 px-5 pt-6 pb-24">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <div className="w-10" />
          
          {/* 自动保存状态指示 */}
          {existingProfile && (
            <div className="flex items-center gap-1.5">
              {saveStatus === 'saving' && (
                <span className="text-xs text-gray-500">保存中...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Check className="w-3 h-3" />
                  已保存
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            {existingProfile && (
              <>
                <button
                  onClick={() => navigate('/settings')}
                  className="p-2.5 rounded-xl bg-surface-700/40 text-gray-400 hover:text-white hover:bg-surface-600/60 transition-all"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2.5 rounded-xl bg-surface-700/40 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 标题 - 仅在首次创建时显示 */}
        {!existingProfile && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/15 mb-4">
              <Sparkles className="w-3.5 h-3.5 text-primary-400" />
              <span className="text-xs text-primary-300 font-medium">限时88秒 · 破冰交友</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">创建资料</h1>
            <p className="text-sm text-gray-500 mt-2">完善信息，开启你的遇友之旅</p>
          </div>
        )}

        <div className="space-y-6 max-w-md mx-auto">
          {/* 头像 */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
              className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary-500/10 to-primary-600/5 flex items-center justify-center text-5xl border-2 border-primary-500/15 hover:border-primary-500/30 transition-all duration-300 shadow-lg overflow-hidden"
            >
              {form.avatar.startsWith('data:') ? (
                <img src={form.avatar} alt="头像" className="w-full h-full object-cover" />
              ) : (
                form.avatar
              )}
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs shadow-lg shadow-primary-500/30">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
            <span className="text-xs text-gray-500 mt-3">点击更换头像</span>
            
            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
                e.target.value = '';
              }}
            />
            
            {showAvatarPicker && (
              <div className="mt-3 p-3 card-elevated rounded-2xl space-y-3 max-h-64 overflow-y-auto scrollbar-hide animate-scale-in w-full max-w-xs">
                {/* 上传图片按钮 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-500/10 border border-primary-500/15 text-primary-300 hover:bg-primary-500/20 transition"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-sm font-medium">上传图片</span>
                </button>
                {/* Emoji选择 */}
                <div className="grid grid-cols-8 gap-1.5">
                  {EMOJI_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, avatar: emoji }));
                        setShowAvatarPicker(false);
                      }}
                      className={`text-2xl p-2 rounded-xl hover:bg-white/5 transition ${form.avatar === emoji ? 'bg-primary-500/15 ring-1 ring-primary-500/30' : ''}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 昵称 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400 ml-1">昵称</label>
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              placeholder="给自己起个有趣的昵称"
              className="w-full px-5 py-3.5 input-dark rounded-2xl text-white placeholder-gray-600 text-base"
              maxLength={16}
            />
          </div>

          {/* 性别 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400 ml-1">性别</label>
            <div className="flex gap-3">
              {(['male', 'female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, gender: g }))}
                  className={`flex-1 py-3.5 rounded-2xl border font-semibold text-sm transition-all duration-200 ${
                    form.gender === g
                      ? 'bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/20'
                      : 'bg-surface-700/40 text-gray-500 border-white/[0.04] hover:border-white/10'
                  }`}
                >
                  {g === 'male' ? '男生' : '女生'}
                </button>
              ))}
            </div>
          </div>

          {/* 出生年份 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400 ml-1">
              出生年份 <span className="text-primary-400 font-bold">{age}岁</span>
            </label>
            <div className="card-elevated rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setBirthYear((y) => Math.max(yearList[yearList.length - 1], y - 1))}
                  className="w-12 h-12 rounded-xl bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                >
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>
                <span className="text-3xl font-black text-white tabular-nums">{birthYear}</span>
                <button
                  type="button"
                  onClick={() => setBirthYear((y) => Math.min(yearList[0], y + 1))}
                  className="w-12 h-12 rounded-xl bg-surface-700/40 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-600/60 transition"
                >
                  <ChevronDown className="w-5 h-5 -rotate-90" />
                </button>
              </div>
            </div>
          </div>

          {/* 月份和日期 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-gray-400 ml-1">月份</label>
              <button
                type="button"
                onClick={() => { setShowMonthPicker(!showMonthPicker); setShowDayPicker(false); setShowProvincePicker(false); setShowCityPicker(false); }}
                className="w-full px-5 py-3.5 input-dark rounded-2xl text-white text-left font-medium flex items-center justify-between"
              >
                <span>{birthMonth}月</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showMonthPicker ? 'rotate-180' : ''}`} />
              </button>
              {showMonthPicker && (
                <div className="mt-1 p-2 card-elevated rounded-2xl grid grid-cols-4 gap-1 max-h-44 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                  {MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setBirthMonth(m); setShowMonthPicker(false); }}
                      className={`py-2.5 rounded-xl text-sm font-medium transition ${
                        birthMonth === m ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {m}月
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-gray-400 ml-1">日期</label>
              <button
                type="button"
                onClick={() => { setShowDayPicker(!showDayPicker); setShowMonthPicker(false); setShowProvincePicker(false); setShowCityPicker(false); }}
                className="w-full px-5 py-3.5 input-dark rounded-2xl text-white text-left font-medium flex items-center justify-between"
              >
                <span>{birthDay}日</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showDayPicker ? 'rotate-180' : ''}`} />
              </button>
              {showDayPicker && (
                <div className="mt-1 p-2 card-elevated rounded-2xl grid grid-cols-5 gap-1 max-h-44 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                  {getDaysInMonth(birthMonth, birthYear).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setBirthDay(d); setShowDayPicker(false); }}
                      className={`py-2.5 rounded-xl text-sm font-medium transition ${
                        birthDay === d ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 省市联动选择 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-gray-400 ml-1">省份</label>
              <button
                type="button"
                onClick={() => { setShowProvincePicker(!showProvincePicker); setShowCityPicker(false); setShowMonthPicker(false); setShowDayPicker(false); }}
                className="w-full px-5 py-3.5 input-dark rounded-2xl text-white text-left font-medium flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-500" />
                  {form.province}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showProvincePicker ? 'rotate-180' : ''}`} />
              </button>
              {showProvincePicker && (
                <div className="mt-1 p-2 card-elevated rounded-2xl grid grid-cols-3 gap-1 max-h-52 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                  {PROVINCES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { 
                        setForm((f) => ({ ...f, province: p })); 
                        setShowProvincePicker(false); 
                      }}
                      className={`py-2.5 rounded-xl text-sm font-medium transition ${
                        form.province === p ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-gray-400 ml-1">城市</label>
              <button
                type="button"
                onClick={() => { setShowCityPicker(!showCityPicker); setShowProvincePicker(false); setShowMonthPicker(false); setShowDayPicker(false); }}
                className="w-full px-5 py-3.5 input-dark rounded-2xl text-white text-left font-medium flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-gray-500" />
                  {form.city || '选择城市'}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showCityPicker ? 'rotate-180' : ''}`} />
              </button>
              {showCityPicker && (
                <div className="mt-1 p-2 card-elevated rounded-2xl grid grid-cols-2 gap-1 max-h-52 overflow-y-auto scrollbar-hide animate-scale-in absolute z-20 w-full">
                  {currentCities.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { 
                        setForm((f) => ({ ...f, city: c })); 
                        setShowCityPicker(false); 
                      }}
                      className={`py-2.5 rounded-xl text-sm font-medium transition ${
                        form.city === c ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 微信号 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400 ml-1">微信号</label>
            <input
              type="text"
              value={form.wechatId}
              onChange={(e) => setForm((f) => ({ ...f, wechatId: e.target.value }))}
              placeholder="聊天时可选择是否展示给对方"
              className="w-full px-5 py-3.5 input-dark rounded-2xl text-white placeholder-gray-600 text-base"
            />
            <p className="text-xs text-gray-600 ml-1">仅在聊天中主动开启后才可见</p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/15">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 首次创建才显示按钮，已有资料则自动保存 */}
          {!existingProfile && (
            <button
              onClick={handleCreate}
              disabled={saveStatus === 'saving'}
              className="w-full py-4 btn-primary rounded-2xl font-bold text-base tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saveStatus === 'saving' ? '保存中...' : '开始遇友'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
