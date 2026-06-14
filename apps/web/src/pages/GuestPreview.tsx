import { useNavigate } from 'react-router-dom';
import { Eye, ArrowRight, Users, MapPin, Sparkles, MessageCircle, Heart, X } from 'lucide-react';

const DEMO_USERS = [
  { id: 1, name: '林小雨', city: '北京·海淀', age: 24, gender: 'female', avatar: '👩', bio: '喜欢摄影、旅行、撸猫的文艺女青年', tags: ['摄影', '旅行', '猫'] },
  { id: 2, name: '陈宇航', city: '北京·朝阳', age: 26, gender: 'male', avatar: '🧑', bio: '产品经理，周末爬山爱好者', tags: ['爬山', '科技', '咖啡'] },
  { id: 3, name: '王诗涵', city: '上海·浦东', age: 23, gender: 'female', avatar: '👧', bio: '插画师一枚，寻找有趣的灵魂', tags: ['画画', '设计', '音乐'] },
  { id: 4, name: '李子轩', city: '深圳·南山', age: 28, gender: 'male', avatar: '👨', bio: '程序员，副业做独立游戏', tags: ['游戏', '代码', '电影'] },
  { id: 5, name: '张梦琪', city: '杭州·西湖', age: 25, gender: 'female', avatar: '👩‍🦰', bio: '美食探店博主，想找试吃搭子', tags: ['美食', '探店', '烘焙'] },
  { id: 6, name: '赵浩然', city: '成都·锦江', age: 27, gender: 'male', avatar: '🧔', bio: '心理咨询师，希望认识新朋友', tags: ['心理学', '读书', '茶'] },
];

const TOPICS = [
  { emoji: '☕', title: '咖啡搭子', desc: '一起探索城市咖啡店', count: 234 },
  { emoji: '🎬', title: '电影夜话', desc: '分享最近看的好电影', count: 189 },
  { emoji: '🏃', title: '运动伙伴', desc: '跑步、健身、打球搭子', count: 412 },
  { emoji: '🎮', title: '开黑组队', desc: '一起打游戏上分', count: 567 },
  { emoji: '📚', title: '读书会', desc: '每周一本书的分享', count: 156 },
  { emoji: '🍜', title: '美食探店', desc: '城市隐藏美食探索', count: 298 },
];

export default function GuestPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-950 relative">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary-500/[0.05] to-transparent pointer-events-none" />

      <div className="relative z-10 px-5 md:px-12 py-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />关闭预览
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-5 py-2.5 btn-primary rounded-xl text-sm font-bold flex items-center gap-2"
          >
            注册体验 <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium mb-4">
            <Eye className="w-3.5 h-3.5" />
            游客预览模式 · 仅供参考
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-3">看看这里都有谁</h1>
          <p className="text-gray-400 max-w-xl mx-auto">注册即可解锁全部功能，与他们开始 88 秒破冰聊天</p>
        </div>

        {/* 推荐用户 */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-400" />
                推荐用户
              </h2>
              <p className="text-sm text-gray-500 mt-1">基于地理位置和兴趣推荐</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEMO_USERS.map((u) => (
              <div key={u.id} className="card-elevated rounded-2xl p-5 hover:scale-[1.02] transition-transform">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500/20 to-pink-500/20 flex items-center justify-center text-3xl">
                    {u.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white flex items-center gap-1.5">
                      {u.name}
                      <span className="text-xs text-gray-500 font-normal">· {u.age}</span>
                    </h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> {u.city}
                    </p>
                  </div>
                  <Heart className="w-4 h-4 text-gray-600 hover:text-pink-400 transition" />
                </div>
                <p className="text-sm text-gray-300 mb-3 line-clamp-2">{u.bio}</p>
                <div className="flex flex-wrap gap-1.5">
                  {u.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-lg bg-primary-500/[0.08] text-primary-300 text-xs">#{t}</span>
                  ))}
                </div>
                <button
                  onClick={() => navigate('/register')}
                  className="w-full mt-4 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/15 text-primary-300 hover:bg-primary-500/20 transition text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />打个招呼
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 话题广场 */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                话题广场
              </h2>
              <p className="text-sm text-gray-500 mt-1">找到和你兴趣相投的人</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TOPICS.map((t, i) => (
              <div
                key={i}
                onClick={() => navigate('/register')}
                className="card-elevated rounded-2xl p-5 cursor-pointer hover:scale-[1.02] transition-transform"
              >
                <div className="text-4xl mb-2">{t.emoji}</div>
                <h3 className="font-bold text-white mb-1">{t.title}</h3>
                <p className="text-sm text-gray-400 mb-2">{t.desc}</p>
                <p className="text-xs text-primary-400">{t.count} 人正在参与</p>
              </div>
            ))}
          </div>
        </section>

        <div className="card-elevated rounded-3xl p-8 text-center space-y-4">
          <h3 className="text-2xl font-bold text-white">准备好了吗？</h3>
          <p className="text-gray-400">注册账号，遇见你的 TA</p>
          <button
            onClick={() => navigate('/register')}
            className="px-8 py-3.5 btn-primary rounded-2xl font-bold inline-flex items-center gap-2"
          >
            免费注册 <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
