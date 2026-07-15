import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ─── Assign campaign to heads (ADMIN) or employees (AGENCY) ──────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const assignerId = req.userId!;
    const { campaignId, headIds } = req.body as { campaignId: string; headIds: string[] };

    if (!campaignId || !headIds?.length) {
      res.status(400).json({ error: 'campaignId and headIds are required' });
      return;
    }

    const assigner = await prisma.user.findUnique({ where: { id: assignerId } });
    if (!assigner || !['ADMIN', 'AGENCY'].includes(assigner.role)) {
      res.status(403).json({ error: 'Only admins or heads can assign campaigns' });
      return;
    }

    // Upsert each assignment (skip duplicates gracefully)
    const results = await Promise.all(
      headIds.map((headId) =>
        prisma.campaignAssignment.upsert({
          where: { campaignId_headId: { campaignId, headId } },
          create: { campaignId, headId, assignedById: assignerId, status: 'PENDING' },
          update: { status: 'PENDING', assignedById: assignerId },
          include: {
            head: { select: { id: true, name: true, designation: true } },
            campaign: { select: { id: true, name: true } },
            assignedBy: { select: { id: true, name: true } },
          },
        })
      )
    );

    // Real-time: notify each assigned person via socket
    const io = req.app.get('io');
    results.forEach((assignment) => {
    io.to(assignment.headId).emit(`assignment:new:${assignment.headId}`, assignment);
    });
    // Notify campaign details modal to refresh assignments list
    io.emit(`assignment:updated:${campaignId}`);

    // Persist notifications
    await Promise.all(results.map(async (assignment) => {
      try {
        console.log(`💾 Creating persistent notification for assignment ${assignment.id}`);
        const notif = await prisma.notification.create({
          data: {
            userId: assignment.headId,
            type: 'ASSIGNMENT_CREATED',
            title: 'New Campaign Assigned',
            body: `You have been assigned to "${assignment.campaign.name}"`,
            entityType: 'assignment',
            entityId: assignment.id,
          },
        });
        console.log(`✅ Notification created - ID: ${notif.id}, userId: ${assignment.headId}`);
        io.to(assignment.headId).emit(`notification:new:${assignment.headId}`, notif);
      } catch (err) {
        console.error(`❌ Failed to create notification for assignment ${assignment.id}:`, err);
      }
    }));

    res.status(201).json(results);
  } catch (error) {
    console.error('Error creating assignments:', error);
    res.status(500).json({ error: 'Failed to create assignments' });
  }
});

// ─── Get MY assignments (head's notification inbox) ──────────────────────────
router.get('/my', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const assignments = await prisma.campaignAssignment.findMany({
      where: { headId: userId },
      include: {
        campaign: { select: { id: true, name: true, brandName: true, status: true, startDate: true } },
        assignedBy: { select: { id: true, name: true, designation: true } },
        messages: {
          where: { isRead: false, senderId: { not: userId } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = assignments.map((a) => ({
      ...a,
      unreadCount: a.messages.length,
      messages: undefined,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// ─── Get all assignments for a campaign ──────────────────────────────────────
router.get('/campaign/:campaignId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    const assignments = await prisma.campaignAssignment.findMany({
      where: { campaignId },
      include: {
        head: { select: { id: true, name: true, designation: true, role: true } },
        assignedBy: { select: { id: true, name: true } },
        messages: {
          where: { isRead: false },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = assignments.map((a) => ({
      ...a,
      unreadCount: a.messages.length,
      messages: undefined,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching campaign assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// ─── Get assignments given by current admin (admin's notification view) ───────
router.get('/given', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const assignments = await prisma.campaignAssignment.findMany({
      where: { assignedById: userId },
      include: {
        campaign: { select: { id: true, name: true, brandName: true, status: true, startDate: true } },
        head: { select: { id: true, name: true, designation: true } },
        messages: {
          where: { isRead: false, senderId: { not: userId } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = assignments.map((a) => ({
      ...a,
      unreadCount: a.messages.length,
      messages: undefined,
      assignedBy: undefined,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching given assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// ─── List all employees (ADMIN + AGENCY can fetch for assignment picker) ──────
router.get('/employees', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['ADMIN', 'AGENCY'].includes(user.role)) {
      res.status(403).json({ error: 'Access denied' }); return;
    }
    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: { id: true, name: true, designation: true },
      orderBy: { name: 'asc' },
    });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// ─── Employee performance stats (ADMIN + AGENCY only) ────────────────────────
router.get('/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !['ADMIN', 'AGENCY'].includes(user.role)) {
      res.status(403).json({ error: 'Access denied' }); return;
    }

    let employees: { id: string; name: string | null; email: string; designation: string | null }[];

    if (user.role === 'ADMIN') {
      // ADMIN sees ALL employees
      employees = await prisma.user.findMany({
        where: { role: 'EMPLOYEE' },
        select: { id: true, name: true, email: true, designation: true },
        orderBy: { name: 'asc' },
      });
    } else {
      // AGENCY head sees only employees they personally assigned
      const theirAssignments = await prisma.campaignAssignment.findMany({
        where: { assignedById: req.userId },
        select: { head: { select: { id: true, name: true, email: true, designation: true, role: true } } },
        distinct: ['headId'],
      });
      employees = theirAssignments
        .filter((a) => a.head?.role === 'EMPLOYEE')
        .map((a) => ({ id: a.head!.id, name: a.head!.name, email: a.head!.email, designation: a.head!.designation }));
      employees.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    }

    const stats = await Promise.all(employees.map(async (emp) => {
      const whereBase = user.role === 'ADMIN'
        ? { headId: emp.id }
        : { headId: emp.id, assignedById: req.userId! };

      const [total, accepted, rejected, pending, completed] = await Promise.all([
        prisma.campaignAssignment.count({ where: whereBase }),
        prisma.campaignAssignment.count({ where: { ...whereBase, status: 'ACCEPTED' } }),
        prisma.campaignAssignment.count({ where: { ...whereBase, status: 'REJECTED' } }),
        prisma.campaignAssignment.count({ where: { ...whereBase, status: 'PENDING' } }),
        prisma.campaignAssignment.count({ where: { ...whereBase, status: 'ACCEPTED', campaign: { status: 'Completed' } } }),
      ]);
      return { ...emp, total, accepted, rejected, pending, completed };
    }));

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employee stats' });
  }
});

// ─── Head (AGENCY) performance stats — ADMIN only ────────────────────────────
router.get('/head-stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied' }); return;
    }

    const heads = await prisma.user.findMany({
      where: { role: 'AGENCY' },
      select: { id: true, name: true, email: true, designation: true },
      orderBy: { name: 'asc' },
    });

    const stats = await Promise.all(heads.map(async (head) => {
      const [total, accepted, rejected, pending, completed] = await Promise.all([
        prisma.campaignAssignment.count({ where: { headId: head.id } }),
        prisma.campaignAssignment.count({ where: { headId: head.id, status: 'ACCEPTED' } }),
        prisma.campaignAssignment.count({ where: { headId: head.id, status: 'REJECTED' } }),
        prisma.campaignAssignment.count({ where: { headId: head.id, status: 'PENDING' } }),
        prisma.campaignAssignment.count({ where: { headId: head.id, status: 'ACCEPTED', campaign: { status: 'Completed' } } }),
      ]);
      return { ...head, total, accepted, rejected, pending, completed };
    }));

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch head stats' });
  }
});

// ─── Head/Employee responds to assignment (ACCEPTED or REJECTED) ─────────────
router.patch('/:id/respond', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { status } = req.body as { status: 'ACCEPTED' | 'REJECTED' };

    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'status must be ACCEPTED or REJECTED' });
      return;
    }

    const assignment = await prisma.campaignAssignment.findUnique({ where: { id } });
    if (!assignment) { res.status(404).json({ error: 'Assignment not found' }); return; }
    if (assignment.headId !== userId) { res.status(403).json({ error: 'Not your assignment' }); return; }

    const updated = await prisma.campaignAssignment.update({
      where: { id },
      data: { status },
      include: {
        head: { select: { id: true, name: true, designation: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    // Notify admin in real-time
    const io = req.app.get('io');
    io.to(assignment.assignedById).emit(`assignment:responded:${assignment.assignedById}`, updated);
    // Refresh campaign details modal for all viewers
    io.emit(`assignment:updated:${assignment.campaignId}`);
    // If accepted, employee's campaign dashboard should refresh to show the campaign
    if (status === 'ACCEPTED') {
      io.to(assignment.headId).emit(`campaign:accessible:${assignment.headId}`);
    }

    // Persist notification for the assigner
    const responder = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const campaignForNotif = await prisma.campaign.findUnique({ where: { id: assignment.campaignId }, select: { name: true } });
    const notif = await prisma.notification.create({
      data: {
        userId: assignment.assignedById,
        type: 'ASSIGNMENT_RESPONDED',
        title: `Assignment ${status === 'ACCEPTED' ? 'Accepted' : 'Rejected'}`,
        body: `${responder?.name || 'Someone'} ${status === 'ACCEPTED' ? 'accepted' : 'rejected'} the assignment for "${campaignForNotif?.name || 'a campaign'}"`,
        entityType: 'campaign',
        entityId: assignment.campaignId,
      },
    });
    io.to(assignment.assignedById).emit(`notification:new:${assignment.assignedById}`, notif);

    res.json(updated);
  } catch (error) {
    console.error('Error responding to assignment:', error);
    res.status(500).json({ error: 'Failed to respond to assignment' });
  }
});

// ─── Get messages for an assignment ──────────────────────────────────────────
router.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const assignment = await prisma.campaignAssignment.findUnique({ where: { id } });
    if (!assignment) { res.status(404).json({ error: 'Assignment not found' }); return; }

    // Only the head or the assigning admin can read messages
    if (assignment.headId !== userId && assignment.assignedById !== userId) {
      res.status(403).json({ error: 'Access denied' }); return;
    }

    const messages = await prisma.assignmentMessage.findMany({
      where: { assignmentId: id },
      include: { sender: { select: { id: true, name: true, designation: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Mark messages from the other party as read
    await prisma.assignmentMessage.updateMany({
      where: { assignmentId: id, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ─── Send a message ───────────────────────────────────────────────────────────
router.post('/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const senderId = req.userId!;
    const { id } = req.params;
    const { content } = req.body as { content: string };

    if (!content?.trim()) { res.status(400).json({ error: 'Message content required' }); return; }

    const assignment = await prisma.campaignAssignment.findUnique({ where: { id } });
    if (!assignment) { res.status(404).json({ error: 'Assignment not found' }); return; }
    if (assignment.headId !== senderId && assignment.assignedById !== senderId) {
      res.status(403).json({ error: 'Access denied' }); return;
    }

    const message = await prisma.assignmentMessage.create({
      data: { assignmentId: id, senderId, content: content.trim() },
      include: { sender: { select: { id: true, name: true, designation: true, role: true } } },
    });

    // Real-time: emit to both parties
    const io = req.app.get('io');
    const otherUserId = senderId === assignment.headId ? assignment.assignedById : assignment.headId;
    io.to(`assignment:${id}`).emit(`chat:message:${id}`, message);
    io.to(otherUserId).emit(`chat:unread:${otherUserId}`, { assignmentId: id });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── Remove (unassign) an employee from a campaign ───────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const assignment = await prisma.campaignAssignment.findUnique({ where: { id } });
    if (!assignment) { res.status(404).json({ error: 'Assignment not found' }); return; }
    if (assignment.assignedById !== userId) {
      res.status(403).json({ error: 'Only the assigner can remove this assignment' }); return;
    }

    await prisma.campaignAssignment.delete({ where: { id } });

    // Notify the removed employee in real-time
    const io = req.app.get('io');
    io.to(assignment.headId).emit(`assignment:removed:${assignment.headId}`, { assignmentId: id, campaignId: assignment.campaignId });
    // Refresh campaign details modal for all viewers
    io.emit(`assignment:updated:${assignment.campaignId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing assignment:', error);
    res.status(500).json({ error: 'Failed to remove assignment' });
  }
});

// ─── Get total unread count for current user (for notification badge) ─────────
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Unread messages sent to this user + pending assignments (if head)
    const [unreadMessages, pendingAssignments] = await Promise.all([
      prisma.assignmentMessage.count({
        where: {
          isRead: false,
          senderId: { not: userId },
          assignment: {
            OR: [{ headId: userId }, { assignedById: userId }],
          },
        },
      }),
      prisma.campaignAssignment.count({
        where: { headId: userId, status: 'PENDING' },
      }),
    ]);

    res.json({ unreadMessages, pendingAssignments, total: unreadMessages + pendingAssignments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

export default router;
