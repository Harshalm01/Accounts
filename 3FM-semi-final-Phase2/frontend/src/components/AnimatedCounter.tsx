import React, { useEffect, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  className?: string;
  duration?: number; // animation duration in ms
}

export default function AnimatedCounter({
  value,
  className = '',
  duration = 300,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (displayValue !== value) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setDisplayValue(value);
        setIsAnimating(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [value, displayValue, duration]);

  return (
    <span
      className={`
        inline-block
        transition-all
        ${isAnimating ? 'animate-pulse scale-110' : 'scale-100'}
        ${className}
      `}
      style={{
        transitionDuration: `${duration}ms`,
      }}
    >
      {displayValue > 9 ? '9+' : displayValue}
    </span>
  );
}
