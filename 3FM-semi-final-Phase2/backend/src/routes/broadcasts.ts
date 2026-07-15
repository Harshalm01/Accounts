import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── Create a broadcast message (ADMIN only) ───────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can create broadcasts' });
      return;
    }

    const { title, content, priority, recipientType, recipientRoles, recipientUserIds, scheduledFor, expiresAt } = req.body as {
      title: string;
      content: string;
      priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      recipientType?: 'ALL' | 'ROLES' | 'USERS';
      recipientRoles?: string[];
      recipientUserIds?: string[];
      scheduledFor?: string;
      expiresAt?: string;
    };

    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Title and content are required' });
      return;
    }

    if (!['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(priority || '')) {
      res.status(400).json({ error: 'Invalid priority. Must be LOW, NORMAL, HIGH, or CRITICAL' });
      return;
    }

    // Validate recipient type
    const finalRecipientType = recipientType || 'ALL';
    if (!['ALL', 'ROLES', 'USERS'].includes(finalRecipientType)) {
      res.status(400).json({ error: 'Invalid recipientType. Must be ALL, ROLES, or USERS' });
      return;
    }

    // Validate recipient roles
    const validRoles = ['ADMIN', 'AGENCY', 'EMPLOYEE', 'BRAND'];
    let finalRoles: string[] = [];
    if (finalRecipientType === 'ROLES') {
      if (!recipientRoles || recipientRoles.length === 0) {
        res.status(400).json({ error: 'recipientRoles is required when recipientType is ROLES' });
        return;
      }
      const invalidRoles = recipientRoles.filter(r => !validRoles.includes(r));
      if (invalidRoles.length > 0) {
        res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}` });
        return;
      }
      finalRoles = recipientRoles;
    }

    // Validate recipient user IDs
    let finalUserIds: string[] = [];
    if (finalRecipientType === 'USERS') {
      if (!recipientUserIds || recipientUserIds.length === 0) {
        res.status(400).json({ error: 'recipientUserIds is required when recipientType is USERS' });
        return;
      }
      // Verify all user IDs exist
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: recipientUserIds } },
        select: { id: true },
      });
      const existingIds = existingUsers.map(u => u.id);
      const invalidIds = recipientUserIds.filter(id => !existingIds.includes(id));
      if (invalidIds.length > 0) {
        res.status(400).json({ error: `Invalid user IDs: ${invalidIds.join(', ')}` });
        return;
      }
      finalUserIds = recipientUserIds;
    }

    const broadcast = await prisma.broadcastMessage.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        priority,
        createdById: currentUserId,
        recipientType: finalRecipientType,
        recipientRoles: finalRoles,
        recipientUserIds: finalUserIds,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        readBy: [],
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Broadcast to appropriate users via Socket.io
    const io = req.app.get('io');
    if (finalRecipientType === 'ALL') {
      // Send to all connected users
      io.emit('broadcast:new', {
        id: broadcast.id,
        title: broadcast.title,
        content: broadcast.content,
        priority: broadcast.priority,
        createdBy: broadcast.createdBy,
        createdAt: broadcast.createdAt,
      });
    } else if (finalRecipientType === 'ROLES') {
      // Send to users with matching roles
      const usersWithRoles = await prisma.user.findMany({
        where: { role: { in: finalRoles as any } },
        select: { id: true },
      });
      usersWithRoles.forEach(u => {
        io.to(u.id).emit('broadcast:new', {
          id: broadcast.id,
          title: broadcast.title,
          content: broadcast.content,
          priority: broadcast.priority,
          createdBy: broadcast.createdBy,
          createdAt: broadcast.createdAt,
        });
      });
    } else if (finalRecipientType === 'USERS') {
      // Send to specific users
      finalUserIds.forEach(userId => {
        io.to(userId).emit('broadcast:new', {
          id: broadcast.id,
          title: broadcast.title,
          content: broadcast.content,
          priority: broadcast.priority,
          createdBy: broadcast.createdBy,
          createdAt: broadcast.createdAt,
        });
      });
    }

    res.status(201).json(broadcast);
  } catch (error) {
    console.error('Broadcast create error:', error);
    res.status(500).json({ error: 'Failed to create broadcast' });
  }
});

// ── Get all broadcasts for current user ──────────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const unreadOnly = req.query.unreadOnly === 'true';

    // Get current user's role
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });

    // Fetch all broadcasts (no filtering on arrays yet)
    const allBroadcasts = await prisma.broadcastMessage.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter in memory based on recipient type and visibility
    const visibleBroadcasts = allBroadcasts.filter(b => {
      // Filter by unread status if requested
      if (unreadOnly && b.readBy.includes(currentUserId)) {
        return false;
      }

      // Filter by recipient type
      if (b.recipientType === 'ALL') {
        return true;
      }
      if (b.recipientType === 'ROLES' && currentUser?.role) {
        return b.recipientRoles.includes(currentUser.role);
      }
      if (b.recipientType === 'USERS') {
        return b.recipientUserIds.includes(currentUserId);
      }

      return false;
    });

    // Apply limit after filtering
    const broadcasts = visibleBroadcasts.slice(0, limit);

    // Map broadcasts to include read status for current user
    const withReadStatus = broadcasts.map((b) => ({
      ...b,
      read: b.readBy.includes(currentUserId),
    }));

    res.json(withReadStatus);
  } catch (error) {
    console.error('Broadcasts list error:', error);
    res.status(500).json({ error: 'Failed to fetch broadcasts' });
  }
});

// ── Mark broadcast as read ──────────────────────────────────────────────────────────
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    // Add current user to readBy array if not already there
    if (!broadcast.readBy.includes(currentUserId)) {
      const updated = await prisma.broadcastMessage.update({
        where: { id },
        data: {
          readBy: [...broadcast.readBy, currentUserId],
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      res.json(updated);
    } else {
      res.json(broadcast);
    }
  } catch (error) {
    console.error('Broadcast read error:', error);
    res.status(500).json({ error: 'Failed to mark broadcast as read' });
  }
});

// ── Delete a broadcast (ADMIN only) ────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can delete broadcasts' });
      return;
    }

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    await prisma.broadcastMessage.delete({ where: { id } });

    // Notify all users that broadcast was deleted
    const io = req.app.get('io');
    io.emit('broadcast:deleted', { broadcastId: id });

    res.json({ success: true });
  } catch (error) {
    console.error('Broadcast delete error:', error);
    res.status(500).json({ error: 'Failed to delete broadcast' });
  }
});

// ── Get broadcast statistics (ADMIN only) ────────────────────────────────────────
router.get('/:id/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can view broadcast stats' });
      return;
    }

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    // Get total user count
    const totalUsers = await prisma.user.count();
    const readCount = broadcast.readBy.length;
    const unreadCount = totalUsers - readCount;

    res.json({
      broadcastId: id,
      title: broadcast.title,
      totalUsers,
      readCount,
      unreadCount,
      readPercentage: totalUsers > 0 ? Math.round((readCount / totalUsers) * 100) : 0,
      createdAt: broadcast.createdAt,
    });
  } catch (error) {
    console.error('Broadcast stats error:', error);
    res.status(500).json({ error: 'Failed to fetch broadcast stats' });
  }
});

// ── Pin a broadcast (ADMIN only) ───────────────────────────────────────────────────────
router.patch('/:id/pin', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const { reason, expiresAt } = req.body;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can pin broadcasts' });
      return;
    }

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    const updated = await prisma.broadcastMessage.update({
      where: { id },
      data: {
        isPinned: true,
        pinnedAt: new Date(),
        pinnedById: currentUserId,
        pinnedReason: reason,
        pinExpiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Notify all users
    const io = req.app.get('io');
    io.emit('broadcast:pinned', { broadcastId: id, pinnedBy: user });

    res.json(updated);
  } catch (error) {
    console.error('Broadcast pin error:', error);
    res.status(500).json({ error: 'Failed to pin broadcast' });
  }
});

// ── Unpin a broadcast (ADMIN only) ─────────────────────────────────────────────────────
router.patch('/:id/unpin', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can unpin broadcasts' });
      return;
    }

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    const updated = await prisma.broadcastMessage.update({
      where: { id },
      data: {
        isPinned: false,
        pinnedAt: null,
        pinnedById: null,
        pinnedReason: null,
        pinExpiresAt: null,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Notify all users
    const io = req.app.get('io');
    io.emit('broadcast:unpinned', { broadcastId: id });

    res.json(updated);
  } catch (error) {
    console.error('Broadcast unpin error:', error);
    res.status(500).json({ error: 'Failed to unpin broadcast' });
  }
});

// ── Get pinned announcements ──────────────────────────────────────────────────────────
router.get('/pinned/list', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pinned = await prisma.broadcastMessage.findMany({
      where: { isPinned: true },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { pinnedAt: 'desc' },
    });

    res.json(pinned);
  } catch (error) {
    console.error('Fetch pinned error:', error);
    res.status(500).json({ error: 'Failed to fetch pinned announcements' });
  }
});

// ── Add/Toggle reaction to broadcast ──────────────────────────────────────────────────
router.post('/:id/reactions', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const { emoji } = req.body;

    if (!emoji || emoji.length === 0) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    // Check if broadcast exists
    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    // Check if user already reacted with this emoji
    const existing = await prisma.broadcastReaction.findUnique({
      where: {
        broadcastId_userId_emoji: {
          broadcastId: id,
          userId: currentUserId,
          emoji,
        },
      },
    });

    if (existing) {
      // Remove reaction (toggle off)
      await prisma.broadcastReaction.delete({
        where: { id: existing.id },
      });

      // Get updated counts
      const reactions = await prisma.broadcastReaction.findMany({
        where: { broadcastId: id },
      });

      const aggregated = Array.from(
        reactions.reduce((map, r) => {
          const key = r.emoji;
          const current = map.get(key);
          map.set(key, { emoji: r.emoji, count: (current?.count || 0) + 1, users: [...(current?.users || []), r.userId] });
          return map;
        }, new Map()).values()
      );

      // Notify users
      const io = req.app.get('io');
      io.emit('broadcast:reaction-removed', { broadcastId: id, emoji, reactions: aggregated });

      res.json({ added: false, reactions: aggregated });
    } else {
      // Add reaction (toggle on)
      const reaction = await prisma.broadcastReaction.create({
        data: {
          broadcastId: id,
          userId: currentUserId,
          emoji,
        },
      });

      // Get updated counts
      const reactions = await prisma.broadcastReaction.findMany({
        where: { broadcastId: id },
      });

      const aggregated = Array.from(
        reactions.reduce((map, r) => {
          const key = r.emoji;
          const current = map.get(key);
          map.set(key, { emoji: r.emoji, count: (current?.count || 0) + 1, users: [...(current?.users || []), r.userId] });
          return map;
        }, new Map()).values()
      );

      // Notify users
      const io = req.app.get('io');
      io.emit('broadcast:reaction-added', { broadcastId: id, emoji, reactions: aggregated });

      res.json({ added: true, reactionId: reaction.id, reactions: aggregated });
    }
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// ── Get reactions for broadcast ──────────────────────────────────────────────────────
router.get('/:id/reactions', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Check if broadcast exists
    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }

    const reactions = await prisma.broadcastReaction.findMany({
      where: { broadcastId: id },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Aggregate by emoji
    const aggregated = Array.from(
      reactions.reduce((map, r) => {
        const key = r.emoji;
        const current = map.get(key);
        const userReacted = r.userId === currentUserId;
        map.set(key, {
          emoji: r.emoji,
          count: (current?.count || 0) + 1,
          userReacted: current?.userReacted || userReacted,
          users: [...(current?.users || []), r.user.name || 'Unknown'],
        });
        return map;
      }, new Map()).values()
    );

    // Sort by count descending and limit to top 5
    const topReactions = aggregated.sort((a, b) => b.count - a.count).slice(0, 5);

    res.json(topReactions);
  } catch (error) {
    console.error('Fetch reactions error:', error);
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
});

export default router;
