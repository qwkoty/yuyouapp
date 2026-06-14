import crypto from 'crypto';
import { pool } from '../lib/db';
import { getAgentById, saveConversation, getConversationHistory } from './agentService';
import { chatWithLLM } from './llmService';
import logger from '../lib/logger';

// 微信公众号消息类型
interface WechatMpMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  MsgId?: number;
  Event?: string;
}

// 获取智能体的公众号配置
export async function getMpConfig(agentId: string) {
  const result = await pool.query(
    `SELECT * FROM wechat_mp_configs WHERE agent_id = $1`,
    [agentId]
  );
  return result.rows[0] || null;
}

// 保存或更新公众号配置
export async function saveMpConfig(
  agentId: string,
  config: {
    appId?: string;
    appSecret?: string;
    token?: string;
    encodingAesKey?: string;
    isActive?: boolean;
  }
) {
  const existing = await getMpConfig(agentId);

  if (existing) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (config.appId !== undefined) { fields.push(`app_id = $${idx++}`); values.push(config.appId); }
    if (config.appSecret !== undefined) { fields.push(`app_secret = $${idx++}`); values.push(config.appSecret); }
    if (config.token !== undefined) { fields.push(`token = $${idx++}`); values.push(config.token); }
    if (config.encodingAesKey !== undefined) { fields.push(`encoding_aes_key = $${idx++}`); values.push(config.encodingAesKey); }
    if (config.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(config.isActive); }

    if (fields.length === 0) return existing;

    fields.push(`updated_at = NOW()`);
    values.push(agentId);

    const result = await pool.query(
      `UPDATE wechat_mp_configs SET ${fields.join(', ')} WHERE agent_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  } else {
    const result = await pool.query(
      `INSERT INTO wechat_mp_configs (agent_id, app_id, app_secret, token, encoding_aes_key, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        agentId,
        config.appId || '',
        config.appSecret || '',
        config.token || '',
        config.encodingAesKey || '',
        config.isActive ?? false,
      ]
    );
    return result.rows[0];
  }
}

// 删除公众号配置
export async function deleteMpConfig(agentId: string) {
  await pool.query(`DELETE FROM wechat_mp_configs WHERE agent_id = $1`, [agentId]);
  return { success: true };
}

// 验证微信服务器签名（用于服务器配置验证）
export function verifyWechatSignature(
  token: string,
  signature: string,
  timestamp: string,
  nonce: string
): boolean {
  const tmpStr = [token, timestamp, nonce].sort().join('');
  const hash = crypto.createHash('sha1').update(tmpStr).digest('hex');
  return hash === signature;
}

// 解析微信推送的 XML 消息
export function parseWechatXml(xml: string): WechatMpMessage | null {
  try {
    const msg: WechatMpMessage = {
      ToUserName: '',
      FromUserName: '',
      CreateTime: 0,
      MsgType: '',
    };

    // 简单的 XML 解析（提取字段）
    const getTagValue = (tag: string): string | undefined => {
      const regex = new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>|<${tag}>(.*?)</${tag}>`, 's');
      const match = xml.match(regex);
      return match ? (match[1] || match[2]) : undefined;
    };

    msg.ToUserName = getTagValue('ToUserName') || '';
    msg.FromUserName = getTagValue('FromUserName') || '';
    msg.CreateTime = parseInt(getTagValue('CreateTime') || '0');
    msg.MsgType = getTagValue('MsgType') || '';
    msg.Content = getTagValue('Content');
    msg.MsgId = parseInt(getTagValue('MsgId') || '0');
    msg.Event = getTagValue('Event');

    return msg;
  } catch (err) {
    logger.error('WechatMP', '解析XML失败', err);
    return null;
  }
}

// 构建微信回复 XML
export function buildReplyXml(
  toUser: string,
  fromUser: string,
  content: string
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`;
}

// 处理微信消息并获取 AI 回复
export async function handleWechatMessage(
  agentId: string,
  message: WechatMpMessage
): Promise<string> {
  try {
    const config = await getMpConfig(agentId);
    if (!config || !config.is_active) {
      return '智能体未启用，请联系管理员。';
    }

    const agent = await getAgentById(agentId);
    if (!agent) {
      return '智能体不存在。';
    }

    // 关注事件
    if (message.MsgType === 'event' && message.Event === 'subscribe') {
      return `你好！我是 ${agent.name}，有什么可以帮你的吗？`;
    }

    // 只处理文本消息
    if (message.MsgType !== 'text' || !message.Content) {
      return '暂不支持该类型消息，请发送文字。';
    }

    const userContent = message.Content.trim();
    const sessionId = `mp_${message.FromUserName}`;

    // 保存用户消息
    await saveConversation(agentId, sessionId, 'user', userContent);

    // 获取历史对话
    const history = await getConversationHistory(agentId, sessionId);

    // 调用 LLM
    const reply = await chatWithLLM(agentId, userContent, history.slice(0, -1));

    // 保存 AI 回复
    await saveConversation(agentId, sessionId, 'assistant', reply);

    logger.info('WechatMP', `回复用户 ${message.FromUserName}`, { agentId, reply: reply.substring(0, 50) });

    return reply;
  } catch (err) {
    logger.error('WechatMP', '处理消息失败', err);
    return '抱歉，处理消息时出错了，请稍后重试。';
  }
}
