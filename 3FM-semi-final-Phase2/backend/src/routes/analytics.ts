import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { attachUserRole, RoleAuthRequest } from '../middleware/roleMiddleware';

const router = Router();
const prisma = new PrismaClient();

// GET /api/analytics — summary stats for dashboard
router.get('/', authenticate, async (req: any, res: Response) => {
  try {
    const [influencers, campaigns] = await Promise.all([
      prisma.influencer.findMany({ select: { followers: true, primaryGenre: true, secondaryGenre: true, createdAt: true } }),
      prisma.campaign.findMany({ select: { status: true, createdAt: true, brandName: true } }),
    ]);

    // Influencer tier breakdown
    const tiers = { nano: 0, micro: 0, macro: 0, mega: 0 };
    for (const inf of influencers) {
      if (inf.followers < 10000) tiers.nano++;
      else if (inf.followers < 100000) tiers.micro++;
      else if (inf.followers < 1000000) tiers.macro++;
      else tiers.mega++;
    }

    // Campaign status breakdown
    const statusCount: Record<string, number> = {};
    for (const c of campaigns) {
      statusCount[c.status] = (statusCount[c.status] || 0) + 1;
    }

    // Top genres
    const genreCount: Record<string, number> = {};
    for (const inf of influencers) {
      if (inf.primaryGenre) genreCount[inf.primaryGenre] = (genreCount[inf.primaryGenre] || 0) + 1;
      if (inf.secondaryGenre) genreCount[inf.secondaryGenre] = (genreCount[inf.secondaryGenre] || 0) + 1;
    }
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre, count]) => ({ genre, count }));

    // Campaigns per month (last 6 months)
    const now = new Date();
    const monthlyData: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en', { month: 'short', year: '2-digit' });
      const count = campaigns.filter((c) => {
        const cd = new Date(c.createdAt);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      }).length;
      monthlyData.push({ month: label, count });
    }

    // Influencers added per month (last 6 months)
    const monthlyInfluencers: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en', { month: 'short', year: '2-digit' });
      const count = influencers.filter((inf) => {
        const cd = new Date(inf.createdAt);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      }).length;
      monthlyInfluencers.push({ month: label, count });
    }

    res.json({
      totalInfluencers: influencers.length,
      totalCampaigns: campaigns.length,
      tiers,
      statusCount,
      topGenres,
      monthlyData,
      monthlyInfluencers,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/analytics/calendar?year=2025&month=2 — live dates for content calendar
router.get('/calendar', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // Build campaign filter based on role
    let campaignWhere: any = {
      endDate: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    };

    // AGENCY heads only see their own campaigns
    if (userRole === 'AGENCY') {
      campaignWhere.userId = userId;
    }

    // Build campaignInfluencer filter
    let ciWhere: any = {
      liveDate: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    };

    // For AGENCY heads, only show live dates from their own campaigns
    if (userRole === 'AGENCY') {
      ciWhere.campaign = { userId };
    }

    const [liveEntries, deadlineCampaigns] = await Promise.all([
      prisma.campaignInfluencer.findMany({
        where: ciWhere,
        include: {
          influencer: { select: { id: true, firstName: true, lastName: true, primaryGenre: true } },
          campaign: { select: { id: true, name: true, brandName: true, status: true, endDate: true } },
        },
      }),
      // Campaigns whose end date falls within this month
      prisma.campaign.findMany({
        where: campaignWhere,
        select: { id: true, name: true, brandName: true, status: true, endDate: true },
      }),
    ]);

    // Build deadline entries for campaigns ending this month
    const deadlineEntries = deadlineCampaigns
      .filter((c) => c.endDate)
      .map((c) => ({
        id: `deadline-${c.id}`,
        liveDate: c.endDate!.toISOString(),
        type: 'deadline' as const,
        influencer: null,
        campaign: { id: c.id, name: c.name, brandName: c.brandName, status: c.status, endDate: c.endDate!.toISOString() },
      }));

    // Tag live entries with type and include endDate in campaign
    const taggedLiveEntries = liveEntries.map((e) => ({
      ...e,
      type: 'liveDate' as const,
      campaign: { ...e.campaign, endDate: e.campaign.endDate ? e.campaign.endDate.toISOString() : null },
    }));

    res.json([...taggedLiveEntries, ...deadlineEntries]);
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

export default router;
