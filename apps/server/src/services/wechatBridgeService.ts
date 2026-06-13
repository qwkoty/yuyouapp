import { getAgentById, saveConversation, getConversationHistory } from './agentService';
import { chatWithLLM } from './llmService';

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';

interface WechatMessage {
  msgId: string;
  fromUser: string;
  content: string;
  msgType: string;
  timestamp: number;
}

interface PollResult {
  messages: WechatMessage[];
  token: string;
}

class WechatBridge {
  private pollTimers: Map<string, NodeJS.Timeout> = new Map();
  private accountTokens: Map<string, string> = new Map();

  // 启动某个智能体的微信桥接
  async startBridge(agentId: string) {
    const agent = await getAgentById(agentId);
    if (!agent || !agent.wechat_account_id) {
      throw new Error('智能体未绑定微信');
    }

    const accountId = agent.wechat_account_id;
    const token = this.accountTokens.get(accountId);
    if (!token) throw new Error('微信token不存在，请重新绑定');

    // 停止已有的轮询
    this.stopBridge(agentId);

    // 开始长轮询
    this.pollMessages(agentId, token);
  }

  // 停止桥接
  stopBridge(agentId: string) {
    const timer = this.pollTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(agentId);
    }
  }

  // 长轮询获取消息
  private async pollMessages(agentId: string, token: string) {
    try {
      const response = await fetch(`${ILINK_BASE_URL}/api/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ timeout: 30 }),
      });

      if (!response.ok) {
        console.error(`[WeChatBridge] poll failed: ${response.status}`);
        // 5秒后重试
        const timer = setTimeout(() => this.pollMessages(agentId, token), 5000);
        this.pollTimers.set(agentId, timer);
        return;
      }

      const data = await response.json() as PollResult;

      // 处理收到的消息
      for (const msg of data.messages) {
        if (msg.msgType === 'text' && msg.content) {
          this.handleMessage(agentId, msg, token);
        }
      }

      // 更新token
      if (data.token) {
        this.accountTokens.set(data.token, data.token);
      }

      // 继续轮询
      this.pollMessages(agentId, token);
    } catch (err) {
      console.error(`[WeChatBridge] poll error:`, err);
      const timer = setTimeout(() => this.pollMessages(agentId, token), 10000);
      this.pollTimers.set(agentId, timer);
    }
  }

  // 处理收到的消息
  private async handleMessage(agentId: string, msg: WechatMessage, token: string) {
    try {
      console.log(`[WeChatBridge] 收到消息: ${msg.content}`);

      const sessionId = `wechat_${msg.fromUser}`;

      // 保存用户消息到对话历史
      await saveConversation(agentId, sessionId, 'user', msg.content);

      // 调用LLM获取回复
      const history = await getConversationHistory(agentId, sessionId);
      const reply = await chatWithLLM(agentId, msg.content, history.slice(0, -1));

      // 保存AI回复
      await saveConversation(agentId, sessionId, 'assistant', reply);

      // 发送回复到微信
      await this.sendMessage(token, msg.fromUser, reply);

      console.log(`[WeChatBridge] 已回复: ${reply.substring(0, 50)}...`);
    } catch (err) {
      console.error(`[WeChatBridge] handle message error:`, err);
      // 发送错误提示
      try {
        await this.sendMessage(token, msg.fromUser, '抱歉，处理消息时出错了，请稍后重试。');
      } catch (e) {
        console.error('[WeChatBridge] send error message failed:', e);
      }
    }
  }

  // 发送消息到微信
  private async sendMessage(token: string, toUser: string, content: string) {
    await fetch(`${ILINK_BASE_URL}/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        toUser,
        msgType: 'text',
        content,
      }),
    });
  }

  // 获取绑定二维码URL（实际需要调用iLink API获取）
  getBindQRCodeUrl(): string {
    // 返回iLink绑定页面的URL
    // 实际使用时需要先调用login API获取二维码
    return `${ILINK_BASE_URL}/api/login`;
  }
}

export const wechatBridge = new WechatBridge();
