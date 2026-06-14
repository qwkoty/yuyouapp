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
      setProfile: (profile) => set({ profile }),
      setUserId: (id) => set({ userId: id }),
      updateProfile: async (input) => {
        const data = await api.post<{ success: boolean; user: any }>('/auth/update-profile', { profile: input });
        if (data.success && data.user) {
          const user = data.user;
          const profile: UserProfile = {
            id: user.id,
            avatar: user.avatar,
            nickname: user.nickname,
            realName: user.realName || user.real_name || '',
            gender: user.gender,
            birthDate: input.birthDate,
            province: user.province,
            city: user.city,
            wechatId: user.wechatId || user.wechat_id || '',
            bio: user.bio || '',
            age: user.age,
            createdAt: Date.now(),
          };
          set({ profile, userId: user.id });
        } else {
          throw new Error('更新失败');
        }
      },
    }),
    {
      name: 'yuyou-user',
    }
  )
);
