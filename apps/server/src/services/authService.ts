import { pool } from '../lib/db';
import redis from '../lib/redis';
import { generateId } from '../lib/utils';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'yuyou-jwt-secret-2024';
const JWT_EXPIRES_IN = '7d';

// 生成6位验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码（临时方案：存Redis，返回验证码供测试）
export async function sendVerificationCode(phone: string): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    // 检查发送频率限制（每分钟最多1次）
    const lastSent = await redis.get(`sms_limit:${phone}`);
    if (lastSent) {
      return { success: false, error: '发送过于频繁，请稍后再试' };
    }

    const code = generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

    // 存储验证码到Redis
    await redis.setex(`sms_code:${phone}`, 300, JSON.stringify({ code, expiresAt }));

    // 设置发送频率限制
    await redis.setex(`sms_limit:${phone}`, 60, '1');

    // 同时存到数据库（用于审计）
    await pool.query(
      `INSERT INTO verification_codes (phone, code, type, expires_at) VALUES ($1, $2, 'login', NOW() + INTERVAL '5 minutes')`,
      [phone, code]
    );

    // 临时方案：返回验证码供测试（正式环境删除此返回）
    return { success: true, code };

    // 正式方案：调用短信API发送
    // await sendSMS(phone, code);
    // return { success: true };
  } catch (err) {
    console.error('[Auth] sendVerificationCode error:', err);
    return { success: false, error: '发送失败' };
  }
}

// 验证验证码并登录
export async function verifyAndLogin(phone: string, code: string): Promise<{ success: boolean; token?: string; user?: any; isNewUser?: boolean; error?: string }> {
  try {
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

    // 删除已使用的验证码
    await redis.del(`sms_code:${phone}`);

    // 标记数据库中的验证码为已使用
    await pool.query(
      `UPDATE verification_codes SET used = TRUE WHERE phone = $1 AND code = $2`,
      [phone, code]
    );

    // 查找或创建用户
    const existingUser = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

    if (existingUser.rows.length > 0) {
      // 已有用户，生成token
      const user = existingUser.rows[0];
      if (user.is_banned) {
        return { success: false, error: '账号已被封禁' };
      }

      const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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
      const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; phone: string };
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
    gender: user.gender,
    age: calculateAge(user.birth_date),
    province: user.province,
    city: user.city,
    wechatId: user.wechat_id,
    bio: user.bio,
  };
}

// 更新用户资料（通过token）
export async function updateUserByToken(token: string, profile: any): Promise<any | null> {
  const decoded = verifyToken(token);
  if (!decoded) return null;

  const result = await pool.query(
    `UPDATE users
     SET nickname = $1, avatar = $2, gender = $3, birth_date = $4, province = $5, city = $6, wechat_id = $7, bio = $8
     WHERE id = $9
     RETURNING *`,
    [profile.nickname, profile.avatar, profile.gender, profile.birthDate, profile.province, profile.city, profile.wechatId, profile.bio, decoded.userId]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar,
    gender: user.gender,
    age: calculateAge(user.birth_date),
    province: user.province,
    city: user.city,
    wechatId: user.wechat_id,
    bio: user.bio,
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