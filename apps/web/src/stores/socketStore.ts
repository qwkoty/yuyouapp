import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';

export let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

interface SocketState {
  connected: boolean;
  connecting: boolean;
  connect: () => void;
  disconnect: () => void;
}

// 自动检测 Socket.IO 服务器地址
function getSocketUrl(): string {
  // 生产环境：使用当前域名
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    // 如果前端和后端在同一域名下，使用当前域名
    return `${protocol}//${host}`;
  }
  return 'http://localhost:3001';
}

export const useSocketStore = create<SocketState>((set) => ({
  connected: false,
  connecting: false,
  connect: () => {
    if (socket?.connected) return;
    if (socket) {
      socket.connect();
      return;
    }

    set({ connecting: true });
    const url = getSocketUrl();
    socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      set({ connected: true, connecting: false });
      console.log('[Socket] 已连接');
    });

    socket.on('disconnect', () => {
      set({ connected: false });
      console.log('[Socket] 已断开');
    });

    socket.on('connect_error', (err) => {
      set({ connected: false, connecting: false });
      console.error('[Socket] 连接错误:', err.message);
    });
  },
  disconnect: () => {
    socket?.disconnect();
    socket = null;
    set({ connected: false });
  },
}));
