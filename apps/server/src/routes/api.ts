import { Router, Request, Response, NextFunction } from 'express';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById } from '../services/userService';

const router = Router();

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

router.get('/history/:userId', validateUser, async (req, res) => {
  try {
    const history = await getMatchHistory(req.params.userId);
    res.json(history);
  } catch (err) {
    console.error('[API] /history error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/history/:userId', validateUser, async (req, res) => {
  try {
    await clearMatchHistory(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[API] /history delete error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 管理员认证（服务器端验证密钥）
const ADMIN_KEY = process.env.ADMIN_KEY || 'yuyou-admin-2024';

router.post('/admin/auth', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      res.status(400).json({ error: '缺少密钥' });
      return;
    }
    if (key === ADMIN_KEY) {
      // 返回一个临时token（简化版，生产环境应使用JWT）
      const token = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: '密钥错误' });
    }
  } catch (err) {
    console.error('[API] /admin/auth error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 验证管理员token
router.post('/admin/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: '缺少token' });
      return;
    }
    // 简化验证：检查token格式
    if (token.startsWith('admin-')) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: '无效token' });
    }
  } catch (err) {
    console.error('[API] /admin/verify error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/report', async (req, res) => {
  try {
    const { reporterId, reportedId, reason, description } = req.body;

    if (!reporterId || !reportedId || !reason) {
      res.status(400).json({ error: '缺少必要参数' });
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

export default router;
