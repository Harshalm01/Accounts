import express, { Application } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import authRoutes from './routes/auth';
import influencerRoutes from './routes/influencers';
import brandRoutes from './routes/brands';
import campaignRoutes from './routes/campaigns';
import roasterRoutes from './routes/roaster';
import pitchRoutes from './routes/pitches';
import settingsRoutes from './routes/settings';
import adminRoutes from './routes/admin';
import assignmentRoutes from './routes/assignments';
import invoiceRoutes from './routes/invoices';

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for network access
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const PORT = process.env.PORT || 3000;

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));
app.use(express.json());

// Add request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/influencers', influencerRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/roaster', roasterRoutes);
app.use('/api/pitches', pitchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/invoices', invoiceRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Example event handlers
  socket.on('message', (data) => {
    console.log('Message received:', data);
    io.emit('message', data); // Broadcast to all clients
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const networkIP = Object.values(nets).flat().find(n => n && n.family === 'IPv4' && !n.internal)?.address || 'unknown';
  console.log(`Server running on port ${PORT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${networkIP}:${PORT}`);
});
