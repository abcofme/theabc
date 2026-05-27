import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Указываем базовый путь для корректного поиска ассетов на GitHub Pages
  base: '/theabc/', 
  plugins: [
    react(),
    tailwindcss(),
  ],
})