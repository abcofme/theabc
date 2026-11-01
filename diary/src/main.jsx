import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import ThemeProvider from './context/ThemeProvider.jsx'
import './theme.css'
import { isTelegram } from './utils/platform'

// Установленному приложению нужен сервис-воркер: без него Android не предложит установку, а без сети не откроется.
// В Telegram он не нужен
if (!isTelegram && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><ErrorBoundary>
      <App />
    </ErrorBoundary></ThemeProvider>
  </StrictMode>,
)
