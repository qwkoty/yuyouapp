import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';
import type { SocketData } from '@yuyou/shared';
import redis from '../lib/redis';

// 存储压力测试状态
let stressTestRunning = false;

export function registerAdminHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  io: any
) {
  // 获取服务器统计
  socket.on('admin:get_stats', async () => {
    try {
      // 获取在线用户数
      const onlineKeys = await redis.keys('online:*');
      const onlineCount = onlineKeys.length;

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

  // 压力测试
  socket.on('admin:stress_test', async (config) => {
    if (stressTestRunning) {
      socket.emit('system:error', { message: '压力测试正在进行中' });
      return;
    }

    stressTestRunning = true;
    const { concurrent, duration } = config;
    const total = concurrent;
    let success = 0;
    let failed = 0;
    const times: number[] = [];

    socket.emit('admin:stress_progress', {
      step: '初始化压力测试...',
      progress: 0,
      total,
      success,
      failed,
    });

    // 模拟并发匹配请求
    const batchSize = Math.min(10, concurrent);
    const batches = Math.ceil(concurrent / batchSize);

    for (let b = 0; b < batches; b++) {
      const batchStart = b * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, concurrent);

      socket.emit('admin:stress_progress', {
        step: `执行第 ${b + 1}/${batches} 批测试 (${batchStart + 1}-${batchEnd})...`,
        progress: Math.round((batchStart / concurrent) * 100),
        total,
        success,
        failed,
      });

      const promises: Promise<void>[] = [];
      for (let i = batchStart; i < batchEnd; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            const startTime = Date.now();
            // 模拟匹配请求延迟
            setTimeout(() => {
              const elapsed = Date.now() - startTime;
              times.push(elapsed);
              // 90% 成功率模拟
              if (Math.random() > 0.1) {
                success++;
              } else {
                failed++;
              }
              resolve();
            }, Math.random() * duration * 1000);
          })
        );
      }

      await Promise.all(promises);

      socket.emit('admin:stress_progress', {
        step: `第 ${b + 1}/${batches} 批完成`,
        progress: Math.round((batchEnd / concurrent) * 100),
        total,
        success,
        failed,
      });
    }

    const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;

    socket.emit('admin:stress_complete', {
      total,
      success,
      failed,
      avgTime,
      maxTime,
    });

    stressTestRunning = false;
  });
}
