import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Middleware: admin only
async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// GET all users
router.get('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create user
router.post('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, role, designation } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    if (!email && !phone) {
      res.status(400).json({ error: 'At least email or phone is required for login' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    if (phone) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        res.status(400).json({ error: 'Invalid phone number. Enter a valid 10-digit Indian mobile number.' });
        return;
      }
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    if (phone) {
      const existingPhone = await prisma.user.findUnique({ where: { phone } });
      if (existingPhone) {
        res.status(400).json({ error: 'Phone number already in use' });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: email || null,
        password: hashedPassword,
        name: name || null,
        phone: phone || null,
        designation: designation || null,
        role: role || 'EMPLOYEE',
      },
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, createdAt: true },
    });

    res.status(201).json(user);
    const io = (req as any).app.get('io');
    io?.emit('user:created', user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single user with campaign details
router.get('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        designation: true,
        createdAt: true,
        campaigns: {
          select: {
            id: true,
            name: true,
            brandName: true,
            status: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        assignmentsAsHead: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            campaign: {
              select: {
                id: true,
                name: true,
                brandName: true,
                status: true,
                startDate: true,
                endDate: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                name: true,
                designation: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
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

// PUT update user (admin can update name, email, phone, designation, role, and optionally reset password)
router.put('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, phone, designation, role, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (designation !== undefined) updateData.designation = designation;
    if (role !== undefined) updateData.role = role;
    if (password) {
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, createdAt: true },
    });

    res.json({ user: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE user
router.delete('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (id === req.userId) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Delete login history first (foreign key)
    await prisma.loginHistory.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    res.json({ message: 'User deleted successfully' });
    const io = (req as any).app.get('io');
    io?.emit('user:deleted', id);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
