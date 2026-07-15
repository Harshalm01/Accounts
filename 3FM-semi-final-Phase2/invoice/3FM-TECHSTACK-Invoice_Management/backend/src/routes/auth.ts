import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, role, phone } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    if (!phone) {
      res.status(400).json({ error: 'Phone number required' });
      return;
    }

    // Validate Indian phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      res.status(400).json({ error: 'Invalid phone number. Enter a valid 10-digit Indian mobile number.' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) {
      res.status(400).json({ error: 'Phone number already registered' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
        phone,
        role: role || 'AGENCY',
      },
    });

    // Log successful registration/first login
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        status: 'success',
      },
    }).catch(err => console.error('Failed to log registration:', err));

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d',
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, phone: user.phone, name: user.name, role: user.role, designation: user.designation, createdAt: user.createdAt },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Email/phone and password required' });
      return;
    }

    // Detect identifier type: email, phone, or name
    const isEmail = identifier.includes('@');
    const isPhone = /^[6-9]\d{9}$/.test(identifier);

    let user;
    if (isEmail) {
      user = await prisma.user.findUnique({ where: { email: identifier } });
    } else if (isPhone) {
      user = await prisma.user.findUnique({ where: { phone: identifier } });
    } else {
      // Login by name (case-insensitive)
      user = await prisma.user.findFirst({
        where: { name: { equals: identifier, mode: 'insensitive' } },
      });
    }
    
    if (!user) {
      // Log failed login attempt
      await prisma.loginHistory.create({
        data: {
          userId: 'unknown',
          email: identifier,
          ipAddress,
          userAgent,
          status: 'failed',
        },
      }).catch(err => console.error('Failed to log login attempt:', err));

      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      // Log failed login attempt
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          email: user.email,
          ipAddress,
          userAgent,
          status: 'failed',
        },
      }).catch(err => console.error('Failed to log login attempt:', err));

      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Log successful login
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        status: 'success',
      },
    }).catch(err => console.error('Failed to log login attempt:', err));

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d',
    });

    res.json({
      user: { id: user.id, email: user.email, phone: user.phone, name: user.name, role: user.role, designation: user.designation, createdAt: user.createdAt },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get login history for current user
router.get('/login-history', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await prisma.loginHistory.findMany({
      where: { userId: req.userId },
      orderBy: { loginAt: 'desc' },
      take: 50, // Limit to last 50 logins
    });

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all login history (admin only - for now just protected)
router.get('/all-login-history', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await prisma.loginHistory.findMany({
      orderBy: { loginAt: 'desc' },
      take: 100, // Limit to last 100 logins
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, phone, designation } = req.body;

    if (phone) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        res.status(400).json({ error: 'Invalid phone number' });
        return;
      }
    }

    // Check email uniqueness (exclude self, skip if no email)
    if (email) {
      const existingEmail = await prisma.user.findFirst({ where: { email, NOT: { id: req.userId } } });
      if (existingEmail) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    // Check phone uniqueness (exclude self)
    if (phone) {
      const existingPhone = await prisma.user.findFirst({ where: { phone, NOT: { id: req.userId } } });
      if (existingPhone) {
        res.status(400).json({ error: 'Phone number already in use' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name: name || null, email: email || null, phone: phone || null, designation: designation || null },
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, createdAt: true },
    });

    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.put('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashedPassword } });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
