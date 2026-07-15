/** Revert followers/avgViews back to actual integers (multiply display values by 1000). */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const influencers = await prisma.influencer.findMany();
  console.log(`Reverting ${influencers.length} influencers to actual integers...`);

  let updated = 0;
  for (const inf of influencers) {
    const fUnit = inf.followersUnit as string;
    const avUnit = inf.avgViewsUnit as string | null;

    // Only revert values that look like display values (< 1000 for K records)
    let newFollowers = inf.followers;
    if (fUnit === 'K' && inf.followers < 1000) {
      newFollowers = inf.followers * 1000;
    } else if (fUnit === 'M' && inf.followers < 1000) {
      newFollowers = inf.followers * 1000000;
    }

    let newAvgViews = inf.avgViews;
    if (inf.avgViews !== null) {
      if (avUnit === 'K' && inf.avgViews < 1000) {
        newAvgViews = inf.avgViews * 1000;
      } else if (avUnit === 'M' && inf.avgViews < 1000) {
        newAvgViews = inf.avgViews * 1000000;
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
  console.log(`\nDone! Reverted ${updated} records.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
