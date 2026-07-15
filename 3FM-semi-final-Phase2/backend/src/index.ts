// 3FM Backend - Full-stack deployment with real-time Socket.io support
import express, { Application } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import { exec } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

import qrcode from 'qrcode-terminal';
import authRoutes from './routes/auth';
import seedAllRoutes from './routes/seed-all';
import influencerImportRoutes from './routes/influencer-import';
import influencerRoutes from './routes/influencers';
import brandRoutes from './routes/brands';
import campaignRoutes from './routes/campaigns';
import roasterRoutes from './routes/roaster';
import pitchRoutes from './routes/pitches';
import settingsRoutes from './routes/settings';
import adminRoutes from './routes/admin';
import assignmentRoutes from './routes/assignments';
import dmRoutes from './routes/dm';
import groupRoutes from './routes/groups';
import activityLogRoutes from './routes/activityLog';
import { setIo } from './routes/activityLog';
import analyticsRoutes from './routes/analytics';
import notificationRoutes from './routes/notifications';
import accountsRoutes from './routes/accounts';
import invoiceRoutes from './routes/invoices';
import searchRoutes from './routes/search';
import qrRoutes from './routes/qr';
import broadcastRoutes from './routes/broadcasts';
import templateRoutes from './routes/templates';
import creatorPortalRoutes from './routes/creatorPortal';

dotenv.config();

const prisma = new PrismaClient();
const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  transports: ['websocket', 'polling'], // Support both WebSocket and HTTP polling
  cors: {
    origin: '*', // Allow all origins for network access
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  // Handle ngrok and other reverse proxy scenarios
  trustProxy: true,
  allowEIO3: true, // Compatibility with older Socket.IO clients
});

const PORT = Number(process.env.PORT) || 80;

// Make io accessible to routes
app.set('io', io);
setIo(io);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true
}));
app.use(express.json());

// Serve uploaded files statically — force inline display so PDFs open in the browser
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Type', 'application/pdf');
    }
  },
}));

// Add request logging middleware for debugging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/seed', seedAllRoutes);
app.use('/api/import', influencerImportRoutes);
app.use('/api/influencers', influencerRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/roaster', roasterRoutes);
app.use('/api/pitches', pitchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/activity', activityLogRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/announcement-templates', templateRoutes);
app.use('/api/creator-portal', creatorPortalRoutes);

// Serve built React frontend (only if it exists - for local development)
// On production (Render), frontend is served separately from Vercel
const frontendDist = path.join(__dirname, '../../frontend/dist');
try {
  // Try to serve static files - will fail gracefully if frontend doesn't exist
  app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  // Catch-all: let React Router handle all non-API routes
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) {
        // Frontend not found - just return empty response
        res.status(404).json({ error: 'Not Found' });
      }
    });
  });
} catch (err) {
  console.log('⚠️ Frontend not found - running in API-only mode');
}

// ── In-memory presence store ──────────────────────────────────────────────────
const presenceMap = new Map<string, {
  userId: string;
  userName: string;
  socketId: string;
  page: string;
  action: string;
  lastSeen: number;
}>();

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove presence by socketId
    for (const [userId, entry] of presenceMap.entries()) {
      if (entry.socketId === socket.id) {
        presenceMap.delete(userId);
        break;
      }
    }
    io.emit('presence:changed', Array.from(presenceMap.values()));
  });

  // ── Room registration ───────────────────────────────────────────────────────
  // Join personal room (userId) so events are sent only to that user's devices
  socket.on('join', (userId: string) => {
    socket.join(userId);
  });

  // Join a group room so group messages are sent only to group members
  socket.on('join-group', (groupId: string) => {
    socket.join(`group:${groupId}`);
  });

  socket.on('leave-group', (groupId: string) => {
    socket.leave(`group:${groupId}`);
  });

  // Join an assignment chat room (both participants join)
  socket.on('join-assignment', (assignmentId: string) => {
    socket.join(`assignment:${assignmentId}`);
  });

  // ── Presence tracking ──────────────────────────────────────────────────────
  socket.on('presence:update', (data: { userId: string; userName: string; page: string; action: string }) => {
    presenceMap.set(data.userId, {
      ...data,
      socketId: socket.id,
      lastSeen: Date.now(),
    });
    io.emit('presence:changed', Array.from(presenceMap.values()));
  });

  socket.on('presence:heartbeat', (data: { userId: string }) => {
    const existing = presenceMap.get(data.userId);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.socketId = socket.id;
    }
  });

  socket.on('presence:request', () => {
    socket.emit('presence:changed', Array.from(presenceMap.values()));
  });

  // ── Typing relays (use socket.to so sender doesn't receive own events) ──────
  socket.on('dm:typing', (data: { conversationId: string; recipientId: string }) => {
    socket.to(data.recipientId).emit(`dm:typing:${data.recipientId}`, { conversationId: data.conversationId });
  });

  socket.on('dm:stop_typing', (data: { conversationId: string; recipientId: string }) => {
    socket.to(data.recipientId).emit(`dm:stop_typing:${data.recipientId}`, { conversationId: data.conversationId });
  });

  socket.on('group:typing', (data: { groupId: string; userId: string; userName: string }) => {
    socket.to(`group:${data.groupId}`).emit(`group:typing:${data.groupId}`, { userId: data.userId, userName: data.userName });
  });

  socket.on('group:stop_typing', (data: { groupId: string; userId: string }) => {
    socket.to(`group:${data.groupId}`).emit(`group:stop_typing:${data.groupId}`, { userId: data.userId });
  });
});

// ─── Auto-seed database if empty ───────────────────────────────────────────
async function autoSeedDatabase() {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('\n🌱 Database is empty. Starting auto-seed...\n');

      const seedUsers = [
        { name: 'Harshal Mehta', password: 'HarshalM@3fm26', designation: 'Intern - Influencer Marketing', role: 'EMPLOYEE' },
        { name: 'Deep Shah', password: 'DeepS@3fm26', designation: 'Founder', role: 'ADMIN' },
        { name: 'Varun Ramamchandran', password: 'VarunR@3fm26', designation: 'Lead - Corporate Partnerships & Growth', role: 'ADMIN' },
      ];

      const bcrypt = await import('bcrypt');
      for (const u of seedUsers) {
        const hashed = await bcrypt.default.hash(u.password, 10);
        await prisma.user.create({
          data: {
            name: u.name,
            password: hashed,
            designation: u.designation,
            role: u.role,
            email: null,
            phone: null,
          },
        });
        console.log(`  ✅ Created: ${u.name} [${u.role}]`);
      }
      console.log('\n✨ Auto-seed complete!\n');
    } else {
      console.log(`\n✅ Database has ${userCount} users. Skipping auto-seed.\n`);
    }
  } catch (err) {
    console.error('⚠️ Auto-seed failed (continuing anyway):', err instanceof Error ? err.message : err);
  }
}

httpServer.listen(PORT, '0.0.0.0', async () => {
  // Run auto-seed before server starts accepting connections
  await autoSeedDatabase();
  const nets = os.networkInterfaces();

  // Find the real LAN IP — skip virtual/loopback adapters (VMware, VirtualBox, Docker, Hyper-V)
  const virtualKeywords = ['vmware', 'virtualbox', 'hyper-v', 'docker', 'vethernet', 'loopback', 'teredo', 'isatap', 'npcap'];
  let networkIP = 'unknown';
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    if (virtualKeywords.some((kw) => name.toLowerCase().includes(kw))) continue;
    const ipv4 = addrs.find((a) => a.family === 'IPv4' && !a.internal);
    if (ipv4) { networkIP = ipv4.address; break; }
  }
  // Fallback to any non-internal IPv4 if filtering removed everything
  if (networkIP === 'unknown') {
    networkIP = Object.values(nets).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address || 'unknown';
  }

  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${networkIP}:${PORT}  ← use this on Android`);
  console.log(`\n   Scan to open on your phone:`);
  qrcode.generate(`http://${networkIP}`, { small: true });
  console.log();


  // Windows: auto-add firewall rule so the phone can reach the server
  if (process.platform === 'win32') {
    exec(`netsh advfirewall firewall add rule name="3FM HTTP" dir=in action=allow protocol=TCP localport=${PORT}`, () => {});
  }

});
