import { useState, useEffect } from 'react';
import { soundManager } from '../utils/notificationSounds';

interface VictoryFanfareProps {
  isVisible: boolean;
  onComplete?: () => void;
  message?: string;
  type?: 'campaign' | 'assignment' | 'invoice' | 'milestone';
}

const FANFARE_MESSAGES = {
  campaign: {
    title: 'Campaign Complete! 🎉',
    subtitle: 'Amazing work! Your campaign has been successfully completed.',
    emoji: '🏆',
  },
  assignment: {
    title: 'Assignment Completed! ✨',
    subtitle: 'Great job! This assignment is now done.',
    emoji: '⭐',
  },
  invoice: {
    title: 'Invoice Approved! 💰',
    subtitle: 'Your invoice has been successfully approved and processed.',
    emoji: '💎',
  },
  milestone: {
    title: 'Milestone Reached! 🚀',
    subtitle: 'You\'ve achieved something incredible!',
    emoji: '🌟',
  },
};

export default function VictoryFanfare({
  isVisible,
  onComplete,
  message,
  type = 'campaign',
}: VictoryFanfareProps) {
  const [showContent, setShowContent] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; emoji: string; x: number; y: number }>>([]);

  const fanfareConfig = FANFARE_MESSAGES[type];

  // Generate celebration particles
  const generateParticles = () => {
    const emojis = ['🎉', '🎊', '✨', '🌟', '💫', '🎆', '🎇'];
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
    }));
    setParticles(newParticles);
  };

  useEffect(() => {
    if (isVisible) {
      // Play fanfare sound
      soundManager.playSuccessSound({ volume: 0.7 });

      // Show content after brief delay
      setTimeout(() => setShowContent(true), 100);

      // Generate particles
      generateParticles();

      // Auto-complete after 2 seconds
      const timer = setTimeout(() => {
        setShowContent(false);
        setTimeout(() => onComplete?.(), 300);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Background overlay with fade animation */}
      <div
        className={`absolute inset-0 pointer-events-auto transition-opacity duration-300 ${
          showContent ? 'opacity-40 bg-black/20' : 'opacity-0'
        }`}
      />

      {/* Celebration particles */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute text-3xl animate-bounce"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            animation: `celebrationFloat 3s ease-out forwards`,
            animationDelay: `${particle.id * 0.1}s`,
          }}
        >
          {particle.emoji}
        </div>
      ))}

      {/* Main celebration content */}
      <div
        className={`relative flex flex-col items-center gap-4 pointer-events-auto transition-all duration-300 transform ${
          showContent
            ? 'scale-100 opacity-100'
            : 'scale-75 opacity-0'
        }`}
      >
        {/* Large emoji */}
        <div className="text-8xl animate-bounce" style={{ animationDuration: '0.6s' }}>
          {fanfareConfig.emoji}
        </div>

        {/* Title */}
        <h2 className="text-4xl font-bold text-white text-center drop-shadow-lg max-w-2xl animate-pulse">
          {message || fanfareConfig.title}
        </h2>

        {/* Subtitle */}
        <p className="text-lg text-white text-center drop-shadow-md max-w-2xl">
          {fanfareConfig.subtitle}
        </p>

        {/* Decorative line */}
        <div className="w-32 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full mt-4 animate-pulse" />
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes celebrationFloat {
          0% {
            transform: translateY(0) translateX(0) scale(1);
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) translateX(${Math.random() * 200 - 100}px) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
