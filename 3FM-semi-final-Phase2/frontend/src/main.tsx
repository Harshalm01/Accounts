import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Production build with Railway backend connection
createRoot(document.getElementById('root')!).render(
  <App />
)
