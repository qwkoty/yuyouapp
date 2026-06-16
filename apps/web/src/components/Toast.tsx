import { create } from 'zustand';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, type: ToastType, duration?: number) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type, duration = 3000) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string, duration = 3000) =>
    useToastStore.getState().show(message, 'success', duration),
  error: (message: string, duration = 4000) =>
    useToastStore.getState().show(message, 'error', duration),
  info: (message: string, duration = 3000) =>
    useToastStore.getState().show(message, 'info', duration),
  warning: (message: string, duration = 3500) =>
    useToastStore.getState().show(message, 'warning', duration),
};

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

const ACCENT_BARS = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none px-4 w-full max-w-sm">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto relative overflow-hidden flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl border backdrop-blur-xl animate-toast-in shadow-lg shadow-black/30 ${COLORS[t.type]}`}
          >
            {/* 左侧强调条 */}
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${ACCENT_BARS[t.type]}`} />
            <Icon className="w-5 h-5 shrink-0 drop-shadow" />
            <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition rounded-lg p-1 hover:bg-white/10"
              aria-label="关闭"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {/* 底部进度条 */}
            {t.duration > 0 && (
              <span
                className="absolute bottom-0 left-0 h-0.5 opacity-60 toast-progress-bar"
                style={{
                  background: 'currentColor',
                  animationDuration: `${t.duration}ms`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
