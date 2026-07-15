const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    const campaigns = await prisma.campaign.findMany({
      select: { id: true, name: true, brandName: true }
    });
    console.log('\n=== CAMPAIGNS ===');
    console.log(`Total campaigns: ${campaigns.length}`);
    campaigns.forEach(c => console.log(`  - ${c.name} (${c.brandName})`));

    const pitches = await prisma.pitch.findMany({
      select: { 
        id: true, 
        status: true, 
        campaignId: true,
        campaign: { select: { name: true } }
      }
    });
    console.log('\n=== PITCHES ===');
    console.log(`Total pitches: ${pitches.length}`);
    pitches.forEach(p => console.log(`  - Campaign: ${p.campaign?.name || 'DELETED'}, Status: ${p.status}`));

    const brands = await prisma.brand.findMany({
      select: { id: true, name: true }
    });
    console.log('\n=== BRANDS ===');
    console.log(`Total brands: ${brands.length}`);
    brands.forEach(b => console.log(`  - ${b.name}`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
