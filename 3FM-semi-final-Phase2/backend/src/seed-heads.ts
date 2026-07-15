import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface SeedUser {
  name: string;
  password: string;
  designation: string;
  role: 'ADMIN' | 'AGENCY' | 'EMPLOYEE';
  canAccessAccounts?: boolean;
  canApprovePayments?: boolean;
}

// ── ADMINS (6) ──────────────────────────────────────────────────────────────────
const admins: SeedUser[] = [
  { name: 'Varun Ramamchandran', password: 'VarunR@3fm26',  designation: 'Lead - Corporate Partnerships & Growth', role: 'ADMIN' },
  { name: 'Ishika Dhakan',      password: 'IshikaD@3fm26', designation: 'Head - People & Culture',                 role: 'ADMIN' },
  { name: 'Deep Shah',          password: 'DeepS@3fm26',   designation: 'Founder',                                 role: 'ADMIN' },
  { name: 'Rahil Shah',         password: 'RahilS@3fm26',  designation: 'Founder',                                 role: 'ADMIN' },
  { name: 'Shubh Shah',         password: 'ShubhS@3fm26',  designation: 'Founder',                                 role: 'ADMIN' },
  { name: 'Harsh Shah',         password: 'HarshS@3fm26',  designation: 'Founder',                                 role: 'ADMIN' },
];

// ── HEADS / AGENCY (10) ─────────────────────────────────────────────────────────
const heads: SeedUser[] = [
  { name: 'Abhishek Dulani', password: 'AhbishekD@3fm26', designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
  { name: 'Priya Vasani',    password: 'PriyaV@3fm26',    designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
  { name: 'Jhalak Tated',    password: 'JhalakT@3fm26',   designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
  { name: 'Bhumisha Rajgar', password: 'BhumishaR@3fm26', designation: 'Visual Head',         role: 'AGENCY', canAccessAccounts: true },
  { name: 'Riti Tated',      password: 'RitiT@3fm26',     designation: 'Account Director',    role: 'AGENCY', canAccessAccounts: true },
  { name: 'Shweta Shinde',   password: 'ShwetaS@3fm26',   designation: 'Accountant',          role: 'AGENCY', canAccessAccounts: true, canApprovePayments: true },
  { name: 'Moiz Shaikh',     password: 'MoizS@3fm26',     designation: 'Sr Account Manager',  role: 'AGENCY', canAccessAccounts: true },
  { name: 'Hem Joshi',       password: 'HemJ@3fm26',      designation: 'Sr Account Manager',  role: 'AGENCY', canAccessAccounts: true },
  { name: 'Deepak Lokhande', password: 'DeepakL@3fm26',   designation: 'Jr. Accountant',      role: 'AGENCY', canAccessAccounts: true, canApprovePayments: true },
  { name: 'Sanjana Mehta',   password: 'SanjanaM@3fm26',  designation: 'Jr. Talent Manager',  role: 'AGENCY', canAccessAccounts: true },
];

// ── EMPLOYEES (34) ──────────────────────────────────────────────────────────────
const employees: SeedUser[] = [
  { name: 'Siddhi Gala',         password: 'SiddhiG@3fm26',   designation: 'Jr. Account Manager',                      role: 'EMPLOYEE' },
  { name: 'Navya Jain',          password: 'NavyaJ@3fm26',    designation: 'Account Executive - Visuals',              role: 'EMPLOYEE' },
  { name: 'Chintan Solanki',     password: 'ChintanS@3fm26',  designation: 'Video Editor',                             role: 'EMPLOYEE' },
  { name: 'Vrushti Jain',        password: 'VrushtiJ@3fm26',  designation: 'Social Media Strategist',                  role: 'EMPLOYEE' },
  { name: 'Khushee Bagtharia',   password: 'KhusheeB@3fm26',  designation: 'Account Executive - Influencer Marketing', role: 'EMPLOYEE' },
  { name: 'Nirav Pipalia',       password: 'NiravP@3fm26',    designation: 'Account Executive - Influencer Marketing', role: 'EMPLOYEE' },
  { name: 'Priyal Gada',         password: 'PriyalG@3fm26',   designation: 'Sr Account Manager',                       role: 'EMPLOYEE' },
  { name: 'Sakshi Pumniya',      password: 'SakshiP@3fm26',   designation: 'Jr. Talent Manager',                       role: 'EMPLOYEE' },
  { name: 'Kinjal Makwana',      password: 'KinjalM@3fm26',   designation: 'Graphic Designer',                         role: 'EMPLOYEE' },
  { name: 'Pahal Jain',          password: 'PahalJ@3fm26',    designation: 'Jr.Graphic Designer',                      role: 'EMPLOYEE' },
  { name: 'Disha Jain',          password: 'DishaJ@3fm26',    designation: 'Sr. Account Manager',                      role: 'EMPLOYEE' },
  { name: 'Kabir Singh',         password: 'KabirS@3fm26',    designation: 'Videographer & Editor',                    role: 'EMPLOYEE' },
  { name: 'Nidhi Parsekar',      password: 'NidhiP@3fm26',    designation: 'Account Exective',                         role: 'EMPLOYEE' },
  { name: 'Yash Kinger',         password: 'YashK@3fm26',     designation: 'Videographer',                             role: 'EMPLOYEE' },
  { name: 'Riddhi Oza',          password: 'RiddhiO@3fm26',   designation: 'Content Writer',                           role: 'EMPLOYEE' },
  { name: 'Om Sawant',           password: 'OmS@3fm26',       designation: 'Account Trainee',                          role: 'EMPLOYEE' },
  { name: 'Krishna Talati',      password: 'KrishnaT@3fm26',  designation: 'Talent Manager',                           role: 'EMPLOYEE' },
  { name: 'Aastha Dave',         password: 'AasthaD@3fm26',   designation: 'Account Executive',                        role: 'EMPLOYEE' },
  { name: 'Tauqir Khan',         password: 'TauqirK@3fm26',   designation: 'Meme Editor',                              role: 'EMPLOYEE' },
  { name: 'Parmi Nanda',         password: 'ParmiN@3fm26',    designation: 'Sr Account Manager',                       role: 'EMPLOYEE' },
  { name: 'Aakriti Tiwari',      password: 'AakritiT@3fm26',  designation: 'Brand Solutions Manager',                  role: 'EMPLOYEE' },
  { name: 'Akshit Mandani',      password: 'AkshitM@3fm26',   designation: 'Account Exective',                         role: 'EMPLOYEE' },
  { name: 'Nathan Prajapati',    password: 'NathanP@3fm26',   designation: 'Jr Account Manager',                       role: 'EMPLOYEE' },
  { name: 'Palak Gohil',         password: 'PalakG@3fm26',    designation: 'Account Executive',                        role: 'EMPLOYEE' },
  { name: 'Shreya Nakarja',      password: 'ShreyaN@3fm26',   designation: 'Talent Manager',                           role: 'EMPLOYEE' },
  { name: 'Priyal Thaker',       password: 'PriyalT@3fm26',   designation: 'Manager - Influencer Marketing',           role: 'EMPLOYEE' },
  { name: 'Kartik Parekh',       password: 'KartikP@3fm26',   designation: 'Executive - Influencer Marketing',         role: 'EMPLOYEE' },
  { name: 'Khushi Sanghavi',     password: 'KhushiS@3fm26',   designation: 'Trainee - Influencer Marketing',           role: 'EMPLOYEE' },
  { name: 'Vruti Prajapati',     password: 'VrutiP@3fm26',    designation: 'Manager - Social Media',                   role: 'EMPLOYEE' },
  { name: 'Navneet Dehad',       password: 'NavneetD@3fm26',  designation: 'Executive - Influencer Marketing',         role: 'EMPLOYEE' },
  { name: 'Krisha Modi',         password: 'KrishaM@3fm26',   designation: 'Intern - Visual',                          role: 'EMPLOYEE' },
  { name: 'Dhruven Gosia',       password: 'DhruvenG@3fm26',  designation: 'Intern - Influencer Marketing',            role: 'EMPLOYEE' },
  { name: 'Harshal Mehta',       password: 'HarshalM@3fm26',  designation: 'Intern - Influencer Marketing',            role: 'EMPLOYEE' },
  { name: 'Ayush Shah',          password: 'AyushS@3fm26',    designation: 'Sr Account Manager',                       role: 'EMPLOYEE' },
];

// ── Combine all ─────────────────────────────────────────────────────────────────
const allUsers = [...admins, ...heads, ...employees];

async function main() {
  console.log(`\nSeeding ${allUsers.length} users (${admins.length} admins, ${heads.length} heads, ${employees.length} employees)...\n`);

  let created = 0;
  let updated = 0;

  for (const u of allUsers) {
    // Find existing user by name (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: { name: { equals: u.name, mode: 'insensitive' } },
    });

    const hashed = await bcrypt.hash(u.password, 10);

    if (existing) {
      // Update: fix name, designation, role, password, and flags
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: u.name,
          designation: u.designation,
          role: u.role,
          password: hashed,
          canAccessAccounts: u.canAccessAccounts ?? false,
          canApprovePayments: u.canApprovePayments ?? false,
        },
      });
      console.log(`  Updated: ${u.name} [${u.role}] — ${u.designation}`);
      updated++;
    } else {
      // Create new user
      await prisma.user.create({
        data: {
          name: u.name,
          password: hashed,
          designation: u.designation,
          role: u.role,
          email: null,
          phone: null,
          canAccessAccounts: u.canAccessAccounts ?? false,
          canApprovePayments: u.canApprovePayments ?? false,
        },
      });
      console.log(`  Created: ${u.name} [${u.role}] — ${u.designation}`);
      created++;
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`);
  console.log(`Total: ${admins.length} ADMIN, ${heads.length} AGENCY, ${employees.length} EMPLOYEE`);
  console.log('\nAll users can log in with their name and password (e.g. "Deep Shah" / "DeepS@3fm26").\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
