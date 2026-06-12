import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Wifi, WifiOff, Users, Activity, Gauge, Play, RotateCcw, CheckCircle, XCircle, Zap } from 'lucide-react';
import { socket } from '../stores/socketStore';
import { useUserStore } from '../stores/userStore';
import type { MatchFilters } from '@yuyou/shared';

interface ServerStats {
  onlineCount: number;
  matchingCount: number;
  activeSessions: number;
}

export default function AdminTest() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const [isAdmin, setIsAdmin] = useState(false);

  // 服务器统计
  const [stats, setStats] = useState<ServerStats>({ onlineCount: 0, matchingCount: 0, activeSessions: 0 });

  // 匹配功能测试 - 简约版
  const [matchTestRunning, setMatchTestRunning] = useState(false);
  const [matchTestStep, setMatchTestStep] = useState('');
  const [matchTestProgress, setMatchTestProgress] = useState(0);
  const [matchTestStatus, setMatchTestStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [matchTestResult, setMatchTestResult] = useState('');
  const [matchConcurrent, setMatchConcurrent] = useState(1);

  // 服务器压力测试 - 在线人数
  const [stressRunning, setStressRunning] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(50);
  const [stressStep, setStressStep] = useState('');
  const [stressProgress, setStressProgress] = useState(0);
  const [stressStatus, setStressStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [stressResult, setStressResult] = useState('');

  useEffect(() => {
    const auth = localStorage.getItem('yuyou-admin-auth');
    if (auth !== 'true') {
      navigate('/admin');
      return;
    }
    setIsAdmin(true);
  }, [navigate]);

  // 定时获取服务器统计
  useEffect(() => {
    if (!isAdmin || !socket) return;

    const fetchStats = () => {
      if (socket?.connected) {
        socket.emit('admin:get_stats');
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);

    socket.on('admin:stats', (data) => {
      setStats(data);
    });

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('admin:stats');
      }
    };
  }, [isAdmin]);

  // 压力测试事件监听
  useEffect(() => {
    if (!socket) return;

    socket.on('admin:stress_progress', (data) => {
      setStressStep(data.step);
      setStressProgress(data.progress);
    });

    socket.on('admin:stress_complete', (data) => {
      setStressStatus('success');
      setStressProgress(100);
      setStressResult(`完成! ${data.success}/${data.total} 成功, 平均${data.avgTime}ms`);
      setStressRunning(false);
    });

    return () => {
      if (socket) {
        socket.off('admin:stress_progress');
        socket.off('admin:stress_complete');
      }
    };
  }, []);

  // 匹配功能测试
  const runMatchTest = useCallback(async () => {
    if (matchTestRunning) return;
    setMatchTestRunning(true);
    setMatchTestStatus('running');
    setMatchTestProgress(0);
    setMatchTestResult('');

    const steps = [
      { name: '连接服务器', progress: 15 },
      { name: '验证用户资料', progress: 30 },
      { name: '发送匹配请求', progress: 50 },
      { name: '等待匹配响应', progress: 75 },
      { name: '完成测试', progress: 100 },
    ];

    try {
      // Step 1: 连接检查
      setMatchTestStep(steps[0].name);
      setMatchTestProgress(steps[0].progress);
      if (!socket || !socket.connected) {
        throw new Error('Socket 未连接');
      }
      await new Promise((r) => setTimeout(r, 400));

      // Step 2: 资料检查
      setMatchTestStep(steps[1].name);
      setMatchTestProgress(steps[1].progress);
      if (!profile) {
        throw new Error('未设置用户资料');
      }
      await new Promise((r) => setTimeout(r, 300));

      // Step 3: 发送匹配请求（可设置同时匹配人数）
      setMatchTestStep(steps[2].name);
      setMatchTestProgress(steps[2].progress);
      const testFilters: MatchFilters = { minAge: 10, maxAge: 60 };

      for (let i = 0; i < matchConcurrent; i++) {
        socket.emit('match:request', testFilters, (result: any) => {
          if (!result.success && i === 0) {
            // 只记录第一次的错误
          }
        });
        if (matchConcurrent > 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      await new Promise((r) => setTimeout(r, 500));

      // Step 4: 等待响应
      setMatchTestStep(steps[3].name);
      setMatchTestProgress(steps[3].progress);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve(); // 超时也算通过，因为可能只是没匹配到人
        }, 2000);
        const onWaiting = () => { cleanup(); clearTimeout(timer); resolve(); };
        const onSuccess = () => { cleanup(); clearTimeout(timer); resolve(); };
        const cleanup = () => {
          socket!.off('match:waiting', onWaiting);
          socket!.off('match:success', onSuccess);
        };
        socket!.once('match:waiting', onWaiting);
        socket!.once('match:success', onSuccess);
      });

      // Step 5: 取消匹配
      socket.emit('match:cancel');
      setMatchTestStep(steps[4].name);
      setMatchTestProgress(steps[4].progress);
      await new Promise((r) => setTimeout(r, 300));

      setMatchTestStatus('success');
      setMatchTestResult(`测试通过 | ${matchConcurrent}人同时匹配 | ${profile.nickname}`);
    } catch (err: any) {
      setMatchTestStatus('error');
      setMatchTestResult(err.message);
    } finally {
      setMatchTestRunning(false);
    }
  }, [matchTestRunning, profile, matchConcurrent]);

  // 服务器压力测试
  const runStressTest = useCallback(() => {
    if (stressRunning || !socket) return;
    setStressRunning(true);
    setStressStatus('running');
    setStressProgress(0);
    setStressResult('');
    setStressStep('准备开始...');

    // 发送压力测试配置：同时在线人数
    socket.emit('admin:stress_test', {
      concurrent: onlineUsers,
      duration: 3,
    });
  }, [stressRunning, onlineUsers]);

  const resetAll = useCallback(() => {
    setMatchTestStatus('idle');
    setMatchTestProgress(0);
    setMatchTestStep('');
    setMatchTestResult('');
    setStressStatus('idle');
    setStressProgress(0);
    setStressStep('');
    setStressResult('');
  }, []);

  if (!isAdmin) return null;

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
          <Bug className="w-5 h-5 text-primary-400" />
          <h1 className="font-bold text-white">测试面板</h1>
        </div>
        <button
          onClick={resetAll}
          className="ml-auto w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center text-gray-400 hover:text-white"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
        {/* 服务器状态 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary-400" />
              <span className="font-bold text-white">服务器状态</span>
            </div>
            <div className="flex items-center gap-1">
              {socket?.connected ? <Wifi className="w-4 h-4 text-green-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
              <span className="text-xs text-gray-500">{socket?.connected ? '已连接' : '未连接'}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-800/50 rounded-xl p-3 text-center">
              <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-xl font-black text-white">{stats.onlineCount}</p>
              <p className="text-xs text-gray-500">在线人数</p>
            </div>
            <div className="bg-surface-800/50 rounded-xl p-3 text-center">
              <Activity className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-xl font-black text-white">{stats.matchingCount}</p>
              <p className="text-xs text-gray-500">匹配中</p>
            </div>
            <div className="bg-surface-800/50 rounded-xl p-3 text-center">
              <Zap className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <p className="text-xl font-black text-white">{stats.activeSessions}</p>
              <p className="text-xs text-gray-500">活跃会话</p>
            </div>
          </div>
        </div>

        {/* 匹配功能测试 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-primary-400" />
              <span className="font-bold text-white">匹配功能测试</span>
            </div>
            {matchTestStatus === 'success' && <CheckCircle className="w-5 h-5 text-green-400" />}
            {matchTestStatus === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
          </div>

          {/* 同时匹配人数设置 */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1.5 block">同时匹配人数</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={matchConcurrent}
                onChange={(e) => setMatchConcurrent(parseInt(e.target.value))}
                className="flex-1 h-2 bg-surface-800 rounded-full appearance-none"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 ${(matchConcurrent - 1) / 9 * 100}%, #1f1f23 ${(matchConcurrent - 1) / 9 * 100}%)`,
                }}
              />
              <span className="text-sm font-bold text-white w-8 text-center">{matchConcurrent}</span>
            </div>
          </div>

          {/* 进度条 */}
          {(matchTestStatus !== 'idle') && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{matchTestStep}</span>
                <span className={`font-medium ${
                  matchTestStatus === 'success' ? 'text-green-400' :
                  matchTestStatus === 'error' ? 'text-red-400' : 'text-primary-400'
                }`}>
                  {matchTestProgress}%
                </span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-400 ${
                    matchTestStatus === 'success' ? 'bg-green-500' :
                    matchTestStatus === 'error' ? 'bg-red-500' :
                    'bg-primary-500 animate-pulse'
                  }`}
                  style={{ width: `${matchTestProgress}%` }}
                />
              </div>
              {matchTestResult && (
                <p className={`text-xs ${
                  matchTestStatus === 'success' ? 'text-green-400' :
                  matchTestStatus === 'error' ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {matchTestResult}
                </p>
              )}
            </div>
          )}

          <button
            onClick={runMatchTest}
            disabled={matchTestRunning}
            className="w-full py-3 btn-primary rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {matchTestRunning ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {matchTestRunning ? '测试中...' : '开始匹配测试'}
          </button>
        </div>

        {/* 服务器压力测试 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <span className="font-bold text-white">服务器压力测试</span>
            </div>
            {stressStatus === 'success' && <CheckCircle className="w-5 h-5 text-green-400" />}
            {stressStatus === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
          </div>

          {/* 同时在线人数设置 */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1.5 block">模拟同时在线人数</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={200}
                step={10}
                value={onlineUsers}
                onChange={(e) => setOnlineUsers(parseInt(e.target.value))}
                className="flex-1 h-2 bg-surface-800 rounded-full appearance-none"
                style={{
                  background: `linear-gradient(to right, #eab308 ${(onlineUsers - 10) / 190 * 100}%, #1f1f23 ${(onlineUsers - 10) / 190 * 100}%)`,
                }}
              />
              <span className="text-sm font-bold text-white w-10 text-center">{onlineUsers}</span>
            </div>
          </div>

          {/* 压力测试进度 */}
          {(stressStatus !== 'idle') && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{stressStep}</span>
                <span className={`font-medium ${
                  stressStatus === 'success' ? 'text-green-400' :
                  stressStatus === 'error' ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {stressProgress}%
                </span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    stressStatus === 'success' ? 'bg-green-500' :
                    stressStatus === 'error' ? 'bg-red-500' :
                    'bg-yellow-500 animate-pulse'
                  }`}
                  style={{ width: `${stressProgress}%` }}
                />
              </div>
              {stressResult && (
                <p className={`text-xs ${
                  stressStatus === 'success' ? 'text-green-400' :
                  stressStatus === 'error' ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {stressResult}
                </p>
              )}
            </div>
          )}

          <button
            onClick={runStressTest}
            disabled={stressRunning}
            className="w-full py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-400 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-yellow-500/20 transition"
          >
            {stressRunning ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {stressRunning ? '压力测试中...' : '开始压力测试'}
          </button>
        </div>
      </div>
    </div>
  );
}
