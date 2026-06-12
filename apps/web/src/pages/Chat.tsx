import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { socket } from '../stores/socketStore';
import { ChatMessage } from '@yuyou/shared';
import {
  Send,
  LogOut,
  Clock,
  Eye,
  EyeOff,
  MapPin,
  AlertTriangle,
  MessageCircle,
  ChevronLeft,
} from 'lucide-react';

const EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '😅', '😊', '😉', '😋', '😴', '🥳', '😡', '😭', '🤗', '👍', '👎', '❤️', '🔥', '✨', '🎉'];

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);

  const {
    partner,
    messages,
    remainingTime,
    wechatVisible,
    partnerWechatVisible,
    partnerWechatId,
    isActive,
    addMessage,
    setRemainingTime,
    setWechatVisible,
    setPartnerWechat,
    endChat,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!socket || !sessionId) return;

    const onMessage = (msg: ChatMessage) => addMessage(msg);
    const onTimer = (data: { remaining: number }) => setRemainingTime(data.remaining);
    const onEnd = () => {
      endChat();
      setTimeout(() => navigate('/match'), 1500);
    };
    const onPartnerWechat = (data: { visible: boolean; wechatId?: string }) => {
      setPartnerWechat(data.visible, data.wechatId);
    };
    const onError = (data: { message: string }) => {
      alert(data.message);
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:timer', onTimer);
    socket.on('chat:end', onEnd);
    socket.on('chat:partner_wechat', onPartnerWechat);
    socket.on('system:error', onError);

    const heartbeat = setInterval(() => {
      if (socket) {
        socket.emit('heartbeat');
      }
    }, 30000);

    return () => {
      if (socket) {
        socket.off('chat:message', onMessage);
        socket.off('chat:timer', onTimer);
        socket.off('chat:end', onEnd);
        socket.off('chat:partner_wechat', onPartnerWechat);
        socket.off('system:error', onError);
      }
      clearInterval(heartbeat);
    };
  }, [sessionId, addMessage, setRemainingTime, endChat, navigate, setPartnerWechat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || !socket) return;
    socket.emit('chat:message', { content: input.trim(), type: 'text' });
    setInput('');
    setShowEmoji(false);
    inputRef.current?.focus();
  }, [input]);

  const handleEmoji = useCallback((emoji: string) => {
    if (!socket) return;
    socket.emit('chat:message', { content: emoji, type: 'emoji' });
    setShowEmoji(false);
  }, []);

  const handleToggleWechat = useCallback(() => {
    if (!socket) return;
    const newVal = !wechatVisible;
    setWechatVisible(newVal);
    socket.emit('chat:toggle_wechat', newVal);
  }, [wechatVisible, setWechatVisible]);

  const handleExit = useCallback(() => {
    if (!socket) return;
    if (confirm('确定要退出聊天吗？退出后无法恢复！')) {
      socket.emit('chat:exit');
      endChat();
      navigate('/match');
    }
  }, [endChat, navigate]);

  const handleReport = useCallback(async () => {
    if (!reportReason || !partner || !profile) return;
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterId: profile.id,
          reportedId: partner.id,
          reason: reportReason,
          description: reportDesc,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '举报失败');
      }
      alert('举报已提交，感谢你的反馈');
      setShowReport(false);
      setReportReason('');
      setReportDesc('');
    } catch (err: any) {
      alert(err.message || '举报失败，请稍后重试');
    }
  }, [reportReason, reportDesc, partner, profile]);

  const timerColor = remainingTime <= 10 ? 'text-red-400' : remainingTime <= 30 ? 'text-amber-400' : 'text-primary-400';
  const timerBg = remainingTime <= 10 ? 'bg-red-500/10 border-red-500/15' : remainingTime <= 30 ? 'bg-amber-500/10 border-amber-500/15' : 'bg-primary-500/10 border-primary-500/15';
  const timerProgress = remainingTime / 88;

  if (!isActive && !partner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-surface-950">
        <div className="w-20 h-20 rounded-full bg-surface-700/40 flex items-center justify-center mb-6">
          <Clock className="w-10 h-10 text-gray-500" />
        </div>
        <p className="text-gray-400 text-lg font-medium">聊天已结束</p>
        <p className="text-sm text-gray-600 mt-1">这段缘分已画上句号</p>
        <button
          onClick={() => navigate('/match')}
          className="mt-8 px-8 py-3 btn-primary rounded-2xl font-bold"
        >
          返回匹配
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface-950">
      {/* 顶部信息栏 */}
      <div className="glass border-b border-white/[0.04] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleExit}
              className="p-2 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {partner && (
              <>
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-500/15 to-primary-600/5 flex items-center justify-center text-xl border border-primary-500/15">
                  {partner.avatar}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{partner.nickname}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{partner.gender === 'male' ? '男' : '女'} · {partner.age}岁</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      {partner.city}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border ${timerBg}`}>
            <Clock className={`w-4 h-4 ${timerColor}`} />
            <span className={`font-black text-xl tabular-nums ${timerColor}`}>{remainingTime}</span>
            <span className={`text-xs ${timerColor} opacity-60`}>s</span>
          </div>
        </div>

        {/* 倒计时进度条 */}
        <div className="mt-3 h-1 bg-white/[0.03] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              remainingTime <= 10 ? 'bg-red-500' : remainingTime <= 30 ? 'bg-amber-400' : 'bg-primary-500'
            }`}
            style={{ width: `${timerProgress * 100}%` }}
          />
        </div>

        {partnerWechatVisible && partnerWechatId && (
          <div className="mt-3 px-4 py-2 bg-emerald-500/[0.06] border border-emerald-500/15 text-emerald-400 text-sm rounded-2xl inline-flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            对方微信号: <span className="font-mono font-bold">{partnerWechatId}</span>
          </div>
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        <div className="text-center">
          <span className="text-xs text-gray-600 bg-surface-700/20 px-4 py-1.5 rounded-full">
            聊天已开始，珍惜这88秒
          </span>
        </div>

        {messages.map((msg) => {
          const isMe = msg.senderId === profile?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-primary-500 text-white rounded-br-lg shadow-lg shadow-primary-500/10'
                    : 'bg-surface-700/40 text-white border border-white/[0.04] rounded-bl-lg'
                }`}
              >
                {msg.type === 'emoji' ? (
                  <span className="text-2xl">{msg.content}</span>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入栏 */}
      <div className="glass border-t border-white/[0.04] px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleWechat}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              wechatVisible
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                : 'bg-surface-700/20 text-gray-500 border border-white/[0.04] hover:bg-surface-700/40'
            }`}
          >
            {wechatVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {wechatVisible ? '已展示' : '微信号'}
          </button>

          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface-700/20 text-gray-500 border border-white/[0.04] hover:bg-surface-700/40 transition"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            举报
          </button>

          <div className="flex-1" />

          <button
            onClick={handleExit}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-red-500/[0.05] text-red-400 border border-red-500/10 hover:bg-red-500/10 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="p-2.5 rounded-xl bg-surface-700/20 text-gray-400 hover:text-primary-400 hover:bg-surface-700/40 transition"
          >
            <span className="text-lg">😀</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="flex-1 px-4 py-2.5 bg-surface-700/20 border border-white/[0.04] rounded-2xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-lg shadow-primary-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {showEmoji && (
          <div className="grid grid-cols-10 gap-1 p-3 bg-surface-700/20 border border-white/[0.04] rounded-2xl animate-scale-in">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmoji(emoji)}
                className="text-xl p-1.5 hover:bg-white/5 rounded-lg transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 举报弹窗 */}
      {showReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-800 border border-white/[0.04] rounded-3xl p-5 w-full max-w-sm space-y-4 animate-scale-in">
            <h3 className="font-bold text-lg text-white">举报用户</h3>
            <div className="space-y-2">
              {[
                { value: 'harassment', label: '骚扰' },
                { value: 'advertising', label: '广告' },
                { value: 'fraud', label: '诈骗' },
                { value: 'other', label: '其他' },
              ].map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReportReason(r.value)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border transition ${
                    reportReason === r.value
                      ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                      : 'border-white/[0.04] text-gray-400 hover:border-white/10'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="补充描述（可选）"
              className="w-full px-4 py-3 bg-surface-700/20 border border-white/[0.04] rounded-2xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/40 transition"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowReport(false)}
                className="flex-1 py-3 border border-white/[0.04] rounded-2xl text-gray-400 hover:bg-surface-700/30 transition"
              >
                取消
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason}
                className="flex-1 py-3 btn-primary rounded-2xl disabled:opacity-50"
              >
                提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
