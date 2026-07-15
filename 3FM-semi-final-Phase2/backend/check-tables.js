import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listTables() {
  try {
    const result = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    console.log('=== DATABASE TABLES ===');
    console.log(result);

    // Check Roaster table specifically
    const roasterExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'Roaster'
      );
    `;

    console.log('\n=== ROASTER TABLE CHECK ===');
    console.log('Roaster table exists:', roasterExists);

    // Count records
    const count = await prisma.roaster.count();
    console.log('Number of records in Roaster table:', count);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

listTables();
