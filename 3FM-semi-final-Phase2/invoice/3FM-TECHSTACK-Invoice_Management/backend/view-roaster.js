import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function viewRoasterData() {
  try {
    console.log('=== ROASTER TABLE - ALL DATA ===\n');

    const records = await prisma.roaster.findMany({
      orderBy: { uploadedAt: 'desc' }
    });

    if (records.length === 0) {
      console.log('No records found.');
    } else {
      records.forEach((record, index) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`RECORD ${index + 1}`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Month: ${record.month}`);
        console.log(`File: ${record.fileName}`);
        console.log(`Uploaded: ${record.uploadedAt}`);
        console.log(`\nDATA (First 5 rows):`);

        if (Array.isArray(record.data)) {
          const preview = record.data.slice(0, 5);
          console.table(preview);
          console.log(`\n... and ${record.data.length - 5} more rows`);
          console.log(`Total rows: ${record.data.length}`);
        }
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

viewRoasterData();
