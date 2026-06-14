import { pool } from '../lib/db';
import { getUserByToken } from './authService';

export interface AgentInput {
  name: string;
  avatar?: string;
  systemPrompt?: string;
  apiProvider?: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  thinking?: boolean;
  contextLength?: number;
}

export async function createAgent(token: string, input: AgentInput) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  let defaultUrl = '';
  if (input.apiProvider === 'nvidia') defaultUrl = 'https://integrate.api.nvidia.com';
  else if (input.apiProvider === 'qwen') defaultUrl = 'https://dashscope.aliyuncs.com/compatible-mode';

  const result = await pool.query(
    `INSERT INTO ai_agents (user_id, name, avatar, system_prompt, api_provider, api_key, api_url, model, temperature, max_tokens, thinking, context_length)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, name, avatar, system_prompt, api_provider, api_url, model, temperature, max_tokens, thinking, context_length, created_at, updated_at`,
    [
      user.id,
      input.name,
      input.avatar || '🤖',
      input.systemPrompt || '你是一个友好的AI助手。',
      input.apiProvider || 'deepseek',
      input.apiKey || '',
      input.apiUrl || defaultUrl,
      input.model || 'deepseek-chat',
      input.temperature ?? 0.7,
      input.maxTokens ?? 2000,
      input.thinking ?? false,
      input.contextLength ?? 20,
    ]
  );
  return result.rows[0];
}

export async function getAgents(token: string) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  const result = await pool.query(
    `SELECT id, name, avatar, system_prompt, api_provider, api_url, model, temperature, max_tokens, thinking, context_length, created_at, updated_at
     FROM ai_agents WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.id]
  );
  return result.rows;
}

export async function getAgentById(agentId: string) {
  const result = await pool.query(
    `SELECT * FROM ai_agents WHERE id = $1`,
    [agentId]
  );
  return result.rows[0] || null;
}

export async function updateAgent(token: string, agentId: string, input: Partial<AgentInput>) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  const agent = await getAgentById(agentId);
  if (!agent || agent.user_id !== user.id) throw new Error('智能体不存在');

  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (input.name !== undefined) { fields.push(`name = $${idx++}`); values.push(input.name); }
  if (input.avatar !== undefined) { fields.push(`avatar = $${idx++}`); values.push(input.avatar); }
  if (input.systemPrompt !== undefined) { fields.push(`system_prompt = $${idx++}`); values.push(input.systemPrompt); }
  if (input.apiProvider !== undefined) { fields.push(`api_provider = $${idx++}`); values.push(input.apiProvider); }
  if (input.apiKey !== undefined) { fields.push(`api_key = $${idx++}`); values.push(input.apiKey); }
  if (input.apiUrl !== undefined) { fields.push(`api_url = $${idx++}`); values.push(input.apiUrl); }
  if (input.model !== undefined) { fields.push(`model = $${idx++}`); values.push(input.model); }
  if (input.temperature !== undefined) { fields.push(`temperature = $${idx++}`); values.push(input.temperature); }
  if (input.maxTokens !== undefined) { fields.push(`max_tokens = $${idx++}`); values.push(input.maxTokens); }
  if (input.thinking !== undefined) { fields.push(`thinking = $${idx++}`); values.push(input.thinking); }
  if (input.contextLength !== undefined) { fields.push(`context_length = $${idx++}`); values.push(input.contextLength); }

  if (fields.length === 0) return agent;

  fields.push(`updated_at = NOW()`);
  values.push(agentId);

  const result = await pool.query(
    `UPDATE ai_agents SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING id, name, avatar, system_prompt, api_provider, api_url, model, temperature, max_tokens, thinking, context_length, created_at, updated_at`,
    values
  );
  return result.rows[0];
}

export async function deleteAgent(token: string, agentId: string) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  const agent = await getAgentById(agentId);
  if (!agent || agent.user_id !== user.id) throw new Error('智能体不存在');

  await pool.query(`DELETE FROM ai_agents WHERE id = $1`, [agentId]);
  return { success: true };
}

// 对话历史
export async function saveConversation(agentId: string, sessionId: string, role: string, content: string) {
  await pool.query(
    `INSERT INTO ai_conversations (agent_id, session_id, role, content) VALUES ($1, $2, $3, $4)`,
    [agentId, sessionId, role, content]
  );
}

export async function getConversationHistory(agentId: string, sessionId: string, limit: number = 5000) {
  const result = await pool.query(
    `SELECT role, content FROM ai_conversations
     WHERE agent_id = $1 AND session_id = $2
     ORDER BY created_at ASC LIMIT $3`,
    [agentId, sessionId, limit]
  );
  return result.rows;
}

export async function clearConversationHistory(agentId: string, sessionId: string) {
  await pool.query(
    `DELETE FROM ai_conversations WHERE agent_id = $1 AND session_id = $2`,
    [agentId, sessionId]
  );
}
