import { pool } from '../lib/db';
import type { MatchRecord } from '@yuyou/shared';

export async function addMatchRecord(
  userId: string,
  partnerId: string,
  partnerNickname: string,
  partnerCity: string,
  sessionId: string = '',
  durationSeconds: number = 0
): Promise<void> {
  await pool.query(
    `INSERT INTO match_records (user_id, partner_id, partner_nickname, partner_city, session_id, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, partnerId, partnerNickname, partnerCity, sessionId, durationSeconds]
  );
}

export async function getMatchHistory(userId: string): Promise<MatchRecord[]> {
  const result = await pool.query(
    `SELECT id, user_id, partner_id, partner_nickname, partner_city, session_id, duration_seconds, matched_at
     FROM match_records
     WHERE user_id=$1
     ORDER BY matched_at DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    partnerId: row.partner_id,
    partnerNickname: row.partner_nickname,
    partnerCity: row.partner_city,
    sessionId: row.session_id,
    durationSeconds: row.duration_seconds,
    matchedAt: new Date(row.matched_at).getTime(),
  }));
}

export async function clearMatchHistory(userId: string): Promise<void> {
  await pool.query('DELETE FROM match_records WHERE user_id=$1', [userId]);
}

// 聊天消息持久化
export async function saveChatMessage(
  sessionId: string,
  senderId: string,
  receiverId: string,
  content: string,
  msgType: string = 'text'
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_messages (session_id, sender_id, receiver_id, content, msg_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, senderId, receiverId, content, msgType]
    );
  } catch (err) {
    // 持久化失败不影响主流程
    console.error('[MatchService] 持久化聊天消息失败:', err);
  }
}

export async function getSessionMessages(sessionId: string, limit: number = 100) {
  const result = await pool.query(
    `SELECT id, session_id, sender_id, receiver_id, content, msg_type, created_at
     FROM chat_messages
     WHERE session_id=$1
     ORDER BY created_at ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return result.rows.map(r => ({
    id: r.id,
    sessionId: r.session_id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    content: r.content,
    msgType: r.msg_type,
    createdAt: new Date(r.created_at).getTime(),
  }));
}
