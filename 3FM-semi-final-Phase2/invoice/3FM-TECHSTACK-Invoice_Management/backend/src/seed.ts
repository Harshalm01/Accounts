import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();

async function main() {
  try {
    // Read the CSV file
    const csvPath = path.join(__dirname, '..', 'Testing Data - Sheet1 (1).csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse CSV using promise API
    const records = await new Promise<any[]>((resolve, reject) => {
      parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }, (err, output) => {
        if (err) reject(err);
        else resolve(output);
      });
    });

    console.log(`Found ${records.length} influencers to import...`);

    // Clear existing data (optional - comment out if you want to keep existing data)
    await prisma.influencer.deleteMany({});
    console.log('Cleared existing influencer data');

    // Import each record
    for (const record of records) {
      // Parse name into firstName and lastName
      const nameParts = (record['Name'] || '').trim().split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Parse location into city and state
      const locationParts = (record['Location'] || '').split(',').map((s: string) => s.trim());
      const city = locationParts[0] || 'Unknown';
      const state = locationParts[1] || null;

      // Parse followers
      const followersStr = (record['FOLLOWERS'] || '0').toString().replace(/,/g, '');
      const followers = parseInt(followersStr) || 0;

      // Parse avg views
      const avgViewsStr = record['AVG VIEWS'] ? record['AVG VIEWS'].toString().replace(/,/g, '') : null;
      const avgViews = avgViewsStr ? parseInt(avgViewsStr) : null;

      // Parse genre into primary and secondary
      const genres = (record['Genre'] || '').split(/[|,]/).map((g: string) => g.trim()).filter(Boolean);
      const primaryGenre = genres[0] || 'General';
      const secondaryGenre = genres[1] || null;

      // Create contact JSON
      const contactValue = record['CONTACT/ EMAIL'] || '';
      const isEmail = contactValue.includes('@');
      const contact = {
        contactType: isEmail ? 'Email' : 'Number',
        contactValue: contactValue,
        contactSubType: ''
      };

      // Create commercials JSON (you may need to adjust this based on your data)
      const commercials = [
        {
          platform: 'Instagram',
          type: 'Post',
          count: 0,
          countUnit: 'Thousand',
          monthAdRights: 0
        }
      ];

      await prisma.influencer.create({
        data: {
          firstName,
          lastName,
          igLink: record['IG LINK'] || '',
          followers,
          followersUnit: followers >= 1000000 ? 'M' : 'K',
          avgViews,
          avgViewsUnit: avgViews && avgViews >= 1000000 ? 'M' : 'K',
          primaryGenre,
          secondaryGenre,
          city,
          state,
          contact,
          commercials,
          gender: 'Not Specified'
        }
      });
    }

    console.log(`✅ Successfully imported ${records.length} influencers`);
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
