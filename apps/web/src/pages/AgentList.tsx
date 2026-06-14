import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, MessageSquare, Trash2, Edit, RefreshCw } from 'lucide-react';
import api from '../lib/apiClient';
import { toast } from '../components/Toast';

interface Agent {
  id: string;
  name: string;
  avatar: string;
  model: string;
  apiProvider: string;
  hasApiKey: boolean;
  wechatBound: boolean;
  createdAt: string;
}

interface BalanceInfo {
  provider: string;
  balance: number | null;
  currency: string;
  used: number | null;
  total: number | null;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  cache_total_tokens: number;
  hit_rate: number;
  miss_rate: number;
  total_calls: number;
}

function formatNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

export default function AgentList() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<Record<string, BalanceInfo>>({});
  const [balanceLoading, setBalanceLoading] = useState<Record<string, boolean>>({});

  const fetchAgents = async () => {
    try {
      const data = await api.get<{ success: boolean; agents: Agent[] }>('/agents');
      if (data.success) setAgents(data.agents);
    } catch (err) {
      // 已被 apiClient toast
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async (agentId: string, showLoading = true) => {
    if (showLoading) setBalanceLoading(prev => ({ ...prev, [agentId]: true }));
    try {
      const data = await api.get<{ success: boolean; balance: BalanceInfo }>(`/agents/${agentId}/balance`, { silent: true, retry: false });
      if (data.success) {
        setBalances(prev => ({ ...prev, [agentId]: data.balance }));
      }
    } catch (err) {
      // 静默
    } finally {
      if (showLoading) setBalanceLoading(prev => ({ ...prev, [agentId]: false }));
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // 智能体加载完后，自动查询余额
  useEffect(() => {
    if (agents.length === 0) return;
    agents.forEach(agent => {
      if (agent.hasApiKey) {
        fetchBalance(agent.id, false);
      }
    });
  }, [agents.length]);

  // 自动轮询余额（30秒）
  useEffect(() => {
    const interval = setInterval(() => {
      agents.forEach(agent => {
        if (agent.hasApiKey) {
          fetchBalance(agent.id, false);
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [agents]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个智能体？')) return;
    try {
      await api.delete(`/agents/${id}`);
      toast.success('已删除');
      fetchAgents();
    } catch (err) {}
  };

  // 长按快速测试
  const longPressTimerRef = useRef<Record<string, number>>({});
  const handlePressStart = (id: string) => {
    longPressTimerRef.current[id] = window.setTimeout(() => {
      navigate(`/agents/${id}/chat`);
    }, 600);
  };
  const handlePressEnd = (id: string) => {
    if (longPressTimerRef.current[id]) {
      clearTimeout(longPressTimerRef.current[id]);
      delete longPressTimerRef.current[id];
    }
  };

  const getProviderLabel = (provider: string) => {
    const map: Record<string, string> = { deepseek: 'DeepSeek', openai: 'OpenAI', nvidia: 'NVIDIA', custom: '自定义' };
    return map[provider] || provider;
  };

  return (
    <div className="min-h-screen bg-surface-950 relative page-enter">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary-500/[0.02] to-transparent pointer-events-none" />

      <div className="relative z-10 px-5 pt-6 pb-28">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">智能体</h1>
            <p className="text-xs text-gray-500 mt-0.5">配置和管理你的 AI 智能体</p>
          </div>
          <button onClick={() => navigate('/agents/create')} className="p-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/20">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm mt-4">加载中...</p>
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
              const hasCache = bal && (bal.cache_hit_tokens > 0 || bal.cache_miss_tokens > 0);

              return (
                <div
                  key={agent.id}
                  className="card-elevated rounded-2xl p-4 border border-white/[0.04] select-none"
                  onTouchStart={() => handlePressStart(agent.id)}
                  onTouchEnd={() => handlePressEnd(agent.id)}
                  onMouseDown={() => handlePressStart(agent.id)}
                  onMouseUp={() => handlePressEnd(agent.id)}
                  onMouseLeave={() => handlePressEnd(agent.id)}
                >
                  {/* 头部：头像 + 名称 + 刷新按钮 */}
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
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-surface-700/30">{getProviderLabel(agent.apiProvider)}</span>
                        <span>·</span>
                        <span className="truncate">{agent.model}</span>
                        {agent.wechatBound && (
                          <>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">微信</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => fetchBalance(agent.id)}
                      disabled={isLoading}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-primary-400 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* 数据面板 */}
                  {agent.hasApiKey && (
                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                      {/* 余额 */}
                      <div className="px-2.5 py-1.5 rounded-lg bg-surface-700/20 border border-white/[0.03]">
                        <div className="text-[10px] text-gray-500">余额</div>
                        <div className="text-sm font-semibold text-white mt-0.5">
                          {bal && bal.balance !== null ? (
                            <>{bal.balance.toFixed(2)} <span className="text-[10px] text-gray-500">{bal.currency}</span></>
                          ) : (
                            <span className="text-gray-600">--</span>
                          )}
                        </div>
                      </div>
                      {/* 已用/总额 */}
                      <div className="px-2.5 py-1.5 rounded-lg bg-surface-700/20 border border-white/[0.03]">
                        <div className="text-[10px] text-gray-500">已用/总额</div>
                        <div className="text-sm font-semibold text-white mt-0.5">
                          {bal && bal.total !== null ? (
                            <>{bal.used !== null ? bal.used.toFixed(2) : '0'} / {bal.total.toFixed(2)}</>
                          ) : (
                            <span className="text-gray-600">-- / --</span>
                          )}
                        </div>
                      </div>
                      {/* 缓存命中 */}
                      <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/[0.05] border border-emerald-500/10">
                        <div className="text-[10px] text-emerald-400/70">缓存命中</div>
                        <div className="text-sm font-semibold mt-0.5">
                          {hasCache ? (
                            <>
                              <span className="text-emerald-400">{bal!.hit_rate}%</span>
                              <span className="text-[10px] text-gray-500 ml-1">{formatNum(bal!.cache_hit_tokens)}tok</span>
                            </>
                          ) : (
                            <span className="text-gray-600">--</span>
                          )}
                        </div>
                      </div>
                      {/* 缓存未命中 */}
                      <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/10">
                        <div className="text-[10px] text-amber-400/70">缓存未命中</div>
                        <div className="text-sm font-semibold mt-0.5">
                          {hasCache ? (
                            <>
                              <span className="text-amber-400">{bal!.miss_rate}%</span>
                              <span className="text-[10px] text-gray-500 ml-1">{formatNum(bal!.cache_miss_tokens)}tok</span>
                            </>
                          ) : (
                            <span className="text-gray-600">--</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 底部操作按钮 */}
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
