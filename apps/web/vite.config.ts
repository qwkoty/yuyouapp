import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // ⚡ 精细化拆分：将 vendor 拆成更小的 chunk，并行加载更快
        manualChunks: {
          // React 核心（首屏必需，约 140KB → gzip 45KB）
          'react-vendor': ['react', 'react-dom'],
          // React Router（路由，约 30KB）
          'router': ['react-router-dom'],
          // socket.io 延迟加载（仅在需要实时通信的页面才加载）
          'socket': ['socket.io-client'],
          // 图标库按需打包（tree-shaking 后约 26KB）
          'icons': ['lucide-react'],
          // zustand 状态管理（很小，但单独拆分避免重复打包）
          'state': ['zustand'],
        },
      },
    },
  },
});
