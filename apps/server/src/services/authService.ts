import { pool } from '../lib/db';
import redis from '../lib/redis';
import { generateId, calculateAge } from '../lib/utils';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getJwtSecret } from '../lib/envCheck';

const JWT_EXPIRES_IN = '7d';

// 生成6位验证码（使用加密安全的随机数，而非 Math.random）
function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

// 是否为开发环境（仅开发环境允许前端传验证码、返回验证码明文）
function isDevEnv(): boolean {
  return process.env.NODE_ENV === 'development';
}

// 短信服务是否已启用
// 未启用时（SMS_ENABLED !== 'true'），无论什么环境都返回验证码明文，因为短信发送未实现
// 启用后，生产环境通过短信发送，不再返回明文
function isSmsEnabled(): boolean {
  return process.env.SMS_ENABLED === 'true';
}

// 是否应该返回验证码明文给前端
function shouldReturnCode(): boolean {
  // 开发环境总是返回；生产环境在短信服务未接入时也返回
  return isDevEnv() || !isSmsEnabled();
}

// 是否允许前端传入验证码（用于开发环境绕过短信发送）
function shouldAcceptClientCode(): boolean {
  return isDevEnv() || !isSmsEnabled();
}

// ⚡ Redis 不可用时的内存降级存储（生产环境兜底，避免登录完全不可用）
// 注意：多实例部署时不共享，仅作为 Redis 故障时的降级方案
interface MemCodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  sendCount: number;
}
const memCodeStore = new Map<string, MemCodeEntry>();

function getMemCode(phone: string): MemCodeEntry | undefined {
  const entry = memCodeStore.get(phone);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memCodeStore.delete(phone);
    return undefined;
  }
  return entry;
}

function setMemCode(phone: string, code: string, expiresAt: number): void {
  memCodeStore.set(phone, { code, expiresAt, attempts: 0, sendCount: 1 });
}

// 每分钟清理一次过期内存验证码
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of memCodeStore.entries()) {
    if (now > entry.expiresAt) {
      memCodeStore.delete(phone);
    }
  }
}, 60 * 1000);

// 发送验证码
export async function sendVerificationCode(phone: string, clientCode?: string): Promise<{ success: boolean; code?: string; error?: string }> {
  // ⚡ 优先尝试 Redis；若 Redis 不可用，自动降级到内存 Map
  let redisAvailable = false;
  const countKey = `sms_limit:${phone}`;
  let currentCount = 0;

  try {
    const cnt = await redis.get(countKey);
    currentCount = cnt ? parseInt(cnt) : 0;
    if (currentCount >= 10) {
      return { success: false, error: '发送过于频繁，请1分钟后再试' };
    }
    redisAvailable = true;
  } catch (err: any) {
    console.warn('[Auth] Redis 频率检查失败，降级到内存:', err?.message || err);
    // 降级：检查内存中的发送次数
    const mem = getMemCode(phone);
    if (mem && mem.sendCount >= 10) {
      return { success: false, error: '发送过于频繁，请1分钟后再试' };
    }
  }

  // ⚡ 开发环境或未接入短信服务时：允许前端传入验证码，避免等待后端响应
  // 短信服务启用后，生产环境必须忽略 clientCode，由后端生成，防止验证码绕过攻击
  const code = (shouldAcceptClientCode() && clientCode && /^\d{6}$/.test(clientCode)) ? clientCode : generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

  if (redisAvailable) {
    try {
      await redis.setex(`sms_code:${phone}`, 300, JSON.stringify({ code, expiresAt }));
    } catch (err: any) {
      console.warn('[Auth] Redis 存储验证码失败，降级到内存:', err?.message || err);
      redisAvailable = false;
    }
  }

  if (!redisAvailable) {
    // 内存降级存储，保证登录可用
    const mem = getMemCode(phone);
    setMemCode(phone, code, expiresAt);
    if (mem) {
      const newEntry = memCodeStore.get(phone)!;
      newEntry.sendCount = mem.sendCount + 1;
    }
  } else {
    // 增加发送次数计数（1分钟过期）- 失败不影响主流程
    try {
      if (currentCount > 0) {
        await redis.incr(countKey);
      } else {
        await redis.setex(countKey, 60, '1');
      }
    } catch (err: any) {
      console.warn('[Auth] Redis 计数失败（不影响登录）:', err?.message || err);
    }
  }

  // 同时存到数据库（用于审计）- 非阻塞，失败不影响登录流程
  pool.query(
    `INSERT INTO verification_codes (phone, code, type, expires_at) VALUES ($1, $2, 'login', NOW() + INTERVAL '5 MINUTES')`,
    [phone, code]
  ).catch(err => {
    console.error('[Auth] DB 记录验证码失败（不影响登录）:', err);
  });

  // 未接入短信服务时：返回验证码供前端显示（开发环境或 SMS_ENABLED !== 'true'）
  // 短信服务启用后，生产环境通过短信发送，不再返回明文
  if (shouldReturnCode()) {
    return { success: true, code };
  }

  // 生产环境（短信服务已启用）：调用短信API发送
  // await sendSMS(phone, code);
  return { success: true };
}

// 验证验证码并登录
export async function verifyAndLogin(phone: string, code: string): Promise<{ success: boolean; token?: string; user?: any; isNewUser?: boolean; error?: string }> {
  // ⚠️ 防暴力破解：每个手机号 5 分钟内最多尝试 5 次验证码
  const attemptKey = `sms_attempts:${phone}`;
  let useMem = false;
  let attempts = 0;
  try {
    const cnt = await redis.incr(attemptKey);
    if (cnt === 1) {
      await redis.expire(attemptKey, 300); // 5 分钟窗口
    }
    attempts = cnt;
  } catch (err: any) {
    console.warn('[Auth] Redis 尝试次数失败，降级到内存:', err?.message || err);
    useMem = true;
    const mem = getMemCode(phone);
    attempts = mem ? mem.attempts + 1 : 1;
    if (mem) mem.attempts = attempts;
  }
  if (attempts > 5) {
    return { success: false, error: '尝试次数过多，请 5 分钟后再试' };
  }

  // 从Redis获取验证码（Redis 不可用时从内存 Map 获取）
  let storedCode: string | null = null;
  let expiresAt: number = 0;
  try {
    const stored = await redis.get(`sms_code:${phone}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      storedCode = parsed.code;
      expiresAt = parsed.expiresAt;
    }
  } catch (err: any) {
    console.warn('[Auth] Redis 获取验证码失败，降级到内存:', err?.message || err);
    useMem = true;
  }

  // Redis 没拿到，尝试内存
  if (!storedCode && useMem) {
    const mem = getMemCode(phone);
    if (mem) {
      storedCode = mem.code;
      expiresAt = mem.expiresAt;
    }
  }

  if (!storedCode) {
    return { success: false, error: '验证码已过期或不存在，请重新获取' };
  }

  if (storedCode !== code) {
    return { success: false, error: '验证码错误' };
  }

  if (Date.now() > expiresAt) {
    await redis.del(`sms_code:${phone}`).catch(() => {});
    memCodeStore.delete(phone);
    return { success: false, error: '验证码已过期，请重新获取' };
  }

  // 验证成功：清除尝试计数和验证码（防止重复使用）
  await redis.del(`sms_code:${phone}`).catch(() => {});
  await redis.del(attemptKey).catch(() => {});
  memCodeStore.delete(phone);

  // 标记数据库中的验证码为已使用（忽略失败，不影响登录流程）
  try {
    await pool.query(
      `UPDATE verification_codes SET used = TRUE WHERE phone = $1 AND code = $2`,
      [phone, code]
    );
  } catch (e) {
    console.error('[Auth] 标记验证码已使用失败:', e);
  }

  // 查找或创建用户
  let existingUser;
  try {
    existingUser = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  } catch (err) {
    console.error('[Auth] 查询用户失败:', err);
    return { success: false, error: '服务暂时不可用，请稍后再试' };
  }

  if (existingUser.rows.length > 0) {
    // 已有用户，生成token
    const user = existingUser.rows[0];
    if (user.is_banned) {
      return { success: false, error: '账号已被封禁' };
    }

    const token = jwt.sign({ userId: user.id, phone: user.phone }, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        gender: user.gender,
        age: calculateAge(user.birth_date),
        province: user.province,
        city: user.city,
      },
      isNewUser: false,
    };
  } else {
    // 新用户，创建临时账号
    const userId = generateId();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO users (id, phone, nickname, gender, birth_date, province, city)
         VALUES ($1, $2, '新用户', 'male', '2000-01-01', '北京', '北京')
         RETURNING *`,
        [userId, phone]
      );
    } catch (err) {
      console.error('[Auth] 创建用户失败:', err);
      return { success: false, error: '注册失败，请稍后再试' };
    }

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, phone: user.phone }, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        gender: user.gender,
        age: calculateAge(user.birth_date),
        province: user.province,
        city: user.city,
      },
      isNewUser: true,
    };
  }
}

// 验证JWT token
export function verifyToken(token: string): { userId: string; phone: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; phone: string };
    return decoded;
  } catch {
    return null;
  }
}

// 根据userId获取用户
export async function getUserByToken(token: string): Promise<any | null> {
  const decoded = verifyToken(token);
  if (!decoded) return null;

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar,
    realName: user.real_name || '',
    gender: user.gender,
    age: calculateAge(user.birth_date),
    birthDate: user.birth_date,
    province: user.province,
    city: user.city,
    wechatId: user.wechat_id,
    bio: user.bio,
    createdAt: new Date(user.created_at).getTime(),
  };
}

// 更新用户资料（通过token）
export async function updateUserByToken(token: string, profile: any): Promise<any | null> {
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return updateUserById(decoded.userId, profile);
}

// 更新用户资料（通过userId）- 推荐使用，避免重复 verifyToken
export async function updateUserById(userId: string, profile: any): Promise<any | null> {
  const result = await pool.query(
    `UPDATE users
     SET nickname = $1, avatar = $2, gender = $3, birth_date = $4, province = $5, city = $6, wechat_id = $7, bio = $8, real_name = $9
     WHERE id = $10
     RETURNING *`,
    [profile.nickname, profile.avatar, profile.gender, profile.birthDate, profile.province, profile.city, profile.wechatId, profile.bio, profile.realName || '', userId]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar,
    realName: user.real_name || '',
    gender: user.gender,
    age: calculateAge(user.birth_date),
    birthDate: user.birth_date,
    province: user.province,
    city: user.city,
    wechatId: user.wechat_id,
    bio: user.bio,
    createdAt: new Date(user.created_at).getTime(),
  };
}
