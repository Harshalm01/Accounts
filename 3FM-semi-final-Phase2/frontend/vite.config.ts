import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying for Socket.IO
      },
    },
    // Configure HMR for ngrok tunnels and remote access
    hmr: process.env.VITE_HMR_HOST ? {
      protocol: 'wss',
      host: process.env.VITE_HMR_HOST,
      port: parseInt(process.env.VITE_HMR_PORT || '443'),
    } : undefined,
    // Allow all origins
    middlewareMode: false,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok.io',
      '.ngrok-free.app',
      '.ngrok-free.dev',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-socket': ['socket.io-client'],
          'vendor-pdf': ['jspdf'],
        },
      },
    },
  },
})
