import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    include: ['@excalidraw/excalidraw'],
  },
  build: {
    /* 청크 크기 경고 임계값 (Excalidraw 자체가 크므로 조정) */
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          /* React 계열: 자주 변경되지 않으므로 별도 캐시 가능 */
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-react';
          }
          /* Supabase: 별도 캐시 */
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          /* Lucide 아이콘: 별도 캐시 */
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
        },
      },
    },
  },
})
