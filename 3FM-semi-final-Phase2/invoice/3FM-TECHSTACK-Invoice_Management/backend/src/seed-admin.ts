import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating admin user: Dhruven\n');

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: 'work.dhruven@gmail.com' }
    });

    if (existing) {
      console.log('User already exists. Updating...');
      
      const hashed = await bcrypt.hash('djg@Gmail1l', 10);
      const updated = await prisma.user.update({
        where: { email: 'work.dhruven@gmail.com' },
        data: {
          name: 'Dhruven',
          phone: '7021011791',
          password: hashed,
          role: 'ADMIN',
        },
      });
      
      console.log('✅ User updated successfully!');
      console.log(`   Email: ${updated.email}`);
      console.log(`   Phone: ${updated.phone}`);
      console.log(`   Role: ${updated.role}`);
    } else {
      const hashed = await bcrypt.hash('djg@Gmail1l', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Dhruven',
          email: 'work.dhruven@gmail.com',
          phone: '7021011791',
          password: hashed,
          role: 'ADMIN',
        },
      });

      console.log('✅ Admin user created successfully!');
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phone}`);
      console.log(`   Role: ${user.role}`);
      console.log(`\n📝 Login credentials:`);
      console.log(`   Email: work.dhruven@gmail.com`);
      console.log(`   Password: djg@Gmail1l`);
    }

  } catch (error) {
    console.error('❌ Error creating user:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
