const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestBrand() {
  try {
    const brand = await prisma.brand.create({
      data: {
        name: 'Test Brand',
        industry: 'Technology',
        contactPerson: 'John Doe',
        contactPersonType: 'Brand Manager',
        email: 'test@brand.com',
        phone: '+1234567890',
        website: 'https://testbrand.com',
        notes: 'Test brand for campaign sync testing'
      }
    });
    
    console.log('✅ Test brand created successfully!');
    console.log(`   Name: ${brand.name}`);
    console.log(`   ID: ${brand.id}`);
    console.log('\nYou can now create campaigns for this brand to test live sync!');
  } catch (error) {
    console.error('❌ Error creating brand:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestBrand();
