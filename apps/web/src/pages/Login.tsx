import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import type { UserProfile } from '@yuyou/shared';
import { Phone, ArrowRight, Loader2, UserPlus, LogIn } from 'lucide-react';

type Mode = 'select' | 'register' | 'login';
type Step = 'phone' | 'code';

export default function Login() {
  const navigate = useNavigate();
  const setProfile = useUserStore((s) => s.setProfile);
  const [mode, setMode] = useState<Mode>('select');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentCode, setSentCode] = useState('');
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 自动聚焦第一个验证码格子
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleSendCode = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStep('code');
        setSentCode(data.code || '');
        setError('');
      } else {
        setError(data.error || '发送失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
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

    // 自动跳到下一格
    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
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
      for (let i = 0; i < 6; i++) {
        newCode[i] = pasted[i] || '';
      }
      setCode(newCode);
      const focusIdx = Math.min(pasted.length, 5);
      codeRefs.current[focusIdx]?.focus();
    }
  };

  const codeValue = code.join('');
  const isCodeComplete = codeValue.length === 6;

  const handleLogin = async () => {
    if (!isCodeComplete) {
      setError('请输入6位验证码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: codeValue }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('yuyou-token', data.token);
        localStorage.setItem('yuyou-user', JSON.stringify(data.user));

        // 设置profile到store
        const u = data.user;
        const profile: UserProfile = {
          id: u.id,
          avatar: u.avatar || '',
          nickname: u.nickname || '',
          realName: u.real_name || u.realName || '',
          gender: u.gender || 'male',
          birthDate: u.birth_date || u.birthDate || '2000-01-01',
          age: u.age || 0,
          province: u.province || '',
          city: u.city || '',
          wechatId: u.wechat_id || u.wechatId || '',
          bio: u.bio || '',
          createdAt: Date.now(),
        };
        setProfile(profile);

        if (data.isNewUser) {
          navigate('/profile');
        } else {
          navigate('/match');
        }
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!isCodeComplete) {
      setError('请输入6位验证码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: codeValue }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('yuyou-token', data.token);
        localStorage.setItem('yuyou-user', JSON.stringify(data.user));
        navigate('/profile');
      } else {
        setError(data.error || '注册失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setMode('select');
    setStep('phone');
    setPhone('');
    setCode(['', '', '', '', '', '']);
    setError('');
    setSentCode('');
  };

  // 选择模式页面
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* 浮动装饰 blob */}
        <div className="absolute top-[10%] left-[10%] w-32 h-32 rounded-full bg-primary-500/[0.07] blur-2xl animate-float" style={{ animationDuration: '6s' }} />
        <div className="absolute top-[60%] right-[5%] w-48 h-48 rounded-full bg-primary-400/[0.05] blur-3xl animate-float" style={{ animationDuration: '8s', animationDelay: '1s' }} />
        <div className="absolute bottom-[15%] left-[20%] w-24 h-24 rounded-full bg-primary-600/[0.06] blur-2xl animate-float" style={{ animationDuration: '7s', animationDelay: '2s' }} />
        <div className="absolute top-[30%] right-[25%] w-16 h-16 rounded-full bg-primary-300/[0.04] blur-xl animate-float" style={{ animationDuration: '5s', animationDelay: '0.5s' }} />

        <div className="w-full max-w-sm space-y-8 relative z-10">
          <div className="text-center">
            <h1 className="text-4xl font-black text-white">遇友</h1>
            <p className="text-gray-500 mt-3">遇见志同道合的朋友</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setMode('register')}
              className="w-full py-4 btn-primary rounded-2xl font-bold flex items-center justify-center gap-3 text-lg"
            >
              <UserPlus className="w-6 h-6" />
              注册账号
            </button>

            <button
              onClick={() => setMode('login')}
              className="w-full py-4 bg-surface-800/50 border border-white/[0.08] rounded-2xl font-bold flex items-center justify-center gap-3 text-lg text-white hover:bg-surface-700/50 transition"
            >
              <LogIn className="w-6 h-6" />
              登录账号
            </button>
          </div>

          <div className="text-center text-xs text-gray-600">
            <p>使用手机号快速注册/登录</p>
            <p className="mt-1">注册即表示同意服务条款和隐私政策</p>
          </div>
        </div>
      </div>
    );
  }

  // 注册或登录页面
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* 浮动装饰 blob */}
      <div className="absolute top-[8%] right-[8%] w-36 h-36 rounded-full bg-primary-500/[0.07] blur-2xl animate-float" style={{ animationDuration: '7s' }} />
      <div className="absolute top-[55%] left-[5%] w-44 h-44 rounded-full bg-primary-400/[0.05] blur-3xl animate-float" style={{ animationDuration: '9s', animationDelay: '1.5s' }} />
      <div className="absolute bottom-[10%] right-[15%] w-20 h-20 rounded-full bg-primary-600/[0.06] blur-2xl animate-float" style={{ animationDuration: '6s', animationDelay: '3s' }} />
      <div className="absolute top-[25%] left-[30%] w-14 h-14 rounded-full bg-primary-300/[0.04] blur-xl animate-float" style={{ animationDuration: '5.5s', animationDelay: '0.8s' }} />

      <div className="w-full max-w-sm space-y-6 relative z-10">
        <div className="text-center">
          <h1 className="text-3xl font-black text-white">
            {mode === 'register' ? '注册账号' : '登录账号'}
          </h1>
          <p className="text-gray-500 mt-2">
            {step === 'phone' ? '请输入手机号' : '请输入验证码'}
          </p>
        </div>

        {/* 手机号输入 */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入手机号"
                className="w-full pl-12 pr-4 py-4 bg-surface-800/50 border border-white/[0.04] rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40 transition text-lg"
                disabled={isLoading}
              />
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={handleSendCode}
              disabled={isLoading || phone.length !== 11}
              className="w-full py-4 btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '获取验证码'}
            </button>
          </div>
        )}

        {/* 验证码6格输入 */}
        {step === 'code' && (
          <div className="space-y-4">
            <div className="text-center text-gray-400 text-sm">
              验证码已发送至 {phone}
            </div>

            {sentCode && (
              <div className="text-center text-primary-400 text-lg font-bold">
                验证码: {sentCode}
              </div>
            )}

            <div className="flex gap-3 justify-center" onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { codeRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-2xl font-bold rounded-2xl border transition-all ${
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
              onClick={mode === 'register' ? handleRegister : handleLogin}
              disabled={isLoading || !isCodeComplete}
              className="w-full py-4 btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="w-5 h-5" />
                  {mode === 'register' ? '注册' : '登录'}
                </>
              )}
            </button>

            <button
              onClick={() => { setStep('phone'); setCode(['', '', '', '', '', '']); setError(''); }}
              className="w-full text-gray-500 text-sm hover:text-gray-400 transition"
            >
              换个手机号
            </button>
          </div>
        )}

        <button
          onClick={reset}
          className="w-full text-gray-500 text-sm hover:text-gray-400 transition"
        >
          ← 返回
        </button>
      </div>
    </div>
  );
}
