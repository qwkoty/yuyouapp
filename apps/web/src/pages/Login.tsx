import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Loader2, UserPlus, LogIn } from 'lucide-react';

type Mode = 'select' | 'register' | 'login';
type Step = 'phone' | 'code';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('select');
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentCode, setSentCode] = useState('');

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

  const handleLogin = async () => {
    if (!code || code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('yuyou-token', data.token);
        localStorage.setItem('yuyou-user', JSON.stringify(data.user));

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
    if (!code || code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
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
    setCode('');
    setError('');
    setSentCode('');
  };

  // 选择模式页面
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="text-center">
            <h1 className="text-4xl font-black text-white">遇友</h1>
            <p className="text-gray-500 mt-3">遇见志同道合的朋友</p>
          </div>

          {/* 按钮组 */}
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

          {/* 说明 */}
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
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* 标题 */}
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

        {/* 验证码输入 */}
        {step === 'code' && (
          <div className="space-y-4">
            <div className="text-center text-gray-400 text-sm">
              验证码已发送至 {phone}
            </div>

            {/* 临时方案：显示验证码 */}
            {sentCode && (
              <div className="text-center text-primary-400 text-lg font-bold">
                验证码: {sentCode}
              </div>
            )}

            <input
              type="tel"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="请输入6位验证码"
              className="w-full px-4 py-4 bg-surface-800/50 border border-white/[0.04] rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40 transition text-lg text-center tracking-widest"
              disabled={isLoading}
              maxLength={6}
            />

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              onClick={mode === 'register' ? handleRegister : handleLogin}
              disabled={isLoading || code.length !== 6}
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
              onClick={() => { setStep('phone'); setCode(''); setError(''); }}
              className="w-full text-gray-500 text-sm hover:text-gray-400 transition"
            >
              换个手机号
            </button>
          </div>
        )}

        {/* 返回按钮 */}
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