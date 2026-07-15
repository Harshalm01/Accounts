import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showAllTables() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('DATABASE CONNECTION INFO');
    console.log('='.repeat(80));
    console.log('Database Name: 3fm_db');
    console.log('Host: localhost');
    console.log('Port: 5432');
    console.log('Schema: public');

    console.log('\n' + '='.repeat(80));
    console.log('ALL TABLES IN DATABASE');
    console.log('='.repeat(80));

    const tables = await prisma.$queryRaw`
      SELECT
        table_name,
        (SELECT COUNT(*)
         FROM information_schema.columns
         WHERE table_schema = 'public'
         AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    console.log('\nTable Name              | Columns');
    console.log('-'.repeat(40));

    for (const table of tables) {
      console.log(`${table.table_name.padEnd(25)}| ${table.column_count}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('ROASTER TABLE DETAILS');
    console.log('='.repeat(80));

    const roasterColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'Roaster'
      ORDER BY ordinal_position;
    `;

    console.log('\nColumn Name     | Data Type        | Nullable');
    console.log('-'.repeat(60));
    for (const col of roasterColumns) {
      console.log(`${col.column_name.padEnd(15)} | ${col.data_type.padEnd(15)} | ${col.is_nullable}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('ROASTER TABLE DATA');
    console.log('='.repeat(80));

    const roasterData = await prisma.roaster.findMany();

    if (roasterData.length === 0) {
      console.log('\nNo data in Roaster table yet.');
    } else {
      console.log(`\nTotal Records: ${roasterData.length}\n`);
      roasterData.forEach((record, idx) => {
        console.log(`${idx + 1}. Month: ${record.month}`);
        console.log(`   File: ${record.fileName}`);
        console.log(`   Rows: ${Array.isArray(record.data) ? record.data.length : 'N/A'}`);
        console.log(`   Uploaded: ${record.uploadedAt}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('HOW TO VIEW IN DATABASE TOOLS:');
    console.log('='.repeat(80));
    console.log('');
    console.log('1. PRISMA STUDIO (Easiest):');
    console.log('   - Open browser: http://localhost:5555');
    console.log('   - Click "Roaster" in left sidebar');
    console.log('');
    console.log('2. pgAdmin / DBeaver / TablePlus:');
    console.log('   - Database: 3fm_db');
    console.log('   - Schema: public');
    console.log('   - Look for table: "Roaster" (capital R)');
    console.log('   - IMPORTANT: Table names are case-sensitive!');
    console.log('');
    console.log('3. Command Line (psql):');
    console.log('   psql -U postgres -d 3fm_db');
    console.log('   \\dt public.*');
    console.log('   SELECT * FROM "Roaster";');
    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

showAllTables();
