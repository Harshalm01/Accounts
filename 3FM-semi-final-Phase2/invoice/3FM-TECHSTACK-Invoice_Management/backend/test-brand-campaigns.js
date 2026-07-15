const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testBrandCampaigns() {
  try {
    const brands = await prisma.brand.findMany();
    
    for (const brand of brands) {
      console.log(`\n=== BRAND: ${brand.name} (ID: ${brand.id}) ===`);
      
      // Query campaigns by brandName (same as API)
      const campaigns = await prisma.campaign.findMany({
        where: { brandName: brand.name }
      });
      
      console.log(`Campaigns with brandName="${brand.name}": ${campaigns.length}`);
      campaigns.forEach(c => {
        console.log(`  - ${c.name} (ID: ${c.id})`);
      });
      
      // Also check pitches
      const pitches = await prisma.pitch.findMany({
        where: { 
          brandId: brand.id,
          status: { in: ['SENT', 'UNDER_REVIEW', 'ACCEPTED'] }
        },
        include: { campaign: true }
      });
      
      console.log(`Pitched campaigns: ${pitches.length}`);
      pitches.forEach(p => {
        console.log(`  - ${p.campaign?.name || 'DELETED'} (Campaign ID: ${p.campaignId})`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBrandCampaigns();
