import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// Import influencers from CSV
router.post('/import-csv', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    console.log('\n📥 Starting influencer CSV import...');
    const csvContent = req.file.buffer.toString('utf-8');
    const records: any[] = [];

    // Parse CSV
    await new Promise((resolve, reject) => {
      parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }, (err, output) => {
        if (err) reject(err);
        else {
          records.push(...output);
          resolve(null);
        }
      });
    });

    console.log(`✅ Parsed ${records.length} rows from CSV`);

    let created = 0;
    let skipped = 0;
    let errors = [];

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      for (const record of batch) {
        try {
          // Parse name
          const nameParts = (record['Name'] || record['name'] || '').trim().split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.slice(1).join(' ') || '';

          if (!firstName || firstName === 'Unknown') {
            skipped++;
            continue;
          }

          // Check if exists
          const existing = await prisma.influencer.findFirst({
            where: {
              AND: [
                { firstName: { equals: firstName, mode: 'insensitive' } },
                { lastName: { equals: lastName, mode: 'insensitive' } }
              ]
            }
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Parse followers
          const followersStr = (record['FOLLOWERS'] || record['followers'] || '0').toString().replace(/,/g, '');
          const followers = parseInt(followersStr) || 0;

          // Parse location
          const locationParts = (record['Location'] || record['location'] || '').split(',').map((s: string) => s.trim());
          const city = locationParts[0] || 'Unknown';
          const state = locationParts[1] || null;

          // Parse genre
          const genres = (record['Genre'] || record['genre'] || '').split(/[|,]/).map((g: string) => g.trim()).filter(Boolean);
          const primaryGenre = genres[0] || 'General';
          const secondaryGenre = genres[1] || null;

          // Create influencer
          await prisma.influencer.create({
            data: {
              firstName,
              lastName,
              igLink: record['IG LINK'] || record['ig_link'] || '',
              followers,
              followersUnit: followers >= 1000000 ? 'M' : 'K',
              primaryGenre,
              secondaryGenre,
              city,
              state,
              gender: record['Gender'] || record['gender'] || 'Not Specified',
              contact: {
                contactType: (record['CONTACT/ EMAIL'] || record['contact'] || '').includes('@') ? 'Email' : 'Number',
                contactValue: record['CONTACT/ EMAIL'] || record['contact'] || '',
              },
              commercials: [],
            },
          });

          created++;
        } catch (err) {
          errors.push(`Row ${i}: ${String(err)}`);
        }
      }

      console.log(`  ✅ Processed ${Math.min(i + batchSize, records.length)}/${records.length} records...`);
    }

    console.log(`\n🎉 Import complete: ${created} created, ${skipped} skipped, ${errors.length} errors\n`);

    res.json({
      message: '✅ Influencer import successful!',
      summary: {
        total_records: records.length,
        created,
        skipped,
        errors: errors.length,
      },
      stats: {
        total_influencers: created + skipped,
        newly_added: created,
      },
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Failed to import influencers', details: String(err) });
  }
});

export default router;
