import { pool } from '../lib/db';
import { banUserWithClient } from './userService';
import type { Report } from '@yuyou/shared';

export async function createReport(reporterId: string, reportedId: string, reason: string, description?: string): Promise<Report> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO reports (reporter_id, reported_id, reason, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reporterId, reportedId, reason, description || null]
    );

    // 原子操作：递增举报计数并返回新值
    const countResult = await client.query(
      'UPDATE users SET report_count = report_count + 1 WHERE id=$1 RETURNING report_count',
      [reportedId]
    );
    const reportCount = countResult.rows[0]?.report_count || 0;

    if (reportCount >= 10) {
      await banUserWithClient(client, reportedId);
    }

    await client.query('COMMIT');

    return {
      id: result.rows[0].id,
      reporterId: result.rows[0].reporter_id,
      reportedId: result.rows[0].reported_id,
      reason: result.rows[0].reason,
      description: result.rows[0].description,
      createdAt: new Date(result.rows[0].created_at).getTime(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
