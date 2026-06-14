import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ChatMessage } from '@yuyou/shared';
import { getSession, endSession, setWechatVisible, addChatMessage } from '../lib/redis';
import { saveChatMessage } from '../services/matchService';
import { getUserById } from '../services/userService';
import { generateId } from '../lib/utils';
import { clearSessionTimerSafely } from './matchHandler';
import type { SocketData } from '@yuyou/shared';

// 聊天消息内容过滤：禁止8位及以上连续数字（防止手机号、微信号等泄露）
function containsBlockedNumbers(content: string): boolean {
  // 匹配8位及以上的连续数字
  const pattern = /\d{8,}/;
  return pattern.test(content);
}

function sanitizeContent(content: string): string {
  // 将8位及以上数字替换为 ***
  return content.replace(/\d{8,}/g, '***');
}

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

      const partnerId = session.userA === userId ? session.userB : session.userA;

      // 内容长度限制
      let content = data.content;
      if (typeof content !== 'string') {
        socket.emit('system:error', { message: '消息格式错误' });
        return;
      }
      if (content.length > 500) {
        content = content.slice(0, 500);
      }

      // 过滤8位及以上数字
      if (containsBlockedNumbers(content)) {
        content = sanitizeContent(content);
      }

      const message: ChatMessage = {
        id: generateId(),
        sessionId,
        senderId: userId,
        content,
        type: data.type || 'text',
        timestamp: Date.now(),
      };

      await addChatMessage(sessionId, JSON.stringify(message));

      // 持久化到数据库
      saveChatMessage(sessionId, userId, partnerId, content, message.type).catch(() => {});

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
