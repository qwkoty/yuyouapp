import { Heart } from 'lucide-react';

export default function PageLoader({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary-500/[0.08] blur-3xl animate-pulse-soft" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
          <Heart className="absolute inset-0 m-auto w-6 h-6 text-primary-400 animate-pulse-soft" />
        </div>
        <p className="text-sm text-gray-500 font-medium">{message}</p>
      </div>
    </div>
  );
}
