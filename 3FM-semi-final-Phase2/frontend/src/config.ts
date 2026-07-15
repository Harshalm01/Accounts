// Production configuration - Render backend connection
// Use the VITE_API_URL environment variable if available, otherwise use the Render backend URL
// Falls back to current origin for Vite proxy on localhost
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? window.location.origin
    : 'https://threefolksmedia1.onrender.com');
