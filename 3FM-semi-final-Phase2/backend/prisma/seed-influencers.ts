import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFollowers(val: string): number {
  const v = val.trim().replace(/,/g, '');
  if (!v || v === '-') return 0;
  if (/^\d+\.?\d*[Kk]$/.test(v)) return Math.round(parseFloat(v) * 1000);
  if (/^\d+\.?\d*[Mm]$/.test(v)) return Math.round(parseFloat(v) * 1_000_000);
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function parseAvgViews(val: string): number | null {
  const v = val.trim().replace(/,/g, '');
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function parseName(name: string): { firstName: string; lastName: string } {
  const t = name.trim();
  const idx = t.indexOf(' ');
  if (idx === -1) return { firstName: t, lastName: '-' };
  return { firstName: t.slice(0, idx), lastName: t.slice(idx + 1).trim() || '-' };
}

function parseGenre(genre: string): { primaryGenre: string; secondaryGenre: string | null } {
  const t = genre.trim();
  // If empty or pure digits (data error like "250000"), fall back to "-"
  if (!t || /^\d+$/.test(t)) return { primaryGenre: '-', secondaryGenre: null };
  const parts = t.split('/');
  return {
    primaryGenre: parts[0].trim() || '-',
    secondaryGenre: parts[1]?.trim() || null,
  };
}

function parseContact(contact: string): object {
  const t = contact.trim();
  if (!t || t === '-') return { value: '-' };
  if (t.includes('@')) return { email: t };
  // Manager note pattern: "Name(manager)  phone" or "Name  phone"
  const mgr = t.match(/^(.+?)\s{2,}(\d{7,})$/);
  if (mgr) return { phone: mgr[2], note: mgr[1].trim() };
  // Plain phone / international
  return { phone: t };
}

function parseLocation(location: string): string {
  const t = location.trim();
  return !t || t === '--' ? '-' : t;
}

// ─── Raw CSV rows ─────────────────────────────────────────────────────────────
// Columns: name | ig | followers | avgViews | genre | contact | commercials | location

const rows: [string, string, string, string, string, string, string, string][] = [
  ["Prince Sudhir", "https://www.instagram.com/iamprincesudhir?igsh=c3RldWdqazI5bGp1", "195000", "50000", "Fashion/Skincare", "6352983632", "Collab reel - 80k, Non collab - 60k, Static post - 30k, Video story- 25k", "Mumbai"],
  ["Harsh Gandhi", "https://www.instagram.com/harshhgandhii?igsh=MWJ6NTMxdDE2MDVxYw==", "86700", "25000", "Skincare", "9619018518", "Song Promo Reel-40k, Non Collab Reel-80k, Collab Reel-85k, Static Post-55k, Story-20k", "Mumbai"],
  ["Kinshuk Gujral", "https://www.instagram.com/kinshukwearss?igsh=MWNqbnRibTZhbmgwNA==", "167000", "150000", "Fashion", "8005669980", "1 song promotion reel- 60K, Static post-45K, Story-20K", "Jaipur"],
  ["Chirag Sharma", "https://www.instagram.com/themanicstyle?igsh=c2o1ZHd6c3ZsdHpp", "192000", "300000", "Fashion/Lifestyle", "8894691442", "1 Reel-50k+TDS, 1 Story-15k+TDS", "--"],
  ["Manan", "https://www.instagram.com/mananify?igsh=bjIycDFxYW93bXQ4", "89500", "30000", "Fashion/Grooming", "8319567594", "Song Promo-20k, Static Post-6k, Story-3k, All Package(Reel+Static+Story)-25k", "Mumbai and Indore"],
  ["Muhammed Fayis", "https://www.instagram.com/paiichuuu?igsh=b2FlaHByM3BvYzc1", "298000", "300000", "Fashion/Skincare", "9449311345", "1 song promotion reel- 1.8L + GST, 1 Collab Reel- 2.5L + GST, static post- 80K + GST, Video Story- 50K + GST, NEGOTIABLE", "Bangalore"],
  // Row 7: Vinay Pal has an extra column — genre field contains "250000" (data error), using "-"
  ["Vinay Pal", "https://www.instagram.com/mr.groomanic?igsh=aDljbGtlcGdhZjBo", "161000", "250000", "-", "7999539694", "Collab Reel-70k, Static Post-40k", "Mumbai"],
  ["Fathma Shekh", "https://www.instagram.com/fatima.xyt?igsh=MXM5ZGI4b3g0aDFzZw==", "40700", "35000", "Mainly Skincare", "9930505516", "Reel-25k, Video Story-15k, 1month usage rights-5k", "Karnataka"],
  ["Kasak Singh", "https://www.instagram.com/kasakk.____?igsh=MTM0cmZvY2ZxbXNzZQ==", "139000", "150000", "Skincare/Fashion", "9372086096", "25k for song promotion, 20k for static post, 15k for story", "--"],
  ["Amisha Keswani", "https://www.instagram.com/amishakeswani1?igsh=dWUzc2dvY29yMjRs", "62000", "18000", "Beauty/Fashion", "7798497176", "Song Promo Reel-20k, Static-9k, Story-4k", "Kalyan Mumbai"],
  ["Swayam and Tiya", "https://www.instagram.com/vibingwithsiya?igsh=MWxqYTY5MDlmdGNtaA==", "2748", "20000", "Genz", "9372648267", "1 Reel + 1 Static Post + 1 Story: 18000, (Commercials can be discussed further based on the campaign scope and usage.)", "Panvel Mumbai"],
  ["Bhawna and Naren", "https://www.instagram.com/justthetwoofus.tales?igsh=MW5xdHJjNGF6M3FxMA==", "75700", "20000", "Married", "8447783674", "Song Promo Reel-25k, Static post-20k, Story-8k", "--"],
  ["cutie potatoes", "https://www.instagram.com/cutieepotatoes?igsh=dTZoczRlNDlpaWgw", "31800", "100000", "Married", "9650434065", "Reel + Post + Story is 30k, NEGOTIABLE", "Gurugram Haryana"],
  ["Kyra", "https://www.instagram.com/kyra__worldd?igsh=MTJscmJnMXltM2cxbA==", "33400", "55000", "Dance", "8743983497", "Reel-4000", "--"],
  ["Kushagra", "https://www.instagram.com/kyushagraa?igsh=b21ibjNoa2w2bzd0", "26500", "90000", "Dance", "9355333936", "Song promo-15k, Brand promo-25k, Static post-8k, Story-5k", "Delhi NCR"],
  ["Aryan Soni", "https://www.instagram.com/arynnn.0x?igsh=MXQ3OTZ2ZTh0aTB6NA==", "130000", "100000", "Dance/Fashion", "917357761872", "Song promo-35k, Brand promo-60k, Static post-40k, Story-20k", "Delhi"],
  ["Meghaa and Abhinav", "https://www.instagram.com/pookie.and.pataka?igsh=Y3drbDRrY2pxampz", "32900", "20000", "Married Couple", "9953995872", "Song Promotion reel + Story - 30k", "Bangalore"],
  ["Kanisha Singh", "https://www.instagram.com/kanisha.singh?igsh=dGthcmFmeTUwdjhw", "25400", "24000", "Funny", "singhkanisha0@gmail.com", "Song Promo Reel + 1 Story-15k, Static Post-2k", "--"],
  ["Rohan Vairal", "https://www.instagram.com/_viral.rohan_?igsh=MXJveGF3NWN4em82bA==", "46800", "50000", "Funny", "contactviralrohan@gmail.com", "20k Negotiable", "Dadar Mumbai"],
  ["Gopi and Karan", "https://www.instagram.com/theruhafamily?igsh=MWg3YXZxY2dienhtcg==", "53500", "20000", "Relatable", "theruhafamily@gmail.com", "Reel-12k, Post-8k, Story-3k", "Surat Gujarat"],
  ["Isha and Bhavya", "https://www.instagram.com/isha.bhavya?igsh=MW8zc3NsZ2c2MjhtMw==", "17400", "40000", "Married", "9266739669", "1 SReel-40k+GST, Static Post-40k+GST, Story-15k+GST", "Gujrat"],
  ["Swati and Yuvraj", "https://www.instagram.com/suviandyuvi?igsh=bnRtZjZqdGlncmd0", "41900", "65000", "Relatable", "9717232884", "Song Promo Reel-35k, Static Post-12k, Story-10k", "Delhi"],
  ["Sheetal and Shinnik", "https://www.instagram.com/theonscreencouple?igsh=MWFqcHk5ZXp0cnNvZg==", "33000", "30000", "Funny", "9685169247", "1 Reel - 5k", "Andheri Mumbai"],
  ["Yash and Kervi", "https://www.instagram.com/salted.and.roasted?igsh=MWg4YnQ2NXczbW42dQ==", "5779", "20000", "Funny", "8169198440", "1 Collab Reel + 1 Story - 8k, 1 Collab Reel + 1 Post(8-10 pic) + 2-3 Stories - 14k", "--"],
  ["Eshita Banerjee", "https://www.instagram.com/foodswitheshita?igsh=MWU1YWtlcmN3ZzR3", "2553", "50000", "Food Blogger", "Divya(manager)  8904648145", "Song Promo-20k, Brand promo-25k, Static Post-10k", "Kolkata"],
  ["Janvi Masand", "https://www.instagram.com/janvi__masand?igsh=NHRzdHVsYjNneHFk", "5010", "12000", "Mainly Beauty and Skincare", "7507743050", "Song Promo-2.5k, Brand Promo-3.5k, Static Post-2k, Story-500", "Ulhasnagar"],
  ["Avni", "https://www.instagram.com/avvx.__?utm_source=ig_web_button_share_sheet&igsh=bDR3YnVwdW1rN2Ex", "12000", "50000", "Fashion/Dance", "8076974827", "1 Non - Collab : 4000", "Delhi"],
  ["Devikaa", "https://www.instagram.com/_devikaaaa_/reels/", "16200", "20000", "Fashion/Lifestyle/Couple", "9969526685", "1 Non - Collab : 4500", "Mumbai"],
  ["Kuntal Parmar", "https://www.instagram.com/that_foddieguy_?utm_source=ig_web_button_share_sheet&igsh=MThjMHIyNGRoMDA3dw==", "74.8K", "", "Food", "8320259270", "1 Non - Collab : 5000", "Ahemdabad"],
  ["Aditi Saini", "https://www.instagram.com/caughtinamour?utm_source=ig_web_button_share_sheet&igsh=MWw5OXVudzd2Y3p1ZQ==", "14.2K", "2500", "Fashion", "8689940881", "1 Non - Collab : 5000", "Mumbai"],
  ["Michelle Rose Quadros", "https://www.instagram.com/michellerosequadros?utm_source=ig_web_button_share_sheet&igsh=NTQ5Z3JnaTIwNWR3", "7830", "5000", "Lifestyle", "8861845425", "1 Non - Collab : 5000", "Banglore"],
  ["Anshika", "https://www.instagram.com/that.aestheticgirll?utm_source=ig_web_button_share_sheet&igsh=MWUzM2U2aHR3Zno2Nw==", "15800", "15000", "Lifestyle", "6283009062", "1 Non - Collab : 6000", "Chandigarh"],
  ["Honey", "https://www.instagram.com/honneysharmaa?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "18000", "20000", "Fashion/Lifestyle", "8169894738", "1 Non - Collab : 8000", "Mumbai"],
  ["Ronit Lokare", "https://www.instagram.com/rhythm.craft?utm_source=ig_web_button_share_sheet&igsh=MXJ2cWcwMXVkd3Fqag==", "163K", "", "Travel", "8459342793", "1 Non - Collab : 10000", "Mumbai"],
  ["Rujul", "https://www.instagram.com/rujul___06/reels/", "21100", "15000", "Fashion/Lifestyle", "8104121665", "1 Non - Collab : 10000", "Mumbai"],
  ["Siyaa", "https://www.instagram.com/mhatre_siyaa/reels/", "17100", "15000", "Fashion/Lifestyle", "9223581684", "1 Non - Collab : 10000", "Maharashtra"],
  ["Ankita", "https://www.instagram.com/ankitta.a/reels/", "125000", "300000", "Fashion/Lifestyle", "9085496603", "1 Non - Collab : 25000", "Assam"],
  ["Neha Kelkar", "https://www.instagram.com/neha.kelkar?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "37600", "10000", "Fashion/Lifestyle", "9892965841", "1 Non - Collab : 10000", "Mumbai"],
  ["Dev", "https://www.instagram.com/footloosedev?utm_source=ig_web_button_share_sheet&igsh=dXdrcmk3cG9oaW5t", "20.1K", "", "Travel", "8800763430", "1 Non - Collab : 11000", "Manali"],
  ["Kalyaniiii", "https://www.instagram.com/kalyaniiii.s?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "38900", "100000", "Fashion", "8879579640", "1 Non - Collab : 12000", "Mumbai"],
  ["Mugdha", "https://www.instagram.com/justt.mugdha/reels/", "47400", "60000", "Fashion/Lifestyle", "9324357661", "1 Non - Collab : 12000", "Assam"],
  ["Akash Rawat", "https://www.instagram.com/akshrwt96?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "59K", "", "Fitness", "8178456495", "1 Non - Collab : 15000", "Delhi"],
  ["Simran Dhingra", "https://www.instagram.com/simranndhingra?utm_source=ig_web_button_share_sheet&igsh=MW5oMHpqano2YWdheA==", "53K", "8000", "Fashion/Lifestyle", "9650554281", "1 Non - Collab : 15000", "Delhi"],
  ["Alex", "https://www.instagram.com/alexpicturs?utm_source=ig_web_button_share_sheet&igsh=YzBjcmQ3NHZsNXBl", "114K", "", "Travel", "9616145182", "1 Non - Collab : 15000", "Lucknow"],
  ["Muskan Maurya", "https://www.instagram.com/mauryamuskann?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "70900", "260200", "Fashion", "7307742657", "1 Non - Collab : 30000", "Delhi"],
  ["Deepshika", "https://www.instagram.com/deepshikha_gehi/reels/", "38200", "50000", "Fashion/Lifestyle", "8369472249", "1 Non - Collab : 15000", "Thane"],
  ["Priya Chaudhary", "https://www.instagram.com/the.cosmicvibe?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "67.2K", "20000", "Fashion", "9651517243", "1 Non - Collab : 18000", "Lucknow"],
  ["Tanya", "https://www.instagram.com/tanyaaak___?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "361000", "100000", "Fashion", "9818116692", "1 Non - Collab : 20000", "Delhi"],
  ["Dipti Parihar Sharma", "https://www.instagram.com/diptipariharsharma?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "98.9K", "200000", "Fashion", "9019597280", "1 Non - Collab : 22000", "Bengaluru"],
  ["Ruchika Ray", "https://www.instagram.com/ruchika_ray?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", "504K", "100000", "Fashion", "8207009932", "1 Non - Collab : 25000", "Delhi"],
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${rows.length} influencers...`);

  let created = 0;
  for (const [name, ig, followersRaw, avgViewsRaw, genreRaw, contactRaw, commercialsRaw, locationRaw] of rows) {
    const { firstName, lastName } = parseName(name);
    const followers = parseFollowers(followersRaw);
    const avgViews = parseAvgViews(avgViewsRaw);
    const { primaryGenre, secondaryGenre } = parseGenre(genreRaw);
    const contact = parseContact(contactRaw);
    const city = parseLocation(locationRaw);
    const commercials = { details: commercialsRaw.trim() || '-' };

    await prisma.influencer.create({
      data: {
        firstName,
        lastName,
        igLink: ig.trim(),
        followers,
        followersUnit: '',
        avgViews,
        avgViewsUnit: avgViews !== null ? '' : null,
        primaryGenre,
        secondaryGenre,
        city,
        state: null,
        contact,
        commercials,
        gender: '-',
      },
    });

    created++;
    console.log(`  [${created}/${rows.length}] ${firstName} ${lastName}`);
  }

  console.log(`\nDone! Created ${created} influencer records.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
