import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { initDB } from './lib/db';
import apiRoutes from './routes/api';
import { registerMatchHandlers } from './sockets/matchHandler';
import { registerChatHandlers } from './sockets/chatHandler';
import { generateId } from './lib/utils';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@yuyou/shared';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, any, SocketData>(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

// 生产环境：提供静态文件
const staticPath = path.join(__dirname, '../../web/dist');
app.use(express.static(staticPath));

// 所有非 API 路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(staticPath, 'index.html'));
  }
});

io.on('connection', (socket) => {
  const userId = generateId();
  socket.data.userId = userId;
  console.log(`[Socket] 用户连接: ${userId}`);

  registerMatchHandlers(socket);
  registerChatHandlers(socket, io);

  socket.on('disconnect', () => {
    console.log(`[Socket] 用户断开: ${userId}`);
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
