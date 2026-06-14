import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../stores/userStore';
import { useSocketStore } from '../stores/socketStore';
import { useTheme } from '../lib/useTheme';
import { TestTube, ArrowLeft, Shield, X, Bug, KeyRound, User, History, Info, LogOut, Bot, Sun, Moon, Download, Trash2 } from 'lucide-react';
import { toast } from '../components/Toast';
import api from '../lib/apiClient';

export default function Settings() {
  const navigate = useNavigate();
  const setProfile = useUserStore((s) => s.setProfile);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [isDevMode, setIsDevMode] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('yuyou-admin-token')) {
      setIsDevMode(true);
    }
  }, []);

  const handleLogout = () => {
    if (!confirm('确定要退出登录吗？')) return;
    const { disconnect } = useSocketStore.getState();
    disconnect();
    setProfile(null);
    localStorage.removeItem('yuyou-user');
    localStorage.removeItem('yuyou-token');
    toast.success('已退出登录');
    navigate('/login');
  };

  const handleVerifyKey = async () => {
    if (!keyInput.trim()) {
      setKeyError('请输入密钥');
      return;
    }

    setIsLoading(true);
    setKeyError('');

    try {
      const data = await api.post<{ success: boolean; error?: string }>(
        '/admin/verify',
        { token: keyInput },
        { silent: true }
      );
      if (data.success) {
        setIsDevMode(true);
        setShowKeyInput(false);
        localStorage.setItem('yuyou-admin-token', keyInput);
        toast.success('已激活开发者模式');
      } else {
        setKeyError(data.error || '密钥错误');
      }
    } catch (err: any) {
      setKeyError(err?.message || '网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestMatch = () => {
    navigate('/admin/test');
  };

  // 导出我的数据为 CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const data = await api.get<{ success: boolean; history: any[] }>('/match/history', { silent: true });
      if (!data.success || !data.history || data.history.length === 0) {
        toast.warning('暂无匹配记录可导出');
        return;
      }
      const headers = ['匹配时间', '对方昵称', '对方性别', '对方省份', '对方城市', '聊天消息数', '是否加微信'];
      const escapeCSV = (v: any) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = data.history.map((h: any) => [
        h.matchedAt ? new Date(h.matchedAt).toISOString() : '',
        h.partnerNickname || h.partnerName || '',
        h.partnerGender || '',
        h.partnerProvince || '',
        h.partnerCity || '',
        h.messageCount || 0,
        h.wechatExchanged ? '是' : '否',
      ].map(escapeCSV).join(','));
      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yuyou-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${data.history.length} 条记录`);
    } catch (err) {
      // toast 已自动提示
    } finally {
      setExporting(false);
    }
  };

  // 清除所有本地缓存
  const handleClearCache = () => {
    if (!confirm('确定要清除所有本地缓存吗？将退出登录。')) return;
    const { disconnect } = useSocketStore.getState();
    disconnect();
    setProfile(null);
    localStorage.clear();
    toast.success('缓存已清除');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-surface-950 relative page-enter">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary-500/[0.02] to-transparent pointer-events-none" />

      <div className="relative z-10 px-5 pt-6 pb-24">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/profile')}
            className="p-2.5 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white">设置</h2>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/15 transition">
              {theme === 'dark' ? <Moon className="w-6 h-6 text-primary-400" /> : <Sun className="w-6 h-6 text-primary-400" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">外观主题</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {theme === 'dark' ? '当前：深色模式' : '当前：浅色模式'}
              </p>
            </div>
            <div className={`w-12 h-7 rounded-full p-0.5 transition ${theme === 'dark' ? 'bg-primary-500' : 'bg-gray-300'}`}>
              <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>

          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/15 transition">
              <User className="w-6 h-6 text-primary-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">编辑个人资料</p>
              <p className="text-sm text-gray-500 mt-0.5">修改头像、昵称、个人信息</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/history')}
            className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/15 transition">
              <History className="w-6 h-6 text-primary-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">匹配历史</p>
              <p className="text-sm text-gray-500 mt-0.5">查看过去的匹配记录</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/agents')}
            className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/15 transition">
              <Bot className="w-6 h-6 text-primary-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">智能体管理</p>
              <p className="text-sm text-gray-500 mt-0.5">创建和管理AI智能体</p>
            </div>
          </button>

          {/* 导出数据 */}
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/15 transition">
              <Download className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">导出匹配数据</p>
              <p className="text-sm text-gray-500 mt-0.5">{exporting ? '导出中...' : '下载匹配历史为 CSV'}</p>
            </div>
          </button>

          {/* 清除缓存 */}
          <button
            onClick={handleClearCache}
            className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/15 transition">
              <Trash2 className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">清除本地缓存</p>
              <p className="text-sm text-gray-500 mt-0.5">清理登录状态和本地数据</p>
            </div>
          </button>

          {/* 关于 */}
          <div className="p-5 card-elevated rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center">
                <Info className="w-6 h-6 text-primary-400" />
              </div>
              <div>
                <p className="font-bold text-white">关于遇友</p>
                <p className="text-sm text-gray-500 mt-0.5">遇见志同道合的朋友</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/[0.04] space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">版本号</span>
                <span className="text-gray-400">v1.0.0</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">构建时间</span>
                <span className="text-gray-400">2025.06</span>
              </div>
            </div>
          </div>

          {/* 退出登录 */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-red-500/[0.06] border border-red-500/10 text-red-400 hover:bg-red-500/10 transition font-medium"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>

          {!isDevMode ? (
            <button
              onClick={() => setShowKeyInput(true)}
              className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/[0.08] transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/15 transition">
                <Shield className="w-6 h-6 text-primary-400" />
              </div>
              <div>
                <p className="font-bold text-white">测试面板</p>
                <p className="text-sm text-gray-500 mt-0.5">输入管理员密钥进入开发者模式</p>
              </div>
            </button>
          ) : (
            <div className="p-5 card-elevated rounded-2xl border-primary-500/15">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center">
                  <TestTube className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                  <p className="font-bold text-white">测试面板</p>
                  <p className="text-sm text-primary-400 font-medium">已激活</p>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleTestMatch}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-primary-500/[0.06] border border-primary-500/10 rounded-2xl text-left hover:bg-primary-500/10 transition group"
                >
                  <div className="w-8 h-8 rounded-xl bg-primary-500/15 flex items-center justify-center">
                    <Bug className="w-4 h-4 text-primary-400 group-hover:scale-110 transition" />
                  </div>
                  <span className="text-white font-medium">匹配功能测试</span>
                </button>
              </div>

              <button
                onClick={() => { setIsDevMode(false); setKeyInput(''); localStorage.removeItem('yuyou-admin-token'); }}
                className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition"
              >
                退出测试模式
              </button>
            </div>
          )}
        </div>
      </div>

      {showKeyInput && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-800 border border-white/[0.04] rounded-3xl p-6 w-full max-w-sm space-y-5 animate-scale-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary-400" />
                </div>
                <h3 className="font-bold text-lg text-white">管理员验证</h3>
              </div>
              <button
                onClick={() => { setShowKeyInput(false); setKeyError(''); setKeyInput(''); }}
                className="w-8 h-8 rounded-full bg-surface-700/50 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="请输入密钥"
              className="w-full px-5 py-3.5 bg-surface-700/20 border border-white/[0.04] rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40 transition text-center text-lg tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyKey()}
              disabled={isLoading}
            />

            {keyError && (
              <p className="text-sm text-red-400 text-center">{keyError}</p>
            )}

            <button
              onClick={handleVerifyKey}
              disabled={isLoading}
              className="w-full py-3.5 btn-primary rounded-2xl font-bold disabled:opacity-50"
            >
              {isLoading ? '验证中...' : '验证'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
