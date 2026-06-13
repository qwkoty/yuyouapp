import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Eye, EyeOff, Save, CheckCircle } from 'lucide-react';

const ADMIN_KEY = 'yuyou-admin-2024';

export default function AdminAuth() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // 加载保存的密钥
  useEffect(() => {
    const savedKey = localStorage.getItem('yuyou-admin-key');
    if (savedKey) {
      setKey(savedKey);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!key.trim()) {
      setError('请输入管理员密钥');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      if (key.trim() === ADMIN_KEY) {
        localStorage.setItem('yuyou-admin-auth', 'true');
        localStorage.setItem('yuyou-admin-token', key.trim());
        navigate('/admin/test');
      } else {
        setError('密钥错误，请重试');
        setLoading(false);
      }
    }, 500);
  };

  const handleSaveKey = () => {
    if (!key.trim()) {
      setError('没有可保存的密钥');
      return;
    }
    localStorage.setItem('yuyou-admin-key', key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearKey = () => {
    localStorage.removeItem('yuyou-admin-key');
    setKey('');
    setSaved(false);
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
              className="w-full px-5 py-4 input-dark rounded-2xl text-white placeholder-gray-600 pr-24"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="p-2 text-gray-500 hover:text-gray-300"
              >
                {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* 保存密钥按钮 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveKey}
              className="flex-1 py-3 bg-surface-800/50 border border-white/[0.08] rounded-2xl font-medium flex items-center justify-center gap-2 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
            >
              {saved ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Save className="w-4 h-4" />}
              {saved ? '已保存' : '保存密钥'}
            </button>
            {localStorage.getItem('yuyou-admin-key') && (
              <button
                type="button"
                onClick={handleClearKey}
                className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 hover:bg-red-500/20 transition"
              >
                清除
              </button>
            )}
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
