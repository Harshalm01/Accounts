import { useEffect, useState } from 'react';

/**
 * Easter Eggs System
 * Triggered by specific key combinations and actions
 * Adds fun, hidden animations to delight users
 */

interface EasterEgg {
  name: string;
  trigger: string;
  message: string;
  emoji: string;
  color: string;
}

const EASTER_EGGS: EasterEgg[] = [
  {
    name: '3FM Spin',
    trigger: 'spin',
    message: 'You unlocked the spin easter egg! 🎲',
    emoji: '🎪',
    color: 'from-yellow-500 to-orange-600',
  },
];

interface EasterEggNotificationProps {
  isVisible: boolean;
  message: string;
  emoji: string;
  color: string;
  onComplete?: () => void;
}

function EasterEggNotification({
  isVisible,
  message,
  emoji,
  color,
  onComplete,
}: EasterEggNotificationProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className={`fixed bottom-6 left-6 z-[5000] animate-bounce`}>
      <div
        className={`bg-gradient-to-r ${color} rounded-xl px-6 py-4 text-white shadow-2xl
          transform transition-all duration-300 hover:scale-110 cursor-pointer`}
      >
        <p className="text-2xl font-bold mb-1">{emoji}</p>
        <p className="font-semibold">{message}</p>
      </div>
    </div>
  );
}

interface EasterEggsProps {
  onEasterEggFound?: (eggName: string) => void;
}

export default function EasterEggs({ onEasterEggFound }: EasterEggsProps) {
  const [foundEggs, setFoundEggs] = useState<Set<string>>(new Set());
  const [showNotification, setShowNotification] = useState(false);
  const [currentEgg, setCurrentEgg] = useState<EasterEgg | null>(null);

  const triggerEasterEgg = (eggName: string) => {
    const egg = EASTER_EGGS.find((e) => e.name === eggName);
    if (egg && !foundEggs.has(eggName)) {
      setFoundEggs((prev) => new Set([...prev, eggName]));
      setCurrentEgg(egg);
      setShowNotification(true);
      onEasterEggFound?.(eggName);
    }
  };

  const triggerConfetti = () => {
    const randomColor = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.innerHTML = '🎉';
      confetti.style.position = 'fixed';
      confetti.style.left = Math.random() * window.innerWidth + 'px';
      confetti.style.top = '-10px';
      confetti.style.fontSize = '2em';
      confetti.style.pointerEvents = 'none';
      confetti.style.zIndex = '5000';
      confetti.style.animation = `fall ${2 + Math.random() * 2}s linear forwards`;
      document.body.appendChild(confetti);

      setTimeout(() => confetti.remove(), 4000);
    }
  };

  useEffect(() => {
    // Add CSS animation for confetti
    if (!document.getElementById('easterEggStyles')) {
      const style = document.createElement('style');
      style.id = 'easterEggStyles';
      style.innerHTML = `
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
        @keyframes matrixRain {
          0% { opacity: 1; transform: translateY(-100%); }
          100% { opacity: 0; transform: translateY(100vh); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <>
      {currentEgg && (
        <EasterEggNotification
          isVisible={showNotification}
          message={currentEgg.message}
          emoji={currentEgg.emoji}
          color={currentEgg.color}
          onComplete={() => setShowNotification(false)}
        />
      )}

      {/* Easter Eggs Info (optional - hidden by default) */}
      <div className="hidden">
        <div id="easter-eggs-found" data-count={foundEggs.size}>
          {Array.from(foundEggs).join(',')}
        </div>
      </div>
    </>
  );
}

// Export utilities for use in other components
export function triggerEasterEggEvent(eggName: string) {
  const event = new CustomEvent('easterEgg', { detail: { name: eggName } });
  window.dispatchEvent(event);
}

export const EASTER_EGG_TRIGGERS = {
  SPIN: '3FM Spin',
} as const;
