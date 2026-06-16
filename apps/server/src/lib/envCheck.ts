import crypto from 'node:crypto';

// 环境变量启动校验
// 策略：缺失关键变量时自动生成随机值并警告，不退出进程
// 这样 Render 部署不会因缺少环境变量而失败
export function validateEnv() {
  const required = ['DATABASE_URL', 'REDIS_URL'];
  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(`[WARN] 缺少环境变量: ${missing.join(', ')}`);
    console.error('服务仍会启动，但相关功能可能不可用');
  }

  // JWT_SECRET：未设置则生成随机值（每次重启会变，已登录用户需重新登录）
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[WARN] JWT_SECRET 未设置，已生成临时随机值（重启后已登录用户需重新登录）');
  }

  // ADMIN_KEY：未设置则生成随机值
  if (!process.env.ADMIN_KEY) {
    process.env.ADMIN_KEY = crypto.randomBytes(8).toString('hex');
    console.warn('[WARN] ADMIN_KEY 未设置，已生成临时随机值，请通过环境变量配置');
  }

  console.log('[OK] 环境变量校验通过');
}

// ====================== 统一密钥访问 ======================
// 关键：通过 getter 函数运行时读取 process.env，避免各模块在加载时
// 各自生成不同的随机值导致 HTTP 与 Socket 管理员认证不一致。
// validateEnv() 会在启动时设置 process.env，此处保证懒初始化。

let _adminKey: string | null = null;
let _jwtSecret: string | null = null;

export function getAdminKey(): string {
  if (_adminKey) return _adminKey;
  let key: string;
  if (process.env.ADMIN_KEY) {
    key = process.env.ADMIN_KEY;
  } else {
    // 兜底：validateEnv 未调用时也能工作，并写回 process.env 供其他模块复用
    key = crypto.randomBytes(8).toString('hex');
    process.env.ADMIN_KEY = key;
  }
  _adminKey = key;
  return key;
}

export function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  let secret: string;
  if (process.env.JWT_SECRET) {
    secret = process.env.JWT_SECRET;
  } else {
    secret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = secret;
  }
  _jwtSecret = secret;
  return secret;
}
