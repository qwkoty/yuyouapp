import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ChatMessage } from '@yuyou/shared';
import { getSession, endSession, setWechatVisible, addChatMessage } from '../lib/redis';
import { getUserById } from '../services/userService';
import { generateId } from '../lib/utils';
import { clearSessionTimerSafely } from './matchHandler';
import { checkChatMessage } from '../lib/contentFilter';
import { pool } from '../lib/db';
import type { SocketData } from '@yuyou/shared';

export function registerChatHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>,
  io: any
) {
  const getUserId = () => socket.data.userId;

  // 正在输入
  socket.on('chat:typing', async () => {
    try {
      const userId = getUserId();
      const sessionId = socket.data.currentSession;
      if (!sessionId || !userId) return;

      const session = await getSession(sessionId);
      if (!session || session.status !== 'active') return;

      const partnerId = session.userA === userId ? session.userB : session.userA;
      const partnerSocket = findPartnerSocket(io, sessionId, partnerId);
      if (partnerSocket) {
        partnerSocket.emit('chat:partner_typing');
      }
    } catch (err) {
      console.error('[Chat] chat:typing error:', err);
    }
  });

  // 已读
  socket.on('chat:read', async () => {
    try {
      const userId = getUserId();
      const sessionId = socket.data.currentSession;
      if (!sessionId || !userId) return;

      const session = await getSession(sessionId);
      if (!session || session.status !== 'active') return;

      const partnerId = session.userA === userId ? session.userB : session.userA;
      const partnerSocket = findPartnerSocket(io, sessionId, partnerId);
      if (partnerSocket) {
        partnerSocket.emit('chat:messages_read');
      }
    } catch (err) {
      console.error('[Chat] chat:read error:', err);
    }
  });

  socket.on('chat:message', async (data) => {
    try {
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

      // 内容安全检查
      let content = data.content;
      if (typeof content !== 'string') {
        socket.emit('system:error', { message: '消息格式错误' });
        return;
      }

      const checkResult = checkChatMessage(content);
      if (!checkResult.safe) {
        socket.emit('system:error', { message: checkResult.reason || '消息内容不合规' });
        return;
      }

      const message: ChatMessage = {
        id: generateId(),
        sessionId,
        senderId: userId,
        content,
        type: data.type || 'text',
        timestamp: Date.now(),
        replyTo: data.replyTo,
      };

      await addChatMessage(sessionId, JSON.stringify(message));

      // 持久化到数据库（异步，不阻塞消息发送）
      pool.query(
        `INSERT INTO chat_messages (session_id, sender_id, content, type) VALUES ($1, $2, $3, $4)`,
        [sessionId, userId, content, data.type || 'text']
      ).catch((err) => console.error('[Chat] persist message error:', err));

      io.to(sessionId).emit('chat:message', message);
    } catch (err) {
      console.error('[Chat] chat:message error:', err);
      socket.emit('system:error', { message: '发送消息失败' });
    }
  });

  socket.on('chat:toggle_wechat', async (visible) => {
    try {
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
        } catch (err) {
          console.error('[Chat] getUserById error:', err);
        }
      } else {
        if (partnerSocket) {
          partnerSocket.emit('chat:partner_wechat', { visible: false });
        }
      }
    } catch (err) {
      console.error('[Chat] chat:toggle_wechat error:', err);
    }
  });

  socket.on('chat:exit', async () => {
    try {
      const userId = getUserId();
      const sessionId = socket.data.currentSession;
      if (!sessionId || !userId) return;

      const session = await getSession(sessionId);
      if (!session) return;

      const partnerId = session.userA === userId ? session.userB : session.userA;
      const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

      // 先清理状态再通知，避免通知过程中状态不一致
      socket.leave(sessionId);
      if (partnerSocket) partnerSocket.leave(sessionId);

      socket.data.currentSession = undefined;
      if (partnerSocket) partnerSocket.data.currentSession = undefined;

      clearSessionTimerSafely(socket);
      if (partnerSocket) clearSessionTimerSafely(partnerSocket);

      await endSession(sessionId);

      // 清理完成后再通知
      socket.emit('chat:end', { reason: 'left' });
      if (partnerSocket) {
        partnerSocket.emit('system:partner_left');
        partnerSocket.emit('chat:end', { reason: 'left' });
      }
    } catch (err) {
      console.error('[Chat] chat:exit error:', err);
    }
  });

  // disconnect 只在 chatHandler 中统一处理会话清理
  // matchHandler 中的 disconnect 只负责匹配池清理
  socket.on('disconnect', async () => {
    try {
      const userId = getUserId();
      const sessionId = socket.data.currentSession;
      if (!sessionId || !userId) return;

      const session = await getSession(sessionId);
      if (!session) return;

      const partnerId = session.userA === userId ? session.userB : session.userA;
      const partnerSocket = findPartnerSocket(io, sessionId, partnerId);

      // 先清理状态再通知
      if (partnerSocket) {
        partnerSocket.leave(sessionId);
        partnerSocket.data.currentSession = undefined;
        clearSessionTimerSafely(partnerSocket);
      }

      socket.leave(sessionId);
      socket.data.currentSession = undefined;
      clearSessionTimerSafely(socket);

      await endSession(sessionId);

      // 清理完成后再通知对方
      if (partnerSocket) {
        partnerSocket.emit('system:partner_left');
        partnerSocket.emit('chat:end', { reason: 'disconnected' });
      }
    } catch (err) {
      console.error('[Chat] disconnect error:', err);
    }
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
