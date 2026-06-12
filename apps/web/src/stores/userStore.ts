import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, UserProfileInput } from '@yuyou/shared';

interface UserState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile | null) => void;
  updateProfile: (input: UserProfileInput) => Promise<void>;
  userId: string | null;
  setUserId: (id: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: null,
      userId: null,
      setProfile: (profile: UserProfile | null) => set({ profile }),
      setUserId: (id) => set({ userId: id }),
      updateProfile: async (input) => {
        const { socket } = await import('./socketStore');
        const socketInstance = socket;
        if (!socketInstance) throw new Error('未连接服务器');

        return new Promise((resolve, reject) => {
          socketInstance.emit('profile:update', input, (result) => {
            if (result.success && result.userId) {
              const profile: UserProfile = {
                id: result.userId,
                ...input,
                age: calculateAge(input.birthDate),
                createdAt: Date.now(),
              };
              set({ profile, userId: result.userId });
              resolve();
            } else {
              reject(new Error(result.error || '更新失败'));
            }
          });
        });
      },
    }),
    {
      name: 'yuyou-user',
    }
  )
);

function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
