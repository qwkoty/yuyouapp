import { Router, Request, Response, NextFunction } from 'express';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById } from '../services/userService';
import { sendVerificationCode, verifyAndLogin, getUserByToken, updateUserByToken, verifyToken } from '../services/authService';
import { createAgent, getAgents, getAgentById, updateAgent, deleteAgent, saveConversation, getConversationHistory, clearConversationHistory } from '../services/agentService';
import { chatWithLLM } from '../services/llmService';
import { getAgentBalance } from '../services/balanceService';

import { pool } from '../lib/db';
import redis from '../lib/redis';

const router = Router();

// JWT 鉴权中间件
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'token无效或已过期' });
    return;
  }
  (req as any).authUserId = decoded.userId;
  next();
}

// ==================== 认证路由 ====================

import { rateLimiters } from '../middleware/rateLimit';

// 发送验证码
router.post('/auth/send-code', rateLimiters.sendCode, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: '缺少手机号' });
      return;
    }
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      res.status(400).json({ error: '手机号格式不正确' });
      return;
    }

    const result = await sendVerificationCode(phone);
    if (result.success) {
      res.json({ success: true, code: result.code, message: '验证码已发送' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error('[API] /auth/send-code error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 验证码登录
router.post('/auth/login', rateLimiters.login, async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      res.status(400).json({ error: '缺少手机号或验证码' });
      return;
    }

    const result = await verifyAndLogin(phone, code);
    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        user: result.user,
        isNewUser: result.isNewUser,
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error('[API] /auth/login error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 验证token
router.post('/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: '缺少token' });
      return;
    }

    const user = await getUserByToken(token);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'token无效或已过期' });
    }
  } catch (err) {
    console.error('[API] /auth/verify-token error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 刷新token
router.post('/auth/refresh-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      res.status(400).json({ error: '缺少token' });
      return;
    }
    const jwt = await import('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'yuyou-jwt-secret-2024';
    if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] WARNING: JWT_SECRET not set in production! Using default value.');
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'token无效或已过期' });
      return;
    }
    const newToken = jwt.default.sign(
      { userId: decoded.userId, phone: decoded.phone },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ success: true, token: newToken });
  } catch (err) {
    console.error('[API] /auth/refresh-token error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 更新用户资料（通过token）
router.post('/auth/update-profile', async (req, res) => {
  try {
    const { token, profile } = req.body;
    if (!token || !profile) {
      res.status(400).json({ error: '缺少token或资料' });
      return;
    }

    // 资料内容安全检查
    const { checkUserProfile } = await import('../lib/contentFilter');
    const checkResult = checkUserProfile(profile);
    if (!checkResult.safe) {
      res.status(400).json({ error: checkResult.reason, field: checkResult.field });
      return;
    }

    const user = await updateUserByToken(token, profile);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'token无效或已过期' });
    }
  } catch (err) {
    console.error('[API] /auth/update-profile error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 原有路由 ====================

// 简单鉴权中间件：验证 userId 对应的用户是否存在
async function validateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: '缺少用户ID' });
      return;
    }
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    next();
  } catch (err) {
    console.error('[API] validateUser error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

router.get('/profile/:userId', validateUser, async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    res.json({
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      gender: user.gender,
      age: user.age,
      province: user.province,
      city: user.city,
      bio: user.bio,
    });
  } catch (err) {
    console.error('[API] /profile error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/history/:userId', requireAuth, async (req, res) => {
  try {
    if ((req as any).authUserId !== req.params.userId) {
      res.status(403).json({ error: '无权限' }); return;
    }
    const history = await getMatchHistory(req.params.userId);
    res.json(history);
  } catch (err) {
    console.error('[API] /history error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/history/:userId', requireAuth, async (req, res) => {
  try {
    if ((req as any).authUserId !== req.params.userId) {
      res.status(403).json({ error: '无权限' }); return;
    }
    await clearMatchHistory(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[API] /history delete error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 管理员密钥
const ADMIN_KEY = process.env.ADMIN_KEY || '195674';
if (!process.env.ADMIN_KEY && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] WARNING: ADMIN_KEY not set in production! Using default value.');
}

// 验证管理员token
router.post('/admin/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: '缺少token' });
      return;
    }
    // 验证密钥是否正确
    if (token === ADMIN_KEY) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: '无效token' });
    }
  } catch (err) {
    console.error('[API] /admin/verify error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 服务器状态
router.post('/admin/server-status', async (req, res) => {
  try {
    const { token } = req.body;
    if (token !== ADMIN_KEY) { res.status(403).json({ error: '无权限' }); return; }

    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();

    res.json({
      success: true,
      server: {
        uptime: Math.floor(uptime),
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
        cpu: {
          user: Math.round(cpuUsage.user / 1000),
          system: Math.round(cpuUsage.system / 1000),
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 数据库状态
router.post('/admin/db-status', async (req, res) => {
  try {
    const { token } = req.body;
    if (token !== ADMIN_KEY) { res.status(403).json({ error: '无权限' }); return; }

    const tables = ['users', 'match_records', 'reports', 'ai_agents', 'ai_conversations', 'verification_codes', 'announcements'];
    const tableCounts: Record<string, number> = {};
    for (const t of tables) {
      try {
        const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        tableCounts[t] = parseInt(r.rows[0].count);
      } catch { tableCounts[t] = -1; }
    }

    const poolInfo = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    let redisStatus = 'disconnected';
    let redisKeys = 0;
    try {
      const pong = await redis.ping();
      redisStatus = pong === 'PONG' ? 'connected' : 'error';
      redisKeys = await redis.dbsize();
    } catch {}

    res.json({
      success: true,
      postgres: { connected: true, tables: tableCounts, pool: poolInfo },
      redis: { status: redisStatus, totalKeys: redisKeys },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/report', rateLimiters.report, async (req, res) => {
  try {
    const { reporterId, reportedId, reason, description } = req.body;

    if (!reporterId || !reportedId || !reason) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    // UUID 格式校验
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reporterId) || !uuidRegex.test(reportedId)) {
      res.status(400).json({ error: '用户ID格式不正确' });
      return;
    }

    // 限制描述长度
    if (description && typeof description === 'string' && description.length > 1000) {
      res.status(400).json({ error: '描述过长，最多1000字' });
      return;
    }

    const validReasons = ['harassment', 'advertising', 'fraud', 'other'];
    if (!validReasons.includes(reason)) {
      res.status(400).json({ error: '无效的举报原因' });
      return;
    }

    // 验证举报者和被举报者都存在
    const [reporter, reported] = await Promise.all([
      getUserById(reporterId),
      getUserById(reportedId),
    ]);
    if (!reporter) {
      res.status(404).json({ error: '举报者不存在' });
      return;
    }
    if (!reported) {
      res.status(404).json({ error: '被举报者不存在' });
      return;
    }
    if (reporterId === reportedId) {
      res.status(400).json({ error: '不能举报自己' });
      return;
    }

    const report = await createReport(reporterId, reportedId, reason, description);
    res.json({ success: true, report });
  } catch (err) {
    console.error('[API] /report error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 智能体路由 ====================

// 创建智能体
router.post('/agents', async (req, res) => {
  try {
    const { token, ...input } = req.body;
    if (!token) { res.status(400).json({ error: '缺少token' }); return; }

    // 输入校验
    if (input.name && (input.name.length > 50 || input.name.length < 1)) {
      res.status(400).json({ error: '智能体名称长度需在1-50字之间' });
      return;
    }
    if (input.systemPrompt && input.systemPrompt.length > 2000) {
      res.status(400).json({ error: '系统提示词过长，最多2000字' });
      return;
    }
    if (input.model && input.model.length > 100) {
      res.status(400).json({ error: '模型名称过长' });
      return;
    }

    const agent = await createAgent(token, input);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取智能体列表
router.get('/agents', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(400).json({ error: '缺少token' }); return; }
    const agents = await getAgents(token);
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取单个智能体
router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) { res.status(404).json({ error: '智能体不存在' }); return; }
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新智能体
router.put('/agents/:id', async (req, res) => {
  try {
    const { token, ...input } = req.body;
    if (!token) { res.status(400).json({ error: '缺少token' }); return; }
    const agent = await updateAgent(token, req.params.id, input);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 删除智能体
router.delete('/agents/:id', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: '缺少token' }); return; }
    await deleteAgent(token, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 测试对话
router.post('/agents/:id/chat', rateLimiters.chat, async (req, res) => {
  try {
    const { token, message, sessionId } = req.body;
    if (!token || !message) { res.status(400).json({ error: '缺少参数' }); return; }

    // 消息长度校验
    if (typeof message !== 'string' || message.length === 0 || message.length > 2000) {
      res.status(400).json({ error: '消息长度需在1-2000字之间' });
      return;
    }

    const agent = await getAgentById(req.params.id);
    if (!agent) { res.status(404).json({ error: '智能体不存在' }); return; }
    if (!agent.api_key) { res.status(400).json({ error: '请先配置API Key' }); return; }

    const sid = sessionId || 'default';

    // 保存用户消息
    await saveConversation(req.params.id, sid, 'user', message);

    // 获取历史
    const history = await getConversationHistory(req.params.id, sid);

    // 调用LLM
    const reply = await chatWithLLM(req.params.id, message, history.slice(0, -1));

    // 保存AI回复
    await saveConversation(req.params.id, sid, 'assistant', reply);

    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取对话历史
router.get('/agents/:id/conversations', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const history = await getConversationHistory(req.params.id, (sessionId as string) || 'default');
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 查询智能体余额
router.get('/agents/:id/balance', async (req, res) => {
  try {
    const balance = await getAgentBalance(req.params.id);
    res.json({ success: true, balance });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 清除对话历史
router.delete('/agents/:id/conversations', async (req, res) => {
  try {
    const { sessionId } = req.body;
    await clearConversationHistory(req.params.id, sessionId || 'default');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 模型列表路由 ====================

const PROVIDER_URLS: Record<string, string> = {
  nvidia: 'https://integrate.api.nvidia.com',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
};

router.post('/models/list', async (req, res) => {
  try {
    const { provider, apiKey, apiUrl } = req.body;
    if (!provider) { res.status(400).json({ error: '缺少provider' }); return; }

    const baseUrl = apiUrl || PROVIDER_URLS[provider];
    if (!baseUrl) { res.status(400).json({ error: '缺少API地址' }); return; }
    if (!apiKey) { res.status(400).json({ error: '缺少API Key' }); return; }

    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `获取模型列表失败: ${response.status}`, detail: text });
      return;
    }

    const data = await response.json() as any;
    const models = (data.data || [])
      .map((m: any) => m.id || m.name || '')
      .filter(Boolean)
      .sort();

    res.json({ success: true, models });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 公告路由 ====================

// 管理员中间件
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const { token } = req.body;
  const adminKey = process.env.ADMIN_KEY || '195674';
  if (!token || token !== adminKey) {
    res.status(403).json({ error: '无管理员权限' });
    return;
  }
  next();
}

// 创建公告
router.post('/announcements', requireAdmin, async (req, res) => {
  try {
    const { title, content, target, duration_hours, frequency } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: '缺少标题或内容' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO announcements (title, content, target, duration_hours, frequency)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, content, target || 'all', duration_hours || 24, frequency || 1]
    );
    res.json({ success: true, announcement: result.rows[0] });
  } catch (err: any) {
    console.error('[API] /announcements create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 获取所有公告（管理员）
router.post('/announcements/list', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json({ success: true, announcements: result.rows });
  } catch (err: any) {
    console.error('[API] /announcements/list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 获取活跃公告（用户端）
router.get('/announcements/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM announcements
       WHERE is_active = TRUE
       AND created_at > NOW() - (duration_hours || ' hours')::INTERVAL
       ORDER BY created_at DESC`
    );
    res.json({ success: true, announcements: result.rows });
  } catch (err: any) {
    console.error('[API] /announcements/active error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 取消/激活公告
router.put('/announcements/:id', requireAdmin, async (req, res) => {
  try {
    const { is_active } = req.body;
    const result = await pool.query(
      'UPDATE announcements SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: '公告不存在' });
      return;
    }
    res.json({ success: true, announcement: result.rows[0] });
  } catch (err: any) {
    console.error('[API] /announcements update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 删除公告
router.delete('/announcements/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[API] /announcements delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
