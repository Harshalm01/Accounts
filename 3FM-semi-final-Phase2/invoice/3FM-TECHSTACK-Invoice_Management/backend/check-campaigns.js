const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCampaigns() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\n✅ Total campaigns in database:', campaigns.length);
    console.log('\nCampaigns:');
    campaigns.forEach((c, index) => {
      console.log(`  ${index + 1}. ${c.name}`);
      console.log(`     Brand: ${c.brandName}`);
      console.log(`     Contact: ${c.contact || 'N/A'}`);
      console.log(`     Status: ${c.status}`);
      console.log(`     ID: ${c.id}`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkCampaigns();
