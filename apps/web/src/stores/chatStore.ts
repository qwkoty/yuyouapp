import { create } from 'zustand';
import type { ChatMessage, PartnerInfo } from '@yuyou/shared';

interface ChatState {
  sessionId: string | null;
  partner: PartnerInfo | null;
  messages: ChatMessage[];
  remainingTime: number;
  wechatVisible: boolean;
  partnerWechatVisible: boolean;
  partnerWechatId: string | null;
  isActive: boolean;
  setSession: (sessionId: string, partner: PartnerInfo) => void;
  addMessage: (msg: ChatMessage) => void;
  setRemainingTime: (t: number) => void;
  setWechatVisible: (v: boolean) => void;
  setPartnerWechat: (visible: boolean, id?: string) => void;
  endChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  partner: null,
  messages: [],
  remainingTime: 88,
  wechatVisible: false,
  partnerWechatVisible: false,
  partnerWechatId: null,
  isActive: false,
  setSession: (sessionId, partner) =>
    set({ sessionId, partner, messages: [], remainingTime: 88, isActive: true, wechatVisible: false, partnerWechatVisible: false, partnerWechatId: null }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setRemainingTime: (t) => set({ remainingTime: t }),
  setWechatVisible: (v) => set({ wechatVisible: v }),
  setPartnerWechat: (visible, id) => set({ partnerWechatVisible: visible, partnerWechatId: id || null }),
  endChat: () =>
    set({ sessionId: null, partner: null, messages: [], isActive: false, remainingTime: 0 }),
}));
