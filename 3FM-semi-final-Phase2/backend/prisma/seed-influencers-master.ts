/**
 * Seed influencers from CLEANED_master_data CSV.
 * Contact rules:
 *   - Both phone + email  → store both
 *   - Phone only           → store phone
 *   - Email only           → store email
 *   - Neither              → store "-"
 * Skips rows whose igLink handle already exists in the DB.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

function cleanPhone(raw: string): string | null {
  if (!raw || raw.trim() === '-' || raw.trim() === '') return null;
  // If multiple numbers (e.g. "8291183388 / 8698888134"), take the first
  const first = raw.split('/')[0].trim();
  // Strip everything except digits
  let d = first.replace(/[^\d]/g, '');
  if (!d) return null;
  // Strip leading 91 country code if 12 digits
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  // Strip leading 0 if 11 digits
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  // If still looks invalid (< 5 digits), keep as-is rather than discard
  return d || null;
}

function buildContact(contactRaw: string, emailRaw: string): object {
  const phone = cleanPhone(contactRaw);
  const email = emailRaw && emailRaw.trim() !== '-' && emailRaw.trim() !== ''
    ? emailRaw.trim()
    : null;

  if (phone && email) {
    return { contactType: 'Number', contactSubType: '', contactValue: phone, email };
  }
  if (phone) {
    return { contactType: 'Number', contactSubType: '', contactValue: phone };
  }
  if (email) {
    return { contactType: 'Email', contactSubType: '', contactValue: email };
  }
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
    .replace(/\?.*$/, '')   // strip query params
    .replace(/\/$/, '')      // strip trailing slash
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

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const csvPath = path.join(__dirname, '..', 'CLEANED_master_data - Sheet1.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1); // skip header

  // Build set of existing handles for fast duplicate detection
  const existing = await prisma.influencer.findMany({ select: { igLink: true } });
  const existingHandles = new Set(existing.map(e => extractHandle(e.igLink)));
  console.log(`Existing influencers in DB: ${existingHandles.size}`);

  let created = 0;
  let skipped = 0;
  let invalid = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    // columns: Name, Contact, Email, IG Link, Followers, Avg Views, Location, Genre
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

    // Skip duplicate
    if (existingHandles.has(handle)) {
      skipped++;
      continue;
    }
    existingHandles.add(handle); // prevent re-insert within same run

    const { firstName, lastName } = parseName(nameRaw || '-');
    const contact = buildContact(contactRaw || '-', emailRaw || '');

    const followers = parseNumber(followersRaw || '-');
    const avgViewsVal = parseNumber(avgViewsRaw || '-');
    const avgViews = avgViewsVal > 0 ? avgViewsVal : null;

    const city = locationRaw?.trim() && locationRaw.trim() !== '-' ? locationRaw.trim() : '-';
    const primaryGenre = genreRaw?.trim() && genreRaw.trim() !== '-' ? genreRaw.trim() : '-';

    await prisma.influencer.create({
      data: {
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
      },
    });

    created++;
    if (created % 100 === 0) console.log(`  [${created}] records inserted...`);
  }

  console.log(`\nDone!`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Skipped (invalid): ${invalid}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
