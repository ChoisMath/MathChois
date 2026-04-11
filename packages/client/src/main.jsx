import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode는 Excalidraw 내부 class 컴포넌트와 호환되지 않아 제거
createRoot(document.getElementById('root')).render(<App />)

// PWA Service Worker 등록 — production 빌드에서만
// dev 모드에서는 Vite HMR과 간섭 피하기 위해 등록하지 않는다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW 등록 실패는 앱 동작을 막지 않도록 silent
    });
  });
}
