import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireRole, attachUserRole, RoleAuthRequest } from '../middleware/roleMiddleware';

const router = Router();
const prisma = new PrismaClient();

// Get current brand user's profile (must be before /:id)
router.get('/my-profile', authenticate, requireRole('BRAND'), async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const brand = await prisma.brand.findFirst({
      where: { userId }
    });

    if (!brand) {
      res.status(404).json({ error: 'Brand profile not found', hasProfile: false });
      return;
    }

    res.json({ ...brand, hasProfile: true });
  } catch (error) {
    console.error('Error fetching brand profile:', error);
    res.status(500).json({ error: 'Failed to fetch brand profile' });
  }
});

// Create brand profile for current user (must be before /:id)
router.post('/my-profile', authenticate, requireRole('BRAND'), async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { name, contactPerson } = req.body;

    // Check if brand profile already exists
    const existingBrand = await prisma.brand.findFirst({
      where: { userId }
    });

    if (existingBrand) {
      res.status(400).json({ error: 'Brand profile already exists' });
      return;
    }

    // Validation
    if (!name) {
      res.status(400).json({ error: 'Brand name is required' });
      return;
    }

    const brand = await prisma.brand.create({
      data: {
        name,
        userId,
        contactPerson: contactPerson || null,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('brand:created', brand);

    res.status(201).json(brand);
  } catch (error) {
    console.error('Error creating brand profile:', error);
    res.status(500).json({ error: 'Failed to create brand profile', details: String(error) });
  }
});

// Update brand profile for current user (must be before /:id)
router.put('/my-profile', authenticate, requireRole('BRAND'), async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { name, contactPerson } = req.body;

    // Find user's brand profile
    const existingBrand = await prisma.brand.findFirst({
      where: { userId }
    });

    if (!existingBrand) {
      res.status(404).json({ error: 'Brand profile not found' });
      return;
    }

    const brand = await prisma.brand.update({
      where: { id: existingBrand.id },
      data: {
        name,
        contactPerson: contactPerson || null,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('brand:updated', brand);

    res.json(brand);
  } catch (error) {
    console.error('Error updating brand profile:', error);
    res.status(500).json({ error: 'Failed to update brand profile' });
  }
});

// Get all brands
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('📋 Fetching all brands...');
    const brands = await prisma.brand.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Found ${brands.length} brands in database`);
    
    // For each brand, get campaigns by brandName (only those added to brand)
    const brandsWithCampaigns = await Promise.all(
      brands.map(async (brand) => {
        const campaigns = await prisma.campaign.findMany({
          where: { 
            brandName: brand.name,
            addedToBrand: true  // Only show campaigns explicitly added to brands
          },
          include: {
            influencers: {
              include: {
                influencer: true
              }
            }
          }
        });
        console.log(`  - ${brand.name}: ${campaigns.length} campaigns (addedToBrand=true)`);
        return {
          ...brand,
          campaigns
        };
      })
    );
    
    // Filter out brands with no campaigns
    const brandsWithAtLeastOneCampaign = brandsWithCampaigns.filter(brand => brand.campaigns.length > 0);
    
    console.log(`✅ Returning ${brandsWithAtLeastOneCampaign.length} brands (filtered from ${brandsWithCampaigns.length} total)`);
    res.json(brandsWithAtLeastOneCampaign);
  } catch (error) {
    console.error('❌ Error fetching brands:', error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// Get single brand with campaigns and influencers
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const brand = await prisma.brand.findUnique({
      where: { id: String(id) }
    });
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Get all campaigns for this brand (by brandName match, only those added to brand)
    const campaignsByName = await prisma.campaign.findMany({
      where: { 
        brandName: brand.name,
        addedToBrand: true  // Only show campaigns explicitly added to brands
      },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    // Get all campaigns pitched to this brand
    const pitches = await prisma.pitch.findMany({
      where: { 
        brandId: brand.id,
        status: { in: ['SENT', 'UNDER_REVIEW', 'ACCEPTED'] } // Only active pitches
      },
      include: {
        campaign: {
          include: {
            influencers: {
              include: {
                influencer: true
              }
            }
          }
        }
      }
    });

    const pitchedCampaigns = pitches
      .map(pitch => pitch.campaign)
      .filter(campaign => campaign !== null); // Filter out deleted campaigns

    // Combine and deduplicate campaigns
    const allCampaignsMap = new Map();
    [...campaignsByName, ...pitchedCampaigns].forEach(campaign => {
      if (campaign) { // Additional null check
        allCampaignsMap.set(campaign.id, campaign);
      }
    });
    const campaigns = Array.from(allCampaignsMap.values());

    res.json({ ...brand, campaigns });
  } catch (error) {
    console.error('Error fetching brand with campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch brand' });
  }
});

// Create new brand
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, contactPerson } = req.body;

    const brand = await prisma.brand.create({
      data: {
        name,
        contactPerson: contactPerson || null,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('brand:created', brand);

    res.status(201).json(brand);
  } catch (error) {
    console.error('Error creating brand:', error);
    res.status(500).json({ error: 'Failed to create brand', details: String(error) });
  }
});

// Update brand
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, contactPerson } = req.body;

    const brand = await prisma.brand.update({
      where: { id: String(id) },
      data: {
        name,
        contactPerson: contactPerson || null,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('brand:updated', brand);

    res.json(brand);
  } catch (error) {
    console.error('Error updating brand:', error);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

// Delete brand
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.brand.delete({
      where: { id: String(id) }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('brand:deleted', id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

export default router;
