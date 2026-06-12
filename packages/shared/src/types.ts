// ==================== 用户相关 ====================

export interface UserProfile {
  id: string;
  avatar: string;
  nickname: string;
  realName: string;
  gender: 'male' | 'female';
  birthDate: string; // YYYY-MM-DD
  age: number;
  province: string;
  city: string;
  wechatId: string;
  bio: string;
  createdAt: number;
}

export interface UserProfileInput {
  avatar: string;
  nickname: string;
  realName: string;
  gender: 'male' | 'female';
  birthDate: string;
  province: string;
  city: string;
  wechatId: string;
  bio: string;
}

// ==================== 匹配筛选 ====================

export interface MatchFilters {
  province?: string;
  city?: string;
  minAge?: number;
  maxAge?: number;
  gender?: 'male' | 'female';
}

// ==================== 会话相关 ====================

export interface ChatSession {
  id: string;
  userA: string;
  userB: string;
  startedAt: number;
  endsAt: number;
  status: 'active' | 'ended' | 'disconnected';
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  content: string;
  type: 'text' | 'emoji';
  timestamp: number;
}

export interface PartnerInfo {
  id: string;
  nickname: string;
  avatar: string;
  gender: 'male' | 'female';
  age: number;
  province: string;
  city: string;
  bio: string;
  wechatId?: string; // 仅当对方开启展示时
}

// ==================== 匹配历史 ====================

export interface MatchRecord {
  id: string;
  userId: string;
  partnerId: string;
  partnerNickname: string;
  partnerCity: string;
  matchedAt: number;
}

// ==================== 举报 ====================

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: 'harassment' | 'advertising' | 'fraud' | 'other';
  description?: string;
  createdAt: number;
}

// ==================== Socket 事件 ====================

export interface ServerToClientEvents {
  'match:success': (data: { sessionId: string; partner: PartnerInfo }) => void;
  'match:failed': (data: { reason: string }) => void;
  'match:waiting': () => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:timer': (data: { remaining: number }) => void;
  'chat:end': (data: { reason: 'timeout' | 'left' | 'disconnected' }) => void;
  'chat:partner_wechat': (data: { visible: boolean; wechatId?: string }) => void;
  'system:partner_left': () => void;
  'system:error': (data: { message: string }) => void;
  'admin:stats': (data: { onlineCount: number; matchingCount: number; activeSessions: number }) => void;
  'admin:stress_progress': (data: { step: string; progress: number; total: number; success: number; failed: number }) => void;
  'admin:stress_complete': (data: { total: number; success: number; failed: number; avgTime: number; maxTime: number }) => void;
  'admin:auth_success': () => void;
}

export interface ClientToServerEvents {
  'profile:update': (profile: UserProfileInput, callback: (result: { success: boolean; userId?: string; error?: string }) => void) => void;
  'match:request': (filters: MatchFilters, callback: (result: { success: boolean; error?: string }) => void) => void;
  'match:cancel': () => void;
  'chat:message': (data: { content: string; type: 'text' | 'emoji'; sessionId?: string }) => void;
  'chat:toggle_wechat': (visible: boolean) => void;
  'chat:exit': () => void;
  'heartbeat': () => void;
  'admin:get_stats': () => void;
  'admin:stress_test': (config: { concurrent: number; duration: number }) => void;
  'admin:auth': (token: string) => void;
}

export interface SocketData {
  userId?: string;
  profile?: UserProfile;
  currentSession?: string;
  isMatching?: boolean;
  sessionTimer?: ReturnType<typeof setInterval>;
  sessionTimerCleared?: boolean;
  isAdmin?: boolean;
}
