import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();
const prisma = new PrismaClient();

// Update profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, email, phone } = req.body;

    // Validate phone
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if email is already taken by another user
    const existingEmail = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
    });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Check if phone is already taken by another user
    const existingPhone = await prisma.user.findFirst({
      where: { phone, id: { not: userId } },
    });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already in use' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, email, phone },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    res.json({ user: updatedUser });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
