import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, RefreshCw, Wifi, WifiOff, Table, Key } from 'lucide-react';
import api from '../lib/apiClient';

interface DbStatus {
  postgres: {
    connected: boolean;
    tables: Record<string, number>;
    pool: { totalCount: number; idleCount: number; waitingCount: number };
  };
  redis: { status: string; totalKeys: number };
}

const TABLE_LABELS: Record<string, string> = {
  users: '用户',
  match_records: '匹配记录',
  reports: '举报',
  ai_agents: 'AI 智能体',
  ai_conversations: '对话记录',
  verification_codes: '验证码',
  announcements: '公告',
};

export default function DatabaseStatus() {
  const navigate = useNavigate();
  const adminToken = localStorage.getItem('yuyou-admin-token') || '';
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const data = await api.post<{ success: boolean } & DbStatus>(
        '/admin/db-status', { token: adminToken }, { silent: true }
      );
      if (data.success) setStatus(data as any as DbStatus);
    } catch {}
  };

  useEffect(() => {
    if (!adminToken) { navigate('/settings'); return; }
    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken }),
    }).then(r => r.json()).then(data => {
      if (!data.success) { navigate('/settings'); return; }
      setLoading(false);
      fetchStatus();
    }).catch(() => navigate('/settings'));
  }, []);

  useEffect(() => {
    const iv = setInterval(fetchStatus, 10000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return null;

  const tableEntries = status ? Object.entries(status.postgres.tables) : [];
  const totalRecords = tableEntries.reduce((s, [, v]) => s + Math.max(0, v), 0);

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-white/[0.04]">
        <button onClick={() => navigate('/settings')} className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary-400" />
          <h1 className="font-bold text-white">数据库状态</h1>
        </div>
        <button onClick={fetchStatus} className="ml-auto w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center text-gray-400 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide max-w-lg mx-auto w-full">
        {/* PostgreSQL */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Table className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-white">PostgreSQL</span>
            {status?.postgres.connected ? (
              <span className="flex items-center gap-1 text-xs text-green-400 ml-auto"><Wifi className="w-3.5 h-3.5" /> 已连接</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-400 ml-auto"><WifiOff className="w-3.5 h-3.5" /> 断开</span>
            )}
          </div>

          {/* 总记录数 */}
          <div className="bg-surface-800/50 rounded-xl p-3 mb-3 text-center">
            <p className="text-2xl font-black text-white">{totalRecords.toLocaleString()}</p>
            <p className="text-xs text-gray-500">总记录数</p>
          </div>

          {/* 各表记录数 */}
          <div className="space-y-2">
            {tableEntries.map(([table, count]) => (
              <div key={table} className="flex items-center justify-between p-3 bg-surface-800/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-sm text-gray-300">{TABLE_LABELS[table] || table}</span>
                  <span className="text-xs text-gray-600">{table}</span>
                </div>
                <span className={`text-sm font-bold ${count === -1 ? 'text-red-400' : 'text-white'}`}>
                  {count === -1 ? '错误' : count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* 连接池 */}
          {status?.postgres.pool && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-xs text-gray-500 mb-2">连接池</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-sm font-bold text-white">{status.postgres.pool.totalCount}</p>
                  <p className="text-[10px] text-gray-500">总连接</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-green-400">{status.postgres.pool.idleCount}</p>
                  <p className="text-[10px] text-gray-500">空闲</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-yellow-400">{status.postgres.pool.waitingCount}</p>
                  <p className="text-[10px] text-gray-500">等待</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Redis */}
        <div className="card-elevated rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-red-400" />
            <span className="font-bold text-white">Redis</span>
            {status?.redis.status === 'connected' ? (
              <span className="flex items-center gap-1 text-xs text-green-400 ml-auto"><Wifi className="w-3.5 h-3.5" /> 已连接</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-400 ml-auto"><WifiOff className="w-3.5 h-3.5" /> {status?.redis.status || '断开'}</span>
            )}
          </div>

          <div className="bg-surface-800/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-white">{status?.redis.totalKeys.toLocaleString() || 0}</p>
            <p className="text-xs text-gray-500">总键数</p>
          </div>
        </div>
      </div>
    </div>
  );
}
