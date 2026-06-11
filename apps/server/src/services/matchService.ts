import { pool } from '../lib/db';
import type { MatchRecord } from '@yuyou/shared';

export async function addMatchRecord(userId: string, partnerId: string, partnerNickname: string, partnerCity: string): Promise<void> {
  await pool.query(
    `INSERT INTO match_records (user_id, partner_id, partner_nickname, partner_city)
     VALUES ($1, $2, $3, $4)`,
    [userId, partnerId, partnerNickname, partnerCity]
  );
}

export async function getMatchHistory(userId: string): Promise<MatchRecord[]> {
  const result = await pool.query(
    `SELECT id, user_id, partner_id, partner_nickname, partner_city, matched_at
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
    matchedAt: new Date(row.matched_at).getTime(),
  }));
}

export async function clearMatchHistory(userId: string): Promise<void> {
  await pool.query('DELETE FROM match_records WHERE user_id=$1', [userId]);
}
