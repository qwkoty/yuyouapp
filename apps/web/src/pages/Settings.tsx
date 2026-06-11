import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, TestTube, ArrowLeft, Play, Shield, X } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [isDevMode, setIsDevMode] = useState(false);
  const [keyError, setKeyError] = useState('');

  const handleVerifyKey = () => {
    if (keyInput === '195674') {
      setIsDevMode(true);
      setKeyError('');
      setShowKeyInput(false);
    } else {
      setKeyError('密钥错误');
    }
  };

  const handleTestMatch = () => {
    alert('测试匹配功能已触发！\n（实际开发中可在此模拟匹配流程）');
  };

  return (
    <div className="min-h-screen bg-surface-900 relative">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary-500/3 to-transparent pointer-events-none" />
      
      <div className="relative z-10 px-5 pt-6 pb-24">
        {/* 顶部 */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/match')}
            className="p-2.5 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white">设置</h2>
        </div>

        <div className="space-y-4 max-w-md mx-auto">
          {/* 开发者模式入口 */}
          {!isDevMode ? (
            <button
              onClick={() => setShowKeyInput(true)}
              className="w-full flex items-center gap-4 p-5 card-elevated rounded-2xl text-left hover:border-white/10 transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary-500/10 flex items-center justify-center group-hover:bg-primary-500/20 transition">
                <Shield className="w-6 h-6 text-primary-400" />
              </div>
              <div>
                <p className="font-bold text-white">测试面板</p>
                <p className="text-sm text-gray-500 mt-0.5">输入管理员密钥进入开发者模式</p>
              </div>
            </button>
          ) : (
            <div className="p-5 card-elevated rounded-2xl border-primary-500/20">
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
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-primary-500/10 border border-primary-500/20 rounded-2xl text-left hover:bg-primary-500/20 transition group"
                >
                  <div className="w-8 h-8 rounded-xl bg-primary-500/20 flex items-center justify-center">
                    <Play className="w-4 h-4 text-primary-400 group-hover:scale-110 transition" />
                  </div>
                  <span className="text-white font-medium">测试匹配功能</span>
                </button>
              </div>

              <button
                onClick={() => { setIsDevMode(false); setKeyInput(''); }}
                className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition"
              >
                退出测试模式
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 密钥输入弹窗 */}
      {showKeyInput && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-800 border border-white/5 rounded-3xl p-6 w-full max-w-sm space-y-5 animate-scale-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary-400" />
                </div>
                <h3 className="font-bold text-lg text-white">管理员验证</h3>
              </div>
              <button
                onClick={() => { setShowKeyInput(false); setKeyError(''); setKeyInput(''); }}
                className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="请输入密钥"
              className="w-full px-5 py-3.5 bg-surface-700/30 border border-white/5 rounded-2xl text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50 transition text-center text-lg tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyKey()}
            />
            
            {keyError && (
              <p className="text-sm text-red-400 text-center">{keyError}</p>
            )}
            
            <button
              onClick={handleVerifyKey}
              className="w-full py-3.5 btn-primary rounded-2xl font-bold"
            >
              验证
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
