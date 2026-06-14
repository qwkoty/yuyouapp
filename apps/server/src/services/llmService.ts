import { getAgentById } from './agentService';
import redis from '../lib/redis';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResult {
  content: string;
  thinking?: string;
}

export async function chatWithLLM(
  agentId: string,
  userMessage: string,
  history: LLMMessage[] = []
): Promise<ChatResult> {
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error('智能体不存在');
  if (!agent.api_key) throw new Error('请先配置API Key');

  // 确定API地址
  let apiUrl = agent.api_url;
  if (agent.api_provider === 'deepseek') {
    apiUrl = apiUrl || 'https://api.deepseek.com';
  } else if (agent.api_provider === 'openai') {
    apiUrl = apiUrl || 'https://api.openai.com';
  } else if (agent.api_provider === 'nvidia') {
    apiUrl = apiUrl || 'https://integrate.api.nvidia.com/v1';
  }
  if (!apiUrl) throw new Error('请配置API地址');

  // 构建消息
  const messages: LLMMessage[] = [
    { role: 'system', content: agent.system_prompt || '你是一个友好的AI助手。' },
    ...history,
    { role: 'user', content: userMessage },
  ];

  // 调用API
  const endpoint = apiUrl.endsWith('/v1')
    ? `${apiUrl}/chat/completions`
    : `${apiUrl}/v1/chat/completions`;

  // 显式转换类型 - pg库默认不解析数字
  const maxTokens = Number(agent.max_tokens) || 2000;
  const temperature = Number(agent.temperature) ?? 0.7;

  const requestBody: any = {
    model: agent.model || 'deepseek-chat',
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  // DeepSeek V4 支持思考模式
  if (agent.api_provider === 'deepseek') {
    requestBody.thinking = { type: 'enabled' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agent.api_key}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json() as any;
  const message = data.choices?.[0]?.message;
  const content = message?.content || '无法获取回复';

  // 提取思考过程（DeepSeek V4 thinking 模式返回 reasoning_content）
  let thinking: string | undefined;
  if (message?.reasoning_content) {
    thinking = message.reasoning_content;
  }

  // 记录缓存命中统计（DeepSeek 返回 prompt_cache_hit_tokens / prompt_cache_miss_tokens）
  try {
    const usage = data.usage;
    if (usage) {
      const cacheHit = Number(usage.prompt_cache_hit_tokens) || Number(usage.prompt_tokens_details?.cached_tokens) || 0;
      const cacheMiss = Number(usage.prompt_cache_miss_tokens) || (Number(usage.prompt_tokens) - cacheHit) || 0;
      if (cacheHit || cacheMiss) {
        const key = `agent_cache:${agentId}`;
        await redis.hincrby(key, 'cache_hit', cacheHit);
        await redis.hincrby(key, 'cache_miss', cacheMiss);
        await redis.hincrby(key, 'total_calls', 1);
      }
    }
  } catch (err) {
    // 缓存统计失败不影响主流程
  }

  return { content, thinking };
}
