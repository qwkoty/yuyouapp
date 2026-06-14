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
import { verifyToken } from './services/authService';
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

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRoutes);

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
  console.error('[Server] 未捕获错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      socket.data.userId = decoded.userId;
    }
  }
  next();
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

async function start() {
  await initDB();
  httpServer.listen(PORT, () => {
    console.log(`[Server] 遇友服务器运行在端口 ${PORT}`);
    console.log(`[Server] 静态文件目录: ${staticPath}`);
  });
}

start().catch(console.error);
