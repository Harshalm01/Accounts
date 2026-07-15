import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { generateVideoToken } from '../services/videoCallService';

const router = Router();
const prisma = new PrismaClient();

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

// Multer setup — store files in uploads/dm/
const uploadDir = path.join(__dirname, '../../uploads/dm');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB

// Search users (for starting a new conversation)
router.get('/users/search', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query as { q: string };
    const currentUserId = req.userId!;

    if (!q || q.trim().length < 1) {
      res.json([]);
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        role: { in: ['ADMIN', 'AGENCY', 'EMPLOYEE'] },
        name: { contains: q.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true, designation: true, role: true },
      take: 10,
    });

    res.json(users);
  } catch (error) {
    console.error('DM search error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get single user profile (for clicking on a user in chat)
router.get('/users/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, designation: true, role: true, email: true, phone: true },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (error) {
    console.error('DM user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Upload a file attachment
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const fileUrl = `/uploads/dm/${req.file.filename}`;
    res.json({ fileUrl, fileName: req.file.originalname, fileType: req.file.mimetype });
  } catch (error) {
    console.error('DM upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Generate video call token for DM conversation
router.post('/conversations/:id/video-token', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is part of conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
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

    // Generate unique room name based on conversation
    const roomId = `dm-${id}`;

    // Generate video token
    const tokenData = await generateVideoToken(roomId, user.name || 'User');

    res.json(tokenData);
  } catch (error) {
    console.error('DM video token error:', error);
    res.status(500).json({ error: 'Failed to generate video call token' });
  }
});

// Get all conversations for current user
router.get('/conversations', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    const conversations = await prisma.directConversation.findMany({
      where: {
        OR: [
          { user1Id: currentUserId, hiddenByUser1: false },
          { user2Id: currentUserId, hiddenByUser2: false },
        ],
      },
      include: {
        user1: { select: { id: true, name: true, designation: true, role: true } },
        user2: { select: { id: true, name: true, designation: true, role: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Attach unread count per conversation
    const withUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unread = await prisma.directMessage.count({
          where: {
            conversationId: conv.id,
            senderId: { not: currentUserId },
            isRead: false,
          },
        });
        return { ...conv, unreadCount: unread };
      })
    );

    res.json(withUnread);
  } catch (error) {
    console.error('DM conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get or create a conversation with another user
router.post('/conversations', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { otherUserId } = req.body as { otherUserId: string };

    if (!otherUserId) {
      res.status(400).json({ error: 'otherUserId is required' });
      return;
    }

    // Enforce consistent ordering so @@unique([user1Id, user2Id]) works
    const [u1, u2] = [currentUserId, otherUserId].sort();

    const conversation = await prisma.directConversation.upsert({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
      create: { user1Id: u1, user2Id: u2 },
      update: {},
      include: {
        user1: { select: { id: true, name: true, designation: true, role: true } },
        user2: { select: { id: true, name: true, designation: true, role: true } },
      },
    });

    res.json(conversation);
  } catch (error) {
    console.error('DM create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { id } = req.params;

    // Verify user is part of this conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const rawMessages = await prisma.directMessage.findMany({
      where: { conversationId: id },
      include: {
        sender: { select: { id: true, name: true, designation: true } },
        reactions: { select: { userId: true, emoji: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (rawMessages as any[]).map((m) => {
      const { reactions = [], ...rest } = m;
      return { ...rest, reactions: formatReactions(reactions, currentUserId) };
    });

    // Mark all messages from the other user as read
    await prisma.directMessage.updateMany({
      where: { conversationId: id, senderId: { not: currentUserId }, isRead: false },
      data: { isRead: true },
    });

    res.json(messages);
  } catch (error) {
    console.error('DM messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message
router.post('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { id } = req.params;
    const { content, fileUrl, fileName, fileType } = req.body as { content?: string; fileUrl?: string; fileName?: string; fileType?: string };

    if (!content?.trim() && !fileUrl) {
      res.status(400).json({ error: 'Message content or file is required' });
      return;
    }

    // Verify user is part of this conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const message = await prisma.directMessage.create({
      data: {
        conversationId: id,
        senderId: currentUserId,
        content: content?.trim() || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
      },
      include: { sender: { select: { id: true, name: true, designation: true } } },
    });

    // Update conversation updatedAt and reset hidden flag for recipient so conv reappears for them
    const isUser1 = conv.user1Id === currentUserId;
    await prisma.directConversation.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        ...(isUser1 ? { hiddenByUser2: false } : { hiddenByUser1: false }),
      },
    });

    // Emit real-time event only to the recipient
    const recipientId = conv.user1Id === currentUserId ? conv.user2Id : conv.user1Id;
    const io = req.app.get('io');
    io.to(recipientId).emit(`dm:message:${recipientId}`, { conversationId: id, message });

    res.status(201).json(message);
  } catch (error) {
    console.error('DM send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Pin a message in a DM conversation
router.post('/conversations/:id/pin', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Verify user is part of conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Check if message exists
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.conversationId !== id) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Check if already pinned
    const existing = await prisma.pinnedMessage.findFirst({
      where: { dmConversationId: id, originalMessageId: messageId },
    });
    if (existing) {
      res.status(400).json({ error: 'Message already pinned' });
      return;
    }

    // Create pin
    const pinnedMessage = await prisma.pinnedMessage.create({
      data: {
        dmConversationId: id,
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

    // Notify both conversation participants
    const io = req.app.get('io');
    io.to(conv.user1Id).emit(`dm:message_pinned:${id}`, {
      pinnedMessageId: pinnedMessage.id,
      originalMessageId: messageId,
      pinnedBy: pinnedMessage.pinnedUser,
      messageText,
      pinnedAt: pinnedMessage.createdAt,
    });
    io.to(conv.user2Id).emit(`dm:message_pinned:${id}`, {
      pinnedMessageId: pinnedMessage.id,
      originalMessageId: messageId,
      pinnedBy: pinnedMessage.pinnedUser,
      messageText,
      pinnedAt: pinnedMessage.createdAt,
    });

    res.status(201).json(pinnedMessage);
  } catch (error) {
    console.error('DM pin error:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Get pinned messages in a DM conversation
router.get('/conversations/:id/pinned', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;

    // Verify user is part of conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const pinnedMessages = await prisma.pinnedMessage.findMany({
      where: { dmConversationId: id },
      include: {
        pinnedUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(pinnedMessages);
  } catch (error) {
    console.error('DM pinned messages error:', error);
    res.status(500).json({ error: 'Failed to fetch pinned messages' });
  }
});

// Unpin a message in a DM conversation
router.delete('/conversations/:id/pin/:pinId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const id = req.params.id as string;
    const pinId = req.params.pinId as string;

    // Verify user is part of conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Check pin exists
    const pinnedMessage = await prisma.pinnedMessage.findUnique({
      where: { id: pinId },
    });
    if (!pinnedMessage || pinnedMessage.dmConversationId !== id) {
      res.status(404).json({ error: 'Pinned message not found' });
      return;
    }

    await prisma.pinnedMessage.delete({ where: { id: pinId } });

    // Broadcast unpin to both participants
    const io = req.app.get('io');
    io.to(conv.user1Id).emit(`dm:message_unpinned:${id}`, {
      pinnedMessageId: pinId,
      originalMessageId: pinnedMessage.originalMessageId,
    });
    io.to(conv.user2Id).emit(`dm:message_unpinned:${id}`, {
      pinnedMessageId: pinId,
      originalMessageId: pinnedMessage.originalMessageId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('DM unpin error:', error);
    res.status(500).json({ error: 'Failed to unpin message' });
  }
});

// Search messages in a conversation
router.get('/conversations/:id/search', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Verify user is part of this conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Search in DM messages using PostgreSQL's case-insensitive search
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await prisma.directMessage.count({
      where: {
        conversationId: id,
        content: {
          contains: q,
          mode: 'insensitive',
        },
      },
    });

    // Search messages
    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId: id,
        content: {
          contains: q,
          mode: 'insensitive',
        },
      },
      include: {
        sender: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
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
    console.error('DM search error:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Delete a conversation (only participants can delete)
router.delete('/conversations/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { id } = req.params;

    const conv = await prisma.directConversation.findFirst({
      where: { id, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const isUser1 = conv.user1Id === currentUserId;
    const updatedConv = await prisma.directConversation.update({
      where: { id },
      data: isUser1 ? { hiddenByUser1: true } : { hiddenByUser2: true },
    });
    // If both users have now hidden it, hard-delete the whole record
    if (updatedConv.hiddenByUser1 && updatedConv.hiddenByUser2) {
      await prisma.directConversation.delete({ where: { id } });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('DM delete error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Get total unread DM count for current user
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    // Find all conversations for this user
    const convs = await prisma.directConversation.findMany({
      where: { OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
      select: { id: true },
    });

    const count = await prisma.directMessage.count({
      where: {
        conversationId: { in: convs.map((c) => c.id) },
        senderId: { not: currentUserId },
        isRead: false,
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('DM unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ── React to a DM message ─────────────────────────────────────────────────────
router.post('/conversations/:id/messages/:messageId/react', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const convId = req.params.id as string;
    const messageId = req.params.messageId as string;
    const { emoji } = req.body;

    if (!emoji) { res.status(400).json({ error: 'emoji is required' }); return; }

    // Verify user is part of conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id: convId, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });
    if (!conv) { res.status(403).json({ error: 'Not part of this conversation' }); return; }

    // Toggle reaction
    const existing = await prisma.dmMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: currentUserId, emoji } },
    });
    if (existing) {
      await prisma.dmMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.dmMessageReaction.create({ data: { messageId, userId: currentUserId, emoji } });
    }

    const raw = await prisma.dmMessageReaction.findMany({
      where: { messageId },
      select: { userId: true, emoji: true },
    });
    const reactions = formatReactions(raw, currentUserId);

    // Broadcast to both conversation participants
    const io = req.app.get('io');
    if (io) {
      const otherUserId = conv.user1Id === currentUserId ? conv.user2Id : conv.user1Id;
      const payload = { conversationId: convId, messageId, allReactions: raw };
      io.to(currentUserId).emit('message:reaction', payload);
      io.to(otherUserId).emit('message:reaction', payload);
    }

    res.json({ reactions });
  } catch (error) {
    console.error('DM react error:', error);
    res.status(500).json({ error: 'Failed to react to message' });
  }
});

// Bulk delete messages — only the sender can delete their own messages
router.delete('/conversations/:convId/messages', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { convId } = req.params;
    const { messageIds } = req.body as { messageIds: string[] };

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ error: 'messageIds array is required' });
      return;
    }

    // Verify user is part of this conversation
    const conv = await prisma.directConversation.findFirst({
      where: { id: convId, OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }] },
    });
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Only delete messages the current user sent
    await prisma.directMessage.deleteMany({
      where: {
        id: { in: messageIds },
        conversationId: convId,
        senderId: currentUserId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('DM bulk delete messages error:', error);
    res.status(500).json({ error: 'Failed to delete messages' });
  }
});

export default router;
