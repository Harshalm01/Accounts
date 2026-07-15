const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
  try {
    const brandCount = await prisma.brand.count();
    const campaignCount = await prisma.campaign.count();
    const userCount = await prisma.user.count();
    
    console.log('=== DATABASE STATUS ===');
    console.log(`Brands: ${brandCount}`);
    console.log(`Campaigns: ${campaignCount}`);
    console.log(`Users: ${userCount}`);
    
    if (brandCount > 0) {
      const brands = await prisma.brand.findMany();
      console.log('\n=== BRANDS ===');
      brands.forEach(b => console.log(`  - ${b.name} (ID: ${b.id})`));
    }
    
    if (campaignCount > 0) {
      const campaigns = await prisma.campaign.findMany();
      console.log('\n=== CAMPAIGNS ===');
      campaigns.forEach(c => console.log(`  - ${c.name} for ${c.brandName}`));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
