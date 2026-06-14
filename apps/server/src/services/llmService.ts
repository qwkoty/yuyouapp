import { getAgentById } from './agentService';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatWithLLM(
  agentId: string,
  userMessage: string,
  history: LLMMessage[] = []
): Promise<string> {
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

  // 构建消息
  const messages: LLMMessage[] = [
    { role: 'system', content: agent.system_prompt || '你是一个友好的AI助手。' },
    ...history,
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

  // DeepSeek 思考模式：添加 reasoning 相关参数
  if (agent.api_provider === 'deepseek' && agent.thinking) {
    requestBody.enable_reasoning = true;
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

  // 处理思考模式的返回
  if (agent.thinking && message?.reasoning_content) {
    return `[思考过程]\n${message.reasoning_content}\n\n[回答]\n${message.content}`;
  }

  return message?.content || '无法获取回复';
}
