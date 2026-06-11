import { Router } from 'express';
import { getMatchHistory, clearMatchHistory } from '../services/matchService';
import { createReport } from '../services/reportService';
import { getUserById } from '../services/userService';

const router = Router();

router.get('/profile/:userId', async (req, res) => {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:userId', async (req, res) => {
  try {
    const history = await getMatchHistory(req.params.userId);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history/:userId', async (req, res) => {
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
    const report = await createReport(reporterId, reportedId, reason, description);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
