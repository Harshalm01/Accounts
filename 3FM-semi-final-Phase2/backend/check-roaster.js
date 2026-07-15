import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRoaster() {
  try {
    console.log('=== ROASTER TABLE DATA ===\n');

    const records = await prisma.roaster.findMany({
      orderBy: { uploadedAt: 'desc' }
    });

    if (records.length === 0) {
      console.log('No records found in Roaster table.');
      console.log('\nThe Roaster table exists in your PostgreSQL database at:');
      console.log('Database: 3fm_db');
      console.log('Schema: public');
      console.log('Table: Roaster');
      console.log('\nTable Structure:');
      console.log('- id: String (UUID)');
      console.log('- month: String');
      console.log('- fileName: String');
      console.log('- data: Json (stores all CSV rows)');
      console.log('- uploadedAt: DateTime');
      console.log('- createdAt: DateTime');
      console.log('- updatedAt: DateTime');
    } else {
      console.log(`Found ${records.length} record(s):\n`);
      records.forEach((record, index) => {
        console.log(`Record ${index + 1}:`);
        console.log(`  ID: ${record.id}`);
        console.log(`  Month: ${record.month}`);
        console.log(`  File Name: ${record.fileName}`);
        console.log(`  Data Rows: ${Array.isArray(record.data) ? record.data.length : 'N/A'}`);
        console.log(`  Uploaded At: ${record.uploadedAt}`);
        console.log('');
      });

      console.log('\nDatabase Location:');
      console.log('Database: 3fm_db (PostgreSQL)');
      console.log('Schema: public');
      console.log('Table: Roaster');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkRoaster();
