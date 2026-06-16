import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';
import { useUserStore } from './userStore';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

interface SocketState {
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  connected: false,
  connect: () => {
    if (socket?.connected) return;
    if (socket) {
      socket.connect();
      return;
    }

    const wsUrl = (import.meta as any).env?.VITE_WS_URL || window.location.origin;
    const token = localStorage.getItem('yuyou-token');
    socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: { token: token || undefined },
      reconnection: true,
      // ⚡ 无限重连，避免 10 次后放弃导致用户卡在断线状态
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    // ⚡ 提取 profile:update 为公共函数，避免 connect 和 reconnect 重复发送
    const sendProfileUpdate = () => {
      const profile = useUserStore.getState().profile;
      if (profile) {
        const tk = localStorage.getItem('yuyou-token');
        socket?.emit('profile:update', {
          avatar: profile.avatar,
          nickname: profile.nickname,
          realName: profile.realName,
          gender: profile.gender,
          birthDate: profile.birthDate,
          province: profile.province,
          city: profile.city,
          wechatId: profile.wechatId,
          bio: profile.bio,
          tags: profile.tags,
          token: tk || undefined,
        } as any, (result: any) => {
          if (result?.success) {
            socket?.emit('heartbeat');
          }
        });
      }
    };

    const onConnect = () => {
      set({ connected: true });
      sendProfileUpdate();
    };

    const onDisconnect = (reason: string) => {
      console.log('[Socket] 断开:', reason);
      set({ connected: false });
    };

    const onConnectError = (err: Error) => {
      console.error('[Socket] 连接错误:', err.message);
      set({ connected: false });
    };

    // ⚡ reconnect 事件不再重复发送 profile:update，因为 connect 事件已经发送了
    const onReconnect = () => {
      set({ connected: true });
    };

    const onReconnectFailed = () => {
      console.error('[Socket] 重连失败');
      set({ connected: false });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    (socket as any).io.on('reconnect', onReconnect);
    (socket as any).io.on('reconnect_failed', onReconnectFailed);
  },
  disconnect: () => {
    if (socket) {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      (socket as any).io?.off('reconnect');
      (socket as any).io?.off('reconnect_failed');
      socket.disconnect();
      socket = null;
    }
    set({ connected: false });
  },
}));

export { socket };

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}
