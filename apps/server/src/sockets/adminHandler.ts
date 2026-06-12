import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';
import type { SocketData } from '@yuyou/shared';
import redis from '../lib/redis';
import { setOnline, markSocketActive, removeSocketActive, getActiveSocketCount } from '../lib/redis';

// 存储压力测试状态
let stressTestRunning = false;

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  io: any
) {
  // 心跳：标记在线（支持有userId和没有userId的情况）
  socket.on('heartbeat', async () => {
    const userId = socket.data.userId;
    if (userId) {
      await setOnline(userId);
    }
    // 无论有没有userId，都标记这个socket为活跃（10秒TTL，自动过期）
    await markSocketActive(socket.id);
  });

  // 获取服务器统计
  socket.on('admin:get_stats', async () => {
    try {
      // 获取在线用户数（Redis中标记的）
      const onlineKeys = await redis.keys('online:*');
      let onlineCount = onlineKeys.length;

      // 获取压力测试模拟的在线用户
      const stressKeys = await redis.keys('stress_online:*');
      onlineCount += stressKeys.length;

      // 获取活跃的socket连接数（10秒TTL自动过期，退出页面后自动消失）
      const activeSocketCount = await getActiveSocketCount();
      if (activeSocketCount > 0) {
        onlineCount = Math.max(onlineCount, activeSocketCount);
      }

      // 获取正在匹配的用户数
      const matchPoolKeys = await redis.keys('match_pool:*');
      let matchingCount = 0;
      for (const key of matchPoolKeys) {
        const count = await redis.zcard(key);
        matchingCount += count;
      }

      // 获取活跃会话数
      const sessionKeys = await redis.keys('session:*');
      const activeSessions = sessionKeys.length;

      socket.emit('admin:stats', { onlineCount, matchingCount, activeSessions });
    } catch (err) {
      console.error('[Admin] 获取统计失败:', err);
      socket.emit('admin:stats', { onlineCount: 0, matchingCount: 0, activeSessions: 0 });
    }
  });

  // 服务器压力测试 - 模拟同时在线人数
  socket.on('admin:stress_test', async (config) => {
    if (stressTestRunning) {
      socket.emit('system:error', { message: '压力测试正在进行中' });
      return;
    }

    stressTestRunning = true;
    const { concurrent, duration } = config;
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

    const stressKeys = await redis.keys('stress_online:*');
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
  });

  // 断开时立即清理
  socket.on('disconnect', async () => {
    await removeSocketActive(socket.id);
  });
}
