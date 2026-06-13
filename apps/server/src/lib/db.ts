import { Pool } from 'pg';

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
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
    // CockroachDB / PostgreSQL 兼容：确保 uuid 扩展可用
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 使用 CREATE TABLE IF NOT EXISTS 避免删除已有数据
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone VARCHAR(20) UNIQUE,
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

    // 添加phone字段（CockroachDB兼容方式：先检查再添加）
    try {
      const colCheck = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='phone'`
      );
      if (colCheck.rows.length === 0) {
        await client.query(`ALTER TABLE users ADD COLUMN phone VARCHAR(20) UNIQUE`);
        console.log('[DB] 添加phone字段成功');
      }
    } catch (err: any) {
      if (err.code !== '42701') { // 42701 = column already exists
        console.error('[DB] 添加phone字段失败:', err.message);
      }
    }

    // 验证码表
    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(6) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'login',
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS match_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        partner_nickname VARCHAR(32) NOT NULL,
        partner_city VARCHAR(50) NOT NULL,
        matched_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, partner_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(20) NOT NULL CHECK (reason IN ('harassment', 'advertising', 'fraud', 'other')),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(reporter_id, reported_id)
      )
    `);

    // 创建常用索引
    await client.query(`CREATE INDEX IF NOT EXISTS idx_match_records_user_id ON match_records(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports(reported_id)`);

    console.log('[DB] 数据库表初始化完成');
  } finally {
    client.release();
  }
}

export { pool };
