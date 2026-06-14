import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, X, Wallet, RefreshCw, ChevronDown, Search } from 'lucide-react';

const EMOJI_AVATARS = ['🤖', '🧠', '💬', '🦊', '🐰', '🐼', '🦄', '🐝', '🦋', '🐱', '🐶', '🐺', '🦁', '🐸', '🐧', '🦉', '🎭', '🎯', '🔮', '⚡', '🌟', '💎', '🛡️', '🎨', '📚', '🔬', '🧪', '⚙️', '🚀', '💻', '🎮', '🎵'];

const PRESET_TEMPLATES: Record<string, string> = {
  '客服助手': '你是一个专业的客服助手，态度友好、耐心，能够准确理解用户问题并提供有用的解答。回答要简洁明了，如果不确定要诚实告知。',
  '闲聊伙伴': '你是一个幽默风趣的聊天伙伴，说话轻松自然，偶尔开玩笑。你喜欢用emoji，语气像一个好朋友。保持对话有趣但不越界。',
  '学习导师': '你是一个耐心的学习导师，擅长用简单易懂的方式解释复杂概念。你会用类比和例子帮助理解，鼓励学生思考，而不是直接给答案。',
  '创意写手': '你是一个富有创意的写作助手，擅长写文案、故事、诗歌等。你的文字优美生动，善于运用修辞手法，能够根据不同场景调整写作风格。',
  '代码助手': '你是一个专业的编程助手，精通多种编程语言。回答代码问题时，你会给出清晰的解释和示例代码，指出潜在问题，并建议最佳实践。',
};

type ProviderId = 'deepseek' | 'nvidia' | 'qwen' | 'custom';

const PROVIDERS: { value: ProviderId; label: string; url: string; desc: string }[] = [
  { value: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com', desc: 'DeepSeek V4 系列' },
  { value: 'nvidia', label: '英伟达', url: 'https://integrate.api.nvidia.com', desc: 'NVIDIA NIM' },
  { value: 'qwen', label: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode', desc: '阿里云 DashScope' },
  { value: 'custom', label: '自定义', url: '', desc: '自定义 API 地址' },
];

const DEEPSEEK_MODELS = [
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', desc: '旗舰版，推理能力最强' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', desc: '快速版，响应更快成本更低' },
];

interface BalanceInfo {
  provider: string;
  balance: number | null;
  currency: string;
  used: number | null;
  total: number | null;
}

export default function AgentEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: '',
    avatar: '🤖',
    system_prompt: '',
    api_provider: 'deepseek' as ProviderId,
    api_key: '',
    api_url: 'https://api.deepseek.com',
    model: '',
    temperature: 0.7,
    max_tokens: 2048,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 模型获取状态
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 编辑模式：加载现有数据
  useEffect(() => {
    if (!isEdit || !id) return;
    setLoading(true);
    const token = localStorage.getItem('yuyou-token');
    fetch(`/api/agents/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.agent) {
          const a = data.agent;
          setForm({
            name: a.name || '',
            avatar: a.avatar || '🤖',
            system_prompt: a.system_prompt || '',
            api_provider: a.api_provider || 'deepseek',
            api_key: a.api_key || '',
            api_url: a.api_url || '',
            model: a.model || '',
            temperature: a.temperature ?? 0.7,
            max_tokens: a.max_tokens ?? 2048,
          });
        }
      })
      .catch(err => console.error('加载智能体失败:', err))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // 查询余额
  const fetchBalance = async () => {
    if (!id || !form.api_key) return;
    setBalanceLoading(true);
    try {
      const token = localStorage.getItem('yuyou-token');
      const res = await fetch(`/api/agents/${id}/balance`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setBalance(data.balance);
      }
    } catch (err) {
      console.error('查询余额失败:', err);
    } finally {
      setBalanceLoading(false);
    }
  };

  // 编辑模式下自动查询余额
  useEffect(() => {
    if (isEdit && id && form.api_key) {
      fetchBalance();
    }
  }, [isEdit, id, form.api_key]);

  // 点击外部关闭模型下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 切换服务商时自动填充 URL 和清空模型
  const handleProviderChange = (provider: ProviderId) => {
    const preset = PROVIDERS.find(p => p.value === provider);
    setFetchedModels([]);
    setModelsError('');
    setForm(prev => ({
      ...prev,
      api_provider: provider,
      api_url: preset?.url || '',
      model: '',
    }));
  };

  // 获取模型列表
  const handleFetchModels = async () => {
    if (!form.api_key) {
      setModelsError('请先输入 API Key');
      return;
    }
    if (form.api_provider !== 'nvidia' && form.api_provider !== 'qwen') return;

    setModelsLoading(true);
    setModelsError('');

    try {
      const res = await fetch('/api/models/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.api_provider,
          apiKey: form.api_key,
          apiUrl: form.api_url || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFetchedModels(data.models);
        setShowModelDropdown(true);
        if (data.models.length === 0) {
          setModelsError('未找到可用模型，请检查 API Key');
        }
      } else {
        setModelsError(data.error || '获取模型列表失败');
      }
    } catch (err) {
      setModelsError('网络错误，请重试');
    } finally {
      setModelsLoading(false);
    }
  };

  const filteredModels = fetchedModels.filter(m =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('请输入智能体名称');
      return;
    }
    if (!form.model.trim()) {
      setError('请选择或输入模型名称');
      return;
    }

    setSaving(true);
    setError('');
    const token = localStorage.getItem('yuyou-token');

    try {
      const url = isEdit ? `/api/agents/${id}` : '/api/agents';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          token,
          name: form.name,
          avatar: form.avatar,
          systemPrompt: form.system_prompt,
          apiProvider: form.api_provider,
          apiKey: form.api_key,
          apiUrl: form.api_url,
          model: form.model,
          temperature: form.temperature,
          maxTokens: form.max_tokens,
        }),
      });
      const data = await res.json();
      if (data.success) {
        navigate('/agents');
      } else {
        setError(data.error || '保存失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key: string, value: string | number) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const needsFetch = form.api_provider === 'nvidia' || form.api_provider === 'qwen';

  return (
    <div className="min-h-screen bg-surface-950 relative page-enter overflow-y-auto">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary-500/[0.02] to-transparent pointer-events-none" />

      <div className="relative z-10 px-5 pt-6 pb-32">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/agents')}
            className="p-2.5 rounded-xl bg-surface-700/30 text-gray-400 hover:text-white hover:bg-surface-700/50 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white">{isEdit ? '编辑智能体' : '创建智能体'}</h2>
          <div className="w-10" />
        </div>

        <div className="space-y-6 max-w-md mx-auto">
          {/* 头像选择 */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
              className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary-500/10 to-primary-600/5 flex items-center justify-center text-5xl border-2 border-primary-500/15 hover:border-primary-500/30 transition-all duration-300 shadow-lg overflow-hidden"
            >
              {form.avatar}
            </button>
            <span className="text-xs text-gray-500 mt-3">点击更换头像</span>

            {showAvatarPicker && (
              <div className="mt-3 p-3 card-elevated rounded-2xl space-y-3 max-h-64 overflow-y-auto scrollbar-hide animate-scale-in w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setShowAvatarPicker(false)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                  关闭
                </button>
                <div className="grid grid-cols-8 gap-1.5">
                  {EMOJI_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        updateForm('avatar', emoji);
                        setShowAvatarPicker(false);
                      }}
                      className={`text-2xl p-2 rounded-xl hover:bg-white/5 transition ${form.avatar === emoji ? 'bg-primary-500/15 ring-1 ring-primary-500/30' : ''}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 名称 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400 ml-1">名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="给智能体起个名字"
              className="w-full px-5 py-3.5 input-dark rounded-2xl text-white placeholder-gray-600 text-base"
              maxLength={32}
            />
          </div>

          {/* 人设设置 - 系统提示词 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400 ml-1">人设 / 系统提示词</label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => updateForm('system_prompt', e.target.value)}
              placeholder="描述智能体的性格、角色和行为方式..."
              className="w-full px-5 py-3.5 input-dark rounded-2xl text-white placeholder-gray-600 text-sm resize-none"
              rows={4}
            />
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESET_TEMPLATES).map((name) => (
                <button
                  key={name}
                  onClick={() => updateForm('system_prompt', PRESET_TEMPLATES[name])}
                  className="px-3 py-1.5 rounded-xl bg-surface-700/30 text-xs text-gray-400 border border-white/[0.04] hover:bg-primary-500/10 hover:text-primary-400 hover:border-primary-500/15 transition"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* API 配置 */}
          <div className="space-y-4 p-5 card-elevated rounded-2xl">
            <h3 className="text-sm font-bold text-white">API 配置</h3>

            {/* Provider 选择 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 ml-1">服务商</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handleProviderChange(p.value)}
                    className={`py-3 px-3 rounded-xl border text-left transition-all ${
                      form.api_provider === p.value
                        ? 'bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/20'
                        : 'bg-surface-700/40 text-gray-400 border-white/[0.04] hover:border-white/10'
                    }`}
                  >
                    <div className="text-sm font-semibold">{p.label}</div>
                    <div className={`text-xs mt-0.5 ${form.api_provider === p.value ? 'text-white/70' : 'text-gray-600'}`}>
                      {p.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 ml-1">API Key</label>
              <input
                type="text"
                value={form.api_key}
                onChange={(e) => updateForm('api_key', e.target.value)}
                placeholder={form.api_provider === 'nvidia' ? 'nvapi-...' : form.api_provider === 'qwen' ? 'sk-...' : 'sk-...'}
                className="w-full px-4 py-3 input-dark rounded-2xl text-white placeholder-gray-600 text-sm"
              />
            </div>

            {/* API URL - 自定义时显示输入框，其他自动填充 */}
            {form.api_provider === 'custom' ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 ml-1">API URL</label>
                <input
                  type="text"
                  value={form.api_url}
                  onChange={(e) => updateForm('api_url', e.target.value)}
                  placeholder="https://your-api.com"
                  className="w-full px-4 py-3 input-dark rounded-2xl text-white placeholder-gray-600 text-sm"
                />
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-surface-700/15 border border-white/[0.03]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">API URL</span>
                  <span className="text-xs text-gray-500 font-mono">{form.api_url}</span>
                </div>
              </div>
            )}

            {/* 模型选择 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 ml-1">模型</label>

              {/* DeepSeek: 固定两个模型 */}
              {form.api_provider === 'deepseek' && (
                <div className="grid grid-cols-1 gap-2">
                  {DEEPSEEK_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => updateForm('model', m.id)}
                      className={`w-full py-3 px-4 rounded-xl border text-left transition-all ${
                        form.model === m.id
                          ? 'bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/20'
                          : 'bg-surface-700/40 text-gray-400 border-white/[0.04] hover:border-white/10'
                      }`}
                    >
                      <div className="text-sm font-semibold">{m.name}</div>
                      <div className={`text-xs mt-0.5 ${form.model === m.id ? 'text-white/70' : 'text-gray-600'}`}>
                        {m.desc}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* NVIDIA / 通义千问: 从 API 获取模型列表 */}
              {needsFetch && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div ref={dropdownRef} className="relative flex-1">
                      <button
                        onClick={() => {
                          if (fetchedModels.length > 0) {
                            setShowModelDropdown(!showModelDropdown);
                          } else {
                            handleFetchModels();
                          }
                        }}
                        className="w-full px-4 py-3 input-dark rounded-2xl text-white text-sm text-left flex items-center justify-between"
                      >
                        <span className={form.model ? 'text-white' : 'text-gray-600'}>
                          {form.model || '请选择模型'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {showModelDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 card-elevated rounded-2xl border border-white/[0.06] z-30 animate-scale-in overflow-hidden">
                          <div className="p-2 border-b border-white/[0.04]">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                              <input
                                type="text"
                                value={modelSearch}
                                onChange={(e) => setModelSearch(e.target.value)}
                                placeholder="搜索模型..."
                                className="w-full pl-9 pr-3 py-2 bg-surface-700/30 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-56 overflow-y-auto scrollbar-hide">
                            {filteredModels.length > 0 ? (
                              filteredModels.map((m) => (
                                <button
                                  key={m}
                                  onClick={() => {
                                    updateForm('model', m);
                                    setShowModelDropdown(false);
                                    setModelSearch('');
                                  }}
                                  className={`w-full px-4 py-2.5 text-left text-sm transition ${
                                    form.model === m
                                      ? 'bg-primary-500/10 text-primary-400'
                                      : 'text-gray-300 hover:bg-white/5'
                                  }`}
                                >
                                  {m}
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm text-gray-500">
                                {modelSearch ? '无匹配模型' : '暂无模型'}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleFetchModels}
                      disabled={modelsLoading || !form.api_key}
                      className="px-4 py-3 rounded-2xl bg-surface-700/30 border border-white/[0.04] text-gray-400 hover:text-white hover:bg-surface-600/50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                      <span className="text-xs font-medium">获取</span>
                    </button>
                  </div>

                  {modelsError && (
                    <div className="text-xs text-red-400 mt-1">{modelsError}</div>
                  )}

                  {fetchedModels.length > 0 && (
                    <div className="text-xs text-gray-500">
                      已加载 {fetchedModels.length} 个模型
                    </div>
                  )}
                </div>
              )}

              {/* 自定义: 手动输入模型名 */}
              {form.api_provider === 'custom' && (
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => updateForm('model', e.target.value)}
                  placeholder="输入模型名称"
                  className="w-full px-4 py-3 input-dark rounded-2xl text-white placeholder-gray-600 text-sm"
                />
              )}
            </div>

            {/* 余额信息 */}
            {isEdit && form.api_key && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 ml-1 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    账户余额
                  </label>
                  <button
                    onClick={fetchBalance}
                    disabled={balanceLoading}
                    className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${balanceLoading ? 'animate-spin' : ''}`} />
                    刷新
                  </button>
                </div>
                <div className="px-4 py-3 rounded-xl bg-surface-700/20 border border-white/[0.04]">
                  {balanceLoading && !balance ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      查询中...
                    </div>
                  ) : balance?.balance !== null && balance?.balance !== undefined ? (
                    <div className="space-y-1.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-white">{balance.balance.toFixed(2)}</span>
                        <span className="text-sm text-gray-500">{balance.currency}</span>
                      </div>
                      {balance.total !== null && (
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>总额: {balance.total.toFixed(2)} {balance.currency}</span>
                          {balance.used !== null && (
                            <span>已用: {balance.used.toFixed(2)} {balance.currency}</span>
                          )}
                        </div>
                      )}
                      {balance.total !== null && balance.total > 0 && (
                        <div className="mt-1.5">
                          <div className="h-1.5 rounded-full bg-surface-700/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500"
                              style={{ width: `${Math.max(0, Math.min(100, (balance.balance! / balance.total) * 100))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      无法获取余额信息，请检查 API Key 是否正确
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 参数调节 */}
          <div className="space-y-4 p-5 card-elevated rounded-2xl">
            <h3 className="text-sm font-bold text-white">参数调节</h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500 ml-1">温度 (Temperature)</label>
                <span className="text-xs text-primary-400 font-mono">{form.temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={(e) => updateForm('temperature', parseFloat(e.target.value))}
                className="w-full accent-primary-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>精确</span>
                <span>创意</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500 ml-1">最大 Token</label>
                <span className="text-xs text-primary-400 font-mono">{form.max_tokens}</span>
              </div>
              <input
                type="range"
                min="100"
                max="8000"
                step="100"
                value={form.max_tokens}
                onChange={(e) => updateForm('max_tokens', parseInt(e.target.value))}
                className="w-full accent-primary-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>100</span>
                <span>8000</span>
              </div>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/15">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 btn-primary rounded-2xl font-bold text-base tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
