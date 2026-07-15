import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateVideoToken } from '../services/videoCallService';

const router = Router();
const prisma = new PrismaClient();

const memberSelect = { id: true, name: true, designation: true, role: true };

function formatReactions(
  reactions: { userId: string; emoji: string }[],
  currentUserId: string
): { emoji: string; count: number; userReacted: boolean }[] {
  const grouped: Record<string, { count: number; userReacted: boolean }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, userReacted: false };
    grouped[r.emoji].count++;
    if (r.userId === currentUserId) grouped[r.emoji].userReacted = true;
  }
  return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
}

// ── List all groups the current user is a member of ──────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    const memberships = await prisma.groupMember.findMany({
      where: { userId: currentUserId },
      include: {
        group: {
          include: {
            members: { include: { user: { select: memberSelect } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: memberSelect } } },
            createdBy: { select: memberSelect },
          },
        },
      },
      orderBy: { group: { updatedAt: 'desc' } },
    });

    // Compute unread count for each group
    const result = await Promise.all(
      memberships.map(async (m) => {
        const unread = await prisma.groupMessage.count({
          where: {
            groupId: m.groupId,
            senderId: { not: currentUserId },
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        });
        return { ...m.group, unreadCount: unread, myMembership: { id: m.id, lastReadAt: m.lastReadAt } };
      })
    );

    res.json(result);
  } catch (error) {
    console.error('Groups list error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// ── Total unread count across all groups ─────────────────────────────────────
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    const memberships = await prisma.groupMember.findMany({
      where: { userId: currentUserId },
      select: { groupId: true, lastReadAt: true },
    });

    let count = 0;
    for (const m of memberships) {
      const c = await prisma.groupMessage.count({
        where: {
          groupId: m.groupId,
          senderId: { not: currentUserId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      count += c;
    }

    res.json({ count });
  } catch (error) {
    console.error('Groups unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ── Create a new group ────────────────────────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { name, memberIds, campaignId } = req.body as { name: string; memberIds: string[]; campaignId?: string };

    // Only ADMIN and AGENCY (heads) can create groups
    const creator = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!creator || !['ADMIN', 'AGENCY'].includes(creator.role)) {
      res.status(403).json({ error: 'Only admins and heads can create group chats' });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }

    const allMemberIds = Array.from(new Set([currentUserId, ...(memberIds || [])]));

    const group = await prisma.groupConversation.create({
      data: {
        name: name.trim(),
        createdById: currentUserId,
        ...(campaignId ? { campaignId } : {}),
        members: {
          create: allMemberIds.map((uid) => ({ userId: uid })),
        },
      },
      include: {
        members: { include: { user: { select: memberSelect } } },
        createdBy: { select: memberSelect },
        messages: { take: 1 },
      },
    });

    const io = req.app.get('io');
    // Notify all members about the new group
    allMemberIds.forEach((uid) => {
      io.to(uid).emit(`group:added:${uid}`, { group });
    });

    res.status(201).json({ ...group, unreadCount: 0 });
  } catch (error) {
    console.error('Group create error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// ── Get messages for a group (marks as read) ──────────────────────────────────
router.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const rawMessages = await prisma.groupMessage.findMany({
      where: { groupId: id },
      include: {
        sender: { select: { id: true, name: true, designation: true, role: true } },
        reactions: { select: { userId: true, emoji: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const messages = rawMessages.map(({ reactions, ...msg }) => ({
      ...msg,
      reactions: formatReactions(reactions, currentUserId),
    }));

    // Mark as read by updating lastReadAt
    await prisma.groupMember.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });

    res.json(messages);
  } catch (error) {
    console.error('Group messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── Send a message to a group ─────────────────────────────────────────────────
router.post('/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const { content, fileUrl, fileName, fileType, mentions } = req.body as {
      content?: string; fileUrl?: string; fileName?: string; fileType?: string; mentions?: string[];
    };

    if (!content?.trim() && !fileUrl) {
      res.status(400).json({ error: 'Message content or file is required' });
      return;
    }

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const message = await prisma.groupMessage.create({
      data: {
        groupId: id,
        senderId: currentUserId,
        content: content?.trim() || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
      },
      include: { sender: { select: { id: true, name: true, designation: true, role: true } } },
    });

    await prisma.groupConversation.update({ where: { id }, data: { updatedAt: new Date() } });

    // Mark sender's own lastReadAt so they don't see unread for their own message
    await prisma.groupMember.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });

    const io = req.app.get('io');
    io.to(`group:${id}`).emit(`group:message:${id}`, { groupId: id, message });

    // ── Handle @mentions and notify mentioned users ────────────────────────────
    if (mentions && mentions.length > 0 && content) {
      // Get group members to match usernames
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId: id },
        include: { user: { select: { id: true, name: true } } },
      });

      // For each mentioned username, find the corresponding user and emit notification
      for (const mentionedName of mentions) {
        const mentionedMember = groupMembers.find(
          (m) => {
            if (!m.user.name) return false;
            const firstName = m.user.name.split(' ')[0];
            return firstName.toLowerCase() === mentionedName.toLowerCase();
          }
        );

        if (mentionedMember && mentionedMember.user.id !== currentUserId) {
          // Get sender name for notification
          const sender = await prisma.user.findUnique({
            where: { id: currentUserId },
            select: { name: true },
          });

          const senderName = sender?.name || 'Someone';
          const notifBody = content.trim().substring(0, 100);

          // Persist notification to DB
          await prisma.notification.create({
            data: {
              userId: mentionedMember.user.id,
              type: 'MENTION',
              title: `${senderName} mentioned you`,
              body: notifBody,
              entityType: 'group',
              entityId: id,
            },
          });

          // Emit mention notification to the mentioned user
          io.to(mentionedMember.user.id).emit(`mention:new:in-group:${mentionedMember.user.id}`, {
            groupId: id,
            senderName,
            context: notifBody,
            createdAt: new Date().toISOString(),
          });

          // Push to notification panel in real time
          io.to(mentionedMember.user.id).emit(`notification:new:${mentionedMember.user.id}`, {
            type: 'MENTION',
            title: `${senderName} mentioned you`,
            body: notifBody,
            entityType: 'group',
            entityId: id,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Group send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── Add a member to a group (creator only) ───────────────────────────────────
router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const { userId } = req.body as { userId: string };

    const group = await prisma.groupConversation.findUnique({ where: { id } });
    if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
    if (group.createdById !== currentUserId) {
      res.status(403).json({ error: 'Only the group creator can add members' });
      return;
    }

    const member = await prisma.groupMember.create({
      data: { groupId: id, userId },
      include: { user: { select: memberSelect } },
    });

    const io = req.app.get('io');
    io.to(userId).emit(`group:added:${userId}`, { group });
    io.to(`group:${id}`).emit(`group:member_added:${id}`, { member });

    res.status(201).json(member);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'User is already a member' });
    } else {
      console.error('Group add member error:', error);
      res.status(500).json({ error: 'Failed to add member' });
    }
  }
});

// ── Remove a member from a group (creator or self) ───────────────────────────
router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const userId = req.params.userId as string;

    const group = await prisma.groupConversation.findUnique({ where: { id } });
    if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

    // Only creator can remove others; anyone can remove themselves
    if (userId !== currentUserId && group.createdById !== currentUserId) {
      res.status(403).json({ error: 'Not authorized to remove this member' });
      return;
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId: id, userId } },
    });

    const io = req.app.get('io');
    io.to(`group:${id}`).emit(`group:member_removed:${id}`, { userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Group remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ── Get group for a campaign (if exists) ─────────────────────────────────────
router.get('/campaign/:campaignId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;
    const currentUserId = req.userId!;

    const group = await prisma.groupConversation.findFirst({
      where: { campaignId },
      include: {
        members: { include: { user: { select: memberSelect } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: memberSelect } } },
        createdBy: { select: memberSelect },
      },
    });

    if (!group) {
      res.status(404).json({ error: 'No group chat for this campaign' });
      return;
    }

    // Compute unread count for current user
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: currentUserId } },
    });
    const unread = membership
      ? await prisma.groupMessage.count({
          where: {
            groupId: group.id,
            senderId: { not: currentUserId },
            ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
          },
        })
      : 0;

    res.json({ ...group, unreadCount: unread });
  } catch (error) {
    console.error('Campaign group error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign group' });
  }
});

// ── Generate video call token for group ────────────────────────────────────────────
router.post('/:id/video-token', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is member of group
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    // Get user info for token
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { name: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Generate unique room name based on group and timestamp
    const roomId = `group-${id}`;

    // Generate video token
    const tokenData = await generateVideoToken(roomId, user.name || 'User');

    res.json(tokenData);
  } catch (error) {
    console.error('Group video token error:', error);
    res.status(500).json({ error: 'Failed to generate video call token' });
  }
});

// ── Pin a message in a group ────────────────────────────────────────────────────
router.post('/:id/pin', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const { messageId, messageText, messageAuthorId, messageAuthorName, reason } = req.body as {
      messageId: string;
      messageText: string;
      messageAuthorId: string;
      messageAuthorName: string;
      reason?: string;
    };

    if (!messageId || !messageText || !messageAuthorId || !messageAuthorName) {
      res.status(400).json({ error: 'Missing required fields: messageId, messageText, messageAuthorId, messageAuthorName' });
      return;
    }

    // Verify user is member of group
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    // Check if message exists
    const message = await prisma.groupMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.groupId !== id) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Check if already pinned
    const existing = await prisma.pinnedMessage.findFirst({
      where: { groupId: id, originalMessageId: messageId },
    });
    if (existing) {
      res.status(400).json({ error: 'Message already pinned' });
      return;
    }

    // Create pin
    const pinnedMessage = await prisma.pinnedMessage.create({
      data: {
        groupId: id,
        messageText,
        messageAuthorId,
        messageAuthorName,
        originalMessageId: messageId,
        pinnedById: currentUserId,
        pinReason: reason || null,
      },
      include: {
        pinnedUser: { select: { id: true, name: true } },
      },
    });

    // Broadcast pin event to group
    const io = req.app.get('io');
    io.to(`group:${id}`).emit(`group:message_pinned:${id}`, {
      pinnedMessageId: pinnedMessage.id,
      originalMessageId: messageId,
      pinnedBy: pinnedMessage.pinnedUser,
      messageText,
      pinnedAt: pinnedMessage.createdAt,
    });

    res.status(201).json(pinnedMessage);
  } catch (error) {
    console.error('Group pin error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// ── Get pinned messages in a group ──────────────────────────────────────────────
router.get('/:id/pinned', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is member of group
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const pinnedMessages = await prisma.pinnedMessage.findMany({
      where: { groupId: id },
      include: {
        pinnedUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(pinnedMessages);
  } catch (error) {
    console.error('Group pinned messages error:', error);
    res.status(500).json({ error: 'Failed to fetch pinned messages' });
  }
});

// ── Unpin a message in a group ──────────────────────────────────────────────────
router.delete('/:id/pin/:pinId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const pinId = req.params.pinId as string;

    // Verify user is member of group
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    // Check pin exists
    const pinnedMessage = await prisma.pinnedMessage.findUnique({
      where: { id: pinId },
    });
    if (!pinnedMessage || pinnedMessage.groupId !== id) {
      res.status(404).json({ error: 'Pinned message not found' });
      return;
    }

    await prisma.pinnedMessage.delete({ where: { id: pinId } });

    // Broadcast unpin event
    const io = req.app.get('io');
    io.to(`group:${id}`).emit(`group:message_unpinned:${id}`, {
      pinnedMessageId: pinId,
      originalMessageId: pinnedMessage.originalMessageId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Group unpin error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// ── Search messages in a group ──────────────────────────────────────────────────
router.get('/:id/search', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const q = (req.query.q as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));

    if (!q || q.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: currentUserId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    // Search in group messages using case-insensitive contains
    const skip = (page - 1) * limit;

    // Fetch messages
    const messages = await prisma.groupMessage.findMany({
      where: {
        groupId: id,
        content: {
          contains: q,
          mode: 'insensitive',
        },
      },
      include: {
        sender: { select: { id: true, name: true, designation: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Get total count for pagination
    const totalCount = await prisma.groupMessage.count({
      where: {
        groupId: id,
        content: {
          contains: q,
          mode: 'insensitive',
        },
      },
    });

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Group search error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// ── Delete a group (creator only) ────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    const group = await prisma.groupConversation.findUnique({
      where: { id },
      include: { members: { select: { userId: true } } },
    }) as ({ members: { userId: string }[] } & { createdById: string; id: string }) | null;
    if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
    if (group.createdById !== currentUserId) {
      res.status(403).json({ error: 'Only the group creator can delete the group' });
      return;
    }

    const memberIds = group.members.map((m) => m.userId);
    await prisma.groupConversation.delete({ where: { id } });

    const io = req.app.get('io');
    memberIds.forEach((uid) => {
      io.to(uid).emit(`group:deleted:${uid}`, { groupId: id });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Group delete error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ── React to a group message ───────────────────────────────────────────────────
router.post('/:id/messages/:messageId/react', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const groupId = req.params.id as string;
    const messageId = req.params.messageId as string;
    const { emoji } = req.body;

    if (!emoji) { res.status(400).json({ error: 'emoji is required' }); return; }

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: currentUserId } },
    });
    if (!membership) { res.status(403).json({ error: 'Not a member of this group' }); return; }

    // Toggle reaction
    const existing = await prisma.groupMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: currentUserId, emoji } },
    });
    if (existing) {
      await prisma.groupMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.groupMessageReaction.create({ data: { messageId, userId: currentUserId, emoji } });
    }

    const raw = await prisma.groupMessageReaction.findMany({
      where: { messageId },
      select: { userId: true, emoji: true },
    });
    const reactions = formatReactions(raw, currentUserId);

    // Broadcast to all group members with raw reactions so each client calculates userReacted
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit(`message:reaction:${groupId}`, {
        messageId,
        allReactions: raw,
      });
    }

    res.json({ reactions });
  } catch (error) {
    console.error('Group react error:', error);
    res.status(500).json({ error: 'Failed to react to message' });
  }
});

// Bulk delete group messages — only the sender can delete their own messages
router.delete('/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const groupId = req.params.id;
    const { messageIds } = req.body as { messageIds: string[] };

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ error: 'messageIds array is required' });
      return;
    }

    // Verify user is a member of this group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId: currentUserId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    // Only delete messages the current user sent
    await prisma.groupMessage.deleteMany({
      where: {
        id: { in: messageIds },
        groupId,
        senderId: currentUserId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Group bulk delete messages error:', error);
    res.status(500).json({ error: 'Failed to delete messages' });
  }
});

export default router;
