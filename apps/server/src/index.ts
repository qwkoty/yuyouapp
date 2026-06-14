import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { initDB } from './lib/db';
import apiRoutes from './routes/api';
import { registerMatchHandlers } from './sockets/matchHandler';
import { registerChatHandlers } from './sockets/chatHandler';
import { registerAdminHandlers } from './sockets/adminHandler';
import { validateEnv } from './lib/envCheck';
import logger from './lib/logger';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@yuyou/shared';

// 启动校验
validateEnv();

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

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRoutes);

// 请求日志
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    logger.debug('HTTP', `${req.method} ${req.path}`);
  }
  next();
});

// 生产环境：提供静态文件（禁用缓存）
const staticPath = path.join(__dirname, 'web');
app.use(express.static(staticPath, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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
  logger.error('Server', '未捕获错误', err);
  res.status(500).json({ error: '服务器内部错误' });
});

io.on('connection', (socket) => {
  logger.info('Socket', `用户连接: ${socket.id}`);

  registerMatchHandlers(socket);
  registerChatHandlers(socket, io);
  registerAdminHandlers(socket, io);

  socket.on('disconnect', () => {
    logger.info('Socket', `用户断开: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;

async function start() {
  await initDB();
  httpServer.listen(PORT, () => {
    logger.info('Server', `遇友服务器运行在端口 ${PORT}`);
    logger.info('Server', `静态文件目录: ${staticPath}`);
    logger.info('Server', `环境: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch((err) => {
  logger.error('Server', '启动失败', err);
  process.exit(1);
});
