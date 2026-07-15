/**
 * Fix followers and avgViews values.
 * Our seed stored raw integers (195000) but the system expects display values (195 with unit K).
 * Divide all K-unit records by 1000, M-unit records by 1000000.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const influencers = await prisma.influencer.findMany();
  console.log(`Fixing followers for ${influencers.length} influencers...`);

  let updated = 0;
  for (const inf of influencers) {
    const fUnit = inf.followersUnit as string;
    const avUnit = inf.avgViewsUnit as string | null;

    // Only fix if value looks like a full integer (> 1000 for K, > 1000000 for M)
    let newFollowers = inf.followers;
    if (fUnit === 'K' && inf.followers > 999) {
      newFollowers = Math.round(inf.followers / 1000);
    } else if (fUnit === 'M' && inf.followers > 999999) {
      newFollowers = Math.round(inf.followers / 1000000);
    }

    let newAvgViews = inf.avgViews;
    if (inf.avgViews !== null) {
      if (avUnit === 'K' && inf.avgViews > 999) {
        newAvgViews = Math.round(inf.avgViews / 1000);
      } else if (avUnit === 'M' && inf.avgViews > 999999) {
        newAvgViews = Math.round(inf.avgViews / 1000000);
      }
    }

    if (newFollowers !== inf.followers || newAvgViews !== inf.avgViews) {
      await prisma.influencer.update({
        where: { id: inf.id },
        data: { followers: newFollowers, avgViews: newAvgViews },
      });
      console.log(`  ${inf.firstName} ${inf.lastName}: followers ${inf.followers}→${newFollowers}, avgViews ${inf.avgViews}→${newAvgViews}`);
      updated++;
    }
  }

  console.log(`\nDone! Fixed ${updated} records.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
