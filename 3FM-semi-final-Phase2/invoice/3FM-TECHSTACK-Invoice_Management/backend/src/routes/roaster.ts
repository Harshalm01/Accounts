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
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

// Upload CSV or Excel file
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { month } = req.body;
    if (!month) {
      return res.status(400).json({ error: 'Month is required' });
    }

    let parsedData: any[] = [];
    const fileExtension = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));

    // Parse based on file type
    if (fileExtension === '.csv') {
      // Parse CSV file
      const csvContent = req.file.buffer.toString('utf-8');
      const parseResult = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true
      });

      if (parseResult.errors.length > 0) {
        return res.status(400).json({
          error: 'CSV parsing error',
          details: parseResult.errors
        });
      }

      parsedData = parseResult.data;
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      // Parse Excel file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      parsedData = XLSX.utils.sheet_to_json(worksheet);

      if (!parsedData || parsedData.length === 0) {
        return res.status(400).json({
          error: 'Excel file is empty or could not be parsed'
        });
      }
    } else {
      return res.status(400).json({
        error: 'Unsupported file format'
      });
    }

    // Save to database with file data
    const roaster = await prisma.roaster.create({
      data: {
        month,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        fileData: req.file.buffer,
        data: parsedData,
      }
    });

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.emit('roaster:uploaded', roaster);

    res.status(201).json({
      message: 'File uploaded successfully',
      roaster: {
        id: roaster.id,
        month: roaster.month,
        fileName: roaster.fileName,
        fileSize: roaster.fileSize,
        rowCount: parsedData.length,
        uploadedAt: roaster.uploadedAt
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
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
        uploadedAt: true,
      }
    });
    res.json(roasters);
  } catch (error) {
    console.error('Fetch roasters error:', error);
    res.status(500).json({ error: 'Failed to fetch roaster data' });
  }
});

// Get single roaster data
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const roaster = await prisma.roaster.findUnique({
      where: { id: String(id) }
    });
    if (!roaster) {
      return res.status(404).json({ error: 'Roaster data not found' });
    }
    res.json(roaster);
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
