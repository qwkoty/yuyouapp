import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../lib/db';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById } from '../services/userService';
import { sendVerificationCode, verifyAndLogin, getUserByToken, updateUserByToken, generateToken } from '../services/authService';
import { createAgent, getAgents, getAgentById, getAgentPublic, updateAgent, deleteAgent, saveConversation, getConversationHistory, clearConversationHistory } from '../services/agentService';
import { chatWithLLM } from '../services/llmService';
import { getAgentBalance } from '../services/balanceService';
import { getActiveSocketCount } from '../lib/redis';
import logger from '../lib/logger';

const router = Router();

// ==================== 中间件 ====================

// Bearer token 鉴权中间件
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: '缺少token' });
      return;
    }
    const user = await getUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'token无效或已过期' });
      return;
    }
    (req as any).user = user;
    (req as any).token = token;
    next();
  } catch (err) {
    logger.error('Auth', '鉴权失败', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

// ==================== 认证路由 ====================

router.post('/auth/send-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) { res.status(400).json({ error: '缺少手机号' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { res.status(400).json({ error: '手机号格式不正确' }); return; }

    const result = await sendVerificationCode(phone);
    if (result.success) {
      res.json({ success: true, code: result.code, message: '验证码已发送' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    logger.error('API', '/auth/send-code', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) { res.status(400).json({ error: '缺少手机号或验证码' }); return; }

    const result = await verifyAndLogin(phone, code);
    if (result.success) {
      res.json({ success: true, token: result.token, user: result.user, isNewUser: result.isNewUser });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    logger.error('API', '/auth/login', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: '缺少token' }); return; }
    const user = await getUserByToken(token);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'token无效或已过期' });
    }
  } catch (err) {
    logger.error('API', '/auth/verify-token', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/auth/refresh-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization?.replace('Bearer ', '');
    if (!authHeader) { res.status(400).json({ error: '缺少token' }); return; }
    const user = await getUserByToken(authHeader);
    if (!user) { res.status(401).json({ error: 'token无效' }); return; }
    const newToken = generateToken({ id: user.id, phone: user.phone });
    res.json({ success: true, token: newToken, user });
  } catch (err) {
    logger.error('API', '/auth/refresh-token', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/auth/update-profile', async (req, res) => {
  try {
    const { token, profile } = req.body;
    if (!token || !profile) { res.status(400).json({ error: '缺少token或资料' }); return; }
    const user = await updateUserByToken(token, profile);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'token无效或已过期' });
    }
  } catch (err) {
    logger.error('API', '/auth/update-profile', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 公开路由 ====================

// 在线人数（公开）
router.get('/stats/online', async (_req, res) => {
  try {
    const onlineCount = await getActiveSocketCount();
    res.json({ success: true, onlineCount });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

// ==================== 需要鉴权的路由 ====================

// 获取用户资料（公开，但要求 userId 存在）
async function validateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.params.userId;
    if (!userId) { res.status(400).json({ error: '缺少用户ID' }); return; }
    const user = await getUserById(userId);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
    next();
  } catch (err) {
    res.status(500).json({ error: '服务器内部错误' });
  }
}

router.get('/profile/:userId', validateUser, async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
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
    logger.error('API', '/profile', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/history/:userId', validateUser, async (req, res) => {
  try {
    const history = await getMatchHistory(req.params.userId);
    res.json(history);
  } catch (err) {
    logger.error('API', '/history', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/history/:userId', validateUser, async (req, res) => {
  try {
    await clearMatchHistory(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    logger.error('API', '/history delete', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 匹配历史（需鉴权 + 隐藏路径信息）
router.get('/match/history', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const history = await getMatchHistory(user.id);
    res.json({ success: true, history });
  } catch (err) {
    logger.error('API', '/match/history', err);
    res.status(500).json({ error: '查询失败' });
  }
});

router.delete('/match/history', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    await clearMatchHistory(user.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('API', '/match/history delete', err);
    res.status(500).json({ error: '清空失败' });
  }
});

// 管理员密钥
const ADMIN_KEY = process.env.ADMIN_KEY || '195674';

function verifyAdminKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  if (!authHeader || authHeader !== ADMIN_KEY) {
    res.status(401).json({ error: '管理员密钥无效' });
    return;
  }
  next();
}

router.post('/admin/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: '缺少token' }); return; }
    if (token === ADMIN_KEY) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: '无效token' });
    }
  } catch (err) {
    logger.error('API', '/admin/verify', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 管理员面板：系统统计
router.get('/admin/stats', verifyAdminKey, async (_req, res) => {
  try {
    const [usersRes, matchesRes, messagesRes, agentsRes] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM users'),
      pool.query('SELECT COUNT(*)::int AS c FROM match_records'),
      pool.query('SELECT COUNT(*)::int AS c FROM chat_messages'),
      pool.query('SELECT COUNT(*)::int AS c FROM ai_agents'),
    ]);
    let onlineCount = 0;
    try { onlineCount = await getActiveSocketCount(); } catch { /* ignore */ }
    res.json({
      success: true,
      stats: {
        totalUsers: usersRes.rows[0].c,
        totalMatches: matchesRes.rows[0].c,
        totalMessages: messagesRes.rows[0].c,
        totalAgents: agentsRes.rows[0].c,
        onlineCount,
      },
    });
  } catch (err: any) {
    logger.error('API', '/admin/stats', err);
    res.status(500).json({ error: '查询失败', detail: err?.message || String(err) });
  }
});

// 管理员面板：最近用户
router.get('/admin/recent-users', verifyAdminKey, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, phone, nickname, gender, birth_date, province, city, created_at
       FROM users
       ORDER BY COALESCE(created_at, NOW()) DESC
       LIMIT 20`
    );
    res.json({
      success: true,
      users: result.rows.map((r) => {
        const birthDate = r.birth_date ? new Date(r.birth_date) : null;
        const age = birthDate
          ? Math.max(0, Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 3600 * 1000)))
          : 0;
        return {
          id: r.id, phone: r.phone || '', nickname: r.nickname || '',
          gender: r.gender || '', age,
          province: r.province || '', city: r.city || '',
          createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
        };
      }),
    });
  } catch (err: any) {
    logger.error('API', '/admin/recent-users', err);
    res.status(500).json({ error: '查询失败', detail: err?.message || String(err) });
  }
});

// 管理员面板：最近匹配
router.get('/admin/recent-matches', verifyAdminKey, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, partner_nickname, partner_city, session_id, duration_seconds, matched_at
       FROM match_records ORDER BY matched_at DESC LIMIT 30`
    );
    res.json({
      success: true,
      matches: result.rows.map((r) => ({
        id: r.id, userId: r.user_id, partnerNickname: r.partner_nickname,
        partnerCity: r.partner_city, sessionId: r.session_id,
        durationSeconds: r.duration_seconds,
        matchedAt: new Date(r.matched_at).getTime(),
      })),
    });
  } catch (err) {
    logger.error('API', '/admin/recent-matches', err);
    res.status(500).json({ error: '查询失败' });
  }
});

router.post('/report', async (req, res) => {
  try {
    const { reporterId, reportedId, reason, description } = req.body;
    if (!reporterId || !reportedId || !reason) { res.status(400).json({ error: '缺少必要参数' }); return; }
    if (description && typeof description === 'string' && description.length > 1000) { res.status(400).json({ error: '描述过长，最多1000字' }); return; }
    const validReasons = ['harassment', 'advertising', 'fraud', 'other'];
    if (!validReasons.includes(reason)) { res.status(400).json({ error: '无效的举报原因' }); return; }

    const [reporter, reported] = await Promise.all([getUserById(reporterId), getUserById(reportedId)]);
    if (!reporter) { res.status(404).json({ error: '举报者不存在' }); return; }
    if (!reported) { res.status(404).json({ error: '被举报者不存在' }); return; }
    if (reporterId === reportedId) { res.status(400).json({ error: '不能举报自己' }); return; }

    const report = await createReport(reporterId, reportedId, reason, description);
    res.json({ success: true, report });
  } catch (err) {
    logger.error('API', '/report', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 智能体路由（全部需要鉴权） ====================

// 创建智能体
router.post('/agents', requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const agent = await createAgent(token, req.body);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取智能体列表
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const agents = await getAgents(token);
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取单个智能体（用 getAgentPublic 隐藏 api_key）
router.get('/agents/:id', requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const agent = await getAgentPublic(token, req.params.id);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(err.message.includes('不存在') ? 404 : 500).json({ error: err.message });
  }
});

// 更新智能体
router.put('/agents/:id', requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const agent = await updateAgent(token, req.params.id, req.body);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 删除智能体
router.delete('/agents/:id', requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    await deleteAgent(token, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 测试对话
router.post('/agents/:id/chat', requireAuth, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) { res.status(400).json({ error: '缺少参数' }); return; }

    const agent = await getAgentById(req.params.id);
    if (!agent) { res.status(404).json({ error: '智能体不存在' }); return; }
    if (!agent.api_key) { res.status(400).json({ error: '请先配置API Key' }); return; }

    const sid = sessionId || 'default';
    await saveConversation(req.params.id, sid, 'user', message);
    const history = await getConversationHistory(req.params.id, sid);
    const result = await chatWithLLM(req.params.id, message, history.slice(0, -1));
    await saveConversation(req.params.id, sid, 'assistant', result.content);

    res.json({ success: true, reply: result.content, thinking: result.thinking });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取对话历史
router.get('/agents/:id/conversations', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.query;
    const history = await getConversationHistory(req.params.id, (sessionId as string) || 'default');
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 查询智能体余额
router.get('/agents/:id/balance', requireAuth, async (req, res) => {
  try {
    const balance = await getAgentBalance(req.params.id);
    res.json({ success: true, balance });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 清除对话历史
router.delete('/agents/:id/conversations', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    await clearConversationHistory(req.params.id, sessionId || 'default');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
