import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
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
        setSentCode(data.code || ''); // 临时方案：显示验证码
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
        // 保存token和用户信息
        localStorage.setItem('yuyou-token', data.token);
        localStorage.setItem('yuyou-user', JSON.stringify(data.user));

        if (data.isNewUser) {
          // 新用户，跳转到资料设置页
          navigate('/profile');
        } else {
          // 已有用户，跳转到匹配页
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

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-black text-white">遇友</h1>
          <p className="text-gray-500 mt-2">手机号快速登录</p>
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

            {/* 临时方案：显示验证码（正式环境删除） */}
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
              onClick={handleLogin}
              disabled={isLoading || code.length !== 6}
              className="w-full py-4 btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowRight className="w-5 h-5" /> 登录</>}
            </button>

            <button
              onClick={() => { setStep('phone'); setCode(''); setError(''); }}
              className="w-full text-gray-500 text-sm hover:text-gray-400 transition"
            >
              换个手机号
            </button>
          </div>
        )}

        {/* 说明 */}
        <div className="text-center text-xs text-gray-600">
          <p>新用户将自动创建账号</p>
          <p className="mt-1">登录即表示同意服务条款和隐私政策</p>
        </div>
      </div>
    </div>
  );
}