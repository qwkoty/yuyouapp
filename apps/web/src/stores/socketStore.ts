import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';

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
    socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('[Socket] 已连接');
      set({ connected: true });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] 断开:', reason);
      set({ connected: false });
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] 连接错误:', err.message);
      set({ connected: false });
    });

    (socket as any).io.on('reconnect', (attemptNumber: number) => {
      console.log('[Socket] 重连成功，尝试次数:', attemptNumber);
      set({ connected: true });
    });

    (socket as any).io.on('reconnect_failed', () => {
      console.error('[Socket] 重连失败');
      set({ connected: false });
    });
  },
  disconnect: () => {
    socket?.disconnect();
    socket = null;
    set({ connected: false });
  },
}));

export { socket };

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}
