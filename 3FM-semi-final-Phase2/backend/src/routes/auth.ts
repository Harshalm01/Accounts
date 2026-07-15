import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendPaymentReminderEmail } from '../services/emailService';

const router = Router();
const prisma = new PrismaClient();

// Register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  // Signup is temporarily disabled
  res.status(403).json({ error: 'Signup is currently disabled. Contact your admin.' });
  return;
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

// Seed proper users from company data
router.all('/seed-users', async (req: Request, res: Response): Promise<void> => {
  try {
    const seedUsers = [
      // ADMINS
      { name: 'Ishika Dhakan',      password: 'IshikaD@3fm26', designation: 'Head - People & Culture',                 role: 'ADMIN' },
      { name: 'Deep Shah',          password: 'DeepS@3fm26',   designation: 'Founder',                                 role: 'ADMIN' },
      { name: 'Rahil Shah',         password: 'RahilS@3fm26',  designation: 'Founder',                                 role: 'ADMIN' },
      { name: 'Shubh Shah',         password: 'ShubhS@3fm26',  designation: 'Founder',                                 role: 'ADMIN' },
      { name: 'Harsh Shah',         password: 'HarshS@3fm26',  designation: 'Founder',                                 role: 'ADMIN' },
      // AGENCY HEADS
      { name: 'Varun Ramamchandran', password: 'VarunR@3fm26', designation: 'Lead - Corporate Partnerships & Growth', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Abhishek Dulani', password: 'AhbishekD@3fm26', designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
      { name: 'Priya Vasani',    password: 'PriyaV@3fm26',    designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
      { name: 'Jhalak Tated',    password: 'JhalakT@3fm26',   designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
      { name: 'Bhumisha Rajgar', password: 'BhumishaR@3fm26', designation: 'Visual Head',         role: 'AGENCY', canAccessAccounts: true },
      { name: 'Riti Tated',      password: 'RitiT@3fm26',     designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
      { name: 'Shweta Shinde',   password: 'ShwetaS@3fm26',   designation: 'Accountant',          role: 'AGENCY', canAccessAccounts: true, canApprovePayments: true },
      { name: 'Moiz Shaikh',     password: 'MoizS@3fm26',     designation: 'Sr Account Manager',  role: 'AGENCY', canAccessAccounts: true },
      { name: 'Hem Joshi',       password: 'HemJ@3fm26',      designation: 'Sr Account Manager',  role: 'AGENCY', canAccessAccounts: true },
      { name: 'Deepak Lokhande', password: 'DeepakL@3fm26',   designation: 'Jr. Accountant',      role: 'AGENCY', canAccessAccounts: true, canApprovePayments: true },
      { name: 'Sanjana Mehta',   password: 'SanjanaM@3fm26',  designation: 'Jr. Talent Manager',  role: 'AGENCY', canAccessAccounts: true },
      // EMPLOYEES (sample)
      { name: 'Siddhi Gala',         password: 'SiddhiG@3fm26',   designation: 'Jr. Account Manager',                      role: 'EMPLOYEE' },
      { name: 'Navya Jain',          password: 'NavyaJ@3fm26',    designation: 'Account Executive - Visuals',              role: 'EMPLOYEE' },
      { name: 'Harshal Mehta',       password: 'HarshalM@3fm26',  designation: 'Intern - Influencer Marketing',            role: 'EMPLOYEE' },
      { name: 'Dhruven Gosia',       password: 'DhruvenG@3fm26',  designation: 'Intern - Influencer Marketing',            role: 'EMPLOYEE' },
    ];

    let created = 0;
    let updated = 0;

    for (const u of seedUsers) {
      const existing = await prisma.user.findFirst({
        where: { name: { equals: u.name, mode: 'insensitive' } },
      });

      const hashed = await bcrypt.hash(u.password, 10);

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            password: hashed,
            designation: u.designation,
            role: u.role,
            canAccessAccounts: (u as any).canAccessAccounts ?? false,
            canApprovePayments: (u as any).canApprovePayments ?? false,
          },
        });
        updated++;
      } else {
        await prisma.user.create({
          data: {
            name: u.name,
            password: hashed,
            designation: u.designation,
            role: u.role,
            email: null,
            phone: null,
            canAccessAccounts: (u as any).canAccessAccounts ?? false,
            canApprovePayments: (u as any).canApprovePayments ?? false,
          },
        });
        created++;
      }
    }

    res.json({
      message: '✅ Database seeded successfully!',
      summary: {
        created,
        updated,
        total: seedUsers.length,
        admins: 5,
        agency_heads: 11,
        employees_sample: 4,
      },
      sample_credentials: [
        { name: 'Deep Shah', password: 'DeepS@3fm26', role: 'ADMIN' },
        { name: 'Varun Ramamchandran', password: 'VarunR@3fm26', role: 'AGENCY' },
        { name: 'Harshal Mehta', password: 'HarshalM@3fm26', role: 'EMPLOYEE' },
      ],
    });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed database', details: String(err) });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier: rawIdentifier, password } = req.body;
    const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : rawIdentifier;
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
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      // Log failed login attempt
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          email: user.email || user.phone || user.name || identifier,
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
        email: user.email || user.phone || user.name || identifier,
        ipAddress,
        userAgent,
        status: 'success',
      },
    }).catch(err => console.error('Failed to log login attempt:', err));

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: '7d',
    });

    res.json({
      user: { id: user.id, email: user.email, phone: user.phone, name: user.name, role: user.role, designation: user.designation, themePreference: user.themePreference, onboardingCompleted: user.onboardingCompleted, canAccessAccounts: user.canAccessAccounts, canApprovePayments: user.canApprovePayments, credits: user.credits, createdAt: user.createdAt },
      token,
    });

    // Fire-and-forget: send payment reminder on Wed/Thu login for heads
    if (user.canAccessAccounts && !user.canApprovePayments) {
      sendLoginPaymentReminder(user.id, req.app.get('io')).catch(() => {});
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Log logout event
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        email: user.email || user.phone || user.name || 'unknown',
        ipAddress,
        userAgent,
        status: 'logout',
      },
    }).catch(err => console.error('Failed to log logout:', err));

    res.json({ message: 'Logged out successfully' });
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
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, themePreference: true, onboardingCompleted: true, canAccessAccounts: true, canApprovePayments: true, credits: true, createdAt: true },
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
    const { name, email, phone, designation, themePreference } = req.body;

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

    // Only update fields that were explicitly provided (not undefined)
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name || null;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (designation !== undefined) updateData.designation = designation || null;
    if (themePreference) updateData.themePreference = themePreference;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: { id: true, email: true, phone: true, name: true, role: true, designation: true, themePreference: true, onboardingCompleted: true, canAccessAccounts: true, canApprovePayments: true, credits: true, createdAt: true },
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

    // Only ADMIN can change their own password; EMPLOYEE/AGENCY must have admin reset it
    if (user.role === 'EMPLOYEE' || user.role === 'AGENCY') {
      res.status(403).json({ error: 'Only admins can change passwords. Contact your admin.' });
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

// Mark onboarding as complete
router.put('/onboarding-complete', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { onboardingCompleted: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send payment reminder to heads on Wednesday/Thursday login
async function sendLoginPaymentReminder(userId: string, io: any) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay(); // 0=Sun, 3=Wed, 4=Thu

  let title: string, body: string;
  if (day === 3) {
    title = 'Payment Sheet Reminder';
    body = 'Tomorrow (Thursday) is payment sheet upload day. Please prepare your payment sheets.';
  } else if (day === 4) {
    title = 'Upload Payment Sheet Today';
    body = 'Today is Thursday — please upload your payment sheets.';
  } else {
    return;
  }

  // Check if reminder already sent today (avoid duplicates on repeat logins)
  const startOfDay = new Date(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);

  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'PAYMENT_REMINDER',
      createdAt: { gte: startOfDayUTC },
    },
  });

  if (existing) return;

  const notification = await prisma.notification.create({
    data: { userId, type: 'PAYMENT_REMINDER', title, body, entityType: 'PaymentSheet' },
  });

  io?.to(userId).emit(`notification:new:${userId}`, {
    id: notification.id, title, body, type: 'PAYMENT_REMINDER',
  });

  // Also send email reminder
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (user?.email) {
    sendPaymentReminderEmail(user.email, user.name || 'User', title, body).catch(() => {});
  }
}

export default router;
