import { Router, Response } from 'express';
import { PrismaClient, PitchStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireRole, attachUserRole, RoleAuthRequest } from '../middleware/roleMiddleware';

const router = Router();
const prisma = new PrismaClient();

// Get all pitches (role-based filtering)
router.get('/', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole!;

    let pitches;

    if (userRole === 'ADMIN') {
      // Admins see all pitches
      pitches = await prisma.pitch.findMany({
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              brandName: true,
              budget: true,
              externalCost: true,
              internalCost: true,
              startDate: true,
              endDate: true,
            }
          },
          brand: {
            select: {
              id: true,
              name: true,
            }
          },
          agency: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (userRole === 'AGENCY') {
      // Agencies see pitches they've sent
      pitches = await prisma.pitch.findMany({
        where: { agencyId: userId },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              brandName: true,
              budget: true,
              externalCost: true,
              internalCost: true,
              startDate: true,
              endDate: true,
            }
          },
          brand: {
            select: {
              id: true,
              name: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (userRole === 'BRAND') {
      // Brands see pitches sent to them
      pitches = await prisma.pitch.findMany({
        where: { brandUserId: userId },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              brandName: true,
              budget: true,
              externalCost: true,
              internalCost: true,
              startDate: true,
              endDate: true,
            }
          },
          brand: {
            select: {
              id: true,
              name: true,
            }
          },
          agency: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(pitches);
  } catch (error) {
    console.error('Error fetching pitches:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific pitch
router.get('/:id', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pitchId = String(id);
    const userId = req.userId!;
    const userRole = req.userRole!;

    const pitch = await prisma.pitch.findUnique({
      where: { id: pitchId },
      include: {
        campaign: true,
        brand: true,
        agency: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    if (!pitch) {
      res.status(404).json({ error: 'Pitch not found' });
      return;
    }

    // Check access rights
    if (userRole === 'AGENCY' && pitch.agencyId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (userRole === 'BRAND' && pitch.brandUserId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(pitch);
  } catch (error) {
    console.error('Error fetching pitch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new pitch (Agency only)
router.post('/', authenticate, requireRole('AGENCY', 'ADMIN'), async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const { campaignId, brandId, message, proposedBudget, expectedDeliverables, timeline, notes } = req.body;
    const agencyId = req.userId!;

    if (!campaignId || !brandId) {
      res.status(400).json({ error: 'Campaign ID and Brand ID are required' });
      return;
    }

    // Verify campaign exists and belongs to the agency
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    if (req.userRole !== 'ADMIN' && campaign.userId !== agencyId) {
      res.status(403).json({ error: 'You can only pitch your own campaigns' });
      return;
    }

    // Verify brand exists
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, userId: true }
    });

    if (!brand) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }

    // Check if pitch already exists
    const existingPitch = await prisma.pitch.findUnique({
      where: {
        campaignId_brandId: {
          campaignId,
          brandId
        }
      }
    });

    if (existingPitch) {
      res.status(400).json({ error: 'A pitch for this campaign to this brand already exists' });
      return;
    }

    // Create the pitch
    const pitch = await prisma.pitch.create({
      data: {
        campaignId,
        brandId,
        agencyId,
        brandUserId: brand.userId || null,
        message,
        proposedBudget,
        expectedDeliverables,
        timeline,
        notes,
        status: 'DRAFT'
      },
      include: {
        campaign: true,
        brand: true,
        agency: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    res.status(201).json(pitch);
  } catch (error) {
    console.error('Error creating pitch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update pitch status (Brand can accept/reject, Agency can update draft)
router.patch('/:id/status', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pitchId = String(id);
    const { status } = req.body;
    const userId = req.userId!;
    const userRole = req.userRole!;

    if (!status || !['DRAFT', 'SENT', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const pitch = await prisma.pitch.findUnique({
      where: { id: pitchId }
    });

    if (!pitch) {
      res.status(404).json({ error: 'Pitch not found' });
      return;
    }

    // Agencies can update their own pitches to DRAFT or SENT
    if (userRole === 'AGENCY' && pitch.agencyId === userId) {
      if (!['DRAFT', 'SENT'].includes(status)) {
        res.status(403).json({ error: 'Agencies can only set status to DRAFT or SENT' });
        return;
      }
    }
    // Brands can update pitches sent to them to UNDER_REVIEW, ACCEPTED, or REJECTED
    else if (userRole === 'BRAND' && pitch.brandUserId === userId) {
      if (!['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'].includes(status)) {
        res.status(403).json({ error: 'Brands can only set status to UNDER_REVIEW, ACCEPTED, or REJECTED' });
        return;
      }
    }
    // Admins can update to any status
    else if (userRole !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updatedPitch = await prisma.pitch.update({
      where: { id: pitchId },
      data: { status: status as PitchStatus },
      include: {
        campaign: true,
        brand: true,
        agency: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    res.json(updatedPitch);
  } catch (error) {
    console.error('Error updating pitch status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update pitch details (Agency only for their own pitches)
router.put('/:id', authenticate, requireRole('AGENCY', 'ADMIN'), async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pitchId = String(id);
    const { message, proposedBudget, expectedDeliverables, timeline, notes } = req.body;
    const userId = req.userId!;
    const userRole = req.userRole!;

    const pitch = await prisma.pitch.findUnique({
      where: { id: pitchId }
    });

    if (!pitch) {
      res.status(404).json({ error: 'Pitch not found' });
      return;
    }

    if (userRole !== 'ADMIN' && pitch.agencyId !== userId) {
      res.status(403).json({ error: 'You can only update your own pitches' });
      return;
    }

    if (pitch.status !== 'DRAFT') {
      res.status(400).json({ error: 'Can only update pitches in DRAFT status' });
      return;
    }

    const updatedPitch = await prisma.pitch.update({
      where: { id: pitchId },
      data: {
        message,
        proposedBudget,
        expectedDeliverables,
        timeline,
        notes
      },
      include: {
        campaign: true,
        brand: true,
        agency: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    res.json(updatedPitch);
  } catch (error) {
    console.error('Error updating pitch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete pitch (Agency only for their own drafts)
router.delete('/:id', authenticate, requireRole('AGENCY', 'ADMIN'), async (req: RoleAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pitchId = String(id);
    const userId = req.userId!;
    const userRole = req.userRole!;

    const pitch = await prisma.pitch.findUnique({
      where: { id: pitchId }
    });

    if (!pitch) {
      res.status(404).json({ error: 'Pitch not found' });
      return;
    }

    if (userRole !== 'ADMIN' && pitch.agencyId !== userId) {
      res.status(403).json({ error: 'You can only delete your own pitches' });
      return;
    }

    if (pitch.status !== 'DRAFT') {
      res.status(400).json({ error: 'Can only delete pitches in DRAFT status' });
      return;
    }

    await prisma.pitch.delete({
      where: { id: pitchId }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting pitch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
