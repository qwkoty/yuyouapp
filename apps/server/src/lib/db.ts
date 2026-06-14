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
        matched_at TIMESTAMP DEFAULT NOW()
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

    // 智能体表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        avatar TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        api_provider VARCHAR(20) NOT NULL DEFAULT 'deepseek',
        api_key TEXT NOT NULL DEFAULT '',
        api_url TEXT NOT NULL DEFAULT '',
        model VARCHAR(50) NOT NULL DEFAULT 'deepseek-chat',
        temperature FLOAT NOT NULL DEFAULT 0.7,
        max_tokens INT NOT NULL DEFAULT 2000,
        thinking BOOLEAN NOT NULL DEFAULT FALSE,
        wechat_bound BOOLEAN NOT NULL DEFAULT FALSE,
        wechat_account_id VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 更新 api_provider CHECK 约束以支持新服务商
    try {
      await client.query(`ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_api_provider_check`);
      await client.query(`ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_api_provider_check CHECK (api_provider IN ('deepseek', 'nvidia', 'qwen', 'custom'))`);
    } catch (err: any) {
      if (err.code !== '42P07') console.error('[DB] 更新provider约束失败:', err.message);
    }

    // 添加 thinking 字段（兼容已有数据库）
    try {
      const colCheck = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='ai_agents' AND column_name='thinking'`
      );
      if (colCheck.rows.length === 0) {
        await client.query(`ALTER TABLE ai_agents ADD COLUMN thinking BOOLEAN NOT NULL DEFAULT FALSE`);
        console.log('[DB] 添加thinking字段成功');
      }
    } catch (err: any) {
      if (err.code !== '42701') console.error('[DB] 添加thinking字段失败:', err.message);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
        session_id VARCHAR(50) NOT NULL DEFAULT 'default',
        role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_agents_user_id ON ai_agents(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_conversations_agent_session ON ai_conversations(agent_id, session_id)`);

    // 公告表
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        target VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'new_users')),
        duration_hours INT NOT NULL DEFAULT 24,
        frequency INT NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 聊天消息表（持久化存储）
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id VARCHAR(50) NOT NULL,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'text',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`);

    console.log('[DB] 数据库表初始化完成');
  } finally {
    client.release();
  }
}

export { pool };
