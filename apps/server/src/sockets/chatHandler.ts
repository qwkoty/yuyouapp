import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ChatMessage } from '@yuyou/shared';
import { getSession, endSession, setWechatVisible, addChatMessage } from '../lib/redis';
import { getUserById } from '../services/userService';
import { generateId } from '../lib/utils';
import { clearSessionTimerSafely } from './matchHandler';
import type { SocketData } from '@yuyou/shared';

export function registerChatHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  io: any
) {
  const getUserId = () => socket.data.userId;

  socket.on('chat:message', async (data) => {
    const userId = getUserId();
    const sessionId = socket.data.currentSession;
    if (!sessionId || !userId) {
      socket.emit('system:error', { message: '不在聊天中' });
      return;
    }

    const session = await getSession(sessionId);
    if (!session || session.status !== 'active') {
      socket.emit('system:error', { message: '会话已结束' });
      return;
    }

    const message: ChatMessage = {
      id: generateId(),
      sessionId,
      senderId: userId,
      content: data.content,
      type: data.type,
      timestamp: Date.now(),
    };

    await addChatMessage(sessionId, JSON.stringify(message));

    io.to(sessionId).emit('chat:message', message);
  });

  socket.on('chat:toggle_wechat', async (visible) => {
    const userId = getUserId();
    const sessionId = socket.data.currentSession;
    if (!sessionId || !userId) return;

    const session = await getSession(sessionId);
    if (!session || session.status !== 'active') return;

    await setWechatVisible(sessionId, userId, visible);

    const partnerId = session.userA === userId ? session.userB : session.userA;
    const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

    if (visible) {
      try {
        const user = await getUserById(userId);
        if (user && partnerSocket) {
          partnerSocket.emit('chat:partner_wechat', { visible: true, wechatId: user.wechatId });
        }
      } catch {
        // ignore
      }
    } else {
      if (partnerSocket) {
        partnerSocket.emit('chat:partner_wechat', { visible: false });
      }
    }
  });

  socket.on('chat:exit', async () => {
    const userId = getUserId();
    const sessionId = socket.data.currentSession;
    if (!sessionId || !userId) return;

    const session = await getSession(sessionId);
    if (!session) return;

    const partnerId = session.userA === userId ? session.userB : session.userA;
    const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

    socket.emit('chat:end', { reason: 'left' });
    if (partnerSocket) {
      partnerSocket.emit('system:partner_left');
      partnerSocket.emit('chat:end', { reason: 'left' });
    }

    socket.leave(sessionId);
    if (partnerSocket) partnerSocket.leave(sessionId);

    socket.data.currentSession = undefined;
    if (partnerSocket) partnerSocket.data.currentSession = undefined;

    clearSessionTimerSafely(socket);
    if (partnerSocket) clearSessionTimerSafely(partnerSocket);

    await endSession(sessionId);
  });

  // disconnect 只在 chatHandler 中统一处理会话清理
  // matchHandler 中的 disconnect 只负责匹配池清理
  socket.on('disconnect', async () => {
    const userId = getUserId();
    const sessionId = socket.data.currentSession;
    if (!sessionId || !userId) return;

    const session = await getSession(sessionId);
    if (!session) return;

    const partnerId = session.userA === userId ? session.userB : session.userA;
    const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

    if (partnerSocket) {
      partnerSocket.emit('system:partner_left');
      partnerSocket.emit('chat:end', { reason: 'disconnected' });
      partnerSocket.leave(sessionId);
      partnerSocket.data.currentSession = undefined;
      clearSessionTimerSafely(partnerSocket);
    }

    socket.leave(sessionId);
    socket.data.currentSession = undefined;
    clearSessionTimerSafely(socket);

    await endSession(sessionId);

    // 断开时设置离线
    const { setOffline } = await import('../lib/redis');
    await setOffline(userId);
  });
}

function findPartnerSocket(io: any, sessionId: string, partnerId: string): Socket | undefined {
  const room = io.sockets.adapter.rooms.get(sessionId);
  if (!room) return undefined;

  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    if (s && s.data.userId === partnerId) {
      return s;
    }
  }
  return undefined;
}
