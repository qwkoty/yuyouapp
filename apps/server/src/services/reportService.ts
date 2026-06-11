import { pool } from '../lib/db';
import { incrementReportCount, banUser } from './userService';
import type { Report } from '@yuyou/shared';

export async function createReport(reporterId: string, reportedId: string, reason: string, description?: string): Promise<Report> {
  const result = await pool.query(
    `INSERT INTO reports (reporter_id, reported_id, reason, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [reporterId, reportedId, reason, description || null]
  );

  await incrementReportCount(reportedId);

  const countResult = await pool.query(
    'SELECT report_count FROM users WHERE id=$1',
    [reportedId]
  );
  const reportCount = countResult.rows[0]?.report_count || 0;

  if (reportCount >= 10) {
    await banUser(reportedId);
  }

  return {
    id: result.rows[0].id,
    reporterId: result.rows[0].reporter_id,
    reportedId: result.rows[0].reported_id,
    reason: result.rows[0].reason,
    description: result.rows[0].description,
    createdAt: new Date(result.rows[0].created_at).getTime(),
  };
}
