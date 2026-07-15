/**
 * Seed influencers from CLEANED_master_data - 193000.csv
 * Uses batch createMany for performance.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

function cleanPhone(raw: string): string | null {
  if (!raw || raw.trim() === '-' || raw.trim() === '') return null;
  const first = raw.split('/')[0].trim();
  let d = first.replace(/[^\d]/g, '');
  if (!d) return null;
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d || null;
}

function buildContact(contactRaw: string, emailRaw: string): object {
  const phone = cleanPhone(contactRaw);
  const email = emailRaw && emailRaw.trim() !== '-' && emailRaw.trim() !== ''
    ? emailRaw.trim() : null;
  if (phone && email) return { contactType: 'Number', contactSubType: '', contactValue: phone, email };
  if (phone) return { contactType: 'Number', contactSubType: '', contactValue: phone };
  if (email) return { contactType: 'Email', contactSubType: '', contactValue: email };
  return { contactType: 'Number', contactSubType: '', contactValue: '-' };
}

function parseName(name: string): { firstName: string; lastName: string } {
  const t = name.trim();
  const idx = t.indexOf(' ');
  if (idx === -1) return { firstName: t || '-', lastName: '-' };
  return { firstName: t.slice(0, idx), lastName: t.slice(idx + 1).trim() || '-' };
}

function extractHandle(igLink: string): string {
  return igLink.trim()
    .replace(/https?:\/\/(www\.)?instagram\.com\/?/, '')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function parseNumber(val: string): number {
  if (!val || val.trim() === '-' || val.trim() === '') return 0;
  const v = val.trim().replace(/,/g, '');
  if (/^\d+\.?\d*[Kk]$/.test(v)) return Math.round(parseFloat(v) * 1000);
  if (/^\d+\.?\d*[Mm]$/.test(v)) return Math.round(parseFloat(v) * 1_000_000);
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

async function main() {
  const csvPath = path.join(__dirname, '..', 'CLEANED_master_data - 193000.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1);

  const existing = await prisma.influencer.findMany({ select: { igLink: true } });
  const existingHandles = new Set(existing.map(e => extractHandle(e.igLink)));
  console.log(`Existing influencers in DB: ${existingHandles.size}`);

  let created = 0;
  let skipped = 0;
  let invalid = 0;
  let batch: any[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await prisma.influencer.createMany({ data: batch });
    created += batch.length;
    console.log(`  [${created}] records inserted...`);
    batch = [];
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.split(',');
    if (parts.length < 4) { invalid++; continue; }

    const [nameRaw, contactRaw, emailRaw, igLinkRaw,
           followersRaw, avgViewsRaw, locationRaw, genreRaw] = parts;

    const igLink = igLinkRaw?.trim();
    if (!igLink || igLink === '-' || !igLink.includes('instagram.com')) {
      invalid++;
      continue;
    }

    const handle = extractHandle(igLink);
    if (!handle || handle.length < 2) { invalid++; continue; }

    if (existingHandles.has(handle)) { skipped++; continue; }
    existingHandles.add(handle);

    const { firstName, lastName } = parseName(nameRaw || '-');
    const contact = buildContact(contactRaw || '-', emailRaw || '');

    const INT4_MAX = 2_147_483_647;
    const followersRaw2 = parseNumber(followersRaw || '-');
    const followers = followersRaw2 > INT4_MAX ? 0 : followersRaw2;
    const avgViewsVal2 = parseNumber(avgViewsRaw || '-');
    const avgViewsVal = avgViewsVal2 > INT4_MAX ? 0 : avgViewsVal2;
    const avgViews = avgViewsVal > 0 ? avgViewsVal : null;

    const city = locationRaw?.trim() && locationRaw.trim() !== '-' ? locationRaw.trim() : '-';
    const primaryGenre = genreRaw?.trim() && genreRaw.trim() !== '-' ? genreRaw.trim().replace(/\r/g, '') : '-';

    batch.push({
      firstName,
      lastName,
      igLink,
      followers,
      followersUnit: 'K',
      avgViews,
      avgViewsUnit: avgViews !== null ? 'K' : null,
      primaryGenre,
      secondaryGenre: null,
      city,
      state: null,
      contact: contact as any,
      commercials: [] as any,
      gender: '-',
    });

    if (batch.length >= BATCH_SIZE) await flush();
  }

  await flush();

  console.log(`\nDone!`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Skipped (invalid): ${invalid}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
