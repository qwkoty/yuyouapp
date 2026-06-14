import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ChevronLeft, Trash2, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/apiClient';
import { toast } from '../components/Toast';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

export default function AgentChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!id) return;
    api.get<{ success: boolean; agent: { name: string } }>(`/agents/${id}`, { silent: true })
      .then((data) => {
        if (data.success && data.agent) setAgentName(data.agent.name || '智能体');
      })
      .catch(() => {});
  }, [id]);

  // 加载历史对话
  useEffect(() => {
    if (!id) return;
    api.get<{ success: boolean; history: ChatMsg[] }>(`/agents/${id}/conversations`, { silent: true })
      .then((data) => {
        if (data.success && Array.isArray(data.history)) {
          setMessages(data.history.map((m) => ({ role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading || !id) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const data = await api.post<{ success: boolean; reply?: string; thinking?: string; error?: string }>(
        `/agents/${id}/chat`,
        { message: userMsg },
        { silent: true }
      );
      if (data.success && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply!, thinking: data.thinking }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || '回复失败，请重试' }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: err?.message || '网络错误，请重试' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async () => {
    if (!confirm('确定清除所有对话记录？')) return;
    try {
      await api.delete(`/agents/${id}/conversations`, { silent: true });
      setMessages([]);
      toast.success('已清空');
    } catch {
      // toast 自动
    }
  };

  return (
    <div className="flex flex-col h-screen bg-surface-950 relative overflow-hidden">
      <div className="glass border-b border-white/[0.04] px-4 py-3 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/agents')}
              className="p-2 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="font-bold text-white">{agentName}</span>
              <p className="text-xs text-gray-500">测试对话</p>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide relative z-10">
        {messages.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="w-16 h-16 rounded-full bg-surface-700/40 flex items-center justify-center mx-auto">
              <span className="text-3xl">💬</span>
            </div>
            <p className="text-gray-500 text-sm">发送消息开始测试对话</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.role === 'user';
          const showThinking = !isMe && msg.thinking;
          const isExpanded = expandedThinking[idx];
          return (
            <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className={`max-w-[80%] ${isMe ? '' : 'space-y-1.5'}`}>
                {showThinking && (
                  <button
                    onClick={() => setExpandedThinking(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    className="flex items-center gap-1.5 text-[11px] text-primary-400/80 hover:text-primary-300 transition px-2"
                  >
                    <Brain className="w-3 h-3" />
                    <span>思考过程</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                {showThinking && isExpanded && (
                  <div className="px-3 py-2 rounded-xl bg-primary-500/[0.06] border border-primary-500/10 text-xs text-gray-400 italic leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-hide">
                    {msg.thinking}
                  </div>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-primary-500 text-white rounded-br-lg shadow-lg shadow-primary-500/10'
                      : 'bg-surface-700/40 text-white border border-white/[0.04] rounded-bl-lg'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-surface-700/40 border border-white/[0.04] rounded-2xl rounded-bl-lg px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">思考中...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="glass border-t border-white/[0.04] px-4 py-3 relative z-10">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' && !e.shiftKey) && handleSend()}
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
