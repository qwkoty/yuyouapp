import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { initDB } from './lib/db';
import apiRoutes from './routes/api';
import { registerMatchHandlers } from './sockets/matchHandler';
import { registerChatHandlers } from './sockets/chatHandler';
import { registerAdminHandlers } from './sockets/adminHandler';
import { verifyToken } from './services/authService';
import { rateLimiters } from './middleware/rateLimit';
import { validateEnv } from './lib/envCheck';
import redis from './lib/redis';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@yuyou/shared';

// 启动时第一时间校验环境变量并初始化密钥（保证后续模块读取到统一值）
validateEnv();

const app = express();
const httpServer = createServer(app);

// 信任反向代理（Render/Nginx），使 req.ip 与限流能拿到真实客户端 IP
app.set('trust proxy', 1);

// CORS 配置：生产环境限制来源
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.CORS_ORIGIN || 'https://yuyou.onrender.com')
  : '*';

const io = new Server<ClientToServerEvents, ServerToClientEvents, any, SocketData>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// ⚡ gzip 压缩所有响应，减小传输体积 ~70%
app.use(compression({ level: 6, threshold: 1024 }));
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// 全局 API 限流
app.use('/api', rateLimiters.api);

app.use('/api', apiRoutes);

// ⚡ 生产环境：静态文件优化缓存策略
// Vite 生成的 assets 文件名带 hash，可以永久缓存
// index.html 不缓存，确保用户拿到最新版本
const staticPath = path.join(__dirname, 'web');
app.use(express.static(staticPath, {
  etag: true,
  lastModified: true,
  maxAge: '7d', // assets 文件缓存 7 天
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML 文件不缓存，确保每次拿到最新版本
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else {
      // 带 hash 的静态资源永久缓存
      res.set('Cache-Control', 'public, max-age=604800, immutable');
    }
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
  },
}));

// 所有非 API 路由返回 index.html（SPA 支持）
app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(staticPath, 'index.html'));
  } else {
    next();
  }
});

// 全局错误处理中间件
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] 未捕获错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    // 允许未认证连接（用于浏览等非实时功能），但标记为未认证
    socket.data.userId = undefined;
    next();
    return;
  }
  const decoded = verifyToken(token);
  if (decoded) {
    socket.data.userId = decoded.userId;
    next();
  } else {
    // Token 无效，拒绝连接
    next(new Error('认证失败，请重新登录'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] 用户连接: ${socket.id}`);

  registerMatchHandlers(socket);
  registerChatHandlers(socket, io);
  registerAdminHandlers(socket, io);

  socket.on('disconnect', () => {
    console.log(`[Socket] 用户断开: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;

// 全局异常处理：记录日志但不退出进程，保证服务可用性
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] 未处理的 Promise 拒绝:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] 未捕获的异常:', err);
  // 不退出进程，仅记录错误，避免 Render 免费服务频繁重启
});

// 优雅关闭：SIGTERM 时先停止接收新连接，等待进行中的请求完成
let isShuttingDown = false;
function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] 收到 ${signal}，开始优雅关闭...`);
  httpServer.close((err) => {
    if (err) console.error('[Server] 关闭 HTTP 服务器出错:', err);
    try { io.close(); } catch (e) { /* ignore */ }
    try { redis.disconnect(); } catch (e) { /* ignore */ }
    console.log('[Server] 已关闭，退出进程');
    process.exit(0);
  });
  // 兜底：10 秒后强制退出，避免 Render 超时强杀
  setTimeout(() => {
    console.error('[Server] 优雅关闭超时，强制退出');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function start() {
  // ⚡ 先启动 HTTP 服务，让健康检查端点立即可用（Render 健康检查宽限期较短）
  // 数据库初始化异步进行，失败则降级运行
  httpServer.listen(PORT, () => {
    console.log(`[Server] 遇友服务器运行在端口 ${PORT}`);
    console.log(`[Server] 静态文件目录: ${staticPath}`);
  });

  // 数据库初始化失败不退出进程，继续启动 HTTP 服务
  // 数据库相关功能会降级（返回 500），但静态资源和健康检查仍可用
  try {
    await initDB();
  } catch (err) {
    console.error('[ERROR] 数据库初始化失败，服务以降级模式启动:', err);
    console.error('[ERROR] 数据库相关功能将不可用，请检查 DATABASE_URL 配置');
  }
}

start().catch((err) => {
  console.error('[FATAL] 服务器启动失败:', err);
});
