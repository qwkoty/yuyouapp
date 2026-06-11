import { Pool } from 'pg';

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'yuyou',
      password: process.env.DB_PASSWORD || 'yuyou123',
      database: process.env.DB_NAME || 'yuyou',
    });

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        avatar TEXT NOT NULL DEFAULT '',
        nickname VARCHAR(32) NOT NULL,
        real_name VARCHAR(32) NOT NULL DEFAULT '',
        gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
        birth_date DATE NOT NULL,
        province VARCHAR(50) NOT NULL,
        city VARCHAR(50) NOT NULL,
        wechat_id VARCHAR(50) NOT NULL DEFAULT '',
        bio VARCHAR(100) NOT NULL DEFAULT '',
        report_count INT NOT NULL DEFAULT 0,
        is_banned BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS match_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        partner_nickname VARCHAR(32) NOT NULL,
        partner_city VARCHAR(50) NOT NULL,
        matched_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(20) NOT NULL CHECK (reason IN ('harassment', 'advertising', 'fraud', 'other')),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[DB] 数据库表初始化完成');
  } finally {
    client.release();
  }
}

export { pool };
