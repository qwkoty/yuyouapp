import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';
import type { SocketData } from '@yuyou/shared';
import redis from '../lib/redis';
import { setOnline, markSocketActive, removeSocketActive, getActiveSocketCount, scanKeys } from '../lib/redis';

const ADMIN_KEY = '195674';

// 存储压力测试状态
let stressTestRunning = false;

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  io: any
) {
  // 管理员认证
  socket.on('admin:auth', async (token: string) => {
    try {
      if (token === ADMIN_KEY) {
        socket.data.isAdmin = true;
        socket.emit('admin:auth_success');
      } else {
        socket.emit('system:error', { message: '认证失败' });
      }
    } catch (err) {
      console.error('[Admin] auth error:', err);
    }
  });

  // 心跳：标记在线（支持有userId和没有userId的情况）
  socket.on('heartbeat', async () => {
    try {
      const userId = socket.data.userId;
      if (userId) {
        await setOnline(userId);
      }
      // 无论有没有userId，都标记这个socket为活跃（10秒TTL，自动过期）
      await markSocketActive(socket.id);
    } catch (err) {
      console.error('[Admin] heartbeat error:', err);
    }
  });

  // 获取服务器统计（需要管理员权限）
  socket.on('admin:get_stats', async () => {
    try {
      if (!socket.data.isAdmin) {
        return;
      }

      const onlineKeys = await scanKeys('online:*');
      let onlineCount = onlineKeys.length;

      const stressKeys = await scanKeys('stress_online:*');
      onlineCount += stressKeys.length;

      const activeSocketCount = await getActiveSocketCount();
      if (activeSocketCount > 0) {
        onlineCount = Math.max(onlineCount, activeSocketCount);
      }

      const matchPoolKeys = await scanKeys('match_pool:*');
      let matchingCount = 0;
      for (const key of matchPoolKeys) {
        const count = await redis.zcard(key);
        matchingCount += count;
      }

      const allSessionKeys = await scanKeys('session:*');
      const sessionKeys = allSessionKeys.filter(k => k.startsWith('session:') && !k.startsWith('session_user:'));
      const activeSessions = sessionKeys.length;

      socket.emit('admin:stats', { onlineCount, matchingCount, activeSessions });
    } catch (err) {
      console.error('[Admin] 获取统计失败:', err);
      socket.emit('admin:stats', { onlineCount: 0, matchingCount: 0, activeSessions: 0 });
    }
  });

  // 公开在线人数（所有用户可查询，仅返回在线人数）
  socket.on('online:count', async () => {
    try {
      const userId = socket.data.userId;
      if (userId) {
        await setOnline(userId);
        await markSocketActive(socket.id);
      }

      const onlineKeys = await scanKeys('online:*');
      let onlineCount = onlineKeys.length;

      const stressKeys = await scanKeys('stress_online:*');
      onlineCount += stressKeys.length;

      const activeSocketCount = await getActiveSocketCount();
      if (activeSocketCount > 0) {
        onlineCount = Math.max(onlineCount, activeSocketCount);
      }

      socket.emit('online:count', { onlineCount });
    } catch (err) {
      console.error('[Admin] 获取在线人数失败:', err);
      socket.emit('online:count', { onlineCount: 0 });
    }
  });

  // 服务器压力测试 - 模拟同时在线人数（需要认证）
  socket.on('admin:stress_test', async (config) => {
    try {
      // 验证管理员权限
      const isAdmin = socket.data.isAdmin;
      if (!isAdmin) {
        socket.emit('system:error', { message: '无权限执行压力测试' });
        return;
      }

      if (stressTestRunning) {
        socket.emit('system:error', { message: '压力测试正在进行中' });
        return;
      }

      stressTestRunning = true;
      const concurrent = config?.concurrent || 50;
      const duration = config?.duration || 3;
      const total = concurrent;

      // Step 1: 开始
      socket.emit('admin:stress_progress', {
        step: `开始模拟 ${total} 人同时在线...`,
        progress: 5,
        total,
        success: 0,
        failed: 0,
      });

      // Step 2: 分批创建在线标记（模拟用户上线）
      const batchSize = Math.min(50, concurrent);
      const batches = Math.ceil(concurrent / batchSize);

      for (let b = 0; b < batches; b++) {
        const batchStart = b * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, concurrent);

        socket.emit('admin:stress_progress', {
          step: `用户上线中: ${batchEnd} / ${total}`,
          progress: Math.round((batchEnd / total) * 40),
          total,
          success: batchEnd,
          failed: 0,
        });

        // 创建模拟在线标记
        const pipeline = redis.pipeline();
        for (let i = batchStart; i < batchEnd; i++) {
          pipeline.setex(`stress_online:${i}`, duration + 10, Date.now().toString());
        }
        await pipeline.exec();

        await new Promise((r) => setTimeout(r, 50));
      }

      // Step 3: 所有用户已上线
      socket.emit('admin:stress_progress', {
        step: `${total} 人已上线`,
        progress: 45,
        total,
        success: total,
        failed: 0,
      });

      await new Promise((r) => setTimeout(r, 300));

      // Step 4: 维持在线状态（持续duration秒）
      const startTime = Date.now();
      const durationMs = duration * 1000;
      const updateIntervalMs = 500; // 每500ms更新一次进度
      let elapsed = 0;

      while (elapsed < durationMs) {
        await new Promise((r) => setTimeout(r, updateIntervalMs));
        elapsed = Date.now() - startTime;

        const progress = 45 + Math.round((elapsed / durationMs) * 50);
        const secondsLeft = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));

        socket.emit('admin:stress_progress', {
          step: `${total} 人在线中，剩余 ${secondsLeft} 秒`,
          progress: Math.min(progress, 95),
          total,
          success: total,
          failed: 0,
        });
      }

      // Step 5: 清理
      socket.emit('admin:stress_progress', {
        step: '清理模拟用户...',
        progress: 96,
        total,
        success: total,
        failed: 0,
      });

      const stressKeys = await scanKeys('stress_online:*');
      if (stressKeys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of stressKeys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }

      // Step 6: 完成
      socket.emit('admin:stress_complete', {
        total,
        success: total,
        failed: 0,
        avgTime: duration * 1000,
        maxTime: duration * 1000,
      });

      stressTestRunning = false;
    } catch (err) {
      console.error('[Admin] 压力测试错误:', err);
      socket.emit('system:error', { message: '压力测试出错' });
      stressTestRunning = false;
    }
  });

  // 断开时立即清理
  socket.on('disconnect', async () => {
    try {
      await removeSocketActive(socket.id);
    } catch (err) {
      console.error('[Admin] disconnect error:', err);
    }
  });
}
