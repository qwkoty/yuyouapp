import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ChevronLeft, Trash2 } from 'lucide-react';
import Loading from '../components/Loading';
import api from '../lib/apiClient';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export default function AgentChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState('');
  const [agentAvatar, setAgentAvatar] = useState('🤖');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载智能体信息和历史对话
  useEffect(() => {
    if (!id) return;

    // 加载智能体信息
    api.get<{ success: boolean; agent?: any }>(`/agents/${id}`)
      .then(data => {
        if (data.success && data.agent) {
          setAgentName(data.agent.name || '智能体');
          setAgentAvatar(data.agent.avatar || '🤖');
        }
      })
      .catch(() => {
        setAgentName('智能体');
        setAgentAvatar('🤖');
      });

    // 加载历史对话
    api.get<{ success: boolean; history?: any[] }>(`/agents/${id}/conversations`)
      .then(data => {
        if (data.success && data.history) {
          const loaded = data.history.map((h: any) => ({
            role: h.role as 'user' | 'assistant',
            content: h.content,
          }));
          setMessages(loaded);
        }
      })
      .catch((err) => {
        console.error('加载历史对话失败:', err);
        setError('加载历史对话失败，请刷新重试');
      })
      .finally(() => setHistoryLoading(false));
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading || !id) return;
    const userMsg = input.trim();
    setInput('');
    setError('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const data = await api.post<{ success: boolean; reply?: string; error?: string }>(`/agents/${id}/chat`, {
        message: userMsg,
      });
      if (data.success && data.reply) {
        const reply: string = data.reply;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      } else {
        const errMsg = data.error || '回复失败，请重试';
        setError(errMsg);
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      }
    } catch (err: any) {
      const errMsg = err.message || '网络错误，请重试';
      setError(errMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async () => {
    if (!confirm('确定清除所有对话记录？')) return;
    try {
      await api.delete(`/agents/${id}/conversations`);
    } catch {
      // apiClient 已统一 toast 错误
      return;
    }
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen bg-surface-950 relative overflow-hidden">
      {/* 顶部 */}
      <div className="glass border-b border-white/[0.04] px-4 py-3 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/agents')}
              className="p-2 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl">{agentAvatar}</span>
              <div>
                <span className="font-bold text-white">{agentName}</span>
                <p className="text-xs text-gray-500">AI 对话</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleClear}
            className="p-2 rounded-xl bg-surface-700/30 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide relative z-10">
        {error && (
          <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/15 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {historyLoading && (
          <div className="flex justify-center py-20">
            <Loading text="加载历史中..." size="sm" />
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="w-16 h-16 rounded-full bg-surface-700/40 flex items-center justify-center mx-auto">
              <span className="text-3xl">{agentAvatar}</span>
            </div>
            <p className="text-gray-500 text-sm">发送消息开始和 {agentName} 对话</p>
            <p className="text-xs text-gray-600">AI 会记住上下文，持续与你交流</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.role === 'user';
          return (
            <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-primary-500 text-white rounded-br-lg shadow-lg shadow-primary-500/10'
                    : 'bg-surface-700/40 text-white border border-white/[0.04] rounded-bl-lg'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* 思考中 */}
        {loading && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-surface-700/40 border border-white/[0.04] rounded-2xl rounded-bl-lg px-4 py-3">
              <Loading text="思考中..." size="sm" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入栏 */}
      <div className="glass border-t border-white/[0.04] px-4 py-3 relative z-10">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-surface-700/20 border border-white/[0.04] rounded-2xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40 transition disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-lg shadow-primary-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
