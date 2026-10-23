import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import ThemeProvider from './context/ThemeProvider.jsx'
import './theme.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider><ErrorBoundary>
      <App />
    </ErrorBoundary></ThemeProvider>
  </StrictMode>,
)
