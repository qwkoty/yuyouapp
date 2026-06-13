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
        const token = localStorage.getItem('yuyou-token');
        if (!token) throw new Error('未登录');

        const res = await fetch('/api/auth/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, profile: input }),
        });

        const data = await res.json();

        if (data.success && data.user) {
          const user = data.user;
          const profile: UserProfile = {
            id: user.id,
            avatar: user.avatar,
            nickname: user.nickname,
            realName: user.realName || '',
            gender: user.gender,
            birthDate: input.birthDate,
            province: user.province,
            city: user.city,
            wechatId: user.wechatId || '',
            bio: user.bio || '',
            age: user.age,
            createdAt: Date.now(),
          };
          set({ profile, userId: user.id });
        } else {
          throw new Error(data.error || '更新失败');
        }
      },
    }),
    {
      name: 'yuyou-user',
    }
  )
);

// calculateAge moved to authService
