import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
 * Excalidraw 0.18 은 freedraw 외곽선(perfect-freehand) 파라미터를 하드코딩하고 외부로 노출하지 않는다
 * (getFreeDrawSvgPath). 학생 평가 결과 삼성노트/굿노트식 균일 젤펜으로 바꾼다:
 * thinning 0.6 -> 0 (굵기 일정·필압/테이퍼 무효화 -> 둥근 끝) + streamline 0 (입력 직결). smoothing/simulatePressure/easing 등 나머지는 원본.
 * ※ wet-ink 미리보기(lib/wetInkStroke.js PF_BASE)도 동일 값이어야 미리보기=commit 이 된다.
 * 번들된 dist 청크를 빌드 시 치환한다(patch-package 대신 — Dockerfile 이 npm ci --ignore-scripts 라 postinstall 미실행).
 * 패턴은 freedraw 옵션 trio(thinning/smoothing/streamline)에만 앵커되어 다른 streamline 값(레이저 트레일 등)을 건드리지 않는다.
 */
function excalidrawPenTweak() {
  const FREEDRAW_OPTS = /thinning:\s*0?\.6,(\s*)smoothing:\s*0?\.5,(\s*)streamline:\s*0?\.5/
  let applied = 0
  return {
    name: 'excalidraw-pen-tweak',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@excalidraw/excalidraw') || !FREEDRAW_OPTS.test(code)) return null
      applied += 1
      return code.replace(FREEDRAW_OPTS, 'thinning:0,$1smoothing:.5,$2streamline:0')
    },
    buildEnd() {
      if (applied === 0) {
        this.warn('[excalidraw-pen-tweak] freedraw 옵션 패턴 미발견 — Excalidraw 버전 변경 확인 필요(streamline 패치 미적용)')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    excalidrawPenTweak(),
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
