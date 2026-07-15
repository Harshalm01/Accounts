import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// All-in-one comprehensive seed endpoint
router.all('/seed-all', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('\n🌱 Starting comprehensive database seed...\n');

    // ─── USERS (50 total) ───────────────────────────────────────────────────────
    const seedUsers = [
      // ADMINS (6)
      { name: 'Varun Ramamchandran', password: 'VarunR@3fm26', designation: 'Lead - Corporate Partnerships & Growth', role: 'ADMIN' },
      { name: 'Ishika Dhakan', password: 'IshikaD@3fm26', designation: 'Head - People & Culture', role: 'ADMIN' },
      { name: 'Deep Shah', password: 'DeepS@3fm26', designation: 'Founder', role: 'ADMIN' },
      { name: 'Rahil Shah', password: 'RahilS@3fm26', designation: 'Founder', role: 'ADMIN' },
      { name: 'Shubh Shah', password: 'ShubhS@3fm26', designation: 'Founder', role: 'ADMIN' },
      { name: 'Harsh Shah', password: 'HarshS@3fm26', designation: 'Founder', role: 'ADMIN' },
      // AGENCY HEADS (10)
      { name: 'Abhishek Dulani', password: 'AhbishekD@3fm26', designation: 'Account Director', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Priya Vasani', password: 'PriyaV@3fm26', designation: 'Account Director', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Jhalak Tated', password: 'JhalakT@3fm26', designation: 'Account Director', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Bhumisha Rajgar', password: 'BhumishaR@3fm26', designation: 'Visual Head', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Riti Tated', password: 'RitiT@3fm26', designation: 'Account Director', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Shweta Shinde', password: 'ShwetaS@3fm26', designation: 'Accountant', role: 'AGENCY', canAccessAccounts: true, canApprovePayments: true },
      { name: 'Moiz Shaikh', password: 'MoizS@3fm26', designation: 'Sr Account Manager', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Hem Joshi', password: 'HemJ@3fm26', designation: 'Sr Account Manager', role: 'AGENCY', canAccessAccounts: true },
      { name: 'Deepak Lokhande', password: 'DeepakL@3fm26', designation: 'Jr. Accountant', role: 'AGENCY', canAccessAccounts: true, canApprovePayments: true },
      { name: 'Sanjana Mehta', password: 'SanjanaM@3fm26', designation: 'Jr. Talent Manager', role: 'AGENCY', canAccessAccounts: true },
      // EMPLOYEES (34)
      { name: 'Siddhi Gala', password: 'SiddhiG@3fm26', designation: 'Jr. Account Manager', role: 'EMPLOYEE' },
      { name: 'Navya Jain', password: 'NavyaJ@3fm26', designation: 'Account Executive - Visuals', role: 'EMPLOYEE' },
      { name: 'Chintan Solanki', password: 'ChintanS@3fm26', designation: 'Video Editor', role: 'EMPLOYEE' },
      { name: 'Vrushti Jain', password: 'VrushtiJ@3fm26', designation: 'Social Media Strategist', role: 'EMPLOYEE' },
      { name: 'Khushee Bagtharia', password: 'KhusheeB@3fm26', designation: 'Account Executive - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Nirav Pipalia', password: 'NiravP@3fm26', designation: 'Account Executive - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Priyal Gada', password: 'PriyalG@3fm26', designation: 'Sr Account Manager', role: 'EMPLOYEE' },
      { name: 'Sakshi Pumniya', password: 'SakshiP@3fm26', designation: 'Jr. Talent Manager', role: 'EMPLOYEE' },
      { name: 'Kinjal Makwana', password: 'KinjalM@3fm26', designation: 'Graphic Designer', role: 'EMPLOYEE' },
      { name: 'Pahal Jain', password: 'PahalJ@3fm26', designation: 'Jr.Graphic Designer', role: 'EMPLOYEE' },
      { name: 'Disha Jain', password: 'DishaJ@3fm26', designation: 'Sr. Account Manager', role: 'EMPLOYEE' },
      { name: 'Kabir Singh', password: 'KabirS@3fm26', designation: 'Videographer & Editor', role: 'EMPLOYEE' },
      { name: 'Nidhi Parsekar', password: 'NidhiP@3fm26', designation: 'Account Executive', role: 'EMPLOYEE' },
      { name: 'Yash Kinger', password: 'YashK@3fm26', designation: 'Videographer', role: 'EMPLOYEE' },
      { name: 'Riddhi Oza', password: 'RiddhiO@3fm26', designation: 'Content Writer', role: 'EMPLOYEE' },
      { name: 'Om Sawant', password: 'OmS@3fm26', designation: 'Account Trainee', role: 'EMPLOYEE' },
      { name: 'Krishna Talati', password: 'KrishnaT@3fm26', designation: 'Talent Manager', role: 'EMPLOYEE' },
      { name: 'Aastha Dave', password: 'AasthaD@3fm26', designation: 'Account Executive', role: 'EMPLOYEE' },
      { name: 'Tauqir Khan', password: 'TauqirK@3fm26', designation: 'Meme Editor', role: 'EMPLOYEE' },
      { name: 'Parmi Nanda', password: 'ParmiN@3fm26', designation: 'Sr Account Manager', role: 'EMPLOYEE' },
      { name: 'Aakriti Tiwari', password: 'AakritiT@3fm26', designation: 'Brand Solutions Manager', role: 'EMPLOYEE' },
      { name: 'Akshit Mandani', password: 'AkshitM@3fm26', designation: 'Account Executive', role: 'EMPLOYEE' },
      { name: 'Nathan Prajapati', password: 'NathanP@3fm26', designation: 'Jr Account Manager', role: 'EMPLOYEE' },
      { name: 'Palak Gohil', password: 'PalakG@3fm26', designation: 'Account Executive', role: 'EMPLOYEE' },
      { name: 'Shreya Nakarja', password: 'ShreyaN@3fm26', designation: 'Talent Manager', role: 'EMPLOYEE' },
      { name: 'Priyal Thaker', password: 'PriyalT@3fm26', designation: 'Manager - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Kartik Parekh', password: 'KartikP@3fm26', designation: 'Executive - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Khushi Sanghavi', password: 'KhushiS@3fm26', designation: 'Trainee - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Vruti Prajapati', password: 'VrutiP@3fm26', designation: 'Manager - Social Media', role: 'EMPLOYEE' },
      { name: 'Navneet Dehad', password: 'NavneetD@3fm26', designation: 'Executive - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Krisha Modi', password: 'KrishaM@3fm26', designation: 'Intern - Visual', role: 'EMPLOYEE' },
      { name: 'Dhruven Gosia', password: 'DhruvenG@3fm26', designation: 'Intern - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Harshal Mehta', password: 'HarshalM@3fm26', designation: 'Intern - Influencer Marketing', role: 'EMPLOYEE' },
      { name: 'Ayush Shah', password: 'AyushS@3fm26', designation: 'Sr Account Manager', role: 'EMPLOYEE' },
    ];

    let userStats = { created: 0, updated: 0 };

    for (const u of seedUsers) {
      const existing = await prisma.user.findFirst({
        where: { name: { equals: u.name, mode: 'insensitive' } },
      });

      const hashed = await bcrypt.hash(u.password, 10);

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            password: hashed,
            designation: u.designation,
            role: u.role,
            canAccessAccounts: (u as any).canAccessAccounts ?? false,
            canApprovePayments: (u as any).canApprovePayments ?? false,
          },
        });
        userStats.updated++;
      } else {
        await prisma.user.create({
          data: {
            name: u.name,
            password: hashed,
            designation: u.designation,
            role: u.role,
            email: null,
            phone: null,
            canAccessAccounts: (u as any).canAccessAccounts ?? false,
            canApprovePayments: (u as any).canApprovePayments ?? false,
          },
        });
        userStats.created++;
      }
    }

    console.log(`✅ Users: ${userStats.created} created, ${userStats.updated} updated\n`);

    // ─── SAMPLE INFLUENCERS ─────────────────────────────────────────────────────
    const sampleInfluencers = [
      { firstName: 'Aditya', lastName: 'Sharma', followers: 250000, followersUnit: 'K' as const, city: 'Mumbai', state: 'Maharashtra', primaryGenre: 'Fashion', gender: 'Male' },
      { firstName: 'Priya', lastName: 'Patel', followers: 180000, followersUnit: 'K' as const, city: 'Delhi', state: 'Delhi', primaryGenre: 'Beauty', gender: 'Female' },
      { firstName: 'Rahul', lastName: 'Verma', followers: 320000, followersUnit: 'K' as const, city: 'Bangalore', state: 'Karnataka', primaryGenre: 'Fitness', gender: 'Male' },
      { firstName: 'Ananya', lastName: 'Singh', followers: 450000, followersUnit: 'K' as const, city: 'Pune', state: 'Maharashtra', primaryGenre: 'Lifestyle', gender: 'Female' },
      { firstName: 'Vikram', lastName: 'Kapoor', followers: 150000, followersUnit: 'K' as const, city: 'Hyderabad', state: 'Telangana', primaryGenre: 'Tech', gender: 'Male' },
    ];

    let influencerStats = { created: 0, skipped: 0 };

    for (const inf of sampleInfluencers) {
      const existing = await prisma.influencer.findFirst({
        where: { firstName: inf.firstName, lastName: inf.lastName },
      });

      if (!existing) {
        await prisma.influencer.create({
          data: {
            ...inf,
            igLink: `https://instagram.com/${inf.firstName.toLowerCase()}${inf.lastName.toLowerCase()}`,
            contact: { contactType: 'Email', contactValue: `${inf.firstName}@example.com` },
            commercials: [],
          },
        });
        influencerStats.created++;
      } else {
        influencerStats.skipped++;
      }
    }

    console.log(`✅ Influencers: ${influencerStats.created} created, ${influencerStats.skipped} skipped\n`);

    res.json({
      message: '✅ COMPLETE DATABASE SEED SUCCESSFUL!',
      timestamp: new Date().toISOString(),
      summary: {
        users: {
          total: seedUsers.length,
          created: userStats.created,
          updated: userStats.updated,
          admins: 6,
          agency_heads: 10,
          employees: 34,
        },
        influencers: {
          total: sampleInfluencers.length,
          created: influencerStats.created,
          skipped: influencerStats.skipped,
        },
      },
      status: '🎉 Your database is fully populated and ready to use!',
      login_credentials_sample: [
        { name: 'Deep Shah', password: 'DeepS@3fm26', role: 'ADMIN' },
        { name: 'Varun Ramamchandran', password: 'VarunR@3fm26', role: 'AGENCY' },
        { name: 'Harshal Mehta', password: 'HarshalM@3fm26', role: 'EMPLOYEE' },
      ],
    });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Failed to seed database', details: String(err) });
  }
});

export default router;
