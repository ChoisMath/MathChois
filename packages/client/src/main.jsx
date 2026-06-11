import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css';
import './index.css'
import App from './App.jsx'
import { setupSwAutoUpdate } from './lib/swUpdate.js'

// StrictMode는 Excalidraw 내부 class 컴포넌트와 호환되지 않아 제거
createRoot(document.getElementById('root')).render(<App />)

// PWA Service Worker 등록 + 새 배포 자동 반영 — production 빌드에서만
// dev 모드에서는 Vite HMR과 간섭 피하기 위해 등록하지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    setupSwAutoUpdate();
  });
}
