import { getAgentById } from './agentService';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// DeepSeek 缓存优化说明：
// 1. 保持 system prompt 在 messages 数组最前面且内容一致
// 2. 相同 agent 的 system prompt 不变，更容易命中 prompt_cache_hit
// 3. 缓存命中后费用降低约 50-90%

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

export async function chatWithLLM(
  agentId: string,
  userMessage: string,
  history: LLMMessage[] = []
): Promise<{ reply: string; usage: LLMUsage }> {
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error('智能体不存在');
  if (!agent.api_key) throw new Error('请先配置API Key');

  // 确定API地址
  let apiUrl = agent.api_url;
  if (agent.api_provider === 'deepseek') {
    apiUrl = apiUrl || 'https://api.deepseek.com';
  } else if (agent.api_provider === 'nvidia') {
    apiUrl = apiUrl || 'https://integrate.api.nvidia.com';
  } else if (agent.api_provider === 'qwen') {
    apiUrl = apiUrl || 'https://dashscope.aliyuncs.com/compatible-mode';
  }
  if (!apiUrl) throw new Error('请配置API地址');

  const systemPrompt = agent.system_prompt || '你是一个友好的AI助手。';

  // 根据 context_length 限制历史消息数量
  const contextLength = Math.max(1, Math.min(5000, agent.context_length || 20));
  const trimmedHistory = history.slice(-contextLength);

  // 构建消息 - 优化缓存命中率：system 放最前面，保持格式一致
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ];

  // 构建请求体
  const requestBody: any = {
    model: agent.model || 'deepseek-chat',
    messages,
    temperature: Number(agent.temperature) || 0.7,
    max_tokens: Number(agent.max_tokens) || 2000,
    stream: false,
  };

  // DeepSeek 缓存优化：对相同 system prompt 的请求更容易命中缓存
  if (agent.api_provider === 'deepseek') {
    // 保持 system prompt 一致性有助于 prompt_cache_hit
    // 使用固定的 session id 让相同 agent 的对话更容易命中缓存
    requestBody.chat_session_id = `agent_${agentId}`;

    // 进一步优化缓存命中率：
    // 1. 保持 messages 数组结构完全一致（system 始终在第一位）
    // 2. 使用 prefix_cache 提示（DeepSeek V4 / V3 均支持）
    if (
      agent.model?.includes('deepseek-v4') ||
      agent.model?.includes('deepseek-v3') ||
      agent.model?.includes('deepseek-chat')
    ) {
      requestBody.prefix_cache = true;
    }
  }

  // DeepSeek 思考模式：V4 Pro 始终开启推理，V4 Flash 根据 thinking 开关决定
  if (agent.api_provider === 'deepseek') {
    if (agent.model === 'deepseek-v4-pro') {
      requestBody.enable_reasoning = true;
    } else if (agent.thinking) {
      requestBody.enable_reasoning = true;
    }
  }

  // 调用API
  const response = await fetch(`${apiUrl}/v1/chat/completions`, {
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

  // 提取真实的 token 消耗数据
  const usage: LLMUsage = {
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
    cacheHitTokens: data.usage?.prompt_cache_hit_tokens || 0,
    cacheMissTokens: data.usage?.prompt_cache_miss_tokens || 0,
  };

  // 处理思考模式的返回
  const showThinking = (agent.model === 'deepseek-v4-pro') || (agent.model === 'deepseek-v4-flash' && agent.thinking);
  if (showThinking && message?.reasoning_content) {
    return {
      reply: `[思考过程]\n${message.reasoning_content}\n\n[回答]\n${message.content}`,
      usage,
    };
  }

  return {
    reply: message?.content || '无法获取回复',
    usage,
  };
}
