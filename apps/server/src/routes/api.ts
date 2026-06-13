import { Router, Request, Response, NextFunction } from 'express';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById } from '../services/userService';
import { sendVerificationCode, verifyAndLogin, getUserByToken, updateUserByToken } from '../services/authService';

const router = Router();

// ==================== 认证路由 ====================

// 发送验证码
router.post('/auth/send-code', async (req, res) => {
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
router.post('/auth/login', async (req, res) => {
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

// 更新用户资料（通过token）
router.post('/auth/update-profile', async (req, res) => {
  try {
    const { token, profile } = req.body;
    if (!token || !profile) {
      res.status(400).json({ error: '缺少token或资料' });
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

// 管理员密钥
const ADMIN_KEY = process.env.ADMIN_KEY || '195674';

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
