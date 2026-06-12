import { pool } from '../lib/db';
import { calculateAge } from '../lib/utils';
import type { UserProfile, UserProfileInput } from '@yuyou/shared';

export async function createUser(profile: UserProfileInput): Promise<UserProfile> {
  const result = await pool.query(
    `INSERT INTO users (avatar, nickname, real_name, gender, birth_date, province, city, wechat_id, bio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [profile.avatar, profile.nickname, profile.realName, profile.gender, profile.birthDate,
     profile.province, profile.city, profile.wechatId, profile.bio]
  );
  return rowToProfile(result.rows[0]);
}

export async function updateUser(userId: string, profile: UserProfileInput): Promise<UserProfile> {
  const result = await pool.query(
    `UPDATE users
     SET avatar=$1, nickname=$2, real_name=$3, gender=$4, birth_date=$5,
         province=$6, city=$7, wechat_id=$8, bio=$9
     WHERE id=$10
     RETURNING *`,
    [profile.avatar, profile.nickname, profile.realName, profile.gender, profile.birthDate,
     profile.province, profile.city, profile.wechatId, profile.bio, userId]
  );
  return rowToProfile(result.rows[0]);
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const result = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
  if (result.rows.length === 0) return null;
  return rowToProfile(result.rows[0]);
}

export async function getUsersByIds(userIds: string[]): Promise<UserProfile[]> {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = ANY($1)',
    [userIds]
  );
  return result.rows.map(rowToProfile);
}

// 事务内使用：传入 client 保证原子性
export async function banUserWithClient(client: any, userId: string): Promise<void> {
  await client.query(
    'UPDATE users SET is_banned = TRUE WHERE id=$1',
    [userId]
  );
}

// 非事务使用
export async function banUser(userId: string): Promise<void> {
  await pool.query(
    'UPDATE users SET is_banned = TRUE WHERE id=$1',
    [userId]
  );
}

function rowToProfile(row: any): UserProfile {
  return {
    id: row.id,
    avatar: row.avatar,
    nickname: row.nickname,
    realName: row.real_name,
    gender: row.gender,
    birthDate: row.birth_date,
    age: calculateAge(row.birth_date),
    province: row.province,
    city: row.city,
    wechatId: row.wechat_id,
    bio: row.bio,
    createdAt: new Date(row.created_at).getTime(),
  };
}
