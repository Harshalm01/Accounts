import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const heads = [
  { name: 'Abhishek Dulani', password: 'AhbishekD@3fm26', designation: 'Account Director',                    phone: '9900000001' },
  { name: 'Priya Vasani',    password: 'PriyaV@3fm26',    designation: 'Account Director',                    phone: '9900000002' },
  { name: 'Jhalak Tated',    password: 'JhalakT@3fm.co',  designation: 'Account Director',                    phone: '9900000003' },
  { name: 'Bhumisha Rajgar', password: 'BhumishaR@3fm26', designation: 'Visual Head',                         phone: '9900000004' },
  { name: 'Riti Tated',      password: 'RitiT@3fm26',     designation: 'Account Director',                    phone: '9900000005' },
  { name: 'Shweta Shinde',   password: 'ShwetaS@3fm26',   designation: 'Accountant',                          phone: '9900000006' },
  { name: 'Moiz Shaikh',     password: 'MoizS@3fm26',     designation: 'Sr Account Manager',                  phone: '9900000007' },
  { name: 'Harsh Shah',      password: 'HarshS@3fm26',    designation: 'Head of Content & Social Media Marketing', phone: '9900000008' },
  { name: 'Hem Joshi',       password: 'HemJ@3fm26',      designation: 'Sr Account Manager',                  phone: '9900000009' },
  { name: 'Deepak Lokhande', password: 'DeepakL@3fm26',   designation: 'Jr. Accountant',                      phone: '9900000010' },
  { name: 'Krishna Talati',  password: 'KrishnaT@3fm26',  designation: 'Talent Manager',                      phone: '9900000011' },
];

async function main() {
  console.log('Seeding 11 head users...\n');

  for (const head of heads) {
    const existing = await prisma.user.findUnique({ where: { phone: head.phone } });

    if (existing) {
      // Update designation and name if user already exists
      await prisma.user.update({
        where: { phone: head.phone },
        data: { name: head.name, designation: head.designation },
      });
      console.log(`  Updated: ${head.name} (${head.designation})`);
    } else {
      const hashed = await bcrypt.hash(head.password, 10);
      await prisma.user.create({
        data: {
          name: head.name,
          phone: head.phone,
          password: hashed,
          designation: head.designation,
          role: 'AGENCY',
          email: null,
        },
      });
      console.log(`  Created: ${head.name} (${head.designation}) — login phone: ${head.phone}`);
    }
  }

  console.log('\nDone. All 11 heads seeded successfully.');
  console.log('\nNote: Placeholder phone numbers used (9900000001–9900000011).');
  console.log('Each user should update their phone and add their email from Settings.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
