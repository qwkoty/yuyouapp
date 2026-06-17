import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import type { UserProfile } from '@yuyou/shared';
import api from '../lib/apiClient';
import { Phone, ArrowRight, Loader2, Eye, Check, HelpCircle, X, ArrowLeft } from 'lucide-react';
import { toast } from '../components/Toast';

type Step = 'phone' | 'code';

interface LoginProps {
  defaultMode?: 'login' | 'register';
}

export default function Login({ defaultMode = 'login' }: LoginProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setProfile = useUserStore((s) => s.setProfile);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [countdown, setCountdown] = useState(0);

  const isRegisterMode = defaultMode === 'register' || params.get('mode') === 'register' || params.get('mode') === 'guest';

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // 手机号校验
  const phoneValid = /^1[3-9]\d{9}$/.test(phone);
  const codeValue = code.join('');
  const isCodeComplete = codeValue.length === 6;

  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleSendCode = async () => {
    if (!phoneValid) {
      setError('请输入正确的11位手机号');
      return;
    }
    if (!agreed) {
      setError('请先勾选同意服务条款和隐私政策');
      return;
    }

    setError('');
    setIsLoading(true);

    // ⚡ 等待后端确认验证码已存储，避免竞态条件
    // 开发环境后端会返回验证码明文，生产环境通过短信发送
    try {
      const data = await api.post<{ success: boolean; code?: string; error?: string }>(
        '/auth/send-code',
        { phone },
        { timeout: 15000 }
      );
      if (data.success) {
        // 开发环境：后端返回验证码，显示给用户
        if (data.code) {
          setSentCode(data.code);
        }
        setStep('code');
        setCountdown(60);
        toast.success('验证码已发送');
      } else {
        setError(data.error || '验证码发送失败');
      }
    } catch (err: any) {
      setError(err?.message || '验证码发送失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError('');
    if (digit && index < 5) codeRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newCode = [...code];
      for (let i = 0; i < 6; i++) newCode[i] = pasted[i] || '';
      setCode(newCode);
      const focusIdx = Math.min(pasted.length, 5);
      codeRefs.current[focusIdx]?.focus();
    }
  };

  const handleLogin = async () => {
    if (!isCodeComplete) { setError('请输入6位验证码'); return; }
    if (!agreed) { setError('请先勾选同意服务条款和隐私政策'); return; }
    await doLogin();
  };

  const doLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await api.post<{
        success: boolean;
        token?: string;
        user?: any;
        isNewUser?: boolean;
        error?: string;
      }>('/auth/login', { phone, code: codeValue }, { timeout: 15000, silent: true });

      if (data.success && data.token && data.user) {
        localStorage.setItem('yuyou-token', data.token);
        // ⚠️ 不再手动写入 yuyou-user，避免与 zustand persist 的 {state, version} 格式冲突
        // profile 由 zustand setProfile 统一管理并持久化

        const u = data.user;
        const profile: UserProfile = {
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
          tags: u.tags || [],
          blockedUsers: u.blocked_users || u.blockedUsers || [],
          createdAt: Date.now(),
        };
        setProfile(profile);

        // ⚡ 关键：登录后必须重连 socket，用新 token 重新认证
        // 旧 socket 实例用的是登录前的 null token，不重连则 socket.data.userId 永远 undefined
        // 导致 match:request / chat 等所有需要认证的 socket 事件全部失败
        const { useSocketStore } = await import('../stores/socketStore');
        useSocketStore.getState().reconnect();

        // 首次登录引导到资料完善
        if (data.isNewUser || !u.nickname || u.nickname === '新用户') {
          toast.success(isRegisterMode ? '注册成功！完善资料开始' : '登录成功');
          navigate('/profile');
        } else {
          toast.success('登录成功');
          navigate('/match');
        }
      } else {
        setError(data.error || '登录失败，请重试');
      }
    } catch (err: any) {
      const msg = err?.message || '';
      // 超时单独提示
      if (msg.includes('超时') || err?.name === 'AbortError') {
        setError('登录请求超时，请检查网络后重试');
      } else {
        setError(msg || '网络错误，请重试');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[8%] right-[8%] w-36 h-36 rounded-full bg-primary-500/[0.07] blur-2xl animate-float" style={{ animationDuration: '7s' }} />
      <div className="absolute top-[55%] left-[5%] w-44 h-44 rounded-full bg-primary-400/[0.05] blur-3xl animate-float" style={{ animationDuration: '9s', animationDelay: '1.5s' }} />
      <div className="absolute bottom-[10%] right-[15%] w-20 h-20 rounded-full bg-primary-600/[0.06] blur-2xl animate-float" style={{ animationDuration: '6s', animationDelay: '3s' }} />
      <div className="absolute top-[25%] left-[30%] w-14 h-14 rounded-full bg-primary-300/[0.04] blur-xl animate-float" style={{ animationDuration: '5.5s', animationDelay: '0.8s' }} />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首页
        </button>

        <div className="text-center">
          <h1 className="text-3xl font-black text-white">
            {isRegisterMode ? '注册遇友账号' : '登录遇友'}
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            {step === 'phone' ? '输入手机号开始' : '验证码已发送'}
          </p>
        </div>

        {step === 'phone' && (
          <div className="card-elevated rounded-3xl p-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-300 ml-1 mb-2 block">手机号 <span className="text-red-400">*</span></label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setPhone(v);
                    setError('');
                  }}
                  placeholder="请输入11位手机号"
                  className={`w-full pl-12 pr-4 py-4 input-dark rounded-2xl text-white placeholder-gray-600 text-lg tabular-nums transition ${
                    phone && !phoneValid ? 'border-red-500/40' : ''
                  }`}
                  disabled={isLoading}
                  maxLength={11}
                />
                {phone && phoneValid && (
                  <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-400" />
                )}
              </div>
              {phone && !phoneValid && phone.length > 0 && (
                <p className="text-xs text-red-400 mt-1.5 ml-1">请输入正确的11位手机号</p>
              )}
            </div>

            {/* 用户协议勾选 */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => { setAgreed(e.target.checked); setError(''); }}
                  className="sr-only peer"
                />
                <div className={`w-5 h-5 rounded-md border-2 transition flex items-center justify-center ${
                  agreed ? 'bg-primary-500 border-primary-500' : 'bg-transparent border-gray-600'
                }`}>
                  {agreed && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </div>
              </div>
              <span className="text-xs text-gray-300 leading-relaxed flex-1">
                我已阅读并同意
                <button type="button" onClick={(e) => { e.preventDefault(); navigate('/terms'); }} className="text-primary-400 hover:text-primary-300 mx-1">《服务条款》</button>
                和
                <button type="button" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }} className="text-primary-400 hover:text-primary-300 mx-1">《隐私政策》</button>
              </span>
            </label>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={handleSendCode}
              disabled={isLoading || !phoneValid || !agreed}
              className="w-full py-4 btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>获取验证码 <ArrowRight className="w-5 h-5" /></>}
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
              <button
                onClick={() => setShowHelp(true)}
                className="text-xs text-gray-500 hover:text-white transition flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                手机号无法登录？
              </button>
              <button
                onClick={() => navigate('/guest')}
                className="text-xs text-gray-500 hover:text-white transition flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                游客预览
              </button>
            </div>
          </div>
        )}

        {step === 'code' && (
          <div className="card-elevated rounded-3xl p-6 space-y-5">
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-300">
                验证码已发送至 <span className="text-white font-medium">{phone.replace(/^(\d{3})\d{4}/, '$1****')}</span>
              </p>
              {sentCode && (
                <div className="relative inline-flex flex-col items-center gap-2 px-5 py-3 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/25 rounded-2xl">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-full">
                    <span className="text-[10px] font-bold text-amber-300 tracking-wide">开发环境</span>
                  </div>
                  <p className="text-amber-300 text-xs mt-1">您的验证码是</p>
                  <p className="font-mono font-black text-3xl tracking-[0.3em] text-amber-200 select-all">
                    {sentCode}
                  </p>
                  <p className="text-[11px] text-gray-500 leading-relaxed max-w-[240px]">
                    因开发环境暂未接入真实短信服务，验证码在此显示。生产环境将发送至手机。
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-center" onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { codeRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-2xl font-bold rounded-2xl border transition-all tabular-nums ${
                    digit
                      ? 'bg-surface-800/50 border-primary-500/40 text-white shadow-lg shadow-primary-500/10'
                      : 'bg-surface-800/50 border-white/[0.04] text-white placeholder-gray-700'
                  } focus:outline-none focus:border-primary-500/60`}
                  maxLength={1}
                  disabled={isLoading}
                />
              ))}
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={isLoading || !isCodeComplete}
              className="w-full py-4 btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isRegisterMode ? '注册' : '登录'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep('phone'); setCode(['', '', '', '', '', '']); setError(''); }}
                className="text-xs text-gray-500 hover:text-white transition"
              >
                换个手机号
              </button>
              {countdown > 0 ? (
                <span className="text-xs text-gray-500">{countdown}s 后重发</span>
              ) : (
                <button
                  onClick={handleSendCode}
                  disabled={isLoading}
                  className="text-xs text-primary-400 hover:text-primary-300 transition disabled:opacity-50"
                >
                  重新发送
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showHelp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-surface-800 border border-white/[0.04] rounded-3xl p-6 w-full max-w-sm space-y-4 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary-400" />
                <h3 className="font-bold text-white">登录帮助</h3>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="text-sm text-gray-300 space-y-3 leading-relaxed">
              <li>• 输入正确的 11 位中国大陆手机号</li>
              <li>• 验证码会直接显示在页面上（开发环境）</li>
              <li>• 生产环境将通过短信发送至手机</li>
              <li>• 每个验证码 5 分钟内有效</li>
            </ul>
            <button
              onClick={() => setShowHelp(false)}
              className="w-full py-2.5 btn-primary rounded-xl font-medium text-sm"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
