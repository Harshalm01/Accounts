/**
 * Populate commercials for all seeded influencers.
 * Each CommercialItem: { platform, type, count (rupees stored), countUnit, monthAdRights }
 * The edit form displays: count / 1000 (Thousand) or count / 100000 (Lacs)
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

type CommercialItem = {
  platform: 'Instagram' | 'Youtube';
  type: string;
  count: number;
  countUnit: 'Thousand' | 'Lacs (L)';
  monthAdRights: number;
};

const ig = (handle: string) =>
  `https://www.instagram.com/${handle}`;

function item(type: string, count: number, countUnit: 'Thousand' | 'Lacs (L)' = 'Thousand'): CommercialItem {
  return { platform: 'Instagram', type, count, countUnit, monthAdRights: 0 };
}

// Keyed by igLink (just the handle portion matched via LIKE)
const data: { handle: string; commercials: CommercialItem[] }[] = [
  {
    handle: 'iamprincesudhir',
    commercials: [
      item('Collab Reel', 80000),
      item('Non-Collab Reel', 60000),
      item('Static Post', 30000),
      item('Video Story', 25000),
    ],
  },
  {
    handle: 'harshhgandhii',
    commercials: [
      item('Song Promo Reel', 40000),
      item('Non-Collab Reel', 80000),
      item('Collab Reel', 85000),
      item('Static Post', 55000),
      item('Story', 20000),
    ],
  },
  {
    handle: 'kinshukwearss',
    commercials: [
      item('Song Promotion Reel', 60000),
      item('Static Post', 45000),
      item('Story', 20000),
    ],
  },
  {
    handle: 'themanicstyle',
    commercials: [
      item('Reel', 50000),
      item('Story', 15000),
    ],
  },
  {
    handle: 'mananify',
    commercials: [
      item('Song Promo', 20000),
      item('Static Post', 6000),
      item('Story', 3000),
      item('All Package (Reel + Static + Story)', 25000),
    ],
  },
  {
    handle: 'paiichuuu',
    commercials: [
      item('Song Promotion Reel', 180000, 'Lacs (L)'),
      item('Collab Reel', 250000, 'Lacs (L)'),
      item('Static Post', 80000),
      item('Video Story', 50000),
    ],
  },
  {
    handle: 'mr.groomanic',
    commercials: [
      item('Collab Reel', 70000),
      item('Static Post', 40000),
    ],
  },
  {
    handle: 'fatima.xyt',
    commercials: [
      item('Reel', 25000),
      item('Video Story', 15000),
      item('1 Month Usage Rights', 5000),
    ],
  },
  {
    handle: 'kasakk.____',
    commercials: [
      item('Song Promotion', 25000),
      item('Static Post', 20000),
      item('Story', 15000),
    ],
  },
  {
    handle: 'amishakeswani1',
    commercials: [
      item('Song Promo Reel', 20000),
      item('Static Post', 9000),
      item('Story', 4000),
    ],
  },
  {
    handle: 'vibingwithsiya',
    commercials: [
      item('Reel + Static Post + Story Package', 18000),
    ],
  },
  {
    handle: 'justthetwoofus.tales',
    commercials: [
      item('Song Promo Reel', 25000),
      item('Static Post', 20000),
      item('Story', 8000),
    ],
  },
  {
    handle: 'cutieepotatoes',
    commercials: [
      item('Reel + Post + Story Package', 30000),
    ],
  },
  {
    handle: 'kyra__worldd',
    commercials: [
      item('Reel', 4000),
    ],
  },
  {
    handle: 'kyushagraa',
    commercials: [
      item('Song Promo', 15000),
      item('Brand Promo', 25000),
      item('Static Post', 8000),
      item('Story', 5000),
    ],
  },
  {
    handle: 'arynnn.0x',
    commercials: [
      item('Song Promo', 35000),
      item('Brand Promo', 60000),
      item('Static Post', 40000),
      item('Story', 20000),
    ],
  },
  {
    handle: 'pookie.and.pataka',
    commercials: [
      item('Song Promotion Reel + Story', 30000),
    ],
  },
  {
    handle: 'kanisha.singh',
    commercials: [
      item('Song Promo Reel + Story', 15000),
      item('Static Post', 2000),
    ],
  },
  {
    handle: '_viral.rohan_',
    commercials: [
      item('Reel', 20000),
    ],
  },
  {
    handle: 'theruhafamily',
    commercials: [
      item('Reel', 12000),
      item('Post', 8000),
      item('Story', 3000),
    ],
  },
  {
    handle: 'isha.bhavya',
    commercials: [
      item('Sponsored Reel', 40000),
      item('Static Post', 40000),
      item('Story', 15000),
    ],
  },
  {
    handle: 'suviandyuvi',
    commercials: [
      item('Song Promo Reel', 35000),
      item('Static Post', 12000),
      item('Story', 10000),
    ],
  },
  {
    handle: 'theonscreencouple',
    commercials: [
      item('Reel', 5000),
    ],
  },
  {
    handle: 'salted.and.roasted',
    commercials: [
      item('Collab Reel + Story', 8000),
      item('Collab Reel + Post + Stories', 14000),
    ],
  },
  {
    handle: 'foodswitheshita',
    commercials: [
      item('Song Promo', 20000),
      item('Brand Promo', 25000),
      item('Static Post', 10000),
    ],
  },
  {
    handle: 'janvi__masand',
    commercials: [
      item('Song Promo', 2500),
      item('Brand Promo', 3500),
      item('Static Post', 2000),
      item('Story', 500),
    ],
  },
  {
    handle: 'avvx.__',
    commercials: [item('Non-Collab Reel', 4000)],
  },
  {
    handle: '_devikaaaa_',
    commercials: [item('Non-Collab Reel', 4500)],
  },
  {
    handle: 'that_foddieguy_',
    commercials: [item('Non-Collab Reel', 5000)],
  },
  {
    handle: 'caughtinamour',
    commercials: [item('Non-Collab Reel', 5000)],
  },
  {
    handle: 'michellerosequadros',
    commercials: [item('Non-Collab Reel', 5000)],
  },
  {
    handle: 'that.aestheticgirll',
    commercials: [item('Non-Collab Reel', 6000)],
  },
  {
    handle: 'honneysharmaa',
    commercials: [item('Non-Collab Reel', 8000)],
  },
  {
    handle: 'rhythm.craft',
    commercials: [item('Non-Collab Reel', 10000)],
  },
  {
    handle: 'rujul___06',
    commercials: [item('Non-Collab Reel', 10000)],
  },
  {
    handle: 'mhatre_siyaa',
    commercials: [item('Non-Collab Reel', 10000)],
  },
  {
    handle: 'ankitta.a',
    commercials: [item('Non-Collab Reel', 25000)],
  },
  {
    handle: 'neha.kelkar',
    commercials: [item('Non-Collab Reel', 10000)],
  },
  {
    handle: 'footloosedev',
    commercials: [item('Non-Collab Reel', 11000)],
  },
  {
    handle: 'kalyaniiii.s',
    commercials: [item('Non-Collab Reel', 12000)],
  },
  {
    handle: 'justt.mugdha',
    commercials: [item('Non-Collab Reel', 12000)],
  },
  {
    handle: 'akshrwt96',
    commercials: [item('Non-Collab Reel', 15000)],
  },
  {
    handle: 'simranndhingra',
    commercials: [item('Non-Collab Reel', 15000)],
  },
  {
    handle: 'alexpicturs',
    commercials: [item('Non-Collab Reel', 15000)],
  },
  {
    handle: 'mauryamuskann',
    commercials: [item('Non-Collab Reel', 30000)],
  },
  {
    handle: 'deepshikha_gehi',
    commercials: [item('Non-Collab Reel', 15000)],
  },
  {
    handle: 'the.cosmicvibe',
    commercials: [item('Non-Collab Reel', 18000)],
  },
  {
    handle: 'tanyaaak___',
    commercials: [item('Non-Collab Reel', 20000)],
  },
  {
    handle: 'diptipariharsharma',
    commercials: [item('Non-Collab Reel', 22000)],
  },
  {
    handle: 'ruchika_ray',
    commercials: [item('Non-Collab Reel', 25000)],
  },
];

async function main() {
  console.log(`Updating commercials for ${data.length} influencers...`);
  let updated = 0;

  for (const entry of data) {
    const influencer = await prisma.influencer.findFirst({
      where: { igLink: { contains: entry.handle } },
    });

    if (!influencer) {
      console.warn(`  Not found: ${entry.handle}`);
      continue;
    }

    await prisma.influencer.update({
      where: { id: influencer.id },
      data: { commercials: entry.commercials as any },
    });

    updated++;
    console.log(`  [${updated}] ${influencer.firstName} ${influencer.lastName} — ${entry.commercials.length} item(s)`);
  }

  console.log(`\nDone! Updated commercials for ${updated} influencers.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
