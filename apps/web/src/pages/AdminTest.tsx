import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Bug, Wifi, WifiOff, User, Clock, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { socket } from '../stores/socketStore';
import { useUserStore } from '../stores/userStore';
import type { MatchFilters } from '@yuyou/shared';

interface TestResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  duration?: number;
}

export default function AdminTest() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const [isAdmin, setIsAdmin] = useState(false);
  const [results, setResults] = useState<TestResult[]>([
    { id: 'socket', name: 'Socket 连接测试', status: 'pending', message: '等待执行' },
    { id: 'profile', name: '用户资料获取', status: 'pending', message: '等待执行' },
    { id: 'match-request', name: '匹配请求发送', status: 'pending', message: '等待执行' },
    { id: 'match-waiting', name: '匹配等待状态', status: 'pending', message: '等待执行' },
    { id: 'match-cancel', name: '匹配取消', status: 'pending', message: '等待执行' },
    { id: 'heartbeat', name: '心跳检测', status: 'pending', message: '等待执行' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const auth = localStorage.getItem('yuyou-admin-auth');
    if (auth !== 'true') {
      navigate('/admin');
      return;
    }
    setIsAdmin(true);
  }, [navigate]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  }, []);

  const updateResult = useCallback((id: string, status: TestResult['status'], message: string, duration?: number) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status, message, duration } : r))
    );
  }, []);

  const runAllTests = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs([]);
    setResults((prev) => prev.map((r) => ({ ...r, status: 'pending', message: '等待执行' })));

    // Test 1: Socket Connection
    addLog('开始测试 Socket 连接...');
    updateResult('socket', 'running', '测试中...');
    const t1 = Date.now();
    try {
      if (!socket) {
        throw new Error('Socket 实例不存在');
      }
      if (socket.connected) {
        updateResult('socket', 'success', `已连接 (SID: ${socket.id?.slice(0, 8)}...)`, Date.now() - t1);
        addLog('Socket 已连接');
      } else {
        socket.connect();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('连接超时')), 5000);
          socket!.once('connect', () => {
            clearTimeout(timer);
            resolve();
          });
          socket!.once('connect_error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        });
        updateResult('socket', 'success', `连接成功 (SID: ${socket.id?.slice(0, 8)}...)`, Date.now() - t1);
        addLog('Socket 连接成功');
      }
    } catch (err: any) {
      updateResult('socket', 'error', err.message, Date.now() - t1);
      addLog(`Socket 连接失败: ${err.message}`);
      setIsRunning(false);
      return;
    }

    // Test 2: Profile
    addLog('检查用户资料...');
    updateResult('profile', 'running', '检查中...');
    const t2 = Date.now();
    if (!profile) {
      updateResult('profile', 'error', '未设置用户资料，请先创建资料', Date.now() - t2);
      addLog('用户资料未设置');
      setIsRunning(false);
      return;
    }
    updateResult('profile', 'success', `${profile.nickname} (${profile.gender === 'male' ? '男' : '女'}, ${profile.age}岁)`, Date.now() - t2);
    addLog(`用户资料: ${profile.nickname}`);

    // Test 3: Match Request
    addLog('发送匹配请求...');
    updateResult('match-request', 'running', '发送中...');
    const t3 = Date.now();
    try {
      const testFilters: MatchFilters = { minAge: 10, maxAge: 60 };
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        socket!.emit('match:request', testFilters, (result: any) => resolve(result));
        setTimeout(() => resolve({ success: false, error: '请求超时' }), 5000);
      });
      if (response.success) {
        updateResult('match-request', 'success', '请求发送成功', Date.now() - t3);
        addLog('匹配请求发送成功');
      } else {
        throw new Error(response.error || '请求失败');
      }
    } catch (err: any) {
      updateResult('match-request', 'error', err.message, Date.now() - t3);
      addLog(`匹配请求失败: ${err.message}`);
      setIsRunning(false);
      return;
    }

    // Test 4: Match Waiting
    addLog('等待匹配状态...');
    updateResult('match-waiting', 'running', '监听中...');
    const t4 = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('等待超时(3s)')), 3000);
        socket!.once('match:waiting', () => {
          clearTimeout(timer);
          resolve();
        });
        socket!.once('match:success', () => {
          clearTimeout(timer);
          resolve();
        });
        socket!.once('match:failed', (data: any) => {
          clearTimeout(timer);
          reject(new Error(data.reason || '匹配失败'));
        });
      });
      updateResult('match-waiting', 'success', '收到匹配等待/成功事件', Date.now() - t4);
      addLog('匹配状态正常');
    } catch (err: any) {
      updateResult('match-waiting', 'error', err.message, Date.now() - t4);
      addLog(`匹配状态异常: ${err.message}`);
    }

    // Test 5: Match Cancel
    addLog('测试匹配取消...');
    updateResult('match-cancel', 'running', '取消中...');
    const t5 = Date.now();
    try {
      socket!.emit('match:cancel');
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      updateResult('match-cancel', 'success', '取消成功', Date.now() - t5);
      addLog('匹配取消成功');
    } catch (err: any) {
      updateResult('match-cancel', 'error', err.message, Date.now() - t5);
      addLog(`匹配取消失败: ${err.message}`);
    }

    // Test 6: Heartbeat
    addLog('测试心跳...');
    updateResult('heartbeat', 'running', '发送中...');
    const t6 = Date.now();
    try {
      socket!.emit('heartbeat');
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      updateResult('heartbeat', 'success', '心跳发送成功', Date.now() - t6);
      addLog('心跳检测通过');
    } catch (err: any) {
      updateResult('heartbeat', 'error', err.message, Date.now() - t6);
      addLog(`心跳检测失败: ${err.message}`);
    }

    addLog('所有测试执行完毕');
    setIsRunning(false);
  }, [isRunning, profile, addLog, updateResult]);

  const resetTests = useCallback(() => {
    setResults((prev) => prev.map((r) => ({ ...r, status: 'pending', message: '等待执行' })));
    setLogs([]);
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
          <h1 className="font-bold text-white">匹配功能测试</h1>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
        {/* Status Card */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {socket?.connected ? (
                <Wifi className="w-5 h-5 text-green-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
              <span className="font-medium text-white">
                {socket?.connected ? '已连接' : '未连接'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-400">
                {profile ? profile.nickname : '未登录'}
              </span>
            </div>
          </div>
          {socket?.id && (
            <p className="text-xs text-gray-600 font-mono">SID: {socket.id}</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          <button
            onClick={runAllTests}
            disabled={isRunning}
            className="flex-1 py-3.5 btn-primary rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Square className="w-4 h-4" />
                测试中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                运行全部测试
              </>
            )}
          </button>
          <button
            onClick={resetTests}
            disabled={isRunning}
            className="px-4 py-3.5 bg-surface-800 rounded-2xl text-gray-400 hover:text-white disabled:opacity-50"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        {/* Test Results */}
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={result.id}
              className={`card-elevated rounded-2xl p-4 flex items-center gap-3 ${
                result.status === 'running' ? 'border border-primary-500/20' : ''
              }`}
            >
              {result.status === 'pending' && (
                <div className="w-8 h-8 rounded-full bg-surface-700/40 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-gray-500" />
                </div>
              )}
              {result.status === 'running' && (
                <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center animate-pulse">
                  <div className="w-4 h-4 rounded-full border-2 border-primary-400 border-t-transparent animate-spin" />
                </div>
              )}
              {result.status === 'success' && (
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                </div>
              )}
              {result.status === 'error' && (
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white text-sm">{result.name}</p>
                <p className="text-xs text-gray-500 truncate">{result.message}</p>
              </div>
              {result.duration !== undefined && (
                <span className="text-xs text-gray-600 font-mono">{result.duration}ms</span>
              )}
            </div>
          ))}
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="card-elevated rounded-2xl p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">运行日志</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-hide">
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
