import type { Socket } from 'socket.io';
import type { MatchFilters, ClientToServerEvents, ServerToClientEvents } from '@yuyou/shared';
import {
  addToMatchPool,
  removeFromMatchPool,
  getMatchPoolCandidates,
  createSession,
  getUserSession,
  hasMatchedBefore,
  markMatchedPair,
  setOnline,
  isOnline,
  setOffline,
} from '../lib/redis';
import { getUsersByIds, getUserById, createUser, updateUser } from '../services/userService';
import { addMatchRecord } from '../services/matchService';
import { generateId } from '../lib/utils';
import type { SocketData } from '@yuyou/shared';

interface MatchingEntry {
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>;
  filters: MatchFilters;
  timer: ReturnType<typeof setTimeout> | null;
}

const matchingUsers = new Map<string, MatchingEntry>();

export function registerMatchHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>
) {
  socket.on('profile:update', async (profile, callback) => {
    try {
      let userId = socket.data.userId;
      let user;
      if (userId) {
        user = await updateUser(userId, profile);
      } else {
        user = await createUser(profile);
        userId = user.id;
        socket.data.userId = userId;
      }
      socket.data.profile = user;
      callback({ success: true, userId: user.id });
    } catch (err: any) {
      console.error('[Match] profile:update error:', err);
      callback({ success: false, error: err.message });
    }
  });

  socket.on('match:request', async (filters, callback) => {
    try {
      let profile = socket.data.profile;
      if (!profile && socket.data.userId) {
        const user = await getUserById(socket.data.userId);
        if (user) {
          profile = user;
          socket.data.profile = user;
        }
      }
      if (!profile) {
        callback({ success: false, error: '请先完善个人资料' });
        return;
      }

      const userId = socket.data.userId;
      if (!userId) {
        callback({ success: false, error: '用户未登录' });
        return;
      }

      const existingSession = await getUserSession(userId);
      if (existingSession) {
        callback({ success: false, error: '你当前正在聊天中' });
        return;
      }

      if (socket.data.isMatching) {
        callback({ success: false, error: '正在匹配中，请稍候' });
        return;
      }

      socket.data.isMatching = true;
      matchingUsers.set(userId, { socket, filters, timer: null });

      await setOnline(userId);

      const targetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
      const targetProvince = filters.province || profile.province;

      await addToMatchPool(userId, targetGender, targetProvince, profile.city);

      socket.emit('match:waiting');
      callback({ success: true });

      tryMatch(userId);
    } catch (err: any) {
      console.error('[Match] match:request error:', err);
      callback({ success: false, error: err.message });
    }
  });

  socket.on('match:cancel', async () => {
    try {
      const userId = socket.data.userId;
      if (!userId) return;

      const entry = matchingUsers.get(userId);
      const filters = entry?.filters || {};

      socket.data.isMatching = false;
      cancelMatchTimer(userId);
      matchingUsers.delete(userId);

      const profile = socket.data.profile;
      if (profile) {
        const targetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
        const targetProvince = filters.province || profile.province;
        await removeFromMatchPool(userId, targetGender, targetProvince);
      }
    } catch (err) {
      console.error('[Match] match:cancel error:', err);
    }
  });

  socket.on('heartbeat', async () => {
    try {
      const userId = socket.data.userId;
      if (userId) await setOnline(userId);
    } catch (err) {
      console.error('[Match] heartbeat error:', err);
    }
  });

  socket.on('disconnect', async () => {
    try {
      const userId = socket.data.userId;
      if (!userId) return;

      // 如果正在匹配，清理匹配状态
      if (socket.data.isMatching) {
        const entry = matchingUsers.get(userId);
        const filters = entry?.filters || {};
        socket.data.isMatching = false;
        cancelMatchTimer(userId);
        matchingUsers.delete(userId);

        const profile = socket.data.profile;
        if (profile) {
          const targetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
          const targetProvince = filters.province || profile.province;
          await removeFromMatchPool(userId, targetGender, targetProvince);
        }
      }

      // 如果在聊天中，由 chatHandler 处理会话清理
      // 这里只设置离线
      if (!socket.data.currentSession) {
        await setOffline(userId);
      }
    } catch (err) {
      console.error('[Match] disconnect error:', err);
    }
  });
}

function cancelMatchTimer(userId: string): void {
  const entry = matchingUsers.get(userId);
  if (entry?.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

async function tryMatch(userId: string): Promise<void> {
  const matcher = matchingUsers.get(userId);
  if (!matcher) return;

  const { socket, filters } = matcher;
  const profile = socket.data.profile;
  if (!profile) return;

  const targetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
  const targetProvince = filters.province || profile.province;

  const candidates = await getMatchPoolCandidates(targetGender, targetProvince, userId);

  const validCandidates: string[] = [];
  for (const candidateId of candidates) {
    if (candidateId === userId) continue;
    if (await hasMatchedBefore(userId, candidateId)) continue;
    if (!(await isOnline(candidateId))) continue;

    const candidateMatcher = matchingUsers.get(candidateId);
    if (!candidateMatcher) continue;

    const cProfile = candidateMatcher.socket.data.profile;
    if (!cProfile) continue;

    // 年龄过滤
    if (filters.minAge !== undefined && cProfile.age < filters.minAge) continue;
    if (filters.maxAge !== undefined && cProfile.age > filters.maxAge) continue;
    if (filters.gender && cProfile.gender !== filters.gender) continue;
    // 城市过滤
    if (filters.city && cProfile.city !== filters.city) continue;

    const cFilters = candidateMatcher.filters;
    if (cFilters.minAge !== undefined && profile.age < cFilters.minAge) continue;
    if (cFilters.maxAge !== undefined && profile.age > cFilters.maxAge) continue;
    if (cFilters.gender && profile.gender !== cFilters.gender) continue;
    // 对方的城市过滤
    if (cFilters.city && profile.city !== cFilters.city) continue;

    validCandidates.push(candidateId);
  }

  if (validCandidates.length === 0) {
    const timer = setTimeout(() => tryMatch(userId), 2000);
    const entry = matchingUsers.get(userId);
    if (entry) entry.timer = timer;
    return;
  }

  const chosenId = validCandidates[Math.floor(Math.random() * validCandidates.length)];
  const partnerMatcher = matchingUsers.get(chosenId);
  if (!partnerMatcher) {
    const timer = setTimeout(() => tryMatch(userId), 1000);
    const entry = matchingUsers.get(userId);
    if (entry) entry.timer = timer;
    return;
  }

  // 清除双方的匹配定时器
  cancelMatchTimer(userId);
  cancelMatchTimer(chosenId);

  matchingUsers.delete(userId);
  matchingUsers.delete(chosenId);

  const partnerSocket = partnerMatcher.socket;

  socket.data.isMatching = false;
  partnerSocket.data.isMatching = false;

  const sessionId = generateId();
  await createSession(sessionId, userId, chosenId);
  await markMatchedPair(userId, chosenId);

  // 用各自的 targetGender 和 province 从匹配池移除
  const myTargetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
  const partnerProfile = partnerSocket.data.profile;
  if (!partnerProfile) {
    // 对方资料丢失，重新加入匹配池
    socket.data.isMatching = true;
    matchingUsers.set(userId, { socket, filters, timer: null });
    await addToMatchPool(userId, myTargetGender, targetProvince, profile.city);
    return;
  }
  const partnerTargetGender = partnerMatcher.filters.gender || (partnerProfile.gender === 'male' ? 'female' : 'male');

  await removeFromMatchPool(userId, myTargetGender, filters.province || profile.province);
  await removeFromMatchPool(chosenId, partnerTargetGender, partnerMatcher.filters.province || partnerProfile.province);

  socket.data.currentSession = sessionId;
  partnerSocket.data.currentSession = sessionId;

  socket.join(sessionId);
  partnerSocket.join(sessionId);

  const userProfiles = await getUsersByIds([userId, chosenId]);
  const userAProfile = userProfiles.find(u => u.id === userId);
  const userBProfile = userProfiles.find(u => u.id === chosenId);

  if (!userAProfile || !userBProfile) {
    socket.emit('match:failed', { reason: '匹配失败，请重试' });
    partnerSocket.emit('match:failed', { reason: '匹配失败，请重试' });
    // 清理会话
    socket.leave(sessionId);
    partnerSocket.leave(sessionId);
    socket.data.currentSession = undefined;
    partnerSocket.data.currentSession = undefined;
    return;
  }

  const partnerForA = {
    id: userBProfile.id,
    nickname: userBProfile.nickname,
    avatar: userBProfile.avatar,
    gender: userBProfile.gender,
    age: userBProfile.age,
    province: userBProfile.province,
    city: userBProfile.city,
    bio: userBProfile.bio,
  };

  const partnerForB = {
    id: userAProfile.id,
    nickname: userAProfile.nickname,
    avatar: userAProfile.avatar,
    gender: userAProfile.gender,
    age: userAProfile.age,
    province: userAProfile.province,
    city: userAProfile.city,
    bio: userAProfile.bio,
  };

  socket.emit('match:success', { sessionId, partner: partnerForA });
  partnerSocket.emit('match:success', { sessionId, partner: partnerForB });

  await addMatchRecord(userId, chosenId, userBProfile.nickname, userBProfile.city);
  await addMatchRecord(chosenId, userId, userAProfile.nickname, userAProfile.city);

  startSessionTimer(sessionId, socket, partnerSocket);
}

function startSessionTimer(
  sessionId: string,
  socketA: Socket,
  socketB: Socket
): void {
  const startTime = Date.now();
  const duration = 88 * 1000;

  const timer = setInterval(async () => {
    try {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));

      socketA.emit('chat:timer', { remaining });
      socketB.emit('chat:timer', { remaining });

      if (remaining <= 0) {
        clearInterval(timer);
        await endSessionByTimer(sessionId, socketA, socketB);
      }
    } catch (err) {
      console.error('[Match] session timer error:', err);
      clearInterval(timer);
    }
  }, 1000);

  // 两个 socket 引用同一个 timer，清理时只需 clearInterval 一次
  socketA.data.sessionTimer = timer;
  socketB.data.sessionTimer = timer;
  // 标记是否已清理，防止重复 clearInterval
  socketA.data.sessionTimerCleared = false;
  socketB.data.sessionTimerCleared = false;
}

export function clearSessionTimerSafely(socket: Socket): void {
  if (socket.data.sessionTimer && !socket.data.sessionTimerCleared) {
    clearInterval(socket.data.sessionTimer);
    socket.data.sessionTimerCleared = true;
    // 同步标记对方也已清理
    socket.data.sessionTimer = undefined;
  }
}

async function endSessionByTimer(sessionId: string, socketA: Socket, socketB: Socket): Promise<void> {
  try {
    const { endSession, setSessionStatus } = await import('../lib/redis');

    socketA.emit('chat:end', { reason: 'timeout' });
    socketB.emit('chat:end', { reason: 'timeout' });

    socketA.leave(sessionId);
    socketB.leave(sessionId);

    socketA.data.currentSession = undefined;
    socketB.data.currentSession = undefined;

    await setSessionStatus(sessionId, 'ended');
    await endSession(sessionId);
  } catch (err) {
    console.error('[Match] endSessionByTimer error:', err);
  }
}
