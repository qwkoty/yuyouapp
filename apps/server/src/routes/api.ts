import { Router } from 'express';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById } from '../services/userService';

const router = Router();

// 简单鉴权中间件：验证 userId 对应的用户是否存在
async function validateUser(req: any, res: any, next: any) {
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
}

router.get('/profile/:userId', validateUser, async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:userId', validateUser, async (req, res) => {
  try {
    const history = await getMatchHistory(req.params.userId);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history/:userId', validateUser, async (req, res) => {
  try {
    await clearMatchHistory(req.params.userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/report', async (req, res) => {
  try {
    const { reporterId, reportedId, reason, description } = req.body;

    if (!reporterId || !reportedId || !reason) {
      res.status(400).json({ error: '缺少必要参数' });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
