import React, { useState, useEffect } from 'react';
import { fireCelebration } from '../utils/confetti';

interface StreakCounterProps {
  currentStreak: number;
  longestStreak: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

function getStreakColor(streak: number): string {
  if (streak === 0) return 'text-gray-400';
  if (streak <= 2) return 'text-orange-400';
  if (streak <= 6) return 'text-orange-500';
  if (streak <= 13) return 'text-red-500';
  return 'text-purple-600';
}

function getStreakEmoji(streak: number): string {
  if (streak === 0) return '🌙';
  if (streak <= 2) return '🔥';
  if (streak <= 6) return '🔥🔥';
  if (streak <= 13) return '🔥🔥🔥';
  return '👑';
}

export default function StreakCounter({
  currentStreak,
  longestStreak,
  size = 'md',
  showLabel = true,
  className = '',
}: StreakCounterProps) {
  const [displayStreak, setDisplayStreak] = useState(currentStreak);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (displayStreak !== currentStreak) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setDisplayStreak(currentStreak);
        setIsAnimating(false);
      }, 300);

      // Trigger confetti on milestone streaks (7, 14, 30 days)
      if (currentStreak === 7 || currentStreak === 14 || currentStreak === 30) {
        setTimeout(() => {
          fireCelebration('milestone'); // GOLD BURST CONFETTI
        }, 500);
      }

      return () => clearTimeout(timer);
    }
  }, [currentStreak, displayStreak]);

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  if (currentStreak === 0 && longestStreak === 0) {
    return null; // Don't show if no streaks
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Current Streak */}
      <div className={`flex items-center gap-1 ${sizeClasses[size]} font-semibold ${getStreakColor(currentStreak)}`}>
        <span className="text-lg animate-pulse">{getStreakEmoji(currentStreak)}</span>
        <span
          className={`transition-all ${isAnimating ? 'scale-110' : 'scale-100'}`}
          style={{ transitionDuration: '300ms' }}
        >
          {displayStreak}
        </span>
        {showLabel && <span className="text-xs opacity-75 ml-1">days</span>}
      </div>

      {/* Longest Streak (if different) */}
      {longestStreak > currentStreak && (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span>Best: </span>
          <span className="font-semibold text-purple-500">{longestStreak} days</span>
        </div>
      )}
    </div>
  );
}
