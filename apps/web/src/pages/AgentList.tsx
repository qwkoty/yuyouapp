import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot, MessageSquare, Trash2, Edit, ChevronLeft } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  avatar: string;
  model: string;
  api_provider: string;
  wechat_bound: boolean;
  created_at: string;
}

export default function AgentList() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchAgents(); }, []);

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

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="px-5 pt-6 pb-24">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/settings')} className="p-2.5 rounded-xl bg-surface-700/40 text-gray-400 hover:text-white hover:bg-surface-600/60 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-white">智能体管理</h1>
          <button onClick={() => navigate('/agents/create')} className="p-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/20">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="text-center text-gray-500 py-20">加载中...</div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface-700/40 flex items-center justify-center mx-auto">
              <Bot className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-500">还没有智能体</p>
            <p className="text-gray-600 text-sm">点击右上角 + 创建你的第一个AI智能体</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="card-elevated rounded-2xl p-4 border border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-600/5 flex items-center justify-center text-2xl border border-primary-500/15">
                    {agent.avatar?.startsWith('data:') ? <img src={agent.avatar} className="w-full h-full object-cover rounded-full" /> : agent.avatar || '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white truncate">{agent.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span>{agent.model}</span>
                      {agent.wechat_bound && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">已绑定微信</span>
                      )}
                    </div>
                  </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
