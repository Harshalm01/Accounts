import confetti from 'canvas-confetti';

export function fireCelebration(type: 'campaign-complete' | 'invoice-approved' | 'assignment-accepted' | 'milestone' | 'achievement') {
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  switch (type) {
    case 'campaign-complete':
      confetti({ ...defaults, particleCount: 100, origin: { x: 0.3, y: 0.5 } });
      setTimeout(() => confetti({ ...defaults, particleCount: 100, origin: { x: 0.7, y: 0.5 } }), 250);
      setTimeout(() => confetti({ ...defaults, particleCount: 150, origin: { x: 0.5, y: 0.3 } }), 500);
      break;
    case 'invoice-approved':
      confetti({ ...defaults, particleCount: 80, origin: { x: 0.5, y: 0.6 }, colors: ['#22c55e', '#16a34a', '#86efac'] });
      break;
    case 'assignment-accepted':
      confetti({ ...defaults, particleCount: 50, origin: { x: 0.5, y: 0.7 }, colors: ['#6366f1', '#818cf8', '#a5b4fc'] });
      break;
    case 'milestone':
      // Streak milestone celebration - bigger burst
      confetti({ ...defaults, particleCount: 120, origin: { x: 0.5, y: 0.5 }, colors: ['#fbbf24', '#f59e0b', '#d97706', '#92400e'] });
      setTimeout(() => confetti({ ...defaults, particleCount: 80, origin: { x: 0.2, y: 0.3 } }), 150);
      setTimeout(() => confetti({ ...defaults, particleCount: 80, origin: { x: 0.8, y: 0.3 } }), 300);
      break;
    case 'achievement':
      // Achievement unlocked - rainbow burst
      confetti({ ...defaults, particleCount: 100, origin: { x: 0.5, y: 0.5 }, colors: ['#ec4899', '#f43f5e', '#fb7185', '#fbbf24', '#facc15', '#22c55e', '#06b6d4', '#06b6d4', '#8b5cf6'] });
      setTimeout(() => confetti({ ...defaults, particleCount: 50, spread: 180, origin: { x: 0.5, y: 0.7 } }), 200);
      break;
  }
}

