import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { attachUserRole, RoleAuthRequest } from '../middleware/roleMiddleware';

const router = Router();
const prisma = new PrismaClient();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/invoices');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for invoice file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'invoice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const allowedExtensions = ['.pdf', '.doc', '.docx'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Get all campaigns (filtered by role)
router.get('/', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole;

    let campaigns;

    if (userRole === 'ADMIN') {
      // Admins see all campaigns
      campaigns = await prisma.campaign.findMany({
        include: {
          influencers: {
            include: {
              influencer: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (userRole === 'AGENCY') {
      // Heads see ALL campaigns but without the campaign password
      const raw = await prisma.campaign.findMany({
        include: {
          influencers: {
            include: {
              influencer: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      // Strip campaignPassword — verification is done server-side via /verify-access
      campaigns = raw.map(({ campaignPassword: _pw, ...rest }) => rest);
    } else if (userRole === 'BRAND') {
      // Brands see only campaigns pitched to them
      const pitches = await prisma.pitch.findMany({
        where: {
          brandUserId: userId,
          status: { in: ['SENT', 'UNDER_REVIEW', 'ACCEPTED'] }
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
      campaigns = pitches.map(pitch => pitch.campaign);
    } else if (userRole === 'EMPLOYEE') {
      // Employees only see campaigns they have ACCEPTED assignments for
      const accepted = await prisma.campaignAssignment.findMany({
        where: { headId: userId, status: 'ACCEPTED' },
        select: { campaignId: true },
      });
      const ids = accepted.map((a) => a.campaignId);
      if (ids.length === 0) {
        campaigns = [];
      } else {
        const raw = await prisma.campaign.findMany({
          where: { id: { in: ids } },
          include: { influencers: { include: { influencer: true } } },
          orderBy: { createdAt: 'desc' },
        });
        campaigns = raw.map(({ campaignPassword: _pw, ...rest }) => rest);
      }
    } else {
      campaigns = [];
    }

    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign (with role-based access check)
router.get('/:id', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole;

    const campaign = await prisma.campaign.findUnique({
      where: { id: String(id) },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Check access rights
    if (userRole === 'AGENCY') {
      // Heads can view any campaign — strip the password from response
      const { campaignPassword: _pw, ...safeCampaign } = campaign;
      return res.json(safeCampaign);
    }

    if (userRole === 'EMPLOYEE') {
      // Employees can only view campaigns they have an ACCEPTED assignment for
      const assignment = await prisma.campaignAssignment.findFirst({
        where: { campaignId: id, headId: userId, status: 'ACCEPTED' },
      });
      if (!assignment) return res.status(403).json({ error: 'Access denied' });
      const { campaignPassword: _pw, ...safeCampaign } = campaign;
      return res.json(safeCampaign);
    }

    if (userRole === 'BRAND') {
      // Brands can only see campaigns pitched to them
      const pitch = await prisma.pitch.findFirst({
        where: {
          campaignId: id,
          brandUserId: userId,
          status: { in: ['SENT', 'UNDER_REVIEW', 'ACCEPTED'] }
        }
      });

      if (!pitch) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(campaign);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Get influencers for a campaign
router.get('/:id/influencers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const campaignInfluencers = await prisma.campaignInfluencer.findMany({
      where: { campaignId: String(id) },
      include: {
        influencer: true
      }
    });
    
    // Return flat array with influencer data plus liveLink and invoices
    const enrichedInfluencers = campaignInfluencers.map(ci => ({
      ...ci.influencer,
      liveLink: ci.liveLink,
      invoices: ci.invoices,
      campaignInfluencerId: ci.id
    }));
    
    res.json(enrichedInfluencers);
  } catch (error) {
    console.error('Failed to fetch campaign influencers:', error);
    res.status(500).json({ error: 'Failed to fetch campaign influencers' });
  }
});

// Verify campaign access credentials (server-side check for AGENCY heads)
router.post('/:id/verify-access', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { campaignId, password } = req.body;

    const campaign = await prisma.campaign.findUnique({ where: { id: String(id) } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // If no credentials configured, access is open
    if (!campaign.campaignId || !campaign.campaignPassword) {
      return res.json({ verified: true });
    }

    if (campaign.campaignId !== campaignId || campaign.campaignPassword !== password) {
      return res.status(401).json({ error: 'Invalid Campaign ID or Password' });
    }

    res.json({ verified: true });
  } catch (error) {
    console.error('Error verifying campaign access:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Create new campaign
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, contact, contactDetails, brandName, campaignId, campaignPassword, budget, internalCost, externalCost, status, startDate, endDate, influencerIds } = req.body;
    const userId = (req as any).userId;

    // Block employees from creating campaigns
    const creator = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (creator?.role === 'EMPLOYEE') {
      return res.status(403).json({ error: 'Employees cannot create campaigns' });
    }

    // Validate required fields
    if (!campaignId || !campaignPassword) {
      return res.status(400).json({ error: 'Campaign ID and Campaign Password are required' });
    }
    if (!contactDetails) {
      return res.status(400).json({ error: 'Contact Phone Number is required' });
    }
    if (!/^[0-9]{10}$/.test(contactDetails)) {
      return res.status(400).json({ error: 'Contact Phone Number must be a valid 10-digit number' });
    }

    // Brands are only created when campaign is explicitly added to brand via "Add to Brand" button
    // No auto-brand-creation here

    const campaign = await prisma.campaign.create({
      data: {
        name,
        brandName,
        userId, // Set the userId from authenticated user
        ...(budget !== undefined && budget !== null && { budget: parseFloat(budget) }),
        ...(contact && { contact }),
        contactDetails,
        campaignId,
        campaignPassword,
        addedToBrand: false,  // Default to false, must explicitly add to brand
        internalCost: parseFloat(internalCost),
        externalCost: parseFloat(externalCost),
        status: status || 'Upcoming',
        startDate: new Date(startDate),
        ...(endDate && { endDate: new Date(endDate) })
      },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    // Add influencers if provided
    if (influencerIds && influencerIds.length > 0) {
      await prisma.campaignInfluencer.createMany({
        data: influencerIds.map((influencerId: string) => ({
          campaignId: campaign.id,
          influencerId
        }))
      });
    }

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:created', campaign);

    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, contact, contactDetails, brandName, campaignId, campaignPassword, budget, internalCost, externalCost, status, startDate, endDate, brief } = req.body;

    // Validate required fields
    if (!campaignId || !campaignPassword) {
      return res.status(400).json({ error: 'Campaign ID and Campaign Password are required' });
    }
    if (!contactDetails) {
      return res.status(400).json({ error: 'Contact Phone Number is required' });
    }
    if (!/^[0-9]{10}$/.test(contactDetails)) {
      return res.status(400).json({ error: 'Contact Phone Number must be a valid 10-digit number' });
    }

    // Update brand's contactPerson if contact is provided
    if (contact && brandName) {
      const brand = await prisma.brand.findFirst({
        where: { name: brandName }
      });
      if (brand) {
        await prisma.brand.update({
          where: { id: brand.id },
          data: { contactPerson: contact }
        });
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: {
        name,
        brandName,
        ...(budget !== undefined && budget !== null && { budget: parseFloat(budget) }),
        contact,
        contactDetails,
        campaignId,
        campaignPassword,
        internalCost: parseFloat(internalCost),
        externalCost: parseFloat(externalCost),
        status,
        startDate: new Date(startDate),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(brief !== undefined && { brief })
      },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:updated', campaign);

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`🗑️  Deleting campaign ID: ${id}`);
    
    // Get campaign info before deletion for logging
    const campaign = await prisma.campaign.findUnique({
      where: { id: String(id) }
    });
    console.log(`Campaign to delete: ${campaign?.name} (Brand: ${campaign?.brandName})`);
    
    // Delete related pitches first (even though cascade delete should handle it)
    await prisma.pitch.deleteMany({
      where: { campaignId: String(id) }
    });
    
    // Delete campaign
    await prisma.campaign.delete({
      where: { id: String(id) }
    });
    console.log(`✅ Campaign deleted from database`);

    // Emit socket event for real-time update
    const io = req.app.get('io');
    console.log(`📡 Emitting socket event: campaign:deleted with ID: ${id}`);
    io.emit('campaign:deleted', String(id));

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Toggle "Add to Brand" status
router.patch('/:id/toggle-brand', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    console.log(`🔄 Toggling brand status for campaign ID: ${id}`);
    
    // Get current campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: String(id) }
    });
    
    if (!campaign) {
      console.error(`❌ Campaign not found: ${id}`);
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    console.log(`📊 Current campaign status: addedToBrand = ${campaign.addedToBrand}`);
    
    // If adding to brand, create brand entry if it doesn't exist
    if (!campaign.addedToBrand) {
      console.log(`🏢 Checking if brand "${campaign.brandName}" exists...`);
      const existingBrand = await prisma.brand.findFirst({
        where: { name: campaign.brandName }
      });

      if (!existingBrand) {
        console.log(`➕ Creating new brand: ${campaign.brandName}`);
        await prisma.brand.create({
          data: {
            name: campaign.brandName,
            contactPerson: campaign.contact,
          }
        });
        console.log(`✅ Brand created: ${campaign.brandName}`);
      } else {
        console.log(`📊 Brand already exists: ${campaign.brandName}`);
        // Update contact person if provided
        if (campaign.contact) {
          await prisma.brand.update({
            where: { id: existingBrand.id },
            data: { contactPerson: campaign.contact }
          });
          console.log(`📝 Updated contact person for brand: ${campaign.brandName}`);
        }
      }
    }
    
    // Toggle the addedToBrand status
    const updatedCampaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: { addedToBrand: !campaign.addedToBrand },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });
    
    console.log(`✅ Campaign "${campaign.name}" ${updatedCampaign.addedToBrand ? 'added to' : 'removed from'} brand "${campaign.brandName}"`);
    console.log(`📊 New campaign status: addedToBrand = ${updatedCampaign.addedToBrand}`);
    console.log(`📋 Updated campaign details:`, JSON.stringify({
      id: updatedCampaign.id,
      name: updatedCampaign.name,
      brandName: updatedCampaign.brandName,
      addedToBrand: updatedCampaign.addedToBrand,
      influencersCount: updatedCampaign.influencers.length
    }, null, 2));
    
    // Emit socket events for real-time update
    const io = req.app.get('io');
    if (updatedCampaign.addedToBrand) {
      console.log(`📡 Emitting 'campaign:added-to-brand' event for campaign:`, campaign.id);
      io.emit('campaign:added-to-brand', updatedCampaign);
      console.log(`✅ Event emitted successfully`);
    } else {
      console.log(`📡 Emitting 'campaign:removed-from-brand' event for campaign:`, campaign.id);
      io.emit('campaign:removed-from-brand', updatedCampaign);
      console.log(`✅ Event emitted successfully`);
    }
    
    res.json(updatedCampaign);
  } catch (error) {
    console.error('Error toggling brand status:', error);
    res.status(500).json({ error: 'Failed to toggle brand status' });
  }
});

// Add influencer to campaign
router.post('/:id/influencers/:influencerId', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, influencerId } = req.params;
    const { liveLink, invoices } = req.body;
    
    // Create junction table entry
    await prisma.campaignInfluencer.create({
      data: {
        campaignId: String(id),
        influencerId: String(influencerId),
        liveLink: liveLink || null,
        invoices: invoices || null
      }
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: String(id) },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:influencer:added', { campaignId: String(id), influencerId: String(influencerId), campaign });

    res.json(campaign);
  } catch (error) {
    console.error('Failed to add influencer to campaign:', error);
    res.status(500).json({ error: 'Failed to add influencer to campaign' });
  }
});

// Remove influencer from campaign
router.delete('/:id/influencers/:influencerId', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, influencerId } = req.params;
    
    // Delete junction table entry
    await prisma.campaignInfluencer.deleteMany({
      where: {
        campaignId: String(id),
        influencerId: String(influencerId)
      }
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: String(id) },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:influencer:removed', { campaignId: String(id), influencerId: String(influencerId), campaign });

    res.json(campaign);
  } catch (error) {
    console.error('Failed to remove influencer from campaign:', error);
    res.status(500).json({ error: 'Failed to remove influencer from campaign' });
  }
});

// Batch add influencers to campaign
router.post('/batch-add-influencers', authenticate, async (req: Request, res: Response) => {
  try {
    const { campaignId, influencerIds } = req.body;

    // Create junction table entries for all influencers
    await prisma.campaignInfluencer.createMany({
      data: influencerIds.map((influencerId: string) => ({
        campaignId,
        influencerId
      })),
      skipDuplicates: true
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        }
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:influencers:added', { campaignId, influencerIds, campaign });

    res.json(campaign);
  } catch (error) {
    console.error('Failed to add influencers to campaign:', error);
    res.status(500).json({ error: 'Failed to add influencers to campaign' });
  }
});

// Update campaign-influencer details (liveLink, invoices)
router.put('/:id/influencers/:influencerId/details', async (req: Request, res: Response) => {
  try {
    const { id, influencerId } = req.params;
    const { liveLink, invoices } = req.body;

    const campaignInfluencer = await prisma.campaignInfluencer.updateMany({
      where: {
        campaignId: String(id),
        influencerId: String(influencerId)
      },
      data: {
        ...(liveLink !== undefined && { liveLink }),
        ...(invoices !== undefined && { invoices })
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:influencer:updated', { campaignId: String(id), influencerId: String(influencerId) });

    res.json({ message: 'Campaign influencer details updated', campaignInfluencer });
  } catch (error) {
    console.error('Failed to update campaign influencer details:', error);
    res.status(500).json({ error: 'Failed to update campaign influencer details' });
  }
});

// Upload invoice file
router.post('/:id/influencers/:influencerId/invoice', upload.single('invoice'), async (req: Request, res: Response) => {
  try {
    const { id, influencerId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get existing invoices
    const campaignInfluencer = await prisma.campaignInfluencer.findFirst({
      where: {
        campaignId: String(id),
        influencerId: String(influencerId)
      }
    });

    if (!campaignInfluencer) {
      return res.status(404).json({ error: 'Campaign influencer not found' });
    }

    // Add new invoice to existing list
    const existingInvoices = (campaignInfluencer.invoices as any) || [];
    const newInvoice = {
      id: Date.now().toString(),
      filename: req.file.originalname,
      filepath: req.file.filename,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };

    const updatedInvoices = Array.isArray(existingInvoices) ? [...existingInvoices, newInvoice] : [newInvoice];

    await prisma.campaignInfluencer.updateMany({
      where: {
        campaignId: String(id),
        influencerId: String(influencerId)
      },
      data: {
        invoices: updatedInvoices
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('campaign:influencer:updated', { campaignId: String(id), influencerId: String(influencerId) });

    res.json({ message: 'Invoice uploaded successfully', invoice: newInvoice });
  } catch (error) {
    console.error('Failed to upload invoice:', error);
    res.status(500).json({ error: 'Failed to upload invoice' });
  }
});

// Download invoice file
router.get('/:id/influencers/:influencerId/invoice/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath);
  } catch (error) {
    console.error('Failed to download invoice:', error);
    res.status(500).json({ error: 'Failed to download invoice' });
  }
});

// Delete invoice file
router.delete('/:id/influencers/:influencerId/invoice/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { id, influencerId, invoiceId } = req.params;

    // Get existing invoices
    const campaignInfluencer = await prisma.campaignInfluencer.findFirst({
      where: {
        campaignId: String(id),
        influencerId: String(influencerId)
      }
    });

    if (!campaignInfluencer) {
      return res.status(404).json({ error: 'Campaign influencer not found' });
    }

    const existingInvoices = (campaignInfluencer.invoices as any) || [];
    const invoice = existingInvoices.find((inv: any) => inv.id === invoiceId);

    if (invoice) {
      // Delete file from disk
      const filePath = path.join(uploadsDir, invoice.filepath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Remove from database
      const updatedInvoices = existingInvoices.filter((inv: any) => inv.id !== invoiceId);

      await prisma.campaignInfluencer.updateMany({
        where: {
          campaignId: String(id),
          influencerId: String(influencerId)
        },
        data: {
          invoices: updatedInvoices.length > 0 ? updatedInvoices : null
        }
      });

      // Emit socket event for real-time update
      const io = req.app.get('io');
      io.emit('campaign:influencer:updated', { campaignId: String(id), influencerId: String(influencerId) });

      res.json({ message: 'Invoice deleted successfully' });
    } else {
      res.status(404).json({ error: 'Invoice not found' });
    }
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// Get status updates for a campaign (role-filtered)
router.get('/:id/status-updates', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.userRole;
    const userId = req.userId!;

    const all = await prisma.campaignStatusUpdate.findMany({
      where: { campaignId: String(id) },
      include: { user: { select: { id: true, name: true, designation: true } } },
      orderBy: { createdAt: 'desc' },
    });

    let filtered;
    if (userRole === 'ADMIN') {
      filtered = all; // admin sees everything
    } else if (userRole === 'AGENCY') {
      // heads see: updates from EMPLOYEEs + their own AGENCY updates
      filtered = all.filter(u => u.userRole === 'EMPLOYEE' || u.userId === userId);
    } else if (userRole === 'EMPLOYEE') {
      // employees see: updates from AGENCY + their own EMPLOYEE updates
      filtered = all.filter(u => u.userRole === 'AGENCY' || u.userId === userId);
    } else {
      filtered = [];
    }

    res.json(filtered);
  } catch (error) {
    console.error('Failed to fetch status updates:', error);
    res.status(500).json({ error: 'Failed to fetch status updates' });
  }
});

// Post a status update (AGENCY or EMPLOYEE only)
router.post('/:id/status-updates', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userRole = req.userRole;
    const userId = req.userId!;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (userRole !== 'AGENCY' && userRole !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Only heads and employees can post status updates' });
    }

    const update = await prisma.campaignStatusUpdate.create({
      data: {
        campaignId: String(id),
        userId,
        userRole: userRole as any,
        content: content.trim(),
      },
      include: { user: { select: { id: true, name: true, designation: true } } },
    });

    // Real-time: emit to campaign room
    const io = req.app.get('io');
    io.emit(`campaign:status:${id}`, update);

    res.status(201).json(update);
  } catch (error) {
    console.error('Failed to post status update:', error);
    res.status(500).json({ error: 'Failed to post status update' });
  }
});

export default router;
