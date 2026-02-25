import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode는 Excalidraw 내부 class 컴포넌트와 호환되지 않아 제거
createRoot(document.getElementById('root')).render(<App />)
