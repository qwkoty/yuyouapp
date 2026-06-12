import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Wifi, WifiOff, Users, Activity, Gauge, Play, RotateCcw, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { socket } from '../stores/socketStore';
import { useUserStore } from '../stores/userStore';
import type { MatchFilters } from '@yuyou/shared';

interface TestStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  progress: number;
}

interface ServerStats {
  onlineCount: number;
  matchingCount: number;
  activeSessions: number;
}

interface StressResult {
  total: number;
  success: number;
  failed: number;
  avgTime: number;
  maxTime: number;
}

export default function AdminTest() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const [isAdmin, setIsAdmin] = useState(false);

  // 服务器统计
  const [stats, setStats] = useState<ServerStats>({ onlineCount: 0, matchingCount: 0, activeSessions: 0 });

  // 功能测试
  const [testRunning, setTestRunning] = useState(false);
  const [testSteps, setTestSteps] = useState<TestStep[]>([
    { id: 'connect', name: 'Socket 连接', status: 'pending', message: '等待开始', progress: 0 },
    { id: 'profile', name: '用户资料验证', status: 'pending', message: '等待开始', progress: 0 },
    { id: 'match-request', name: '匹配请求', status: 'pending', message: '等待开始', progress: 0 },
    { id: 'match-wait', name: '匹配等待', status: 'pending', message: '等待开始', progress: 0 },
    { id: 'match-cancel', name: '匹配取消', status: 'pending', message: '等待开始', progress: 0 },
    { id: 'heartbeat', name: '心跳检测', status: 'pending', message: '等待开始', progress: 0 },
  ]);

  // 压力测试
  const [stressRunning, setStressRunning] = useState(false);
  const [stressConfig, setStressConfig] = useState({ concurrent: 50, duration: 5 });
  const [stressStep, setStressStep] = useState('');
  const [stressProgress, setStressProgress] = useState(0);
  const [stressStats, setStressStats] = useState({ total: 0, success: 0, failed: 0 });
  const [stressResult, setStressResult] = useState<StressResult | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<string[]>([]);

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
      setStressStats({ total: data.total, success: data.success, failed: data.failed });
      addLog(`[压力测试] ${data.step} (${data.progress}%) 成功:${data.success} 失败:${data.failed}`);
    });

    socket.on('admin:stress_complete', (data) => {
      setStressResult(data);
      setStressRunning(false);
      setStressProgress(100);
      addLog(`[压力测试完成] 总计:${data.total} 成功:${data.success} 失败:${data.failed} 平均:${data.avgTime}ms 最大:${data.maxTime}ms`);
    });

    return () => {
      if (socket) {
        socket.off('admin:stress_progress');
        socket.off('admin:stress_complete');
      }
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [...prev.slice(-49), `[${time}] ${msg}`]);
  }, []);

  const updateStep = useCallback((id: string, status: TestStep['status'], message: string, progress: number) => {
    setTestSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, message, progress } : s))
    );
  }, []);

  const resetTests = useCallback(() => {
    setTestSteps((prev) => prev.map((s) => ({ ...s, status: 'pending', message: '等待开始', progress: 0 })));
    setLogs([]);
    setStressResult(null);
    setStressProgress(0);
    setStressStep('');
  }, []);

  const runAllTests = useCallback(async () => {
    if (testRunning) return;
    setTestRunning(true);
    setLogs([]);
    setTestSteps((prev) => prev.map((s) => ({ ...s, status: 'pending', message: '等待开始', progress: 0 })));

    // Step 1: Socket Connection
    addLog('=== 开始功能测试 ===');
    updateStep('connect', 'running', '连接中...', 30);
    const t1 = Date.now();
    try {
      if (!socket) throw new Error('Socket 实例不存在');
      if (!socket.connected) {
        socket.connect();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('连接超时')), 5000);
          socket!.once('connect', () => { clearTimeout(timer); resolve(); });
          socket!.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
        });
      }
      updateStep('connect', 'success', `已连接 (${Date.now() - t1}ms)`, 100);
      addLog('Socket 连接成功');
    } catch (err: any) {
      updateStep('connect', 'error', err.message, 0);
      addLog(`Socket 连接失败: ${err.message}`);
      setTestRunning(false);
      return;
    }

    // Step 2: Profile
    await new Promise((r) => setTimeout(r, 300));
    updateStep('profile', 'running', '检查中...', 50);
    if (!profile) {
      updateStep('profile', 'error', '未设置用户资料', 0);
      addLog('用户资料未设置');
      setTestRunning(false);
      return;
    }
    updateStep('profile', 'success', `${profile.nickname} | ${profile.age}岁 | ${profile.province}`, 100);
    addLog(`用户资料: ${profile.nickname}`);

    // Step 3: Match Request
    await new Promise((r) => setTimeout(r, 300));
    updateStep('match-request', 'running', '发送请求...', 40);
    const t3 = Date.now();
    try {
      const testFilters: MatchFilters = { minAge: 10, maxAge: 60 };
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        socket!.emit('match:request', testFilters, (result: any) => resolve(result));
        setTimeout(() => resolve({ success: false, error: '请求超时' }), 5000);
      });
      if (response.success) {
        updateStep('match-request', 'success', `请求成功 (${Date.now() - t3}ms)`, 100);
        addLog('匹配请求发送成功');
      } else {
        throw new Error(response.error || '请求失败');
      }
    } catch (err: any) {
      updateStep('match-request', 'error', err.message, 0);
      addLog(`匹配请求失败: ${err.message}`);
      setTestRunning(false);
      return;
    }

    // Step 4: Match Waiting
    await new Promise((r) => setTimeout(r, 300));
    updateStep('match-wait', 'running', '等待服务器响应...', 60);
    const t4 = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('等待超时(3s)')), 3000);
        const onSuccess = () => { clearTimeout(timer); cleanup(); resolve(); };
        const onWaiting = () => { clearTimeout(timer); cleanup(); resolve(); };
        const onFailed = (data: any) => { clearTimeout(timer); cleanup(); reject(new Error(data.reason || '匹配失败')); };
        const cleanup = () => {
          socket!.off('match:success', onSuccess);
          socket!.off('match:waiting', onWaiting);
          socket!.off('match:failed', onFailed);
        };
        socket!.once('match:success', onSuccess);
        socket!.once('match:waiting', onWaiting);
        socket!.once('match:failed', onFailed);
      });
      updateStep('match-wait', 'success', `收到响应 (${Date.now() - t4}ms)`, 100);
      addLog('匹配状态正常');
    } catch (err: any) {
      updateStep('match-wait', 'error', err.message, 0);
      addLog(`匹配状态异常: ${err.message}`);
    }

    // Step 5: Match Cancel
    await new Promise((r) => setTimeout(r, 300));
    updateStep('match-cancel', 'running', '取消中...', 50);
    const t5 = Date.now();
    try {
      socket!.emit('match:cancel');
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      updateStep('match-cancel', 'success', `取消成功 (${Date.now() - t5}ms)`, 100);
      addLog('匹配取消成功');
    } catch (err: any) {
      updateStep('match-cancel', 'error', err.message, 0);
      addLog(`匹配取消失败: ${err.message}`);
    }

    // Step 6: Heartbeat
    await new Promise((r) => setTimeout(r, 300));
    updateStep('heartbeat', 'running', '发送心跳...', 50);
    const t6 = Date.now();
    try {
      socket!.emit('heartbeat');
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      updateStep('heartbeat', 'success', `心跳正常 (${Date.now() - t6}ms)`, 100);
      addLog('心跳检测通过');
    } catch (err: any) {
      updateStep('heartbeat', 'error', err.message, 0);
      addLog(`心跳检测失败: ${err.message}`);
    }

    addLog('=== 功能测试执行完毕 ===');
    setTestRunning(false);
  }, [testRunning, profile, addLog, updateStep]);

  const runStressTest = useCallback(() => {
    if (stressRunning || !socket) return;
    setStressRunning(true);
    setStressResult(null);
    setStressProgress(0);
    setStressStep('准备开始...');
    addLog(`=== 开始压力测试: ${stressConfig.concurrent}并发, ${stressConfig.duration}秒 ===`);
    socket.emit('admin:stress_test', stressConfig);
  }, [stressRunning, stressConfig, addLog]);

  if (!isAdmin) return null;

  const getStatusIcon = (status: TestStep['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-5 h-5 text-gray-500" />;
      case 'running': return <Activity className="w-5 h-5 text-primary-400 animate-pulse" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-400" />;
    }
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
          <Bug className="w-5 h-5 text-primary-400" />
          <h1 className="font-bold text-white">匹配功能测试</h1>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
        {/* 服务器状态卡片 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary-400" />
              <span className="font-bold text-white">服务器状态</span>
            </div>
            <div className="flex items-center gap-1">
              {socket?.connected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
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

        {/* 功能测试 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Play className="w-5 h-5 text-primary-400" />
              <span className="font-bold text-white">功能测试</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={runAllTests}
                disabled={testRunning}
                className="px-4 py-2 btn-primary rounded-xl font-medium text-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {testRunning ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {testRunning ? '测试中...' : '开始测试'}
              </button>
              <button
                onClick={resetTests}
                disabled={testRunning}
                className="px-3 py-2 bg-surface-800 rounded-xl text-gray-400 hover:text-white disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {testSteps.map((step) => (
              <div key={step.id} className="space-y-1.5">
                <div className="flex items-center gap-3">
                  {getStatusIcon(step.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{step.name}</span>
                      <span className={`text-xs ${
                        step.status === 'success' ? 'text-green-400' :
                        step.status === 'error' ? 'text-red-400' :
                        step.status === 'running' ? 'text-primary-400' : 'text-gray-500'
                      }`}>
                        {step.status === 'success' ? '通过' :
                         step.status === 'error' ? '失败' :
                         step.status === 'running' ? '执行中' : '等待'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{step.message}</p>
                  </div>
                </div>
                {/* 进度条 */}
                <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      step.status === 'success' ? 'bg-green-500' :
                      step.status === 'error' ? 'bg-red-500' :
                      step.status === 'running' ? 'bg-primary-500 animate-pulse' : 'bg-gray-700'
                    }`}
                    style={{ width: `${step.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 压力测试 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <span className="font-bold text-white">服务器压力测试</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">并发数</label>
              <input
                type="number"
                value={stressConfig.concurrent}
                onChange={(e) => setStressConfig((c) => ({ ...c, concurrent: Math.min(200, Math.max(1, parseInt(e.target.value) || 1)) }))}
                className="w-full px-3 py-2 input-dark rounded-xl text-white text-sm"
                min={1}
                max={200}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">持续时间(秒)</label>
              <input
                type="number"
                value={stressConfig.duration}
                onChange={(e) => setStressConfig((c) => ({ ...c, duration: Math.min(30, Math.max(1, parseInt(e.target.value) || 1)) }))}
                className="w-full px-3 py-2 input-dark rounded-xl text-white text-sm"
                min={1}
                max={30}
              />
            </div>
          </div>

          <button
            onClick={runStressTest}
            disabled={stressRunning}
            className="w-full py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-400 font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-yellow-500/20 transition"
          >
            {stressRunning ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {stressRunning ? '压力测试中...' : '开始压力测试'}
          </button>

          {/* 压力测试进度 */}
          {stressRunning && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{stressStep}</span>
                <span className="text-primary-400 font-medium">{stressProgress}%</span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full transition-all duration-300"
                  style={{ width: `${stressProgress}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500">总计: <span className="text-white">{stressStats.total}</span></span>
                <span className="text-green-400">成功: {stressStats.success}</span>
                <span className="text-red-400">失败: {stressStats.failed}</span>
              </div>
            </div>
          )}

          {/* 压力测试结果 */}
          {stressResult && (
            <div className="mt-4 p-3 bg-surface-800/50 rounded-xl space-y-2">
              <p className="text-sm font-medium text-white">测试结果</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">总请求</span><span className="text-white">{stressResult.total}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">成功率</span><span className="text-green-400">{((stressResult.success / stressResult.total) * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">平均响应</span><span className="text-white">{stressResult.avgTime}ms</span></div>
                <div className="flex justify-between"><span className="text-gray-500">最大响应</span><span className="text-white">{stressResult.maxTime}ms</span></div>
              </div>
            </div>
          )}
        </div>

        {/* 日志 */}
        {logs.length > 0 && (
          <div className="card-elevated rounded-2xl p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">运行日志</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide bg-surface-950/50 rounded-xl p-3">
              {logs.map((log, i) => (
                <p key={i} className="text-xs text-gray-500 font-mono">{log}</p>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
