import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode intentionally double-invokes effects in dev, which closes real-time
// WebSocket connections before they're ready. Disabled for voice agent compatibility.
createRoot(document.getElementById('root')!).render(<App />)
