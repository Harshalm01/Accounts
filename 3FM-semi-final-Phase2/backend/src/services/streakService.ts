import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function updateUserStreak(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActiveDate: true, currentStreak: true, longestStreak: true },
  });

  if (!user) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
  lastActive?.setHours(0, 0, 0, 0);

  // Check if user has already been active today
  if (lastActive && lastActive.getTime() === today.getTime()) {
    return; // Already updated today
  }

  // Check if user was active yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isStreakContinuing = lastActive && lastActive.getTime() === yesterday.getTime();

  const newStreak = isStreakContinuing ? (user.currentStreak ?? 0) + 1 : 1;
  const newLongestStreak = Math.max(newStreak, user.longestStreak ?? 0);

  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      lastActiveDate: new Date(),
    },
  });
}

// Call this on first login of the day
export async function getUserStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true },
  });

  return {
    current: user?.currentStreak ?? 0,
    longest: user?.longestStreak ?? 0,
  };
}
