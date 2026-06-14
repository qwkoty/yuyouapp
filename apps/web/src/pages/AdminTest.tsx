import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Wifi, WifiOff, Users, Activity, Gauge, Play, RotateCcw, CheckCircle, XCircle, Zap, MapPin, ChevronDown, Database, UserCheck, MessageCircle, Bot } from 'lucide-react';
import { socket } from '../stores/socketStore';
import { useUserStore } from '../stores/userStore';
import { PROVINCE_CITIES } from '../lib/cityData';
import type { MatchFilters } from '@yuyou/shared';

interface ServerStats {
  onlineCount: number;
  matchingCount: number;
  activeSessions: number;
}

interface AdminSystemStats {
  totalUsers: number;
  totalMatches: number;
  totalMessages: number;
  totalAgents: number;
  onlineCount: number;
}

interface AdminUser {
  id: string;
  phone: string;
  nickname: string;
  gender: string;
  age: number;
  province: string;
  city: string;
  createdAt: number;
}

interface AdminMatch {
  id: string;
  userId: string;
  partnerNickname: string;
  partnerCity: string;
  durationSeconds: number;
  matchedAt: number;
}

export default function AdminTest() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState('');

  // 系统统计（来自数据库）
  const [systemStats, setSystemStats] = useState<AdminSystemStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [recentMatches, setRecentMatches] = useState<AdminMatch[]>([]);
  const [loadingSystem, setLoadingSystem] = useState(false);

  // 服务器统计
  const [stats, setStats] = useState<ServerStats>({ onlineCount: 0, matchingCount: 0, activeSessions: 0 });

  // 匹配功能测试
  const [matchTestRunning, setMatchTestRunning] = useState(false);
  const [matchTestStep, setMatchTestStep] = useState('');
  const [matchTestProgress, setMatchTestProgress] = useState(0);
  const [matchTestStatus, setMatchTestStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [matchTestResult, setMatchTestResult] = useState('');
  const [matchConcurrent, setMatchConcurrent] = useState(1);

  // 地区筛选
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // 服务器压力测试
  const [stressRunning, setStressRunning] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(50);
  const [stressStep, setStressStep] = useState('');
  const [stressProgress, setStressProgress] = useState(0);
  const [stressStatus, setStressStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [stressResult, setStressResult] = useState('');

  // Refs
  const stressRunningRef = useRef(stressRunning);
  stressRunningRef.current = stressRunning;

  const provinces = Object.keys(PROVINCE_CITIES);
  const cities = selectedProvince ? PROVINCE_CITIES[selectedProvince] : [];

  useEffect(() => {
    // 服务器端验证token
    const token = localStorage.getItem('yuyou-admin-token');
    if (!token) {
      navigate('/settings');
      return;
    }

    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsAdmin(true);
          setAdminKey(token);
          // Socket认证
          if (socket && socket.connected) {
            socket.emit('admin:auth', token);
          }
        } else {
          localStorage.removeItem('yuyou-admin-token');
          navigate('/settings');
        }
      })
      .catch(() => {
        localStorage.removeItem('yuyou-admin-token');
        navigate('/settings');
      });
  }, [navigate]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const onStats = (data: ServerStats) => setStats(data);
    const onStressProgress = (data: { step: string; progress: number }) => {
      setStressStep(data.step);
      setStressProgress(data.progress);
    };
    const onStressComplete = (data: { total: number; success: number; failed: number; avgTime: number; maxTime: number }) => {
      setStressStatus('success');
      setStressProgress(100);
      setStressResult(`完成! ${data.success}/${data.total} 成功, 平均${data.avgTime}ms`);
      setStressRunning(false);
    };

    socket!.on('admin:stats', onStats);
    socket!.on('admin:stress_progress', onStressProgress);
    socket!.on('admin:stress_complete', onStressComplete);

    return () => {
      socket!.off('admin:stats', onStats);
      socket!.off('admin:stress_progress', onStressProgress);
      socket!.off('admin:stress_complete', onStressComplete);
    };
  }, []);

  // 心跳 + 统计
  useEffect(() => {
    if (!isAdmin || !socket) return;

    if (socket.connected) socket.emit('heartbeat');

    const fetchStats = () => {
      if (socket?.connected) {
        socket.emit('heartbeat');
        socket.emit('admin:get_stats');
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // 加载系统统计
  const loadSystemStats = useCallback(async () => {
    if (!adminKey) return;
    setLoadingSystem(true);
    try {
      const headers = { 'Authorization': `Bearer ${adminKey}` };
      const [statsRes, usersRes, matchesRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/recent-users', { headers }),
        fetch('/api/admin/recent-matches', { headers }),
      ]);
      const [s, u, m] = await Promise.all([statsRes.json(), usersRes.json(), matchesRes.json()]);
      if (s.success) setSystemStats(s.stats);
      if (u.success) setRecentUsers(u.users);
      if (m.success) setRecentMatches(m.matches);
    } catch {
      // ignore
    } finally {
      setLoadingSystem(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (isAdmin) loadSystemStats();
  }, [isAdmin, loadSystemStats]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClick = () => {
      setShowProvinceDropdown(false);
      setShowCityDropdown(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
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
      setMatchTestStep(steps[0].name);
      setMatchTestProgress(steps[0].progress);
      if (!socket || !socket.connected) throw new Error('Socket 未连接');
      await new Promise((r) => setTimeout(r, 400));

      setMatchTestStep(steps[1].name);
      setMatchTestProgress(steps[1].progress);
      if (!profile) throw new Error('未设置用户资料');
      await new Promise((r) => setTimeout(r, 300));

      setMatchTestStep(steps[2].name);
      setMatchTestProgress(steps[2].progress);

      const testFilters: MatchFilters = {
        minAge: 10,
        maxAge: 60,
        province: selectedProvince || undefined,
      };

      for (let i = 0; i < matchConcurrent; i++) {
        socket.emit('match:request', testFilters, () => {});
        if (matchConcurrent > 1) await new Promise((r) => setTimeout(r, 200));
      }
      await new Promise((r) => setTimeout(r, 500));

      setMatchTestStep(steps[3].name);
      setMatchTestProgress(steps[3].progress);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { cleanup(); resolve(); }, 2000);
        const onWaiting = () => { cleanup(); clearTimeout(timer); resolve(); };
        const onSuccess = () => { cleanup(); clearTimeout(timer); resolve(); };
        const cleanup = () => {
          socket!.off('match:waiting', onWaiting);
          socket!.off('match:success', onSuccess);
        };
        socket!.once('match:waiting', onWaiting);
        socket!.once('match:success', onSuccess);
      });

      socket.emit('match:cancel');
      setMatchTestStep(steps[4].name);
      setMatchTestProgress(steps[4].progress);
      await new Promise((r) => setTimeout(r, 300));

      setMatchTestStatus('success');
      const locationStr = selectedProvince ? (selectedCity ? `${selectedProvince}-${selectedCity}` : selectedProvince) : '不限地区';
      setMatchTestResult(`测试通过 | ${matchConcurrent}人同时匹配 | ${locationStr}`);
    } catch (err: any) {
      setMatchTestStatus('error');
      setMatchTestResult(err.message);
    } finally {
      setMatchTestRunning(false);
    }
  }, [matchTestRunning, profile, matchConcurrent, selectedProvince, selectedCity]);

  // 服务器压力测试
  const runStressTest = useCallback(() => {
    if (stressRunningRef.current || !socket) return;
    setStressRunning(true);
    setStressStatus('running');
    setStressProgress(0);
    setStressResult('');
    setStressStep('准备开始...');

    socket.emit('admin:stress_test', { concurrent: onlineUsers, duration: 3 });
  }, [onlineUsers]);

  const resetAll = useCallback(() => {
    setMatchTestStatus('idle');
    setMatchTestProgress(0);
    setMatchTestStep('');
    setMatchTestResult('');
    setStressStatus('idle');
    setStressProgress(0);
    setStressStep('');
    setStressResult('');
    setStressRunning(false);
    setSelectedProvince('');
    setSelectedCity('');
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

        {/* 系统统计（数据库） */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-white">系统统计</span>
            </div>
            <button
              onClick={loadSystemStats}
              disabled={loadingSystem}
              className="text-xs text-gray-500 hover:text-white transition"
            >
              {loadingSystem ? '加载中...' : '刷新'}
            </button>
          </div>
          {systemStats ? (
            <>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="bg-surface-800/50 rounded-xl p-2.5 text-center">
                  <UserCheck className="w-4 h-4 text-blue-400 mx-auto mb-0.5" />
                  <p className="text-base font-black text-white">{systemStats.totalUsers}</p>
                  <p className="text-[10px] text-gray-500">用户</p>
                </div>
                <div className="bg-surface-800/50 rounded-xl p-2.5 text-center">
                  <Activity className="w-4 h-4 text-yellow-400 mx-auto mb-0.5" />
                  <p className="text-base font-black text-white">{systemStats.totalMatches}</p>
                  <p className="text-[10px] text-gray-500">匹配</p>
                </div>
                <div className="bg-surface-800/50 rounded-xl p-2.5 text-center">
                  <MessageCircle className="w-4 h-4 text-green-400 mx-auto mb-0.5" />
                  <p className="text-base font-black text-white">{systemStats.totalMessages}</p>
                  <p className="text-[10px] text-gray-500">消息</p>
                </div>
                <div className="bg-surface-800/50 rounded-xl p-2.5 text-center">
                  <Bot className="w-4 h-4 text-purple-400 mx-auto mb-0.5" />
                  <p className="text-base font-black text-white">{systemStats.totalAgents}</p>
                  <p className="text-[10px] text-gray-500">智能体</p>
                </div>
              </div>

              {/* 最近用户 */}
              {recentUsers.length > 0 && (
                <details className="mb-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-white py-1">最近注册用户 ({recentUsers.length})</summary>
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
                    {recentUsers.map(u => (
                      <div key={u.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-surface-800/30">
                        <span className="text-white truncate flex-1">{u.nickname || u.phone}</span>
                        <span className="text-gray-500 ml-2">{u.gender === 'male' ? '男' : '女'} · {u.city || '-'}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* 最近匹配 */}
              {recentMatches.length > 0 && (
                <details>
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-white py-1">最近匹配 ({recentMatches.length})</summary>
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
                    {recentMatches.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-surface-800/30">
                        <span className="text-white truncate flex-1">{m.partnerNickname}</span>
                        <span className="text-gray-500 ml-2">{m.partnerCity} · {m.durationSeconds}s</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-xs text-gray-600">
              {loadingSystem ? '加载中...' : '点击刷新加载'}
            </div>
          )}
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

          {/* 地区选择 */}
          <div className="mb-4 space-y-3">
            <label className="text-xs text-gray-500 block">匹配地区</label>
            <div className="grid grid-cols-2 gap-3">
              {/* 省份 */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setShowProvinceDropdown(!showProvinceDropdown); setShowCityDropdown(false); }}
                  className="w-full px-4 py-3 input-dark rounded-2xl text-white text-left text-sm flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    {selectedProvince || '选择省份'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showProvinceDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showProvinceDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 p-2 card-elevated rounded-2xl max-h-48 overflow-y-auto scrollbar-hide z-20">
                    <button
                      onClick={() => { setSelectedProvince(''); setSelectedCity(''); setShowProvinceDropdown(false); }}
                      className={`w-full py-2 rounded-xl text-sm text-left px-3 transition ${!selectedProvince ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                      不限
                    </button>
                    {provinces.map((p) => (
                      <button
                        key={p}
                        onClick={() => { setSelectedProvince(p); setSelectedCity(''); setShowProvinceDropdown(false); }}
                        className={`w-full py-2 rounded-xl text-sm text-left px-3 transition ${selectedProvince === p ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 城市 */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => selectedProvince && setShowCityDropdown(!showCityDropdown)}
                  disabled={!selectedProvince}
                  className="w-full px-4 py-3 input-dark rounded-2xl text-white text-left text-sm flex items-center justify-between disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    {selectedCity || '选择城市'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showCityDropdown && selectedProvince && (
                  <div className="absolute top-full left-0 right-0 mt-1 p-2 card-elevated rounded-2xl max-h-48 overflow-y-auto scrollbar-hide z-20">
                    <button
                      onClick={() => { setSelectedCity(''); setShowCityDropdown(false); }}
                      className={`w-full py-2 rounded-xl text-sm text-left px-3 transition ${!selectedCity ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                      不限
                    </button>
                    {cities.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setSelectedCity(c); setShowCityDropdown(false); }}
                        className={`w-full py-2 rounded-xl text-sm text-left px-3 transition ${selectedCity === c ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 同时匹配人数 */}
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
                style={{ background: `linear-gradient(to right, #8b5cf6 ${(matchConcurrent - 1) / 9 * 100}%, #1f1f23 ${(matchConcurrent - 1) / 9 * 100}%)` }}
              />
              <span className="text-sm font-bold text-white w-8 text-center">{matchConcurrent}</span>
            </div>
          </div>

          {/* 进度条 */}
          {matchTestStatus !== 'idle' && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{matchTestStep}</span>
                <span className={`font-medium ${matchTestStatus === 'success' ? 'text-green-400' : matchTestStatus === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                  {matchTestProgress}%
                </span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-400 ${matchTestStatus === 'success' ? 'bg-green-500' : matchTestStatus === 'error' ? 'bg-red-500' : 'bg-primary-500 animate-pulse'}`}
                  style={{ width: `${matchTestProgress}%` }}
                />
              </div>
              {matchTestResult && (
                <p className={`text-xs ${matchTestStatus === 'success' ? 'text-green-400' : matchTestStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
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
                style={{ background: `linear-gradient(to right, #eab308 ${(onlineUsers - 10) / 190 * 100}%, #1f1f23 ${(onlineUsers - 10) / 190 * 100}%)` }}
              />
              <span className="text-sm font-bold text-white w-10 text-center">{onlineUsers}</span>
            </div>
          </div>

          {stressStatus !== 'idle' && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{stressStep}</span>
                <span className={`font-medium ${stressStatus === 'success' ? 'text-green-400' : stressStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {stressProgress}%
                </span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${stressStatus === 'success' ? 'bg-green-500' : stressStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`}
                  style={{ width: `${stressProgress}%` }}
                />
              </div>
              {stressResult && (
                <p className={`text-xs ${stressStatus === 'success' ? 'text-green-400' : stressStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
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
