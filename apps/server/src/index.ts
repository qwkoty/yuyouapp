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
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@yuyou/shared';

const app = express();
const httpServer = createServer(app);

// CORS 配置：生产环境限制来源
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.CORS_ORIGIN || 'https://yuyouapp.onrender.com')
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

// ⚠️ 全局异常处理：防止未捕获的 Promise 拒绝和异常导致进程挂起或崩溃
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] 未处理的 Promise 拒绝:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] 未捕获的异常:', err);
  // 给日志刷新时间后退出，避免进程处于不确定状态
  setTimeout(() => process.exit(1), 1000);
});

async function start() {
  try {
    await initDB();
  } catch (err) {
    console.error('[FATAL] 数据库初始化失败，进程退出:', err);
    process.exit(1);
  }
  httpServer.listen(PORT, () => {
    console.log(`[Server] 遇友服务器运行在端口 ${PORT}`);
    console.log(`[Server] 静态文件目录: ${staticPath}`);
  });
}

start().catch((err) => {
  console.error('[FATAL] 服务器启动失败:', err);
  process.exit(1);
});
