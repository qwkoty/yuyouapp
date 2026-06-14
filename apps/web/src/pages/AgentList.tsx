import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, MessageSquare, Trash2, Edit, Wallet, RefreshCw } from 'lucide-react';
import Loading from '../components/Loading';

interface Agent {
  id: string;
  name: string;
  avatar: string;
  model: string;
  api_provider: string;
  api_key?: string;
  wechat_bound: boolean;
  created_at: string;
}

interface BalanceInfo {
  provider: string;
  balance: number | null;
  currency: string;
  used: number | null;
  total: number | null;
}

export default function AgentList() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<Record<string, BalanceInfo>>({});
  const [balanceLoading, setBalanceLoading] = useState<Record<string, boolean>>({});

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('yuyou-token');
      const res = await fetch('/api/agents', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setAgents(data.agents);
    } catch (err) {
      console.error('获取智能体列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async (agentId: string) => {
    setBalanceLoading(prev => ({ ...prev, [agentId]: true }));
    try {
      const token = localStorage.getItem('yuyou-token');
      const res = await fetch(`/api/agents/${agentId}/balance`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setBalances(prev => ({ ...prev, [agentId]: data.balance }));
      }
    } catch (err) {
      console.error('查询余额失败:', err);
    } finally {
      setBalanceLoading(prev => ({ ...prev, [agentId]: false }));
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // 智能体加载完后，自动查询有 API Key 的智能体余额
  useEffect(() => {
    if (agents.length === 0) return;
    agents.forEach(agent => {
      if (agent.api_key) {
        fetchBalance(agent.id);
      }
    });
  }, [agents.length]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个智能体？')) return;
    const token = localStorage.getItem('yuyou-token');
    await fetch(`/api/agents/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    fetchAgents();
  };

  const getProviderLabel = (provider: string) => {
    const map: Record<string, string> = { deepseek: 'DeepSeek', openai: 'OpenAI', custom: '自定义' };
    return map[provider] || provider;
  };

  return (
    <div className="min-h-screen bg-surface-950 relative page-enter">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary-500/[0.02] to-transparent pointer-events-none" />

      <div className="relative z-10 px-5 pt-6 pb-28">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">智能体</h1>
          <button onClick={() => navigate('/agents/create')} className="p-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/20">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="py-24">
            <Loading text="加载中..." />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface-700/40 flex items-center justify-center">
              <Bot className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-500 text-lg font-medium">还没有智能体</p>
            <p className="text-gray-600 text-sm">点击右上角 + 创建你的第一个AI智能体</p>
            <button
              onClick={() => navigate('/agents/create')}
              className="mt-2 px-6 py-2.5 btn-primary rounded-2xl text-sm font-bold"
            >
              创建智能体
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => {
              const bal = balances[agent.id];
              const isLoading = balanceLoading[agent.id];

              return (
                <div key={agent.id} className="card-elevated rounded-2xl p-4 border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-600/5 flex items-center justify-center text-2xl border border-primary-500/15 shrink-0">
                      {agent.avatar?.startsWith('data:') ? (
                        <img src={agent.avatar} className="w-full h-full object-cover rounded-full" alt="" />
                      ) : (
                        agent.avatar || '🤖'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-white truncate">{agent.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-surface-700/30">{getProviderLabel(agent.api_provider)}</span>
                        <span>{agent.model}</span>
                        {agent.wechat_bound && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">微信</span>
                        )}
                      </div>
                    </div>
                    {/* 余额显示 */}
                    {agent.api_key && (
                      <div className="text-right shrink-0">
                        {isLoading ? (
                          <RefreshCw className="w-3.5 h-3.5 text-gray-600 animate-spin mx-auto" />
                        ) : bal?.balance !== null && bal?.balance !== undefined ? (
                          <div>
                            <div className="text-sm font-bold text-white">{bal.balance.toFixed(2)}</div>
                            <div className="text-[10px] text-gray-500">{bal.currency}</div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); fetchBalance(agent.id); }}
                            className="text-[10px] text-gray-600 hover:text-primary-400 transition"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => navigate(`/agents/${agent.id}/edit`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-700/30 text-gray-400 text-xs hover:bg-surface-700/50 transition">
                      <Edit className="w-3.5 h-3.5" /> 编辑
                    </button>
                    <button onClick={() => navigate(`/agents/${agent.id}/chat`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary-500/10 text-primary-400 text-xs hover:bg-primary-500/20 transition">
                      <MessageSquare className="w-3.5 h-3.5" /> 测试
                    </button>
                    <button onClick={() => handleDelete(agent.id)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/[0.05] text-red-400 text-xs hover:bg-red-500/10 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
