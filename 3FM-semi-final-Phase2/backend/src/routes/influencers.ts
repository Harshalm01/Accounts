import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requireRole, RoleAuthRequest } from '../middleware/roleMiddleware';
import { logActivity } from './activityLog';

const router = Router();
const prisma = new PrismaClient();

// Get influencers — paginated + filtered
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(5000, parseInt(req.query.limit as string) || 50);
    const skip = (page - 1) * limit;

    const search = (req.query.search as string || '').trim();
    const genres = (req.query.genres as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const locations = (req.query.locations as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const genders = (req.query.genders as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const followersRange = (req.query.followersRange as string) || 'all';

    const AND: any[] = [];

    if (search) {
      const words = search.trim().split(/\s+/);
      if (words.length >= 2) {
        AND.push({
          OR: [
            // Full name: first word = firstName, rest = lastName
            {
              AND: [
                { firstName: { contains: words[0], mode: 'insensitive' } },
                { lastName: { contains: words.slice(1).join(' '), mode: 'insensitive' } },
              ],
            },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName:  { contains: search, mode: 'insensitive' } },
            { city:      { contains: search, mode: 'insensitive' } },
            { igLink:    { contains: search, mode: 'insensitive' } },
            { primaryGenre: { contains: search, mode: 'insensitive' } },
          ],
        });
      } else {
        AND.push({
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName:  { contains: search, mode: 'insensitive' } },
            { city:      { contains: search, mode: 'insensitive' } },
            { igLink:    { contains: search, mode: 'insensitive' } },
            { primaryGenre: { contains: search, mode: 'insensitive' } },
          ],
        });
      }
    }

    if (genres.length > 0) {
      AND.push({ OR: genres.map(g => ({ primaryGenre: { contains: g, mode: 'insensitive' } })) });
    }

    if (locations.length > 0) {
      AND.push({ OR: locations.map(l => ({ city: { contains: l, mode: 'insensitive' } })) });
    }

    if (genders.length > 0) {
      AND.push({ gender: { in: genders } });
    }

    if (followersRange === 'nano')  AND.push({ followers: { lt: 10000 } });
    else if (followersRange === 'micro') AND.push({ followers: { gte: 10000, lt: 100000 } });
    else if (followersRange === 'macro') AND.push({ followers: { gte: 100000, lt: 1000000 } });
    else if (followersRange === 'mega')  AND.push({ followers: { gte: 1000000 } });

    const where = AND.length > 0 ? { AND } : {};

    const [influencers, total] = await Promise.all([
      prisma.influencer.findMany({
        where,
        orderBy: { firstName: 'asc' },
        skip,
        take: limit,
        include: { _count: { select: { campaigns: true } } },
      }),
      prisma.influencer.count({ where }),
    ]);

    res.json({ influencers, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch influencers' });
  }
});

// Get distinct filter options (genres, genders)
router.get('/filter-options', authenticate, async (req: Request, res: Response) => {
  try {
    const [genres, genders] = await Promise.all([
      prisma.influencer.findMany({ select: { primaryGenre: true }, distinct: ['primaryGenre'] }),
      prisma.influencer.findMany({ select: { gender: true }, distinct: ['gender'] }),
    ]);
    res.json({
      genres: genres.map((g: any) => g.primaryGenre).filter((g: string) => g && g !== '-').sort(),
      genders: genders.map((g: any) => g.gender).filter((g: string) => g && g !== '-').sort(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// Export influencers to Excel (optional ?ids=id1,id2,... for selective export)
router.get('/export', authenticate, requireRole('ADMIN', 'AGENCY'), async (req: Request, res: Response) => {
  try {
    const XLSX = require('xlsx');
    const idsQuery = req.query.ids as string | undefined;
    const where = idsQuery && idsQuery.trim() ? { id: { in: idsQuery.split(',').map((s: string) => s.trim()).filter(Boolean) } } : {};
    const influencers = await prisma.influencer.findMany({ where, orderBy: { createdAt: 'desc' } });
    const rows = influencers.map((inf: any) => ({
      'First Name': inf.firstName,
      'Last Name': inf.lastName,
      'Instagram Link': inf.igLink,
      'Followers': inf.followers,
      'Followers Unit': inf.followersUnit,
      'Avg Views': inf.avgViews || '',
      'Avg Views Unit': inf.avgViewsUnit || '',
      'Primary Genre': inf.primaryGenre,
      'Secondary Genre': inf.secondaryGenre || '',
      'City': inf.city,
      'State': inf.state || '',
      'Gender': inf.gender,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Influencers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="influencers.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Import influencers from CSV/Excel
router.post('/import', authenticate, requireRole('ADMIN', 'AGENCY'), async (req: Request, res: Response) => {
  try {
    const multer = require('multer');
    const XLSX = require('xlsx');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file');

    upload(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: 'File upload error: ' + err.message });
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      let rows: any[] = [];
      try {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Could not parse file. Please upload a valid CSV or Excel file.' });
      }

      if (rows.length === 0) return res.status(400).json({ error: 'File is empty or has no data rows.' });

      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const firstName = String(row['First Name'] || row['firstName'] || row['first_name'] || '').trim();
          const lastName = String(row['Last Name'] || row['lastName'] || row['last_name'] || '').trim();
          const igLink = String(row['Instagram Link'] || row['igLink'] || row['ig_link'] || row['instagram'] || '').trim();

          if (!firstName || !igLink) {
            errors.push(`Row ${i + 2}: Missing required fields (First Name, Instagram Link)`);
            continue;
          }

          // Duplicate check by normalised IG link
          const normLink = igLink.toLowerCase().replace(/\/$/, '');
          const allExisting = await prisma.influencer.findMany({ select: { igLink: true } });
          const isDuplicate = allExisting.some(e => e.igLink.toLowerCase().replace(/\/$/, '') === normLink);
          if (isDuplicate) { skipped++; continue; }

          const followersRaw = Number(row['Followers'] || 0);
          const followersUnit = (['K', 'M'].includes(String(row['Followers Unit'] || '').toUpperCase())
            ? String(row['Followers Unit']).toUpperCase()
            : 'K') as 'K' | 'M';

          const avgViewsRaw = row['Avg Views'] ? Number(row['Avg Views']) : null;
          const avgViewsUnit = avgViewsRaw
            ? (['K', 'M'].includes(String(row['Avg Views Unit'] || '').toUpperCase())
              ? String(row['Avg Views Unit']).toUpperCase()
              : 'K') as 'K' | 'M'
            : null;

          const contactValue = String(row['Contact'] || row['Phone'] || row['Email'] || '').trim();
          const contactType = (String(row['Contact Type'] || '').toLowerCase().includes('email') ? 'Email' : 'Number') as 'Number' | 'Email';

          await prisma.influencer.create({
            data: {
              firstName,
              lastName,
              igLink,
              followers: isNaN(followersRaw) ? 0 : followersRaw,
              followersUnit,
              avgViews: avgViewsRaw && !isNaN(avgViewsRaw) ? avgViewsRaw : null,
              avgViewsUnit,
              primaryGenre: String(row['Primary Genre'] || row['primaryGenre'] || 'Other').trim(),
              secondaryGenre: String(row['Secondary Genre'] || row['secondaryGenre'] || '').trim(),
              city: String(row['City'] || row['city'] || '').trim(),
              state: String(row['State'] || row['state'] || '').trim(),
              gender: String(row['Gender'] || row['gender'] || 'Other').trim(),
              contact: { contactType, contactValue },
              commercials: [],
            },
          });
          created++;
        } catch (rowErr: any) {
          errors.push(`Row ${i + 2}: ${rowErr.message || 'Unknown error'}`);
        }
      }

      res.json({ created, skipped, errors: errors.slice(0, 20), total: rows.length });
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

// Get single influencer (with campaign history)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const influencer = await prisma.influencer.findUnique({
      where: { id: String(id) },
      include: {
        campaigns: {
          select: {
            id: true,
            liveLink: true,
            liveDate: true,
            brandApprovalStatus: true,
            brandComment: true,
            invoices: true,
            createdAt: true,
            campaign: {
              select: { id: true, name: true, brandName: true, status: true, startDate: true, endDate: true }
            }
          }
        }
      }
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
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const {
      firstName, lastName, igLink, followers, followersUnit,
      avgViews, avgViewsUnit, primaryGenre, secondaryGenre,
      city, state, contact, commercials, gender, notes
    } = req.body;

    // Normalize Instagram link for comparison (trim, lowercase, remove trailing slash, decode URL)
    const normalizedIgLink = decodeURIComponent(igLink.trim().toLowerCase().replace(/\/$/, ''));

    // Fast duplicate check — single DB query instead of loading all records
    const existingInfluencer = await prisma.influencer.findFirst({
      where: { igLink: { contains: normalizedIgLink, mode: 'insensitive' } }
    });

    if (existingInfluencer) {
      return res.status(400).json({
        error: 'Duplicate Instagram Link',
        message: `This Instagram link is already associated with ${existingInfluencer.firstName} ${existingInfluencer.lastName}. Each influencer must have a unique Instagram link.`
      });
    }

    // Check for duplicate phone number
    const contactData = typeof contact === 'string' ? JSON.parse(contact) : contact;
    if (contactData?.contactType === 'Number' && contactData?.contactValue) {
      const existingPhone = await prisma.influencer.findFirst({
        where: { contact: { path: ['contactValue'], equals: String(contactData.contactValue).trim() } }
      });
      if (existingPhone) {
        return res.status(400).json({
          error: 'Duplicate Phone Number',
          message: `This phone number is already associated with ${existingPhone.firstName} ${existingPhone.lastName}.`
        });
      }
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
        notes: notes || '',
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('influencer:created', influencer);

    if (userId) await logActivity(prisma, userId, 'Influencer Created', 'Influencer', influencer.id, `${influencer.firstName} ${influencer.lastName}`);

    res.status(201).json(influencer);
  } catch (error) {
    console.error('Error creating influencer:', error);
    res.status(500).json({ error: 'Failed to create influencer', details: String(error) });
  }
});

// Update influencer
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const {
      firstName, lastName, igLink, followers, followersUnit,
      avgViews, avgViewsUnit, primaryGenre, secondaryGenre,
      city, state, contact, commercials, gender, notes,
      blacklisted, blacklistReason, rating
    } = req.body;

    // Normalize Instagram link for comparison (trim, lowercase, remove trailing slash, decode URL)
    const normalizedIgLink = decodeURIComponent(igLink.trim().toLowerCase().replace(/\/$/, ''));

    // Fast duplicate check — exclude current influencer
    const existingInfluencer = await prisma.influencer.findFirst({
      where: { igLink: { contains: normalizedIgLink, mode: 'insensitive' }, id: { not: String(id) } }
    });

    if (existingInfluencer) {
      return res.status(400).json({
        error: 'Duplicate Instagram Link',
        message: `This Instagram link is already associated with ${existingInfluencer.firstName} ${existingInfluencer.lastName}. Each influencer must have a unique Instagram link.`
      });
    }

    // Check for duplicate phone number (excluding current influencer)
    const contactData = typeof contact === 'string' ? JSON.parse(contact) : contact;
    if (contactData?.contactType === 'Number' && contactData?.contactValue) {
      const existingPhone = await prisma.influencer.findFirst({
        where: { contact: { path: ['contactValue'], equals: String(contactData.contactValue).trim() }, id: { not: String(id) } }
      });
      if (existingPhone) {
        return res.status(400).json({
          error: 'Duplicate Phone Number',
          message: `This phone number is already associated with ${existingPhone.firstName} ${existingPhone.lastName}.`
        });
      }
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
        notes: notes !== undefined ? notes : undefined,
        blacklisted: blacklisted !== undefined ? Boolean(blacklisted) : undefined,
        blacklistReason: blacklistReason !== undefined ? blacklistReason : undefined,
        rating: rating !== undefined ? (rating === null ? null : Number(rating)) : undefined,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('influencer:updated', influencer);

    if (userId) await logActivity(prisma, userId, 'Influencer Updated', 'Influencer', influencer.id, `${influencer.firstName} ${influencer.lastName}`);

    res.json(influencer);
  } catch (error) {
    console.error('Error updating influencer:', error);
    res.status(500).json({ error: 'Failed to update influencer', details: String(error) });
  }
});

// Quick update blacklist / rating (from profile panel)
router.patch('/:id/meta', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { blacklisted, blacklistReason, rating } = req.body;
    const data: any = {};
    if (blacklisted !== undefined) data.blacklisted = Boolean(blacklisted);
    if (blacklistReason !== undefined) data.blacklistReason = blacklisted ? blacklistReason : null;
    if (rating !== undefined) data.rating = rating === null ? null : Number(rating);
    const influencer = await prisma.influencer.update({ where: { id: String(id) }, data });
    const io = req.app.get('io');
    io.emit('influencer:updated', influencer);
    res.json(influencer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update influencer meta' });
  }
});

// Delete influencer
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const toDelete = await prisma.influencer.findUnique({ where: { id: String(id) }, select: { firstName: true, lastName: true } });
    await prisma.influencer.delete({
      where: { id: String(id) }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('influencer:deleted', String(id));

    if (userId && toDelete) await logActivity(prisma, userId, 'Influencer Deleted', 'Influencer', String(id), `${toDelete.firstName} ${toDelete.lastName}`);

    res.json({ message: 'Influencer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete influencer' });
  }
});

// Get all influencers with valid city data for map view (lightweight)
router.get('/map', authenticate, async (req: Request, res: Response) => {
  try {
    const influencers = await prisma.influencer.findMany({
      where: {
        city: { not: '-' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        igLink: true,
        followers: true,
        followersUnit: true,
        primaryGenre: true,
        city: true,
        state: true,
      },
      orderBy: { followers: 'desc' },
    });
    res.json(influencers);
  } catch (error) {
    console.error('Map data error:', error);
    res.status(500).json({ error: 'Failed to fetch map data' });
  }
});

export default router;
