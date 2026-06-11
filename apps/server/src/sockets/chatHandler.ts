import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ChatMessage } from '@yuyou/shared';
import { getSession, endSession, setWechatVisible, isWechatVisible, addChatMessage } from '../lib/redis';
import { getUserById } from '../services/userService';
import { generateId } from '../lib/utils';
import type { SocketData } from '@yuyou/shared';

export function registerChatHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  io: any
) {
  const userId = socket.data.userId;

  socket.on('chat:message', async (data) => {
    const sessionId = socket.data.currentSession;
    if (!sessionId) {
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
    const sessionId = socket.data.currentSession;
    if (!sessionId) return;

    const session = await getSession(sessionId);
    if (!session || session.status !== 'active') return;

    await setWechatVisible(sessionId, userId, visible);

    const partnerId = session.userA === userId ? session.userB : session.userA;
    const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

    if (visible) {
      const user = await getUserById(userId);
      if (user && partnerSocket) {
        partnerSocket.emit('chat:partner_wechat', { visible: true, wechatId: user.wechatId });
      }
    } else {
      if (partnerSocket) {
        partnerSocket.emit('chat:partner_wechat', { visible: false });
      }
    }
  });

  socket.on('chat:exit', async () => {
    const sessionId = socket.data.currentSession;
    if (!sessionId) return;

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

    if (socket.data.sessionTimer) {
      clearInterval(socket.data.sessionTimer);
      socket.data.sessionTimer = undefined;
    }
    if (partnerSocket?.data?.sessionTimer) {
      clearInterval(partnerSocket.data.sessionTimer);
      partnerSocket.data.sessionTimer = undefined;
    }

    await endSession(sessionId);
  });

  socket.on('disconnect', async () => {
    const sessionId = socket.data.currentSession;
    if (!sessionId) return;

    const session = await getSession(sessionId);
    if (!session) return;

    const partnerId = session.userA === userId ? session.userB : session.userA;
    const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

    if (partnerSocket) {
      partnerSocket.emit('system:partner_left');
      partnerSocket.emit('chat:end', { reason: 'disconnected' });
      partnerSocket.leave(sessionId);
      partnerSocket.data.currentSession = undefined;
      if (partnerSocket.data.sessionTimer) {
        clearInterval(partnerSocket.data.sessionTimer);
        partnerSocket.data.sessionTimer = undefined;
      }
    }

    socket.leave(sessionId);
    socket.data.currentSession = undefined;
    if (socket.data.sessionTimer) {
      clearInterval(socket.data.sessionTimer);
      socket.data.sessionTimer = undefined;
    }

    await endSession(sessionId);
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
