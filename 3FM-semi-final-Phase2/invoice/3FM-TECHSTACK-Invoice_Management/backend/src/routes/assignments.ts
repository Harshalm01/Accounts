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
      io.emit(`assignment:new:${assignment.headId}`, assignment);
    });
    // Notify campaign details modal to refresh assignments list
    io.emit(`assignment:updated:${campaignId}`);

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
    io.emit(`assignment:responded:${assignment.assignedById}`, updated);
    // Refresh campaign details modal for all viewers
    io.emit(`assignment:updated:${assignment.campaignId}`);
    // If accepted, employee's campaign dashboard should refresh to show the campaign
    if (status === 'ACCEPTED') {
      io.emit(`campaign:accessible:${assignment.headId}`);
    }

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
    io.emit(`chat:message:${id}`, message);
    io.emit(`chat:unread:${otherUserId}`, { assignmentId: id });

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
    io.emit(`assignment:removed:${assignment.headId}`, { assignmentId: id, campaignId: assignment.campaignId });
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
