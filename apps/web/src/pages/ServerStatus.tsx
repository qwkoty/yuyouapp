import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Server, Cpu, HardDrive, Clock, Users, UserX, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { socket } from '../stores/socketStore';
import api from '../lib/apiClient';
import Loading from '../components/Loading';

interface ServerInfo {
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  cpu: { user: number; system: number };
  nodeVersion: string;
  platform: string;
}

interface ConnectedUser {
  socketId: string;
  userId: string;
  nickname: string;
  city: string;
  isAdmin: boolean;
}

function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}天${h}时${m}分`;
  if (h > 0) return `${h}时${m}分`;
  return `${m}分`;
}

export default function ServerStatus() {
  const navigate = useNavigate();
  const adminToken = localStorage.getItem('yuyou-admin-token') || '';
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [kickingId, setKickingId] = useState<string | null>(null);

  const fetchServerStatus = async () => {
    try {
      const data = await api.post<{ success: boolean; server: ServerInfo }>(
        '/admin/server-status', { token: adminToken }, { silent: true }
      );
      if (data.success) setServerInfo(data.server);
    } catch {}
  };

  const fetchUsers = () => {
    if (socket?.connected) {
      socket.emit('admin:get_users');
    }
  };

  useEffect(() => {
    if (!adminToken) { navigate('/settings'); return; }

    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken }),
    }).then(r => r.json()).then(data => {
      if (!data.success) { navigate('/settings'); return; }
      if (socket && socket.connected) socket.emit('admin:auth', adminToken);
      setLoading(false);
      fetchServerStatus();
      fetchUsers();
    }).catch(() => navigate('/settings'));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onUsers = (data: { users: ConnectedUser[] }) => setUsers(data.users);
    const onKickResult = (data: { success: boolean; kicked: number }) => {
      setKickingId(null);
      if (data.success) setTimeout(fetchUsers, 500);
    };
    socket.on('admin:users', onUsers);
    socket.on('admin:kick_result', onKickResult);
    return () => {
      socket!.off('admin:users', onUsers);
      socket!.off('admin:kick_result', onKickResult);
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => { fetchServerStatus(); fetchUsers(); }, 5000);
    return () => clearInterval(iv);
  }, []);

  const kickUser = (userId: string) => {
    if (!socket?.connected) return;
    setKickingId(userId);
    socket.emit('admin:kick_user', { userId });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-900">
        <Loading fullScreen />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-white/[0.04]">
        <button onClick={() => navigate('/settings')} className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-primary-400" />
          <h1 className="font-bold text-white">服务器状态</h1>
        </div>
        <button onClick={() => { fetchServerStatus(); fetchUsers(); }} className="ml-auto w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center text-gray-400 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide max-w-lg mx-auto w-full">
        {/* 服务器信息 */}
        {serverInfo && (
          <div className="card-elevated rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="font-bold text-white">运行中</span>
              <span className="text-xs text-gray-500 ml-auto">{serverInfo.nodeVersion}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-800/50 rounded-xl p-3">
                <Clock className="w-4 h-4 text-blue-400 mb-1" />
                <p className="text-lg font-black text-white">{formatUptime(serverInfo.uptime)}</p>
                <p className="text-xs text-gray-500">运行时长</p>
              </div>
              <div className="bg-surface-800/50 rounded-xl p-3">
                <Cpu className="w-4 h-4 text-yellow-400 mb-1" />
                <p className="text-lg font-black text-white">{serverInfo.cpu.user + serverInfo.cpu.system}ms</p>
                <p className="text-xs text-gray-500">CPU 使用</p>
              </div>
              <div className="bg-surface-800/50 rounded-xl p-3">
                <HardDrive className="w-4 h-4 text-purple-400 mb-1" />
                <p className="text-lg font-black text-white">{serverInfo.memory.heapUsed}MB</p>
                <p className="text-xs text-gray-500">堆内存 / {serverInfo.memory.heapTotal}MB</p>
              </div>
              <div className="bg-surface-800/50 rounded-xl p-3">
                <HardDrive className="w-4 h-4 text-emerald-400 mb-1" />
                <p className="text-lg font-black text-white">{serverInfo.memory.rss}MB</p>
                <p className="text-xs text-gray-500">总内存 (RSS)</p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.04]">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Socket 连接状态:</span>
                {socket?.connected ? (
                  <span className="flex items-center gap-1 text-green-400"><Wifi className="w-3.5 h-3.5" /> 已连接</span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400"><WifiOff className="w-3.5 h-3.5" /> 未连接</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 在线用户列表 */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-400" />
              <span className="font-bold text-white">在线用户</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-300">{users.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            {users.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">暂无在线用户</p>
            )}
            {users.map(u => (
              <div key={u.socketId} className="flex items-center gap-3 p-3 bg-surface-800/50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-primary-500/15 flex items-center justify-center text-sm font-bold text-primary-300">
                  {u.nickname[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm truncate">{u.nickname}</span>
                    {u.isAdmin && <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/15 text-yellow-300">管理员</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{u.city || '未知地区'} · {u.socketId.slice(0, 8)}</p>
                </div>
                {!u.isAdmin && (
                  <button
                    onClick={() => kickUser(u.userId)}
                    disabled={kickingId === u.userId}
                    className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition disabled:opacity-50"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
