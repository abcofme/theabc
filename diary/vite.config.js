import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Указываем базовый путь
  base: '/', 
  plugins: [
    react(),
    tailwindcss(),
  ],
})