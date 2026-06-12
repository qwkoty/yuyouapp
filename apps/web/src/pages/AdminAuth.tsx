import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Eye, EyeOff } from 'lucide-react';

const ADMIN_KEY = 'yuyou-admin-2024';

export default function AdminAuth() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!key.trim()) {
      setError('请输入管理员密钥');
      return;
    }

    setLoading(true);

    // 模拟验证延迟
    setTimeout(() => {
      if (key.trim() === ADMIN_KEY) {
        localStorage.setItem('yuyou-admin-auth', 'true');
        navigate('/admin/test');
      } else {
        setError('密钥错误，请重试');
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/[0.04]">
        <button
          onClick={() => navigate('/settings')}
          className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary-400" />
          <h1 className="font-bold text-white">管理员验证</h1>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-3xl bg-primary-500/10 border border-primary-500/15 flex items-center justify-center mb-6">
          <Shield className="w-10 h-10 text-primary-400" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">管理员验证</h2>
        <p className="text-sm text-gray-500 mb-8 text-center">请输入管理员密钥以访问测试功能</p>

        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="输入管理员密钥"
              className="w-full px-5 py-4 input-dark rounded-2xl text-white placeholder-gray-600 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 btn-primary rounded-2xl font-bold disabled:opacity-50"
          >
            {loading ? '验证中...' : '进入管理后台'}
          </button>
        </form>
      </div>
    </div>
  );
}
