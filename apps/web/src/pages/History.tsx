import { useEffect, useState } from 'react';
import { useUserStore } from '../stores/userStore';
import { MatchRecord } from '@yuyou/shared';
import { Clock, MapPin, Trash2, Heart, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function History() {
  const navigate = useNavigate();
  const profile = useUserStore((s) => s.profile);
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const fetchHistory = async () => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/history/${profile.id}`);
      if (!res.ok) throw new Error('获取历史失败');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('确定要清空所有匹配历史吗？')) return;
    if (!profile) return;
    try {
      await fetch(`/api/history/${profile.id}`, { method: 'DELETE' });
      setHistory([]);
    } catch {
      alert('清空失败');
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-950">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 relative page-enter">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary-500/[0.02] to-transparent pointer-events-none" />
      
      <div className="relative z-10 px-5 pt-6 pb-24">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/match')}
              className="p-2.5 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white">匹配历史</h2>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/[0.05] text-red-400 border border-red-500/10 hover:bg-red-500/10 transition text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              清空
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-600">
            <div className="w-20 h-20 rounded-full bg-surface-700/20 flex items-center justify-center mb-5">
              <Heart className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-lg font-medium text-gray-500">暂无匹配记录</p>
            <p className="text-sm mt-1">去匹配页认识新朋友吧</p>
            <button
              onClick={() => navigate('/match')}
              className="mt-6 px-6 py-2.5 btn-primary rounded-2xl text-sm font-bold"
            >
              去匹配
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((record, index) => (
              <div
                key={record.id}
                className="card-elevated rounded-2xl p-4 animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/10 to-primary-600/5 flex items-center justify-center text-xl border border-primary-500/10">
                    👤
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white">{record.partnerNickname}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {record.partnerCity}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(record.matchedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
