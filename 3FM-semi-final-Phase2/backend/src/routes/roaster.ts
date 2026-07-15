import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    const allowedMimes = [
      'application/pdf',
      'text/csv', 'text/plain', 'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    const allowedExts = ['.pdf', '.csv', '.xls', '.xlsx'];
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, CSV, and Excel files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Upload file (PDF / CSV / Excel).
// Run multer manually (not as middleware) so its errors stay in the JSON path.
// In Express 5 + multer v2, using upload.single() as middleware calls next(err) on
// file-type rejection, which hits Express's default HTML error handler instead of
// returning JSON. By invoking it inside a callback we control all error paths.
router.post('/upload', (req: Request, res: Response) => {
  upload.single('file')(req as any, res, async (multerErr: any) => {
    if (multerErr) {
      console.error('[roaster/upload] multer error:', multerErr.message);
      return res.status(400).json({ error: multerErr.message || 'File upload failed' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { month } = req.body;
      if (!month) {
        return res.status(400).json({ error: 'Month is required' });
      }

      const ext = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));
      let parsedData: any[] = [];
      let mimeType = req.file.mimetype;

      if (ext === '.pdf' || req.file.mimetype === 'application/pdf') {
        // PDF — store raw bytes, no table parsing
        mimeType = 'application/pdf';
        parsedData = [];
      } else if (ext === '.csv') {
        const csvContent = req.file.buffer.toString('utf-8');
        const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
        parsedData = parseResult.data as any[];
        const fatalErrors = parseResult.errors.filter((e: any) => e.type !== 'FieldMismatch');
        if (parsedData.length === 0 && fatalErrors.length > 0) {
          return res.status(400).json({ error: 'CSV parsing error', details: parseResult.errors });
        }
      } else if (ext === '.xlsx' || ext === '.xls') {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet);
        if (!parsedData || parsedData.length === 0) {
          return res.status(400).json({ error: 'Excel file is empty or could not be parsed' });
        }
      } else {
        return res.status(400).json({ error: 'Unsupported file format' });
      }

      // Save to database
      const roaster = await prisma.roaster.create({
        data: {
          month,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType,
          fileData: req.file.buffer,
          data: parsedData,
        }
      });

      // Emit socket event with small summary (not full binary buffer)
      const io = req.app.get('io');
      io.emit('roaster:uploaded', { id: roaster.id, month: roaster.month, fileName: roaster.fileName });

      return res.status(201).json({
        message: 'File uploaded successfully',
        roaster: {
          id: roaster.id,
          month: roaster.month,
          fileName: roaster.fileName,
          fileSize: roaster.fileSize,
          mimeType: roaster.mimeType,
          rowCount: parsedData.length,
          uploadedAt: roaster.uploadedAt,
        }
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

// Get all roaster uploads
router.get('/', async (req: Request, res: Response) => {
  try {
    const roasters = await prisma.roaster.findMany({
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        month: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        uploadedAt: true,
      }
    });
    res.json(roasters);
  } catch (error) {
    console.error('Fetch roasters error:', error);
    res.status(500).json({ error: 'Failed to fetch roaster data' });
  }
});

// Serve the raw file (for PDFs, opens in browser; for others, downloads)
router.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const roaster = await prisma.roaster.findUnique({
      where: { id: String(id) },
      select: { fileName: true, mimeType: true, fileData: true }
    });
    if (!roaster || !roaster.fileData) {
      return res.status(404).json({ error: 'File not found' });
    }
    const contentType = roaster.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // PDFs open inline; others prompt download
    if (contentType === 'application/pdf') {
      res.setHeader('Content-Disposition', `inline; filename="${roaster.fileName}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${roaster.fileName}"`);
    }
    res.send(roaster.fileData);
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Get single roaster data (table view for CSV/Excel)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const roaster = await prisma.roaster.findUnique({
      where: { id: String(id) }
    });
    if (!roaster) {
      return res.status(404).json({ error: 'Roaster data not found' });
    }
    // Don't send binary fileData over the wire
    const { fileData, ...rest } = roaster as any;
    res.json(rest);
  } catch (error) {
    console.error('Fetch roaster by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch roaster data' });
  }
});

// Delete roaster data
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.roaster.delete({
      where: { id: String(id) }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('roaster:deleted', String(id));

    res.json({ message: 'Roaster data deleted successfully' });
  } catch (error) {
    console.error('Delete roaster error:', error);
    res.status(500).json({ error: 'Failed to delete roaster data' });
  }
});

export default router;
