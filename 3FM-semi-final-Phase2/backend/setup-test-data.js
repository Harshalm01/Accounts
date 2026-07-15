const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setupTest() {
  try {
    // Create a test brand
    const brand = await prisma.brand.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Brand For Sync',
        industry: 'Technology',
        contactPerson: 'Test User'
      }
    });
    
    // Create a test campaign
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Test Campaign - Delete This',
        brandName: brand.name,
        contact: 'Test User',
        internalCost: 5000,
        externalCost: 10000,
        startDate: new Date('2026-02-20'),
        status: 'PLANNING'
      }
    });
    
    console.log('✅ Test setup complete!');
    console.log(`\n📦 Brand created: ${brand.name} (ID: ${brand.id})`);
    console.log(`📦 Campaign created: ${campaign.name} (ID: ${campaign.id})`);
    console.log(`\n🎯 Now test: Go to Brands page, open console, then delete the campaign from Campaigns page`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupTest();
