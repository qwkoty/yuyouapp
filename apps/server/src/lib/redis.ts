import Redis from 'ioredis';

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

export default redis;

// ==================== 在线状态 ====================

export async function setOnline(userId: string): Promise<void> {
  await redis.setex(`online:${userId}`, 60, Date.now().toString());
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
  // 使用10秒TTL，心跳每3秒发送一次，确保过期后自动清理
  await redis.setex(`socket_active:${socketId}`, 10, Date.now().toString());
}

export async function removeSocketActive(socketId: string): Promise<void> {
  await redis.del(`socket_active:${socketId}`);
}

export async function getActiveSocketCount(): Promise<number> {
  const keys = await redis.keys('socket_active:*');
  return keys.length;
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
  await redis.hset(`session:${sessionId}`, {
    userA,
    userB,
    startedAt: now.toString(),
    endsAt: endsAt.toString(),
    status: 'active',
  });
  await redis.setex(`session_user:${userA}`, 120, sessionId);
  await redis.setex(`session_user:${userB}`, 120, sessionId);
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
    await redis.del(`session_user:${session.userA}`);
    await redis.del(`session_user:${session.userB}`);
    await redis.del(`session:${sessionId}`);
    await redis.del(`chat_history:${sessionId}`);
    await redis.del(`wechat_visible:${sessionId}`);
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
