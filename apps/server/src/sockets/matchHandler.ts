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
} from '../lib/redis';
import { getUserById, getUsersByIds } from '../services/userService';
import { addMatchRecord } from '../services/matchService';
import { generateId } from '../lib/utils';
import type { SocketData } from '@yuyou/shared';

const matchingUsers = new Map<string, { socket: Socket; filters: MatchFilters }>();

export function registerMatchHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, any, SocketData>
) {
  const userId = socket.data.userId;

  socket.on('profile:update', async (profile, callback) => {
    try {
      const { createUser, updateUser, getUserById: getUser } = await import('../services/userService');
      let user = await getUser(userId);
      if (user) {
        user = await updateUser(userId, profile);
      } else {
        user = await createUser(profile);
      }
      socket.data.profile = user;
      callback({ success: true, userId: user.id });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('match:request', async (filters, callback) => {
    try {
      const profile = socket.data.profile;
      if (!profile) {
        callback({ success: false, error: '请先完善个人资料' });
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
      matchingUsers.set(userId, { socket, filters });

      await setOnline(userId);

      const targetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
      const targetProvince = filters.province || profile.province;

      await addToMatchPool(userId, targetGender, targetProvince, profile.city);

      socket.emit('match:waiting');
      callback({ success: true });

      tryMatch(userId);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('match:cancel', async () => {
    socket.data.isMatching = false;
    matchingUsers.delete(userId);
    const profile = socket.data.profile;
    if (profile) {
      await removeFromMatchPool(userId, profile.gender === 'male' ? 'female' : 'male', profile.province);
    }
  });

  socket.on('heartbeat', async () => {
    await setOnline(userId);
  });

  socket.on('disconnect', async () => {
    socket.data.isMatching = false;
    matchingUsers.delete(userId);
    const profile = socket.data.profile;
    if (profile) {
      await removeFromMatchPool(userId, profile.gender === 'male' ? 'female' : 'male', profile.province);
    }
  });
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

    if (filters.minAge && cProfile.age < filters.minAge) continue;
    if (filters.maxAge && cProfile.age > filters.maxAge) continue;
    if (filters.gender && cProfile.gender !== filters.gender) continue;

    const cFilters = candidateMatcher.filters;
    if (cFilters.minAge && profile.age < cFilters.minAge) continue;
    if (cFilters.maxAge && profile.age > cFilters.maxAge) continue;
    if (cFilters.gender && profile.gender !== cFilters.gender) continue;

    validCandidates.push(candidateId);
  }

  if (validCandidates.length === 0) {
    setTimeout(() => tryMatch(userId), 2000);
    return;
  }

  const chosenId = validCandidates[Math.floor(Math.random() * validCandidates.length)];
  const partnerMatcher = matchingUsers.get(chosenId);
  if (!partnerMatcher) {
    setTimeout(() => tryMatch(userId), 1000);
    return;
  }

  matchingUsers.delete(userId);
  matchingUsers.delete(chosenId);

  const partnerSocket = partnerMatcher.socket;

  socket.data.isMatching = false;
  partnerSocket.data.isMatching = false;

  const sessionId = generateId();
  await createSession(sessionId, userId, chosenId);
  await markMatchedPair(userId, chosenId);

  await removeFromMatchPool(userId, targetGender, targetProvince);
  await removeFromMatchPool(chosenId, profile.gender, profile.province);

  socket.data.currentSession = sessionId;
  partnerSocket.data.currentSession = sessionId;

  socket.join(sessionId);
  partnerSocket.join(sessionId);

  const [userAProfile, userBProfile] = await getUsersByIds([userId, chosenId]);

  const partnerForA: any = {
    id: userBProfile.id,
    nickname: userBProfile.nickname,
    avatar: userBProfile.avatar,
    gender: userBProfile.gender,
    age: userBProfile.age,
    province: userBProfile.province,
    city: userBProfile.city,
    bio: userBProfile.bio,
  };

  const partnerForB: any = {
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
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));

    socketA.emit('chat:timer', { remaining });
    socketB.emit('chat:timer', { remaining });

    if (remaining <= 0) {
      clearInterval(timer);
      await endSessionByTimer(sessionId, socketA, socketB);
    }
  }, 1000);

  socketA.data.sessionTimer = timer;
  socketB.data.sessionTimer = timer;
}

async function endSessionByTimer(sessionId: string, socketA: Socket, socketB: Socket): Promise<void> {
  const { endSession, setSessionStatus } = await import('../lib/redis');

  socketA.emit('chat:end', { reason: 'timeout' });
  socketB.emit('chat:end', { reason: 'timeout' });

  socketA.leave(sessionId);
  socketB.leave(sessionId);

  socketA.data.currentSession = undefined;
  socketB.data.currentSession = undefined;

  await setSessionStatus(sessionId, 'ended');
  await endSession(sessionId);
}
