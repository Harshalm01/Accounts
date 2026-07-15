import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Helper: format raw reactions into grouped { emoji, count, userReacted }[]
async function formatReactions(notificationId: string, currentUserId: string) {
  const raw = await prisma.notificationReaction.findMany({
    where: { notificationId },
  });
  const grouped: Record<string, { count: number; userReacted: boolean }> = {};
  for (const r of raw) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userReacted: false };
    grouped[r.emoji].count++;
    if (r.userId === currentUserId) grouped[r.emoji].userReacted = true;
  }
  return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
}

// ── Unread count ──────────────────────────────────────────────────────────────
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const count = await prisma.notification.count({ where: { userId: req.userId!, read: false } });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ── Mark all as read ──────────────────────────────────────────────────────────
router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.userId!, read: false }, data: { read: true } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ── Mark one as read ──────────────────────────────────────────────────────────
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.notification.updateMany({ where: { id, userId: req.userId! }, data: { read: true } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ── React to a notification ───────────────────────────────────────────────────
router.post('/:id/react', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { emoji } = req.body;
    const userId = req.userId!;

    if (!emoji) {
      res.status(400).json({ error: 'emoji is required' });
      return;
    }

    // Verify notification exists
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    // Toggle: if this exact reaction already exists, remove it; otherwise add it
    const existing = await prisma.notificationReaction.findUnique({
      where: { notificationId_userId_emoji: { notificationId: id, userId: userId as string, emoji } },
    });

    if (existing) {
      await prisma.notificationReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.notificationReaction.create({
        data: { notificationId: id, userId: userId as string, emoji },
      });
    }

    const reactions = await formatReactions(id, userId as string);

    // Emit real-time update to the notification owner so they see the reaction live
    const io = req.app.get('io');
    if (io && notification.userId !== userId) {
      io.to(notification.userId).emit(`notification:reaction:${notification.userId}`, {
        notificationId: id,
        reactions,
      });
    }
    // Also emit to ourselves (for multi-tab support)
    if (io) {
      io.to(userId).emit(`notification:reaction:${userId}`, {
        notificationId: id,
        reactions,
      });
    }

    res.json({ reactions });
  } catch (error) {
    console.error('❌ Error reacting to notification:', error);
    res.status(500).json({ error: 'Failed to react to notification' });
  }
});

// ── Delete a notification ─────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.notification.deleteMany({ where: { id, userId: req.userId! } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// ── List notifications for current user (unread first, max 50) ───────────────
// This MUST come LAST so specific routes match first
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    console.log(`📬 Fetching notifications for userId: ${userId}`);
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { reactions: true },
    });

    // Format reactions for client
    const result = notifications.map((n) => {
      const grouped: Record<string, { count: number; userReacted: boolean }> = {};
      for (const r of n.reactions) {
        if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userReacted: false };
        grouped[r.emoji].count++;
        if (r.userId === userId) grouped[r.emoji].userReacted = true;
      }
      const reactions = Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
      const { reactions: _raw, ...rest } = n;
      return { ...rest, reactions };
    });

    console.log(`✅ Found ${result.length} notifications`);
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications', details: String(error) });
  }
});

export default router;
