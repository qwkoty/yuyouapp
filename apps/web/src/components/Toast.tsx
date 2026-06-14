import { create } from 'zustand';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: ToastType, duration?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = 'info', duration = 3000) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, type, message, duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// 便捷方法
export const toast = {
  success: (msg: string, duration = 3000) => useToastStore.getState().show(msg, 'success', duration),
  error: (msg: string, duration = 4000) => useToastStore.getState().show(msg, 'error', duration),
  info: (msg: string, duration = 3000) => useToastStore.getState().show(msg, 'info', duration),
  warning: (msg: string, duration = 3000) => useToastStore.getState().show(msg, 'warning', duration),
};

const ICONS: Record<ToastType, any> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS: Record<ToastType, string> = {
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  error: 'text-red-400 bg-red-500/10 border-red-500/30',
  info: 'text-primary-400 bg-primary-500/10 border-primary-500/30',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl animate-toast-in ${COLORS[t.type]}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-sm text-white font-medium whitespace-nowrap">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 text-gray-400 hover:text-white transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
