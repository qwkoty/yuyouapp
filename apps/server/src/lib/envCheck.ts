// 环境变量启动校验
export function validateEnv() {
  const required: Array<{ key: string; default?: string }> = [
    { key: 'DATABASE_URL' },
    { key: 'REDIS_URL' },
    { key: 'JWT_SECRET', default: 'yuyou-jwt-secret-2024' },
    { key: 'ADMIN_KEY', default: '195674' },
  ];

  const missing: string[] = [];
  for (const r of required) {
    if (!process.env[r.key] && !r.default) {
      missing.push(r.key);
    }
  }

  if (missing.length > 0) {
    console.error(`[FATAL] 缺少必要的环境变量: ${missing.join(', ')}`);
    console.error('请在 .env 文件或 Render Dashboard 中设置');
    process.exit(1);
  }

  // 警告：生产环境使用了默认 JWT_SECRET
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.warn('[WARN] 生产环境使用了默认 JWT_SECRET，强烈建议设置一个强随机值');
  }

  // 警告：生产环境使用了默认 ADMIN_KEY
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_KEY) {
    console.warn('[WARN] 生产环境使用了默认 ADMIN_KEY，强烈建议设置一个强随机值');
  }

  console.log('[OK] 环境变量校验通过');
}
