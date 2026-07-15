import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { attachUserRole, RoleAuthRequest } from '../middleware/roleMiddleware';
import { logActivity } from './activityLog';
import Papa from 'papaparse';
import XLSX from 'xlsx';

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

// Helper: auto-update campaign statuses based on dates
async function autoUpdateStatuses() {
  const now = new Date();
  await prisma.campaign.updateMany({
    where: { status: 'Upcoming', startDate: { lte: now } },
    data: { status: 'Active' },
  });
  await prisma.campaign.updateMany({
    where: { status: 'Active', endDate: { not: null, lte: now } },
    data: { status: 'Completed' },
  });
}

// DEBUG: Get current user's role
router.get('/debug/my-role', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole;

    // Fetch user from DB to verify
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, email: true }
    });

    res.json({
      userId,
      userRole,
      userRoleType: typeof userRole,
      isAgency: userRole === 'AGENCY',
      dbUser: user
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all campaigns (filtered by role)
router.get('/', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole;

    console.log(`📋 GET /api/campaigns - userId: ${userId}, userRole: ${userRole}`);
    console.log(`   userRole type: ${typeof userRole}, value: ${JSON.stringify(userRole)}`);

    // Auto-update statuses based on current date
    await autoUpdateStatuses();

    let campaigns;

    if (userRole === 'ADMIN') {
      console.log('   → Admin: returning all campaigns');
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
      console.log('   → Agency head: returning all campaigns');
      // Heads see ALL campaigns
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
      console.log(`   → Found ${raw.length} total campaigns`);
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
      console.log(`   → Unknown role: returning empty list`);
      campaigns = [];
    }

    console.log(`   → Returning ${campaigns.length} campaigns to client`);
    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Export campaigns to Excel (role-filtered)
router.get('/export', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const XLSX = require('xlsx');
    const PDFDocument = require('pdfkit');
    const userId = req.userId!;
    const userRole = req.userRole;
    const filterIds = req.query.ids ? String(req.query.ids).split(',').filter(Boolean) : null;
    const format = (req.query.format as string || 'xlsx').toLowerCase(); // xlsx, csv, or pdf

    // Validate format
    if (!['xlsx', 'csv', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use: xlsx, csv, or pdf' });
    }

    let campaigns: any[];
    if (userRole === 'ADMIN' || userRole === 'AGENCY') {
      campaigns = await prisma.campaign.findMany({
        where: filterIds ? { id: { in: filterIds } } : undefined,
        include: {
          influencers: {
            include: { influencer: true }
          },
          statusUpdates: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' }
          },
          assignments: {
            include: {
              head: { select: { id: true, name: true } },
              assignedBy: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' },
      });
    } else if (userRole === 'EMPLOYEE') {
      const accepted = await prisma.campaignAssignment.findMany({ where: { headId: userId, status: 'ACCEPTED' }, select: { campaignId: true } });
      const ids = accepted.map((a: any) => a.campaignId);
      const finalIds = filterIds ? ids.filter((id: string) => filterIds.includes(id)) : ids;
      campaigns = finalIds.length ? await prisma.campaign.findMany({
        where: { id: { in: finalIds } },
        include: {
          influencers: {
            include: { influencer: true }
          },
          statusUpdates: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' }
          },
          assignments: {
            include: {
              head: { select: { id: true, name: true } },
              assignedBy: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      }) : [];
    } else {
      campaigns = [];
    }

    // Helper function to calculate metrics
    const calculateMetrics = (campaign: any) => {
      const influencers = campaign.influencers || [];
      const assignments = campaign.assignments || [];

      const totalCost = influencers.reduce((sum: number, ci: any) => sum + (ci.internalCost || 0), 0);
      const budget = campaign.budget || 0;
      const budgetPercent = budget > 0 ? Math.min((totalCost / budget) * 100, 100) : 0;

      const approvedCount = influencers.filter((ci: any) => ci.brandApprovalStatus === 'APPROVED').length;
      const rejectedCount = influencers.filter((ci: any) => ci.brandApprovalStatus === 'REJECTED').length;
      const pendingInfluencerCount = influencers.length - approvedCount - rejectedCount;

      const acceptedAssignments = assignments.filter((a: any) => a.status === 'ACCEPTED').length;
      const rejectedAssignments = assignments.filter((a: any) => a.status === 'REJECTED').length;
      const pendingAssignments = assignments.length - acceptedAssignments - rejectedAssignments;

      return {
        totalCost,
        budget,
        budgetPercent,
        approvedCount,
        rejectedCount,
        pendingInfluencerCount,
        acceptedAssignments,
        rejectedAssignments,
        pendingAssignments
      };
    };

    // Excel export with multiple sheets
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Campaign Overview
      const overviewRows = campaigns.map((c: any) => {
        const metrics = calculateMetrics(c);
        return {
          'Campaign Name': c.name,
          'Brand': c.brandName,
          'Status': c.status,
          'Start Date': c.startDate ? new Date(c.startDate).toLocaleDateString() : '',
          'End Date': c.endDate ? new Date(c.endDate).toLocaleDateString() : '',
          'Budget': c.budget || '',
          'Total Cost': metrics.totalCost,
          'Budget Utilization %': metrics.budgetPercent.toFixed(1),
          'Internal Cost': c.internalCost,
          'External Cost': c.externalCost,
          'Total Influencers': c.influencers?.length || 0,
          'Approved': metrics.approvedCount,
          'Pending Influencers': metrics.pendingInfluencerCount,
          'Rejected': metrics.rejectedCount,
          'Total Assignments': c.assignments?.length || 0,
          'Accepted Assignments': metrics.acceptedAssignments,
          'Pending Assignments': metrics.pendingAssignments,
          'Rejected Assignments': metrics.rejectedAssignments,
          'Brief': c.brief || ''
        };
      });
      const overviewWs = XLSX.utils.json_to_sheet(overviewRows);
      XLSX.utils.book_append_sheet(wb, overviewWs, 'Overview');

      // Sheet 2: Influencer Roster (for each campaign)
      const influencerRows: any[] = [];
      campaigns.forEach((c: any) => {
        c.influencers?.forEach((ci: any) => {
          influencerRows.push({
            'Campaign': c.name,
            'Influencer Name': `${ci.influencer?.firstName || ''} ${ci.influencer?.lastName || ''}`.trim(),
            'City': ci.influencer?.city || '',
            'Approval Status': ci.brandApprovalStatus || 'PENDING',
            'Live Link': ci.liveLink || '--',
            'Internal Cost': ci.internalCost || 0,
            'External Cost': ci.externalCost || 0,
            'Total Cost': (ci.internalCost || 0) + (ci.externalCost || 0)
          });
        });
      });
      if (influencerRows.length > 0) {
        const influencerWs = XLSX.utils.json_to_sheet(influencerRows);
        XLSX.utils.book_append_sheet(wb, influencerWs, 'Influencers');
      }

      // Sheet 3: Status Updates (for each campaign)
      const statusRows: any[] = [];
      campaigns.forEach((c: any) => {
        c.statusUpdates?.forEach((update: any) => {
          statusRows.push({
            'Campaign': c.name,
            'Posted By': update.user?.name || 'Unknown',
            'Update': update.content || '',
            'Date': new Date(update.createdAt).toLocaleString()
          });
        });
      });
      if (statusRows.length > 0) {
        const statusWs = XLSX.utils.json_to_sheet(statusRows);
        XLSX.utils.book_append_sheet(wb, statusWs, 'Status Updates');
      }

      // Sheet 4: Assignments (for each campaign)
      const assignmentRows: any[] = [];
      campaigns.forEach((c: any) => {
        c.assignments?.forEach((a: any) => {
          assignmentRows.push({
            'Campaign': c.name,
            'Assigned To': a.head?.name || 'Unknown',
            'Assigned By': a.assignedBy?.name || 'Unknown',
            'Status': a.status || 'PENDING',
            'Date Assigned': new Date(a.createdAt).toLocaleString()
          });
        });
      });
      if (assignmentRows.length > 0) {
        const assignmentWs = XLSX.utils.json_to_sheet(assignmentRows);
        XLSX.utils.book_append_sheet(wb, assignmentWs, 'Assignments');
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename="campaigns.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buf);
    }
    // CSV export with detailed data
    else if (format === 'csv') {
      const allCsvRows: any[] = [];

      campaigns.forEach((c: any) => {
        const metrics = calculateMetrics(c);

        // Add campaign overview row
        allCsvRows.push({
          'Type': 'Campaign Overview',
          'Campaign Name': c.name,
          'Brand': c.brandName,
          'Status': c.status,
          'Start Date': c.startDate ? new Date(c.startDate).toLocaleDateString() : '',
          'End Date': c.endDate ? new Date(c.endDate).toLocaleDateString() : '',
          'Budget': c.budget || '',
          'Total Cost': metrics.totalCost,
          'Budget Utilization %': metrics.budgetPercent.toFixed(1),
          'Internal Cost': c.internalCost,
          'External Cost': c.externalCost,
          'Total Influencers': c.influencers?.length || 0,
          'Brief': c.brief || ''
        });

        // Add influencer rows for this campaign
        c.influencers?.forEach((ci: any) => {
          allCsvRows.push({
            'Type': 'Influencer',
            'Campaign Name': c.name,
            'Influencer Name': `${ci.influencer?.firstName || ''} ${ci.influencer?.lastName || ''}`.trim(),
            'City': ci.influencer?.city || '',
            'Approval Status': ci.brandApprovalStatus || 'PENDING',
            'Live Link': ci.liveLink || '--',
            'Internal Cost': ci.internalCost || 0,
            'External Cost': ci.externalCost || 0
          });
        });

        // Add status update rows for this campaign
        c.statusUpdates?.forEach((update: any) => {
          allCsvRows.push({
            'Type': 'Status Update',
            'Campaign Name': c.name,
            'Posted By': update.user?.name || 'Unknown',
            'Update': update.content || '',
            'Date': new Date(update.createdAt).toLocaleString()
          });
        });

        // Add assignment rows for this campaign
        c.assignments?.forEach((a: any) => {
          allCsvRows.push({
            'Type': 'Assignment',
            'Campaign Name': c.name,
            'Assigned To': a.head?.name || 'Unknown',
            'Assigned By': a.assignedBy?.name || 'Unknown',
            'Status': a.status || 'PENDING',
            'Date Assigned': new Date(a.createdAt).toLocaleString()
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(allCsvRows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Disposition', 'attachment; filename="campaigns.csv"');
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    }
    // PDF export with multiple sections
    else if (format === 'pdf') {
      const doc = new PDFDocument();

      res.setHeader('Content-Disposition', 'attachment; filename="campaigns.pdf"');
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);

      doc.fontSize(20).font('Helvetica-Bold').text('Campaign Report', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1);

      campaigns.forEach((campaign: any, campaignIndex: number) => {
        if (campaignIndex > 0) {
          doc.addPage();
        }

        const metrics = calculateMetrics(campaign);

        // Campaign header
        doc.fontSize(16).font('Helvetica-Bold').text(campaign.name, { underline: true });
        doc.fontSize(11).font('Helvetica');
        doc.text(`Brand: ${campaign.brandName} | Status: ${campaign.status}`);
        doc.text(`Start: ${campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'N/A'} | End: ${campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'N/A'}`);
        doc.moveDown(0.5);

        // Key Metrics Section
        doc.fontSize(12).font('Helvetica-Bold').text('Key Metrics');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Budget: ₹${campaign.budget?.toLocaleString() || '0'} | Total Cost: ₹${metrics.totalCost.toLocaleString()} | Utilization: ${metrics.budgetPercent.toFixed(1)}%`);
        doc.text(`Influencers: ${campaign.influencers?.length || 0} (Approved: ${metrics.approvedCount}, Pending: ${metrics.pendingInfluencerCount}, Rejected: ${metrics.rejectedCount})`);
        doc.text(`Assignments: ${campaign.assignments?.length || 0} (Accepted: ${metrics.acceptedAssignments}, Pending: ${metrics.pendingAssignments}, Rejected: ${metrics.rejectedAssignments})`);
        doc.moveDown(0.5);

        // Campaign Brief
        if (campaign.brief) {
          doc.fontSize(12).font('Helvetica-Bold').text('Campaign Brief');
          doc.fontSize(10).font('Helvetica').text(campaign.brief, { align: 'left', width: 500 });
          doc.moveDown(0.5);
        }

        // Influencer Roster
        if (campaign.influencers && campaign.influencers.length > 0) {
          doc.fontSize(12).font('Helvetica-Bold').text('Influencer Roster');
          doc.moveDown(0.3);

          const influencers = campaign.influencers;
          const colX = [50, 150, 250, 330, 430];
          const colWidths = [100, 100, 80, 100, 70];
          let y = doc.y;

          // Header
          doc.fontSize(9).font('Helvetica-Bold');
          const headers = ['Name', 'City', 'Approval', 'Live Link', 'Cost'];
          headers.forEach((h, i) => {
            doc.text(h, colX[i], y, { width: colWidths[i], align: 'left' });
          });
          y += 15;
          doc.moveTo(50, y).lineTo(500, y).stroke();
          y += 5;

          // Rows
          doc.fontSize(8).font('Helvetica');
          influencers.forEach((inf: any) => {
            if (y > 750) {
              doc.addPage();
              y = 50;
            }
            const name = `${inf.influencer?.firstName || ''} ${inf.influencer?.lastName || ''}`.trim();
            const city = inf.influencer?.city || '--';
            const approval = inf.brandApprovalStatus || 'PENDING';
            const link = inf.liveLink ? 'Yes' : '--';
            const cost = `₹${(inf.internalCost || 0).toLocaleString()}`;

            doc.text(name, colX[0], y, { width: colWidths[0], align: 'left' });
            doc.text(city, colX[1], y, { width: colWidths[1], align: 'left' });
            doc.text(approval, colX[2], y, { width: colWidths[2], align: 'left' });
            doc.text(link, colX[3], y, { width: colWidths[3], align: 'left' });
            doc.text(cost, colX[4], y, { width: colWidths[4], align: 'right' });
            y += 12;
          });
          doc.moveDown(0.5);
        }

        // Status Updates
        if (campaign.statusUpdates && campaign.statusUpdates.length > 0) {
          if (doc.y > 700) doc.addPage();
          doc.fontSize(12).font('Helvetica-Bold').text('Status Updates');
          doc.moveDown(0.3);

          doc.fontSize(9).font('Helvetica');
          campaign.statusUpdates.slice(0, 10).forEach((update: any) => {
            if (doc.y > 750) doc.addPage();
            doc.font('Helvetica-Bold').text(`${update.user?.name || 'Unknown'}`, { underline: true });
            doc.font('Helvetica').fontSize(8).text(`${new Date(update.createdAt).toLocaleString()}`, { color: 'gray' });
            doc.fontSize(9).text(update.content || '', { width: 450 });
            doc.moveDown(0.3);
          });
          if (campaign.statusUpdates.length > 10) {
            doc.fontSize(8).text(`... and ${campaign.statusUpdates.length - 10} more updates`, { color: 'gray' });
          }
          doc.moveDown(0.5);
        }

        // Assignments
        if (campaign.assignments && campaign.assignments.length > 0) {
          if (doc.y > 700) doc.addPage();
          doc.fontSize(12).font('Helvetica-Bold').text('Assignments');
          doc.moveDown(0.3);

          doc.fontSize(9).font('Helvetica');
          campaign.assignments.forEach((assignment: any) => {
            if (doc.y > 750) doc.addPage();
            doc.font('Helvetica-Bold').text(`${assignment.head?.name || 'Unknown'}`);
            doc.font('Helvetica').fontSize(8).text(`Status: ${assignment.status || 'PENDING'} | Assigned by: ${assignment.assignedBy?.name || 'Unknown'}`);
            doc.moveDown(0.3);
          });
        }
      });

      doc.end();
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Multer config for campaign import (memory storage)
const importStorage = multer.memoryStorage();
const importUpload = multer({
  storage: importStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Import campaigns from CSV/Excel
router.post('/import', authenticate, attachUserRole, importUpload.single('file'), async (req: RoleAuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole;

    if (userRole !== 'ADMIN' && userRole !== 'AGENCY') {
      return res.status(403).json({ error: 'Only admins and agencies can import campaigns' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows: any[] = [];

    if (ext === '.csv') {
      const csvText = req.file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      rows = parsed.data as any[];
    } else {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'File contains no data rows' });
    }

    // Normalize field names: convert headers to camelCase and remove spaces
    const normalizeHeaders = (obj: any) => {
      const normalized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Convert to camelCase: "Brand Name" -> "brandName", "contact Details" -> "contactDetails"
        const camelKey = key
          .trim()
          .replace(/\s+/g, ' ')  // normalize spaces
          .split(' ')
          .map((word, idx) => idx === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('');
        normalized[camelKey] = value;
      }
      return normalized;
    };

    // Normalize all rows
    rows = rows.map(normalizeHeaders);

    const requiredFields = ['name', 'brandName', 'contact', 'contactDetails', 'campaignId', 'campaignPassword', 'internalCost', 'externalCost', 'startDate'];
    const errors: { row: number; message: string }[] = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row + 0-index

      // Check required fields
      const missing = requiredFields.filter(f => !row[f] && row[f] !== 0);
      if (missing.length > 0) {
        errors.push({ row: rowNum, message: `Missing required fields: ${missing.join(', ')}` });
        continue;
      }

      const contactDetails = String(row.contactDetails).trim();
      if (!/^[0-9]{10}$/.test(contactDetails)) {
        errors.push({ row: rowNum, message: 'contactDetails must be a valid 10-digit number' });
        continue;
      }

      const internalCost = parseFloat(row.internalCost);
      const externalCost = parseFloat(row.externalCost);
      if (isNaN(internalCost) || isNaN(externalCost)) {
        errors.push({ row: rowNum, message: 'internalCost and externalCost must be valid numbers' });
        continue;
      }

      const startDate = new Date(row.startDate);
      if (isNaN(startDate.getTime())) {
        errors.push({ row: rowNum, message: 'startDate is not a valid date' });
        continue;
      }

      let endDate: Date | undefined;
      if (row.endDate) {
        endDate = new Date(row.endDate);
        if (isNaN(endDate.getTime())) {
          errors.push({ row: rowNum, message: 'endDate is not a valid date' });
          continue;
        }
      }

      const budget = row.budget ? parseFloat(row.budget) : undefined;
      const status = row.status && ['Upcoming', 'Active', 'Completed'].includes(row.status) ? row.status : 'Upcoming';

      try {
        const campaign = await prisma.campaign.create({
          data: {
            name: String(row.name).trim(),
            brandName: String(row.brandName).trim(),
            contact: String(row.contact).trim(),
            contactDetails,
            campaignId: String(row.campaignId).trim(),
            campaignPassword: String(row.campaignPassword).trim(),
            userId,
            internalCost,
            externalCost,
            ...(budget !== undefined && !isNaN(budget) && { budget }),
            status,
            startDate,
            ...(endDate && { endDate }),
            ...(row.brief && { brief: String(row.brief).trim() }),
            addedToBrand: false,
          },
        });

        const io = req.app.get('io');
        io.emit('campaign:created', campaign);
        await logActivity(prisma, userId, 'Campaign Imported', 'Campaign', campaign.id, campaign.name);
        imported++;
      } catch (err: any) {
        errors.push({ row: rowNum, message: err.message || 'Failed to create campaign' });
      }
    }

    res.json({ imported, total: rows.length, errors });
  } catch (error: any) {
    console.error('Campaign import error:', error);
    res.status(500).json({ error: error.message || 'Import failed' });
  }
});

// Get single campaign (with role-based access check)
router.get('/:id', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { campaignId: campaignIdParam, campaignPassword: passwordParam } = req.query;
    const userId = req.userId!;
    const userRole = req.userRole;

    const campaign = await prisma.campaign.findUnique({
      where: { id: String(id) },
      include: {
        influencers: {
          include: {
            influencer: true
          }
        },
        statusUpdates: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        assignments: {
          include: {
            head: { select: { id: true, name: true } },
            assignedBy: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Check access rights
    if (userRole === 'AGENCY') {
      // Heads can view if they:
      // 1. Own the campaign, OR
      // 2. Have an ACCEPTED assignment, OR
      // 3. Provide correct campaign password
      const isOwner = campaign.userId === userId;

      let hasAccess = isOwner;

      if (!hasAccess) {
        const assignment = await prisma.campaignAssignment.findFirst({
          where: { campaignId: id, headId: userId, status: 'ACCEPTED' },
        });
        hasAccess = !!assignment;
      }

      if (!hasAccess && campaign.campaignId && campaign.campaignPassword) {
        // Check if password is provided and correct
        hasAccess = String(campaignIdParam) === campaign.campaignId &&
                   String(passwordParam) === campaign.campaignPassword;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

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
router.get('/:id/influencers', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const campaignInfluencers = await prisma.campaignInfluencer.findMany({
      where: { campaignId: String(id) },
      include: {
        influencer: true
      }
    });

    console.log(`📍 [CampaignInfluencers] Fetching influencers for campaign: ${id}, Found: ${campaignInfluencers.length}`);

    // Fetch all invoices for this campaign with creator request details
    const allInvoices = await prisma.invoice.findMany({
      where: { campaignId: String(id) },
      include: {
        creatorRequest: { select: { creatorName: true } },
      },
    });

    console.log(`   → Found ${allInvoices.length} total invoices for campaign`);

    // Return flat array with influencer data plus liveLink, liveDate, invoices, and brand feedback
    const enrichedInfluencers = campaignInfluencers.map(ci => {
      // Filter invoices for this specific influencer
      const influencerInvoices = allInvoices.filter(inv => inv.influencerId === ci.influencerId);

      console.log(`   → Influencer ${ci.influencer.firstName} ${ci.influencer.lastName}: ${influencerInvoices.length} creator invoices`);

      return ({
        ...ci.influencer,
        liveLink: ci.liveLink,
        liveDate: ci.liveDate,
        invoices: ci.invoices,
        creatorInvoices: influencerInvoices, // New: invoices uploaded via creator portal
        campaignInfluencerId: ci.id,
        brandApprovalStatus: ci.brandApprovalStatus,
        brandComment: ci.brandComment,
        internalCost: ci.internalCost,
        externalCost: ci.externalCost,
      });
    });

    console.log(`✅ [CampaignInfluencers] Returning ${enrichedInfluencers.length} enriched influencers`);
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
    const userId = (req as any).userId;

    const campaign = await prisma.campaign.findUnique({ where: { id: String(id) } });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // If no credentials configured, access is open
    if (!campaign.campaignId || !campaign.campaignPassword) {
      return res.json({ verified: true });
    }

    // Check if user has an ACCEPTED assignment for this campaign
    const hasAcceptedAssignment = await prisma.campaignAssignment.findFirst({
      where: { campaignId: id, headId: userId, status: 'ACCEPTED' },
    });

    if (hasAcceptedAssignment) {
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

    console.log(`📝 POST /api/campaigns - Starting campaign creation`);
    console.log(`   userId: ${userId}`);
    console.log(`   campaignName: ${name}`);

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

    console.log(`📝 About to log activity for campaign creation`);
    console.log(`   userId: ${userId}`);
    console.log(`   campaign.id: ${campaign.id}`);
    console.log(`   campaign.name: ${campaign.name}`);

    if (userId) {
      console.log(`📝 Calling logActivity...`);
      await logActivity(prisma, userId, 'Campaign Created', 'Campaign', campaign.id, campaign.name);
      console.log(`📝 logActivity completed`);
    } else {
      console.log(`⚠️  userId is falsy, not logging activity`);
    }

    res.status(201).json(campaign);
  } catch (error) {
    console.error('❌ Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
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
    const _user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    io.emit('campaign:updated', { ...campaign, _updatedBy: _user?.name || 'Someone' });

    if (userId) await logActivity(prisma, userId, 'Campaign Updated', 'Campaign', campaign.id, campaign.name);

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
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

    if (userId && campaign) await logActivity(prisma, userId, 'Campaign Deleted', 'Campaign', String(id), campaign.name || 'Unknown');

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Bulk delete campaigns (ADMIN only)
router.delete('/bulk', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const userRole = req.userRole;
    const userId = (req as any).userId;
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can bulk delete campaigns' });
    }
    const { ids } = req.body as { ids: string[] };
    if (!ids || !ids.length) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    // Delete related pitches first
    await prisma.pitch.deleteMany({ where: { campaignId: { in: ids } } });
    await prisma.campaign.deleteMany({ where: { id: { in: ids } } });

    const io = req.app.get('io');
    ids.forEach((id) => io.emit('campaign:deleted', id));

    if (userId) await logActivity(prisma, userId, 'Bulk Campaign Delete', 'Campaign', ids[0], `${ids.length} campaigns`);

    res.json({ message: `${ids.length} campaigns deleted` });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to bulk delete campaigns' });
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
    const { liveLink, invoices, internalCost, externalCost } = req.body;

    if (internalCost === undefined || internalCost === null || externalCost === undefined || externalCost === null) {
      return res.status(400).json({ error: 'internalCost and externalCost are required' });
    }
    const parsedInternal = parseFloat(internalCost);
    const parsedExternal = parseFloat(externalCost);
    if (isNaN(parsedInternal) || isNaN(parsedExternal)) {
      return res.status(400).json({ error: 'internalCost and externalCost must be valid numbers' });
    }

    // Create junction table entry
    await prisma.campaignInfluencer.create({
      data: {
        campaignId: String(id),
        influencerId: String(influencerId),
        internalCost: parsedInternal,
        externalCost: parsedExternal,
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
    const { campaignId, influencerIds, influencers: influencerEntries } = req.body;

    let dataArray;
    if (influencerEntries && Array.isArray(influencerEntries)) {
      // New format: array of { influencerId, internalCost, externalCost }
      for (const entry of influencerEntries) {
        if (entry.internalCost === undefined || entry.externalCost === undefined) {
          return res.status(400).json({ error: 'Each influencer must have internalCost and externalCost' });
        }
      }
      dataArray = influencerEntries.map((entry: any) => ({
        campaignId,
        influencerId: entry.influencerId,
        internalCost: parseFloat(entry.internalCost),
        externalCost: parseFloat(entry.externalCost),
      }));
    } else if (influencerIds && Array.isArray(influencerIds)) {
      // Legacy format: just IDs (costs default to 0 via schema)
      dataArray = influencerIds.map((influencerId: string) => ({
        campaignId,
        influencerId,
      }));
    } else {
      return res.status(400).json({ error: 'Either influencers or influencerIds array is required' });
    }

    // Create junction table entries for all influencers
    await prisma.campaignInfluencer.createMany({
      data: dataArray,
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

// Update campaign-influencer details (liveLink, liveDate, invoices)
router.put('/:id/influencers/:influencerId/details', async (req: Request, res: Response) => {
  try {
    const { id, influencerId } = req.params;
    const { liveLink, liveDate, invoices, internalCost, externalCost } = req.body;

    const campaignInfluencer = await prisma.campaignInfluencer.updateMany({
      where: {
        campaignId: String(id),
        influencerId: String(influencerId)
      },
      data: {
        ...(liveLink !== undefined && { liveLink }),
        ...(liveDate !== undefined && { liveDate: liveDate ? new Date(liveDate) : null }),
        ...(invoices !== undefined && { invoices }),
        ...(internalCost !== undefined && { internalCost: parseFloat(internalCost) }),
        ...(externalCost !== undefined && { externalCost: parseFloat(externalCost) })
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

// Update invoice payment info
router.patch('/:id/influencers/:influencerId/invoice/:invoiceId/payment', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, influencerId, invoiceId } = req.params;
    const { paymentStatus, amount, dueDate, paidDate } = req.body;

    const campaignInfluencer = await prisma.campaignInfluencer.findFirst({
      where: { campaignId: String(id), influencerId: String(influencerId) }
    });
    if (!campaignInfluencer) return res.status(404).json({ error: 'Not found' });

    const invoices = ((campaignInfluencer.invoices as any[]) || []).map((inv: any) => {
      if (inv.id !== invoiceId) return inv;
      return {
        ...inv,
        paymentStatus: paymentStatus ?? inv.paymentStatus ?? 'UNPAID',
        amount: amount !== undefined ? (amount === '' ? null : Number(amount)) : (inv.amount ?? null),
        dueDate: dueDate !== undefined ? (dueDate || null) : (inv.dueDate ?? null),
        paidDate: paidDate !== undefined ? (paidDate || null) : (inv.paidDate ?? null),
      };
    });

    await prisma.campaignInfluencer.updateMany({
      where: { campaignId: String(id), influencerId: String(influencerId) },
      data: { invoices },
    });

    const io = req.app.get('io');
    io.emit('campaign:influencer:updated', { campaignId: String(id), influencerId: String(influencerId) });

    res.json({ message: 'Payment info updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment info' });
  }
});

// Brand feedback on influencer (BRAND role only)
router.patch('/:id/influencers/:influencerId/brand-feedback', authenticate, attachUserRole, async (req: RoleAuthRequest, res: Response) => {
  try {
    const { id, influencerId } = req.params;
    const userRole = req.userRole;
    const { brandApprovalStatus, brandComment } = req.body;

    if (userRole !== 'BRAND') {
      return res.status(403).json({ error: 'Only brand users can provide feedback' });
    }

    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(brandApprovalStatus)) {
      return res.status(400).json({ error: 'Invalid approval status' });
    }

    await prisma.campaignInfluencer.updateMany({
      where: { campaignId: String(id), influencerId: String(influencerId) },
      data: {
        brandApprovalStatus,
        brandComment: brandComment !== undefined ? brandComment : null,
      },
    });

    const io = req.app.get('io');
    io.emit('campaign:influencer:updated', { campaignId: String(id), influencerId: String(influencerId) });

    res.json({ message: 'Brand feedback updated' });
  } catch (error) {
    console.error('Failed to update brand feedback:', error);
    res.status(500).json({ error: 'Failed to update brand feedback' });
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

    // Notify other participants on the campaign
    const assignments = await prisma.campaignAssignment.findMany({
      where: { campaignId: String(id), status: 'ACCEPTED' },
      select: { headId: true },
    });
    const campaign = await prisma.campaign.findUnique({ where: { id: String(id) }, select: { name: true } });
    const poster = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const notifTargets = assignments.map((a) => a.headId).filter((hid) => hid !== userId);
    await Promise.all(notifTargets.map(async (targetId) => {
      const notif = await prisma.notification.create({
        data: {
          userId: targetId,
          type: 'STATUS_UPDATE',
          title: 'Campaign Status Update',
          body: `${poster?.name || 'Someone'} posted a status update on "${campaign?.name || 'a campaign'}"`,
          entityType: 'campaign',
          entityId: String(id),
        },
      });
      io.to(targetId).emit(`notification:new:${targetId}`, notif);
    }));

    res.status(201).json(update);
  } catch (error) {
    console.error('Failed to post status update:', error);
    res.status(500).json({ error: 'Failed to post status update' });
  }
});

export default router;
