import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { attachUserRole, RoleAuthRequest } from '../middleware/roleMiddleware';

const router = Router();
const prisma = new PrismaClient();

let _io: any;
export function setIo(ioInstance: any) { _io = ioInstance; }

export async function logActivity(
  prismaClient: PrismaClient,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityName: string,
  details?: object
) {
  try {
    console.log(`📝 LOGACTIVITY CALLED: ${action} by ${userId}`);

    if (!userId) {
      console.log(`⚠️  Warning: userId is empty, skipping log`);
      return;
    }

    const logData = { userId, action, entityType, entityId, entityName, details: details as any };
    console.log(`📝 Creating log with data:`, JSON.stringify(logData));

    const log = await prismaClient.activityLog.create({
      data: logData,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    console.log(`✅ Activity log created successfully: ${log.id}`);
    _io?.emit('activity:new', log);
  } catch (err) {
    console.error('❌ Activity log error:', err);
  }
}

router.get('/', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;
    const entityType = req.query.entityType as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const where: any = {};
    if (entityType && entityType !== 'Authentication') where.entityType = entityType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        // include the full end day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const loginHistoryWhere: any = {};
    if (startDate || endDate) {
      loginHistoryWhere.loginAt = {};
      if (startDate) loginHistoryWhere.loginAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        loginHistoryWhere.loginAt.lte = end;
      }
    }

    // Fetch activity logs and login history
    const [activityLogs, loginLogs] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      entityType === 'Authentication' || !entityType
        ? prisma.loginHistory.findMany({
            where: loginHistoryWhere,
            include: { user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { loginAt: 'desc' },
          })
        : [],
    ]);

    // Transform login history to match activity log format
    const loginLogEntries = loginLogs.map((log) => ({
      id: log.id,
      action: log.status === 'logout' ? 'Logout' : log.status === 'success' ? 'Login' : 'Failed Login',
      entityType: 'Authentication',
      entityId: log.userId,
      entityName: log.email,
      details: { ipAddress: log.ipAddress, userAgent: log.userAgent },
      createdAt: log.loginAt.toISOString(),
      user: log.user,
    }));

    // Merge and sort by date
    const allLogs = [...activityLogs, ...loginLogEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = allLogs.length;
    const paginatedLogs = allLogs.slice(skip, skip + limit);

    res.json({ logs: paginatedLogs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Failed to fetch activity logs:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Delete logs matching filters (admin only)
router.delete('/', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const entityType = req.query.entityType as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    let count = 0;

    // Handle authentication logs (login history)
    if (entityType === 'Authentication' || !entityType) {
      const loginHistoryWhere: any = {};
      if (startDate || endDate) {
        loginHistoryWhere.loginAt = {};
        if (startDate) loginHistoryWhere.loginAt.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          loginHistoryWhere.loginAt.lte = end;
        }
      }
      const result = await prisma.loginHistory.deleteMany({ where: loginHistoryWhere });
      count += result.count;
    }

    // Handle activity logs (only if not filtering by Authentication type)
    if (entityType !== 'Authentication') {
      const where: any = {};
      if (entityType) where.entityType = entityType;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }
      const result = await prisma.activityLog.deleteMany({ where });
      count += result.count;
    }

    res.json({ deleted: count });
  } catch (error) {
    console.error('Failed to delete logs:', error);
    res.status(500).json({ error: 'Failed to delete logs' });
  }
});

export default router;
