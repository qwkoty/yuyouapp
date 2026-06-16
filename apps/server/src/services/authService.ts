import { pool } from '../lib/db';
import redis from '../lib/redis';
import { generateId } from '../lib/utils';
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

// 发送验证码
export async function sendVerificationCode(phone: string, clientCode?: string): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    // 检查发送频率限制（每分钟最多10次）
    const countKey = `sms_limit:${phone}`;
    const currentCount = await redis.get(countKey);
    if (currentCount && parseInt(currentCount) >= 10) {
      return { success: false, error: '发送过于频繁，请1分钟后再试' };
    }

    // ⚡ 开发环境：允许前端传入验证码，避免等待后端响应
    // 生产环境必须忽略 clientCode，由后端生成，防止验证码绕过攻击
    const code = (isDevEnv() && clientCode && /^\d{6}$/.test(clientCode)) ? clientCode : generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

    // 存储验证码到Redis
    await redis.setex(`sms_code:${phone}`, 300, JSON.stringify({ code, expiresAt }));

    // 增加发送次数计数（1分钟过期）
    if (currentCount) {
      await redis.incr(countKey);
    } else {
      await redis.setex(countKey, 60, '1');
    }

    // 同时存到数据库（用于审计）
    await pool.query(
      `INSERT INTO verification_codes (phone, code, type, expires_at) VALUES ($1, $2, 'login', NOW() + INTERVAL '5 MINUTES')`,
      [phone, code]
    );

    // 开发环境：返回验证码供测试（生产环境绝不返回）
    if (isDevEnv()) {
      return { success: true, code };
    }

    // 生产环境：调用短信API发送（TODO: 接入短信服务商）
    // await sendSMS(phone, code);
    return { success: true };
  } catch (err) {
    console.error('[Auth] sendVerificationCode error:', err);
    return { success: false, error: '发送失败' };
  }
}

// 验证验证码并登录
export async function verifyAndLogin(phone: string, code: string): Promise<{ success: boolean; token?: string; user?: any; isNewUser?: boolean; error?: string }> {
  try {
    // ⚠️ 防暴力破解：每个手机号 5 分钟内最多尝试 5 次验证码
    const attemptKey = `sms_attempts:${phone}`;
    const attempts = await redis.incr(attemptKey);
    if (attempts === 1) {
      await redis.expire(attemptKey, 300); // 5 分钟窗口
    }
    if (attempts > 5) {
      return { success: false, error: '尝试次数过多，请 5 分钟后再试' };
    }

    // 从Redis获取验证码
    const stored = await redis.get(`sms_code:${phone}`);
    if (!stored) {
      return { success: false, error: '验证码已过期或不存在' };
    }

    const { code: storedCode, expiresAt } = JSON.parse(stored);
    if (storedCode !== code) {
      return { success: false, error: '验证码错误' };
    }

    if (Date.now() > expiresAt) {
      await redis.del(`sms_code:${phone}`);
      return { success: false, error: '验证码已过期' };
    }

    // 验证成功：清除尝试计数和验证码（防止重复使用）
    await redis.del(`sms_code:${phone}`);
    await redis.del(attemptKey);

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
    const existingUser = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

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
      const result = await pool.query(
        `INSERT INTO users (id, phone, nickname, gender, birth_date, province, city)
         VALUES ($1, $2, '新用户', 'male', '2000-01-01', '北京', '北京')
         RETURNING *`,
        [userId, phone]
      );

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
  } catch (err) {
    console.error('[Auth] verifyAndLogin error:', err);
    return { success: false, error: '登录失败' };
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

  const result = await pool.query(
    `UPDATE users
     SET nickname = $1, avatar = $2, gender = $3, birth_date = $4, province = $5, city = $6, wechat_id = $7, bio = $8, real_name = $9
     WHERE id = $10
     RETURNING *`,
    [profile.nickname, profile.avatar, profile.gender, profile.birthDate, profile.province, profile.city, profile.wechatId, profile.bio, profile.realName || '', decoded.userId]
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

function calculateAge(birthDate: string | Date): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
