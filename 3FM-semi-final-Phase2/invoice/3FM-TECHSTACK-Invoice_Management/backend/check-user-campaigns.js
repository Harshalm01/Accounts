const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserAndCampaign() {
  try {
    // Find test user
    const user = await prisma.user.findFirst({
      where: { email: 'test@test.com' }
    });
    
    if (user) {
      console.log('\n✅ User found:');
      console.log('   Email:', user.email);
      console.log('   ID:', user.id);
      console.log('   Role:', user.role || 'No role set');
    } else {
      console.log('\n❌ User test@test.com not found');
    }
    
    // Check campaigns
    const campaigns = await prisma.campaign.findMany({
      select: {
        id: true,
        name: true,
        brandName: true,
        userId: true,
        contact: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\n✅ Campaigns in database:', campaigns.length);
    campaigns.forEach((c, index) => {
      console.log(`\n  ${index + 1}. ${c.name} (Brand: ${c.brandName})`);
      console.log(`     Contact: ${c.contact || 'N/A'}`);
      console.log(`     userId: ${c.userId || 'NULL'}`);
      console.log(`     Campaign ID: ${c.id.substring(0, 8)}...`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserAndCampaign();
