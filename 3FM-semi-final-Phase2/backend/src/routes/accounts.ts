import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Server } from 'socket.io';

const router = Router();
const prisma = new PrismaClient();

// Middleware: require accounts access
async function requireAccountsAccess(req: AuthRequest, res: Response, next: () => void) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { canAccessAccounts: true, role: true },
  });
  if (!user || (!user.canAccessAccounts && user.role !== 'ADMIN')) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

// Middleware: require finance approval privilege
async function requireFinanceApproval(req: AuthRequest, res: Response, next: () => void) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { canApprovePayments: true, role: true },
  });
  if (!user || (!user.canApprovePayments && user.role !== 'ADMIN')) {
    res.status(403).json({ error: 'Only finance team can perform this action' });
    return;
  }
  next();
}

// GET / — list all account entries
router.get('/', authenticate, requireAccountsAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query;

    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { canApprovePayments: true, role: true },
    });
    const canSeeAll = currentUser?.canApprovePayments || currentUser?.role === 'ADMIN';

    const where: any = {};
    if (!canSeeAll) {
      where.addedById = req.userId;
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (search && typeof search === 'string') {
      where.OR = [
        { influencer: { firstName: { contains: search, mode: 'insensitive' } } },
        { influencer: { lastName: { contains: search, mode: 'insensitive' } } },
        { campaign: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const entries = await prisma.accountEntry.findMany({
      where,
      include: {
        influencer: { select: { id: true, firstName: true, lastName: true, igLink: true, primaryGenre: true } },
        campaign: { select: { id: true, name: true, brandName: true } },
        addedBy: { select: { id: true, name: true, designation: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(entries);
  } catch (error) {
    console.error('Failed to fetch account entries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /heads — list all heads with credit balances (finance/admin only)
router.get('/heads', authenticate, requireAccountsAccess, requireFinanceApproval, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const heads = await prisma.user.findMany({
      where: { role: 'AGENCY', canApprovePayments: false, AND: [{ name: { not: null } }, { name: { not: '' } }] },
      select: {
        id: true,
        name: true,
        designation: true,
        credits: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(heads);
  } catch (error) {
    console.error('Failed to fetch heads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /heads/:id/credits — update a head's credits (finance/admin only)
router.patch('/heads/:id/credits', authenticate, requireAccountsAccess, requireFinanceApproval, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { credits } = req.body;

    if (credits === undefined || typeof credits !== 'number') {
      res.status(400).json({ error: 'credits (number) is required' });
      return;
    }

    const head = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!head || head.role !== 'AGENCY') {
      res.status(404).json({ error: 'Head not found' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { credits },
      select: { id: true, name: true, designation: true, credits: true, email: true },
    });

    const io = req.app.get('io');
    io.emit('credits:updated', {
      userId: id,
      credits: updated.credits,
    });

    res.json(updated);
  } catch (error) {
    console.error('Failed to update head credits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══ Finance Requests ═══

// POST /finance-requests — send a finance request to a head
router.post('/finance-requests', authenticate, requireAccountsAccess, requireFinanceApproval, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { headId, message } = req.body;
    if (!headId || !message?.trim()) {
      res.status(400).json({ error: 'headId and message are required' });
      return;
    }

    const head = await prisma.user.findUnique({
      where: { id: headId },
      select: { id: true, role: true },
    });
    if (!head || head.role !== 'AGENCY') {
      res.status(404).json({ error: 'Head not found' });
      return;
    }

    const request = await prisma.financeRequest.create({
      data: {
        message: message.trim(),
        sentById: req.userId!,
        sentToId: headId,
      },
      include: {
        sentBy: { select: { id: true, name: true } },
        sentTo: { select: { id: true, name: true, designation: true } },
      },
    });

    const io = req.app.get('io') as Server;
    io.emit('finance:request:new', request);

    // Create notification for the head
    const notif = await prisma.notification.create({
      data: {
        userId: headId,
        type: 'FINANCE_REQUEST',
        title: 'Finance Request',
        body: `${request.sentBy.name || 'Finance'} sent you a request: "${message.trim().substring(0, 80)}${message.trim().length > 80 ? '...' : ''}"`,
        entityType: 'financeRequest',
        entityId: request.id,
      },
    });
    io.to(headId).emit(`notification:new:${headId}`, notif);

    res.status(201).json(request);
  } catch (error) {
    console.error('Failed to send finance request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /finance-requests — list finance requests (role-aware)
router.get('/finance-requests', authenticate, requireAccountsAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { canApprovePayments: true, role: true },
    });
    const isFinance = currentUser?.canApprovePayments || currentUser?.role === 'ADMIN';

    const where = isFinance
      ? { sentById: req.userId }
      : { sentToId: req.userId };

    const requests = await prisma.financeRequest.findMany({
      where,
      include: {
        sentBy: { select: { id: true, name: true } },
        sentTo: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests);
  } catch (error) {
    console.error('Failed to fetch finance requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /finance-requests/:id/respond — head accepts or rejects
router.patch('/finance-requests/:id/respond', authenticate, requireAccountsAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: 'ACCEPTED' | 'REJECTED' };

    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'status must be ACCEPTED or REJECTED' });
      return;
    }

    const request = await prisma.financeRequest.findUnique({ where: { id } });
    if (!request) {
      res.status(404).json({ error: 'Finance request not found' });
      return;
    }
    if (request.sentToId !== req.userId) {
      res.status(403).json({ error: 'Not your request to respond to' });
      return;
    }
    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Request already responded to' });
      return;
    }

    const updated = await prisma.financeRequest.update({
      where: { id },
      data: { status, respondedAt: new Date() },
      include: {
        sentBy: { select: { id: true, name: true } },
        sentTo: { select: { id: true, name: true, designation: true } },
      },
    });

    const io = req.app.get('io') as Server;
    io.emit('finance:request:responded', updated);

    // Notify finance sender
    const responder = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { name: true },
    });
    const notif = await prisma.notification.create({
      data: {
        userId: request.sentById,
        type: 'FINANCE_REQUEST_RESPONDED',
        title: `Request ${status === 'ACCEPTED' ? 'Accepted' : 'Rejected'}`,
        body: `${responder?.name || 'A head'} ${status === 'ACCEPTED' ? 'accepted' : 'rejected'} your finance request`,
        entityType: 'financeRequest',
        entityId: request.id,
      },
    });
    io.to(request.sentById).emit(`notification:new:${request.sentById}`, notif);

    res.json(updated);
  } catch (error) {
    console.error('Failed to respond to finance request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /add — add influencer(s) to accounts
router.post('/add', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'entries array is required' });
      return;
    }

    const results = [];
    const skipped = [];

    for (const entry of entries) {
      const { influencerId, campaignId, internalCost, invoiceFile, invoiceOriginalName } = entry;
      if (!influencerId || !campaignId || internalCost === undefined) {
        continue;
      }

      // Invoice is compulsory
      if (!invoiceFile) {
        skipped.push({ influencerId, campaignId, reason: 'Invoice is required' });
        continue;
      }

      // Check for duplicate
      const existing = await prisma.accountEntry.findUnique({
        where: { influencerId_campaignId: { influencerId, campaignId } },
      });
      if (existing) {
        skipped.push({ influencerId, campaignId, reason: 'Already exists' });
        continue;
      }

      const created = await prisma.accountEntry.create({
        data: {
          influencerId,
          campaignId,
          internalCost: parseFloat(internalCost),
          invoiceFile,
          invoiceOriginalName: invoiceOriginalName || invoiceFile,
          addedById: req.userId!,
        },
        include: {
          influencer: { select: { id: true, firstName: true, lastName: true } },
          campaign: { select: { id: true, name: true, brandName: true } },
          addedBy: { select: { id: true, name: true } },
        },
      });
      results.push(created);
    }

    // Emit socket event
    const io = req.app.get('io');
    io.emit('account:entries:added', { entries: results });

    res.status(201).json({ added: results.length, skipped: skipped.length, entries: results, skippedEntries: skipped });
  } catch (error) {
    console.error('Failed to add account entries:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/approve — approve entry and deduct credits from head
router.patch('/:id/approve', authenticate, requireAccountsAccess, requireFinanceApproval, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const entry = await prisma.accountEntry.findUnique({ where: { id } });
    if (!entry) {
      res.status(404).json({ error: 'Account entry not found' });
      return;
    }
    if (entry.status !== 'PENDING') {
      res.status(400).json({ error: 'Only PENDING entries can be approved' });
      return;
    }

    // Atomic: approve entry + deduct credits from the head who added it
    const [updated, updatedUser] = await prisma.$transaction([
      prisma.accountEntry.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById: req.userId!,
          reviewedAt: new Date(),
        },
        include: {
          influencer: { select: { id: true, firstName: true, lastName: true } },
          campaign: { select: { id: true, name: true, brandName: true } },
          addedBy: { select: { id: true, name: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.user.update({
        where: { id: entry.addedById },
        data: { credits: { decrement: entry.internalCost } },
      }),
    ]);

    const io = req.app.get('io');
    io.emit('account:entry:updated', updated);

    // Notify all clients about credit deduction in real-time
    io.emit('credits:updated', {
      userId: entry.addedById,
      credits: updatedUser.credits,
    });

    res.json(updated);
  } catch (error) {
    console.error('Failed to approve account entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/reject — reject entry
router.patch('/:id/reject', authenticate, requireAccountsAccess, requireFinanceApproval, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const entry = await prisma.accountEntry.findUnique({ where: { id } });
    if (!entry) {
      res.status(404).json({ error: 'Account entry not found' });
      return;
    }
    if (entry.status !== 'PENDING') {
      res.status(400).json({ error: 'Only PENDING entries can be rejected' });
      return;
    }

    const updated = await prisma.accountEntry.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: req.userId!,
        reviewedAt: new Date(),
      },
      include: {
        influencer: { select: { id: true, firstName: true, lastName: true } },
        campaign: { select: { id: true, name: true, brandName: true } },
        addedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    const io = req.app.get('io');
    io.emit('account:entry:updated', updated);

    res.json(updated);
  } catch (error) {
    console.error('Failed to reject account entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/notes — update notes
router.patch('/:id/notes', authenticate, requireAccountsAccess, requireFinanceApproval, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const entry = await prisma.accountEntry.findUnique({ where: { id } });
    if (!entry) {
      res.status(404).json({ error: 'Account entry not found' });
      return;
    }

    const updated = await prisma.accountEntry.update({
      where: { id },
      data: { notes: notes || null },
      include: {
        influencer: { select: { id: true, firstName: true, lastName: true } },
        campaign: { select: { id: true, name: true, brandName: true } },
        addedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    const io = req.app.get('io');
    io.emit('account:entry:updated', updated);

    res.json(updated);
  } catch (error) {
    console.error('Failed to update notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id — delete entry
router.delete('/:id', authenticate, requireAccountsAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const entry = await prisma.accountEntry.findUnique({ where: { id } });
    if (!entry) {
      res.status(404).json({ error: 'Account entry not found' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { canApprovePayments: true, role: true },
    });
    const isFinanceOrAdmin = user?.canApprovePayments || user?.role === 'ADMIN';

    if (!isFinanceOrAdmin) {
      if (entry.addedById !== req.userId) {
        res.status(403).json({ error: 'You can only delete your own entries' });
        return;
      }
      if (entry.status !== 'PENDING') {
        res.status(400).json({ error: 'You can only delete PENDING entries' });
        return;
      }
    }

    await prisma.accountEntry.delete({ where: { id } });

    const io = req.app.get('io');
    io.emit('account:entry:deleted', { id });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete account entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
