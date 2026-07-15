import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helper: generate a random 10-character hex code
// ---------------------------------------------------------------------------
function generateCode(): string {
  return crypto.randomBytes(5).toString('hex');
}

// ---------------------------------------------------------------------------
// POST /generate  –  Create or return existing QR code for a campaign+influencer
// ---------------------------------------------------------------------------
router.post('/generate', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, influencerId, targetUrl } = req.body;

    if (!campaignId || !influencerId) {
      res.status(400).json({ error: 'campaignId and influencerId are required' });
      return;
    }

    const qrCode = await prisma.qRCode.upsert({
      where: {
        campaignId_influencerId: { campaignId, influencerId },
      },
      update: {
        // If a new targetUrl is provided, update it; otherwise keep existing
        ...(targetUrl !== undefined ? { targetUrl } : {}),
      },
      create: {
        code: generateCode(),
        campaignId,
        influencerId,
        targetUrl: targetUrl || null,
      },
      include: {
        campaign: { select: { id: true, name: true } },
        influencer: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(qrCode);
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ---------------------------------------------------------------------------
// POST /generate-bulk  –  Generate QR codes for multiple influencers at once
// ---------------------------------------------------------------------------
router.post('/generate-bulk', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, influencerIds, targetUrl } = req.body;

    if (!campaignId || !Array.isArray(influencerIds) || influencerIds.length === 0) {
      res.status(400).json({ error: 'campaignId and a non-empty influencerIds array are required' });
      return;
    }

    const results = await Promise.all(
      influencerIds.map((influencerId: string) =>
        prisma.qRCode.upsert({
          where: {
            campaignId_influencerId: { campaignId, influencerId },
          },
          update: {
            ...(targetUrl !== undefined ? { targetUrl } : {}),
          },
          create: {
            code: generateCode(),
            campaignId,
            influencerId,
            targetUrl: targetUrl || null,
          },
          include: {
            campaign: { select: { id: true, name: true } },
            influencer: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      )
    );

    res.json(results);
  } catch (error) {
    console.error('Error generating bulk QR codes:', error);
    res.status(500).json({ error: 'Failed to generate QR codes in bulk' });
  }
});

// ---------------------------------------------------------------------------
// GET /scan/:code  –  Public endpoint: log a scan, increment counters, redirect
// ---------------------------------------------------------------------------
router.get('/scan/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;

    const qrCode = await prisma.qRCode.findUnique({
      where: { code },
    });

    if (!qrCode) {
      res.status(404).json({ error: 'QR code not found' });
      return;
    }

    const fwd = req.headers['x-forwarded-for'];
    const ipAddress = (typeof fwd === 'string' ? fwd : Array.isArray(fwd) ? fwd[0] : '')?.split(',')[0]?.trim() || req.ip || null;
    const userAgent = req.headers['user-agent'] || null;

    // Determine if this is a unique scan (no matching IP+userAgent in last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let isUnique = true;

    if (ipAddress && userAgent) {
      const existingScan = await prisma.qRScan.findFirst({
        where: {
          qrCodeId: qrCode.id,
          ipAddress,
          userAgent,
          createdAt: { gte: twentyFourHoursAgo },
        },
      });
      if (existingScan) {
        isUnique = false;
      }
    }

    // Create the scan record and update counters in a transaction
    await prisma.$transaction([
      prisma.qRScan.create({
        data: {
          qrCodeId: qrCode.id,
          ipAddress,
          userAgent,
        },
      }),
      prisma.qRCode.update({
        where: { id: qrCode.id },
        data: {
          scanCount: { increment: 1 },
          ...(isUnique ? { uniqueScans: { increment: 1 } } : {}),
        },
      }),
    ]);

    // Redirect to target URL if present, otherwise return a simple HTML page
    if (qrCode.targetUrl) {
      res.redirect(qrCode.targetUrl);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>QR Scan Recorded</title></head>
          <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
            <div style="text-align:center;">
              <h1>Scan Recorded</h1>
              <p>Thank you! Your scan has been registered.</p>
            </div>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error processing QR scan:', error);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});

// ---------------------------------------------------------------------------
// GET /stats/:campaignId  –  Return QR codes + scan data for a campaign
// ---------------------------------------------------------------------------
router.get('/stats/:campaignId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    const qrCodes = await prisma.qRCode.findMany({
      where: { campaignId },
      include: {
        influencer: {
          select: { id: true, firstName: true, lastName: true },
        },
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 50, // Return last 50 scans per QR code
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(qrCodes);
  } catch (error) {
    console.error('Error fetching QR stats:', error);
    res.status(500).json({ error: 'Failed to fetch QR code statistics' });
  }
});

export default router;
