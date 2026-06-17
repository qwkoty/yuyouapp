import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, UserProfileInput } from '@yuyou/shared';
import api from '../lib/apiClient';

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
        // ⚡ 改用 apiClient，统一 401 处理 + 自动带 Authorization header
        const data = await api.post<{ success: boolean; user?: any; error?: string }>('/auth/update-profile', { profile: input });

        if (data.success && data.user) {
          const user = data.user;
          const profile: UserProfile = {
            id: user.id,
            avatar: user.avatar,
            nickname: user.nickname,
            realName: user.realName || '',
            gender: user.gender,
            birthDate: user.birthDate || input.birthDate,
            province: user.province,
            city: user.city,
            wechatId: user.wechatId || '',
            bio: user.bio || '',
            age: user.age,
            tags: user.tags || [],
            blockedUsers: user.blockedUsers || [],
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
