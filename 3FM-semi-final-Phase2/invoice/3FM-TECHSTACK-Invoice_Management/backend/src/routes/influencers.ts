import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all influencers
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const influencers = await prisma.influencer.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(influencers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch influencers' });
  }
});

// Get single influencer
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const influencer = await prisma.influencer.findUnique({
      where: { id: String(id) }
    });
    if (!influencer) {
      return res.status(404).json({ error: 'Influencer not found' });
    }
    res.json(influencer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch influencer' });
  }
});

// Create new influencer
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      firstName, lastName, igLink, followers, followersUnit,
      avgViews, avgViewsUnit, primaryGenre, secondaryGenre,
      city, state, contact, commercials, gender
    } = req.body;

    // Normalize Instagram link for comparison (trim, lowercase, remove trailing slash, decode URL)
    const normalizedIgLink = decodeURIComponent(igLink.trim().toLowerCase().replace(/\/$/, ''));

    // Check for duplicate Instagram link
    const allInfluencers = await prisma.influencer.findMany();
    const existingInfluencer = allInfluencers.find(inf => {
      const existingNormalized = decodeURIComponent(inf.igLink.trim().toLowerCase().replace(/\/$/, ''));
      return existingNormalized === normalizedIgLink;
    });

    if (existingInfluencer) {
      return res.status(400).json({ 
        error: 'Duplicate Instagram Link', 
        message: `This Instagram link is already associated with ${existingInfluencer.firstName} ${existingInfluencer.lastName}. Each influencer must have a unique Instagram link.` 
      });
    }

    // Convert followers based on unit - store 17K as 17000
    const followersParsed = parseInt(followers);
    let followersNum: number = isNaN(followersParsed) ? 0 : followersParsed;
    if (followersUnit === 'K') followersNum *= 1000;
    if (followersUnit === 'M') followersNum *= 1000000;

    // Convert avgViews if provided
    let avgViewsNum: number | null = null;
    if (avgViews) {
      const avgViewsParsed = parseInt(avgViews);
      if (!isNaN(avgViewsParsed)) {
        avgViewsNum = avgViewsParsed;
        if (avgViewsUnit === 'K') avgViewsNum *= 1000;
        if (avgViewsUnit === 'M') avgViewsNum *= 1000000;
      }
    }

    const influencer = await prisma.influencer.create({
      data: {
        firstName,
        lastName,
        igLink,
        followers: followersNum as number,
        followersUnit: followersUnit || 'K',
        avgViews: avgViewsNum as number | null,
        avgViewsUnit: avgViewsNum ? (avgViewsUnit || 'K') : null,
        primaryGenre,
        secondaryGenre: secondaryGenre || '',
        city,
        state: state || '',
        contact,
        commercials,
        gender,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('influencer:created', influencer);

    res.status(201).json(influencer);
  } catch (error) {
    console.error('Error creating influencer:', error);
    res.status(500).json({ error: 'Failed to create influencer', details: String(error) });
  }
});

// Update influencer
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, igLink, followers, followersUnit,
      avgViews, avgViewsUnit, primaryGenre, secondaryGenre,
      city, state, contact, commercials, gender
    } = req.body;

    // Normalize Instagram link for comparison (trim, lowercase, remove trailing slash, decode URL)
    const normalizedIgLink = decodeURIComponent(igLink.trim().toLowerCase().replace(/\/$/, ''));

    // Check for duplicate Instagram link (excluding current influencer)
    const allInfluencers = await prisma.influencer.findMany({
      where: { id: { not: String(id) } }
    });
    const existingInfluencer = allInfluencers.find(inf => {
      const existingNormalized = decodeURIComponent(inf.igLink.trim().toLowerCase().replace(/\/$/, ''));
      return existingNormalized === normalizedIgLink;
    });

    if (existingInfluencer) {
      return res.status(400).json({ 
        error: 'Duplicate Instagram Link', 
        message: `This Instagram link is already associated with ${existingInfluencer.firstName} ${existingInfluencer.lastName}. Each influencer must have a unique Instagram link.` 
      });
    }

    // Convert followers based on unit - store 17K as 17000
    const followersParsed = parseInt(followers);
    let followersNum: number = isNaN(followersParsed) ? 0 : followersParsed;
    if (followersUnit === 'K') followersNum *= 1000;
    if (followersUnit === 'M') followersNum *= 1000000;

    // Convert avgViews if provided
    let avgViewsNum: number | null = null;
    if (avgViews) {
      const avgViewsParsed = parseInt(avgViews);
      if (!isNaN(avgViewsParsed)) {
        avgViewsNum = avgViewsParsed;
        if (avgViewsUnit === 'K') avgViewsNum *= 1000;
        if (avgViewsUnit === 'M') avgViewsNum *= 1000000;
      }
    }

    const influencer = await prisma.influencer.update({
      where: { id: String(id) },
      data: {
        firstName,
        lastName,
        igLink,
        followers: followersNum as number,
        followersUnit: followersUnit || 'K',
        avgViews: avgViewsNum as number | null,
        avgViewsUnit: avgViewsNum ? (avgViewsUnit || 'K') : null,
        primaryGenre,
        secondaryGenre: secondaryGenre || '',
        city,
        state: state || '',
        contact,
        commercials,
        gender,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('influencer:updated', influencer);

    res.json(influencer);
  } catch (error) {
    console.error('Error updating influencer:', error);
    res.status(500).json({ error: 'Failed to update influencer', details: String(error) });
  }
});

// Delete influencer
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.influencer.delete({
      where: { id: String(id) }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('influencer:deleted', String(id));

    res.json({ message: 'Influencer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete influencer' });
  }
});

export default router;
