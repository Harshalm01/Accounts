/**
 * Migration: Fix contact and commercials JSON format for seeded influencers.
 *
 * Frontend expects:
 *   contact: { contactType: 'Number'|'Email', contactSubType?: string, contactValue: string }
 *   commercials: CommercialItem[]  (array, so .map() works)
 *
 * Seed stored:
 *   contact: { phone: "..." } | { email: "..." } | { value: "-" } | { phone, note }
 *   commercials: { details: "..." }
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function migrateContact(raw: any): object {
  if (!raw || typeof raw !== 'object') {
    return { contactType: 'Number', contactSubType: '', contactValue: '-' };
  }

  // Already in correct format
  if ('contactType' in raw && 'contactValue' in raw) return raw;

  if ('email' in raw) {
    return { contactType: 'Email', contactSubType: '', contactValue: raw.email };
  }

  if ('phone' in raw) {
    const note = raw.note ? raw.note : '';
    // Manager pattern
    const subType = note.toLowerCase().includes('manager') ? 'Manager' : '';
    return { contactType: 'Number', contactSubType: subType, contactValue: raw.phone };
  }

  if ('value' in raw) {
    return { contactType: 'Number', contactSubType: '', contactValue: raw.value };
  }

  return { contactType: 'Number', contactSubType: '', contactValue: '-' };
}

function migrateCommercials(raw: any): object[] {
  // Already correct — it's a non-empty array of CommercialItems
  if (Array.isArray(raw)) return raw;

  // Was stored as { details: "..." } — return empty array so .map() works
  // Users can add proper entries via the edit form
  return [];
}

async function main() {
  const influencers = await prisma.influencer.findMany();
  console.log(`Migrating ${influencers.length} influencers...`);

  let updated = 0;
  for (const inf of influencers) {
    const contact = migrateContact(inf.contact as any);
    const commercials = migrateCommercials(inf.commercials as any);

    await prisma.influencer.update({
      where: { id: inf.id },
      data: { contact, commercials },
    });

    updated++;
    console.log(`  [${updated}/${influencers.length}] ${inf.firstName} ${inf.lastName}`);
  }

  console.log(`\nDone! Migrated ${updated} records.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
