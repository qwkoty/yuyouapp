import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';
import { useUserStore } from './userStore';

// ⚠️ socket 是模块级单例，但通过 getSocket() 函数获取最新引用
// 不能直接 export { socket }，因为模块加载时 socket = null，
// 其他模块 import 时拿到的是 null 的绑定，connect 后赋值不会更新引用
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

interface SocketState {
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  connected: false,
  connect: () => {
    // ⚡ 已有 socket 实例时，复用并确保连接
    if (socket) {
      if (!socket.connected) {
        socket.connect();
      }
      return;
    }

    const wsUrl = (import.meta as any).env?.VITE_WS_URL || window.location.origin;
    const token = localStorage.getItem('yuyou-token');
    socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: { token: token || undefined },
      reconnection: true,
      // ⚡ 限制重连次数，避免无限重连耗电；登录后会手动 reconnect
      reconnectionAttempts: 20,
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    (socket as any).io.on('reconnect', () => {
      set({ connected: true });
      sendProfileUpdate();
    });
    (socket as any).io.on('reconnect_failed', () => {
      console.error('[Socket] 重连失败');
      set({ connected: false });
    });
  },
  disconnect: () => {
    if (socket) {
      socket.removeAllListeners();
      (socket as any).io?.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    set({ connected: false });
  },
  // ⚡ 登录后必须调用 reconnect，用新 token 重新建立 socket 连接
  // 旧 socket 实例用的是登录前的 null token，不重连则 socket.data.userId 永远 undefined
  reconnect: () => {
    get().disconnect();
    get().connect();
  },
}));

// ⚡ 统一通过函数获取 socket 实例（推荐用法，语义更清晰）
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}

// ⚡ 同时导出 socket 变量（ES module live binding，函数体内访问拿到最新值）
// 保留是为了兼容现有页面（Match/Chat/AdminTest/ServerStatus）的 import { socket }
export { socket };
