import { Request, Response, NextFunction } from 'express';
import redis from '../lib/redis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}

// 基于 Redis 的滑动窗口限流
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix, message = '请求过于频繁，请稍后再试' } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 使用 IP + 路径作为标识，支持代理环境
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';
      const key = `ratelimit:${keyPrefix}:${clientIp}`;

      const now = Date.now();
      const windowStart = now - windowMs;

      // 使用 Redis Sorted Set 实现滑动窗口
      // 移除窗口外的请求记录
      await redis.zremrangebyscore(key, 0, windowStart);

      // 获取当前窗口内的请求数
      const currentCount = await redis.zcard(key);

      if (currentCount >= maxRequests) {
        const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTime = oldest.length > 1 ? parseInt(oldest[1]) + windowMs : now + windowMs;
        const retryAfter = Math.ceil((resetTime - now) / 1000);

        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({
          error: message,
          retryAfter,
        });
        return;
      }

      // 记录当前请求（使用 pipeline 保证原子性）
      const pipeline = redis.pipeline();
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.pexpire(key, windowMs);
      await pipeline.exec();

      // 设置响应头
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount - 1));

      next();
    } catch (err) {
      console.error('[RateLimit] error:', err);
      // 限流器出错时放行，避免阻塞正常请求
      next();
    }
  };
}

// 预设限流配置
export const rateLimiters = {
  // 通用 API：每分钟 60 次（按 IP）
  api: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'api',
  }),

  // 发送验证码：每分钟 5 次（按 IP + 手机号双重限流在业务层实现）
  sendCode: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'sendcode',
    message: '验证码发送过于频繁，请稍后再试',
  }),

  // 登录：每分钟 10 次（按 IP）
  login: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'login',
    message: '登录尝试过于频繁，请稍后再试',
  }),

  // 匹配：每分钟 30 次（按 IP）
  match: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'match',
    message: '匹配请求过于频繁，请稍后再试',
  }),

  // 聊天消息：每分钟 120 次（按 IP）
  chat: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'chat',
    message: '消息发送过于频繁，请稍后再试',
  }),

  // AI 对话：每分钟 20 次（更严格，防止 API 费用过高）
  aiChat: createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'aichat',
    message: 'AI 对话过于频繁，请稍后再试',
  }),

  // 举报：每小时 10 次
  report: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'report',
    message: '举报过于频繁，请稍后再试',
  }),
};

// 用户级限流（按 userId，用于 Socket.IO 等已认证场景）
export function createUserRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix, message = '请求过于频繁，请稍后再试' } = config;

  return async (userId: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
    try {
      const key = `ratelimit:user:${keyPrefix}:${userId}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      await redis.zremrangebyscore(key, 0, windowStart);
      const currentCount = await redis.zcard(key);

      if (currentCount >= maxRequests) {
        const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTime = oldest.length > 1 ? parseInt(oldest[1]) + windowMs : now + windowMs;
        const retryAfter = Math.ceil((resetTime - now) / 1000);
        return { allowed: false, retryAfter };
      }

      const pipeline = redis.pipeline();
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.pexpire(key, windowMs);
      await pipeline.exec();

      return { allowed: true };
    } catch (err) {
      console.error('[UserRateLimit] error:', err);
      return { allowed: true };
    }
  };
}
