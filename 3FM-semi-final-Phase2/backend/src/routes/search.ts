import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ─── GET / – Global search across entities ──────────────────────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
      res.json({ influencers: [], campaigns: [], brands: [], invoices: [] });
      return;
    }

    const [influencers, campaigns, brands, invoices] = await Promise.all([
      prisma.influencer.findMany({
        where: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { igLink: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, igLink: true, primaryGenre: true },
        take: 5,
      }),

      prisma.campaign.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { brandName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, brandName: true, status: true },
        take: 5,
      }),

      prisma.brand.findMany({
        where: {
          name: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, name: true },
        take: 5,
      }),

      prisma.invoice.findMany({
        where: {
          OR: [
            { originalName: { contains: q, mode: 'insensitive' } },
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { folder: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, originalName: true, invoiceNumber: true, folder: true, type: true, status: true },
        take: 5,
      }),
    ]);

    res.json({ influencers, campaigns, brands, invoices });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── GET /trending – Get trending/popular entities ──────────────────────────
router.get('/trending', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [campaigns, influencers, brands] = await Promise.all([
      // Recent active campaigns ordered by creation and popularity
      prisma.campaign.findMany({
        where: { status: 'Active' },
        select: { id: true, name: true, brandName: true, status: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }],
        take: 5,
      }),

      // Most recent influencers (can be enhanced with view count when merged with activity logs)
      prisma.influencer.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          igLink: true,
          primaryGenre: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Top brands by number of campaigns (using raw count)
      prisma.brand.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      campaigns,
      influencers,
      brands
    });
  } catch (error) {
    console.error('Trending search error:', error);
    res.status(500).json({ error: 'Failed to fetch trending items' });
  }
});

export default router;
