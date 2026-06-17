import Redis from 'ioredis';

// ⚡ 移除 lazyConnect，让 ioredis 在创建时自动连接
// lazyConnect: true 时需要手动调用 redis.connect()，否则第一个命令会阻塞
// 自动连接模式下，连接失败会按 retryStrategy 重试，不影响进程启动
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
    })
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });

redis.on('error', (err) => {
  console.error('[Redis] 连接错误:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] 已连接');
});

// 优雅关闭由 index.ts 的 gracefulShutdown 统一管理，这里不再单独监听 SIGTERM/SIGINT
// （避免与 index.ts 的优雅关闭流程冲突，导致进程提前退出或连接未正确关闭）

export default redis;

// ==================== 在线状态 ====================

export async function setOnline(userId: string): Promise<void> {
  // TTL 90秒，心跳30秒，确保不会过早过期
  await redis.setex(`online:${userId}`, 90, Date.now().toString());
}

export async function isOnline(userId: string): Promise<boolean> {
  const val = await redis.get(`online:${userId}`);
  return val !== null;
}

export async function setOffline(userId: string): Promise<void> {
  await redis.del(`online:${userId}`);
}

// ==================== Socket连接统计（用于测试面板实时在线人数） ====================

export async function markSocketActive(socketId: string): Promise<void> {
  await redis.setex(`socket_active:${socketId}`, 10, Date.now().toString());
}

export async function removeSocketActive(socketId: string): Promise<void> {
  await redis.del(`socket_active:${socketId}`);
}

export async function getActiveSocketCount(): Promise<number> {
  return await countKeys('socket_active:*');
}

// ==================== 匹配池 ====================

export async function addToMatchPool(userId: string, gender: string, province: string, city: string): Promise<void> {
  const key = `match_pool:${gender}:${province}`;
  await redis.zadd(key, Date.now(), userId);
  await redis.setex(`match_pool_info:${userId}`, 120, JSON.stringify({ gender, province, city }));
}

export async function removeFromMatchPool(userId: string, gender: string, province: string): Promise<void> {
  const key = `match_pool:${gender}:${province}`;
  await redis.zrem(key, userId);
  await redis.del(`match_pool_info:${userId}`);
}

export async function getMatchPoolCandidates(gender: string, province: string, excludeUserId: string): Promise<string[]> {
  const key = `match_pool:${gender}:${province}`;
  const all = await redis.zrange(key, 0, -1);
  return all.filter(id => id !== excludeUserId);
}

// ==================== 会话 ====================

export async function createSession(sessionId: string, userA: string, userB: string): Promise<void> {
  const now = Date.now();
  const endsAt = now + 88 * 1000;
  const pipeline = redis.pipeline();
  pipeline.hset(`session:${sessionId}`, {
    userA,
    userB,
    startedAt: now.toString(),
    endsAt: endsAt.toString(),
    status: 'active',
  });
  pipeline.setex(`session_user:${userA}`, 120, sessionId);
  pipeline.setex(`session_user:${userB}`, 120, sessionId);
  await pipeline.exec();
}

export async function getSession(sessionId: string): Promise<Record<string, string> | null> {
  const data = await redis.hgetall(`session:${sessionId}`);
  return Object.keys(data).length > 0 ? data : null;
}

export async function getUserSession(userId: string): Promise<string | null> {
  return await redis.get(`session_user:${userId}`);
}

export async function endSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (session) {
    const pipeline = redis.pipeline();
    pipeline.del(`session_user:${session.userA}`);
    pipeline.del(`session_user:${session.userB}`);
    pipeline.del(`session:${sessionId}`);
    pipeline.del(`chat_history:${sessionId}`);
    pipeline.del(`wechat_visible:${sessionId}`);
    await pipeline.exec();
  }
}

export async function setSessionStatus(sessionId: string, status: string): Promise<void> {
  await redis.hset(`session:${sessionId}`, 'status', status);
}

// ==================== 聊天记录（临时） ====================

export async function addChatMessage(sessionId: string, message: string): Promise<void> {
  await redis.lpush(`chat_history:${sessionId}`, message);
  await redis.expire(`chat_history:${sessionId}`, 120);
}

// ==================== 微信号展示 ====================

export async function setWechatVisible(sessionId: string, userId: string, visible: boolean): Promise<void> {
  await redis.hset(`wechat_visible:${sessionId}`, userId, visible ? '1' : '0');
}

export async function isWechatVisible(sessionId: string, userId: string): Promise<boolean> {
  const val = await redis.hget(`wechat_visible:${sessionId}`, userId);
  return val === '1';
}

// ==================== 匹配过的用户对 ====================

export async function markMatchedPair(userA: string, userB: string): Promise<void> {
  const key = `matched_pair:${minId(userA, userB)}:${maxId(userA, userB)}`;
  await redis.setex(key, 3600, '1');
}

export async function hasMatchedBefore(userA: string, userB: string): Promise<boolean> {
  const key = `matched_pair:${minId(userA, userB)}:${maxId(userA, userB)}`;
  const val = await redis.get(key);
  return val !== null;
}

function minId(a: string, b: string): string {
  return a < b ? a : b;
}

function maxId(a: string, b: string): string {
  return a > b ? a : b;
}

// ==================== 通用工具 ====================

async function countKeys(pattern: string): Promise<number> {
  let count = 0;
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    count += result[1].length;
  } while (cursor !== '0');
  return count;
}

export async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  return keys;
}
