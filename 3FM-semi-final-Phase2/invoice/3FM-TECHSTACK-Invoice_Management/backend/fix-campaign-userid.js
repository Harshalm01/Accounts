const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCampaignUserId() {
  try {
    // Find test user
    const user = await prisma.user.findFirst({
      where: { email: 'test@test.com' }
    });
    
    if (!user) {
      console.log('❌ User test@test.com not found');
      return;
    }
    
    console.log('✅ Found user:', user.email, 'ID:', user.id);
    
    // Update campaigns with NULL userId
    const result = await prisma.campaign.updateMany({
      where: { userId: null },
      data: { userId: user.id }
    });
    
    console.log(`✅ Updated ${result.count} campaigns with userId: ${user.id}`);
    
    // Show updated campaigns
    const campaigns = await prisma.campaign.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        brandName: true,
        userId: true
      }
    });
    
    console.log('\n✅ Campaigns now belonging to user:');
    campaigns.forEach((c, index) => {
      console.log(`  ${index + 1}. ${c.name} (Brand: ${c.brandName})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixCampaignUserId();
