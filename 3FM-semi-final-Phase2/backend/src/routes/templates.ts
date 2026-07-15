import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── Create an announcement template (ADMIN only) ───────────────────────────────────────
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can create templates' });
      return;
    }

    const { name, description, title, content, priority, recipientType, recipientRoles } = req.body as {
      name: string;
      description?: string;
      title: string;
      content: string;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      recipientType?: 'ALL' | 'ROLES' | 'USERS';
      recipientRoles?: string[];
    };

    if (!name?.trim() || !title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Name, title, and content are required' });
      return;
    }

    const finalPriority = priority || 'NORMAL';
    if (!['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(finalPriority)) {
      res.status(400).json({ error: 'Invalid priority. Must be LOW, NORMAL, HIGH, or CRITICAL' });
      return;
    }

    const finalRecipientType = recipientType || 'ALL';
    if (!['ALL', 'ROLES', 'USERS'].includes(finalRecipientType)) {
      res.status(400).json({ error: 'Invalid recipientType. Must be ALL, ROLES, or USERS' });
      return;
    }

    // Validate roles if ROLES type
    const validRoles = ['ADMIN', 'AGENCY', 'EMPLOYEE', 'BRAND'];
    let finalRoles: string[] = [];
    if (finalRecipientType === 'ROLES') {
      if (!recipientRoles || recipientRoles.length === 0) {
        finalRoles = [];
      } else {
        const invalidRoles = recipientRoles.filter(r => !validRoles.includes(r));
        if (invalidRoles.length > 0) {
          res.status(400).json({ error: `Invalid roles: ${invalidRoles.join(', ')}` });
          return;
        }
        finalRoles = recipientRoles;
      }
    }

    const template = await prisma.announcementTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        title: title.trim(),
        content: content.trim(),
        priority: finalPriority,
        recipientType: finalRecipientType,
        recipientRoles: finalRoles,
        createdById: currentUserId,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// ── Get all templates for current user (ADMIN) ───────────────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;

    // Verify user is ADMIN
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can view templates' });
      return;
    }

    const templates = await prisma.announcementTemplate.findMany({
      where: { createdById: currentUserId },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ── Get specific template ───────────────────────────────────────
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { id } = req.params;

    const template = await prisma.announcementTemplate.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator or ADMIN can view
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });

    if (template.createdById !== currentUserId && user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'You do not have permission to view this template' });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// ── Update template ───────────────────────────────────────
router.put('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { id } = req.params;

    const template = await prisma.announcementTemplate.findUnique({
      where: { id },
      select: { createdById: true },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator can update
    if (template.createdById !== currentUserId) {
      res.status(403).json({ error: 'You can only update your own templates' });
      return;
    }

    const { name, description, title, content, priority, recipientType, recipientRoles } = req.body;

    if (name && !name.trim()) {
      res.status(400).json({ error: 'Name cannot be empty' });
      return;
    }
    if (title && !title.trim()) {
      res.status(400).json({ error: 'Title cannot be empty' });
      return;
    }
    if (content && !content.trim()) {
      res.status(400).json({ error: 'Content cannot be empty' });
      return;
    }

    if (priority && !['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(priority)) {
      res.status(400).json({ error: 'Invalid priority' });
      return;
    }

    let updateData: any = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (title) updateData.title = title.trim();
    if (content) updateData.content = content.trim();
    if (priority) updateData.priority = priority;
    if (recipientType) updateData.recipientType = recipientType;
    if (recipientRoles) updateData.recipientRoles = recipientRoles;

    const updated = await prisma.announcementTemplate.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// ── Delete template ───────────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.userId!;
    const { id } = req.params;

    const template = await prisma.announcementTemplate.findUnique({
      where: { id },
      select: { createdById: true },
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator can delete
    if (template.createdById !== currentUserId) {
      res.status(403).json({ error: 'You can only delete your own templates' });
      return;
    }

    await prisma.announcementTemplate.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
