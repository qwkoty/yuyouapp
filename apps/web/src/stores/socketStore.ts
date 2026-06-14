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
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    const onConnect = () => {
      console.log('[Socket] 已连接');
      set({ connected: true });

      // 连接成功后，如果有profile就发送profile:update
      const profile = useUserStore.getState().profile;
      if (profile) {
        const token = localStorage.getItem('yuyou-token');
        const profileInput: any = {
          avatar: profile.avatar,
          nickname: profile.nickname,
          realName: profile.realName,
          gender: profile.gender,
          birthDate: profile.birthDate,
          province: profile.province,
          city: profile.city,
          wechatId: profile.wechatId,
          bio: profile.bio,
          token: token || undefined,
        };
        socket?.emit('profile:update', profileInput, (result) => {
          if (result?.success) {
            console.log('[Socket] profile:update 成功');
            socket?.emit('heartbeat');
          } else {
            console.error('[Socket] profile:update 失败:', result?.error);
          }
        });
      }
    };

    const onDisconnect = (reason: string) => {
      console.log('[Socket] 断开:', reason);
      set({ connected: false });
    };

    const onConnectError = (err: Error) => {
      console.error('[Socket] 连接错误:', err.message);
      set({ connected: false });
    };

    const onReconnect = (attemptNumber: number) => {
      console.log('[Socket] 重连成功，尝试次数:', attemptNumber);
      set({ connected: true });

      // 重连后也发送profile:update
      const profile = useUserStore.getState().profile;
      if (profile) {
        const token = localStorage.getItem('yuyou-token');
        const profileInput: any = {
          avatar: profile.avatar,
          nickname: profile.nickname,
          realName: profile.realName,
          gender: profile.gender,
          birthDate: profile.birthDate,
          province: profile.province,
          city: profile.city,
          wechatId: profile.wechatId,
          bio: profile.bio,
          token: token || undefined,
        };
        socket?.emit('profile:update', profileInput, () => {});
      }
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
