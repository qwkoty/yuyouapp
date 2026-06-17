import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getAdminKey, getJwtSecret } from '../lib/envCheck';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById, blockUser, unblockUser } from '../services/userService';
import { sendVerificationCode, verifyAndLogin, getUserByToken, updateUserByToken, updateUserById, verifyToken, registerWithEmail, loginWithEmail } from '../services/authService';
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

// ==================== 健康检查 ====================
// 轻量端点，不依赖数据库，供 Render 健康检查使用
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ==================== 认证路由 ====================

import { rateLimiters } from '../middleware/rateLimit';

// 发送验证码
router.post('/auth/send-code', rateLimiters.sendCode, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ error: '缺少手机号' });
      return;
    }
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      res.status(400).json({ error: '手机号格式不正确' });
      return;
    }

    // ⚡ 不再接受前端传入 clientCode，统一由后端生成
    // 未接入短信服务时（SMS_ENABLED !== 'true'），后端返回验证码明文供前端显示
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
    if (!phone || !code || typeof phone !== 'string' || typeof code !== 'string') {
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
    if (!token || typeof token !== 'string') {
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

// ==================== 邮箱注册/登录 ====================

// 邮箱注册
router.post('/auth/email/register', rateLimiters.login, async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: '缺少邮箱' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: '缺少密码' });
      return;
    }

    const result = await registerWithEmail(email, password, nickname);
    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        user: result.user,
        isNewUser: true,
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error('[API] /auth/email/register error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 邮箱登录
router.post('/auth/email/login', rateLimiters.login, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: '缺少邮箱' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: '缺少密码' });
      return;
    }

    const result = await loginWithEmail(email, password);
    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        user: result.user,
        isNewUser: false,
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error('[API] /auth/email/login error:', err);
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
    // ⚡ 统一用 getJwtSecret()，与签发 token 时使用同一密钥
    // 之前用 process.env.JWT_SECRET，未设置时返回 500，token 刷新永远失败
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'token无效或已过期' });
      return;
    }
    const newToken = jwt.sign(
      { userId: decoded.userId, phone: decoded.phone },
      getJwtSecret(),
      { expiresIn: '7d' }
    );
    res.json({ success: true, token: newToken });
  } catch (err) {
    console.error('[API] /auth/refresh-token error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 更新用户资料（通过 requireAuth 中间件认证，统一用 req.authUserId）
router.post('/auth/update-profile', requireAuth, async (req, res) => {
  try {
    const { profile } = req.body || {};
    if (!profile || typeof profile !== 'object') {
      res.status(400).json({ error: '缺少资料' });
      return;
    }

    // 资料内容安全检查
    const { checkUserProfile } = await import('../lib/contentFilter');
    const checkResult = checkUserProfile(profile);
    if (!checkResult.safe) {
      res.status(400).json({ error: checkResult.reason, field: checkResult.field });
      return;
    }

    const user = await updateUserById((req as any).authUserId, profile);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(404).json({ error: '用户不存在' });
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

// 管理员密钥：统一通过 getAdminKey() 获取（envCheck 中懒初始化，保证 HTTP 与 Socket 一致）

// 验证管理员token
router.post('/admin/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: '缺少token' });
      return;
    }
    // 验证密钥是否正确
    if (token === getAdminKey()) {
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
    if (token !== getAdminKey()) { res.status(403).json({ error: '无权限' }); return; }

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
    console.error('[API] /admin/server-status error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 数据库状态
router.post('/admin/db-status', async (req, res) => {
  try {
    const { token } = req.body;
    if (token !== getAdminKey()) { res.status(403).json({ error: '无权限' }); return; }

    const tables = ['users', 'match_records', 'reports', 'ai_agents', 'ai_conversations', 'verification_codes', 'announcements'];
    const tableCounts: Record<string, number> = {};
    for (const t of tables) {
      try {
        // 表名白名单校验，防止 SQL 注入
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) { tableCounts[t] = -1; continue; }
        const r = await pool.query(`SELECT COUNT(*) FROM "${t}"`);
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
    console.error('[API] /admin/db-status error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ⚠️ 增加认证：reporterId 从 token 提取，防止伪造举报者
router.post('/report', requireAuth, rateLimiters.report, async (req, res) => {
  try {
    // reporterId 从已认证的 token 中获取，忽略请求体中的值
    const reporterId = (req as any).authUserId;
    const { reportedId, reason, description } = req.body;

    if (!reportedId || !reason) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    // UUID 格式校验
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reportedId)) {
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

    // 验证被举报者存在
    const reported = await getUserById(reportedId);
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

// ⚠️ 安全：智能体归属校验辅助函数，防止 IDOR 越权
async function getOwnedAgent(agentId: string, authUserId: string) {
  const agent = await getAgentById(agentId);
  if (!agent) return { error: 'not_found' as const };
  if (agent.user_id !== authUserId) return { error: 'forbidden' as const };
  return { agent };
}

// 创建智能体
router.post('/agents', requireAuth, async (req, res) => {
  try {
    const input = req.body || {};

    // 输入校验
    if (input.name && (typeof input.name !== 'string' || input.name.length > 50 || input.name.length < 1)) {
      res.status(400).json({ error: '智能体名称长度需在1-50字之间' });
      return;
    }
    if (input.systemPrompt && (typeof input.systemPrompt !== 'string' || input.systemPrompt.length > 2000)) {
      res.status(400).json({ error: '系统提示词过长，最多2000字' });
      return;
    }
    if (input.model && (typeof input.model !== 'string' || input.model.length > 100)) {
      res.status(400).json({ error: '模型名称过长' });
      return;
    }

    const agent = await createAgent((req as any).authUserId, input);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取智能体列表
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const agents = await getAgents((req as any).authUserId);
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取单个智能体（⚠️ 增加归属校验，防止越权读取他人 API Key）
router.get('/agents/:id', requireAuth, async (req, res) => {
  try {
    const result = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (result.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (result.error === 'forbidden') { res.status(403).json({ error: '无权限访问该智能体' }); return; }
    res.json({ success: true, agent: result.agent });
  } catch (err: any) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 更新智能体（⚠️ 增加归属校验）
router.put('/agents/:id', requireAuth, async (req, res) => {
  try {
    const input = req.body || {};
    const result = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (result.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (result.error === 'forbidden') { res.status(403).json({ error: '无权限修改该智能体' }); return; }
    const agent = await updateAgent(req.params.id, input);
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 删除智能体（⚠️ 增加归属校验）
router.delete('/agents/:id', requireAuth, async (req, res) => {
  try {
    const result = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (result.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (result.error === 'forbidden') { res.status(403).json({ error: '无权限删除该智能体' }); return; }
    await deleteAgent(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// AI 对话（⚠️ 增加归属校验，防止消耗他人 LLM 额度）
router.post('/agents/:id/chat', requireAuth, rateLimiters.aiChat, async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: '缺少消息内容' });
      return;
    }

    // 消息长度校验
    if (message.length === 0 || message.length > 2000) {
      res.status(400).json({ error: '消息长度需在1-2000字之间' });
      return;
    }

    const ownResult = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (ownResult.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (ownResult.error === 'forbidden') { res.status(403).json({ error: '无权限使用该智能体' }); return; }
    const agent = ownResult.agent;
    if (!agent.api_key) { res.status(400).json({ error: '请先配置API Key' }); return; }

    const sid = sessionId || 'default';

    // 保存用户消息
    await saveConversation(req.params.id, sid, 'user', message);

    // 获取历史
    const history = await getConversationHistory(req.params.id, sid);

    // 调用LLM
    const { reply, usage } = await chatWithLLM(req.params.id, message, history.slice(0, -1));

    // 保存AI回复
    await saveConversation(req.params.id, sid, 'assistant', reply);

    // 记录 token 消耗到数据库（await 确保记录成功）
    try {
      await pool.query(
        `INSERT INTO agent_usage_stats (agent_id, prompt_tokens, completion_tokens, total_tokens, cache_hit_tokens, cache_miss_tokens, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [req.params.id, usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.cacheHitTokens, usage.cacheMissTokens]
      );
    } catch (e) {
      console.error('[API] 记录 token 消耗失败:', e);
    }

    res.json({ success: true, reply, usage });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 获取对话历史（⚠️ 增加归属校验）
router.get('/agents/:id/conversations', requireAuth, async (req, res) => {
  try {
    const ownResult = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (ownResult.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (ownResult.error === 'forbidden') { res.status(403).json({ error: '无权限访问该智能体' }); return; }
    const { sessionId } = req.query;
    const sid = typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 64
      ? sessionId
      : 'default';
    const history = await getConversationHistory(req.params.id, sid);
    res.json({ success: true, history });
  } catch (err: any) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 查询智能体余额（⚠️ 增加归属校验）
router.get('/agents/:id/balance', requireAuth, async (req, res) => {
  try {
    const ownResult = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (ownResult.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (ownResult.error === 'forbidden') { res.status(403).json({ error: '无权限访问该智能体' }); return; }
    const balance = await getAgentBalance(req.params.id);
    res.json({ success: true, balance });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 查询智能体使用统计（⚠️ 增加归属校验）
router.get('/agents/:id/stats', requireAuth, async (req, res) => {
  try {
    const ownResult = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (ownResult.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (ownResult.error === 'forbidden') { res.status(403).json({ error: '无权限访问该智能体' }); return; }
    // 获取最近100条记录的统计
    const statsResult = await pool.query(
      `SELECT
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cache_hit_tokens), 0) as total_cache_hit,
        COALESCE(SUM(cache_miss_tokens), 0) as total_cache_miss,
        COUNT(*) as total_calls
       FROM agent_usage_stats
       WHERE agent_id = $1
       AND created_at > NOW() - INTERVAL '30 days'`,
      [req.params.id]
    );

    const stats = statsResult.rows[0];
    const totalCache = Number(stats.total_cache_hit) + Number(stats.total_cache_miss);
    const cacheHitRate = totalCache > 0
      ? Math.round((Number(stats.total_cache_hit) / totalCache) * 100)
      : 0;
    const cacheMissRate = totalCache > 0
      ? Math.round((Number(stats.total_cache_miss) / totalCache) * 100)
      : 0;

    res.json({
      success: true,
      stats: {
        totalPromptTokens: Number(stats.total_prompt_tokens),
        totalCompletionTokens: Number(stats.total_completion_tokens),
        totalTokens: Number(stats.total_tokens),
        totalCacheHitTokens: Number(stats.total_cache_hit),
        totalCacheMissTokens: Number(stats.total_cache_miss),
        totalCalls: Number(stats.total_calls),
        cacheHitRate,
        cacheMissRate,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 清除对话历史（⚠️ 增加归属校验）
router.delete('/agents/:id/conversations', requireAuth, async (req, res) => {
  try {
    const ownResult = await getOwnedAgent(req.params.id, (req as any).authUserId);
    if (ownResult.error === 'not_found') { res.status(404).json({ error: '智能体不存在' }); return; }
    if (ownResult.error === 'forbidden') { res.status(403).json({ error: '无权限访问该智能体' }); return; }
    const { sessionId } = req.body;
    const sid = typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 64
      ? sessionId
      : 'default';
    await clearConversationHistory(req.params.id, sid);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 模型列表路由 ====================

const PROVIDER_URLS: Record<string, string> = {
  nvidia: 'https://integrate.api.nvidia.com',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
};

// ⚠️ SSRF 防护：校验 URL 是否为允许的公网 HTTPS 端点
function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // 仅允许 HTTPS
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  // 拒绝 localhost / 内网 / 元数据端点
  if (host === 'localhost' || host === '0.0.0.0') return false;
  if (host.endsWith('.internal') || host.endsWith('.local')) return false;
  if (host === '169.254.169.254') return false; // 云元数据端点
  // 拒绝 IPv4 内网段
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a] = ipv4Match.slice(1).map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 172 && Number(ipv4Match[2]) >= 16 && Number(ipv4Match[2]) <= 31) return false;
    if (a === 192 && Number(ipv4Match[2]) === 168) return false;
  }
  // 拒绝 IPv6 本地地址
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return false;
  return true;
}

// ⚠️ 增加认证 + SSRF 防护
router.post('/models/list', requireAuth, async (req, res) => {
  try {
    const { provider, apiKey, apiUrl } = req.body;
    if (!provider || typeof provider !== 'string') { res.status(400).json({ error: '缺少provider' }); return; }
    if (!apiKey || typeof apiKey !== 'string') { res.status(400).json({ error: '缺少API Key' }); return; }

    const baseUrl = apiUrl || PROVIDER_URLS[provider];
    if (!baseUrl || typeof baseUrl !== 'string') { res.status(400).json({ error: '缺少API地址' }); return; }

    // SSRF 防护：仅允许自定义 URL 指向已知服务商或安全的公网 HTTPS 端点
    if (apiUrl && !isSafeExternalUrl(apiUrl)) {
      res.status(400).json({ error: 'API 地址不合法，仅支持公网 HTTPS 端点' });
      return;
    }
    if (!isSafeExternalUrl(baseUrl)) {
      res.status(400).json({ error: 'API 地址不合法' });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      res.status(response.status).json({ error: `获取模型列表失败: ${response.status}` });
      return;
    }

    const data = await response.json() as any;
    const models = (data.data || [])
      .map((m: any) => m.id || m.name || '')
      .filter(Boolean)
      .sort();

    res.json({ success: true, models });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      res.status(504).json({ error: '获取模型列表超时' });
      return;
    }
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

// ==================== 公告路由 ====================

// 管理员中间件
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const { token } = req.body;
  // 复用统一 getAdminKey()，保证 HTTP 与 Socket 管理员认证一致
  if (!token || token !== getAdminKey()) {
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
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取所有公告（管理员）
router.post('/announcements/list', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');
    res.json({ success: true, announcements: result.rows });
  } catch (err: any) {
    console.error('[API] /announcements/list error:', err);
    res.status(500).json({ error: '服务器内部错误' });
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
    res.status(500).json({ error: '服务器内部错误' });
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
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 删除公告
router.delete('/announcements/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[API] /announcements delete error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 屏蔽/拉黑路由 ====================

router.post('/block', requireAuth, async (req, res) => {
  try {
    const targetId = req.body?.targetId;
    if (!targetId || typeof targetId !== 'string') {
      res.status(400).json({ error: '缺少参数' });
      return;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetId)) {
      res.status(400).json({ error: '用户ID格式不正确' });
      return;
    }
    if ((req as any).authUserId === targetId) {
      res.status(400).json({ error: '不能屏蔽自己' });
      return;
    }
    const user = await blockUser((req as any).authUserId, targetId);
    res.json({ success: true, user });
  } catch (err: any) {
    console.error('[API] /block error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/unblock', requireAuth, async (req, res) => {
  try {
    const targetId = req.body?.targetId;
    if (!targetId || typeof targetId !== 'string') {
      res.status(400).json({ error: '缺少参数' });
      return;
    }
    const user = await unblockUser((req as any).authUserId, targetId);
    res.json({ success: true, user });
  } catch (err: any) {
    console.error('[API] /unblock error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
