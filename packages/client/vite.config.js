import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { excalidrawPenTweak } from './vite/excalidrawPenTweak.js'

/*
 * 배포마다 dist/sw.js 에 빌드 시각을 주입해 바이트를 바꾼다.
 * sw.js 가 배포 간 동일 바이트면 브라우저가 SW 업데이트 이벤트를 영원히 발생시키지 않아,
 * 설치된 PWA가 새 배포를 감지할 신호가 없다(lib/swUpdate.js 가 이 사이클로 자동 리로드).
 * public/ 복사 이후 시점인 closeBundle 에서 치환한다.
 */
function swBuildVersion() {
  return {
    name: 'sw-build-version',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(import.meta.dirname, 'dist/sw.js')
      if (!fs.existsSync(swPath)) {
        this.warn('[sw-build-version] dist/sw.js 미발견 — PWA 자동 업데이트 버전 주입 실패')
        return
      }
      const source = fs.readFileSync(swPath, 'utf8')
      if (!source.includes('__BUILD_VERSION__')) {
        this.warn('[sw-build-version] __BUILD_VERSION__ 플레이스홀더 미발견 — public/sw.js 확인 필요')
        return
      }
      fs.writeFileSync(swPath, source.replace('__BUILD_VERSION__', new Date().toISOString()))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    excalidrawPenTweak(),
    swBuildVersion(),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
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
          /* Lucide 아이콘: 별도 캐시 */
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
        },
      },
    },
  },
})
