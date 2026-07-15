import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const r1 = await prisma.influencer.updateMany({
    where: { followersUnit: '' },
    data: { followersUnit: 'K' },
  });
  const r2 = await prisma.influencer.updateMany({
    where: { avgViewsUnit: '' },
    data: { avgViewsUnit: 'K' },
  });
  console.log('followersUnit fixed:', r1.count, 'records');
  console.log('avgViewsUnit fixed:', r2.count, 'records');
}

main().catch(console.error).finally(() => prisma.$disconnect());
