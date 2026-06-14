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
}

// 蛇形转驼峰
function rowToCamel(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    avatar: row.avatar,
    systemPrompt: row.system_prompt,
    apiProvider: row.api_provider,
    apiKey: row.api_key,
    apiUrl: row.api_url,
    model: row.model,
    temperature: Number(row.temperature),
    maxTokens: Number(row.max_tokens),
    wechatBound: row.wechat_bound,
    wechatAccountId: row.wechat_account_id,
    hasApiKey: !!row.api_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAgent(token: string, input: AgentInput) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  const result = await pool.query(
    `INSERT INTO ai_agents (user_id, name, avatar, system_prompt, api_provider, api_key, api_url, model, temperature, max_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      user.id,
      input.name,
      input.avatar || '🤖',
      input.systemPrompt || '你是一个友好的AI助手。',
      input.apiProvider || 'deepseek',
      input.apiKey || '',
      input.apiUrl || '',
      input.model || 'deepseek-chat',
      input.temperature ?? 0.7,
      input.maxTokens ?? 2000,
    ]
  );
  return rowToCamel(result.rows[0]);
}

export async function getAgents(token: string) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  const result = await pool.query(
    `SELECT * FROM ai_agents WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.id]
  );
  return result.rows.map(rowToCamel);
}

export async function getAgentById(agentId: string) {
  // 内部用，需要 apiKey，所以返回原始行
  const result = await pool.query(
    `SELECT * FROM ai_agents WHERE id = $1`,
    [agentId]
  );
  return result.rows[0] || null;
}

// 对外返回安全的 camelCase
export async function getAgentPublic(token: string, agentId: string) {
  const user = await getUserByToken(token);
  if (!user) throw new Error('用户不存在');

  const result = await pool.query(
    `SELECT * FROM ai_agents WHERE id = $1 AND user_id = $2`,
    [agentId, user.id]
  );
  if (result.rows.length === 0) throw new Error('智能体不存在');
  const camel = rowToCamel(result.rows[0])!;
  // 隐藏真实 API Key
  camel.apiKey = '';
  return camel;
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
  if (input.temperature !== undefined) { fields.push(`temperature = $${idx++}`); values.push(Number(input.temperature)); }
  if (input.maxTokens !== undefined) { fields.push(`max_tokens = $${idx++}`); values.push(Number(input.maxTokens)); }

  if (fields.length === 0) return rowToCamel(agent);

  fields.push(`updated_at = NOW()`);
  values.push(agentId);

  const result = await pool.query(
    `UPDATE ai_agents SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING *`,
    values
  );
  return rowToCamel(result.rows[0]);
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

export async function getConversationHistory(agentId: string, sessionId: string, limit: number = 20) {
  const result = await pool.query(
    `SELECT role, content, created_at FROM ai_conversations
     WHERE agent_id = $1 AND session_id = $2
     ORDER BY created_at ASC LIMIT $3`,
    [agentId, sessionId, limit]
  );
  return result.rows.map(r => ({
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export async function clearConversationHistory(agentId: string, sessionId: string) {
  await pool.query(
    `DELETE FROM ai_conversations WHERE agent_id = $1 AND session_id = $2`,
    [agentId, sessionId]
  );
}
