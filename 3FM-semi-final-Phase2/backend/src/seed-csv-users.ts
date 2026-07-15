import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

type Role = 'ADMIN' | 'AGENCY' | 'EMPLOYEE';

interface ParsedUser {
  name: string;
  password: string;
  designation: string;
}

/**
 * Each CSV line format: <Full Name>  <Password@token>  <Designation>
 * The password token always contains '@', which is used to split the fields.
 */
function parseLine(line: string): ParsedUser | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  const atIdx = tokens.findIndex(t => t.includes('@'));
  if (atIdx === -1) return null;

  const name = tokens.slice(0, atIdx).join(' ').trim();
  const password = tokens[atIdx].trim();
  const designation = tokens.slice(atIdx + 1).join(' ').trim();

  if (!name || !password) return null;
  return { name, password, designation };
}

async function seedFile(filePath: string, role: Role) {
  console.log(`\n--- Processing ${path.basename(filePath)} (role: ${role}) ---`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) { skipped++; continue; }

    const { name, password, designation } = parsed;
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user with this name already exists (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          designation: designation || existing.designation,
          password: hashedPassword,
          role: role as any,
        },
      });
      console.log(`  Updated : ${name} (${designation || '—'})`);
      updated++;
    } else {
      await prisma.user.create({
        data: {
          name,
          password: hashedPassword,
          designation: designation || null,
          role: role as any,
        },
      });
      console.log(`  Added   : ${name} (${designation || '—'})`);
      added++;
    }
  }

  console.log(`  → Added: ${added}  Updated: ${updated}  Skipped (blank): ${skipped}`);
}

async function main() {
  const routesDir = path.join(__dirname, 'routes');

  await seedFile(path.join(routesDir, 'admins.csv'), 'ADMIN');
  await seedFile(path.join(routesDir, 'Heads.csv'), 'AGENCY');
  await seedFile(path.join(routesDir, 'employess.csv'), 'EMPLOYEE');

  console.log('\nSeeding complete!');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
