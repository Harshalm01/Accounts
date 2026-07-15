import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  sendMagicLinkEmail,
  sendCreatorInvoiceRejectionEmail,
} from '../services/emailService';

const router = Router();
const prisma = new PrismaClient();

// ─── Multer config for creator invoice uploads ─────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/invoice-files');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const creatorUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, 'creator-' + suffix + path.extname(file.originalname));
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, images, and Word documents are allowed'));
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

// ─── Helper: build magic link URL ─────────────────────────────────────
function buildMagicLink(token: string): string {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/invoice/submit?token=${token}`;
}

// ─── 1. Search campaigns by name (public) ──────────────────────────────
router.get('/campaigns/search', async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string || '').trim();
  if (!q || q.length < 1) {
    res.json({ campaigns: [] });
    return;
  }
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, name: true, brandName: true },
      take: 10,
      orderBy: { name: 'asc' },
    });
    res.json({ campaigns });
  } catch (err) {
    console.error('[CreatorPortal] campaign search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── 2. Creator submits access request (public) ─────────────────────────
router.post('/request', async (req: Request, res: Response): Promise<void> => {
  const { creatorEmail, creatorName, campaignName } = req.body as {
    creatorEmail: string;
    creatorName?: string;
    campaignName: string;
  };

  if (!creatorEmail || !campaignName) {
    res.status(400).json({ error: 'creatorEmail and campaignName are required' });
    return;
  }

  try {
    console.log('📝 [CreatorPortal] Processing creator request:', {
      creatorEmail,
      creatorName,
      campaignName,
    });

    // Find campaign by name (case-insensitive)
    const campaign = await prisma.campaign.findFirst({
      where: {
        name: { contains: campaignName, mode: 'insensitive' },
      },
    });

    if (!campaign) {
      console.warn(`⚠️  Campaign not found: "${campaignName}"`);
      res.status(404).json({ error: `Campaign "${campaignName}" not found` });
      return;
    }

    console.log(`✅ Campaign found: ${campaign.name} (ID: ${campaign.id})`);

    const newRequest = await prisma.creatorInvoiceRequest.create({
      data: {
        creatorEmail,
        creatorName: creatorName || null,
        campaignId: campaign.id,
        influencerId: null,
        status: 'PENDING',
      },
      include: {
        campaign: { select: { id: true, name: true, userId: true } },
      },
    });

    console.log('✉️  [CreatorPortal] New request created:', {
      requestId: newRequest.id,
      creatorEmail,
      campaignId: campaign.id,
      campaignName: campaign.name,
    });

    // Get heads who should be notified
    const campaignHeads = new Set<string>();
    if (newRequest.campaign.userId) {
      campaignHeads.add(newRequest.campaign.userId);
      console.log('   → Added campaign owner:', newRequest.campaign.userId);
    }

    const assignedHeads = await prisma.campaignAssignment.findMany({
      where: { campaignId: campaign.id, status: 'ACCEPTED' },
      select: { headId: true },
    });
    assignedHeads.forEach(ah => {
      campaignHeads.add(ah.headId);
      console.log('      - Added assigned head:', ah.headId);
    });

    if (campaignHeads.size === 0) {
      console.log('   ⚠️  NO HEADS TO NOTIFY - Campaign has no owner and no assigned heads');
    }

    // Prepare notification message
    const creatorFullName = creatorName || creatorEmail;
    const notificationBody = `${creatorFullName} has requested to submit an invoice for "${campaign.name}".`;

    // Create notifications for all relevant heads
    for (const headId of campaignHeads) {
      await prisma.notification.create({
        data: {
          userId: headId,
          type: 'CREATOR_INVOICE_REQUEST',
          title: 'New Creator Invoice Request',
          body: notificationBody,
          entityType: 'CREATOR_REQUEST',
          entityId: newRequest.id,
        },
      });
      console.log('   → Notification created for:', headId);
    }

    const io = req.app.get('io');
    io.emit('creator:request:new', { campaignId: campaign.id, requestId: newRequest.id, creatorEmail, creatorName });

    // Notify specific users with targeted socket event
    for (const headId of campaignHeads) {
      console.log('   → Sending targeted notification to user:', headId);
      io.to(headId).emit(`notification:new:${headId}`, {
        type: 'CREATOR_INVOICE_REQUEST',
        title: 'New Creator Invoice Request',
        body: notificationBody,
      });
    }

    res.json({
      message: 'Request sent! You will receive an email with your invoice link once approved.',
    });
  } catch (err) {
    console.error('[CreatorPortal] create request error details:', {
      message: err instanceof Error ? err.message : String(err),
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// ─── 3. List pending requests for head's campaigns (authenticated) ──────
router.get('/requests', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const campaignIdParam = req.query.campaignId as string | undefined;

  console.log(`📍 [CreatorPortal] GET /requests - User: ${userId}, CampaignId: ${campaignIdParam}`);

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const isAdmin = user?.role === 'ADMIN';
    console.log(`   → User role: ${user?.role}, isAdmin: ${isAdmin}`);

    let whereClause: any = { status: 'PENDING' };
    let allowedCampaignIds: string[] = [];

    if (!isAdmin) {
      const ownedCampaigns = await prisma.campaign.findMany({
        where: { userId },
        select: { id: true },
      });
      const assignedCampaigns = await prisma.campaignAssignment.findMany({
        where: { headId: userId, status: 'ACCEPTED' },
        select: { campaignId: true },
      });
      allowedCampaignIds = [
        ...ownedCampaigns.map((c) => c.id),
        ...assignedCampaigns.map((a) => a.campaignId),
      ];
      console.log(`   → Owned campaigns: ${ownedCampaigns.length}, Assigned campaigns: ${assignedCampaigns.length}`);

      // If specific campaign requested, verify access
      if (campaignIdParam) {
        if (!allowedCampaignIds.includes(campaignIdParam)) {
          console.warn(`   ⚠️  Access denied to campaign: ${campaignIdParam}`);
          res.status(403).json({ error: 'Access denied to this campaign', requests: [] });
          return;
        }
        console.log(`   ✅ Access granted to campaign: ${campaignIdParam}`);
        whereClause.campaignId = campaignIdParam;
      } else {
        // Show all requests for allowed campaigns
        whereClause.campaignId = { in: allowedCampaignIds };
      }
    } else if (campaignIdParam) {
      // Admin can request specific campaign
      console.log(`   → Admin requesting specific campaign: ${campaignIdParam}`);
      whereClause.campaignId = campaignIdParam;
    }

    console.log(`   → Query whereClause:`, whereClause);

    const requests = await prisma.creatorInvoiceRequest.findMany({
      where: whereClause,
      select: {
        id: true,
        creatorEmail: true,
        creatorName: true,
        campaignId: true,
        status: true,
        createdAt: true,
        campaign: { select: { id: true, name: true, brandName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`   → Found ${requests.length} matching requests`);
    console.log(`   → Requests:`, requests);

    res.json({ requests });
  } catch (err) {
    console.error('[CreatorPortal] list requests error:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ─── 4. Head responds to a request (authenticated) ─────────────────────
router.patch('/requests/:id/respond', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { action } = req.body as { action: 'ACCEPT' | 'REJECT' };
  const userId = req.userId!;

  console.log(`🎯 [CreatorPortal] Responding to request: ${id}, Action: ${action}, User: ${userId}`);

  if (!['ACCEPT', 'REJECT'].includes(action)) {
    console.error(`   ❌ Invalid action: ${action}`);
    res.status(400).json({ error: 'action must be ACCEPT or REJECT' });
    return;
  }

  try {
    const request = await prisma.creatorInvoiceRequest.findUnique({
      where: { id },
      include: { campaign: { select: { id: true, name: true, userId: true } } },
    });

    if (!request) {
      console.error(`   ❌ Request not found: ${id}`);
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    console.log(`   → Found request for campaign: ${request.campaign.id}, Creator: ${request.creatorEmail}`);

    if (action === 'REJECT') {
      await prisma.creatorInvoiceRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
      console.log(`   ✅ Request rejected`);
      req.app.get('io').emit('creator:request:updated', { campaignId: request.campaignId, requestId: id, status: 'REJECTED' });
      res.json({ message: 'Request rejected' });
      return;
    }

    // ACCEPT → generate token + send email
    const tokenValue = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    console.log(`   → Creating invoice token, expires at: ${expiresAt}`);
    await prisma.$transaction([
      prisma.creatorInvoiceRequest.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      }),
      prisma.invoiceToken.create({
        data: {
          token: tokenValue,
          requestId: id,
          acceptedByUserId: userId,
          expiresAt,
        },
      }),
    ]);

    const magicLink = buildMagicLink(tokenValue);
    console.log(`   → Magic link generated: ${magicLink}`);

    try {
      await sendMagicLinkEmail(
        request.creatorEmail,
        request.creatorName,
        request.campaign.name,
        magicLink,
      );
      console.log(`   ✅ Magic link email sent to: ${request.creatorEmail}`);
    } catch (emailErr) {
      console.warn('[CreatorPortal] email send failed (non-fatal):', emailErr);
    }

    console.log(`   → Emitting creator:request:updated socket event`);
    req.app.get('io').emit('creator:request:updated', { campaignId: request.campaignId, requestId: id, status: 'ACCEPTED' });

    res.json({ message: 'Request accepted and magic link sent to creator', magicLink });
  } catch (err) {
    console.error('[CreatorPortal] respond request error:', err);
    res.status(500).json({ error: 'Failed to process response' });
  }
});

// ─── 5. Validate token + get campaign/creator info (public) ─────────────
router.get('/submit/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  try {
    const invoiceToken = await prisma.invoiceToken.findUnique({
      where: { token },
      include: {
        request: {
          include: {
            campaign: { select: { id: true, name: true, brandName: true } },
          },
        },
      },
    });

    if (!invoiceToken) {
      res.status(404).json({ error: 'Invalid link' });
      return;
    }

    if (invoiceToken.expiresAt < new Date()) {
      res.status(410).json({ error: 'expired', message: 'This link has expired. Please contact 3Folks Media.' });
      return;
    }

    res.json({
      campaignId: invoiceToken.request.campaign.id,
      campaignName: invoiceToken.request.campaign.name,
      brandName: invoiceToken.request.campaign.brandName,
      creatorEmail: invoiceToken.request.creatorEmail,
      creatorName: invoiceToken.request.creatorName,
      requestId: invoiceToken.requestId,
      acceptedByUserId: invoiceToken.acceptedByUserId,
    });
  } catch (err) {
    console.error('[CreatorPortal] validate token error:', err);
    res.status(500).json({ error: 'Token validation failed' });
  }
});

// ─── 6. Creator submits invoice form (public) ───────────────────────────
router.post('/submit/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  const body = req.body as {
    invoiceType: 'GST' | 'NON_GST';
    invoiceDate?: string;
    invoiceNumber?: string;
    bankName?: string;
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branchName?: string;
    panCard?: string;
    creatorGstin?: string;
    upiId?: string;
    campaignAmount?: string;
    tds?: string;
    netPayable?: string;
    placeOfSupply?: string;
    taxableAmount?: string;
    cgst?: string;
    sgst?: string;
    igst?: string;
    campaignDetails?: string;
  };

  if (!body.invoiceType) {
    res.status(400).json({ error: 'invoiceType is required' });
    return;
  }

  try {
    const invoiceToken = await prisma.invoiceToken.findUnique({
      where: { token },
      include: { request: { include: { campaign: { select: { id: true, name: true } } } } },
    });

    if (!invoiceToken) {
      res.status(404).json({ error: 'Invalid link' });
      return;
    }
    if (invoiceToken.expiresAt < new Date()) {
      res.status(410).json({ error: 'expired', message: 'This link has expired.' });
      return;
    }

    const { request } = invoiceToken;
    const uploadedById = invoiceToken.acceptedByUserId;

    // Match creator name to influencer in this campaign (case-insensitive)
    const creatorName = request.creatorName || request.creatorEmail;
    let matchedInfluencerId: string | null = null;

    if (creatorName) {
      // Normalize: lowercase, trim, and collapse multiple spaces to single space
      const fullInputName = creatorName.toLowerCase().trim().replace(/\s+/g, ' ');
      console.log(`📝 [CreatorPortal] Attempting to match creator: "${creatorName}" (normalized: "${fullInputName}")`);

      const campaignInfluencers = await prisma.campaignInfluencer.findMany({
        where: { campaignId: request.campaign.id },
        include: {
          influencer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      console.log(`   → Found ${campaignInfluencers.length} influencers in campaign`);

      for (const ci of campaignInfluencers) {
        // Normalize influencer name the same way
        const influencerFullName = `${ci.influencer.firstName} ${ci.influencer.lastName}`.toLowerCase().trim().replace(/\s+/g, ' ');
        console.log(`   → Comparing against: "${ci.influencer.firstName} ${ci.influencer.lastName}" (normalized: "${influencerFullName}")`);

        if (influencerFullName === fullInputName) {
          matchedInfluencerId = ci.influencer.id;
          console.log(`✅ MATCH FOUND! Creator "${creatorName}" matched to influencer ID: ${ci.influencer.id}`);
          break;
        }
      }

      if (!matchedInfluencerId) {
        console.warn(`❌ NO MATCH FOUND for creator: "${creatorName}"`);
      }
    }

    // Build scanResults for fields that are not direct columns
    const scanResults: Record<string, { value: string; detected: boolean }> = {};
    const addScanField = (key: string, val?: string) => {
      if (val) scanResults[key] = { value: val, detected: true };
    };
    addScanField('tds', body.tds);
    addScanField('netPayable', body.netPayable);
    addScanField('placeOfSupply', body.placeOfSupply);
    addScanField('taxableAmount', body.taxableAmount);
    addScanField('cgst', body.cgst);
    addScanField('sgst', body.sgst);
    addScanField('igst', body.igst);

    console.log(`📊 [CreatorPortal FORM] About to create invoice with:`, {
      creatorName,
      matchedInfluencerId,
      campaignId: request.campaign.id,
      creatorEmail: request.creatorEmail,
    });

    const invoice = await prisma.invoice.create({
      data: {
        type: body.invoiceType,
        status: 'UPLOADED',
        fileName: `creator-${request.creatorEmail}-${Date.now()}.form`,
        originalName: `Invoice from ${request.creatorEmail}`,
        filePath: '',
        uploadedById,
        campaignId: request.campaign.id,
        creatorRequestId: request.id,
        creatorEmail: request.creatorEmail,
        influencerId: matchedInfluencerId,
        invoiceDate: body.invoiceDate || null,
        invoiceNumber: body.invoiceNumber || null,
        bankName: body.bankName || null,
        accountHolderName: body.accountHolderName || null,
        accountNumber: body.accountNumber || null,
        ifscCode: body.ifscCode || null,
        branchName: body.branchName || null,
        panCard: body.panCard || null,
        creatorGstin: body.creatorGstin || null,
        upiId: body.upiId || null,
        campaignAmount: body.campaignAmount || null,
        campaignDetails: body.campaignDetails || null,
        scanResults: Object.keys(scanResults).length > 0 ? scanResults : undefined,
        folder: 'Creator Submissions',
      },
      include: {
        campaign: { select: { id: true, name: true, userId: true } },
      },
    });

    console.log(`📝 [CreatorPortal FORM SUBMISSION] Invoice created:`, {
      invoiceId: invoice.id,
      creatorEmail: invoice.creatorEmail,
      campaignId: invoice.campaign.id,
      influencerId: invoice.influencerId,
      status: invoice.status,
    });

    // Get heads who should be notified
    const campaignHeads = new Set<string>();
    if (invoice.campaign.userId) {
      campaignHeads.add(invoice.campaign.userId);
    }
    const assignedHeads = await prisma.campaignAssignment.findMany({
      where: { campaignId: invoice.campaign.id, status: 'ACCEPTED' },
      select: { headId: true },
    });
    assignedHeads.forEach(ah => campaignHeads.add(ah.headId));

    // Create notifications and send socket events
    for (const headId of campaignHeads) {
      await prisma.notification.create({
        data: {
          userId: headId,
          type: 'CREATOR_INVOICE_SUBMISSION',
          title: 'New Invoice Submission',
          body: `${request.creatorEmail} has submitted an invoice for "${invoice.campaign.name}".`,
          entityType: 'CREATOR_SUBMISSION',
          entityId: invoice.id,
        },
      });
    }

    const io = req.app.get('io');
    io.emit('creator:submission:new', { campaignId: request.campaign.id, invoiceId: invoice.id });

    // Notify specific users
    for (const headId of campaignHeads) {
      io.to(headId).emit(`notification:new:${headId}`, {
        type: 'CREATOR_INVOICE_SUBMISSION',
        title: 'New Invoice Submission',
        body: `${request.creatorEmail} has submitted an invoice for "${invoice.campaign.name}".`,
      });
    }

    res.json({ message: 'Invoice submitted successfully! The team will review it shortly.', invoiceId: invoice.id });
  } catch (err) {
    console.error('[CreatorPortal] submit invoice error:', err);
    res.status(500).json({ error: 'Failed to submit invoice' });
  }
});

// ─── 6b. Creator uploads invoice file (public) ──────────────────────────
router.post('/submit/:token/upload', creatorUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const invoiceToken = await prisma.invoiceToken.findUnique({
      where: { token },
      include: { request: { include: { campaign: { select: { id: true, name: true } } } } },
    });

    if (!invoiceToken) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: 'Invalid link' });
      return;
    }
    if (invoiceToken.expiresAt < new Date()) {
      fs.unlinkSync(file.path);
      res.status(410).json({ error: 'expired' });
      return;
    }

    const { request } = invoiceToken;
    const { invoiceNumber, invoiceDate, campaignAmount, bankName, accountHolderName, accountNumber, ifscCode, branchName, upiId, panCard, liveLink } = req.body as Record<string, string>;

    if (!liveLink || !liveLink.trim()) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'Live link is required' });
      return;
    }

    // Match creator name to influencer in this campaign (case-insensitive)
    const creatorName = request.creatorName || request.creatorEmail;
    let matchedInfluencerId: string | null = null;

    if (creatorName) {
      // Normalize: lowercase, trim, and collapse multiple spaces to single space
      const fullInputName = creatorName.toLowerCase().trim().replace(/\s+/g, ' ');
      console.log(`📝 [CreatorPortal] Attempting to match creator: "${creatorName}" (normalized: "${fullInputName}")`);

      const campaignInfluencers = await prisma.campaignInfluencer.findMany({
        where: { campaignId: request.campaign.id },
        include: {
          influencer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      console.log(`   → Found ${campaignInfluencers.length} influencers in campaign`);

      for (const ci of campaignInfluencers) {
        // Normalize influencer name the same way
        const influencerFullName = `${ci.influencer.firstName} ${ci.influencer.lastName}`.toLowerCase().trim().replace(/\s+/g, ' ');
        console.log(`   → Comparing against: "${ci.influencer.firstName} ${ci.influencer.lastName}" (normalized: "${influencerFullName}")`);

        if (influencerFullName === fullInputName) {
          matchedInfluencerId = ci.influencer.id;
          console.log(`✅ MATCH FOUND! Creator "${creatorName}" matched to influencer ID: ${ci.influencer.id}`);
          break;
        }
      }

      if (!matchedInfluencerId) {
        console.warn(`❌ NO MATCH FOUND for creator: "${creatorName}"`);
      }
    }

    console.log(`📊 [CreatorPortal FILE UPLOAD] About to create invoice with:`, {
      creatorName,
      matchedInfluencerId,
      campaignId: request.campaign.id,
      creatorEmail: request.creatorEmail,
      liveLink: liveLink,
    });

    const invoice = await prisma.invoice.create({
      data: {
        campaignId: request.campaign.id,
        uploadedById: invoiceToken.acceptedByUserId,
        creatorRequestId: request.id,
        creatorEmail: request.creatorEmail,
        influencerId: matchedInfluencerId,
        liveLink: liveLink.trim(),
        status: 'UPLOADED',
        type: 'NON_GST',
        fileName: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        invoiceNumber: invoiceNumber || null,
        invoiceDate: invoiceDate || null,
        campaignAmount: campaignAmount ? Number(campaignAmount) : null,
        bankName: bankName || null,
        accountHolderName: accountHolderName || null,
        accountNumber: accountNumber || null,
        ifscCode: ifscCode || null,
        branchName: branchName || null,
        upiId: upiId || null,
        panCard: panCard || null,
        campaignDetails: `Uploaded by creator for campaign: ${request.campaign.name}`,
        folder: 'Creator Submissions',
      },
      include: {
        campaign: { select: { id: true, name: true, userId: true } },
      },
    });

    console.log(`📝 [CreatorPortal FILE UPLOAD] Invoice created:`, {
      invoiceId: invoice.id,
      creatorEmail: invoice.creatorEmail,
      campaignId: invoice.campaign.id,
      influencerId: invoice.influencerId,
      status: invoice.status,
    });

    // Get heads who should be notified
    const campaignHeads = new Set<string>();
    if (invoice.campaign.userId) {
      campaignHeads.add(invoice.campaign.userId);
    }
    const assignedHeads = await prisma.campaignAssignment.findMany({
      where: { campaignId: invoice.campaign.id, status: 'ACCEPTED' },
      select: { headId: true },
    });
    assignedHeads.forEach(ah => campaignHeads.add(ah.headId));

    // Create notifications and send socket events
    for (const headId of campaignHeads) {
      await prisma.notification.create({
        data: {
          userId: headId,
          type: 'CREATOR_INVOICE_SUBMISSION',
          title: 'New Invoice Submission',
          body: `${request.creatorEmail} has submitted an invoice for "${invoice.campaign.name}".`,
          entityType: 'CREATOR_SUBMISSION',
          entityId: invoice.id,
        },
      });
    }

    const io = req.app.get('io');
    io.emit('creator:submission:new', { campaignId: request.campaign.id, invoiceId: invoice.id });

    // Notify specific users
    for (const headId of campaignHeads) {
      io.to(headId).emit(`notification:new:${headId}`, {
        type: 'CREATOR_INVOICE_SUBMISSION',
        title: 'New Invoice Submission',
        body: `${request.creatorEmail} has submitted an invoice for "${invoice.campaign.name}".`,
      });
    }

    res.json({ message: 'Invoice uploaded successfully! The team will review it shortly.', invoiceId: invoice.id });
  } catch (err) {
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    console.error('[CreatorPortal] upload invoice error:', err);
    res.status(500).json({ error: 'Failed to upload invoice' });
  }
});

// ─── 7. Head views creator submissions for their campaigns (authenticated) ──
router.get('/submissions', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;
  const campaignIdParam = req.query.campaignId as string | undefined;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const isAdmin = user?.role === 'ADMIN';

    let whereClause: any = { creatorRequestId: { not: null } };
    let allowedCampaignIds: string[] = [];

    if (!isAdmin) {
      const ownedCampaigns = await prisma.campaign.findMany({
        where: { userId },
        select: { id: true },
      });
      const assignedCampaigns = await prisma.campaignAssignment.findMany({
        where: { headId: userId, status: 'ACCEPTED' },
        select: { campaignId: true },
      });
      allowedCampaignIds = [
        ...ownedCampaigns.map((c) => c.id),
        ...assignedCampaigns.map((a) => a.campaignId),
      ];

      // If specific campaign requested, verify access
      if (campaignIdParam) {
        if (!allowedCampaignIds.includes(campaignIdParam)) {
          res.status(403).json({ error: 'Access denied to this campaign', submissions: [] });
          return;
        }
        whereClause.campaignId = campaignIdParam;
      } else {
        // Show all submissions for allowed campaigns
        whereClause.campaignId = { in: allowedCampaignIds };
      }
    } else if (campaignIdParam) {
      // Admin can request specific campaign
      whereClause.campaignId = campaignIdParam;
    }

    const submissions = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        campaign: { select: { id: true, name: true } },
        creatorRequest: { select: { creatorEmail: true, creatorName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ submissions });
  } catch (err) {
    console.error('[CreatorPortal] list submissions error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ─── 8. Head approves or rejects a creator submission (authenticated) ───
router.patch('/submissions/:invoiceId/review', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { invoiceId } = req.params;
  const { action, comment } = req.body as { action: 'APPROVE' | 'REJECT'; comment?: string };

  if (!['APPROVE', 'REJECT'].includes(action)) {
    res.status(400).json({ error: 'action must be APPROVE or REJECT' });
    return;
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        campaign: { select: { name: true } },
        creatorRequest: {
          include: {
            token: { select: { token: true } },
          },
        },
      },
    });

    if (!invoice || !invoice.creatorRequestId) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    if (action === 'APPROVE') {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'APPROVED', rejectionComment: null },
      });
      req.app.get('io').emit('creator:submission:updated', { campaignId: invoice.campaignId, invoiceId, status: 'APPROVED' });
      res.json({ message: 'Invoice approved' });
      return;
    }

    // REJECT
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'REJECTED', rejectionComment: comment },
    });

    // Send rejection email with resubmit link
    if (invoice.creatorEmail && invoice.creatorRequest?.token?.token) {
      const magicLink = buildMagicLink(invoice.creatorRequest.token.token);
      try {
        await sendCreatorInvoiceRejectionEmail(
          invoice.creatorEmail,
          invoice.creatorRequest.creatorName,
          invoice.campaign?.name || 'your campaign',
          comment!,
          magicLink,
        );
      } catch (emailErr) {
        console.warn('[CreatorPortal] rejection email failed (non-fatal):', emailErr);
      }
    }

    req.app.get('io').emit('creator:submission:updated', { campaignId: invoice.campaignId, invoiceId, status: 'REJECTED' });
    res.json({ message: 'Invoice rejected and creator notified' });
  } catch (err) {
    console.error('[CreatorPortal] review submission error:', err);
    res.status(500).json({ error: 'Failed to review submission' });
  }
});

export default router;
