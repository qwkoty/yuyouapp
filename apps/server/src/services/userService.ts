import { pool } from '../lib/db';
import { calculateAge } from '../lib/utils';
import type { UserProfile, UserProfileInput } from '@yuyou/shared';

export async function createUser(profile: UserProfileInput): Promise<UserProfile> {
  const result = await pool.query(
    `INSERT INTO users (avatar, nickname, real_name, gender, birth_date, province, city, wechat_id, bio, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [profile.avatar, profile.nickname, profile.realName, profile.gender, profile.birthDate,
     profile.province, profile.city, profile.wechatId, profile.bio, profile.tags || []]
  );
  return rowToProfile(result.rows[0]);
}

export async function updateUser(userId: string, profile: UserProfileInput): Promise<UserProfile> {
  const result = await pool.query(
    `UPDATE users
     SET avatar=$1, nickname=$2, real_name=$3, gender=$4, birth_date=$5,
         province=$6, city=$7, wechat_id=$8, bio=$9, tags=$10
     WHERE id=$11
     RETURNING *`,
    [profile.avatar, profile.nickname, profile.realName, profile.gender, profile.birthDate,
     profile.province, profile.city, profile.wechatId, profile.bio, profile.tags || [], userId]
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
    tags: row.tags || [],
    blockedUsers: row.blocked_users || [],
    createdAt: new Date(row.created_at).getTime(),
  };
}

// 屏蔽用户
export async function blockUser(userId: string, targetId: string): Promise<UserProfile> {
  const result = await pool.query(
    `UPDATE users SET blocked_users = array_append(blocked_users, $1) WHERE id=$2 AND NOT ($1 = ANY(blocked_users)) RETURNING *`,
    [targetId, userId]
  );
  // 已屏蔽过该用户时 UPDATE 不影响任何行，重新查询返回当前用户状态
  if (result.rows.length === 0) {
    const current = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
    if (current.rows.length === 0) {
      throw new Error('用户不存在');
    }
    return rowToProfile(current.rows[0]);
  }
  return rowToProfile(result.rows[0]);
}

// 取消屏蔽
export async function unblockUser(userId: string, targetId: string): Promise<UserProfile> {
  const result = await pool.query(
    `UPDATE users SET blocked_users = array_remove(blocked_users, $1) WHERE id=$2 RETURNING *`,
    [targetId, userId]
  );
  if (result.rows.length === 0) {
    const current = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
    if (current.rows.length === 0) {
      throw new Error('用户不存在');
    }
    return rowToProfile(current.rows[0]);
  }
  return rowToProfile(result.rows[0]);
}
