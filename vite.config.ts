import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://whatsek.com',
        changeOrigin: true,
        secure: true,
        headers: {
          'Host': 'whatsek.com',
          'Origin': 'https://whatsek.com',
          'Referer': 'https://whatsek.com/',
        },
      },
      '/uploads': {
        target: 'https://whatsek.com',
        changeOrigin: true,
        secure: true,
        headers: {
          'Host': 'whatsek.com',
          'Origin': 'https://whatsek.com',
          'Referer': 'https://whatsek.com/',
        },
      },
    },
  },
})
